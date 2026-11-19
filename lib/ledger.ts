import { getSupabase } from "./supabaseClient";
import { addPrescription, createPatient, findPatientByPhone } from "./patients";
import { recordIn, recordOut } from "./cabinet";
import { extractPacks } from "./cabinetRules";
import { brewTitle } from "./brewRules";
import { daysFromPacks } from "./packs";
import { isValidPhone } from "./phone";
import { createJobs, deleteJobsOfEntry } from "./brew";
import { planJobsFromLedger } from "./brewRules";
import { nextSeq, tallyByDay, type ParsedItem } from "./ledgerRules";

/** 붉은 칸 저장값: off_total(하나라도 붉음)·pay_note·red_fields */
function redColumns(red: RedField[] | undefined, payNote: string | null | undefined) {
  const fields = red ?? [];
  return { off_total: fields.length > 0, pay_note: fields.length > 0 ? payNote?.trim() || null : null, red_fields: fields };
}
import type {
  RedField,
  LedgerCode,
  LedgerCodeInput,
  LedgerDay,
  LedgerEntry,
  LedgerEntryWithItems,
  LedgerExpense,
  LedgerItem,
  PatientSource,
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
    cabinet_item_id: input.group === "cabinet" || input.group === "extract" ? input.cabinet_item_id : null,
    decoction_kind: input.group === "decoction" ? input.decoction_kind : null,
    per_day: input.group === "extract" ? input.per_day : null,
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
  const from = `${monthKey}-01`;
  const [y, m] = monthKey.split("-").map(Number);
  const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return listRangeEntries(from, to);
}

/** 기간(from 포함 ~ toExclusive 전날) 장부. 엑셀 기간 내려받기용. */
export async function listRangeEntries(from: string, toExclusive: string): Promise<{ entries: LedgerEntryWithItems[]; expenses: LedgerExpense[]; days: LedgerDay[] }> {
  const sb = getSupabase();
  const to = toExclusive;
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

/** 달력 칸용 한 달 요약(가볍게: 금액 칸과 마감만). monthKey = "2026-10" */
export async function listMonthTally(monthKey: string): Promise<Map<string, { count: number; subtotal: number; closed: boolean }>> {
  const sb = getSupabase();
  const from = `${monthKey}-01`;
  const [y, m] = monthKey.split("-").map(Number);
  const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const [e, d] = await Promise.all([
    sb.from("ledger_entries").select("day, kind, cash, cash_receipt, card, off_total, red_fields").gte("day", from).lt("day", to),
    sb.from("ledger_days").select("day, closed_at").gte("day", from).lt("day", to),
  ]);
  if (e.error) fail("장부 달력", e.error.message);
  if (d.error) fail("장부 달력", d.error.message);
  return tallyByDay(
    (e.data ?? []) as { day: string; kind: "normal" | "correction" | "refund"; cash: number; cash_receipt: number; card: number; off_total?: boolean }[],
    (d.data ?? []) as { day: string; closed_at: string | null }[],
  );
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
  new_patient_source?: PatientSource | "";
  new_patient_source_note?: string;
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
  /** 붉은 금액 칸(V16: 칸마다) + 사유. off_total은 붉은 칸이 하나라도 있으면 true로 같이 저장 */
  red_fields?: RedField[];
  pay_note?: string | null;
};

/** V16 SQL 전(red_fields 칸 없음)이면 그 칸만 빼고 다시 시도한다. */
function isRedFieldsMissing(message: string): boolean {
  return /red_fields/.test(message);
}

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
    // 같은 번호에 같은 이름이면 그 분, 다른 이름이면 가족으로 새로 등록(V18)
    const found = await findPatientByPhone(phone, name);
    patientId = found
      ? found.id
      : (await createPatient({ name, phone, family_phone: "", family_note: "", condition: "general", memo: "", source: input.new_patient_source ?? "", source_note: input.new_patient_source_note ?? "" })).id;
  }
  const makePresc = decoctionItems.length > 0 && !!patientId && !!input.decoction && input.decoction.packs > 0;

  const row = {
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
      ...redColumns(input.red_fields, input.pay_note),
  };
  let inserted = await sb.from("ledger_entries").insert(row).select("*").single();
  if (inserted.error && isRedFieldsMissing(inserted.error.message)) {
    const { red_fields: _r, ...legacy } = row; // eslint-disable-line @typescript-eslint/no-unused-vars
    inserted = await sb.from("ledger_entries").insert(legacy).select("*").single();
  }
  const { data: e, error } = inserted;
  if (error) fail("장부 저장", /day_seq_key/.test(error.message) ? "번호가 겹칩니다. 화면을 새로고침해 주세요." : error.message);
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
          purpose: i.free ? "service" : input.review ? "review" : "sale", // (F) 무상 → 서비스
          patient_id: patientId,
          patient_name: name,
          staff_name: input.staff_name,
          memo: `장부 ${input.day} #${input.seq}`,
        });
        moveId = mv.id;
      } else if (i.group === "extract" && i.cabinet_item_id && !i.unknown && extractPacks(i.days, i.per_day) > 0) {
        // 보험약(엑스제) 자동 차감: "오적산2일" → 2일 × 하루 포 수(기본 3) 포 나감 (V15)
        const mv = await recordOut({
          item_id: i.cabinet_item_id,
          qty: extractPacks(i.days, i.per_day),
          purpose: i.free ? "service" : "sale",
          patient_id: patientId,
          patient_name: name,
          staff_name: input.staff_name,
          memo: `장부 ${input.day} #${input.seq} ${i.raw}`,
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

/** 약대장 칸 제목: 보험(의보첩약) · 일반 · 발효 (사용자 2026-11-16, 옛 "탕약일반·탕약발효"는 화면에서 줄여 보임) */
function itemTitle(i: ParsedItem): string {
  return brewTitle(i.decoction_kind);
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
    red_fields: RedField[];
    pay_note: string | null;
  },
): Promise<void> {
  if (!patch.patient_name.trim()) throw new Error("성함을 적어 주세요.");
  const sb = getSupabase();
  const row = {
      patient_name: patch.patient_name.trim(),
      insurance_kind: patch.insurance_kind?.trim() || null,
      cash: patch.cash,
      cash_receipt: patch.cash_receipt,
      card: patch.card,
      memo: patch.memo.trim() || null,
      ...redColumns(patch.red_fields, patch.pay_note),
      updated_at: new Date().toISOString(),
  };
  let res = await sb.from("ledger_entries").update(row).eq("id", id);
  if (res.error && isRedFieldsMissing(res.error.message)) {
    const { red_fields: _r, ...legacy } = row; // eslint-disable-line @typescript-eslint/no-unused-vars
    res = await sb.from("ledger_entries").update(legacy).eq("id", id);
  }
  const { error } = res;
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
    if (entry.kind === "refund" && i.cabinet_move_id) {
      // 환불 줄을 지우면 반품 입고를 되돌린다(다시 나감)
      const itemId = await cabinetItemOfMove(i.cabinet_move_id);
      const qty = await cabinetMoveQty(i.cabinet_move_id);
      if (itemId && qty > 0) await recordOut({ item_id: itemId, qty, purpose: "other", patient_id: entry.patient_id, patient_name: entry.patient_name, staff_name: staff, memo: `환불 줄 삭제 되돌림 (${entry.day} #${entry.seq})` });
      continue;
    }
    if (i.cabinet_move_id && (i.group === "cabinet" || i.group === "extract")) {
      const code = i.code;
      const itemId = await cabinetItemOfMove(i.cabinet_move_id);
      const qty = i.group === "extract" ? await cabinetMoveQty(i.cabinet_move_id) : i.qty;
      if (itemId && qty > 0) await recordIn({ item_id: itemId, qty, expiry: null, staff_name: staff, memo: `장부 줄 삭제 되돌림 (${entry.day} #${entry.seq} ${code})` });
    }
  }
  if (list.length > 0) {
    const { error: e1 } = await sb.from("prescriptions").delete().in("id", list.map((p) => p.id));
    if (e1) fail("처방 삭제", e1.message);
  }
  await deleteJobsOfEntry(entry.id);
  const { error } = await sb.from("ledger_entries").delete().eq("id", entry.id);
  if (error) fail("장부 줄 삭제", error.message.includes("row-level") ? "마감된 날은 지울 수 없습니다." : error.message);
  await renumberAfterDelete(entry.day, entry.seq);
}

/**
 * 줄을 지우면 뒤 번호를 하나씩 당겨 1·2·3…이 이어지게 한다(접수실 2026-10-08: 지우고 다시 넣으면 번호가 건너뛰어 보기 불편).
 * 작은 번호부터 차례로 고쳐야 (clinic, day, seq) 유일 조건에 안 걸린다.
 */
export async function renumberAfterDelete(day: string, deletedSeq: number): Promise<void> {
  const sb = getSupabase();
  const { data, error } = await sb.from("ledger_entries").select("id, seq").eq("day", day).gt("seq", deletedSeq).order("seq");
  if (error) fail("번호 정리", error.message);
  for (const r of (data ?? []) as { id: number; seq: number }[]) {
    const { error: e } = await sb.from("ledger_entries").update({ seq: r.seq - 1 }).eq("id", r.id);
    if (e) fail("번호 정리", e.message);
  }
}

async function cabinetMoveQty(moveId: number): Promise<number> {
  const { data } = await getSupabase().from("cabinet_moves").select("qty").eq("id", moveId).maybeSingle();
  return (data as { qty: number } | null)?.qty ?? 0;
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

/**
 * 환불 줄 (V18, 2026-11-19 사용자 "환불줄을 하나 만들어 놓는게 좋을 거 같아").
 * 돌려준 날(오늘) 장부에 kind='refund'로 마이너스 금액을 넣고, 반품한 항목은 재고에 입고로 되돌린다.
 * 원래 줄은 그대로 둔다(그날 서랍 돈과 맞아야 하므로). 전체 취소면 처방·해피콜도 끝낸다.
 */
export type RefundInput = {
  day: string; // 돌려준 날(보통 오늘)
  original: LedgerEntryWithItems;
  money: { cash: number; cash_receipt: number; card: number }; // 돌려주는 금액(양수로 받아 마이너스로 저장)
  items: { item: LedgerItem; qty: number }[]; // 반품 항목과 수량(0이면 제외)
  reason: string;
  closePrescription: boolean; // 탕약 전체 취소: 처방·해피콜 끝내기
  staff: string;
};

export async function addRefund(p: RefundInput): Promise<void> {
  if (!p.reason.trim()) throw new Error("환불 사유를 적어 주세요.");
  const money = { cash: Math.abs(p.money.cash), cash_receipt: Math.abs(p.money.cash_receipt), card: Math.abs(p.money.card) };
  const back = p.items.filter((x) => x.qty > 0);
  if (money.cash + money.cash_receipt + money.card === 0 && back.length === 0) throw new Error("돌려주는 금액이나 반품 항목이 있어야 합니다.");
  const sb = getSupabase();
  const { data: seqRows, error: e0 } = await sb.from("ledger_entries").select("seq").eq("day", p.day);
  if (e0) fail("환불 줄 번호", e0.message);
  const seq = nextSeq((seqRows ?? []) as { seq: number }[]);
  const { data: e, error } = await sb
    .from("ledger_entries")
    .insert({
      day: p.day,
      seq,
      patient_id: p.original.patient_id,
      patient_name: p.original.patient_name,
      insurance_kind: p.original.insurance_kind,
      cash: -money.cash,
      cash_receipt: -money.cash_receipt,
      card: -money.card,
      note_raw: back.length > 0 ? `환불 ${back.map((x) => `${x.item.name}${x.qty > 1 ? x.qty : ""}`).join(",")}` : "환불",
      memo: null,
      staff_name: p.staff,
      kind: "refund",
      corrects_id: p.original.id,
      correction_reason: p.reason.trim(),
    })
    .select("*")
    .single();
  if (error) fail("환불 줄", /kind_check/.test(error.message) ? "환불 줄 표 설정(supabase/schema-v18-family-phone-refund.sql)을 먼저 실행해 주세요." : error.message);
  const entry = e as LedgerEntry;
  const rows = [];
  for (const x of back) {
    let moveId: number | null = null;
    const itemId = x.item.cabinet_move_id ? await cabinetItemOfMove(x.item.cabinet_move_id) : null;
    if (itemId) {
      const mv = await recordIn({ item_id: itemId, qty: x.qty, expiry: null, staff_name: p.staff, memo: `환불 반품 ${p.day} #${seq} ${p.original.patient_name}` });
      moveId = mv.id;
    }
    rows.push({ entry_id: entry.id, code: x.item.code, name: x.item.name, group: x.item.group, qty: x.qty, amount: null, days: null, split: null, raw: `환불 ${x.item.raw}`, prescription_id: null, cabinet_move_id: moveId });
  }
  if (rows.length > 0) {
    const { error: e2 } = await sb.from("ledger_items").insert(rows);
    if (e2) fail("환불 항목", e2.message);
  }
  if (p.closePrescription) {
    const { data: presc } = await sb.from("prescriptions").select("id").eq("ledger_entry_id", p.original.id);
    const ids = ((presc ?? []) as { id: number }[]).map((r) => r.id);
    if (ids.length > 0) {
      await sb.from("prescriptions").update({ status: "closed" }).in("id", ids);
      await sb.from("happy_calls").update({ status: "closed" }).in("prescription_id", ids).eq("status", "pending");
    }
  }
}

/** 환자의 최종 내원일(장부에 적힌 마지막 날). 없으면 null. 환자 찾기 요약용. */
export async function lastVisitDay(patientId: number): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from("ledger_entries")
    .select("day")
    .eq("patient_id", patientId)
    .eq("kind", "normal")
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("최종 내원일", error.message);
  return (data as { day: string } | null)?.day ?? null;
}
