import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCabinetClinic, loadCabinet, validateCabinetTargetsForLedger } from "./cabinet";
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
