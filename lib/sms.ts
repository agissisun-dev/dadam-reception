import { getSupabase } from "./supabaseClient";
import { normalizePhone } from "./phone";
import type { SmsType } from "./smsRules";

/**
 * 브라우저에서 문자 보내기. 실제 발송은 서버(app/api/sms)가 업체 키로 한다.
 * 로그인 토큰을 같이 보내서 로그인한 사람만 쓸 수 있고,
 * 서버가 받는 번호를 그 환자(patientId)의 연락처·가족 연락처와 대조한 뒤 장부에 남긴다.
 */
export async function sendSms(
  to: string,
  text: string,
  who: { patientId: number; staff: string },
): Promise<{ type: SmsType }> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 풀렸습니다. 다시 로그인해 주세요.");
  const res = await fetch("/api/sms", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: normalizePhone(to), text, patientId: who.patientId, staff: who.staff }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; type?: SmsType };
  if (!res.ok) throw new Error(body.error ?? "문자를 보내지 못했습니다.");
  return { type: body.type ?? "SMS" };
}
