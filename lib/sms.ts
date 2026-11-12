import { getSupabase } from "./supabaseClient";
import { normalizePhone } from "./phone";
import type { SmsType } from "./smsRules";

export type SmsAccepted = { accepted: true; type: SmsType; warning?: string };
export class SmsOutcomeUnknown extends Error {}
export const ACCEPTED_RECORD_WARNING = "문자 업체가 발송 요청을 접수했습니다. 앱 기록 저장은 확인하지 못했습니다. 중복 발송하지 말고 문자 장부를 확인해 주세요.";
export const UNKNOWN_SEND_WARNING = "발송 결과를 확인하지 못했습니다. 중복 발송하지 말고 문자 장부와 업체 발송 내역을 먼저 확인해 주세요.";

/** After acceptance, a recording failure must never become a send failure. */
export async function recordAcceptedSms(send: () => Promise<SmsAccepted>, record: () => Promise<unknown>): Promise<SmsAccepted> {
  const result = await send();
  try { await record(); } catch { return { ...result, warning: [result.warning, ACCEPTED_RECORD_WARNING].filter(Boolean).join(" ") }; }
  return result;
}

/**
 * 브라우저에서 문자 보내기. 실제 발송은 서버(app/api/sms)가 업체 키로 한다.
 * 로그인 토큰을 같이 보내서 로그인한 사람만 쓸 수 있고,
 * 서버가 받는 번호를 그 환자(patientId)의 연락처·가족 연락처, 또는 그 예약(appointmentId)의 연락처와 대조한 뒤 장부에 남긴다.
 */
export async function sendSms(
  to: string,
  text: string,
  who: { patientId?: number; appointmentId?: number; staff: string; recontactId?: number; purpose?: "initial" | "followup" },
): Promise<SmsAccepted> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 풀렸습니다. 다시 로그인해 주세요.");
  let res: Response;
  try { res = await fetch("/api/sms", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...who, to: normalizePhone(to), text, patientId: who.patientId ?? 0, appointmentId: who.appointmentId ?? 0 }),
  }); } catch { throw new SmsOutcomeUnknown(UNKNOWN_SEND_WARNING); }
  const body = await res.json().catch(() => null) as { ok?: boolean; accepted?: boolean; unknown?: boolean; error?: string; type?: SmsType; warning?: string } | null;
  if (body?.accepted === true && body.ok === true) return { accepted: true, type: body.type ?? "SMS", warning: body.warning };
  if (!body || body.unknown || res.ok || (res.status >= 500 && res.status !== 503 && res.status !== 502)) throw new SmsOutcomeUnknown(UNKNOWN_SEND_WARNING);
  throw new Error(body.error ?? "문자를 보내지 못했습니다.");
}
