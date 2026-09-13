import { describe, it, expect } from "vitest";
import { planHappyCalls, bucketHappyCalls, NOTE_ROUND1, NOTE_ROUND2, NOTE_SINGLE } from "./happyCallRules";
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
      id: 1, patient_id: 1, receive_date: "2026-09-01", days: 30, memo: null, status: "active", created_at: "",
      patient: {
        id: 1, name: "x", phone: "01000000000", family_phone: null, family_note: null,
        condition: "general", memo: null, excluded_at: null, excluded_reason: null, created_at: "",
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
