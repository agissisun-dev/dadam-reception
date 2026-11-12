import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportRow } from "./recontactRules";
import type { RecontactRow } from "./types";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("./supabaseClient", () => ({ getSupabase: () => mocks }));
import { assertRecontactContact, deleteRecontact, importRecontacts, linkPhone, listRecontacts, markCalled, markSent, MissingPatient, NameMismatch, optOutRecontact, recontactContext, setRecontactStatus } from "./recontacts";

type Reply = { data: unknown; error: { message: string; code?: string; details?: string } | null };
type Step = { method: string; args: unknown[] };
const queries: { table: string; steps: Step[] }[] = [];
const replies = new Map<string, Reply[]>();
const ok = (data: unknown): Reply => ({ data, error: null });
const error = (message: string, code = "TEST"): Reply => ({ data: null, error: { message, code } });
function queue(table: string, ...values: Reply[]) { replies.set(table, [...(replies.get(table) ?? []), ...values]); }
interface MockQuery {
  select(...args: unknown[]): MockQuery;
  eq(...args: unknown[]): MockQuery;
  in(...args: unknown[]): MockQuery;
  gte(...args: unknown[]): MockQuery;
  order(...args: unknown[]): MockQuery;
  insert(...args: unknown[]): MockQuery;
  update(...args: unknown[]): MockQuery;
  delete(...args: unknown[]): MockQuery;
  upsert(...args: unknown[]): MockQuery;
  single(): Promise<Reply>;
  maybeSingle(): Promise<Reply>;
  then: Promise<Reply>["then"];
}
function query(table: string) {
  const steps: Step[] = [];
  queries.push({ table, steps });
  const next = () => {
    const value = replies.get(table)?.shift();
    if (!value) throw new Error(`Unexpected query for ${table}`);
    return value;
  };
  const q: MockQuery = {
    select(...args: unknown[]) { steps.push({ method: "select", args }); return q; },
    eq(...args: unknown[]) { steps.push({ method: "eq", args }); return q; },
    in(...args: unknown[]) { steps.push({ method: "in", args }); return q; },
    gte(...args: unknown[]) { steps.push({ method: "gte", args }); return q; },
    order(...args: unknown[]) { steps.push({ method: "order", args }); return q; },
    insert(...args: unknown[]) { steps.push({ method: "insert", args }); return q; },
    update(...args: unknown[]) { steps.push({ method: "update", args }); return q; },
    delete(...args: unknown[]) { steps.push({ method: "delete", args }); return q; },
    upsert(...args: unknown[]) { steps.push({ method: "upsert", args }); return q; },
    single() { steps.push({ method: "single", args: [] }); return Promise.resolve(next()); },
    maybeSingle() { steps.push({ method: "maybeSingle", args: [] }); return Promise.resolve(next()); },
    then(resolve, reject) { return Promise.resolve().then(next).then(resolve, reject); },
  };
  return q;
}
const candidate = { id: 1, clinic: "N", patient_id: null, patient_name: "김동명", birth_hint: null };
const patient = { id: 8, clinic: "N", name: "김동명", phone: "01012345678", excluded_at: null };
const row: ImportRow = { patient_name: "김동명", phone: null, birth_hint: null, segment: "vip", call_target: true, herb_count: 2, last_herb_date: null, avg_interval_days: null, herb_kind: null, doctor_note: null, memo: null, variant: "A" };

beforeEach(() => {
  vi.clearAllMocks();
  replies.clear();
  queries.length = 0;
  mocks.from.mockImplementation(query);
  mocks.rpc.mockImplementation(async (name: string) => name === "current_clinic" ? ok("N") : error(`Unexpected RPC ${name}`));
});

describe("strict clinic and atomic client contracts", () => {
  it("rejects unmapped sessions before reading tables", async () => {
    mocks.rpc.mockResolvedValueOnce(ok(null));
    await expect(listRecontacts()).rejects.toThrow("병원에 연결된");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("freshly resolves the clinic for every operation", async () => {
    mocks.rpc.mockResolvedValueOnce(ok("S")).mockResolvedValueOnce(ok("N"));
    queue("recontacts", ok([]), ok([]));
    await listRecontacts(); await listRecontacts();
    expect(queries[0].steps).toContainEqual({ method: "eq", args: ["clinic", "S"] });
    expect(queries[1].steps).toContainEqual({ method: "eq", args: ["clinic", "N"] });
    expect(queries[0].steps[0].args[0]).toContain("id,clinic,name,phone,excluded_at");
  });
  it("does not silently accept a differently named phone match", async () => {
    queue("patients", ok({ ...patient, name: "다른분" }));
    await expect(linkPhone(candidate, patient.phone)).rejects.toBeInstanceOf(NameMismatch);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("maps the authoritative missing-patient error without creating in the client", async () => {
    queue("patients", ok(null));
    mocks.rpc.mockImplementation(async (name: string) => name === "current_clinic" ? ok("N") : error("PATIENT_MISSING", "P0002"));
    await expect(linkPhone(candidate, patient.phone)).rejects.toBeInstanceOf(MissingPatient);
    expect(mocks.rpc).toHaveBeenLastCalledWith("recontact_link_phone", expect.objectContaining({ p_allow_create: false, p_accept_different_name: false }));
    expect(queries.every((q) => q.steps.every((s) => s.method !== "insert"))).toBe(true);
  });
  it("only forwards explicit creation approval and validates the returned link", async () => {
    queue("patients", ok(null));
    mocks.rpc.mockImplementation(async (name: string) => name === "current_clinic" ? ok("N") : ok({ patient, recontact: { ...candidate, patient_id: patient.id } }));
    await expect(linkPhone(candidate, "010-1234-5678", false, true)).resolves.toEqual(patient);
    expect(mocks.rpc).toHaveBeenLastCalledWith("recontact_link_phone", expect.objectContaining({ p_phone: patient.phone, p_allow_create: true }));
  });
  it("maps an RPC name race from same-clinic error details", async () => {
    queue("patients", ok(null));
    mocks.rpc.mockImplementation(async (name: string) => name === "current_clinic" ? ok("N") : ({ data: null, error: { message: "NAME_MISMATCH", details: JSON.stringify({ ...patient, name: "다른분" }) } }));
    await expect(linkPhone(candidate, patient.phone)).rejects.toBeInstanceOf(NameMismatch);
  });
  it("retains all send/call audit fields when resetting status", async () => {
    queue("recontacts", ok({ id: 1, clinic: "N" }));
    await setRecontactStatus(1, "todo");
    const values = queries[0].steps.find((s) => s.method === "update")?.args[0];
    expect(values).toEqual({ status: "todo", updated_at: expect.any(String) });
    expect(queries[0].steps).toContainEqual({ method: "eq", args: ["clinic", "N"] });
    expect(queries[0].steps.at(-1)?.method).toBe("single");
  });
  it("archives instead of deleting and retains source/audit fields", async () => {
    queue("recontacts", ok({ id: 1, clinic: "N" }));
    await deleteRecontact(1);
    expect(queries[0].steps.find((s) => s.method === "update")?.args[0]).toEqual({ status: "rest", updated_at: expect.any(String) });
    expect(queries[0].steps.some((s) => s.method === "delete")).toBe(false);
  });
  it("rejects zero-row mutations", async () => {
    queue("recontacts", error("zero rows", "PGRST116"));
    await expect(setRecontactStatus(1, "todo")).rejects.toThrow("zero rows");
  });
  it("records manual facts through expected-attempt RPCs, not eligibility or sending", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "current_clinic" ? ok("N") : ok({ id: 1, clinic: "N" }));
    await markSent({ id: 1, attempts: 2 }, "담당", "보낸 글");
    await markCalled({ id: 1, attempts: 3 }, "안 받음");
    expect(mocks.rpc).toHaveBeenCalledWith("recontact_record_sent", { p_id: 1, p_expected_attempts: 2, p_staff: "담당", p_text: "보낸 글" });
    expect(mocks.rpc).toHaveBeenCalledWith("recontact_record_call", { p_id: 1, p_expected_attempts: 3, p_result: "안 받음" });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("uses the server eligibility and opt-out transactions", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "current_clinic" ? ok("N") : ok(null));
    await assertRecontactContact(1, "followup"); await optOutRecontact(1, "수신거부");
    expect(mocks.rpc).toHaveBeenCalledWith("recontact_assert_contact", { p_id: 1, p_purpose: "followup" });
    expect(mocks.rpc).toHaveBeenCalledWith("recontact_opt_out", { p_id: 1, p_reason: "수신거부" });
  });
});

describe("fail-closed eligibility context", () => {
  for (const failed of ["patients", "appointments", "ledger_entries", "happy_calls"]) {
    it(`rejects errors from ${failed}`, async () => {
      for (const table of ["patients", "appointments", "ledger_entries", "happy_calls"]) queue(table, table === failed ? error(`${table} unavailable`) : ok([]));
      await expect(recontactContext([{ ...candidate, patient_id: 8 } as RecontactRow], "2026-11-12")).rejects.toThrow(`${failed} unavailable`);
    });
  }
  it("excludes a linked patient missing from fresh same-clinic results", async () => {
    for (const table of ["patients", "appointments", "ledger_entries", "happy_calls"]) queue(table, ok([]));
    const ctx = await recontactContext([{ ...candidate, patient_id: 8 } as RecontactRow], "2026-11-12");
    expect(ctx.excluded.has(8)).toBe(true);
  });
});

describe("candidate-only idempotent import", () => {
  it("preserves separate same-name/date rows and ignores injected patient/status fields", async () => {
    queue("recontacts", ok(null), ok(candidate), ok(null), ok({ ...candidate, id: 2 }));
    await expect(importRecontacts([{ ...row, patient_id: 99, status: "sent" } as ImportRow, row], "담당", "file.xlsx/sheet1")).resolves.toMatchObject({ added: 2, duplicated: 0, linked: 0 });
    const inserts = queries.flatMap((q) => q.steps.filter((s) => s.method === "insert").map((s) => s.args[0] as Record<string, unknown>));
    expect(inserts).toHaveLength(2);
    expect(inserts[0].source_key).toMatch(/^[0-9a-f]{64}$/);
    expect(inserts[0].source_key).not.toEqual(inserts[1].source_key);
    expect(inserts[0]).not.toHaveProperty("patient_id");
    expect(inserts[0]).not.toHaveProperty("status");
    expect(inserts[0].clinic).toBe("N");
    expect(mocks.rpc.mock.calls.every(([name]) => name === "current_clinic")).toBe(true);
  });
  it("same source reimport preserves reviewed candidate fields and reports changed names", async () => {
    queue("recontacts", ok({ ...candidate, patient_name: "기존 이름" }));
    const result = await importRecontacts([row], "담당", "file.xlsx/sheet1");
    expect(result.duplicated).toBe(1); expect(result.problems).toHaveLength(1);
    expect(queries.flatMap((q) => q.steps).some((s) => ["insert", "update"].includes(s.method))).toBe(false);
  });
  it("recovers a source-key insert race by reselecting without overwrite", async () => {
    queue("recontacts", ok(null), error("unique violation", "23505"), ok(candidate));
    await expect(importRecontacts([row], "담당", "file.xlsx/sheet1")).resolves.toMatchObject({ added: 0, duplicated: 1 });
    expect(queries.flatMap((q) => q.steps).some((s) => s.method === "update")).toBe(false);
  });
  it("a missing phone match stays an unlinked candidate and never auto-registers", async () => {
    queue("recontacts", ok(null), ok(candidate)); queue("patients", ok(null));
    mocks.rpc.mockImplementation(async (name: string) => name === "current_clinic" ? ok("N") : error("PATIENT_MISSING", "P0002"));
    const result = await importRecontacts([{ ...row, phone: patient.phone }], "담당", "file.xlsx/sheet1");
    expect(result.added).toBe(1); expect(result.linked).toBe(0); expect(result.problems).toHaveLength(1);
    expect(mocks.rpc).toHaveBeenCalledWith("recontact_link_phone", expect.objectContaining({ p_allow_create: false }));
    expect(queries.filter((q) => q.table === "patients").flatMap((q) => q.steps).some((s) => s.method === "insert")).toBe(false);
  });
});
