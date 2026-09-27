import { describe, it, expect } from "vitest";
import { countDiff, expectedStock, expiryStatus, nearestExpiry, remainingLots } from "./cabinetRules";
import type { CabinetMove } from "./types";

function mv(p: Partial<CabinetMove> & { id: number; kind: CabinetMove["kind"]; qty: number }): CabinetMove {
  return {
    item_id: 1,
    expiry: null,
    purpose: null,
    patient_id: null,
    patient_name: null,
    staff_name: "x",
    memo: null,
    diff: null,
    created_at: `2026-09-${String(p.id).padStart(2, "0")}T09:00:00+09:00`,
    ...p,
  };
}

describe("expectedStock", () => {
  it("입고 더하고 나감·폐기 빼고, 세어 맞춤은 그 값으로 덮어쓴다", () => {
    const moves = [
      mv({ id: 1, kind: "in", qty: 10 }),
      mv({ id: 2, kind: "out", qty: 2 }),
      mv({ id: 3, kind: "discard", qty: 1 }),
      mv({ id: 4, kind: "count", qty: 6, diff: -1 }), // 7이어야 하는데 6
      mv({ id: 5, kind: "in", qty: 5 }),
    ];
    expect(expectedStock(moves)).toBe(11);
    expect(expectedStock([])).toBe(0);
  });
});

describe("remainingLots / nearestExpiry", () => {
  const ins = [
    mv({ id: 1, kind: "in", qty: 10, expiry: "2026-12-31" }),
    mv({ id: 5, kind: "in", qty: 5, expiry: "2027-06-30" }),
  ];
  it("오래된 묶음부터 나갔다고 보고, 지금 수를 최근 묶음부터 채운다", () => {
    expect(remainingLots(ins, 7)).toEqual([
      { expiry: "2026-12-31", qty: 2 },
      { expiry: "2027-06-30", qty: 5 },
    ]);
    expect(nearestExpiry(remainingLots(ins, 7))).toBe("2026-12-31");
  });
  it("지금 수가 최근 묶음보다 적으면 옛 묶음은 다 나간 것", () => {
    expect(remainingLots(ins, 3)).toEqual([{ expiry: "2027-06-30", qty: 3 }]);
    expect(nearestExpiry(remainingLots(ins, 3))).toBe("2027-06-30");
  });
  it("0개면 묶음 없음, 기한 null", () => {
    expect(remainingLots(ins, 0)).toEqual([]);
    expect(nearestExpiry([])).toBeNull();
  });
  it("기한 없는 묶음은 뒤로", () => {
    const lots = remainingLots(
      [mv({ id: 1, kind: "in", qty: 3, expiry: null }), mv({ id: 2, kind: "in", qty: 3, expiry: "2026-11-01" })],
      6,
    );
    expect(lots[0].expiry).toBe("2026-11-01");
    expect(nearestExpiry(lots)).toBe("2026-11-01");
  });
});

describe("expiryStatus", () => {
  const today = "2026-09-28";
  it("지남 / 30일 안 / 60일 안 / 여유", () => {
    expect(expiryStatus("2026-09-27", today)).toBe("expired");
    expect(expiryStatus("2026-09-28", today)).toBe("soon30");
    expect(expiryStatus("2026-10-28", today)).toBe("soon30");
    expect(expiryStatus("2026-10-29", today)).toBe("soon60");
    expect(expiryStatus("2026-11-27", today)).toBe("soon60");
    expect(expiryStatus("2026-11-28", today)).toBeNull();
    expect(expiryStatus(null, today)).toBeNull();
  });
});

describe("countDiff", () => {
  it("센 수 − 있어야 할 수", () => {
    expect(countDiff(8, 7)).toBe(-1);
    expect(countDiff(8, 8)).toBe(0);
    expect(countDiff(8, 9)).toBe(1);
  });
});
