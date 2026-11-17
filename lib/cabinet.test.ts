import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCabinetItem, updateCabinetItem, archiveCabinetItem, recordIn, recordCount, getCabinetClinic, loadCabinet, validateCabinetTargetsForLedger } from "./cabinet";
import { saveEntry, type SaveEntryInput } from "./ledger";
import type { CabinetItem } from "./types";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("./supabaseClient", () => ({ getSupabase: () => mocks }));
const insured: CabinetItem = { id: 5, name: "보험약", kind: "insured", clinic: "S", unit: "포", active: true, min_stock: 0, sort_order: 1, created_at: "2026-11-17T00:00:00Z" };
function rows(items: CabinetItem[]) {
  const result = Promise.resolve({ data: items, error: null });
  const builder = { select: vi.fn(), order: vi.fn(), then: result.then.bind(result) };
  builder.select.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  mocks.from.mockReturnValue(builder);
}
beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.from.mockReset();
  mocks.rpc.mockResolvedValue({ data: "S", error: null });
  rows([insured]);
});

describe("재고 병원 확인은 S 기본값으로 돌아가지 않는다", () => {
  it.each(["S", "N"] as const)("실제 %s 매핑만 사용한다", async (clinic) => {
    mocks.rpc.mockResolvedValue({ data: clinic, error: null });
    await expect(getCabinetClinic()).resolves.toBe(clinic);
  });
  it.each([null, "X", undefined])("매핑 %s는 재고를 읽기 전에 거절한다", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(loadCabinet()).rejects.toThrow("병원을 확인하지 못했습니다");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("N 계정 확인 중 RPC 오류가 나도 S로 표시하거나 조회하지 않는다", async () => {
    mocks.rpc.mockResolvedValue({ data: "N", error: { message: "offline" } });
    await expect(loadCabinet()).rejects.toThrow("병원을 확인하지 못했습니다");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("병원 확인 요청 자체가 실패해도 조회를 시작하지 않는다", async () => {
    mocks.rpc.mockRejectedValue(new TypeError("offline"));
    await expect(loadCabinet()).rejects.toThrow("offline");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("장부 재고 연결 사전 검증", () => {
  it("같은 병원 보험약의 엑스제 연결은 허용한다", async () => {
    await expect(validateCabinetTargetsForLedger([{ group: "extract", cabinet_item_id: 5 }])).resolves.toBeUndefined();
  });
  it("일반 약장 묶음으로 보험약을 빼려는 경우 환자·장부·입출고 쓰기 전에 거절한다", async () => {
    const input = { patient_name: "fixture", patient_id: null, items: [{ group: "cabinet", cabinet_item_id: 5, unknown: false }] } as SaveEntryInput;
    await expect(saveEntry(input)).rejects.toThrow("병원·구분이 맞지 않습니다");
    expect(mocks.from.mock.calls.map((call) => call[0])).toEqual(["cabinet_items"]);
  });
  it("다른 병원 품목 ID도 쓰기 전에 거절한다", async () => {
    const input = { patient_name: "fixture", patient_id: null, items: [{ group: "extract", cabinet_item_id: 99, unknown: false }] } as SaveEntryInput;
    await expect(saveEntry(input)).rejects.toThrow("병원·구분이 맞지 않습니다");
    expect(mocks.from.mock.calls.map((call) => call[0])).toEqual(["cabinet_items"]);
  });
  it("예전의 미연결 약어는 자동으로 연결하거나 차감하지 않는다", async () => {
    await expect(validateCabinetTargetsForLedger([{ group: "extract", cabinet_item_id: null }])).resolves.toBeUndefined();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("용품 및 단위 쓰기 전 검증", () => {
  const supply: CabinetItem = { ...insured, id: 8, kind: "supply", name: "핫팩", unit: "개" };
  function storage(item: CabinetItem, moves: { id: number }[]) {
    const insert = vi.fn().mockReturnThis();
    const update = vi.fn().mockReturnThis();
    mocks.from.mockImplementation((table: string) => {
      const result = Promise.resolve({ data: table === "cabinet_items" ? [item] : moves, error: null });
      const builder = { select: vi.fn(), order: vi.fn(), eq: vi.fn(), limit: vi.fn(), insert, update, single: vi.fn().mockResolvedValue({ data: { id: 100 }, error: null }), then: result.then.bind(result) };
      for (const key of ["select", "order", "eq", "limit"] as const) builder[key].mockReturnValue(builder);
      return builder;
    });
    return { insert, update };
  }
  it("미초기화 용품은 장부 저장의 환자 쓰기 이전에 거절한다", async () => {
    const writes = storage(supply, []);
    const input = { patient_name: "fixture", patient_id: null, items: [{ group: "cabinet", cabinet_item_id: 8, unknown: false }] } as SaveEntryInput;
    await expect(saveEntry(input)).rejects.toThrow("초기 수량 미등록");
    expect(writes.insert).not.toHaveBeenCalled();
    expect(mocks.from.mock.calls.map((c) => c[0])).toEqual(["cabinet_items", "cabinet_moves"]);
  });
  it("COUNT 존재 시 자기 병원 용품 연결을 허용한다", async () => {
    storage(supply, [{ id: 1 }]);
    await expect(validateCabinetTargetsForLedger([{ group: "cabinet", cabinet_item_id: 8 }])).resolves.toBeUndefined();
  });
  it("입고는 초기 COUNT 없으면 쓰지 않는다", async () => {
    const writes = storage(supply, []);
    await expect(recordIn({ item_id: 8, qty: 10, expiry: null, staff_name: "test" })).rejects.toThrow("초기 수량 미등록");
    expect(writes.insert).not.toHaveBeenCalled();
  });
  it("최초 COUNT 0도 명시적 저장으로 허용한다", async () => {
    const writes = storage(supply, []);
    await expect(recordCount({ item_id: 8, counted: 0, expected: 0, staff_name: "test" })).resolves.toEqual({ id: 100 });
    expect(writes.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: "count", qty: 0 }));
  });
  it("보관 품목은 단위·기록을 바꾸지 않는다", async () => {
    const writes = storage({ ...supply, clinic: null, legacy_shared: true }, [{ id: 1 }]);
    await expect(updateCabinetItem(8, { unit: "박스" })).rejects.toThrow("보관");
    await expect(recordIn({ item_id: 8, qty: 1, expiry: null, staff_name: "test" })).rejects.toThrow("보관");
    expect(writes.insert).not.toHaveBeenCalled(); expect(writes.update).not.toHaveBeenCalled();
  });
  it("이력이 있는 단위 변경은 update 전에 거절한다", async () => {
    const writes = storage(supply, [{ id: 1 }]);
    await expect(updateCabinetItem(8, { unit: "박스" })).rejects.toThrow("새 품목");
    expect(writes.update).not.toHaveBeenCalled();
  });
  it("공백·긴 단위는 네트워크 읽기나 쓰기 전에 거절한다", async () => {
    const { id: _id, created_at: _created, ...input } = supply;
    await expect(createCabinetItem({ ...input, unit: " " })).rejects.toThrow("1~20자");
    await expect(updateCabinetItem(8, { unit: "a".repeat(21) })).rejects.toThrow("1~20자");
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("신규 용품 병원 매핑 실패는 추가를 닫는다", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const { id: _id, created_at: _created, ...input } = supply;
    await expect(createCabinetItem(input)).rejects.toThrow("병원을 확인하지 못했습니다");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});


describe("약침 단위 선택과 기록 보존형 삭제", () => {
  const yakchim: CabinetItem = { ...insured, id: 15, name: "약침 fixture", kind: "yakchim", clinic: null, unit: "병" };
  function store(item: CabinetItem, moves: { id: number }[] = []) {
    const update = vi.fn().mockReturnThis();
    mocks.from.mockImplementation((table: string) => {
      const result = Promise.resolve({ data: table === "cabinet_items" ? [item] : moves, error: null });
      const builder = { select: vi.fn(), order: vi.fn(), eq: vi.fn(), limit: vi.fn(), update, single: vi.fn().mockResolvedValue({ data: { ...item, active: false }, error: null }), then: result.then.bind(result) };
      for (const key of ["select", "order", "eq", "limit"] as const) builder[key].mockReturnValue(builder);
      return builder;
    });
    return update;
  }
  it.each(["개", "병"])("새 약침은 %s 단위로 등록할 수 있다", async (unit) => {
    const insert = vi.fn().mockReturnThis();
    mocks.from.mockReturnValue({ insert, select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { ...yakchim, unit }, error: null }) });
    await expect(createCabinetItem({ name: yakchim.name, kind: "yakchim", clinic: null, unit, min_stock: 0, active: true, sort_order: 41 })).resolves.toMatchObject({ unit });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ kind: "yakchim", clinic: null, unit }));
  });
  it("개·병 이외의 새 약침 단위는 읽기·쓰기 전에 거절한다", async () => {
    await expect(createCabinetItem({ name: yakchim.name, kind: "yakchim", unit: "박스", min_stock: 0, active: true, sort_order: 41, clinic: null })).rejects.toThrow("개 또는 병");
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("기록 없는 약침은 개로 바꾸되 재고를 환산하거나 쓰지 않는다", async () => {
    const update = store(yakchim); await updateCabinetItem(15, { unit: "개" });
    expect(update).toHaveBeenCalledWith({ unit: "개" });
    expect(mocks.from.mock.calls.map((call) => call[0])).toEqual(["cabinet_items", "cabinet_moves", "cabinet_items"]);
  });
  it("기존 약침도 잘못된 단위 저장을 막는다", async () => {
    const update = store(yakchim); await expect(updateCabinetItem(15, { unit: "통" })).rejects.toThrow("개 또는 병"); expect(update).not.toHaveBeenCalled();
  });
  it("이력이 있는 약침의 개·병 변경은 막아 기존 수량을 보호한다", async () => {
    const update = store(yakchim, [{ id: 1 }]); await expect(updateCabinetItem(15, { unit: "개" })).rejects.toThrow("새 품목"); expect(update).not.toHaveBeenCalled();
  });
  it("이력이 있어도 삭제는 active=false만 저장하고 장부·수량은 건드리지 않는다", async () => {
    const update = store(yakchim, [{ id: 1 }]); await archiveCabinetItem(15);
    expect(update).toHaveBeenCalledWith({ active: false });
    expect(mocks.from.mock.calls.map((call) => call[0])).toEqual(["cabinet_items", "cabinet_items"]);
  });
  it("복구는 active=true만 저장한다", async () => {
    const update = store({ ...yakchim, active: false }); await updateCabinetItem(15, { active: true }); expect(update).toHaveBeenCalledWith({ active: true });
  });
  it("병원 확인 실패는 삭제도 막는다", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null }); await expect(archiveCabinetItem(15)).rejects.toThrow("병원을 확인하지 못했습니다"); expect(mocks.from).not.toHaveBeenCalled();
  });
});


it("삭제한 약침은 새 장부 저장 전에 복구를 요구한다", async () => {
  rows([{ ...insured, id: 15, kind: "yakchim", clinic: null, active: false }]);
  await expect(validateCabinetTargetsForLedger([{ group: "cabinet", cabinet_item_id: 15 }])).rejects.toThrow("복구");
  expect(mocks.from.mock.calls.map((call) => call[0])).toEqual(["cabinet_items"]);
});
