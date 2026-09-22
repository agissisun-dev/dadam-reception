import { describe, it, expect } from "vitest";
import { closedReason, holidayLabel, holidayName, isClinicClosed, isWorkingSubstitute, shiftToClinicDay } from "./holidays";

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

describe("대체휴일 — 다담은 토요일 진료", () => {
  it("원래 공휴일이 토요일이면 대체휴일(월)은 진료: 광복절 2026-08-15(토) → 8/17 진료", () => {
    expect(isClinicClosed("2026-08-15")).toBe(true);
    expect(isClinicClosed("2026-08-17")).toBe(false);
    expect(isWorkingSubstitute("2026-08-17")).toBe(true);
    expect(closedReason("2026-08-17")).toBeNull();
    expect(holidayLabel("2026-08-17")).toBe("광복절 대체휴일(진료)");
    expect(isClinicClosed("2026-10-05")).toBe(false); // 개천절 10/3(토) 대체
  });
  it("원래 공휴일이 일요일이면 대체휴일(월)은 휴진: 부처님오신날 2026-05-24(일) → 5/25 휴진", () => {
    expect(isClinicClosed("2026-05-25")).toBe(true);
    expect(isWorkingSubstitute("2026-05-25")).toBe(false);
    expect(holidayLabel("2026-05-25")).toBe("부처님오신날 대체휴일");
    expect(isClinicClosed("2026-03-02")).toBe(true); // 삼일절 3/1(일) 대체
  });
  it("공휴일끼리 겹쳐 생긴 대체휴일은 휴진: 2028 추석·개천절 → 10/5 휴진", () => {
    expect(isClinicClosed("2028-10-05")).toBe(true);
  });
  it("진료하는 대체휴일(8/17 월)에 잡힌 일정은 그대로 둔다", () => {
    expect(shiftToClinicDay("2026-08-17")).toBe("2026-08-17");
  });
});

describe("shiftToClinicDay — 휴진일이면 그 전 진료일로 (뒤로 미루지 않음)", () => {
  it("진료일은 그대로", () => {
    expect(shiftToClinicDay("2026-09-22")).toBe("2026-09-22");
  });
  it("일요일은 토요일로", () => {
    expect(shiftToClinicDay("2026-09-20")).toBe("2026-09-19");
  });
  it("추석 연휴 9/24(목)~9/27(일)은 모두 9/23(수)로", () => {
    expect(shiftToClinicDay("2026-09-24")).toBe("2026-09-23");
    expect(shiftToClinicDay("2026-09-25")).toBe("2026-09-23");
    expect(shiftToClinicDay("2026-09-26")).toBe("2026-09-23");
    expect(shiftToClinicDay("2026-09-27")).toBe("2026-09-23");
  });
  it("토요일이 진료일이라 광복절(토)은 휴진 → 금요일. 그 다음 일요일도 금요일", () => {
    expect(shiftToClinicDay("2026-08-15")).toBe("2026-08-14");
    expect(shiftToClinicDay("2026-08-16")).toBe("2026-08-14");
  });
});
