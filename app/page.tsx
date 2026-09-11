"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import TaskCard from "@/components/TaskCard";
import { listOpenTasks } from "@/lib/tasks";
import { bucketOpenTasks, todayISO } from "@/lib/dates";
import type { Task } from "@/lib/types";

function TodayBoard() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUpcoming, setShowUpcoming] = useState(false);
  const today = todayISO();

  useEffect(() => {
    listOpenTasks().then(setTasks).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!tasks) return <p className="p-6 text-stone-500">불러오는 중…</p>;

  const { overdue, today: todays, upcoming } = bucketOpenTasks(tasks, today);
  const nothingToday = overdue.length === 0 && todays.length === 0;

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-4">
      <p className="text-sm text-stone-500">{today}</p>

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
        <button
          onClick={() => setShowUpcoming((v) => !v)}
          className="text-sm text-stone-600 underline"
        >
          다가오는 일 7일 ({upcoming.length}) {showUpcoming ? "접기" : "펼치기"}
        </button>
        {showUpcoming && (
          <div className="mt-2 space-y-2">
            {upcoming.length === 0 && (
              <p className="text-sm text-stone-500">7일 안에 예정된 일이 없습니다</p>
            )}
            {upcoming.map((t) => (
              <TaskCard key={t.id} task={t} today={today} />
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
      {(email) => (
        <>
          <AppHeader email={email} />
          <TodayBoard />
        </>
      )}
    </AuthGate>
  );
}
