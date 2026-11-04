"use client";

import { useEffect, useState } from "react";
import { isInMonth, monthGrid, monthLabel, shiftMonth, yearMonthOf, type YearMonth } from "@/lib/calendarRules";
import { holidayLabel, isClinicClosed } from "@/lib/holidays";
import { listMonthTally } from "@/lib/ledger";
import { won } from "@/lib/ledgerRules";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 오늘 장부 제목을 누르면 뜨는 달력(사용자 2026-11-04: 하루씩 넘기지 않고 예약 달력처럼 바로 가게).
 * 칸에 그날 줄 수와 소계, 마감 안 한 날 표시. 누르면 그날 장부로.
 */
export default function LedgerCalendar({ day, today, onPick, onClose }: { day: string; today: string; onPick: (iso: string) => void; onClose: () => void }) {
  const [month, setMonth] = useState<YearMonth>(() => yearMonthOf(day));
  /** 달별 요약을 달 키로 모아 둔다(달을 오가도 다시 안 불러옴). 불러오는 중인 달은 없음. */
  const [tallies, setTallies] = useState<Map<string, Map<string, { count: number; subtotal: number; closed: boolean }>>>(() => new Map());
  const [error, setError] = useState<string | null>(null);

  const key = `${month.year}-${String(month.month).padStart(2, "0")}`;
  const tally = tallies.get(key) ?? null;
  useEffect(() => {
    let alive = true;
    listMonthTally(key)
      .then((m) => alive && setTallies((prev) => new Map(prev).set(key, m)))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [key]);

  return (
    <div className="w-[340px] rounded-lg border border-stone-300 bg-white p-3 text-sm shadow-lg">
      <div className="mb-1 flex items-center justify-between">
        <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="rounded border border-stone-300 px-2 text-xs" aria-label="지난 달">◀</button>
        <b>{monthLabel(month)}</b>
        <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="rounded border border-stone-300 px-2 text-xs" aria-label="다음 달">▶</button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] text-stone-500">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={i === 0 ? "text-red-600" : i === 6 ? "text-blue-700" : ""}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {monthGrid(month).flat().map((iso) => {
          const inMonth = isInMonth(iso, month);
          const t = tally?.get(iso);
          const closedDay = isClinicClosed(iso);
          const sel = iso === day;
          const openNotClosed = !!t && t.count > 0 && !t.closed && iso < today; // 지난날인데 마감 안 함
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPick(iso)}
              className={`flex min-h-12 flex-col items-center rounded border px-0.5 py-0.5 text-xs ${
                sel ? "border-2 border-[#16863b] bg-[#f0f7f3] font-bold" : openNotClosed ? "border-amber-500 bg-amber-50" : closedDay ? "border-stone-100 bg-stone-100 text-stone-400" : "border-stone-200 bg-white"
              } ${inMonth ? "" : "opacity-40"}`}
              title={t ? `${t.count}줄 · 소계 ${won(t.subtotal)}${t.closed ? " · 마감됨" : ""}` : closedDay ? holidayLabel(iso) ?? "휴진" : ""}
            >
              <span className={iso === today ? "rounded-full bg-[#16863b] px-1.5 text-white" : ""}>{Number(iso.slice(8))}</span>
              <span className="text-[10px] leading-tight text-stone-500">
                {t && t.count > 0 ? `${t.count}줄` : closedDay ? (holidayLabel(iso) ?? "휴진").slice(0, 4) : " "}
              </span>
              {t && t.count > 0 && <span className="text-[9px] leading-tight text-stone-400">{Math.round(t.subtotal / 10000)}만</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-stone-500">칸 = 줄 수 · 소계(만원). 주황 = 마감 안 한 지난날. 누르면 그날 장부로 갑니다.</p>
      {!tally && !error && <p className="text-[11px] text-stone-400">불러오는 중…</p>}
      {error && <p className="text-[11px] text-red-700">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" className="rounded border border-stone-300 px-2 py-1 text-xs" onClick={() => onPick(today)}>오늘</button>
        <button type="button" className="ml-auto rounded border border-stone-300 px-2 py-1 text-xs" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
