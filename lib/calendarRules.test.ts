import { describe, it, expect } from "vitest";
import {
  dayLabel,
  isInMonth,
  lastDayISO,
  monthGrid,
  monthLabel,
  shiftMonth,
  tallyDates,
  yearMonthOf,
} from "./calendarRules";

describe("shiftMonth", () => {
  it("해를 넘어간다", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });
  it("여러 달을 한 번에", () => {
    expect(shiftMonth({ year: 2026, month: 9 }, -14)).toEqual({ year: 2025, month: 7 });
  });
});

describe("monthGrid", () => {
  it("2026년 9월: 화요일 시작이라 8월 30일부터, 5주", () => {
    const g = monthGrid({ year: 2026, month: 9 });
    expect(g.length).toBe(5);
    expect(g[0][0]).toBe("2026-08-30");
    expect(g[0][2]).toBe("2026-09-01");
    expect(g[4][6]).toBe("2026-10-03");
    expect(g.every((w) => w.length === 7)).toBe(true);
  });
  it("2026년 2월: 일요일 시작 28일이라 딱 4주", () => {
    const g = monthGrid({ year: 2026, month: 2 });
    expect(g.length).toBe(4);
    expect(g[0][0]).toBe("2026-02-01");
    expect(g[3][6]).toBe("2026-02-28");
  });
  it("2027년 5월: 토요일 시작 31일이라 6주", () => {
    const g = monthGrid({ year: 2027, month: 5 });
    expect(g.length).toBe(6);
    expect(g[0][0]).toBe("2027-04-25");
    expect(g[5][6]).toBe("2027-06-05");
  });
});

describe("이름·판정", () => {
  it("월 이름과 날 이름", () => {
    expect(monthLabel({ year: 2026, month: 9 })).toBe("2026년 9월");
    expect(dayLabel("2026-09-05")).toBe("9월 5일");
  });
  it("yearMonthOf / isInMonth / lastDayISO", () => {
    expect(yearMonthOf("2026-09-17")).toEqual({ year: 2026, month: 9 });
    expect(isInMonth("2026-09-30", { year: 2026, month: 9 })).toBe(true);
    expect(isInMonth("2026-10-01", { year: 2026, month: 9 })).toBe(false);
    expect(lastDayISO({ year: 2026, month: 2 })).toBe("2026-02-28");
    expect(lastDayISO({ year: 2028, month: 2 })).toBe("2028-02-29");
  });
});

describe("tallyDates", () => {
  it("날짜별로 센다", () => {
    const m = tallyDates(["2026-09-17", "2026-09-17", "2026-09-25"]);
    expect(m.get("2026-09-17")).toBe(2);
    expect(m.get("2026-09-25")).toBe(1);
    expect(m.get("2026-09-01")).toBeUndefined();
  });
});
