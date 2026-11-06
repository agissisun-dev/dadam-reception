import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { smsType, validateSmsRequest } from "@/lib/smsRules";
import { NOT_CONFIGURED, resolveRecipient, smsConfig, solapiSend, writeSmsLog } from "@/lib/smsServer";

/**
 * 화면에서 문자 보내기 (해피콜·주간 관리 줄, 예약 자동 안내). 업체 키는 lib/smsServer.ts가 서버에서만 읽는다.
 *
 * 잠금 두 가지 (사용자 요청: 사적인 문자 발송 방지)
 *   1. 받는 번호가 그 환자(patientId)의 연락처·가족 연락처, 또는 그 예약(appointmentId)의 연락처와 같을 때만 보낸다. 아니면 403.
 *   2. 성공·실패·거절을 가리지 않고 모든 시도를 sms_logs 장부에 남긴다. (앱에서는 고치거나 지울 수 없다)
 *
 * 필요한 환경 변수 (Vercel → Settings → Environment Variables, NEXT_PUBLIC_ 없이):
 *   SOLAPI_API_KEY, SOLAPI_API_SECRET, SMS_SENDER_NUMBER — docs/setup-sms.md
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

  const cfg = smsConfig();
  if (!cfg) return reply(503, { error: NOT_CONFIGURED });

  const sent = await solapiSend(cfg, { to, text, type });
  if (!sent.ok) {
    await writeSmsLog(sb, { ...base, ok: false, error: sent.error, message_id: null });
    return reply(502, { error: sent.error });
  }
  // 2. 장부: 성공도 남긴다.
  await writeSmsLog(sb, { ...base, ok: true, error: null, message_id: sent.messageId });
  return reply(200, { ok: true, type, messageId: sent.messageId });
}
