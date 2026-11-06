import { describe, it, expect } from "vitest";
import { isMobile, kstToday, remindTargets, shouldAutoNotify } from "./appointmentNotifyRules";

const base = { source: "desk", phone: "010-1234-5678", status: "booked", notified_at: null as string | null };

describe("shouldAutoNotify", () => {
  it("설정이 켜져 있고 접수실이 잡은 휴대폰 예약이면 보낸다", () => {
    expect(shouldAutoNotify(base, { auto_notify: true })).toBe(true);
    expect(shouldAutoNotify({ ...base, source: "ledger" }, { auto_notify: true })).toBe(true);
    expect(shouldAutoNotify({ ...base, source: "happycall" }, { auto_notify: true })).toBe(true);
  });
  it("설정이 꺼져 있으면 안 보낸다", () => {
    expect(shouldAutoNotify(base, { auto_notify: false })).toBe(false);
  });
  it("네이버 예약·번호 없음·일반전화·이미 안내함·취소는 안 보낸다", () => {
    expect(shouldAutoNotify({ ...base, source: "naver" }, { auto_notify: true })).toBe(false);
    expect(shouldAutoNotify({ ...base, phone: null }, { auto_notify: true })).toBe(false);
    expect(shouldAutoNotify({ ...base, phone: "02-123-4567" }, { auto_notify: true })).toBe(false);
    expect(shouldAutoNotify({ ...base, notified_at: "2026-11-06T01:00:00Z" }, { auto_notify: true })).toBe(false);
    expect(shouldAutoNotify({ ...base, status: "cancelled" }, { auto_notify: true })).toBe(false);
  });
});

describe("remindTargets", () => {
  const row = (p: Partial<{ day: string; status: string; phone: string | null; remind_sent_at: string | null }>) => ({
    day: "2026-11-07", status: "booked", phone: "01012345678", remind_sent_at: null, ...p,
  });
  it("내일 예약 중 번호 있고 아직 안 보낸 것만. 네이버 예약도 포함", () => {
    const list = [
      row({}),
      row({ day: "2026-11-08" }),
      row({ status: "cancelled" }),
      row({ phone: null }),
      row({ remind_sent_at: "2026-11-06T08:00:00Z" }),
      row({ phone: "0212345678" }),
    ];
    expect(remindTargets(list, "2026-11-07")).toEqual([list[0]]);
  });
});

describe("isMobile / kstToday", () => {
  it("휴대폰 판정", () => {
    expect(isMobile("010-1234-5678")).toBe(true);
    expect(isMobile("0212345678")).toBe(false);
    expect(isMobile("")).toBe(false);
  });
  it("UTC 밤 8시는 한국 다음날 새벽 5시", () => {
    expect(kstToday(Date.UTC(2026, 10, 6, 20, 0, 0))).toBe("2026-11-07");
    expect(kstToday(Date.UTC(2026, 10, 6, 8, 0, 0))).toBe("2026-11-06");
  });
});
