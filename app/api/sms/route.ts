import { createHmac, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "@/lib/phone";
import { recipientLabelFor, smsType, validateSmsRequest } from "@/lib/smsRules";

/**
 * 문자 발송 서버 처리. 업체(솔라피) 키는 여기서만 쓰고 브라우저에는 절대 내려가지 않는다.
 *
 * 잠금 두 가지 (사용자 요청: 사적인 문자 발송 방지)
 *   1. 받는 번호가 그 환자(patientId)의 연락처·가족 연락처와 같을 때만 보낸다. 아니면 403.
 *   2. 성공·실패·거절을 가리지 않고 모든 시도를 sms_logs 장부에 남긴다. (앱에서는 고치거나 지울 수 없다)
 *
 * 필요한 환경 변수 (Vercel → Settings → Environment Variables, NEXT_PUBLIC_ 없이):
 *   SOLAPI_API_KEY, SOLAPI_API_SECRET  — 솔라피 콘솔 → API Key 관리
 *   SMS_SENDER_NUMBER                  — 솔라피에 등록한 병원 발신번호 (예: 0212345678)
 *
 * 규격: POST https://api.solapi.com/messages/v4/send
 *   Authorization: HMAC-SHA256 apiKey=…, date=…, salt=…, signature=HMAC_SHA256(secret, date + salt)
 *   body: { message: { to, from, text, type } }
 * 업체 문서: https://developers.solapi.com (규격이 바뀌면 이 파일만 고치면 된다)
 */
const SEND_URL = "https://api.solapi.com/messages/v4/send";

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

type PatientLite = { id: number; name: string; phone: string; family_phone: string | null; family_note: string | null };

type LogRow = {
  patient_id: number | null;
  patient_name: string;
  recipient_label: string;
  to_phone: string;
  text: string;
  sms_type: "SMS" | "LMS";
  staff_name: string;
  ok: boolean;
  error: string | null;
  message_id: string | null;
};

/** 장부 기록. 기록 자체가 실패해도 발송 결과 응답은 막지 않는다 (장부 표가 아직 없을 때 대비). */
async function writeLog(sb: SupabaseClient, row: LogRow): Promise<void> {
  try {
    await sb.from("sms_logs").insert(row);
  } catch {
    /* 장부 실패는 응답에 영향 주지 않음 */
  }
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
  const { to, text, patientId, staff } = v.value;
  const type = smsType(text);

  // 1. 번호 대조: 그 환자의 연락처·가족 연락처가 아니면 보내지 않고 장부에만 남긴다.
  const { data: patient } = await sb
    .from("patients")
    .select("id, name, phone, family_phone, family_note")
    .eq("id", patientId)
    .maybeSingle<PatientLite>();
  const label = patient ? recipientLabelFor(patient, to) : null;
  const base: Omit<LogRow, "ok" | "error" | "message_id"> = {
    patient_id: patient?.id ?? null,
    patient_name: patient?.name ?? `(환자 ${patientId} 없음)`,
    recipient_label: label ?? "등록되지 않은 번호",
    to_phone: to,
    text,
    sms_type: type,
    staff_name: staff,
  };
  if (!patient || !label) {
    const error = "등록된 환자·가족 번호로만 보낼 수 있습니다.";
    await writeLog(sb, { ...base, ok: false, error, message_id: null });
    return reply(403, { error });
  }

  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const from = normalizePhone(process.env.SMS_SENDER_NUMBER ?? "");
  if (!apiKey || !apiSecret || !from) {
    return reply(503, { error: "문자 설정이 아직 안 되어 있습니다. 문자 업체 키와 발신번호를 등록해야 보낼 수 있습니다." });
  }

  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", apiSecret).update(date + salt).digest("hex");

  let res: globalThis.Response;
  try {
    res = await fetch(SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
      },
      body: JSON.stringify({ message: { to, from, text, type } }),
    });
  } catch {
    const error = "문자 업체에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
    await writeLog(sb, { ...base, ok: false, error, message_id: null });
    return reply(502, { error });
  }

  const result = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const statusCode = typeof result.statusCode === "string" ? result.statusCode : "";
  if (!res.ok || (statusCode && !statusCode.startsWith("2"))) {
    const why = result.errorMessage ?? result.statusMessage ?? result.errorCode ?? `응답 ${res.status}`;
    const error = `문자 업체가 거절했습니다. ${String(why)}`;
    await writeLog(sb, { ...base, ok: false, error, message_id: null });
    return reply(502, { error });
  }
  const messageId = typeof result.messageId === "string" ? result.messageId : null;
  // 2. 장부: 성공도 남긴다.
  await writeLog(sb, { ...base, ok: true, error: null, message_id: messageId });
  return reply(200, { ok: true, type, messageId });
}
