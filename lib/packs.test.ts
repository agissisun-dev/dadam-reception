import { describe, it, expect } from "vitest";
import { daysFromPacks, PACK_PRESETS, describePrescription } from "./packs";

describe("daysFromPacks", () => {
  it("하루 2포: 20포→10일, 35포→18일(올림), 40포→20일, 70포→35일", () => {
    expect(daysFromPacks(20, 2)).toBe(10);
    expect(daysFromPacks(35, 2)).toBe(18);
    expect(daysFromPacks(40, 2)).toBe(20);
    expect(daysFromPacks(70, 2)).toBe(35);
  });
  it("하루 1포·3포", () => {
    expect(daysFromPacks(20, 1)).toBe(20);
    expect(daysFromPacks(20, 3)).toBe(7);
  });
  it("잘못된 값은 0", () => {
    expect(daysFromPacks(0, 2)).toBe(0);
    expect(daysFromPacks(20, 0)).toBe(0);
  });
});

describe("PACK_PRESETS / describePrescription", () => {
  it("자주 나가는 포 수", () => {
    expect([...PACK_PRESETS]).toEqual([20, 35, 40, 70]);
  });
  it("포 수가 있으면 '35포(18일분)', 없으면 '18일분'", () => {
    expect(describePrescription({ days: 18, packs: 35 })).toBe("35포(18일분)");
    expect(describePrescription({ days: 18, packs: null })).toBe("18일분");
  });
});
