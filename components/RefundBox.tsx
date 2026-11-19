"use client";

import { useState } from "react";
import type { RefundInput } from "@/lib/ledger";
import { itemLabel, parseWon, won } from "@/lib/ledgerRules";
import { todayISO } from "@/lib/dates";
import type { LedgerEntryWithItems } from "@/lib/types";

const BTN = "rounded border border-stone-300 px-3 py-1.5 text-sm";
const PRIMARY = "rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50";
const IN = "h-9 rounded border border-stone-300 px-2 text-sm";

/**
 * 환불 줄 넣기 (V18). 원래 줄을 고르면 돌려줄 금액·반품 항목을 적고, 오늘 장부에 마이너스 줄로 들어간다.
 * 반품 항목은 재고에 입고로 되돌아가고, 탕약 전체 취소면 처방·해피콜을 끝낸다.
 */
export default function RefundBox({ original, staff, onSave, onCancel }: { original: LedgerEntryWithItems; staff: string; onSave: (input: RefundInput) => Promise<void>; onCancel: () => void }) {
  const today = todayISO();
  const [day, setDay] = useState(today);
  const [cash, setCash] = useState(String(original.cash || ""));
  const [cashReceipt, setCashReceipt] = useState(String(original.cash_receipt || ""));
  const [card, setCard] = useState(String(original.card || ""));
  const [qtys, setQtys] = useState<Record<number, number>>(() => Object.fromEntries(original.items.map((i) => [i.id, i.cabinet_move_id ? i.qty : 0])));
  const [reason, setReason] = useState("");
  const hasPresc = (original.prescriptions?.length ?? 0) > 0;
  const [closePresc, setClosePresc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = parseWon(cash) + parseWon(cashReceipt) + parseWon(card);
  const originalTotal = original.cash + original.cash_receipt + original.card;

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await onSave({
        day,
        original,
        money: { cash: parseWon(cash), cash_receipt: parseWon(cashReceipt), card: parseWon(card) },
        items: original.items.map((item) => ({ item, qty: Math.max(0, Math.min(item.qty, qtys[item.id] ?? 0)) })),
        reason,
        closePrescription: hasPresc && closePresc,
        staff,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-red-600 bg-red-50/60 p-3 text-sm">
      <p className="font-bold">
        {original.day} #{original.seq} {original.patient_name} 환불 줄
        <span className="ml-2 text-xs font-normal text-stone-600">원래 {won(originalTotal)} · {original.note_raw || "항목 없음"}</span>
      </p>
      <p className="mt-1 text-xs text-stone-600">돌려준 날 장부에 마이너스 줄로 들어갑니다. 원래 줄은 그대로 둡니다. 일부만 돌려주면 금액과 반품 수량을 줄여 적어 주세요.</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-[11px] text-stone-500">돌려준 날</span>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={`${IN} block`} />
        </label>
        {[
          ["현금", cash, setCash, original.cash],
          ["현영", cashReceipt, setCashReceipt, original.cash_receipt],
          ["카드", card, setCard, original.card],
        ].map(([label, v, set, orig]) => (
          <label key={label as string} className="block">
            <span className="text-[11px] text-stone-500">{label as string} 돌려줌 (원래 {won(orig as number)})</span>
            <input value={v as string} onChange={(e) => (set as (s: string) => void)(e.target.value)} placeholder="0" className={`${IN} block w-32 text-right`} inputMode="numeric" />
          </label>
        ))}
        <span className="text-sm font-bold text-red-700">−{won(total)}</span>
      </div>
      {original.items.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-stone-500">반품 (재고로 되돌림)</span>
          {original.items.map((item) => (
            <label key={item.id} className={`flex items-center gap-1 rounded border px-2 py-1 ${item.cabinet_move_id ? "border-stone-300 bg-white" : "border-stone-200 text-stone-400"}`} title={item.cabinet_move_id ? "" : "재고와 이어지지 않은 항목이라 수량만 적힙니다"}>
              {itemLabel(item)}
              <input
                type="number"
                min={0}
                max={item.qty}
                value={qtys[item.id] ?? 0}
                onChange={(e) => setQtys((q) => ({ ...q, [item.id]: Number(e.target.value) }))}
                className="h-7 w-14 rounded border border-stone-300 px-1 text-right"
              />
              <span className="text-stone-500">/ {item.qty}</span>
            </label>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="block flex-1">
          <span className="text-[11px] text-stone-500">사유 (필수)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 사향공진단 1개 반품" className={`${IN} block w-full`} />
        </label>
        {hasPresc && (
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={closePresc} onChange={(e) => setClosePresc(e.target.checked)} /> 탕약 전체 취소 — 처방·해피콜도 끝내기
          </label>
        )}
        <span className="text-xs text-stone-500">처리자 {staff}</span>
        <button type="button" onClick={save} disabled={busy || !reason.trim()} className={PRIMARY}>
          {busy ? "넣는 중…" : `${day} 장부에 환불 줄 넣기`}
        </button>
        <button type="button" onClick={onCancel} className={BTN}>취소</button>
      </div>
      {error && <p className="mt-2 text-red-700">{error}</p>}
    </section>
  );
}
