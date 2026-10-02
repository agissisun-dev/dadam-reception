import { describe, it, expect } from "vitest";
import { countByDay, dayHours, fillTemplate, parseNaverPaste, slotLoad, slotsOf } from "./appointmentRules";

const S = { consult_per_slot: 1, treatment_per_slot: 3 };

describe("dayHours — 다담에스", () => {
  it("월·화·목은 9:30~18:00 점심 13~14, 토는 9:30~15:00 점심 없음, 수·금·일 휴진", () => {
    expect(dayHours("2026-10-05", "S")).toMatchObject({ open: true, start: "09:30", end: "18:00", lunchStart: "13:00" }); // 월
    expect(dayHours("2026-10-10", "S")).toMatchObject({ open: true, end: "15:00", lunchStart: null }); // 토
    expect(dayHours("2026-10-07", "S").open).toBe(false); // 수
    expect(dayHours("2026-10-09", "S").open).toBe(false); // 금
  });
  it("공휴일은 휴진, 그날만 바꾼 것이 있으면 그것", () => {
    expect(dayHours("2026-10-03", "S")).toMatchObject({ open: false, note: "개천절" });
    const fri = dayHours("2026-10-02", "S", { clinic: "S", day: "2026-10-02", open: true, start_time: null, end_time: null, lunch_start: null, lunch_end: null, memo: null });
    expect(fri).toMatchObject({ open: true, start: "09:30", end: "18:00", lunchStart: "13:00", note: "그날만 진료" });
    const sat = dayHours("2026-10-10", "S", { clinic: "S", day: "2026-10-10", open: false, start_time: null, end_time: null, lunch_start: null, lunch_end: null, memo: "휴진" });
    expect(sat.open).toBe(false);
  });
});

describe("slotsOf", () => {
  it("30분 칸, 점심 빼고, 마지막 칸은 끝나기 30분 전", () => {
    const s = slotsOf(dayHours("2026-10-05", "S"), 30);
    expect(s[0]).toBe("09:30");
    expect(s).not.toContain("13:00");
    expect(s).not.toContain("13:30");
    expect(s[s.length - 1]).toBe("17:30");
    expect(s).toHaveLength(15);
  });
  it("15분으로 바꾸면 칸이 두 배", () => {
    expect(slotsOf(dayHours("2026-10-05", "S"), 15)).toHaveLength(30);
  });
  it("휴진이면 빈 배열", () => expect(slotsOf(dayHours("2026-10-07", "S"), 30)).toEqual([]));
});

describe("slotLoad", () => {
  const a = (time: string, kind: "consult" | "treatment", status: "booked" | "arrived" | "noshow" | "cancelled" = "booked") => ({ time, kind, status });
  it("상담 1·침 3 정원, 취소·노쇼는 안 셈", () => {
    const r = slotLoad([a("10:00", "consult"), a("10:00", "treatment"), a("10:00", "treatment", "noshow"), a("10:30", "treatment")], "10:00", S);
    expect(r).toMatchObject({ consult: 1, treatment: 1, consultFull: true, treatmentFull: false });
  });
});

describe("fillTemplate · countByDay", () => {
  it("자리표 채우기", () => {
    expect(fillTemplate("{이름}님 {병원} {날짜} {시간}", { 이름: "김하나", 병원: "다담에스한의원", 날짜: "10월 19일(월)", 시간: "10:00" })).toBe("김하나님 다담에스한의원 10월 19일(월) 10:00");
  });
  it("날짜별 수에서 취소는 뺌", () => {
    const m = countByDay([{ day: "2026-10-05", status: "booked" }, { day: "2026-10-05", status: "cancelled" }, { day: "2026-10-06", status: "arrived" }]);
    expect(m.get("2026-10-05")).toBe(1);
    expect(m.get("2026-10-06")).toBe(1);
  });
});

describe("parseNaverPaste", () => {
  it("날짜·시간·이름·연락처·예약번호를 읽는다", () => {
    const r = parseNaverPaste("2026.10.19 오후 2:30 홍길동 010-1234-5678 예약번호 A1B2C3\n이상한 줄");
    expect(r[0]).toMatchObject({ day: "2026-10-19", time: "14:30", name: "홍길동", phone: "01012345678", key: "A1B2C3", ok: true });
    expect(r[1].ok).toBe(false);
  });
});
