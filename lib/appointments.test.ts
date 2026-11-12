import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSettings, saveSettings } from "./appointments";
import { defaultNotifyBody, LEGACY_NOTIFY_BODY } from "./appointmentRules";

const mocks = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  clinic: "N" as "S" | "N",
  upsert: vi.fn(async () => ({ error: null })),
}));
vi.mock("./clinic", () => ({ fetchCurrentClinic: async () => mocks.clinic }));
vi.mock("./supabaseClient", () => ({ getSupabase: () => ({ from: () => ({
  select: () => ({ maybeSingle: async () => ({ data: mocks.row, error: null }) }),
  upsert: mocks.upsert,
}) }) }));

beforeEach(() => { mocks.row = null; mocks.clinic = "N"; mocks.upsert.mockClear(); });

describe("예약 설정의 병원별 기본 문구", () => {
  it("행이 없으면 로그인 병원 N과 꺼진 자동 문자를 반환", async () => {
    expect(await getSettings()).toMatchObject({ clinic: "N", notify_body: defaultNotifyBody("N"), auto_notify: false, remind_enabled: false });
  });
  it("예전 DB 기본 문구만 갱신하고 사용자 문구는 보존", async () => {
    mocks.row = { clinic: "S", notify_body: LEGACY_NOTIFY_BODY, auto_notify: true };
    expect(await getSettings()).toMatchObject({ clinic: "S", notify_body: defaultNotifyBody("S"), auto_notify: true });
    mocks.row = { clinic: "N", notify_body: "직접 쓴 {이름}님 문구" };
    expect((await getSettings()).notify_body).toBe("직접 쓴 {이름}님 문구");
  });
  it("문구만 저장할 때 샘플이 아닌 자리표와 기존 자동문자 상태 저장", async () => {
    mocks.row = { clinic: "N", notify_body: LEGACY_NOTIFY_BODY, auto_notify: false, remind_enabled: false };
    await saveSettings({ notify_body: defaultNotifyBody("N") });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ clinic: "N", notify_body: defaultNotifyBody("N"), auto_notify: false, remind_enabled: false }));
  });
});
