import { createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { normalizePhone } from "@/lib/phone";
import { smsType, validateSmsRequest } from "@/lib/smsRules";

/**
 * 문자 발송 서버 처리. 업체(솔라피) 키는 여기서만 쓰고 브라우저에는 절대 내려가지 않는다.
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

async function verifyLogin(request: Request): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(token);
  return !error && !!data.user;
}

export async function POST(request: Request) {
  if (!(await verifyLogin(request))) return reply(401, { error: "로그인이 필요합니다." });

  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const from = normalizePhone(process.env.SMS_SENDER_NUMBER ?? "");
  if (!apiKey || !apiSecret || !from) {
    return reply(503, { error: "문자 설정이 아직 안 되어 있습니다. 문자 업체 키와 발신번호를 등록해야 보낼 수 있습니다." });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return reply(400, { error: "요청 내용을 읽지 못했습니다." });
  }
  const v = validateSmsRequest(input);
  if (!v.ok) return reply(400, { error: v.error });
  const { to, text } = v.value;
  const type = smsType(text);

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
    return reply(502, { error: "문자 업체에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요." });
  }

  const result = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const statusCode = typeof result.statusCode === "string" ? result.statusCode : "";
  if (!res.ok || (statusCode && !statusCode.startsWith("2"))) {
    const why = result.errorMessage ?? result.statusMessage ?? result.errorCode ?? `응답 ${res.status}`;
    return reply(502, { error: `문자 업체가 거절했습니다. ${String(why)}` });
  }
  return reply(200, { ok: true, type, messageId: result.messageId ?? null });
}
