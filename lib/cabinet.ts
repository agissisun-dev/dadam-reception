import { getSupabase } from "./supabaseClient";
import { expectedStock, nearestExpiry, remainingLots, scopedCabinetRecords, cabinetLinkAllows, cabinetScopeAllows, isLegacyCabinetItem, isPrivateSupply, normalizedCabinetUnit, normalizedCabinetItemUnit, type Lot } from "./cabinetRules";
import type { ClinicCode } from "./clinic";
import type { CabinetItem, CabinetItemInput, CabinetMove, CabinetPurpose } from "./types";

function fail(what: string, msg: string): never {
  throw new Error(`${what}에 실패했습니다. ${msg}`);
}

export async function listCabinetItems(includeInactive = false): Promise<CabinetItem[]> {
  let q = getSupabase().from("cabinet_items").select("*").order("sort_order").order("id");
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) fail("약장 품목 목록", error.message);
  return (data ?? []) as CabinetItem[];
}

export async function createCabinetItem(input: CabinetItemInput): Promise<CabinetItem> {
  const unit = normalizedCabinetItemUnit(input.kind, input.unit);
  if (!input.name.trim()) throw new Error("품목 이름을 적어 주세요.");
  const clinic = await getCabinetClinic();
  const payload = { ...input, name: input.name.trim(), unit, clinic: input.kind === "insured" || input.kind === "supply" ? clinic : null, legacy_shared: false, legacy_source_id: null };
  const { data, error } = await getSupabase().from("cabinet_items").insert(payload).select().single();
  if (error) fail("품목 추가", error.message);
  return data as CabinetItem;
}

export async function updateCabinetItem(id: number, input: Partial<CabinetItemInput>): Promise<CabinetItem> {
  const unit = input.unit === undefined ? undefined : normalizedCabinetUnit(input.unit);
  const clinic = await getCabinetClinic();
  const item = (await listCabinetItems(true)).find((i) => i.id === id);
  if (!item || !cabinetScopeAllows(item, clinic) || isLegacyCabinetItem(item)) throw new Error("수정할 수 없는 병원·보관 품목입니다.");
  if (input.clinic !== undefined || input.kind !== undefined || input.legacy_shared !== undefined || input.legacy_source_id !== undefined) throw new Error("품목의 병원·구분·보관 연결은 변경할 수 없습니다.");
  if (unit !== undefined) normalizedCabinetItemUnit(item.kind, unit);
  if (unit !== undefined && unit !== item.unit && await hasCabinetMove(id)) throw new Error("입출고 기록이 있어 단위를 바꿀 수 없습니다. 새 단위로 새 품목을 만드세요. 기존 수량은 변환되지 않습니다.");
  const { data, error } = await getSupabase().from("cabinet_items").update({ ...input, ...(unit === undefined ? {} : { unit }) }).eq("id", id).select().single();
  if (error) fail("품목 수정", error.message);
  return data as CabinetItem;
}

/** UI 삭제는 현재 목록에서 숨기기만 한다. 재고·장부 이력과 연결은 그대로 보존한다. */
export function archiveCabinetItem(id: number): Promise<CabinetItem> {
  return updateCabinetItem(id, { active: false });
}

async function hasCabinetMove(id: number, kind?: CabinetMove["kind"]): Promise<boolean> {
  let query = getSupabase().from("cabinet_moves").select("id").eq("item_id", id);
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query.limit(1);
  if (error) fail("품목 기록 확인", error.message);
  return !!data?.length;
}

/** 모든 장부(오름차순). 품목 수가 적고 장부가 길지 않아 한 번에 받는다. 1,000줄 넘으면 이어서 받는다. */
export async function listAllCabinetMoves(): Promise<CabinetMove[]> {
  const out: CabinetMove[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await getSupabase()
      .from("cabinet_moves")
      .select("*")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + page - 1);
    if (error) fail("약장 기록", error.message);
    const rows = (data ?? []) as CabinetMove[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

/** 품목 하나의 현재 상태. */
export type CabinetStatus = {
  item: CabinetItem;
  stock: number;
  lots: Lot[];
  nearest: string | null;
  moves: CabinetMove[]; // 이 품목의 장부(오름차순)
};

export function buildStatuses(items: CabinetItem[], moves: CabinetMove[]): CabinetStatus[] {
  return items.map((item) => {
    const mine = moves.filter((m) => m.item_id === item.id);
    const stock = expectedStock(mine);
    const lots = remainingLots(
      mine.filter((m) => m.kind === "in"),
      stock,
    );
    return { item, stock, lots, nearest: nearestExpiry(lots), moves: mine };
  });
}

export async function getCabinetClinic(): Promise<ClinicCode> {
  const { data, error } = await getSupabase().rpc("current_clinic");
  if (error || (data !== "S" && data !== "N")) throw new Error("재고를 관리할 병원을 확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.");
  return data;
}

/** 잘못 연결한 재고는 장부·환자·입출고를 쓰기 전에 거절한다. */
export async function validateCabinetTargetsForLedger(targets: { group: string; cabinet_item_id: number | null; unknown?: boolean }[]): Promise<void> {
  const linked = targets.filter((target) => target.cabinet_item_id != null && !target.unknown);
  if (!linked.length) return;
  const clinic = await getCabinetClinic();
  const items = await listCabinetItems(true);
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const target of linked) {
    const item = byId.get(target.cabinet_item_id!);
    if (item && !item.active) throw new Error(`${item.name}: 삭제·사용 안 함 품목입니다. 품목 관리에서 복구한 뒤 사용해 주세요.`);
    if (!item || !cabinetLinkAllows(item, clinic, target.group)) throw new Error("장부와 재고 품목의 병원·구분이 맞지 않습니다. 공용 기록 보관 품목은 연결할 수 없습니다.");
    if (isPrivateSupply(item) && !await hasCabinetMove(item.id, "count")) throw new Error(`${item.name}: 초기 수량 미등록. 재고현황에서 현재 수량 등록을 먼저 저장해 주세요.`);
  }
}

export async function loadCabinet(): Promise<{ clinic: ClinicCode; allItems: CabinetItem[]; items: CabinetItem[]; moves: CabinetMove[]; statuses: CabinetStatus[] }> {
  const clinic = await getCabinetClinic();
  const [allItems, allMoves] = await Promise.all([listCabinetItems(true), listAllCabinetMoves()]);
  const scoped = scopedCabinetRecords(allItems, allMoves, clinic);
  const items = scoped.items.filter((item) => item.active);
  return { clinic, allItems: scoped.items, items, moves: scoped.moves, statuses: buildStatuses(items, scoped.moves) };
}

type MoveInput = {
  item_id: number;
  kind: CabinetMove["kind"];
  qty: number;
  staff_name: string;
  expiry?: string | null;
  purpose?: CabinetPurpose | null;
  patient_id?: number | null;
  patient_name?: string | null;
  memo?: string | null;
  diff?: number | null;
};

async function insertMove(input: MoveInput): Promise<CabinetMove> {
  const clinic = await getCabinetClinic();
  const item = (await listCabinetItems(true)).find((i) => i.id === input.item_id);
  if (!item || !cabinetScopeAllows(item, clinic) || isLegacyCabinetItem(item)) throw new Error("기록할 수 없는 병원·보관 품목입니다.");
  if (input.kind !== "count" && isPrivateSupply(item) && !await hasCabinetMove(item.id, "count")) throw new Error("초기 수량 미등록. 현재 수량 등록을 먼저 저장해 주세요.");
  if (!Number.isFinite(input.qty) || input.qty < (input.kind === "count" ? 0 : 1)) throw new Error("올바른 수량을 적어 주세요.");
  const { data, error } = await getSupabase()
    .from("cabinet_moves")
    .insert({
      expiry: null,
      purpose: null,
      patient_id: null,
      patient_name: null,
      memo: null,
      diff: null,
      ...input,
    })
    .select()
    .single();
  if (error) fail("약장 기록", error.message);
  return data as CabinetMove;
}

/** 나감: 품목·수량·사유·환자·담당자. */
export function recordOut(p: {
  item_id: number;
  qty: number;
  purpose: CabinetPurpose;
  patient_id: number | null;
  patient_name: string | null;
  staff_name: string;
  memo?: string;
}): Promise<CabinetMove> {
  return insertMove({ ...p, kind: "out", memo: p.memo?.trim() || null });
}

/** 세어 맞춤: 센 수를 그대로 기록하고 차이를 남긴다. 차이가 있으면 사유 필수. */
export function recordCount(p: {
  item_id: number;
  counted: number;
  expected: number;
  staff_name: string;
  memo?: string;
}): Promise<CabinetMove> {
  const diff = p.counted - p.expected;
  if (diff !== 0 && !p.memo?.trim()) throw new Error("차이가 있으면 사유를 적어야 합니다.");
  return insertMove({ item_id: p.item_id, kind: "count", qty: p.counted, diff, staff_name: p.staff_name, memo: p.memo?.trim() || null });
}

/** 입고: 새 묶음. 유통기한은 선택. */
export function recordIn(p: { item_id: number; qty: number; expiry: string | null; staff_name: string; memo?: string }): Promise<CabinetMove> {
  return insertMove({ ...p, kind: "in", memo: p.memo?.trim() || null });
}

/** 폐기: 수량·사유. */
export function recordDiscard(p: { item_id: number; qty: number; staff_name: string; memo: string }): Promise<CabinetMove> {
  if (!p.memo.trim()) throw new Error("폐기 사유를 적어야 합니다.");
  return insertMove({ ...p, kind: "discard", memo: p.memo.trim() });
}
