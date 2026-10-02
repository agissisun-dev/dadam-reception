import { getSupabase } from "./supabaseClient";
import { addPrescription, createPatient, findPatientByPhone } from "./patients";
import { recordIn, recordOut } from "./cabinet";
import { daysFromPacks } from "./packs";
import { isValidPhone } from "./phone";
import { createJobs, deleteJobsOfEntry } from "./brew";
import { planJobsFromLedger } from "./brewRules";
import type { ParsedItem } from "./ledgerRules";
import type {
  LedgerCode,
  LedgerCodeInput,
  LedgerDay,
  LedgerEntry,
  LedgerEntryWithItems,
  LedgerExpense,
  LedgerItem,
} from "./types";

function fail(action: string, message: string): never {
  throw new Error(`${action} 실패: ${message}`);
}

const ENTRY_SELECT = "*, items:ledger_items(*), prescriptions(id, happy_calls(round, due_date, status))";

/* ---------- 약어 사전 ---------- */

export async function listCodes(includeInactive = false): Promise<LedgerCode[]> {
  let q = getSupabase().from("ledger_codes").select("*").order("sort_order").order("id");
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) fail("약어 표", error.message);
  return (data ?? []) as LedgerCode[];
}

export async function upsertCode(input: LedgerCodeInput & { id?: number }): Promise<LedgerCode> {
  const row = {
    code: input.code.trim(),
    name: input.name.trim(),
    group: input.group,
    cabinet_item_id: input.group === "cabinet" ? input.cabinet_item_id : null,
    decoction_kind: input.group === "decoction" ? input.decoction_kind : null,
    active: input.active,
    sort_order: input.sort_order,
  };
  if (!row.code) throw new Error("약어를 적어 주세요.");
  if (!row.name) throw new Error("이름을 적어 주세요.");
  const sb = getSupabase();
  const q = input.id
    ? sb.from("ledger_codes").update(row).eq("id", input.id).select("*").single()
    : sb.from("ledger_codes").insert(row).select("*").single();
  const { data, error } = await q;
  if (error) fail("약어 저장", error.message.includes("duplicate") ? "같은 약어가 이미 있습니다." : error.message);
  return data as LedgerCode;
}

/* ---------- 하루 읽기 ---------- */

export async function loadDay(day: string): Promise<{ dayRow: LedgerDay | null; entries: LedgerEntryWithItems[]; expenses: LedgerExpense[] }> {
  const sb = getSupabase();
  const [d, e, x] = await Promise.all([
    sb.from("ledger_days").select("*").eq("day", day).maybeSingle(),
    sb.from("ledger_entries").select(ENTRY_SELECT).eq("day", day).order("seq"),
    sb.from("ledger_expenses").select("*").eq("day", day).order("id"),
  ]);
  if (d.error) fail("마감 확인", d.error.message);
  if (e.error) fail("장부 불러오기", e.error.message);
  if (x.error) fail("지출 불러오기", x.error.message);
  return {
    dayRow: (d.data as LedgerDay | null) ?? null,
    entries: (e.data ?? []) as LedgerEntryWithItems[],
    expenses: (x.data ?? []) as LedgerExpense[],
  };
}

/** 한 달치(엑셀·현황용). monthKey = "2026-10" */
export async function listMonthEntries(monthKey: string): Promise<{ entries: LedgerEntryWithItems[]; expenses: LedgerExpense[]; days: LedgerDay[] }> {
  const sb = getSupabase();
  const from = `${monthKey}-01`;
  const [y, m] = monthKey.split("-").map(Number);
  const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const [e, x, d] = await Promise.all([
    sb.from("ledger_entries").select(ENTRY_SELECT).gte("day", from).lt("day", to).order("day").order("seq"),
    sb.from("ledger_expenses").select("*").gte("day", from).lt("day", to).order("day").order("id"),
    sb.from("ledger_days").select("*").gte("day", from).lt("day", to),
  ]);
  if (e.error) fail("장부 불러오기", e.error.message);
  if (x.error) fail("지출 불러오기", x.error.message);
  if (d.error) fail("마감 확인", d.error.message);
  return {
    entries: (e.data ?? []) as LedgerEntryWithItems[],
    expenses: (x.data ?? []) as LedgerExpense[],
    days: (d.data ?? []) as LedgerDay[],
  };
}

/** 줄이 있는데 마감 안 된 날(before 전까지), 오래된 순 */
export async function listLedgerDaysOpen(before: string): Promise<string[]> {
  const sb = getSupabase();
  const [e, d] = await Promise.all([
    sb.from("ledger_entries").select("day").lt("day", before),
    sb.from("ledger_days").select("day, closed_at").lt("day", before),
  ]);
  if (e.error) fail("장부 확인", e.error.message);
  if (d.error) fail("마감 확인", d.error.message);
  const closed = new Set(((d.data ?? []) as LedgerDay[]).filter((x) => x.closed_at).map((x) => x.day));
  const days = new Set(((e.data ?? []) as { day: string }[]).map((x) => x.day));
  return [...days].filter((x) => !closed.has(x)).sort();
}

/* ---------- 줄 저장 ---------- */

export type SaveEntryInput = {
  day: string;
  seq: number;
  patient_id: number | null;
  patient_name: string;
  new_patient_phone?: string;
  insurance_kind: string | null;
  cash: number;
  cash_receipt: number;
  card: number;
  note_raw: string;
  memo: string;
  staff_name: string;
  items: ParsedItem[];
  review: boolean;
  /** 포 수(없으면 처방·해피콜은 안 만든다). receive_date는 약대장 받는 날에서 온다. */
  decoction: { packs: number; per_day: number; receive_date: string } | null;
  /** 약대장 칸: 달이는 날·오전/오후·받는 방법·지역·파우치. 탕약 항목이 있으면 항상 만든다. */
  brew?: { day: string; slot: "am" | "pm"; delivery: "pickup" | "courier" | null; region: string; pouch: string | null } | null;
  /** 합계에서 빼기(붉은 금액) + 사유 */
  off_total?: boolean;
  pay_note?: string | null;
};

/**
 * 한 줄 저장. 순서: (환자 등록) → 줄 → 처방·해피콜 → 약장 나감 → 항목.
 * 뒤 단계가 실패하면 줄과 처방을 지운다(약장 나감은 못 지우므로 가장 뒤에 한다).
 */
export async function saveEntry(input: SaveEntryInput): Promise<LedgerEntryWithItems> {
  const sb = getSupabase();
  const name = input.patient_name.trim();
  if (!name) throw new Error("성함을 적어 주세요.");
  let patientId = input.patient_id;
  const decoctionItems = input.items.filter((i) => i.group === "decoction" && !i.unknown);

  if (!patientId && decoctionItems.length > 0 && input.new_patient_phone?.trim()) {
    const phone = input.new_patient_phone.trim();
    if (!isValidPhone(phone)) throw new Error("연락처는 숫자 11자리로 적어 주세요.");
    const found = await findPatientByPhone(phone);
    patientId = found
      ? found.id
      : (await createPatient({ name, phone, family_phone: "", family_note: "", condition: "general", memo: "" })).id;
  }
  const makePresc = decoctionItems.length > 0 && !!patientId && !!input.decoction && input.decoction.packs > 0;

  const { data: e, error } = await sb
    .from("ledger_entries")
    .insert({
      day: input.day,
      seq: input.seq,
      patient_id: patientId,
      patient_name: name,
      insurance_kind: input.insurance_kind?.trim() || null,
      cash: input.cash,
      cash_receipt: input.cash_receipt,
      card: input.card,
      note_raw: input.note_raw.trim(),
      memo: input.memo.trim() || null,
      staff_name: input.staff_name,
      packs_missing: decoctionItems.length > 0 && !makePresc,
      off_total: !!input.off_total,
      pay_note: input.off_total ? input.pay_note?.trim() || null : null,
    })
    .select("*")
    .single();
  if (error) fail("장부 저장", error.message.includes("ledger_entries_day_seq_key") ? "번호가 겹칩니다. 화면을 새로고침해 주세요." : error.message);
  const entry = e as LedgerEntry;

  try {
    let prescriptionId: number | null = null;
    if (makePresc && patientId && input.decoction) {
      const days = daysFromPacks(input.decoction.packs, input.decoction.per_day);
      const split = decoctionItems.find((i) => i.split)?.split ?? null;
      const memo = [decoctionItems.map((i) => i.name).join("·"), split ? `${split}회 분할 수령` : ""].filter(Boolean).join(" · ");
      const { prescription } = await addPrescription(patientId, {
        receive_date: input.decoction.receive_date,
        days,
        packs: input.decoction.packs,
        per_day: input.decoction.per_day,
        memo,
      });
      const { error: e1 } = await sb
        .from("prescriptions")
        .update({ ledger_entry_id: entry.id, brew_day: input.brew?.day ?? null, delivery: input.brew?.delivery ?? null })
        .eq("id", prescription.id);
      if (e1) fail("처방 연결", e1.message);
      prescriptionId = prescription.id;
    }

    // 약대장 칸 (탕약 항목이 있고 달이는 날이 있으면. 포 수가 없어도 탕전은 해야 하므로 만든다)
    if (decoctionItems.length > 0 && input.brew) {
      const fermented = decoctionItems.some((i) => i.decoction_kind === "fermented");
      const title = [...new Set(decoctionItems.map((i) => itemTitle(i)))].join("·");
      const split = decoctionItems.find((i) => i.split)?.split ?? null;
      await createJobs(
        planJobsFromLedger({
          patient_id: patientId,
          patient_name: name,
          title,
          fermented,
          day: input.brew.day,
          slot: input.brew.slot,
          delivery: input.brew.delivery,
          region: input.brew.region.trim() || null,
          pouch: input.brew.pouch,
          split,
          staff_name: input.staff_name,
          prescription_id: prescriptionId,
          ledger_entry_id: entry.id,
        }).map((j) => ({ ...j, memo: !makePresc ? "포 수 없음" : null })),
      );
    }

    const rows = [];
    for (const i of input.items) {
      let moveId: number | null = null;
      if (i.group === "cabinet" && i.cabinet_item_id && !i.unknown) {
        const mv = await recordOut({
          item_id: i.cabinet_item_id,
          qty: i.qty,
          purpose: input.review ? "review" : "sale",
          patient_id: patientId,
          patient_name: name,
          staff_name: input.staff_name,
          memo: `장부 ${input.day} #${input.seq}`,
        });
        moveId = mv.id;
      }
      rows.push({
        entry_id: entry.id,
        code: i.code,
        name: i.name,
        group: i.group,
        qty: i.qty,
        amount: i.amount,
        days: i.days,
        split: i.split,
        raw: i.raw,
        prescription_id: i.group === "decoction" ? prescriptionId : null,
        cabinet_move_id: moveId,
      });
    }
    let items: LedgerItem[] = [];
    if (rows.length > 0) {
      const { data, error: e2 } = await sb.from("ledger_items").insert(rows).select("*");
      if (e2) fail("항목 저장", e2.message);
      items = (data ?? []) as LedgerItem[];
    }
    const { data: full, error: e3 } = await sb.from("ledger_entries").select(ENTRY_SELECT).eq("id", entry.id).single();
    if (e3) fail("장부 다시 읽기", e3.message);
    return { ...(full as LedgerEntryWithItems), items };
  } catch (err) {
    await sb.from("brew_jobs").delete().eq("ledger_entry_id", entry.id);
    await sb.from("prescriptions").delete().eq("ledger_entry_id", entry.id);
    await sb.from("ledger_entries").delete().eq("id", entry.id);
    throw err;
  }
}

/** 약대장 칸 제목은 두 가지만: 탕약발효 · 탕약일반 (접수실 2026-10-02) */
function itemTitle(i: ParsedItem): string {
  return i.decoction_kind === "fermented" ? "탕약발효" : "탕약일반";
}

/** 돈·이름·구분·메모만 고치기(마감 전). 항목은 지우고 다시 넣는다. */
export async function updateEntryMoney(
  id: number,
  patch: {
    patient_name: string;
    insurance_kind: string | null;
    cash: number;
    cash_receipt: number;
    card: number;
    memo: string;
    off_total: boolean;
    pay_note: string | null;
  },
): Promise<void> {
  if (!patch.patient_name.trim()) throw new Error("성함을 적어 주세요.");
  const { error } = await getSupabase()
    .from("ledger_entries")
    .update({
      patient_name: patch.patient_name.trim(),
      insurance_kind: patch.insurance_kind?.trim() || null,
      cash: patch.cash,
      cash_receipt: patch.cash_receipt,
      card: patch.card,
      memo: patch.memo.trim() || null,
      off_total: patch.off_total,
      pay_note: patch.off_total ? patch.pay_note?.trim() || null : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) fail("장부 수정", error.message.includes("row-level") ? "마감된 날은 고칠 수 없습니다. 정정 줄로 남겨 주세요." : error.message);
}

/**
 * 줄 지우기(마감 전). 따라온 처방은 지우고(해피콜도 같이), 약장 나감은 되돌림 입고를 넣는다.
 * 해피콜에 연락 기록이 있으면 지우지 않는다.
 */
export async function deleteEntry(entry: LedgerEntryWithItems, staff: string): Promise<void> {
  const sb = getSupabase();
  const { data: presc, error: e0 } = await sb
    .from("prescriptions")
    .select("id, happy_calls(id, contact_logs(id))")
    .eq("ledger_entry_id", entry.id);
  if (e0) fail("처방 확인", e0.message);
  const list = (presc ?? []) as { id: number; happy_calls: { id: number; contact_logs: { id: number }[] }[] }[];
  if (list.some((p) => p.happy_calls.some((c) => c.contact_logs.length > 0))) {
    throw new Error("이 줄의 해피콜에 이미 연락 기록이 있어 지울 수 없습니다. 정정 줄로 남겨 주세요.");
  }
  for (const i of entry.items) {
    if (i.cabinet_move_id && i.group === "cabinet") {
      const code = i.code;
      const itemId = await cabinetItemOfMove(i.cabinet_move_id);
      if (itemId) await recordIn({ item_id: itemId, qty: i.qty, expiry: null, staff_name: staff, memo: `장부 줄 삭제 되돌림 (${entry.day} #${entry.seq} ${code})` });
    }
  }
  if (list.length > 0) {
    const { error: e1 } = await sb.from("prescriptions").delete().in("id", list.map((p) => p.id));
    if (e1) fail("처방 삭제", e1.message);
  }
  await deleteJobsOfEntry(entry.id);
  const { error } = await sb.from("ledger_entries").delete().eq("id", entry.id);
  if (error) fail("장부 줄 삭제", error.message.includes("row-level") ? "마감된 날은 지울 수 없습니다." : error.message);
}

async function cabinetItemOfMove(moveId: number): Promise<number | null> {
  const { data } = await getSupabase().from("cabinet_moves").select("item_id").eq("id", moveId).maybeSingle();
  return (data as { item_id: number } | null)?.item_id ?? null;
}

/* ---------- 지출 ---------- */

export async function addExpense(day: string, title: string, amount: number, staff: string): Promise<void> {
  if (!title.trim()) throw new Error("지출 내용을 적어 주세요.");
  const { error } = await getSupabase().from("ledger_expenses").insert({ day, title: title.trim(), amount, staff_name: staff });
  if (error) fail("지출 저장", error.message.includes("row-level") ? "마감된 날은 넣을 수 없습니다." : error.message);
}

export async function deleteExpense(id: number): Promise<void> {
  const { error } = await getSupabase().from("ledger_expenses").delete().eq("id", id);
  if (error) fail("지출 삭제", error.message);
}

/* ---------- 마감·정정 ---------- */

export async function closeDay(day: string, staff: string): Promise<void> {
  const sb = getSupabase();
  const { data } = await sb.from("ledger_days").select("day, closed_at").eq("day", day).maybeSingle();
  const now = new Date().toISOString();
  if (data) {
    if ((data as LedgerDay).closed_at) throw new Error("이미 마감된 날입니다.");
    const { error } = await sb.from("ledger_days").update({ closed_at: now, closed_by: staff }).eq("day", day);
    if (error) fail("마감", error.message);
  } else {
    const { error } = await sb.from("ledger_days").insert({ day, closed_at: now, closed_by: staff });
    if (error) fail("마감", error.message);
  }
}

/** 마감된 날의 정정 줄: 차이 금액만 적는다. */
export async function addCorrection(p: {
  day: string;
  seq: number;
  original: LedgerEntry;
  delta: { cash: number; cash_receipt: number; card: number };
  reason: string;
  staff: string;
}): Promise<void> {
  if (!p.reason.trim()) throw new Error("정정 사유를 적어 주세요.");
  if (p.delta.cash === 0 && p.delta.cash_receipt === 0 && p.delta.card === 0) throw new Error("바뀌는 금액이 없습니다.");
  const { error } = await getSupabase().from("ledger_entries").insert({
    day: p.day,
    seq: p.seq,
    patient_id: p.original.patient_id,
    patient_name: p.original.patient_name,
    insurance_kind: p.original.insurance_kind,
    cash: p.delta.cash,
    cash_receipt: p.delta.cash_receipt,
    card: p.delta.card,
    note_raw: "정정",
    staff_name: p.staff,
    kind: "correction",
    corrects_id: p.original.id,
    correction_reason: p.reason.trim(),
  });
  if (error) fail("정정 줄", error.message);
}
