import { describe, it, expect } from "vitest";
import { cabinetScopeAllows, scopedCabinetRecords, expectedStock, cabinetInitialized, cabinetLinkAllows, normalizedCabinetUnit } from "./cabinetRules";
import type { CabinetItem, CabinetMove } from "./types";

function item(id: number, kind: CabinetItem["kind"], clinic: "S" | "N" | null, active = true): CabinetItem {
  return { id, name: "같은 보험약 이름", kind, clinic, unit: kind === "insured" ? "포" : "개", min_stock: 0, active, sort_order: id, created_at: "2026-11-17T00:00:00Z" };
}
function move(id: number, item_id: number, kind: CabinetMove["kind"], qty: number): CabinetMove {
  return { id, item_id, kind, qty, expiry: "2027-01-01", purpose: null, patient_id: null, patient_name: null, staff_name: "test", memo: null, diff: null, created_at: "2026-11-17T00:00:00Z" };
}

describe("보험약과 용품 병원별 분리", () => {
  const shared = [item(1, "medicine", null), item(2, "topical", null), item(3, "yakchim", null)];
  const s = item(5, "insured", "S");
  const n = item(6, "insured", "N");
  it("다른 세 구분은 양쪽 병원 공용이다", () => {
    for (const i of shared) {
      expect(cabinetScopeAllows(i, "S")).toBe(true);
      expect(cabinetScopeAllows(i, "N")).toBe(true);
    }
  });
  it("같은 이름이어도 보험약 소유 병원을 따른다", () => {
    expect(cabinetScopeAllows(s, "S")).toBe(true);
    expect(cabinetScopeAllows(s, "N")).toBe(false);
    expect(cabinetScopeAllows(n, "N")).toBe(true);
    expect(cabinetScopeAllows(n, "S")).toBe(false);
  });
  it("병원 미확인 및 비정상 범위는 열지 않는다", () => {
    for (const i of [...shared, s, n]) expect(cabinetScopeAllows(i, null)).toBe(false);
    expect(cabinetScopeAllows(item(7, "insured", null), "S")).toBe(false);
    expect(cabinetScopeAllows(item(8, "medicine", "S"), "S")).toBe(false);
  });
  it("전체 최근 기록에도 다른 병원 보험약 및 알 수 없는 품목은 섞이지 않는다", () => {
    const moves = [1, 5, 6, 99].map((id) => move(id, id, "in", 10));
    const data = scopedCabinetRecords([...shared, s, n], moves, "S");
    expect(data.items.map((i) => i.id)).toEqual([1, 2, 3, 5]);
    expect(data.moves.map((m) => m.item_id)).toEqual([1, 5]);
  });
  it("사용 안 함으로 둔 자기 병원 품목의 기존 기록은 남긴다", () => {
    const inactive = item(7, "insured", "S", false);
    const moves = [move(1, 7, "in", 23)];
    expect(scopedCabinetRecords([inactive], moves, "S").moves).toEqual(moves);
    expect(scopedCabinetRecords([inactive], moves, "N").moves).toEqual([]);
  });
  it("수량·기한·원본 배열을 변경하지 않고 자기 병원 재고만 계산한다", () => {
    const moves = [move(1, 5, "in", 30), move(2, 5, "out", 6), move(3, 6, "in", 100)];
    const before = JSON.stringify(moves);
    const scoped = scopedCabinetRecords([s, n], moves, "S");
    expect(expectedStock(scoped.moves)).toBe(24);
    expect(scoped.moves[0].expiry).toBe("2027-01-01");
    expect(JSON.stringify(moves)).toBe(before);
  });
});

 describe("용품 분리와 보관 계약", () => {
  it.each(["S", "N"] as const)("%s 용품은 소유 병원에서만 사용한다", (clinic) => {
    const supply = item(10, "supply", clinic);
    expect(cabinetLinkAllows(supply, clinic, "cabinet")).toBe(true);
    expect(cabinetLinkAllows(supply, clinic === "S" ? "N" : "S", "cabinet")).toBe(false);
    expect(cabinetLinkAllows(supply, clinic, "extract")).toBe(false);
    expect(cabinetScopeAllows(item(11, "supply", null), clinic)).toBe(false);
  });
  it("공용 보관 수량·기록은 복사나 배분 없이 양쪽에 그대로 보인다", () => {
    const archives = [{ ...item(1, "supply", null), name: "핫팩", legacy_shared: true }, { ...item(2, "supply", null), name: "한방파스", legacy_shared: true }];
    const moves = [move(1, 1, "in", 60), move(2, 1, "out", 2), move(3, 2, "in", 260), move(4, 2, "out", 1), move(5, 2, "out", 1)];
    const before = JSON.stringify({ archives, moves });
    for (const clinic of ["S", "N"] as const) {
      const data = scopedCabinetRecords(archives, moves, clinic);
      expect(data.moves).toEqual(moves);
      expect(expectedStock(data.moves.filter((m) => m.item_id === 1))).toBe(58);
      expect(expectedStock(data.moves.filter((m) => m.item_id === 2))).toBe(258);
      expect(cabinetLinkAllows(archives[0], clinic, "cabinet")).toBe(false);
    }
    expect(JSON.stringify({ archives, moves })).toBe(before);
  });
  it("COUNT 0도 초기 등록이며 입고만으로는 초기 등록이 아니다", () => {
    const supply = item(10, "supply", "S");
    expect(cabinetInitialized(supply, [])).toBe(false);
    expect(cabinetInitialized(supply, [move(1, 10, "in", 3)])).toBe(false);
    expect(cabinetInitialized(supply, [move(1, 10, "count", 0)])).toBe(true);
    expect(cabinetInitialized(item(12, "yakchim", null), [])).toBe(true);
  });
  it("단위는 자유 입력하되 trim 후 1~20자", () => {
    expect(normalizedCabinetUnit(" 봉지 ")).toBe("봉지");
    expect(() => normalizedCabinetUnit(" ")).toThrow("1~20자");
    expect(() => normalizedCabinetUnit("a".repeat(21))).toThrow("1~20자");
  });
});
