import { describe, it, expect } from "vitest";
import {
  nextWeeklyDate,
  effectiveRound,
  pickWeeklyTemplate,
  consecutiveNoReply,
  weekEndISO,
  WEEKDAYS,
} from "./weeklyRules";
import type { Template, WeeklyContact } from "./types";

describe("nextWeeklyDate", () => {
  // 2026-09-13 = 일요일, 09-15 = 화요일
  it("시작: 오늘 이후 첫 화요일 (오늘 포함)", () => {
    expect(nextWeeklyDate("2026-09-13", 2, 1, true)).toBe("2026-09-15");
    expect(nextWeeklyDate("2026-09-15", 2, 1, true)).toBe("2026-09-15");
    expect(nextWeeklyDate("2026-09-16", 2, 1, true)).toBe("2026-09-22");
  });
  it("처리 후: 예정일 + 주기×7", () => {
    expect(nextWeeklyDate("2026-09-15", 2, 1, false)).toBe("2026-09-22");
    expect(nextWeeklyDate("2026-09-15", 2, 2, false)).toBe("2026-09-29");
  });
  it("지난 예정일을 처리하면 다음은 오늘 이후로 온다", () => {
    // 예정일 9/1 을 9/13에 처리 → 9/8은 이미 지났으니 9/15
    expect(nextWeeklyDate("2026-09-01", 2, 1, false, "2026-09-13")).toBe("2026-09-15");
  });
});

describe("effectiveRound", () => {
  it("4까지, 그 이상은 4", () => {
    expect(effectiveRound(1)).toBe(1);
    expect(effectiveRound(4)).toBe(4);
    expect(effectiveRound(7)).toBe(4);
  });
});

function tpl(p: Partial<Template> & { id: number }): Template {
  return {
    kind: "weekly", name: "", title: null, body: `body${p.id}`, date_rule: null,
    condition: null, round: null, sort_order: 0, created_at: "", updated_at: "",
    ...p,
  };
}

describe("pickWeeklyTemplate", () => {
  const list = [
    tpl({ id: 1, condition: "digestive", round: 1 }),
    tpl({ id: 2, condition: "digestive", round: 2 }),
    tpl({ id: 3, condition: null, round: null }),
  ];
  it("질환·회차 일치", () => {
    expect(pickWeeklyTemplate(list, "digestive", 2)?.id).toBe(2);
  });
  it("회차 5는 4로 캡, 없으면 공통", () => {
    expect(pickWeeklyTemplate(list, "digestive", 5)?.id).toBe(3);
    expect(pickWeeklyTemplate(list, "skin", 1)?.id).toBe(3);
  });
  it("아무것도 없으면 null", () => {
    expect(pickWeeklyTemplate([], "skin", 1)).toBeNull();
  });
});

function wc(p: Partial<WeeklyContact> & { id: number; action: WeeklyContact["action"] }): WeeklyContact {
  return {
    patient_id: 1, round: 1, planned_date: "2026-09-01", message: null, patient_reply: null,
    reply_status: "none", doctor_note: null, staff_name: "x", created_at: `2026-09-${String(p.id).padStart(2, "0")}`,
    ...p,
  };
}

describe("consecutiveNoReply", () => {
  it("최근부터 연속 no_reply 수 (내림차순 입력)", () => {
    const desc = [wc({ id: 5, action: "no_reply" }), wc({ id: 4, action: "no_reply" }), wc({ id: 3, action: "sent" }), wc({ id: 2, action: "no_reply" })];
    expect(consecutiveNoReply(desc)).toBe(2);
  });
  it("최근이 sent면 0", () => {
    expect(consecutiveNoReply([wc({ id: 2, action: "sent" }), wc({ id: 1, action: "no_reply" })])).toBe(0);
  });
});

describe("weekEndISO / WEEKDAYS", () => {
  it("이번 주 일요일", () => {
    expect(weekEndISO("2026-09-15")).toBe("2026-09-20"); // 화 → 일
    expect(weekEndISO("2026-09-20")).toBe("2026-09-20"); // 일 → 오늘
  });
  it("요일 이름", () => {
    expect(WEEKDAYS[2]).toBe("화");
  });
});
