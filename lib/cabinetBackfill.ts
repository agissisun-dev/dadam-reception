import { getSupabase } from "./supabaseClient";
import { recordOut } from "./cabinet";
import { extractPacks } from "./cabinetRules";
import { isFree } from "./ledgerRules";
import type { CabinetItem, LedgerCode, LedgerItem } from "./types";

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

type Row = LedgerItem & { entry: { id: number; day: string; seq: number; patient_id: number | null; patient_name: string; kind: string } };

/**
 * 품목을 새로 만들고 수량을 넣은 날부터, 그 뒤 장부에 적힌 같은 이름의 항목을 재고에서 소급해 뺀다
 * (사용자 2026-11-19 "재고수량을 넣은 날부터는 소급해서 다 적용"). 이미 재고와 이어진 항목은 건너뛴다.
 * 보험약은 일수 × 하루 포 수(약어 표 per_day, 없으면 3), 나머지는 개수.
 */
export async function backfillFromLedger(item: CabinetItem, fromDay: string, staff: string): Promise<{ applied: number; qty: number }> {
  const sb = getSupabase();
  const [{ data, error }, codesRes] = await Promise.all([
    sb
      .from("ledger_items")
      .select("*, entry:ledger_entries!inner(id, day, seq, patient_id, patient_name, kind)")
      .is("cabinet_move_id", null)
      .gte("entry.day", fromDay),
    sb.from("ledger_codes").select("*"),
  ]);
  if (error) throw new Error(`장부 항목 읽기에 실패했습니다. ${error.message}`);
  const codes = (codesRes.data ?? []) as LedgerCode[];
  const key = norm(item.name);
  const matches = ((data ?? []) as Row[]).filter((r) => {
    if (r.entry.kind !== "normal") return false;
    // 같은 이름이라도 다른 장부 묶음은 재고 판매로 연결하지 않는다.
    if (r.group !== (item.kind === "insured" ? "extract" : "cabinet")) return false;
    if (r.cabinet_move_id) return false;
    const code = codes.find((c) => c.code === r.code);
    if (code?.cabinet_item_id && code.cabinet_item_id !== item.id) return false; // 다른 품목에 이어진 약어
    return norm(r.name) === key || norm(r.code) === key || (code?.cabinet_item_id === item.id);
  });
  let applied = 0;
  let total = 0;
  for (const r of matches.sort((a, b) => a.entry.day.localeCompare(b.entry.day) || a.entry.seq - b.entry.seq)) {
    const code = codes.find((c) => c.code === r.code);
    const qty = item.kind === "insured" ? extractPacks(r.days, code?.per_day ?? null) : r.qty;
    if (qty <= 0) continue;
    const mv = await recordOut({
      item_id: item.id,
      qty,
      purpose: isFree(r.raw) ? "service" : "sale",
      patient_id: r.entry.patient_id,
      patient_name: r.entry.patient_name,
      staff_name: staff,
      memo: `장부 ${r.entry.day} #${r.entry.seq} (소급)`,
    });
    const { error: e2 } = await sb.from("ledger_items").update({ cabinet_move_id: mv.id }).eq("id", r.id);
    if (e2) throw new Error(`장부 항목 연결에 실패했습니다. ${e2.message}`);
    applied += 1;
    total += qty;
  }
  return { applied, qty: total };
}
