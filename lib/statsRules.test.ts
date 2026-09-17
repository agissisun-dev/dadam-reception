import { describe, it, expect } from "vitest";
import {
  happyCallMonth,
  monthShort,
  monthlyRows,
  niceMax,
  pct,
  prescriptionSeq,
  prevMonthKey,
  recentMonthKeys,
  weeklyMonth,
} from "./statsRules";

describe("월 키", () => {
  it("최근 n개월, 해를 넘어서", () => {
    expect(recentMonthKeys("2026-02-10", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(prevMonthKey("2026-01")).toBe("2025-12");
    expect(monthShort("2026-09")).toBe("9월");
    expect(monthShort("2026-01")).toBe("26년 1월");
  });
  it("pct / niceMax", () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(0, 0)).toBeNull();
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(8);
    expect(niceMax(13)).toBe(20);
    expect(niceMax(23)).toBe(25);
    expect(niceMax(40)).toBe(40);
    expect(niceMax(120)).toBe(200);
    expect(niceMax(920)).toBe(1000);
  });
});

const presc = [
  { id: 1, patient_id: 1, receive_date: "2026-08-10", packs: 40, days: 20, per_day: 2 },
  { id: 2, patient_id: 2, receive_date: "2026-08-20", packs: null, days: 10, per_day: null },
  { id: 3, patient_id: 1, receive_date: "2026-09-05", packs: 70, days: 35, per_day: 2 },
  { id: 4, patient_id: 3, receive_date: "2026-09-12", packs: 20, days: 10, per_day: 2 },
];

describe("monthlyRows", () => {
  it("처방 순번은 수령일 순, 재처방은 2번째부터, 포 수 없으면 일수×2", () => {
    const seq = prescriptionSeq(presc);
    expect(seq.get(1)).toBe(1);
    expect(seq.get(3)).toBe(2);
    const rows = monthlyRows(
      { patients: [{ created_at: "2026-09-01T12:00:00+09:00" }, { created_at: "2026-08-15T12:00:00+09:00" }], prescriptions: presc },
      ["2026-08", "2026-09"],
    );
    expect(rows[0]).toEqual({ key: "2026-08", newPatients: 1, prescriptions: 2, represcriptions: 0, packs: 60 });
    expect(rows[1]).toEqual({ key: "2026-09", newPatients: 1, prescriptions: 2, represcriptions: 1, packs: 90 });
  });
});

describe("happyCallMonth", () => {
  const calls = [
    { id: 1, round: 1, due_date: "2026-09-03", status: "contacted", created_at: "2026-08-20T12:00:00+09:00" },
    { id: 2, round: 2, due_date: "2026-09-10", status: "contacted", created_at: "2026-08-20T12:00:00+09:00" },
    { id: 3, round: 2, due_date: "2026-09-15", status: "closed", created_at: "2026-08-20T12:00:00+09:00" },
    { id: 4, round: 1, due_date: "2026-09-20", status: "pending", created_at: "2026-08-20T12:00:00+09:00" },
    { id: 5, round: 3, due_date: "2026-10-01", status: "pending", created_at: "2026-09-10T12:00:00+09:00" },
    { id: 6, round: 1, due_date: "2026-08-30", status: "contacted", created_at: "2026-08-20T12:00:00+09:00" },
  ];
  const logs = [
    { happy_call_id: 1, action: "contacted", created_at: "2026-09-03T12:00:00+09:00" },
    { happy_call_id: 2, action: "missed", created_at: "2026-09-09T12:00:00+09:00" },
    { happy_call_id: 2, action: "contacted", created_at: "2026-09-12T12:00:00+09:00" },
    { happy_call_id: 3, action: "represcribed", created_at: "2026-09-14T12:00:00+09:00" },
  ];
  it("예정·처리·제때·재처방·3차를 센다", () => {
    expect(happyCallMonth(calls, logs, "2026-09")).toEqual({
      due: 4,
      handled: 3,
      onTime: 2,
      represcribed: 1,
      followUps: 1,
    });
  });
});

describe("weeklyMonth", () => {
  it("행동별로 센다", () => {
    const r = weeklyMonth(
      [
        { action: "sent", planned_date: "2026-09-01", patient_reply: "속 편함" },
        { action: "sent", planned_date: "2026-09-08", patient_reply: null },
        { action: "no_reply", planned_date: "2026-09-15", patient_reply: null },
        { action: "skipped_visited", planned_date: "2026-09-22", patient_reply: null },
        { action: "sent", planned_date: "2026-08-25", patient_reply: "x" },
      ],
      "2026-09",
    );
    expect(r).toEqual({ sent: 2, visited: 1, noReply: 1, replies: 1, dormant: 0 });
  });
});
