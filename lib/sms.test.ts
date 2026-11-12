import { describe, expect, it, vi } from "vitest";
vi.mock("./supabaseClient", () => ({ getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "fake" } } }) } }) }));
import { recordAcceptedSms, sendSms, SmsOutcomeUnknown } from "./sms";

describe("manual send outcome safety (all transports mocked)", () => {
  it("records only after provider acceptance", async () => {
    const order: string[] = [];
    const r = await recordAcceptedSms(async () => { order.push("accepted"); return { accepted: true, type: "SMS" }; }, async () => { order.push("record"); });
    expect(order).toEqual(["accepted", "record"]);
    expect(r.accepted).toBe(true);
  });
  it("does not write a success audit on send failure", async () => {
    const record = vi.fn();
    await expect(recordAcceptedSms(async () => { throw new Error("refused"); }, record)).rejects.toThrow("refused");
    expect(record).not.toHaveBeenCalled();
  });
  it("record failure remains accepted with a no-resend warning", async () => {
    const send = vi.fn(async () => ({ accepted: true as const, type: "LMS" as const }));
    const r = await recordAcceptedSms(send, async () => { throw new Error("db failed"); });
    expect(r.accepted).toBe(true);
    expect(r.warning).toContain("중복 발송하지");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("treats a lost API response as uncertain and never retries", async () => {
    const fake = vi.fn().mockRejectedValue(new Error("lost response"));
    vi.stubGlobal("fetch", fake);
    try {
      await expect(sendSms("01011112222", "a", { appointmentId: 1, staff: "test" })).rejects.toBeInstanceOf(SmsOutcomeUnknown);
      expect(fake).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });
});
