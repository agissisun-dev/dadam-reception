import { describe, it, expect } from "vitest";
import { dayBlock, monthRows, BLOCK_PATIENT_ROWS } from "./ledgerExportRules";

const entry = (seq: number, extra: Partial<Parameters<typeof dayBlock>[0]["entries"][number]> = {}) => ({
  seq, kind: "normal" as const, patient_name: `환자${seq}`, insurance_kind: seq === 1 ? "1종" : null,
  cash: seq === 1 ? 11000 : 0, cash_receipt: 0, card: seq === 2 ? 24000 : 0, note_raw: "전,습", correction_reason: null, ...extra,
});

describe("dayBlock — 일일장부 모양", () => {
  const rows = dayBlock({ day: "2026-10-02", entries: [entry(2), entry(1)], expenses: [{ title: "시재", amount: 11600 }] });
  it("56줄: 제목·머리글 2줄·환자 50줄·합계·입금·잔액", () => {
    expect(rows).toHaveLength(3 + BLOCK_PATIENT_ROWS + 3);
    expect(rows[0][0]).toBe("* 일일매출장부 ( 2026년 10월 02일) *금");
    expect(rows[1]).toEqual([null, "성함", "구분", "매출", null, null, null, "기타", "지출내용", "금액"]);
    expect(rows[2][3]).toBe("현금");
  });
  it("환자 줄은 번호 순, 비는 칸은 null, 소계는 세 칸 합", () => {
    expect(rows[3]).toEqual([1, "환자1", "1종", 11000, null, null, 11000, "전,습", "시재", 11600]);
    expect(rows[4]).toEqual([2, "환자2", null, null, null, 24000, 24000, "전,습", null, null]);
    expect(rows[5][0]).toBe(3);
    expect(rows[5][1]).toBeNull();
  });
  it("합계 줄", () => {
    const total = rows[3 + BLOCK_PATIENT_ROWS];
    expect(total[0]).toBe("합계");
    expect(total.slice(3, 7)).toEqual([11000, null, 24000, 35000]);
    expect(total[8]).toBe("지출 합계");
    expect(total[9]).toBe(11600);
  });
  it("정정 줄은 이름에 (정정), 기타에 사유", () => {
    const r = dayBlock({ day: "2026-10-02", entries: [entry(1, { kind: "correction", cash: -11000, card: 11000, correction_reason: "카드였음" })], expenses: [] });
    expect(r[3][1]).toBe("환자1 (정정)");
    expect(r[3][7]).toBe("정정: 카드였음");
  });
  it("51줄이면 블록이 한 줄 늘어난다", () => {
    const many = Array.from({ length: 51 }, (_, i) => entry(i + 1));
    expect(dayBlock({ day: "2026-10-02", entries: many, expenses: [] })).toHaveLength(3 + 51 + 3);
  });
});

describe("monthRows", () => {
  it("줄이 있는 날만 날짜순으로 이어 붙인다", () => {
    const rows = monthRows([
      { day: "2026-10-05", entries: [entry(1)], expenses: [] },
      { day: "2026-10-03", entries: [], expenses: [] },
      { day: "2026-10-01", entries: [], expenses: [{ title: "간식", amount: 5000 }] },
    ]);
    expect(rows).toHaveLength(56 * 2);
    expect(rows[0][0]).toContain("10월 01일");
    expect(rows[56][0]).toContain("10월 05일");
  });
});
