import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { smsType, validateSmsRequest } from "@/lib/smsRules";
import { normalizePhone } from "@/lib/phone";
import { NOT_CONFIGURED, resolveRecipient, smsConfig, solapiSend, writeSmsLog } from "@/lib/smsServer";

/**
 * 화면에서 문자 보내기 (해피콜·주간 관리 줄, 예약 자동 안내). 업체 키는 lib/smsServer.ts가 서버에서만 읽는다.
 *
 * 잠금 두 가지 (사용자 요청: 사적인 문자 발송 방지)
 *   1. 받는 번호가 그 환자(patientId)의 연락처·가족 연락처, 또는 그 예약(appointmentId)의 연락처와 같을 때만 보낸다. 아니면 403.
 *   2. 번호 대조 거절·업체 응답은 sms_logs에 기록한다. 기록 실패는 접수 성공을 되돌리지 않고 경고한다.
 *
 * 필요한 환경 변수 (Vercel → Settings → Environment Variables, NEXT_PUBLIC_ 없이):
 *   SMS_SENDER_NUMBER_S/N + matching SOLAPI key pair — docs/sms-direct-manual.md
 */
function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

/** 로그인 토큰을 확인하고, 그 사람 권한(RLS authenticated)으로 표를 읽고 쓰는 클라이언트를 돌려준다. */
async function clientForLogin(request: Request): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const sb = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await sb.auth.getUser(token);
  return !error && data.user ? sb : null;
}

async function currentClinic(sb: SupabaseClient): Promise<"S" | "N" | null> {
  const { data, error } = await sb.rpc("current_clinic");
  return !error && (data === "S" || data === "N") ? data : null;
}

/** Configuration only: never represents approval, balance or delivery verification. */
export async function GET(request: Request) {
  const sb = await clientForLogin(request);
  if (!sb) return reply(401, { error: "로그인이 필요합니다." });
  const clinic = await currentClinic(sb);
  if (!clinic) return reply(403, { error: "병원 연결을 확인하지 못했습니다." });
  const config = smsConfig(clinic);
  return Response.json({ clinic, configured: !!config, sender: config?.from ?? null, label: config ? "설정됨" : "미설정", notice: "발신번호 승인·잔액·실제 발송은 검증하지 않았습니다." }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const sb = await clientForLogin(request);
  if (!sb) return reply(401, { error: "로그인이 필요합니다." });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return reply(400, { error: "요청 내용을 읽지 못했습니다." });
  }
  const v = validateSmsRequest(input);
  if (!v.ok) return reply(400, { error: v.error });
  const { to, text, patientId, appointmentId, staff } = v.value;
  const clinic = await currentClinic(sb);
  if (!clinic) return reply(403, { error: "병원 연결을 확인하지 못했습니다." });
  const extra = input as Record<string, unknown>;
  if (extra.recontactId !== undefined || extra.purpose !== undefined) {
    if (clinic !== "S" || typeof extra.recontactId !== "number" || !Number.isInteger(extra.recontactId) || extra.recontactId <= 0
      || (extra.purpose !== "initial" && extra.purpose !== "followup")) return reply(403, { error: "재진콜 발송 요청을 확인하지 못했습니다." });
    const { data: row, error } = await sb.from("recontacts").select("patient_id").eq("clinic", clinic).eq("id", extra.recontactId).maybeSingle();
    if (error || !row || row.patient_id !== patientId || appointmentId) return reply(403, { error: "재진콜 환자 연결을 확인하지 못했습니다." });
    const { data: patient, error: pe } = await sb.from("patients").select("phone,excluded_at").eq("clinic", clinic).eq("id", patientId).maybeSingle();
    if (pe || !patient || patient.excluded_at || normalizePhone(patient.phone) !== to) return reply(403, { error: "연락 가능한 환자의 주 연락처로만 보낼 수 있습니다." });
    const { error: blocked } = await sb.rpc("recontact_assert_contact", { p_id: extra.recontactId, p_purpose: extra.purpose });
    if (blocked) return reply(403, { error: "재진콜 연락이 제한되었습니다. 최신 명단과 연락 한도를 확인해 주세요." });
  }
  const type = smsType(text);

  // 1. 번호 대조
  const who = await resolveRecipient(sb, { to, patientId, appointmentId });
  const base = {
    patient_id: who.r.patientId,
    patient_name: who.r.patientName,
    recipient_label: who.r.label,
    to_phone: to,
    text,
    sms_type: type,
    staff_name: staff,
  };
  if (!who.ok) {
    await writeSmsLog(sb, { ...base, ok: false, error: who.refused, message_id: null });
    return reply(403, { error: who.refused });
  }

  const cfg = smsConfig(clinic);
  if (!cfg) return reply(503, { error: NOT_CONFIGURED });

  const sent = await solapiSend(cfg, { to, text, type });
  if (!sent.ok) {
    await writeSmsLog(sb, { ...base, ok: false, error: sent.error, message_id: null });
    return reply(502, { error: sent.error, unknown: "unknown" in sent && sent.unknown === true });
  }
  // 2. 장부: 성공도 남긴다.
  const logged = await writeSmsLog(sb, { ...base, ok: true, error: null, message_id: sent.messageId });
  return reply(200, { ok: true, accepted: true, type, messageId: sent.messageId,
    ...(!logged ? { warning: "문자 업체가 발송 요청을 접수했지만 문자 장부 저장을 확인하지 못했습니다. 중복 발송하지 마세요." } : {}) });
}
