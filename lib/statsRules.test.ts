import { describe, it, expect } from "vitest";
import {
  happyCallMonth,
  ledgerItemCounts,
  ledgerMonth,
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
    { id: 6, round: 1, due_date: "2026-08-30", status: "contacted", created_at: "2026-08-20T12:00:00+09:00" },
  ];
  const logs = [
    { happy_call_id: 1, action: "contacted", created_at: "2026-09-03T12:00:00+09:00" },
    { happy_call_id: 2, action: "missed", created_at: "2026-09-09T12:00:00+09:00" },
    { happy_call_id: 2, action: "contacted", created_at: "2026-09-12T12:00:00+09:00" },
    { happy_call_id: 3, action: "represcribed", created_at: "2026-09-14T12:00:00+09:00" },
  ];
  it("예정·처리·제때·재처방을 센다", () => {
    expect(happyCallMonth(calls, logs, "2026-09")).toEqual({
      due: 4,
      handled: 3,
      onTime: 2,
      represcribed: 1,
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

describe("ledgerMonth — 한 달 매출", () => {
  const entries = [
    { day: "2026-10-01", cash: 11000, cash_receipt: 0, card: 0 },
    { day: "2026-10-01", cash: 0, cash_receipt: 44700, card: 0 },
    { day: "2026-10-02", cash: 0, cash_receipt: 0, card: 240000 },
    { day: "2026-10-02", cash: -11000, cash_receipt: 0, card: 11000 }, // 정정 줄
    { day: "2026-09-30", cash: 99999, cash_receipt: 0, card: 0 },
  ];
  const expenses = [{ day: "2026-10-01", amount: 11600 }, { day: "2026-09-30", amount: 5 }];
  it("그 달만 더하고, 정정 줄은 부호대로, 줄이 있는 날 수", () => {
    expect(ledgerMonth(entries, expenses, "2026-10")).toEqual({ cash: 0, cash_receipt: 44700, card: 251000, subtotal: 295700, offTotal: 0, expenses: 11600, days: 2 });
  });
  it("합계에서 빼기 줄은 소계에 넣되 offTotal로 따로", () => {
    const r = ledgerMonth([{ day: "2026-10-01", cash: 0, cash_receipt: 10500, card: 0, off_total: true }], [], "2026-10");
    expect(r.subtotal).toBe(10500);
    expect(r.offTotal).toBe(10500);
  });
  it("줄이 없는 달은 0", () => {
    expect(ledgerMonth(entries, expenses, "2026-08").subtotal).toBe(0);
  });
});

describe("ledgerItemCounts — 한 달 항목별", () => {
  it("이름별 합, 묶음 순 뒤 수량 순", () => {
    const items = [
      { day: "2026-10-01", name: "전침", group: "treatment", qty: 1, amount: null },
      { day: "2026-10-02", name: "전침", group: "treatment", qty: 1, amount: null },
      { day: "2026-10-02", name: "공진단", group: "cabinet", qty: 5, amount: null },
      { day: "2026-10-02", name: "일반 탕약", group: "decoction", qty: 1, amount: 420000 },
      { day: "2026-09-30", name: "전침", group: "treatment", qty: 9, amount: null },
    ];
    expect(ledgerItemCounts(items, "2026-10")).toEqual([
      { name: "일반 탕약", group: "decoction", qty: 1, amount: 420000 },
      { name: "공진단", group: "cabinet", qty: 5, amount: 0 },
      { name: "전침", group: "treatment", qty: 2, amount: 0 },
    ]);
  });
});
