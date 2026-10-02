"use client";

import { chipClass, itemLabel, itemSummary, sumEntries, won } from "@/lib/ledgerRules";
import type { LedgerEntryWithItems } from "@/lib/types";

type Props = {
  entries: LedgerEntryWithItems[];
  closed: boolean;
  onDelete: (e: LedgerEntryWithItems) => void;
  onCorrect: (e: LedgerEntryWithItems) => void;
};

const GRID = "grid grid-cols-[36px_100px_52px_88px_88px_96px_96px_minmax(180px,1fr)_200px_72px] items-center gap-x-1 px-3";
const NUM = "text-right tabular-nums";
const dash = <span className="text-stone-300">—</span>;

function money(n: number, signed = false) {
  if (n === 0) return dash;
  return <span className={signed && n < 0 ? "text-red-700" : ""}>{signed && n > 0 ? "+" : ""}{won(n)}</span>;
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
    const hasPatient = !!e.patient_id;
    out.push(
      <span key="pm" className="text-red-700">
        {hasPatient ? "포 수 없음 — 환자 상세에서 처방 추가" : "환자 연결 안 됨 — 해피콜 못 잡음"}
      </span>,
    );
  }
  if (out.length === 0) return dash;
  return <span className="flex flex-col gap-0.5 text-xs">{out}</span>;
}

export default function LedgerTable({ entries, closed, onDelete, onCorrect }: Props) {
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
          const correction = e.kind === "correction";
          const sub = e.cash + e.cash_receipt + e.card;
          return (
            <div key={e.id} className={`${GRID} border-t border-stone-100 py-2 text-sm ${correction ? "bg-amber-50/50" : ""}`}>
              <div className="text-stone-400">{correction ? "정정" : e.seq}</div>
              <div className="truncate">
                {e.patient_name}
                {correction && <span className="block text-[11px] text-amber-800">#{entries.find((x) => x.id === e.corrects_id)?.seq ?? "?"} 정정 · {e.correction_reason}</span>}
              </div>
              <div className="text-stone-500">{e.insurance_kind ?? dash}</div>
              <div className={NUM}>{money(e.cash, correction)}</div>
              <div className={NUM}>{money(e.cash_receipt, correction)}</div>
              <div className={NUM}>{money(e.card, correction)}</div>
              <div className={`${NUM} font-bold`}>{correction ? money(sub, true) : won(sub)}</div>
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
                  <button type="button" onClick={() => onDelete(e)} className="mt-0.5 block text-[11px] text-stone-500 underline">지우기</button>
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
            {summary.length > 0 ? summary.map((s) => `${s.name} ${s.qty}`).join(" · ") : "—"}
          </div>
        </div>
      </div>
    </section>
  );
}
