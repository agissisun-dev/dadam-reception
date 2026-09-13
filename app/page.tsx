"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { countOpenHappyCalls } from "@/lib/happyCalls";
import { countWeekly } from "@/lib/weekly";
import { weekEndISO } from "@/lib/weeklyRules";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import TaskCard from "@/components/TaskCard";
import { listOpenTasks } from "@/lib/tasks";
import { bucketOpenTasks, groupByDate, todayISO, weekdayKo } from "@/lib/dates";
import type { Task } from "@/lib/types";

function TodayBoard() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUpcoming, setShowUpcoming] = useState(true);
  const [hc, setHc] = useState<{ today: number; overdue: number } | null>(null);
  const [wk, setWk] = useState<{ thisWeek: number; waiting: number } | null>(null);
  const today = todayISO();

  useEffect(() => {
    listOpenTasks().then(setTasks).catch((e: Error) => setError(e.message));
    countOpenHappyCalls(today)
      .then(setHc)
      .catch(() => setHc(null));
    countWeekly(weekEndISO(today))
      .then(setWk)
      .catch(() => setWk(null));
  }, [today]);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!tasks) return <p className="p-6 text-stone-500">불러오는 중…</p>;

  const { overdue, today: todays, upcoming } = bucketOpenTasks(tasks, today);
  const nothingToday = overdue.length === 0 && todays.length === 0;

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-4">
      <p className="text-sm text-stone-500">{today}</p>

      <Link
        href="/happy-calls"
        className={`block rounded-lg border p-4 ${
          hc && hc.today + hc.overdue > 0 ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white"
        }`}
      >
        <span className="font-medium">해피콜 대상</span>{" "}
        {hc ? (
          <>
            오늘 {hc.today}명
            {hc.overdue > 0 && <span className="text-red-700"> · 지난 것 {hc.overdue}명</span>}
          </>
        ) : (
          "…"
        )}
        <span className="float-right text-stone-500">▶</span>
      </Link>

      <Link
        href="/weekly"
        className={`block rounded-lg border p-4 ${
          wk && wk.thisWeek + wk.waiting > 0 ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white"
        }`}
      >
        <span className="font-medium">주간 관리</span>{" "}
        {wk ? (
          <>
            이번 주 {wk.thisWeek}명
            {wk.waiting > 0 && <span className="text-amber-800"> · 원장 확인 대기 {wk.waiting}건</span>}
          </>
        ) : (
          "…"
        )}
        <span className="float-right text-stone-500">▶</span>
      </Link>

      {nothingToday && (
        <p className="rounded-lg border border-stone-200 bg-white p-6 text-center text-stone-600">
          오늘 할 일이 없습니다
        </p>
      )}

      {overdue.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold text-red-700">기한 지난 일 ({overdue.length})</h2>
          <div className="space-y-2">
            {overdue.map((t) => (
              <TaskCard key={t.id} task={t} today={today} />
            ))}
          </div>
        </section>
      )}

      {todays.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">오늘 할 일 ({todays.length})</h2>
          <div className="space-y-2">
            {todays.map((t) => (
              <TaskCard key={t.id} task={t} today={today} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-bold text-stone-700">이번 주 (내일부터 7일, {upcoming.length})</h2>
          <button
            onClick={() => setShowUpcoming((v) => !v)}
            className="text-sm text-stone-500 underline"
          >
            {showUpcoming ? "접기" : "펼치기"}
          </button>
        </div>
        {showUpcoming && (
          <div className="space-y-4">
            {upcoming.length === 0 && (
              <p className="text-sm text-stone-500">7일 안에 예정된 일이 없습니다</p>
            )}
            {groupByDate(upcoming).map((g) => (
              <div key={g.date}>
                <p className="mb-1 text-sm text-stone-500">
                  {g.date} ({weekdayKo(g.date)})
                </p>
                <div className="space-y-2">
                  {g.tasks.map((t) => (
                    <TaskCard key={t.id} task={t} today={today} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
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
          <TodayBoard />
        </>
      )}
    </AuthGate>
  );
}
