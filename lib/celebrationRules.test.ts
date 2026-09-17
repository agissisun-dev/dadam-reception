import { describe, it, expect } from "vitest";
import { CELEBRATION_MESSAGES, pickMessage, shouldCelebrate } from "./celebrationRules";

describe("shouldCelebrate", () => {
  it("직전에 일이 있었고 지금 0이면 띄운다", () => {
    expect(shouldCelebrate({ openNow: 0, lastSeenOpen: 3 })).toBe(true);
    expect(shouldCelebrate({ openNow: 0, lastSeenOpen: 1 })).toBe(true);
  });
  it("남은 일이 있으면 안 띄운다", () => {
    expect(shouldCelebrate({ openNow: 2, lastSeenOpen: 3 })).toBe(false);
  });
  it("아무 일도 없던 날(처음 봤을 때 이미 0)은 안 띄운다", () => {
    expect(shouldCelebrate({ openNow: 0, lastSeenOpen: null })).toBe(false);
    expect(shouldCelebrate({ openNow: 0, lastSeenOpen: 0 })).toBe(false);
  });
  it("띄운 뒤 0으로 되돌려 두면 새로고침에는 안 뜨고, 일이 다시 생겼다 0이 되면 또 뜬다", () => {
    expect(shouldCelebrate({ openNow: 0, lastSeenOpen: 0 })).toBe(false); // 띄운 직후 새로고침
    expect(shouldCelebrate({ openNow: 1, lastSeenOpen: 0 })).toBe(false); // 완료 취소로 다시 1
    expect(shouldCelebrate({ openNow: 0, lastSeenOpen: 1 })).toBe(true); // 다시 완료
  });
});

describe("pickMessage", () => {
  it("같은 날은 같은 문구, 목록 안의 문구", () => {
    const a = pickMessage("2026-09-17");
    expect(a).toBe(pickMessage("2026-09-17"));
    expect(CELEBRATION_MESSAGES).toContain(a);
  });
});
