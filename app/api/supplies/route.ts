import { checkToken, clientForSupplies, reply, supplyApiClinic } from "@/lib/suppliesServer";

/** GET /api/supplies?status=requested,approved — 아사이드가 신청 목록을 읽는다. 설명은 lib/suppliesServer.ts */
const STATUSES = ["requested", "approved", "ordered", "received", "cancelled"];

export async function GET(request: Request) {
  const denied = checkToken(request);
  if (denied) return denied;
  const sb = await clientForSupplies();
  if (sb instanceof Response) return sb;
  try {
    const clinic = await supplyApiClinic(sb, request);
    if (clinic instanceof Response) return clinic;
    const url = new URL(request.url);
    const wanted = (url.searchParams.get("status") ?? "requested,approved").split(",").map((s) => s.trim()).filter((s) => STATUSES.includes(s));
    if (wanted.length === 0) return reply(400, { error: `status는 ${STATUSES.join("·")} 중에서 쉼표로 적어 주세요.` });
    const { data, error } = await sb.from("supply_requests").select("*").eq("clinic", clinic).in("status", wanted).order("requested_at", { ascending: true });
    if (error) return reply(500, { error: error.message });
    return reply(200, { clinic, rows: data ?? [] });
  } finally {
    // scope 없이 부르면 '그 계정의 모든 세션'이 풀려 접수실 PC까지 로그아웃된다(다담에스 매일 17시 끊김의 원인, 2026-11-16). 이 서버 세션만 끝낸다.
    await sb.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
}
