"use client";

import { WEEKDAYS } from "@/lib/weeklyRules";
import { isInMonth, monthGrid, monthLabel, type YearMonth } from "@/lib/calendarRules";

export type DayCounts = { tasks: number; happyCalls: number; weekly: number };

type Props = {
  month: YearMonth;
  today: string;
  selected: string;
  counts: Map<string, DayCounts>;
  onSelect: (iso: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
};

const NAV = "rounded border border-stone-300 px-2 py-1 text-sm hover:bg-stone-50";

function Badge({ n, color, late }: { n: number; color: string; late: boolean }) {
  if (n === 0) return null;
  return (
    <span
      className={`inline-block min-w-4 rounded px-1 text-center text-[11px] leading-4 text-white ${
        late ? "bg-red-600" : color
      }`}
    >
      {n}
    </span>
  );
}

/** 한 달 달력. 칸마다 업무·해피콜·주간 관리 건수를 보여 준다. */
export default function MonthCalendar({
  month,
  today,
  selected,
  counts,
  onSelect,
  onPrev,
  onNext,
  onToday,
}: Props) {
  const weeks = monthGrid(month);

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={onPrev} className={NAV} aria-label="이전 달">
          ◀
        </button>
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-bold">{monthLabel(month)}</h2>
          <button type="button" onClick={onToday} className="text-sm text-stone-500 underline">
            오늘
          </button>
        </div>
        <button type="button" onClick={onNext} className={NAV} aria-label="다음 달">
          ▶
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-xs text-stone-500">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`py-1 ${i === 0 ? "text-red-600" : i === 6 ? "text-blue-600" : ""}`}>
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded border border-stone-200 bg-stone-200">
        {weeks.flat().map((iso) => {
          const inMonth = isInMonth(iso, month);
          const c = counts.get(iso);
          const isToday = iso === today;
          const isSelected = iso === selected;
          const late = iso < today;
          const w = new Date(iso + "T00:00:00").getDay();
          const dayColor = w === 0 ? "text-red-600" : w === 6 ? "text-blue-600" : "text-stone-800";
          return (
            <button
              type="button"
              key={iso}
              onClick={() => onSelect(iso)}
              aria-pressed={isSelected}
              className={`flex min-h-14 flex-col items-start gap-1 p-1 text-left align-top ${
                isSelected ? "bg-stone-100" : "bg-white hover:bg-stone-50"
              } ${inMonth ? "" : "opacity-40"}`}
            >
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-sm ${dayColor} ${
                  isToday ? "border-2 border-[#16863b] font-bold" : ""
                }`}
              >
                {Number(iso.slice(8))}
              </span>
              {c && (
                <span className="flex flex-wrap gap-0.5">
                  <Badge n={c.tasks} color="bg-stone-700" late={late} />
                  <Badge n={c.happyCalls} color="bg-amber-500" late={late} />
                  <Badge n={c.weekly} color="bg-[#16863b]" late={late} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-2 flex flex-wrap gap-3 text-xs text-stone-500">
        <span>
          <span className="inline-block h-2.5 w-2.5 rounded bg-stone-700 align-middle" /> 업무
        </span>
        <span>
          <span className="inline-block h-2.5 w-2.5 rounded bg-amber-500 align-middle" /> 해피콜
        </span>
        <span>
          <span className="inline-block h-2.5 w-2.5 rounded bg-[#16863b] align-middle" /> 주간 관리
        </span>
        <span>
          <span className="inline-block h-2.5 w-2.5 rounded bg-red-600 align-middle" /> 지난 것
        </span>
      </p>
    </section>
  );
}
