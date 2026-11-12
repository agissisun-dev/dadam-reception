import { describe, it, expect } from "vitest";
import {
  DEFAULT_RECONTACT_SETTINGS,
  defaultRecontactSettings,
  contactBlockReason,
  EMPTY_CONTEXT,
  blockReason,
  bodyKindFor,
  factLine,
  fillRecontact,
  firstText,
  herbWord,
  monthWord,
  needsCall,
  parseImportTable,
  quickRepliesFor,
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
    expect(firstText({ ...base, draft_text: "직접 쓴 글", variant: "A", segment: "due_now" }, S, TODAY)).toBe("직접 쓴 글");
    expect(firstText({ ...base, draft_text: null, variant: "A", segment: "due_now" }, S, TODAY)).toContain("9월에 지어 가신 보험 한약");
    expect(firstText({ ...base, draft_text: " ", variant: "B", segment: "due_soon" }, S, TODAY)).toContain("번호만 답 주셔도 됩니다. 1 많이 좋아졌어요 / 2 비슷해요 / 3 다시 불편해요");
  });
  it("첫 문자에는 택배·재주문 이야기가 없고, 두 번째 문자에만 있다", () => {
    for (const v of ["A", "B"] as const) {
      for (const segment of ["due_now", "vip", "once_p1"] as const) {
        const t = firstText({ ...base, draft_text: null, variant: v, segment }, S, TODAY);
        expect(t).not.toMatch(/택배|재주문|할인|이벤트/);
      }
    }
    expect(replyText({ ...base, doctor_reply: "한 달 더 드시면 좋겠다고 하세요." }, S, TODAY)).toContain("한 달 더 드시면 좋겠다고 하세요. 내원해서");
  });
});

describe("묶음마다 다른 첫 문자", () => {
  it("지금·곧은 A·B, 단골은 오래 찾아 주신 것부터, 한 번 드신 분은 이유를 묻는 번호 답", () => {
    expect(bodyKindFor("due_soon")).toBe("ab");
    expect(bodyKindFor("lapsed")).toBe("vip");
    expect(bodyKindFor("once_p2")).toBe("once");
    expect(firstText({ ...base, draft_text: null, variant: "B", segment: "vip" }, S, TODAY)).toContain("오래 믿고 찾아 주셨는데 9월 이후로");
    expect(firstText({ ...base, draft_text: null, variant: "A", segment: "once_p1" }, S, TODAY)).toContain("3 별 차이를 못 느꼈어요");
    expect(quickRepliesFor("once_p1")[1]).toBe("2 나아지다 말았어요");
    expect(quickRepliesFor("due_now")[2]).toBe("3 다시 불편해요");
  });
});

describe("오늘 보낼 사람", () => {
  const row = (id: number, p: Partial<{ patient_id: number | null; status: "todo" | "sent"; segment: "due_now" | "due_soon" | "vip"; last_herb_date: string; sent_at: string | null }> = {}) => ({
    id, clinic: "S" as const, patient: { id, clinic: "S" as const, phone: "01012345678", excluded_at: null as string | null }, patient_id: id as number | null, status: "todo" as "todo" | "sent", segment: "due_now" as "due_now" | "due_soon" | "vip", last_herb_date: "2026-09-01", sent_at: null as string | null, ...p,
  });
  const ctx = (p: Partial<RecontactContext>): RecontactContext => ({ ...EMPTY_CONTEXT, ...p });

  it("빠지는 이유: 연락처 없음·연락 제외·예약 있음·최근 한약 처방·해피콜 예정", () => {
    expect(blockReason(row(1, { patient_id: null }), EMPTY_CONTEXT)).toBe("연락처가 아직 없습니다.");
    expect(blockReason(row(1), ctx({ excluded: new Set([1]) }))).toBe("연락 제외 환자입니다.");
    expect(blockReason(row(1), ctx({ booked: new Set([1]) }))).toBe("예약이 잡혀 있습니다.");
    expect(blockReason(row(1), ctx({ visited: new Set([1]) }))).toBe("최근 2주 안에 한약 처방 기록이 있습니다.");
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
  it("최근 내원 빼기 메모도 후보로 보존하고, 묶음 칸이 없으면 고른 묶음으로", () => {
    const r = parseImportTable([["이름", "연락처", "메모"], ["가", "01011112222", "빼기 — 지난주 내원"], ["나", "0101111", ""]], "vip");
    expect(r.skipped).toBe(0);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1]).toMatchObject({ patient_name: "나", phone: null, segment: "vip" });
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


describe("연락 안전 회귀", () => {
  const patient = { id: 1, clinic: "S" as const, phone: "01012345678", excluded_at: null as string | null };
  const r = { id: 1, clinic: "S" as const, patient_id: 1, patient, status: "todo" as const, segment: "vip" as const, last_herb_date: null, sent_at: null as string | null };
  it("조회되지 않은 환자·다른 지점·잘못 연결된 ID·번호는 모두 차단한다", () => {
    expect(blockReason({ ...r, patient: null }, EMPTY_CONTEXT)).not.toBeNull();
    expect(blockReason({ ...r, patient: { ...patient, clinic: "N" } }, EMPTY_CONTEXT)).not.toBeNull();
    expect(blockReason({ ...r, patient: { ...patient, id: 2 } }, EMPTY_CONTEXT)).not.toBeNull();
    for (const phone of ["", "010123", "00000000000", "0212345678"]) {
      expect(blockReason({ ...r, patient: { ...patient, phone } }, EMPTY_CONTEXT)).not.toBeNull();
    }
    expect(blockReason(r, null)).not.toBeNull();
    expect(todaysBatch([r], null, 20, TODAY).batch).toEqual([]);
  });
  it("답이 왔거나 보낸 분도 수신거부와 번호 확인을 생략하지 않는다", () => {
    expect(contactBlockReason({ ...r, status: "replied", patient: { ...patient, excluded_at: "2026-11-11" } }, EMPTY_CONTEXT)).toBe("연락 제외 환자입니다.");
    expect(contactBlockReason({ ...r, status: "sent", patient: { ...patient, phone: "123" } }, EMPTY_CONTEXT)).not.toBeNull();
  });
  it("오늘 이미 보낸 모든 행이 하루20 상한을 차감하며 다시 올려도 중복 연락하지 않는다", () => {
    const sent = Array.from({ length: 19 }, (_, i) => ({ ...r, id: i + 10, status: "sent" as const, sent_at: "2026-11-11T01:00:00Z" }));
    const result = todaysBatch([...sent, r, { ...r, id: 2 }], EMPTY_CONTEXT, 20, TODAY);
    expect(result.batch).toHaveLength(1);
    expect(result.left).toBe(1);
    expect(result.waiting).toBe(1);
    expect(todaysBatch([{ ...r, sent_at: "2026-11-11T01:00:00Z" }], EMPTY_CONTEXT, 20, TODAY).batch).toEqual([]);
  });
  it("검증된 지점 이름과 기본 하루20, N 호환 기본값", () => {
    expect(defaultRecontactSettings("N")).toEqual(DEFAULT_RECONTACT_SETTINGS);
    expect(defaultRecontactSettings("S").daily_cap).toBe(20);
    expect(defaultRecontactSettings("S").body_a).toContain("다담에스한의원");
    expect(defaultRecontactSettings("S").body_a).not.toContain("노원다담");
    expect(defaultRecontactSettings("N").body_a).toContain("노원다담한의원");
  });
  it("검토63명 양식: 미확인 구매횟수와 추정 수납일은 확정 구매로 승격하지 않는다", () => {
    const headers = ["환자 이름", "휴대전화", "실제 탕약 구매횟수", "유력 수납일(추정)", "당시 불편했던 증상", "받은 탕약/치료", "원장님이 궁금한 점", "메모"];
    const imported = parseImportTable([headers, ...Array.from({ length: 63 }, (_, i) => ["동명이인", "01012345678", i === 0 ? "2" : "미확인", "2026-10-01", "속쓰림", "탕약", "밤 속쓰림은 줄었나요?", "최근 내원 빼기 메모"])], "vip");
    expect(imported.rows).toHaveLength(63);
    expect(imported.rows[0]).toMatchObject({ patient_name: "동명이인", phone: "01012345678", herb_count: 2, last_herb_date: null });
    expect(imported.rows[1].herb_count).toBeNull();
    expect(imported.rows[1].doctor_note).toBe("당시 증상: 속쓰림\n받은 탕약/치료: 탕약\n밤 속쓰림은 줄었나요?");
    expect(imported.skipped).toBe(0);
  });
  it("명시적 마지막 한약 구매일만 실제 구매일로 읽는다", () => {
    const result = parseImportTable([["환자 이름", "마지막 수납일(추정)", "마지막 한약 구매일", "실제 탕약 구매횟수"], ["가", "2026-10-02", "2026-09-18", "확인 필요"]], "vip");
    expect(result.rows[0].last_herb_date).toBe("2026-09-18");
    expect(result.rows[0].herb_count).toBeNull();
  });
});
