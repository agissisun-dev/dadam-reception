"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import TaskCard from "@/components/TaskCard";
import HappyCallRow from "@/components/HappyCallRow";
import WeeklyRow from "@/components/WeeklyRow";
import MonthCalendar, { type DayCounts } from "@/components/MonthCalendar";
import Celebration from "@/components/Celebration";
import { pickMessage, shouldCelebrate } from "@/lib/celebrationRules";
import { listOpenTasks } from "@/lib/tasks";
import { listOpenHappyCalls } from "@/lib/happyCalls";
import { listWaitingDoctor, listWeeklyTargets } from "@/lib/weekly";
import { listTemplates } from "@/lib/templates";
import { weekEndISO } from "@/lib/weeklyRules";
import { addDays, todayISO, weekdayKo } from "@/lib/dates";
import { dayLabel, sameMonth, shiftMonth, yearMonthOf, type YearMonth } from "@/lib/calendarRules";
import type { HappyCallRow as HcRow, Task, Template, WeeklyRow as WkRow } from "@/lib/types";

type Data = { tasks: Task[]; happyCalls: HcRow[]; weekly: WkRow[]; waiting: number };

function weeklyDate(r: WkRow, today: string): string {
  return r.weekly_next_date ?? today;
}

function buildCounts(data: Data, today: string): Map<string, DayCounts> {
  const m = new Map<string, DayCounts>();
  const bump = (iso: string, key: keyof DayCounts) => {
    const c = m.get(iso) ?? { tasks: 0, happyCalls: 0, weekly: 0 };
    c[key] += 1;
    m.set(iso, c);
  };
  for (const t of data.tasks) bump(t.due_date, "tasks");
  for (const h of data.happyCalls) bump(h.due_date, "happyCalls");
  for (const w of data.weekly) bump(weeklyDate(w, today), "weekly");
  return m;
}

/**
 * 오늘 남은 일(기한 지난 것 포함)이 0이 된 순간인지 본다. 자료가 올 때마다 부른다.
 * 브라우저 저장소에 "오늘 본 남은 일 수"와 "축하한 날짜"를 남겨 하루 한 번만 띄운다.
 */
function checkCelebration(data: Data, today: string): boolean {
  const openToday =
    data.tasks.filter((t) => t.status === "todo" && t.due_date <= today).length +
    data.happyCalls.filter((h) => h.due_date <= today).length +
    data.weekly.filter((w) => weeklyDate(w, today) <= today).length;
  try {
    const seenKey = `dadam:openToday:${today}`;
    const raw = window.localStorage.getItem(seenKey);
    const lastSeenOpen = raw === null ? null : Number(raw);
    const yes = shouldCelebrate({ openNow: openToday, lastSeenOpen });
    // 지금 남은 수를 기억한다. 띄웠으면 0이 저장되므로 새로고침엔 안 뜨고, 일이 다시 생기면 그 수가 저장된다.
    window.localStorage.setItem(seenKey, String(openToday));
    return yes;
  } catch {
    return false; // 저장소를 못 쓰는 브라우저면 축하 화면만 건너뛴다
  }
}

function CalendarBoard() {
  const today = todayISO();
  const [data, setData] = useState<Data | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<YearMonth>(() => yearMonthOf(todayISO()));
  const [selected, setSelected] = useState<string>(() => todayISO());
  const [celebrate, setCelebrate] = useState(false);

  const load = useCallback(() => {
    const now = todayISO();
    Promise.all([
      listOpenTasks(),
      listOpenHappyCalls(),
      listWeeklyTargets(addDays(now, 400)),
      listWaitingDoctor().then((l) => l.length).catch(() => 0),
    ])
      .then(([tasks, happyCalls, weekly, waiting]) => {
        const next = { tasks, happyCalls, weekly, waiting };
        setData(next);
        if (checkCelebration(next, now)) setCelebrate(true);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    listTemplates("weekly").then(setTemplates).catch(() => setTemplates([]));
  }, [load]);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!data) return <p className="p-6 text-stone-500">불러오는 중…</p>;

  const openTasks = data.tasks.filter((t) => t.status === "todo");
  const counts = buildCounts({ ...data, tasks: openTasks }, today);

  const overdueTasks = openTasks.filter((t) => t.due_date < today);
  const overdueHc = data.happyCalls.filter((h) => h.due_date < today);
  const overdueWk = data.weekly.filter((w) => weeklyDate(w, today) < today);
  const overdueCount = overdueTasks.length + overdueHc.length + overdueWk.length;

  const dayTasks = openTasks.filter((t) => t.due_date === selected);
  const dayHc = data.happyCalls.filter((h) => h.due_date === selected);
  const dayWk = data.weekly.filter((w) => weeklyDate(w, today) === selected);
  const dayEmpty = dayTasks.length === 0 && dayHc.length === 0 && dayWk.length === 0;

  const hcToday = data.happyCalls.filter((h) => h.due_date === today).length;
  const weekEnd = weekEndISO(today);
  const wkThisWeek = data.weekly.filter((w) => weeklyDate(w, today) <= weekEnd).length;

  const goToday = () => {
    const now = todayISO();
    setMonth(yearMonthOf(now));
    setSelected(now);
  };

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      {celebrate && <Celebration message={pickMessage(today)} onClose={() => setCelebrate(false)} />}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-stone-500">
          오늘 {today} ({weekdayKo(today)})
        </p>
        <p className="flex flex-wrap gap-3 text-sm">
          <Link href="/happy-calls" className="underline">
            해피콜 오늘 {hcToday}명
          </Link>
          <Link href="/weekly" className="underline">
            주간 관리 이번 주 {wkThisWeek}명
          </Link>
          {data.waiting > 0 && (
            <Link href="/weekly" className="text-amber-800 underline">
              원장 확인 대기 {data.waiting}건
            </Link>
          )}
        </p>
      </div>

      {overdueCount > 0 && (
        <section>
          <h2 className="mb-2 font-bold text-red-700">기한 지난 일 ({overdueCount})</h2>
          <div className="space-y-2">
            {overdueTasks.map((t) => (
              <TaskCard key={`t${t.id}`} task={t} today={today} />
            ))}
            {overdueHc.map((r) => (
              <HappyCallRow key={`h${r.id}`} row={r} today={today} templates={templates} onDone={load} />
            ))}
            {overdueWk.map((r) => (
              <WeeklyRow key={`w${r.id}`} row={r} today={today} templates={templates} onDone={load} />
            ))}
          </div>
        </section>
      )}

      <MonthCalendar
        month={month}
        today={today}
        selected={selected}
        counts={counts}
        onSelect={setSelected}
        onPrev={() => setMonth((m) => shiftMonth(m, -1))}
        onNext={() => setMonth((m) => shiftMonth(m, 1))}
        onToday={goToday}
      />

      <section>
        <h2 className="mb-2 font-bold">
          {dayLabel(selected)} ({weekdayKo(selected)}){" "}
          {selected === today && <span className="text-sm text-stone-500">오늘</span>}
          {!sameMonth(yearMonthOf(selected), month) && (
            <span className="text-sm font-normal text-stone-500"> · 다른 달</span>
          )}
        </h2>
        {dayEmpty && (
          <p className="rounded-lg border border-stone-200 bg-white p-6 text-center text-stone-600">
            {selected === today
              ? overdueCount === 0
                ? "오늘 할 일을 모두 마쳤습니다. 수고하셨습니다!"
                : "오늘 예정된 일은 없습니다. 위의 기한 지난 일을 확인해 주세요."
              : "이 날은 할 일이 없습니다"}
          </p>
        )}
        <div className="space-y-2">
          {dayTasks.map((t) => (
            <TaskCard key={`t${t.id}`} task={t} today={today} />
          ))}
          {dayHc.map((r) => (
            <HappyCallRow key={`h${r.id}`} row={r} today={today} templates={templates} onDone={load} />
          ))}
          {dayWk.map((r) => (
            <WeeklyRow key={`w${r.id}`} row={r} today={today} templates={templates} onDone={load} />
          ))}
        </div>
      </section>
    </main>
  );
}

export default function HomePage() {
  return (
    <AuthGate>
      {() => (
        <>
          <AppHeader />
          <CalendarBoard />
        </>
      )}
    </AuthGate>
  );
}
