import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 물품 신청함 API (V14, 2026-11-13) — 아사이드(병원 PC의 에이전트)가 신청 목록을 읽고 최저가·업체를 적어 넣는 길.
 *
 * 잠금
 *   - Authorization: Bearer <SUPPLIES_API_TOKEN> 이 맞을 때만 응답한다(Vercel 환경 변수. 없으면 503).
 *   - 표는 서비스 키가 아니라 접수실 계정으로 로그인해서 읽는다: SUPPLIES_LOGIN_EMAIL / SUPPLIES_LOGIN_PASSWORD,
 *     없으면 REMINDER_LOGIN_EMAIL_S / REMINDER_LOGIN_PASSWORD_S 를 그대로 쓴다. 앱은 anon 키만 쓴다는 규칙 그대로.
 *   - 아사이드는 가격·업체·메모·상품 주소만 적는다. 승인·구매 완료는 원장이 화면에서 누른다(결제도 원장이 직접).
 *
 * GET  /api/supplies?status=requested,approved   → { rows: [...] }  (status 생략 = 신청·승인된 것)
 * PATCH /api/supplies/<id>  { price, vendor, price_note, product_url } → { ok: true }   (app/api/supplies/[id]/route.ts)
 */
export function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

export function checkToken(request: Request): Response | null {
  const expected = process.env.SUPPLIES_API_TOKEN;
  if (!expected) return reply(503, { error: "SUPPLIES_API_TOKEN이 설정되지 않았습니다. Vercel 환경 변수에 넣어 주세요." });
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token !== expected) return reply(401, { error: "토큰이 맞지 않습니다." });
  return null;
}

export async function clientForSupplies(): Promise<SupabaseClient | Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.SUPPLIES_LOGIN_EMAIL ?? process.env.REMINDER_LOGIN_EMAIL_S ?? process.env.REMINDER_LOGIN_EMAIL;
  const password = process.env.SUPPLIES_LOGIN_PASSWORD ?? process.env.REMINDER_LOGIN_PASSWORD_S ?? process.env.REMINDER_LOGIN_PASSWORD;
  if (!url || !anon) return reply(503, { error: "Supabase 설정이 없습니다." });
  if (!email || !password) return reply(503, { error: "SUPPLIES_LOGIN_EMAIL / SUPPLIES_LOGIN_PASSWORD 가 설정되지 않았습니다." });
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return reply(503, { error: `물품 API용 로그인에 실패했습니다. ${error.message}` });
  return sb;
}
