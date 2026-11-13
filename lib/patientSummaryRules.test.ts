import { describe, it, expect } from "vitest";
import { describeAgo, describeRemaining, isFullPhoneQuery, remainingMedicine } from "./patientSummaryRules";

describe("remainingMedicine", () => {
  const p = { receive_date: "2026-11-01", days: 18, packs: 35, per_day: 2 };
  it("수령일 당일: 전부 남음", () => {
    expect(remainingMedicine(p, "2026-11-01")).toEqual({ endDate: "2026-11-18", daysLeft: 18, packsLeft: 35 });
  });
  it("열흘 뒤: 8일분 16포", () => {
    expect(remainingMedicine(p, "2026-11-11")).toEqual({ endDate: "2026-11-18", daysLeft: 8, packsLeft: 16 });
  });
  it("다 드신 뒤는 0", () => {
    expect(remainingMedicine(p, "2026-12-01").daysLeft).toBe(0);
    expect(remainingMedicine(p, "2026-12-01").packsLeft).toBe(0);
  });
  it("수령 전이면 아직 안 줄어듦", () => {
    expect(remainingMedicine(p, "2026-10-28").daysLeft).toBe(18);
  });
  it("포 수 없으면 packsLeft null", () => {
    expect(remainingMedicine({ receive_date: "2026-11-01", days: 10, packs: null, per_day: null }, "2026-11-05").packsLeft).toBeNull();
  });
});

describe("describeRemaining", () => {
  it("남음", () => {
    expect(describeRemaining({ endDate: "2026-11-18", daysLeft: 8, packsLeft: 16 }, "2026-11-11")).toBe("약 16포(8일분) 남음 · 11월 18일까지");
  });
  it("곧 소진", () => {
    expect(describeRemaining({ endDate: "2026-11-18", daysLeft: 2, packsLeft: 4 }, "2026-11-17")).toContain("곧 소진");
  });
  it("다 드셨음", () => {
    expect(describeRemaining({ endDate: "2026-11-01", daysLeft: 0, packsLeft: 0 }, "2026-11-11")).toBe("다 드셨음 (11월 1일까지였음)");
  });
});

describe("isFullPhoneQuery", () => {
  it("11자리 번호", () => {
    expect(isFullPhoneQuery("01012345678")).toBe(true);
    expect(isFullPhoneQuery("010-1234-5678")).toBe(true);
  });
  it("이름·짧은 번호는 아님", () => {
    expect(isFullPhoneQuery("홍길동")).toBe(false);
    expect(isFullPhoneQuery("0101234")).toBe(false);
  });
});

describe("describeAgo", () => {
  it("오늘·어제·N일 전·달 전", () => {
    expect(describeAgo("2026-11-13", "2026-11-13")).toBe("오늘");
    expect(describeAgo("2026-11-12", "2026-11-13")).toBe("어제");
    expect(describeAgo("2026-11-01", "2026-11-13")).toBe("12일 전");
    expect(describeAgo("2026-08-01", "2026-11-13")).toBe("3달 전");
  });
});
