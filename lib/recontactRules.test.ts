import { describe, it, expect } from "vitest";
import {
  DEFAULT_RECONTACT_SETTINGS,
  EMPTY_CONTEXT,
  blockReason,
  factLine,
  fillRecontact,
  firstText,
  herbWord,
  monthWord,
  needsCall,
  parseImportTable,
  replyText,
  sendWindow,
  sentToday,
  shouldRest,
  todaysBatch,
  type RecontactContext,
} from "./recontactRules";

const TODAY = "2026-11-11";
const S = DEFAULT_RECONTACT_SETTINGS;
const base = { patient_name: "홍길동", last_herb_date: "2026-09-18", herb_kind: "보험 탕약", doctor_note: null as string | null, doctor_reply: null as string | null };

describe("문구 채우기", () => {
  it("달: 올해·작년·그 전", () => {
    expect(monthWord("2026-09-18", TODAY)).toBe("9월");
    expect(monthWord("2025-12-02", TODAY)).toBe("작년 12월");
    expect(monthWord("2024-03-02", TODAY)).toBe("2024년 3월");
    expect(monthWord(null, TODAY)).toBe("지난번");
  });
  it("약: 보험·발효·공진단·그 밖", () => {
    expect(herbWord("보험 탕약")).toBe("보험 한약");
    expect(herbWord("발효 탕약")).toBe("발효 한약");
    expect(herbWord("공진단")).toBe("공진단");
    expect(herbWord("한약(추정) ?")).toBe("한약");
    expect(herbWord(null)).toBe("한약");
  });
  it("원장님 칸이 있으면 그 한 줄, 없으면 기본 질문", () => {
    expect(fillRecontact("{이름}님, {월} {약}. {원장한줄}", { ...base, doctor_note: "밤에 신물 올라오는 건 줄었는지요?" }, TODAY)).toBe("홍길동님, 9월 보험 한약. 밤에 신물 올라오는 건 줄었는지요?");
    expect(fillRecontact("{원장한줄}", base, TODAY)).toBe("요즘 몸은 좀 어떠세요?");
  });
  it("첫 문자: 샘이 고친 글이 먼저, 없으면 A·B 틀", () => {
    expect(firstText({ ...base, draft_text: "직접 쓴 글", variant: "A" }, S, TODAY)).toBe("직접 쓴 글");
    expect(firstText({ ...base, draft_text: null, variant: "A" }, S, TODAY)).toContain("9월에 지어 가신 보험 한약");
    expect(firstText({ ...base, draft_text: " ", variant: "B" }, S, TODAY)).toContain("편하실 때 답 주세요.");
  });
  it("첫 문자에는 택배·재주문 이야기가 없고, 두 번째 문자에만 있다", () => {
    for (const v of ["A", "B"] as const) {
      const t = firstText({ ...base, draft_text: null, variant: v }, S, TODAY);
      expect(t).not.toMatch(/택배|재주문|할인|이벤트/);
    }
    expect(replyText({ ...base, doctor_reply: "한 달 더 드시면 좋겠다고 하세요." }, S, TODAY)).toContain("한 달 더 드시면 좋겠다고 하세요. 내원해서");
  });
});

describe("오늘 보낼 사람", () => {
  const row = (id: number, p: Partial<{ patient_id: number | null; status: "todo" | "sent"; segment: "due_now" | "due_soon" | "vip"; last_herb_date: string; sent_at: string | null }> = {}) => ({
    id, patient_id: id as number | null, status: "todo" as "todo" | "sent", segment: "due_now" as "due_now" | "due_soon" | "vip", last_herb_date: "2026-09-01", sent_at: null as string | null, ...p,
  });
  const ctx = (p: Partial<RecontactContext>): RecontactContext => ({ ...EMPTY_CONTEXT, ...p });

  it("빠지는 이유: 연락처 없음·연락 제외·예약 있음·최근 내원·해피콜 예정", () => {
    expect(blockReason(row(1, { patient_id: null }), EMPTY_CONTEXT)).toBe("연락처가 아직 없습니다.");
    expect(blockReason(row(1), ctx({ excluded: new Set([1]) }))).toBe("연락 제외 환자입니다.");
    expect(blockReason(row(1), ctx({ booked: new Set([1]) }))).toBe("예약이 잡혀 있습니다.");
    expect(blockReason(row(1), ctx({ visited: new Set([1]) }))).toBe("최근 2주 안에 내원하셨습니다.");
    expect(blockReason(row(1), ctx({ happyCall: new Set([1]) }))).toBe("해피콜이 예정되어 있습니다.");
    expect(blockReason(row(1), EMPTY_CONTEXT)).toBeNull();
    expect(blockReason(row(1, { status: "sent" }), EMPTY_CONTEXT)).not.toBeNull();
  });
  it("묶음 순(지금 → 곧 → VIP), 같은 묶음은 최근 구매 먼저, 하루 상한까지만", () => {
    const rows = [row(1, { segment: "vip" }), row(2, { segment: "due_soon" }), row(3, { last_herb_date: "2026-08-01" }), row(4, { last_herb_date: "2026-10-01" }), row(5, { patient_id: null })];
    const r = todaysBatch(rows, EMPTY_CONTEXT, 3, TODAY);
    expect(r.batch.map((x) => x.id)).toEqual([4, 3, 2]);
    expect(r.waiting).toBe(1);
  });
  it("오늘 이미 보낸 수만큼 줄어든다 (한국 시간 기준)", () => {
    const rows = [row(1), row(2), row(9, { status: "sent", sent_at: "2026-11-11T01:00:00Z" }), row(8, { status: "sent", sent_at: "2026-11-10T01:00:00Z" })];
    expect(sentToday(rows, TODAY)).toBe(1);
    expect(todaysBatch(rows, EMPTY_CONTEXT, 2, TODAY).batch).toHaveLength(1);
    expect(todaysBatch(rows, EMPTY_CONTEXT, 1, TODAY)).toMatchObject({ batch: [], waiting: 2, left: 0 });
  });
});

describe("답 기다리기", () => {
  const sent = { status: "sent" as const, sent_at: "2026-11-08T01:00:00Z", call_target: true, called_at: null as string | null, attempts: 1 };
  it("사흘 지나도 답이 없는 전화 대상만 전화 명단으로", () => {
    expect(needsCall(sent, TODAY)).toBe(true);
    expect(needsCall({ ...sent, sent_at: "2026-11-10T01:00:00Z" }, TODAY)).toBe(false);
    expect(needsCall({ ...sent, call_target: false }, TODAY)).toBe(false);
    expect(needsCall({ ...sent, called_at: "2026-11-11T02:00:00Z" }, TODAY)).toBe(false);
  });
  it("쉬게 할 분: 전화까지 했는데 일주일, 문자만 보내는 묶음은 2주", () => {
    expect(shouldRest({ ...sent, sent_at: "2026-11-01T01:00:00Z", called_at: "2026-11-04T01:00:00Z" }, TODAY)).toBe(true);
    expect(shouldRest({ ...sent, sent_at: "2026-11-01T01:00:00Z" }, TODAY)).toBe(false);
    expect(shouldRest({ ...sent, call_target: false, sent_at: "2026-10-28T01:00:00Z" }, TODAY)).toBe(true);
  });
});

describe("보내는 시간", () => {
  it("아침 9시~밤 9시, 일요일·공휴일 아님 (한국 시간)", () => {
    expect(sendWindow(new Date("2026-11-11T05:00:00Z")).ok).toBe(true); // 수 14시
    expect(sendWindow(new Date("2026-11-11T13:00:00Z")).ok).toBe(false); // 수 22시
    expect(sendWindow(new Date("2026-11-10T23:00:00Z")).ok).toBe(false); // 수 08시
    expect(sendWindow(new Date("2026-11-15T05:00:00Z")).ok).toBe(false); // 일요일
  });
});

describe("엑셀 명단 읽기", () => {
  const head = ["묶음", "이름", "연락처 (채우기)", "생년 (동명이인 확인, 채우기)", "한약 횟수", "마지막 한약", "지난 일수", "평균 간격(일)", "종류(최근)", "구분", "마지막 내원(장부)", "VIP", "차트의 마지막 내원 (채우기)", "원장님 칸: 무엇을 물을지 한 줄 (채우기)", "메모"];
  it("머리글로 칸을 찾고, 묶음·연락처·원장님 칸을 읽는다", () => {
    const r = parseImportTable(
      [head, ["지금", "홍길동", "010-1234-5678", "1970", "5", "2026-09-18", "54", "33", "보험 탕약", "", "2026-09-18", "VIP", "", "밤에 신물 올라오는 건 줄었는지요?", ""], ["곧", "김영희", "", "", "2", "2026-10-20", "22", "40", "발효 탕약", "", "", "", "", "", ""]],
      "vip",
    );
    expect(r.problem).toBeNull();
    expect(r.rows[0]).toMatchObject({ patient_name: "홍길동", phone: "01012345678", birth_hint: "1970", segment: "due_now", call_target: true, herb_count: 5, last_herb_date: "2026-09-18", avg_interval_days: 33, herb_kind: "보험 탕약", doctor_note: "밤에 신물 올라오는 건 줄었는지요?", variant: "A" });
    expect(r.rows[1]).toMatchObject({ patient_name: "김영희", phone: null, segment: "due_soon", variant: "B" });
  });
  it("메모에 '빼기'가 있으면 건너뛰고, 묶음 칸이 없으면 고른 묶음으로", () => {
    const r = parseImportTable([["이름", "연락처", "메모"], ["가", "01011112222", "빼기 — 지난주 내원"], ["나", "0101111", ""]], "vip");
    expect(r.skipped).toBe(1);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ patient_name: "나", phone: null, segment: "vip" });
  });
  it("이름 칸이 없으면 이유를 돌려준다", () => {
    expect(parseImportTable([["다담S 한약 재구매 연락 대상 정리"], ["만든 날", "2026-11-06"]], "vip").problem).toContain("이름");
  });
});

describe("요약 한 줄", () => {
  it("있는 것만 잇는다", () => {
    expect(factLine({ herb_count: 5, last_herb_date: "2026-09-18", avg_interval_days: 33, herb_kind: "보험 탕약" }, TODAY)).toBe("한약 5회 · 마지막 2026-09-18(54일 전) · 평균 간격 33일 · 보험 탕약");
    expect(factLine({ herb_count: null, last_herb_date: null, avg_interval_days: null, herb_kind: null }, TODAY)).toBe("");
  });
});
