import type { DecoctionKind, LedgerCode, LedgerGroup } from "./types";

/** 묶음 이름(화면용) */
export const GROUP_LABEL: Record<LedgerGroup, string> = {
  decoction: "탕약",
  cabinet: "약장 품목",
  treatment: "치료",
  extract: "엑스제",
  other: "기타",
};
export const GROUP_ORDER: LedgerGroup[] = ["decoction", "cabinet", "treatment", "extract", "other"];

/** 구분(보험 종류) 후보. 사용자 지정 2026-10-02. 직접 쳐도 된다. */
export const INSURANCE_KINDS = ["보험", "일반", "1종지정", "차상1종", "차상2종", "희귀1종", "2종장애", "초진", "재초진", "전화상담"] as const;

/** 합계에서 뺄 때 사유 후보: 접수실에 돈은 없지만 현금영수증은 끊는 경우 */
export const PAY_NOTES = ["제로페이", "서울페이", "계좌입금", "기타"] as const;

/** 기타 칸 한 조각을 읽은 결과 */
export type ParsedItem = {
  raw: string;
  code: string;
  name: string;
  group: LedgerGroup;
  qty: number;
  amount: number | null; // 원
  days: number | null; // 엑스제 일수
  split: number | null; // 분할 수령 횟수
  cabinet_item_id: number | null;
  decoction_kind: DecoctionKind | null;
  unknown: boolean;
};

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/**
 * 기타 칸 글 → 항목. "전,습,일반(42.#2),소합원3T,리뷰" 같은 글을 쉼표로 나눠 약어 사전에서 찾는다.
 * 괄호 숫자는 만원 금액, #N은 분할 횟수, 숫자(T·알·개)는 수량, N일은 엑스제 일수.
 * "리뷰"는 항목이 아니라 표시(review)로 돌려준다. 모르는 말은 unknown으로 남긴다.
 */
export function parseNote(raw: string, codes: LedgerCode[]): { items: ParsedItem[]; review: boolean } {
  const byCode = new Map<string, LedgerCode>();
  for (const c of codes) if (c.active) byCode.set(norm(c.code), c);
  const items: ParsedItem[] = [];
  let review = false;

  for (const piece of raw.split(",")) {
    const token = piece.trim();
    if (!token) continue;
    const t = norm(token);
    if (t === "리뷰" || t === "리뷰증정") {
      review = true;
      continue;
    }
    const whole = byCode.get(t);
    if (whole) {
      items.push(make(token, whole, { qty: 1 }));
      continue;
    }

    let rest = t;
    let days: number | null = null;
    let amount: number | null = null;
    let split: number | null = null;
    let qty = 1;

    // "보험(처방)*2"처럼 약어 뒤 *N은 N건
    let m = rest.match(/\*(\d+)$/);
    if (m) {
      qty = Number(m[1]);
      rest = rest.slice(0, -m[0].length);
      const again = byCode.get(rest);
      if (again) {
        items.push(make(token, again, { qty }));
        continue;
      }
    }

    m = rest.match(/(\d+)일$/);
    if (m) {
      days = Number(m[1]);
      rest = rest.slice(0, -m[0].length);
    }
    m = rest.match(/#(\d+)$/);
    if (m) {
      split = Number(m[1]);
      rest = rest.slice(0, -m[0].length);
    }
    m = rest.match(/\((\d+)(?:\.#(\d+))?\)$/);
    if (m) {
      amount = Number(m[1]) * 10000;
      if (m[2]) split = Number(m[2]);
      rest = rest.slice(0, -m[0].length);
    }
    m = rest.match(/-[\d.]+(\*\d+)?$/); // mo-0.6, mo-0.6*2 같은 용량 표기는 글자로만 남긴다
    if (m) rest = rest.slice(0, -m[0].length);
    m = rest.match(/(\d+)(t|알|개|p)?$/);
    if (m && rest.length > m[0].length) {
      qty = Number(m[1]);
      rest = rest.slice(0, -m[0].length);
    }

    const found = byCode.get(rest);
    if (!found) {
      items.push({
        raw: token, code: token, name: token, group: "other", qty: 1,
        amount: null, days: null, split: null, cabinet_item_id: null, decoction_kind: null, unknown: true,
      });
      continue;
    }
    items.push(make(token, found, { qty, amount, days, split }));
  }
  return { items, review };
}

function make(
  raw: string,
  c: LedgerCode,
  p: { qty: number; amount?: number | null; days?: number | null; split?: number | null },
): ParsedItem {
  return {
    raw,
    code: c.code,
    name: c.name,
    group: c.group,
    qty: p.qty,
    amount: p.amount ?? null,
    days: p.days ?? null,
    split: p.split ?? null,
    cabinet_item_id: c.cabinet_item_id,
    decoction_kind: c.decoction_kind,
    unknown: false,
  };
}

/** 그날 합계. 합계에서 빼기(off_total) 줄은 따로 모아 offTotal로 돌려준다. */
export function sumEntries(entries: { cash: number; cash_receipt: number; card: number; off_total?: boolean }[]) {
  const t = { cash: 0, cash_receipt: 0, card: 0, subtotal: 0, offTotal: 0 };
  for (const e of entries) {
    if (e.off_total) {
      t.offTotal += e.cash + e.cash_receipt + e.card;
      continue;
    }
    t.cash += e.cash;
    t.cash_receipt += e.cash_receipt;
    t.card += e.card;
  }
  t.subtotal = t.cash + t.cash_receipt + t.card;
  return t;
}

export function sumExpenses(expenses: { amount: number }[]): number {
  return expenses.reduce((s, e) => s + e.amount, 0);
}

/** 그날 다음 번호: 가장 큰 번호 + 1 */
export function nextSeq(entries: { seq: number }[]): number {
  return entries.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
}

export function won(n: number): string {
  return n.toLocaleString("ko-KR");
}

/** "11,000" · "11000원" · "42만" 같은 입력을 원 단위 정수로. 빈 값·이상한 값은 0. */
export function parseWon(s: string): number {
  const t = s.replace(/[,\s원]/g, "");
  if (!t) return 0;
  const m = t.match(/^(\d+(?:\.\d+)?)만$/);
  if (m) return Math.round(Number(m[1]) * 10000);
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** 항목 요약: 이름별 수량 합, 묶음 순(탕약·약장·치료·엑스제·기타) → 수량 많은 순 */
export function itemSummary(items: { name: string; group: LedgerGroup; qty: number }[]): { name: string; group: LedgerGroup; qty: number }[] {
  const map = new Map<string, { name: string; group: LedgerGroup; qty: number }>();
  for (const i of items) {
    const key = `${i.group}:${i.name}`;
    const cur = map.get(key);
    if (cur) cur.qty += i.qty;
    else map.set(key, { name: i.name, group: i.group, qty: i.qty });
  }
  return [...map.values()].sort(
    (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || b.qty - a.qty || a.name.localeCompare(b.name),
  );
}

/** 칩 색(묶음별) */
export function chipClass(group: LedgerGroup, unknown = false): string {
  if (unknown) return "border-dashed border-red-600 text-red-700";
  if (group === "decoction") return "border-amber-600 bg-amber-50 text-amber-900";
  if (group === "cabinet") return "border-[#06478f] bg-[#f5f8fc] text-[#06366f]";
  return "border-stone-300 bg-white text-stone-700";
}

/** 줄 목록에 보여 줄 항목 글: "공진단 5" · "향사평위산 2일" · "일반 탕약 42만원 · 2회 분할" */
export function itemLabel(i: { name: string; qty: number; amount: number | null; days: number | null; split: number | null }): string {
  const parts = [i.name];
  if (i.qty > 1) parts.push(String(i.qty));
  if (i.days) parts.push(`${i.days}일`);
  if (i.amount) parts.push(`${i.amount / 10000}만원`);
  if (i.split) parts.push(`${i.split}회 분할`);
  return parts.join(" ");
}
