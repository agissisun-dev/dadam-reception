import { getSupabase } from "./supabaseClient";
import { fetchCurrentClinic } from "./clinic";
import { addDays, daysBetween } from "./dates";
import { setPrescriptionReceiveDate } from "./patients";
import type { NewJob } from "./brewRules";
import type { BrewJob, BrewWeekdayRule } from "./types";

function fail(action: string, message: string): never {
  throw new Error(`${action} 실패: ${message}`);
}

/** from~to(포함) 사이 칸, 날짜·오전/오후·순서대로 */
export async function listJobs(from: string, to: string): Promise<BrewJob[]> {
  const { data, error } = await getSupabase()
    .from("brew_jobs")
    .select("*")
    .gte("day", from)
    .lte("day", to)
    .order("day")
    .order("slot")
    .order("sort_order")
    .order("id");
  if (error) fail("약대장 불러오기", error.message);
  return (data ?? []) as BrewJob[];
}

/** 날짜 미정 칸 */
export async function listUnscheduled(): Promise<BrewJob[]> {
  const { data, error } = await getSupabase().from("brew_jobs").select("*").is("day", null).order("id");
  if (error) fail("날짜 미정 목록", error.message);
  return (data ?? []) as BrewJob[];
}

export async function listWeekdayRules(): Promise<BrewWeekdayRule[]> {
  const { data, error } = await getSupabase().from("brew_weekday_rules").select("*").order("weekday");
  if (error) fail("요일별 기준", error.message);
  return (data ?? []) as BrewWeekdayRule[];
}

export async function saveWeekdayRule(rule: BrewWeekdayRule): Promise<void> {
  const { error } = await getSupabase().from("brew_weekday_rules").upsert({ weekday: rule.weekday, note: rule.note.trim(), max_jobs: Math.max(0, rule.max_jobs) });
  if (error) fail("요일별 기준 저장", error.message);
}

/** 칸 여러 개 넣기. pairWithPrev가 있으면 바로 앞 칸과 짝(pair_id)을 맺는다. */
export async function createJobs(jobs: NewJob[]): Promise<BrewJob[]> {
  const sb = getSupabase();
  const out: BrewJob[] = [];
  for (const j of jobs) {
    const { pairWithPrev, ...row } = j;
    const { data, error } = await sb.from("brew_jobs").insert(row).select("*").single();
    if (error) fail("약대장 칸 넣기", error.message);
    const job = data as BrewJob;
    if (pairWithPrev && out.length > 0) {
      const prev = out[out.length - 1];
      await sb.from("brew_jobs").update({ pair_id: prev.id }).eq("id", job.id);
      await sb.from("brew_jobs").update({ pair_id: job.id }).eq("id", prev.id);
      job.pair_id = prev.id;
      prev.pair_id = job.id;
    }
    out.push(job);
  }
  return out;
}

export type JobPatch = Partial<Pick<BrewJob, "day" | "slot" | "title" | "patient_name" | "delivery" | "region" | "pouch" | "memo" | "max_jobs" | "receive_day" | "kind">>;

/** 날짜·상세 수정과 삭제는 최신 행 및 짝의 소유 병원을 확인한 뒤 진행한다. */
async function getOwnedJobAndPair(id: number, action: string): Promise<{ job: BrewJob; pair: BrewJob | null }> {
  const sb = getSupabase();
  const clinic = await fetchCurrentClinic();
  const { data, error } = await sb.from("brew_jobs").select("*").eq("id", id).single();
  if (error) fail(action, error.message);
  const job = data as BrewJob;
  if (job.clinic !== clinic) {
    fail(action, "두 병원은 약대장 조회와 완료 표시를 함께 사용할 수 있지만, 날짜·상세 수정과 삭제는 해당 약을 등록한 병원에서 진행해 주세요.");
  }
  let pair: BrewJob | null = null;
  if (job.pair_id) {
    const { data: pairData, error: pairError } = await sb.from("brew_jobs").select("*").eq("id", job.pair_id).single();
    if (pairError) fail(action, pairError.message);
    pair = pairData as BrewJob;
    if (pair.clinic !== job.clinic) fail(action, "짝 칸의 등록 병원이 달라 변경할 수 없습니다. 등록 병원을 확인해 주세요.");
  }
  return { job, pair };
}

/**
 * 칸 고치기. 날짜가 바뀌면: 발효 짝도 같은 만큼 옮기고, 받는 날도 같이 옮기고, 처방 수령일·해피콜을 갱신한다.
 */
export async function updateJob(job: BrewJob, patch: JobPatch): Promise<void> {
  const current = await getOwnedJobAndPair(job.id, "약대장 칸 고치기");
  job = current.job;
  const sb = getSupabase();
  const next = { ...patch, updated_at: new Date().toISOString() };
  const dayChanged = patch.day !== undefined && patch.day !== job.day;
  if (dayChanged && job.day && patch.day) {
    const delta = daysBetween(job.day, patch.day);
    if (patch.receive_day === undefined && job.receive_day) next.receive_day = addDays(job.receive_day, delta);
    const p = current.pair;
    if (p?.day) {
      const pd = addDays(p.day, delta);
      const { error: pairError } = await sb.from("brew_jobs").update({ day: pd, receive_day: p.receive_day ? addDays(p.receive_day, delta) : null, updated_at: next.updated_at }).eq("id", p.id).select("id").single();
      if (pairError) fail("약대장 짝 칸 고치기", pairError.message);
      if (p.prescription_id && p.receive_day) await setPrescriptionReceiveDate(p.prescription_id, addDays(p.receive_day, delta));
    }
  } else if (dayChanged && patch.day && !job.day) {
    // 날짜 미정 → 날짜 넣기
    if (patch.receive_day === undefined) next.receive_day = patch.day;
  }
  const { error } = await sb.from("brew_jobs").update(next).eq("id", job.id).select("id").single();
  if (error) fail("약대장 칸 고치기", error.message);
  const newReceive = next.receive_day ?? (patch.receive_day !== undefined ? patch.receive_day : undefined);
  if (job.prescription_id && newReceive) await setPrescriptionReceiveDate(job.prescription_id, newReceive);
  if (job.prescription_id && patch.day !== undefined) {
    const { error: prescriptionError } = await sb.from("prescriptions").update({ brew_day: patch.day }).eq("id", job.prescription_id).select("id").single();
    if (prescriptionError) fail("처방 탕전일 변경", prescriptionError.message);
  }
}

export async function markDone(job: BrewJob, done: boolean, staff: string): Promise<void> {
  const { error } = await getSupabase()
    .from("brew_jobs")
    .update(done ? { status: "done", done_at: new Date().toISOString(), done_by: staff } : { status: "planned", done_at: null, done_by: null })
    .eq("id", job.id);
  if (error) fail("끝남 표시", error.message);
}

export async function deleteJob(job: BrewJob): Promise<void> {
  const current = await getOwnedJobAndPair(job.id, "약대장 칸 지우기");
  job = current.job;
  const sb = getSupabase();
  if (current.pair) {
    const { error: pairError } = await sb.from("brew_jobs").delete().eq("id", current.pair.id).select("id").single();
    if (pairError) fail("약대장 짝 칸 지우기", pairError.message);
  }
  const { error } = await sb.from("brew_jobs").delete().eq("id", job.id).select("id").single();
  if (error) fail("약대장 칸 지우기", error.message);
}

export async function deleteJobsOfEntry(entryId: number): Promise<void> {
  const { error } = await getSupabase().from("brew_jobs").delete().eq("ledger_entry_id", entryId);
  if (error) fail("약대장 칸 지우기", error.message);
}

/** 이번 주(월~토)에 잡힌 탕전 수. 첫 화면 요약용. 실패하면 0. */
export async function countWeek(monday: string): Promise<{ total: number; done: number }> {
  try {
    const jobs = await listJobs(monday, addDays(monday, 5));
    const real = jobs.filter((j) => j.kind !== "note");
    return { total: real.length, done: real.filter((j) => j.status === "done").length };
  } catch {
    return { total: 0, done: 0 };
  }
}
