import { getSupabase } from "./supabaseClient";
import { parseRequestLines } from "./supplyRules";
import type { SupplyCategory, SupplyRequest, SupplyStatus } from "./types";

function fail(what: string, msg: string): never {
  throw new Error(`${what}에 실패했습니다. ${msg}`);
}

/** 표가 아직 없으면(V14 SQL 실행 전) 화면에 안내만 띄우려고 구분한다. */
export function isMissingTable(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /supply_requests|supply_settings/.test(m) && /does not exist|schema cache|not find/.test(m);
}

/** 열린 것(신청·승인·주문) 전부 + 최근 받은 것·취소(days일). */
export async function listSupplyRequests(recentDays = 60): Promise<SupplyRequest[]> {
  const since = new Date(Date.now() - recentDays * 86_400_000).toISOString();
  const { data, error } = await getSupabase()
    .from("supply_requests")
    .select("*")
    .or(`status.in.(requested,approved,ordered),requested_at.gte.${since}`)
    .order("requested_at", { ascending: false });
  if (error) fail("물품 신청 목록", error.message);
  return (data ?? []) as SupplyRequest[];
}

/** 빈도 표용: 전부(최대 2,000줄). */
export async function listAllSupplyRequests(): Promise<SupplyRequest[]> {
  const { data, error } = await getSupabase().from("supply_requests").select("*").order("requested_at", { ascending: false }).limit(2000);
  if (error) fail("물품 신청 기록", error.message);
  return (data ?? []) as SupplyRequest[];
}

/** 여러 줄 글을 한 줄씩 신청으로. 분류는 앱이 하고 나중에 고칠 수 있다. */
export async function addSupplyRequests(text: string, staff: string): Promise<SupplyRequest[]> {
  const lines = parseRequestLines(text);
  if (lines.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("supply_requests")
    .insert(lines.map((l) => ({ text: l.text, category: l.category, requested_by: staff })))
    .select();
  if (error) fail("물품 신청", error.message);
  return (data ?? []) as SupplyRequest[];
}

export async function setSupplyCategory(id: number, category: SupplyCategory): Promise<void> {
  const { error } = await getSupabase().from("supply_requests").update({ category }).eq("id", id);
  if (error) fail("분류 바꾸기", error.message);
}

export async function setSupplyStatus(id: number, status: SupplyStatus, staff: string): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  if (status === "approved") patch.approved_at = now;
  if (status === "ordered") patch.ordered_at = now;
  if (status === "received") {
    patch.received_at = now;
    patch.received_by = staff;
  }
  if (status === "cancelled") patch.cancelled_at = now;
  const { error } = await getSupabase().from("supply_requests").update(patch).eq("id", id);
  if (error) fail("상태 바꾸기", error.message);
}

/** 원장 칸(가격·업체·메모·상품 주소). */
export async function setSupplyPrice(id: number, patch: { price: number | null; vendor: string | null; price_note: string | null; product_url: string | null }): Promise<void> {
  const { error } = await getSupabase().from("supply_requests").update({ ...patch, priced_at: new Date().toISOString() }).eq("id", id);
  if (error) fail("가격 저장", error.message);
}

export async function setSupplyMemo(id: number, memo: string): Promise<void> {
  const { error } = await getSupabase().from("supply_requests").update({ memo: memo.trim() || null }).eq("id", id);
  if (error) fail("메모 저장", error.message);
}

export async function getOwnerPin(): Promise<string | null> {
  const { data, error } = await getSupabase().from("supply_settings").select("owner_pin").eq("id", 1).maybeSingle();
  if (error) fail("원장 잠금 설정", error.message);
  return (data as { owner_pin: string | null } | null)?.owner_pin ?? null;
}

export async function setOwnerPin(pin: string | null): Promise<void> {
  const { error } = await getSupabase().from("supply_settings").upsert({ id: 1, owner_pin: pin, updated_at: new Date().toISOString() });
  if (error) fail("원장 잠금 번호 저장", error.message);
}
