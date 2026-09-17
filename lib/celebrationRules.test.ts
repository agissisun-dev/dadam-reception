import { describe, it, expect } from "vitest";
import { CELEBRATION_MESSAGES, pickMessage, shouldCelebrate } from "./celebrationRules";

describe("shouldCelebrate", () => {
  const today = "2026-09-17";
  it("오늘 일이 있었고 지금 0이고 아직 안 띄웠으면 띄운다", () => {
    expect(shouldCelebrate({ today, openNow: 0, lastSeenOpen: 3, celebratedOn: null })).toBe(true);
    expect(shouldCelebrate({ today, openNow: 0, lastSeenOpen: 1, celebratedOn: "2026-09-16" })).toBe(true);
  });
  it("남은 일이 있으면 안 띄운다", () => {
    expect(shouldCelebrate({ today, openNow: 2, lastSeenOpen: 3, celebratedOn: null })).toBe(false);
  });
  it("아무 일도 없던 날(처음 봤을 때 이미 0)은 안 띄운다", () => {
    expect(shouldCelebrate({ today, openNow: 0, lastSeenOpen: null, celebratedOn: null })).toBe(false);
    expect(shouldCelebrate({ today, openNow: 0, lastSeenOpen: 0, celebratedOn: null })).toBe(false);
  });
  it("오늘 이미 띄웠으면 다시 안 띄운다", () => {
    expect(shouldCelebrate({ today, openNow: 0, lastSeenOpen: 3, celebratedOn: today })).toBe(false);
  });
});

describe("pickMessage", () => {
  it("같은 날은 같은 문구, 목록 안의 문구", () => {
    const a = pickMessage("2026-09-17");
    expect(a).toBe(pickMessage("2026-09-17"));
    expect(CELEBRATION_MESSAGES).toContain(a);
  });
});
