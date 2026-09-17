import { normalizePhone } from "./phone";

/**
 * 문자 길이 계산. 업체(솔라피)는 EUC-KR 바이트 기준으로 SMS(90바이트 이하)·LMS(2,000바이트 이하)를 나눈다.
 * 한글·기호처럼 ASCII가 아닌 글자는 2바이트, 영문·숫자·줄바꿈은 1바이트로 센다.
 */
export const SMS_MAX_BYTES = 90;
export const LMS_MAX_BYTES = 2000;

export function smsByteLength(text: string): number {
  let n = 0;
  for (const ch of text) n += ch.codePointAt(0)! < 128 ? 1 : 2;
  return n;
}

export type SmsType = "SMS" | "LMS";

export function smsType(text: string): SmsType {
  return smsByteLength(text) <= SMS_MAX_BYTES ? "SMS" : "LMS";
}

export type SmsRequest = { to: string; text: string };

/** 브라우저·서버가 같이 쓰는 검사. 받는 번호는 숫자 10~11자리, 문구는 비어 있지 않고 LMS 한도 안. */
export function validateSmsRequest(
  input: unknown,
): { ok: true; value: SmsRequest } | { ok: false; error: string } {
  const o = (input ?? {}) as Record<string, unknown>;
  const to = normalizePhone(typeof o.to === "string" ? o.to : "");
  const text = typeof o.text === "string" ? o.text.trim() : "";
  if (to.length !== 10 && to.length !== 11) return { ok: false, error: "받는 번호가 올바르지 않습니다." };
  if (!to.startsWith("01")) return { ok: false, error: "휴대폰 번호(010…)로만 보낼 수 있습니다." };
  if (!text) return { ok: false, error: "보낼 문구가 비어 있습니다." };
  const bytes = smsByteLength(text);
  if (bytes > LMS_MAX_BYTES) {
    return { ok: false, error: `문구가 너무 깁니다. (${bytes}바이트, 최대 ${LMS_MAX_BYTES}바이트)` };
  }
  return { ok: true, value: { to, text } };
}
