import { describe, it, expect } from "vitest";
import { closedReason, holidayName, isClinicClosed, shiftToClinicDay } from "./holidays";

describe("isClinicClosed / 이름", () => {
  it("일요일과 공휴일은 휴진, 토요일과 평일은 진료", () => {
    expect(isClinicClosed("2026-09-20")).toBe(true); // 일
    expect(isClinicClosed("2026-09-19")).toBe(false); // 토
    expect(isClinicClosed("2026-09-25")).toBe(true); // 추석
    expect(isClinicClosed("2026-09-22")).toBe(false); // 화
  });
  it("이름: 공휴일은 이름, 일요일은 '일요일', 진료일은 null", () => {
    expect(holidayName("2026-09-25")).toBe("추석");
    expect(closedReason("2026-09-20")).toBe("일요일");
    expect(closedReason("2026-09-22")).toBeNull();
  });
});

describe("shiftToClinicDay — 가까운 진료일로", () => {
  it("진료일은 그대로", () => {
    expect(shiftToClinicDay("2026-09-22", "after")).toBe("2026-09-22");
  });
  it("일요일은 앞뒤가 같아서 prefer 쪽: 연락은 월요일, 업무는 토요일", () => {
    expect(shiftToClinicDay("2026-09-20", "after")).toBe("2026-09-21");
    expect(shiftToClinicDay("2026-09-20", "before")).toBe("2026-09-19");
  });
  it("추석 연휴 9/24(목)~9/27(일): 앞쪽이 가까우면 앞으로, 뒤쪽이 가까우면 뒤로", () => {
    expect(shiftToClinicDay("2026-09-24", "after")).toBe("2026-09-23"); // 앞 1일 vs 뒤 4일
    expect(shiftToClinicDay("2026-09-25", "after")).toBe("2026-09-23"); // 앞 2일 vs 뒤 3일
    expect(shiftToClinicDay("2026-09-26", "before")).toBe("2026-09-28"); // 앞 3일 vs 뒤 2일
    expect(shiftToClinicDay("2026-09-27", "before")).toBe("2026-09-28"); // 앞 4일 vs 뒤 1일
  });
  it("토요일이 진료일이라 광복절(토)은 휴진, 그 전날 금요일이 가장 가깝다", () => {
    expect(shiftToClinicDay("2026-08-15", "after")).toBe("2026-08-14");
  });
});
