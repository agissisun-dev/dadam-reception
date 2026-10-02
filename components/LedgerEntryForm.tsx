"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { planHappyCalls } from "@/lib/happyCallRules";
import { saveEntry, upsertCode } from "@/lib/ledger";
import { GROUP_LABEL, GROUP_ORDER, chipClass, parseNote, parseWon, won, type ParsedItem } from "@/lib/ledgerRules";
import { DEFAULT_PER_DAY, PACK_PRESETS, daysFromPacks } from "@/lib/packs";
import { maskPhone } from "@/lib/phone";
import { weekdayKo } from "@/lib/dates";
import { conditionLabel } from "@/lib/conditions";
import type { StaffName } from "@/lib/staff";
import type { CabinetItem, DecoctionKind, LedgerCode, LedgerGroup, Patient } from "@/lib/types";

type Props = {
  day: string;
  seq: number;
  codes: LedgerCode[];
  patients: Patient[];
  cabinetItems: CabinetItem[];
  staff: StaffName;
  onSaved: () => void;
  onCodesChanged: () => void;
};

const INPUT = "h-10 w-full rounded border border-stone-300 px-2 text-sm";
const LABEL = "text-[11px] text-stone-500";
const chip = (active: boolean) =>
  `rounded border px-2.5 py-1 text-sm ${active ? "border-amber-700 bg-amber-700 text-white" : "border-amber-600 bg-white text-amber-900"}`;

/** 모르는 약어를 그 자리에서 사전에 넣는 작은 폼 */
function UnknownCodeForm({
  raw,
  cabinetItems,
  onDone,
  onCancel,
}: {
  raw: string;
  cabinetItems: CabinetItem[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const guess = raw.replace(/[\d().#*\-]+[tT알개pP일]?$/g, "").trim() || raw;
  const [code, setCode] = useState(guess);
  const [name, setName] = useState(guess);
  const [group, setGroup] = useState<LedgerGroup>("treatment");
  const [cabinetId, setCabinetId] = useState<number | "">("");
  const [kind, setKind] = useState<DecoctionKind>("general");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await upsertCode({
        code,
        name,
        group,
        cabinet_item_id: group === "cabinet" && cabinetId !== "" ? Number(cabinetId) : null,
        decoction_kind: group === "decoction" ? kind : null,
        active: true,
        sort_order: 50,
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded border border-red-200 bg-red-50 p-2 text-sm">
      <span className="w-full text-xs text-red-700">&ldquo;{raw}&rdquo;는 모르는 말입니다. 무엇인지 한 번만 알려 주시면 다음부터 알아봅니다.</span>
      <label className="block">
        <span className={LABEL}>약어 (치는 글자)</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} className="h-9 w-28 rounded border border-stone-300 px-2 text-sm" />
      </label>
      <label className="block">
        <span className={LABEL}>이름</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-36 rounded border border-stone-300 px-2 text-sm" />
      </label>
      <label className="block">
        <span className={LABEL}>묶음</span>
        <select value={group} onChange={(e) => setGroup(e.target.value as LedgerGroup)} className="h-9 rounded border border-stone-300 px-2 text-sm">
          {GROUP_ORDER.map((g) => (
            <option key={g} value={g}>{GROUP_LABEL[g]}</option>
          ))}
        </select>
      </label>
      {group === "cabinet" && (
        <label className="block">
          <span className={LABEL}>약장 품목</span>
          <select value={cabinetId} onChange={(e) => setCabinetId(e.target.value === "" ? "" : Number(e.target.value))} className="h-9 rounded border border-stone-300 px-2 text-sm">
            <option value="">(연결 안 함)</option>
            {cabinetItems.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )}
      {group === "decoction" && (
        <label className="block">
          <span className={LABEL}>탕약 종류</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as DecoctionKind)} className="h-9 rounded border border-stone-300 px-2 text-sm">
            <option value="insurance">보험</option>
            <option value="general">일반</option>
            <option value="fermented">발효</option>
          </select>
        </label>
      )}
      <button type="button" onClick={save} className="h-9 rounded bg-stone-900 px-3 text-sm text-white">약어 저장</button>
      <button type="button" onClick={onCancel} className="h-9 rounded border border-stone-300 px-3 text-sm">닫기</button>
      {error && <span className="w-full text-xs text-red-700">{error}</span>}
    </div>
  );
}

export default function LedgerEntryForm({ day, seq, codes, patients, cabinetItems, staff, onSaved, onCodesChanged }: Props) {
  const [name, setName] = useState("");
  const [patientId, setPatientId] = useState<number | null>(null);
  const [insuranceKind, setInsuranceKind] = useState("");
  const [cash, setCash] = useState("");
  const [cashReceipt, setCashReceipt] = useState("");
  const [card, setCard] = useState("");
  const [note, setNote] = useState("");
  const [packs, setPacks] = useState("");
  const [perDay, setPerDay] = useState(DEFAULT_PER_DAY);
  const [receiveDate, setReceiveDate] = useState(day);
  const [newPhone, setNewPhone] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseNote(note, codes), [note, codes]);
  const decoction = parsed.items.filter((i) => i.group === "decoction" && !i.unknown);
  const hasDecoction = decoction.length > 0;
  const packsN = Number(packs);
  const days = daysFromPacks(packsN, perDay);
  const preview = hasDecoction && days > 0 ? planHappyCalls(receiveDate, days) : [];

  const trimmed = name.trim();
  const sameName = trimmed ? patients.filter((p) => p.name === trimmed) : [];
  const linked: Patient | null = patientId
    ? (patients.find((p) => p.id === patientId) ?? null)
    : sameName.length === 1
      ? sameName[0]
      : null;

  function reset() {
    setName("");
    setPatientId(null);
    setInsuranceKind("");
    setCash("");
    setCashReceipt("");
    setCard("");
    setNote("");
    setPacks("");
    setPerDay(DEFAULT_PER_DAY);
    setReceiveDate(day);
    setNewPhone("");
    setMemo("");
    setFixing(null);
    nameRef.current?.focus();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!trimmed) {
      setError("성함을 적어 주세요.");
      return;
    }
    setBusy(true);
    try {
      await saveEntry({
        day,
        seq,
        patient_id: linked?.id ?? null,
        patient_name: trimmed,
        new_patient_phone: linked ? undefined : newPhone,
        insurance_kind: insuranceKind || null,
        cash: parseWon(cash),
        cash_receipt: parseWon(cashReceipt),
        card: parseWon(card),
        note_raw: note,
        memo,
        staff_name: staff,
        items: parsed.items,
        review: parsed.review,
        decoction: hasDecoction && packsN > 0 ? { packs: packsN, per_day: perDay, receive_date: receiveDate } : null,
      });
      reset();
      onSaved();
    } catch (err) {
      setError(`저장되지 않았습니다. ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const subtotal = parseWon(cash) + parseWon(cashReceipt) + parseWon(card);

  return (
    <form onSubmit={submit} className="rounded-lg border border-[#16863b] bg-white p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold">새 줄 · {seq}번</p>
        <p className="text-xs text-stone-500">엑셀과 같은 순서입니다. 탭으로 넘어가며 치고, 엔터로 저장합니다.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-12">
        <label className="col-span-2 block lg:col-span-2">
          <span className={LABEL}>성함</span>
          <input
            ref={nameRef}
            list="ledger-patients"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setPatientId(null);
            }}
            autoComplete="off"
            className={`${INPUT} ${linked ? "border-[#16863b]" : ""}`}
          />
          <datalist id="ledger-patients">
            {patients.map((p) => (
              <option key={p.id} value={p.name}>{`${maskPhone(p.phone)} · ${conditionLabel(p.condition)}`}</option>
            ))}
          </datalist>
        </label>
        <label className="block lg:col-span-1">
          <span className={LABEL}>구분</span>
          <input list="ledger-kinds" value={insuranceKind} onChange={(e) => setInsuranceKind(e.target.value)} placeholder="1종" className={INPUT} />
          <datalist id="ledger-kinds">
            <option value="1종" />
            <option value="2종" />
            <option value="일반" />
            <option value="자보" />
          </datalist>
        </label>
        <label className="block lg:col-span-1">
          <span className={LABEL}>현금</span>
          <input value={cash} onChange={(e) => setCash(e.target.value)} inputMode="numeric" placeholder="0" className={`${INPUT} text-right`} />
        </label>
        <label className="block lg:col-span-1">
          <span className={LABEL}>현영</span>
          <input value={cashReceipt} onChange={(e) => setCashReceipt(e.target.value)} inputMode="numeric" placeholder="0" className={`${INPUT} text-right`} />
        </label>
        <label className="block lg:col-span-1">
          <span className={LABEL}>카드</span>
          <input value={card} onChange={(e) => setCard(e.target.value)} inputMode="numeric" placeholder="0" className={`${INPUT} text-right`} />
        </label>
        <label className="col-span-2 block sm:col-span-4 lg:col-span-4">
          <span className={LABEL}>기타 (지금처럼 약어로, 쉼표로 이어서)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="전,습,일반(42),소합원3T" autoComplete="off" className={INPUT} />
        </label>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-4 lg:col-span-2">
          <p className="flex-1 text-right text-sm text-stone-500">
            소계 <b className="text-stone-800">{won(subtotal)}</b>
          </p>
          <button type="submit" disabled={busy} className="h-10 rounded bg-[#16863b] px-4 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>

      {sameName.length > 1 && !patientId && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-stone-500">같은 이름이 {sameName.length}명입니다. 누구인가요?</span>
          {sameName.map((p) => (
            <button key={p.id} type="button" onClick={() => setPatientId(p.id)} className="rounded border border-stone-300 px-2 py-1">
              {p.name} · {maskPhone(p.phone)} · {conditionLabel(p.condition)}
            </button>
          ))}
        </div>
      )}
      {linked && (
        <p className="mt-1 text-xs text-[#16863b]">
          환자 연결됨 · {maskPhone(linked.phone)} · {conditionLabel(linked.condition)}
        </p>
      )}

      {(parsed.items.length > 0 || parsed.review) && (
        <div className="mt-3 rounded bg-stone-50 p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] text-stone-500">앱이 알아본 항목</span>
            {parsed.items.map((i, idx) => (
              <ItemChip key={idx} item={i} onFix={() => setFixing(i.raw)} />
            ))}
            {parsed.review && <span className="rounded-full border border-[#06478f] bg-[#f5f8fc] px-2.5 py-0.5 text-xs text-[#06366f]">리뷰 증정 → 약장 사유 리뷰</span>}
          </div>
          {fixing && (
            <UnknownCodeForm
              raw={fixing}
              cabinetItems={cabinetItems}
              onDone={() => {
                setFixing(null);
                onCodesChanged();
              }}
              onCancel={() => setFixing(null)}
            />
          )}

          {hasDecoction && (
            <div className="mt-2 flex flex-wrap items-end gap-3 border-t border-stone-200 pt-2">
              <div>
                <span className="text-[11px] font-bold text-amber-800">탕약 포 수 (해피콜 날짜 계산용)</span>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {PACK_PRESETS.map((n) => (
                    <button key={n} type="button" onClick={() => setPacks(String(n))} className={chip(packsN === n)}>{n}포</button>
                  ))}
                  <input type="number" min={1} value={packs} onChange={(e) => setPacks(e.target.value)} placeholder="직접" className="h-8 w-20 rounded border border-stone-300 px-2 text-sm" />
                  <select value={perDay} onChange={(e) => setPerDay(Number(e.target.value))} className="h-8 rounded border border-stone-300 px-1.5 text-sm">
                    {[1, 2, 3].map((n) => (
                      <option key={n} value={n}>하루 {n}포</option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="block">
                <span className={LABEL}>약 받는 날</span>
                <input type="date" value={receiveDate} onChange={(e) => setReceiveDate(e.target.value)} className="h-8 rounded border border-stone-300 px-2 text-sm" />
              </label>
              {!linked && (
                <label className="block">
                  <span className={LABEL}>새 환자면 연락처 (해피콜용, 11자리)</span>
                  <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} inputMode="numeric" placeholder="01012345678" className="h-8 w-40 rounded border border-stone-300 px-2 text-sm" />
                </label>
              )}
              <p className="text-xs text-stone-600">
                {preview.length > 0 ? (
                  <>
                    저장하면 처방 {packsN}포 · {days}일분 → 해피콜{" "}
                    {preview.map((c) => `${c.round}차 ${c.due_date.slice(5)} (${weekdayKo(c.due_date)})`).join(" · ")}
                    {!linked && !newPhone && <span className="text-red-700"> — 환자 연결이 없어 처방은 만들지 않습니다</span>}
                  </>
                ) : (
                  <span className="text-amber-800">포 수를 고르면 해피콜 날짜가 미리 보입니다. 안 고르면 &ldquo;포 수 없음&rdquo;으로 남습니다.</span>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택)" className="h-8 flex-1 rounded border border-stone-200 px-2 text-xs" />
        <span className="text-xs text-stone-500">처리자 {staff}</span>
      </div>
      {error && <p className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
    </form>
  );
}

function ItemChip({ item, onFix }: { item: ParsedItem; onFix: () => void }) {
  const text = item.unknown
    ? `"${item.raw}" 모르는 말 — 눌러서 정하기`
    : [item.name, item.qty > 1 ? item.qty : "", item.days ? `${item.days}일` : "", item.amount ? `${item.amount / 10000}만원` : "", item.split ? `${item.split}회 분할` : ""]
        .filter(Boolean)
        .join(" ");
  if (item.unknown) {
    return (
      <button type="button" onClick={onFix} className={`rounded-full border px-2.5 py-0.5 text-xs ${chipClass(item.group, true)}`}>
        {text}
      </button>
    );
  }
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs ${chipClass(item.group)}`}>{text}</span>;
}
