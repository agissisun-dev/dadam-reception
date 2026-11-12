import { describe, expect, it, vi } from "vitest";
import { smsConfig, solapiSend, writeSmsLog, resolveRecipient } from "./smsServer";

const shared = { SOLAPI_API_KEY: "fake-key", SOLAPI_API_SECRET: "fake-secret", SMS_SENDER_NUMBER: "01000000000" };
describe("clinic sender isolation", () => {
  it("never defaults a clinic or accepts the old shared sender", () => {
    expect(smsConfig(undefined, shared)).toBeNull();
    expect(smsConfig("S", shared)).toBeNull();
    expect(smsConfig("N", { ...shared, SMS_SENDER_NUMBER_S: "0212345678" })).toBeNull();
  });
  it("shared keys require an explicit sender for the current clinic", () => {
    expect(smsConfig("S", { ...shared, SMS_SENDER_NUMBER_S: "02-1234-5678" })?.from).toBe("0212345678");
    expect(smsConfig("N", { ...shared, SMS_SENDER_NUMBER_N: "01011112222" })?.from).toBe("01011112222");
  });
  it("does not mix partial clinic-specific key pairs with shared credentials", () => {
    expect(smsConfig("N", { ...shared, SMS_SENDER_NUMBER_N: "0212345678", SOLAPI_API_KEY_N: "own" })).toBeNull();
    expect(smsConfig("N", { ...shared, SMS_SENDER_NUMBER_N: "0212345678", SOLAPI_API_KEY_N: "own", SOLAPI_API_SECRET_N: "pair" })?.apiKey).toBe("own");
  });
  it("rejects malformed sender configuration", () => {
    expect(smsConfig("S", { ...shared, SMS_SENDER_NUMBER_S: "123" })).toBeNull();
  });
});
describe("provider acceptance and audit failures (mocked, never live)", () => {
  it("returns uncertain outcome on network failure without retrying", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const r = await solapiSend({ apiKey: "fake", apiSecret: "fake", from: "0212345678" }, { to: "01011112222", text: "a", type: "SMS" });
      expect(r).toMatchObject({ ok: false, unknown: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });
  it("reports a returned Supabase audit error, not just thrown errors", async () => {
    const sb = { from: () => ({ insert: async () => ({ error: { message: "offline" } }) }) };
    expect(await writeSmsLog(sb as never, {} as never)).toBe(false);
  });
});

function recipientFixture(rows: Record<string, unknown>) {
 return { from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rows[table] ?? null, error: null }) }) }) }) } as never;
}
describe("fresh recipient opt-out checks", () => {
 const patient = { id: 7, name: "가상환자", phone: "01011112222", family_phone: null, family_note: null, excluded_at: "2026-11-12T00:00:00Z" };
 it("blocks an excluded registered patient", async () => { expect((await resolveRecipient(recipientFixture({patients:patient}), {to:patient.phone,patientId:7,appointmentId:0})).ok).toBe(false); });
 it("blocks excluded patients even when the appointment phone matches", async () => { const a={id:1,patient_id:7,patient_name:patient.name,phone:patient.phone}; expect((await resolveRecipient(recipientFixture({patients:patient,appointments:a}), {to:patient.phone,patientId:7,appointmentId:1})).ok).toBe(false); });
 it("fails closed when a linked patient is hidden or missing", async () => { const a={id:1,patient_id:7,patient_name:patient.name,phone:patient.phone}; expect((await resolveRecipient(recipientFixture({appointments:a}), {to:patient.phone,patientId:7,appointmentId:1})).ok).toBe(false); });
 it("allows an unlinked reservation saved phone", async () => { const a={id:1,patient_id:null,patient_name:"가상예약",phone:patient.phone}; expect((await resolveRecipient(recipientFixture({appointments:a}), {to:patient.phone,patientId:0,appointmentId:1})).ok).toBe(true); });
});
