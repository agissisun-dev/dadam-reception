import { checkToken, clientForSupplies, reply } from "@/lib/suppliesServer";

/** GET /api/supplies?status=requested,approved — 아사이드가 신청 목록을 읽는다. 설명은 lib/suppliesServer.ts */
const STATUSES = ["requested", "approved", "ordered", "received", "cancelled"];

export async function GET(request: Request) {
  const denied = checkToken(request);
  if (denied) return denied;
  const sb = await clientForSupplies();
  if (sb instanceof Response) return sb;
  try {
    const url = new URL(request.url);
    const wanted = (url.searchParams.get("status") ?? "requested,approved").split(",").map((s) => s.trim()).filter((s) => STATUSES.includes(s));
    if (wanted.length === 0) return reply(400, { error: `status는 ${STATUSES.join("·")} 중에서 쉼표로 적어 주세요.` });
    const { data, error } = await sb.from("supply_requests").select("*").in("status", wanted).order("requested_at", { ascending: true });
    if (error) return reply(500, { error: error.message });
    return reply(200, { rows: data ?? [] });
  } finally {
    await sb.auth.signOut().catch(() => undefined);
  }
}
