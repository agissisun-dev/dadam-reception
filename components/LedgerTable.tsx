"use client";

import { useState } from "react";
import { updateEntryMoney } from "@/lib/ledger";
import { INSURANCE_KINDS, PAY_NOTES, chipClass, itemLabel, itemSummary, parseWon, sumEntries, won } from "@/lib/ledgerRules";
import type { LedgerEntryWithItems } from "@/lib/types";

type Props = {
  entries: LedgerEntryWithItems[];
  closed: boolean;
  onDelete: (e: LedgerEntryWithItems) => void;
  onCorrect: (e: LedgerEntryWithItems) => void;
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
  const cab = e.items.filter((i) => i.group === "cabinet" && i.cabinet_move_id);
  if (cab.length > 0) {
    out.push(
      <span key="cab" className="text-[#06366f]">
        약장 {cab.map((i) => `${i.name} −${i.qty}`).join(", ")}
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

/** 마감 전 줄 고치기: 성함·구분·금액·합계에서 빼기·메모. 항목(기타)은 못 고친다 — 지우고 다시 넣는다. */
function EditRow({ e, onDone, onCancel }: { e: LedgerEntryWithItems; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(e.patient_name);
  const [kind, setKind] = useState(e.insurance_kind ?? "");
  const [cash, setCash] = useState(e.cash ? String(e.cash) : "");
  const [cashReceipt, setCashReceipt] = useState(e.cash_receipt ? String(e.cash_receipt) : "");
  const [card, setCard] = useState(e.card ? String(e.card) : "");
  const [memo, setMemo] = useState(e.memo ?? "");
  const [offTotal, setOffTotal] = useState(e.off_total);
  const [payNote, setPayNote] = useState(e.pay_note ?? PAY_NOTES[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await updateEntryMoney(e.id, {
        patient_name: name,
        insurance_kind: kind || null,
        cash: parseWon(cash),
        cash_receipt: parseWon(cashReceipt),
        card: parseWon(card),
        memo,
        off_total: offTotal,
        pay_note: offTotal ? payNote : null,
      });
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
          <input list="ledger-kinds-edit" value={kind} onChange={(x) => setKind(x.target.value)} className={IN} />
          <datalist id="ledger-kinds-edit">
            {INSURANCE_KINDS.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </div>
        <div><input value={cash} onChange={(x) => setCash(x.target.value)} inputMode="numeric" placeholder="0" className={`${IN} text-right`} /></div>
        <div><input value={cashReceipt} onChange={(x) => setCashReceipt(x.target.value)} inputMode="numeric" placeholder="0" className={`${IN} text-right`} /></div>
        <div><input value={card} onChange={(x) => setCard(x.target.value)} inputMode="numeric" placeholder="0" className={`${IN} text-right`} /></div>
        <div className={`${NUM} font-bold`}>{won(parseWon(cash) + parseWon(cashReceipt) + parseWon(card))}</div>
        <div className="pl-3"><input value={memo} onChange={(x) => setMemo(x.target.value)} placeholder="메모" className={IN} /></div>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <label className={`flex items-center gap-1 ${offTotal ? "font-bold text-red-700" : ""}`}>
            <input type="checkbox" checked={offTotal} onChange={(x) => setOffTotal(x.target.checked)} /> 합계에서 빼기
          </label>
          {offTotal && (
            <select value={payNote} onChange={(x) => setPayNote(x.target.value)} className="h-7 rounded border border-red-300 px-1 text-xs text-red-700">
              {PAY_NOTES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex flex-col gap-1 text-xs">
          <button type="button" onClick={save} disabled={busy} className="rounded bg-stone-900 px-2 py-1 text-white disabled:opacity-50">저장</button>
          <button type="button" onClick={onCancel} className="rounded border border-stone-300 px-2 py-1">취소</button>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-stone-500">항목(기타)은 여기서 못 고칩니다. 항목이 틀렸으면 줄을 지우고 다시 넣어 주세요.</p>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

export default function LedgerTable({ entries, closed, onDelete, onCorrect, onChanged }: Props) {
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
        {entries.map((e) => {
          if (editing === e.id) {
            return (
              <EditRow
                key={e.id}
                e={e}
                onDone={() => {
                  setEditing(null);
                  onChanged();
                }}
                onCancel={() => setEditing(null)}
              />
            );
          }
          const correction = e.kind === "correction";
          const sub = e.cash + e.cash_receipt + e.card;
          const red = e.off_total;
          return (
            <div key={e.id} className={`${GRID} border-t border-stone-100 py-2 text-sm ${correction ? "bg-amber-50/50" : ""}`}>
              <div className="text-stone-400">{correction ? "정정" : e.seq}</div>
              <div className="truncate">
                {e.patient_name}
                {correction && <span className="block text-[11px] text-amber-800">#{entries.find((x) => x.id === e.corrects_id)?.seq ?? "?"} 정정 · {e.correction_reason}</span>}
              </div>
              <div className="text-stone-500">{e.insurance_kind ?? dash}</div>
              <div className={NUM}>{money(e.cash, { signed: correction, red })}</div>
              <div className={NUM}>{money(e.cash_receipt, { signed: correction, red })}</div>
              <div className={NUM}>{money(e.card, { signed: correction, red })}</div>
              <div className={`${NUM} font-bold`}>
                {red ? <span className="text-xs font-bold text-red-700">{e.pay_note ?? "합계 제외"}</span> : correction ? money(sub, { signed: true }) : won(sub)}
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
                  <span className="mt-0.5 flex gap-2 text-[11px] text-stone-500">
                    <button type="button" onClick={() => setEditing(e.id)} className="underline">고치기</button>
                    <button type="button" onClick={() => onDelete(e)} className="underline">지우기</button>
                  </span>
                )}
                {closed && !correction && (
                  <button type="button" onClick={() => onCorrect(e)} className="mt-0.5 block text-[11px] text-stone-500 underline">정정</button>
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
            {total.offTotal > 0 && <span className="mr-3 text-red-700">합계에서 뺀 금액 {won(total.offTotal)} (제로페이·계좌입금 등)</span>}
            {summary.length > 0 ? summary.map((s) => `${s.name} ${s.qty}`).join(" · ") : "—"}
          </div>
        </div>
      </div>
    </section>
  );
}
