import { createHmac, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "./phone";
import { recipientLabelFor, type SmsType } from "./smsRules";

/**
 * 서버에서만 쓰는 문자 발송 도구. 업체(솔라피) 키는 여기서만 읽고 브라우저에는 절대 내려가지 않는다.
 * app/api/sms(화면에서 보내기)와 app/api/appointments/remind(전날 리마인더)가 같이 쓴다.
 *
 * 규격: POST https://api.solapi.com/messages/v4/send
 *   Authorization: HMAC-SHA256 apiKey=…, date=…, salt=…, signature=HMAC_SHA256(secret, date + salt)
 *   body: { message: { to, from, text, type } }
 * 업체 문서: https://developers.solapi.com (규격이 바뀌면 이 파일만 고치면 된다)
 */
const SEND_URL = "https://api.solapi.com/messages/v4/send";

export type SmsConfig = { apiKey: string; apiSecret: string; from: string };

/** Vercel 환경 변수에서 업체 키·발신번호. 하나라도 없으면 null (→ "문자 설정이 아직 안 되어 있습니다"). */
export function smsConfig(): SmsConfig | null {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const from = normalizePhone(process.env.SMS_SENDER_NUMBER ?? "");
  if (!apiKey || !apiSecret || !from) return null;
  return { apiKey, apiSecret, from };
}

export const NOT_CONFIGURED = "문자 설정이 아직 안 되어 있습니다. 문자 업체 키와 발신번호를 등록해야 보낼 수 있습니다.";

export async function solapiSend(
  cfg: SmsConfig,
  msg: { to: string; text: string; type: SmsType },
): Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }> {
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", cfg.apiSecret).update(date + salt).digest("hex");
  let res: globalThis.Response;
  try {
    res = await fetch(SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `HMAC-SHA256 apiKey=${cfg.apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
      },
      body: JSON.stringify({ message: { to: msg.to, from: cfg.from, text: msg.text, type: msg.type } }),
    });
  } catch {
    return { ok: false, error: "문자 업체에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
  }
  const result = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const statusCode = typeof result.statusCode === "string" ? result.statusCode : "";
  if (!res.ok || (statusCode && !statusCode.startsWith("2"))) {
    const why = result.errorMessage ?? result.statusMessage ?? result.errorCode ?? `응답 ${res.status}`;
    return { ok: false, error: `문자 업체가 거절했습니다. ${String(why)}` };
  }
  return { ok: true, messageId: typeof result.messageId === "string" ? result.messageId : null };
}

export type SmsLogRow = {
  patient_id: number | null;
  patient_name: string;
  recipient_label: string;
  to_phone: string;
  text: string;
  sms_type: SmsType;
  staff_name: string;
  ok: boolean;
  error: string | null;
  message_id: string | null;
};

/** 장부 기록. 기록 자체가 실패해도 발송 결과 응답은 막지 않는다 (장부 표가 아직 없을 때 대비). */
export async function writeSmsLog(sb: SupabaseClient, row: SmsLogRow): Promise<void> {
  try {
    await sb.from("sms_logs").insert(row);
  } catch {
    /* 장부 실패는 응답에 영향 주지 않음 */
  }
}

type PatientLite = { id: number; name: string; phone: string; family_phone: string | null; family_note: string | null };
export type Recipient = { patientId: number | null; patientName: string; label: string };

/**
 * 받는 번호가 정당한지 서버가 다시 대조한다 (사적 발송 방지).
 * - 환자 기준: 그 환자의 연락처·가족 연락처와 같을 때만.
 * - 예약 기준: 그 예약에 적힌 연락처와 같거나, 예약에 연결된 환자의 연락처·가족 연락처와 같을 때만.
 * 아니면 refused에 이유를 담아 돌려준다 (호출한 쪽이 장부에 남기고 403).
 */
export async function resolveRecipient(
  sb: SupabaseClient,
  q: { to: string; patientId: number; appointmentId: number },
): Promise<{ ok: true; r: Recipient } | { ok: false; refused: string; r: Recipient }> {
  const to = normalizePhone(q.to);
  const unknown = (name: string, pid: number | null): Recipient => ({ patientId: pid, patientName: name, label: "등록되지 않은 번호" });

  if (q.appointmentId > 0) {
    const { data: appt } = await sb
      .from("appointments")
      .select("id, patient_id, patient_name, phone")
      .eq("id", q.appointmentId)
      .maybeSingle<{ id: number; patient_id: number | null; patient_name: string; phone: string | null }>();
    if (!appt) return { ok: false, refused: "예약을 찾지 못했습니다.", r: unknown(`(예약 ${q.appointmentId} 없음)`, null) };
    if (appt.phone && normalizePhone(appt.phone) === to) {
      return { ok: true, r: { patientId: appt.patient_id, patientName: appt.patient_name, label: "예약 연락처" } };
    }
    if (appt.patient_id) {
      const p = await patientById(sb, appt.patient_id);
      const label = p ? recipientLabelFor(p, to) : null;
      if (p && label) return { ok: true, r: { patientId: p.id, patientName: p.name, label } };
    }
    return { ok: false, refused: "예약에 적힌 연락처나 등록된 환자 번호로만 보낼 수 있습니다.", r: unknown(appt.patient_name, appt.patient_id) };
  }

  const p = await patientById(sb, q.patientId);
  const label = p ? recipientLabelFor(p, to) : null;
  if (!p || !label) return { ok: false, refused: "등록된 환자·가족 번호로만 보낼 수 있습니다.", r: unknown(p?.name ?? `(환자 ${q.patientId} 없음)`, p?.id ?? null) };
  return { ok: true, r: { patientId: p.id, patientName: p.name, label } };
}

async function patientById(sb: SupabaseClient, id: number): Promise<PatientLite | null> {
  const { data } = await sb.from("patients").select("id, name, phone, family_phone, family_note").eq("id", id).maybeSingle<PatientLite>();
  return data ?? null;
}
