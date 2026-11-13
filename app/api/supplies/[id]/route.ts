import { validatePriceUpdate } from "@/lib/supplyRules";
import { checkToken, clientForSupplies, reply } from "@/lib/suppliesServer";

/** PATCH /api/supplies/<id> — 아사이드가 가격·업체·메모·상품 주소를 적는다. 상태는 못 바꾼다. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = checkToken(request);
  if (denied) return denied;
  const { id: idText } = await context.params;
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return reply(400, { error: "id가 잘못되었습니다." });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply(400, { error: "JSON 본문이 필요합니다." });
  }
  const checked = validatePriceUpdate(body);
  if (!checked.ok) return reply(400, { error: checked.error });
  const sb = await clientForSupplies();
  if (sb instanceof Response) return sb;
  try {
    const { data: row, error: e1 } = await sb.from("supply_requests").select("id,status").eq("id", id).maybeSingle();
    if (e1) return reply(500, { error: e1.message });
    if (!row) return reply(404, { error: "그 번호의 신청이 없습니다." });
    if (row.status === "received" || row.status === "cancelled") return reply(409, { error: `이미 ${row.status === "received" ? "받은" : "취소된"} 줄은 못 고칩니다.` });
    const { error: e2 } = await sb.from("supply_requests").update({ ...checked.patch, priced_at: new Date().toISOString() }).eq("id", id);
    if (e2) return reply(500, { error: e2.message });
    return reply(200, { ok: true, id, patch: checked.patch });
  } finally {
    await sb.auth.signOut().catch(() => undefined);
  }
}
