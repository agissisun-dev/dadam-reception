import { getSupabase } from "./supabaseClient";
import { expectedStock, nearestExpiry, remainingLots, type Lot } from "./cabinetRules";
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
  const { data, error } = await getSupabase().from("cabinet_items").insert(input).select().single();
  if (error) fail("품목 추가", error.message);
  return data as CabinetItem;
}

export async function updateCabinetItem(id: number, input: Partial<CabinetItemInput>): Promise<CabinetItem> {
  const { data, error } = await getSupabase().from("cabinet_items").update(input).eq("id", id).select().single();
  if (error) fail("품목 수정", error.message);
  return data as CabinetItem;
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

export async function loadCabinet(): Promise<{ items: CabinetItem[]; moves: CabinetMove[]; statuses: CabinetStatus[] }> {
  const [items, moves] = await Promise.all([listCabinetItems(), listAllCabinetMoves()]);
  return { items, moves, statuses: buildStatuses(items, moves) };
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
