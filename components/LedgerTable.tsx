"use client";

import { useState } from "react";
import Link from "next/link";
import MoneyInput from "@/components/MoneyInput";
import { updateEntryWithStock } from "@/lib/ledger";
import { extractPacks } from "@/lib/cabinetRules";
import { INSURANCE_KINDS, PAY_NOTES, parseNote, allRed, chipClass, itemLabel, itemSummary, parseWon, redFieldsOf, sumEntries, won } from "@/lib/ledgerRules";
import { editableNote, previewNoteEdit } from "@/lib/ledgerEditRules";
import type { CabinetItem, LedgerCode, LedgerEntryWithItems, RedField } from "@/lib/types";

type Props = {
  entries: LedgerEntryWithItems[];
  codes: LedgerCode[];
  cabinetItems: CabinetItem[];
  staff: string;
  closed: boolean;
  onDelete: (e: LedgerEntryWithItems) => void;
  onCorrect: (e: LedgerEntryWithItems) => void;
  onRefund: (e: LedgerEntryWithItems) => void;
  onChanged: () => void;
};

const GRID = "grid grid-cols-[36px_100px_64px_88px_88px_96px_96px_minmax(180px,1fr)_200px_72px] items-center gap-x-1 px-3";
const NUM = "text-right tabular-nums";
const dash = <span className="text-stone-300">—</span>;
const IN = "h-8 w-full rounded border border-stone-300 px-1.5 text-sm";

function money(n: number, opts: { signed?: boolean; red?: boolean } = {}) {
  if (n === 0) return dash;
  const cls = opts.red ? "text-red-700 font-bold" : opts.signed && n < 0 ? "text-red-700" : "";
  return <span className={cls}>{opts.signed && n > 0 ? "+" : ""}{won(n)}</span>;
}

/** 따라온 것: 해피콜 날짜 · 약장 나감 · 포 수 없음 · 환자 연결 안 됨 */
function Followed({ e }: { e: LedgerEntryWithItems }) {
  const out: React.ReactNode[] = [];
  const calls = e.prescriptions?.flatMap((p) => p.happy_calls) ?? [];
  if (calls.length > 0) {
    const sorted = [...calls].sort((a, b) => a.round - b.round);
    out.push(
      <span key="hc" className="text-amber-800">
        해피콜 {sorted.map((c) => c.due_date.slice(5).replace("-", "/")).join(" · ")}
      </span>,
    );
  }
  if (e.kind === "refund") {
    const back = e.items.filter((i) => i.cabinet_move_id);
    return back.length > 0 ? <span className="text-xs text-[#06366f]">반품 입고 {back.map((i) => `${i.name} +${i.qty}`).join(", ")}</span> : dash;
  }
  const cab = e.items.filter((i) => (i.group === "cabinet" || i.group === "extract") && i.cabinet_move_id);
  if (cab.length > 0) {
    out.push(
      <span key="cab" className="text-[#06366f]">
        재고 {cab.map((i) => `${i.name} −${i.group === "extract" ? `${extractPacks(i.days, null)}포` : i.qty}`).join(", ")}
      </span>,
    );
  }
  if (e.packs_missing) {
    out.push(
      <span key="pm" className="text-red-700">
        {e.patient_id ? "포 수 없음 — 환자 상세에서 처방 추가" : "환자 연결 안 됨 — 해피콜 못 잡음"}
      </span>,
    );
  }
  if (out.length === 0) return dash;
  return <span className="flex flex-col gap-0.5 text-xs">{out}</span>;
}

/** 기타와 메모를 분리하고 재고는 원자적으로 반영한다. */
function EditRow({ e, codes, cabinetItems, staff, onDone, onCancel }: { e: LedgerEntryWithItems; codes: LedgerCode[]; cabinetItems: CabinetItem[]; staff: string; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(e.patient_name);
  const [kind, setKind] = useState(e.insurance_kind ?? "");
  const [cash, setCash] = useState(e.cash ? String(e.cash) : "");
  const [cashReceipt, setCashReceipt] = useState(e.cash_receipt ? String(e.cash_receipt) : "");
  const [card, setCard] = useState(e.card ? String(e.card) : "");
  const [memo, setMemo] = useState(e.memo ?? "");
  const originalNote = editableNote(e);
  const [note, setNote] = useState(originalNote);
  const noteChanged = note !== originalNote;
  const parsed = parseNote(note, codes, cabinetItems);
  const preview = previewNoteEdit(parsed.items, e.items);
  const missingDays = noteChanged && preview.some(({item,unchanged}) => !unchanged && item.group === "extract" && item.cabinet_item_id && !item.days);
  const [red, setRed] = useState<RedField[]>(() => redFieldsOf(e));
  const [payNote, setPayNote] = useState(e.pay_note ?? "계좌입금");
  const toggleRed = (f: RedField) => setRed((r) => (r.includes(f) ? r.filter((x) => x !== f) : [...r, f]));
  const offTotal = red.length > 0;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await updateEntryWithStock(e, {
        patient_name: name,
        insurance_kind: kind || null,
        cash: parseWon(cash),
        cash_receipt: parseWon(cashReceipt),
        card: parseWon(card),
        memo,
        red_fields: red,
        pay_note: offTotal ? payNote : null,
      }, noteChanged ? {note_raw: note, items: parsed.items, review: parsed.review} : null, staff);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-stone-100 bg-amber-50/40 px-3 py-2 text-sm">
      <div className={GRID}>
        <div className="text-stone-400">{e.seq}</div>
        <div><input value={name} onChange={(x) => setName(x.target.value)} className={IN} /></div>
        <div>
          <select value={kind} onChange={(x) => setKind(x.target.value)} className={IN}>
            <option value="">(없음)</option>
            {kind && !(INSURANCE_KINDS as readonly string[]).includes(kind) && <option value={kind}>{kind}</option>}
            {INSURANCE_KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
        <div><MoneyInput compact value={cash} onChange={setCash} red={red.includes("cash")} onToggleRed={() => toggleRed("cash")} /></div>
        <div><MoneyInput compact value={cashReceipt} onChange={setCashReceipt} red={red.includes("cash_receipt")} onToggleRed={() => toggleRed("cash_receipt")} /></div>
        <div><MoneyInput compact value={card} onChange={setCard} red={red.includes("card")} onToggleRed={() => toggleRed("card")} /></div>
        <div className={`${NUM} font-bold`}>{won(parseWon(cash) + parseWon(cashReceipt) + parseWon(card))}</div>
        <div className="pl-3"><input aria-label="기타 항목 수정" value={note} onChange={(x) => setNote(x.target.value)} placeholder="삼소음2일,소합원3T" className={IN} /></div>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          {offTotal ? (
            <select value={payNote} onChange={(x) => setPayNote(x.target.value)} className="h-7 rounded border border-red-300 px-1 text-xs font-bold text-red-700">
              {PAY_NOTES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          ) : (
            <span className="text-[10px] text-stone-400">금액 옆 ● = 그 칸만 붉게</span>
          )}
        </div>
        <div className="flex flex-col gap-1 text-xs">
          <button type="button" onClick={save} disabled={busy || !!missingDays} className="rounded bg-stone-900 px-2 py-1 text-white disabled:opacity-50">저장</button>
          <button type="button" onClick={onCancel} className="rounded border border-stone-300 px-2 py-1">취소</button>
        </div>
      </div>
      <label className="mt-2 block text-xs text-stone-600">메모 (재고 반영 없음)<input aria-label="메모 (재고 반영 없음)" value={memo} onChange={x=>setMemo(x.target.value)} className={IN} /></label>
      <p className="mt-2 text-[11px] text-stone-600">기타에 품목을 추가하면 재고가 반영됩니다. 수량 변경·삭제는 이전 차감을 되돌린 뒤 반영하며, 같은 내용 재저장은 중복 차감하지 않습니다. 연결된 탕약 처방은 그대로 유지하세요.</p>
      {noteChanged && <div aria-label="기타 수정 재고 미리보기" className="mt-2 flex flex-wrap gap-2 text-xs">{preview.map(({item,unchanged},index)=>{
        const ci=cabinetItems.find(c=>c.id===item.cabinet_item_id);
        return <span key={index} className={chipClass(item.group,item.unknown)}>{item.raw} · {unchanged ? "기존 연결 유지" : item.unknown ? "미등록: 재고 차감 없음" : item.cabinet_item_id && item.group==="extract" ? item.days ? "재고 −"+extractPacks(item.days,item.per_day)+"포" : "일수 필요" : item.cabinet_item_id && item.group==="cabinet" ? "재고 −"+item.qty+(ci?.unit??"개") : "재고 차감 없음"}</span>;
      })}</div>}
      {missingDays && <p role="alert" className="mt-1 text-xs text-red-700">보험약은 삼소음2일처럼 일수를 적어 주세요.</p>}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

export default function LedgerTable({ entries, codes, cabinetItems, staff, closed, onDelete, onCorrect, onRefund, onChanged }: Props) {
  const [editing, setEditing] = useState<number | null>(null);
  const total = sumEntries(entries);
  const normal = entries.filter((e) => e.kind === "normal");
  const summary = itemSummary(normal.flatMap((e) => e.items.map((i) => ({ name: i.name, group: i.group, qty: i.qty }))));

  return (
    <section className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <div className="min-w-[1000px]">
        <div className={`${GRID} bg-stone-50 py-2 text-[11px] font-bold text-stone-500`}>
          <div>번호</div>
          <div>성함</div>
          <div>구분</div>
          <div className={NUM}>현금</div>
          <div className={NUM}>현영</div>
          <div className={NUM}>카드</div>
          <div className={NUM}>소계</div>
          <div className="pl-3">항목 (기타)</div>
          <div>따라온 것</div>
          <div>처리자</div>
        </div>
        {entries.length === 0 && <p className="px-3 py-6 text-center text-sm text-stone-500">아직 적은 줄이 없습니다.</p>}
        {/* 1번이 맨 아래, 새 줄이 위로 쌓인다(사용자 2026-11-16). 엑셀 내려받기는 번호 순 그대로. */}
        {[...entries].sort((a, b) => b.seq - a.seq || b.id - a.id).map((e) => {
          if (editing === e.id) {
            return (
              <EditRow
                key={e.id}
                e={e}
                codes={codes}
                cabinetItems={cabinetItems}
                staff={staff}
                onDone={() => {
                  setEditing(null);
                  onChanged();
                }}
                onCancel={() => setEditing(null)}
              />
            );
          }
          const refund = e.kind === "refund";
          const correction = e.kind === "correction" || refund; // 둘 다 부호 붙여 보이는 조정 줄
          const sub = e.cash + e.cash_receipt + e.card;
          const reds = redFieldsOf(e);
          const anyRed = reds.length > 0;
          const subRed = allRed(e);
          return (
            <div key={e.id} className={`${GRID} border-t border-stone-100 py-2 text-sm ${refund ? "bg-red-50/50" : correction ? "bg-amber-50/50" : ""}`}>
              <div className={refund ? "text-red-700" : "text-stone-400"}>{refund ? "환불" : correction ? "정정" : e.seq}</div>
              <div className="truncate">
                {e.patient_name}
                {refund && <span className="block text-[11px] text-red-700">{e.correction_reason}</span>}
                {correction && !refund && <span className="block text-[11px] text-amber-800">#{entries.find((x) => x.id === e.corrects_id)?.seq ?? "?"} 정정 · {e.correction_reason}</span>}
              </div>
              <div className="text-stone-500">{e.insurance_kind ?? dash}</div>
              <div className={NUM}>{money(e.cash, { signed: correction, red: reds.includes("cash") })}</div>
              <div className={NUM}>{money(e.cash_receipt, { signed: correction, red: reds.includes("cash_receipt") })}</div>
              <div className={NUM}>{money(e.card, { signed: correction, red: reds.includes("card") })}</div>
              <div className={`${NUM} font-bold`}>
                {anyRed ? (
                  <span className="flex flex-col items-end leading-tight">
                    {money(sub, { signed: correction, red: subRed })}
                    <span className="text-[10px] font-normal text-red-600">{e.pay_note ?? "계좌입금"}</span>
                  </span>
                ) : correction ? money(sub, { signed: true }) : won(sub)}
              </div>
              <div className="flex flex-wrap gap-1 pl-3">
                {e.items.map((i) => (
                  <span key={i.id} className={`rounded-full border px-2 py-0.5 text-xs ${chipClass(i.group)}`}>{itemLabel(i)}</span>
                ))}
                {e.items.length === 0 && e.note_raw && <span className="text-xs text-stone-500">{e.note_raw}</span>}
                {e.memo && <span className="text-xs text-stone-500">· {e.memo}</span>}
              </div>
              <div>
                <Followed e={e} />
              </div>
              <div className="text-xs">
                {e.staff_name}
                {!closed && !correction && (
                  <span className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-stone-500">
                    <button type="button" onClick={() => setEditing(e.id)} className="underline">고치기</button>
                    <button type="button" onClick={() => onDelete(e)} className="underline">지우기</button>
                  </span>
                )}
                {!closed && refund && (
                  <button type="button" onClick={() => onDelete(e)} className="mt-0.5 block text-[11px] text-stone-500 underline">지우기</button>
                )}
                {!correction && (
                  <Link
                    href={`/appointments?for=${e.patient_id ?? ""}&name=${encodeURIComponent(e.patient_name)}&entry=${e.id}`}
                    className="mt-0.5 block text-[11px] text-[#0f3d23] underline"
                  >
                    다음 예약
                  </Link>
                )}
                {closed && !correction && (
                  <button type="button" onClick={() => onCorrect(e)} className="mt-0.5 block text-[11px] text-stone-500 underline">정정</button>
                )}
                {!correction && (
                  <button type="button" onClick={() => onRefund(e)} className="mt-0.5 block text-[11px] text-red-700 underline">환불</button>
                )}
              </div>
            </div>
          );
        })}
        <div className={`${GRID} border-t-2 border-stone-200 bg-stone-50 py-2 text-sm font-bold tabular-nums`}>
          <div />
          <div>합계 ({normal.length}명)</div>
          <div />
          <div className={NUM}>{won(total.cash)}</div>
          <div className={NUM}>{won(total.cash_receipt)}</div>
          <div className={NUM}>{won(total.card)}</div>
          <div className={`${NUM} text-[#0f3d23]`}>{won(total.subtotal)}</div>
          <div className="col-span-3 pl-3 text-xs font-normal text-stone-500">
            {total.offTotal > 0 && <span className="mr-3 text-red-700">그중 붉은 칸 금액(계좌입금·제로페이 등) {won(total.offTotal)}</span>}
            {summary.length > 0 ? summary.map((s) => `${s.name} ${s.qty}`).join(" · ") : "—"}
          </div>
        </div>
      </div>
    </section>
  );
}
