import { describe, it, expect } from "vitest";
import { parseNote, parseWon, sumEntries, sumExpenses, nextSeq, won, itemSummary } from "./ledgerRules";
import type { LedgerCode } from "./types";

const c = (code: string, name: string, group: LedgerCode["group"], extra: Partial<LedgerCode> = {}): LedgerCode => ({
  id: 0, code, name, group, cabinet_item_id: null, decoction_kind: null, active: true, sort_order: 0, created_at: "", ...extra,
});
const CODES: LedgerCode[] = [
  c("전", "전침", "treatment"),
  c("습", "습부항", "treatment"),
  c("V", "약침", "treatment"),
  c("mo", "mo", "treatment"),
  c("보험(처방)", "보험 탕약", "decoction", { decoction_kind: "insurance" }),
  c("일반", "일반 탕약", "decoction", { decoction_kind: "general" }),
  c("발효", "발효 탕약", "decoction", { decoction_kind: "fermented" }),
  c("공진단", "공진단", "cabinet", { cabinet_item_id: 1 }),
  c("소합원", "소합원", "cabinet", { cabinet_item_id: 4 }),
  c("오적", "오적산", "extract"),
  c("향사평위", "향사평위산", "extract"),
  c("옛것", "안 쓰는 약어", "other", { active: false }),
];

describe("parseNote — 기타 칸 약어 → 항목", () => {
  it("쉼표로 나누고 아는 약어는 항목으로", () => {
    const r = parseNote("전,습,mo-0.6,향사평위2일", CODES);
    expect(r.items.map((i) => [i.name, i.group, i.qty, i.days])).toEqual([
      ["전침", "treatment", 1, null],
      ["습부항", "treatment", 1, null],
      ["mo", "treatment", 1, null],
      ["향사평위산", "extract", 1, 2],
    ]);
    expect(r.items.every((i) => !i.unknown)).toBe(true);
    expect(r.review).toBe(false);
  });
  it("괄호 숫자는 만원 금액, #N은 분할 횟수", () => {
    const [i] = parseNote("일반(42.#2)", CODES).items;
    expect(i).toMatchObject({ name: "일반 탕약", group: "decoction", amount: 420000, split: 2, decoction_kind: "general" });
    expect(parseNote("발효(48)", CODES).items[0]).toMatchObject({ amount: 480000, split: null });
    expect(parseNote("일반(42)#2", CODES).items[0]).toMatchObject({ amount: 420000, split: 2 });
  });
  it("보험(처방)은 괄호째 약어", () => {
    expect(parseNote("V,보험(처방)", CODES).items[1]).toMatchObject({ name: "보험 탕약", decoction_kind: "insurance", amount: null });
  });
  it("숫자+T/알/개는 수량, 약장 품목 연결", () => {
    expect(parseNote("공진단5T", CODES).items[0]).toMatchObject({ qty: 5, cabinet_item_id: 1 });
    expect(parseNote("소합원 3알", CODES).items[0]).toMatchObject({ qty: 3, cabinet_item_id: 4 });
    expect(parseNote("V2", CODES).items[0]).toMatchObject({ name: "약침", qty: 2 });
  });
  it("리뷰 조각은 항목이 아니라 표시", () => {
    const r = parseNote("소합원3T,리뷰", CODES);
    expect(r.review).toBe(true);
    expect(r.items).toHaveLength(1);
  });
  it("모르는 말은 unknown으로 남긴다 (원문 유지)", () => {
    const r = parseNote("전,습부2", CODES);
    expect(r.items[1]).toMatchObject({ raw: "습부2", unknown: true, group: "other" });
  });
  it("사용 안 함 약어는 모르는 말로", () => {
    expect(parseNote("옛것", CODES).items[0].unknown).toBe(true);
  });
  it("대소문자·공백 무시, 빈 조각 무시", () => {
    expect(parseNote(" v , ,전 ", CODES).items.map((i) => i.name)).toEqual(["약침", "전침"]);
    expect(parseNote("", CODES).items).toEqual([]);
  });
});

describe("합계·번호·금액", () => {
  it("sumEntries", () => {
    expect(sumEntries([{ cash: 1000, cash_receipt: 0, card: 500 }, { cash: 0, cash_receipt: 200, card: 0 }])).toEqual({
      cash: 1000, cash_receipt: 200, card: 500, subtotal: 1700,
    });
  });
  it("sumExpenses", () => expect(sumExpenses([{ amount: 11600 }, { amount: 20000 }])).toBe(31600));
  it("nextSeq는 가장 큰 번호 + 1, 비면 1", () => {
    expect(nextSeq([])).toBe(1);
    expect(nextSeq([{ seq: 3 }, { seq: 7 }])).toBe(8);
  });
  it("won", () => expect(won(1409500)).toBe("1,409,500"));
  it("parseWon: 쉼표·원·만 단위", () => {
    expect(parseWon("11,000")).toBe(11000);
    expect(parseWon("11000원")).toBe(11000);
    expect(parseWon("42만")).toBe(420000);
    expect(parseWon("1.5만")).toBe(15000);
    expect(parseWon("")).toBe(0);
    expect(parseWon("abc")).toBe(0);
  });
  it("itemSummary: 이름별 수량 합, 묶음 순", () => {
    const items = [
      { name: "전침", group: "treatment" as const, qty: 1 },
      { name: "공진단", group: "cabinet" as const, qty: 5 },
      { name: "전침", group: "treatment" as const, qty: 1 },
      { name: "보험 탕약", group: "decoction" as const, qty: 1 },
    ];
    expect(itemSummary(items)).toEqual([
      { name: "보험 탕약", group: "decoction", qty: 1 },
      { name: "공진단", group: "cabinet", qty: 5 },
      { name: "전침", group: "treatment", qty: 2 },
    ]);
  });
});
