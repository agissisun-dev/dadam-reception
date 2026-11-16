import { describe, it, expect } from "vitest";
import { classifySupply, frequencyTable, nextStatuses, parseRequestLines, supplyItemKey, validatePriceUpdate } from "./supplyRules";
import type { SupplyRequest } from "./types";

describe("classifySupply", () => {
  it("약침·치료실·병원 용품", () => {
    expect(classifySupply("봉약침 10개")).toBe("yakchim");
    expect(classifySupply("자하거 약침")).toBe("yakchim");
    expect(classifySupply("알콜솜 2통")).toBe("treatment");
    expect(classifySupply("부항컵 큰거 1세트")).toBe("treatment");
    expect(classifySupply("한방파스 3박스")).toBe("treatment");
    expect(classifySupply("A4 2박스")).toBe("office");
    expect(classifySupply("볼펜 검정 10개")).toBe("office");
  });
});

describe("parseRequestLines", () => {
  it("줄마다 하나, 머리 기호·빈 줄·중복 제거", () => {
    expect(parseRequestLines("- 알콜솜 2통\n\n1. A4 2박스\n알콜솜 2통")).toEqual([
      { text: "알콜솜 2통", category: "treatment" },
      { text: "A4 2박스", category: "office" },
    ]);
  });
  it("쉼표로 이어 적어도 나눈다", () => {
    expect(parseRequestLines("거즈, 핫팩 1박스").map((x) => x.text)).toEqual(["거즈", "핫팩 1박스"]);
  });
});

describe("supplyItemKey", () => {
  it("수량·단위를 뗀다", () => {
    expect(supplyItemKey("알콜솜 2통")).toBe("알콜솜");
    expect(supplyItemKey("A4 2박스")).toBe("A4");
    expect(supplyItemKey("봉약침 10")).toBe("봉약침");
    expect(supplyItemKey("볼펜")).toBe("볼펜");
  });
});

function row(p: Partial<SupplyRequest> & { text: string; requested_at: string }): SupplyRequest {
  return {
    id: 1, clinic: "S", category: "office", status: "received", requested_by: "샘", price: null, vendor: null, price_note: null, product_url: null,
    priced_at: null, approved_at: null, ordered_at: null, received_at: null, received_by: null, cancelled_at: null, memo: null, created_at: p.requested_at, ...p,
  };
}

describe("frequencyTable", () => {
  it("횟수·평균 간격·마지막 가격, 취소 제외", () => {
    const t = frequencyTable([
      row({ text: "알콜솜 2통", requested_at: "2026-09-01T00:00:00Z", price: 12000, vendor: "쿠팡" }),
      row({ text: "알콜솜 1통", requested_at: "2026-10-01T00:00:00Z" }),
      row({ text: "알콜솜 2통", requested_at: "2026-11-01T00:00:00Z", price: 11000, vendor: "제일" }),
      row({ text: "A4 2박스", requested_at: "2026-10-15T00:00:00Z" }),
      row({ text: "볼펜", requested_at: "2026-10-15T00:00:00Z", status: "cancelled" }),
    ]);
    expect(t.map((x) => [x.key, x.count, x.avgGapDays, x.lastPrice, x.lastVendor])).toEqual([
      ["알콜솜", 3, 31, 11000, "제일"],
      ["A4", 1, null, null, null],
    ]);
  });
});

describe("nextStatuses", () => {
  it("샘은 취소·받음만, 원장은 승인·구매 완료", () => {
    expect(nextStatuses("requested", false)).toEqual(["cancelled"]);
    expect(nextStatuses("requested", true)).toEqual(["approved", "ordered", "cancelled"]);
    expect(nextStatuses("ordered", false)).toEqual(["received"]);
    expect(nextStatuses("received", true)).toEqual([]);
  });
});

describe("validatePriceUpdate", () => {
  it("가격·업체", () => {
    expect(validatePriceUpdate({ price: 12000, vendor: " 쿠팡 " })).toEqual({ ok: true, patch: { price: 12000, vendor: "쿠팡" } });
  });
  it("잘못된 가격·빈 본문", () => {
    expect(validatePriceUpdate({ price: -1 }).ok).toBe(false);
    expect(validatePriceUpdate({ price: 1.5 }).ok).toBe(false);
    expect(validatePriceUpdate({}).ok).toBe(false);
  });
});
