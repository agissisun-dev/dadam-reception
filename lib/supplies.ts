import { getSupabase } from "./supabaseClient";
import { parseRequestLines, isValidPin } from "./supplyRules";
import type { ClinicCode } from "./clinic";
import type { SupplyCategory, SupplyRequest, SupplyStatus } from "./types";

function fail(what: string, msg: string): never {
  throw new Error(`${what}에 실패했습니다. ${msg}`);
}

export async function getSupplyClinic(): Promise<ClinicCode> {
  const { data, error } = await getSupabase().rpc("current_clinic");
  if (error || (data !== "S" && data !== "N")) throw new Error("물품을 관리할 병원을 확인하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.");
  return data;
}

async function updateOwnRequest(id: number, patch: Record<string, unknown>, action: string): Promise<void> {
  const clinic = await getSupplyClinic();
  const { error } = await getSupabase().from("supply_requests").update(patch).eq("id", id).eq("clinic", clinic).select("id").single();
  if (error) fail(action, "해당 병원 신청을 확인하지 못했거나 저장하지 못했습니다.");
}

/** 표가 아직 없으면 화면에 안내만 띄우려고 구분한다. */
export function isMissingTable(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /supply_requests|supply_settings/.test(m) && /does not exist|schema cache|not find/.test(m);
}

/** 열린 것(신청·승인·주문) 전부 + 최근 받은 것·취소(days일). */
export async function listSupplyRequests(recentDays = 60): Promise<SupplyRequest[]> {
  const clinic = await getSupplyClinic();
  const since = new Date(Date.now() - recentDays * 86_400_000).toISOString();
  const { data, error } = await getSupabase()
    .from("supply_requests")
    .select("*")
    .eq("clinic", clinic)
    .or(`status.in.(requested,approved,ordered),requested_at.gte.${since}`)
    .order("requested_at", { ascending: false });
  if (error) fail("물품 신청 목록", error.message);
  return (data ?? []) as SupplyRequest[];
}

/** 빈도 표용: 전부(최대 2,000줄). */
export async function listAllSupplyRequests(): Promise<SupplyRequest[]> {
  const clinic = await getSupplyClinic();
  const { data, error } = await getSupabase().from("supply_requests").select("*").eq("clinic", clinic).order("requested_at", { ascending: false }).limit(2000);
  if (error) fail("물품 신청 기록", error.message);
  return (data ?? []) as SupplyRequest[];
}

/** 여러 줄 글을 한 줄씩 신청으로. 분류는 앱이 하고 나중에 고칠 수 있다. */
export async function addSupplyRequests(text: string, staff: string): Promise<SupplyRequest[]> {
  const lines = parseRequestLines(text);
  if (lines.length === 0) return [];
  const clinic = await getSupplyClinic();
  const { data, error } = await getSupabase()
    .from("supply_requests")
    .insert(lines.map((l) => ({ clinic, text: l.text, category: l.category, requested_by: staff })))
    .select();
  if (error) fail("물품 신청", error.message);
  return (data ?? []) as SupplyRequest[];
}

export async function setSupplyCategory(id: number, category: SupplyCategory): Promise<void> {
  await updateOwnRequest(id, { category }, "분류 바꾸기");
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
  await updateOwnRequest(id, patch, "상태 바꾸기");
}

/** 원장 칸(가격·업체·메모·상품 주소). */
export async function setSupplyPrice(id: number, patch: { price: number | null; vendor: string | null; price_note: string | null; product_url: string | null }): Promise<void> {
  await updateOwnRequest(id, { ...patch, priced_at: new Date().toISOString() }, "가격 저장");
}

export async function setSupplyMemo(id: number, memo: string): Promise<void> {
  await updateOwnRequest(id, { memo: memo.trim() || null }, "메모 저장");
}

export async function getOwnerPin(): Promise<string | null> {
  const clinic = await getSupplyClinic();
  const { data, error } = await getSupabase().from("supply_settings").select("owner_pin").eq("clinic", clinic).eq("id", 1).maybeSingle();
  if (error) fail("원장 잠금 설정", error.message);
  // No row (including a row hidden by policy) is not an explicit no-PIN setting.
  if (!data || !("owner_pin" in data) || (data.owner_pin !== null && (typeof data.owner_pin !== "string" || !isValidPin(data.owner_pin)))) {
    fail("원장 잠금 설정", "이 병원의 잠금 설정 행을 확인하지 못했습니다. 관리자에게 설정을 확인해 달라고 요청해 주세요.");
  }
  return data.owner_pin;
}

export async function setOwnerPin(pin: string | null): Promise<void> {
  if (pin !== null && !isValidPin(pin)) throw new Error("잠금 번호는 숫자 4자리로 적어 주세요.");
  const clinic = await getSupplyClinic();
  const { error } = await getSupabase().from("supply_settings").upsert({ clinic, id: 1, owner_pin: pin, updated_at: new Date().toISOString() }, { onConflict: "clinic,id" });
  if (error) fail("원장 잠금 번호 저장", error.message);
}
