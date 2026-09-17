import { describe, it, expect } from "vitest";
import {
  planHappyCalls,
  bucketHappyCalls,
  followUpAfterContact,
  isLastPlannedCall,
  NOTE_ROUND1,
  NOTE_ROUND2,
  NOTE_ROUND3,
  NOTE_SINGLE,
} from "./happyCallRules";
import type { HappyCallRow } from "./types";

describe("planHappyCalls", () => {
  it("30일분: 1차 +7, 2차 +27", () => {
    expect(planHappyCalls("2026-09-10", 30)).toEqual([
      { round: 1, due_date: "2026-09-17", note: NOTE_ROUND1 },
      { round: 2, due_date: "2026-10-07", note: NOTE_ROUND2 },
    ]);
  });
  it("13일분: 두 건 (1차 +7, 2차 +10)", () => {
    expect(planHappyCalls("2026-09-10", 13).map((c) => c.due_date)).toEqual(["2026-09-17", "2026-09-20"]);
  });
  it("12일 이하: 한 건, +7, 합친 메모", () => {
    expect(planHappyCalls("2026-09-10", 12)).toEqual([{ round: 1, due_date: "2026-09-17", note: NOTE_SINGLE }]);
    expect(planHappyCalls("2026-09-10", 7)).toHaveLength(1);
  });
});

function row(p: Partial<HappyCallRow> & { id: number; due_date: string }): HappyCallRow {
  return {
    prescription_id: 1,
    round: 1,
    auto_due_date: p.due_date,
    note: "",
    status: "pending",
    missed_count: 0,
    created_at: "",
    prescription_seq: 1,
    prescription: {
      id: 1, patient_id: 1, receive_date: "2026-09-01", days: 30, packs: null, per_day: null, memo: null, status: "active", created_at: "",
      patient: {
        id: 1, name: "x", phone: "01000000000", family_phone: null, family_note: null,
        condition: "general", memo: null, excluded_at: null, excluded_reason: null,
        weekly_status: "off", weekly_weekday: 2, weekly_interval: 1, weekly_round: 1, weekly_next_date: null, weekly_started_at: null, created_at: "",
      },
    },
    ...p,
  };
}

describe("bucketHappyCalls", () => {
  const today = "2026-09-13";
  const rows = [
    row({ id: 1, due_date: "2026-09-12" }),
    row({ id: 2, due_date: "2026-09-13" }),
    row({ id: 3, due_date: "2026-09-20" }),
    row({ id: 4, due_date: "2026-09-21" }),
    row({ id: 5, due_date: "2026-09-10", status: "contacted" }),
    row({ id: 6, due_date: "2026-09-01" }),
  ];
  it("오늘 = 오늘 이하, 오래된 순", () => {
    expect(bucketHappyCalls(rows, today).today.map((r) => r.id)).toEqual([6, 1, 2]);
  });
  it("이번 주 = 내일부터 7일", () => {
    expect(bucketHappyCalls(rows, today).upcoming.map((r) => r.id)).toEqual([3]);
  });
  it("pending 아닌 것은 제외", () => {
    const b = bucketHappyCalls(rows, today);
    const ids = [...b.today, ...b.upcoming].map((r) => r.id);
    expect(ids).not.toContain(5);
  });
});

describe("followUpAfterContact (3차 해피콜)", () => {
  const today = "2026-09-17";
  it("2차를 연락함으로 마치면 7일 뒤 3차", () => {
    expect(followUpAfterContact({ round: 2, note: NOTE_ROUND2 }, today)).toEqual({
      round: 3,
      due_date: "2026-09-24",
      note: NOTE_ROUND3,
    });
  });
  it("12일 이하 처방의 단일 건도 마지막이라 3차를 만든다", () => {
    expect(followUpAfterContact({ round: 1, note: NOTE_SINGLE }, today)?.due_date).toBe("2026-09-24");
  });
  it("1차(2차가 남아 있음)와 3차는 만들지 않는다", () => {
    expect(followUpAfterContact({ round: 1, note: NOTE_ROUND1 }, today)).toBeNull();
    expect(followUpAfterContact({ round: 3, note: NOTE_ROUND3 }, today)).toBeNull();
  });
  it("isLastPlannedCall", () => {
    expect(isLastPlannedCall({ round: 2, note: "" })).toBe(true);
    expect(isLastPlannedCall({ round: 1, note: NOTE_SINGLE })).toBe(true);
    expect(isLastPlannedCall({ round: 1, note: NOTE_ROUND1 })).toBe(false);
  });
});
