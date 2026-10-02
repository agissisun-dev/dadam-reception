import { weekdayKo } from "./dates";
import { sumEntries, sumExpenses } from "./ledgerRules";

/** 엑셀 한 칸 값 */
export type Cell = string | number | null;

export type DayBlockInput = {
  day: string; // YYYY-MM-DD
  entries: {
    seq: number;
    kind: "normal" | "correction";
    patient_name: string;
    insurance_kind: string | null;
    cash: number;
    cash_receipt: number;
    card: number;
    note_raw: string;
    correction_reason: string | null;
    off_total?: boolean;
    pay_note?: string | null;
  }[];
  expenses: { title: string; amount: number }[];
};

/** 블록 결과: 셀 + 붉게 칠할 줄(합계에서 뺀 줄)의 인덱스 */
export type DayBlock = { rows: Cell[][]; redRows: number[] };

/** 지금 쓰는 일일장부 블록: 환자 50줄이 기본, 넘치면 늘린다 */
export const BLOCK_PATIENT_ROWS = 50;

const n = (v: number): Cell => (v === 0 ? null : v);

/**
 * 하루 블록. 엑셀 2025년 일일장부 모양 그대로:
 * 1 제목 · 2 머리글 · 3 작은 머리글 · 4~ 환자 줄(번호 1..50) · 합계 · 입금 · 잔액
 * 지출은 같은 블록 오른쪽 열(I·J)에 위에서부터 적는다.
 */
export function dayBlock(input: DayBlockInput): DayBlock {
  const [y, m, d] = input.day.split("-");
  const rows: Cell[][] = [];
  const redRows: number[] = [];
  rows.push([`* 일일매출장부 ( ${y}년 ${m}월 ${d}일) *${weekdayKo(input.day)}`, null, null, null, null, null, null, null, null, null]);
  rows.push([null, "성함", "구분", "매출", null, null, null, "기타", "지출내용", "금액"]);
  rows.push([null, null, null, "현금", "현영 ", "카드 ", "소계", null, null, null]);

  const lines = [...input.entries].sort((a, b) => a.seq - b.seq);
  const count = Math.max(BLOCK_PATIENT_ROWS, lines.length);
  for (let i = 0; i < count; i++) {
    const e = lines[i];
    const x = input.expenses[i];
    const row: Cell[] = [i + 1, null, null, null, null, null, null, null, x ? x.title : null, x ? x.amount : null];
    if (e) {
      const sub = e.cash + e.cash_receipt + e.card;
      row[1] = e.kind === "correction" ? `${e.patient_name} (정정)` : e.patient_name;
      row[2] = e.insurance_kind;
      row[3] = n(e.cash);
      row[4] = n(e.cash_receipt);
      row[5] = n(e.card);
      row[6] = e.off_total ? e.pay_note || "합계 제외" : n(sub); // 엑셀처럼 소계 칸에 "서울페이" 식으로
      row[7] = e.kind === "correction" ? `정정: ${e.correction_reason ?? ""}` : e.note_raw || null;
      if (e.off_total) redRows.push(rows.length);
    }
    rows.push(row);
  }
  // 지출이 환자 줄보다 많을 때
  for (let i = count; i < input.expenses.length; i++) {
    const x = input.expenses[i];
    rows.push([null, null, null, null, null, null, null, null, x.title, x.amount]);
  }
  const t = sumEntries(input.entries);
  rows.push(["합계", null, null, n(t.cash), n(t.cash_receipt), n(t.card), n(t.subtotal), null, "지출 합계", n(sumExpenses(input.expenses))]);
  rows.push([null, null, null, null, null, null, null, null, "입금", null]);
  rows.push([null, null, null, null, null, null, null, null, "잔액", null]);
  return { rows, redRows };
}

/** 한 달: 줄이나 지출이 있는 날만, 날짜순으로 블록을 이어 붙인다. redRows는 전체 시트 기준 인덱스. */
export function monthRows(days: DayBlockInput[]): DayBlock {
  const out: DayBlock = { rows: [], redRows: [] };
  for (const d of [...days].filter((x) => x.entries.length > 0 || x.expenses.length > 0).sort((a, b) => a.day.localeCompare(b.day))) {
    const b = dayBlock(d);
    const base = out.rows.length;
    out.rows.push(...b.rows);
    out.redRows.push(...b.redRows.map((i) => base + i));
  }
  return out;
}
