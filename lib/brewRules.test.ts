import { describe, it, expect } from "vitest";
import { dayCounts, defaultReceiveDay, fermentEndDay, fermentMidDays, jobLabel, planJobsFromLedger, weekDays, weekMonday } from "./brewRules";
import type { BrewJob } from "./types";

describe("주 계산", () => {
  it("월요일 찾기: 금요일 10/2 → 9/28, 일요일 10/4 → 10/5(다음 주)", () => {
    expect(weekMonday("2026-10-02")).toBe("2026-09-28");
    expect(weekMonday("2026-10-04")).toBe("2026-10-05");
    expect(weekMonday("2026-10-05")).toBe("2026-10-05");
  });
  it("월~토 여섯 날", () => {
    expect(weekDays("2026-10-05")).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"]);
  });
});

describe("발효·받는 날", () => {
  it("발효는 사흘: 목 10/8 → 토 10/10", () => expect(fermentEndDay("2026-10-08")).toBe("2026-10-10"));
  it("셋째 날이 일요일이면 월요일: 금 10/9 → 월 10/12", () => expect(fermentEndDay("2026-10-09")).toBe("2026-10-12"));
  it("받는 날 기본 = 달이는 날, 발효는 발효끝", () => {
    expect(defaultReceiveDay("2026-10-06", false)).toBe("2026-10-06");
    expect(defaultReceiveDay("2026-10-08", true)).toBe("2026-10-10");
  });
});

describe("칸 글", () => {
  const j = (p: Partial<BrewJob>): Parameters<typeof jobLabel>[0] => ({
    patient_name: "김하나", title: "보험(처방)", kind: "decoction", delivery: "pickup", region: null, split_no: null, split_of: null, status: "planned", ...p,
  });
  it("이름-종류-직", () => expect(jobLabel(j({}))).toBe("김하나-보험(처방)-직"));
  it("택배 지역·분할·끝남", () => {
    expect(jobLabel(j({ delivery: "courier", region: "안양", split_no: 1, split_of: 2, status: "done" }))).toBe("김하나-보험(처방)-#1/2-택(안양) o");
  });
  it("발효 짝은 종류 대신 발효시작/끝", () => {
    expect(jobLabel(j({ kind: "ferment_start", title: "발효 48만원", delivery: null }))).toBe("김하나-발효시작");
    expect(jobLabel(j({ kind: "ferment_end", title: "발효 48만원", delivery: "courier", region: "수원" }))).toBe("김하나-발효끝-택(수원)");
  });
  it("묶음·메모는 이름 없이", () => expect(jobLabel(j({ patient_name: "", title: "디스크 100팩", kind: "batch", delivery: null }))).toBe("디스크 100팩"));
});

describe("planJobsFromLedger", () => {
  const base = { patient_id: 1, patient_name: "김하나", day: "2026-10-08", slot: "am" as const, delivery: "courier" as const, region: "수원", pouch: "다담", staff_name: "박정희샘", prescription_id: 9, ledger_entry_id: 5 };
  it("보통 탕약은 칸 하나, 받는 날 = 달이는 날", () => {
    const r = planJobsFromLedger({ ...base, title: "보험(처방)", fermented: false, split: null });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "decoction", day: "2026-10-08", receive_day: "2026-10-08", pouch: "다담" });
  });
  it("발효는 시작·끝 짝, 끝은 +2일, 받는 날은 끝 날", () => {
    const r = planJobsFromLedger({ ...base, title: "발효 48만원", fermented: true, split: null });
    expect(r.map((x) => [x.kind, x.day])).toEqual([["ferment_start", "2026-10-08"], ["ferment_end", "2026-10-10"]]);
    expect(r[1].pairWithPrev).toBe(true);
    expect(r[1].receive_day).toBe("2026-10-10");
  });
  it("2회 분할이면 2회분은 날짜 미정", () => {
    const r = planJobsFromLedger({ ...base, title: "일반 42만원", fermented: false, split: 2 });
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ split_no: 1, split_of: 2, day: "2026-10-08" });
    expect(r[1]).toMatchObject({ split_no: 2, split_of: 2, day: null });
  });
});

describe("fermentMidDays", () => {
  it("목 발효시작 · 토 발효끝이면 금요일에 발효중", () => {
    const base = { slot: "am" as const, patient_id: null, title: "발효", delivery: null, region: null, pouch: null, split_no: null, split_of: null, memo: null, max_jobs: null, status: "planned" as const, done_at: null, done_by: null, receive_day: null, prescription_id: null, ledger_entry_id: null, sort_order: 0, staff_name: "", created_at: "", updated_at: "" };
    const jobs: BrewJob[] = [
      { ...base, id: 1, day: "2026-10-08", kind: "ferment_start", patient_name: "김하나", pair_id: 2 },
      { ...base, id: 2, day: "2026-10-10", kind: "ferment_end", patient_name: "김하나", pair_id: 1 },
    ];
    expect(fermentMidDays(jobs)).toEqual([{ day: "2026-10-09", jobId: 1, label: "김하나" }]);
  });
});

describe("dayCounts", () => {
  const mk = (kind: BrewJob["kind"], extra: Partial<BrewJob> = {}): BrewJob => ({
    id: 0, day: "2026-10-08", slot: "am", kind, patient_id: null, patient_name: "", title: "", delivery: null, region: null, pouch: null,
    split_no: null, split_of: null, memo: null, max_jobs: null, status: "planned", done_at: null, done_by: null, receive_day: null,
    prescription_id: null, ledger_entry_id: null, pair_id: null, sort_order: 0, staff_name: "", created_at: "", updated_at: "", ...extra,
  });
  it("달이기는 탕약+발효시작, 짜기는 발효끝, 묶음 따로, 한도는 요일 기준", () => {
    const r = dayCounts([mk("decoction"), mk("ferment_start"), mk("ferment_end"), mk("batch")], { weekday: 4, note: "", max_jobs: 4 });
    expect(r).toEqual({ brew: 2, press: 1, batch: 1, max: 4 });
  });
  it("메모에 한도가 있으면 그날은 그 한도(월차 → 0)", () => {
    expect(dayCounts([mk("note", { max_jobs: 0 })], { weekday: 4, note: "", max_jobs: 4 }).max).toBe(0);
  });
});
