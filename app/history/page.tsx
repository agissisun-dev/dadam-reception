"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import { listDoneTasks } from "@/lib/tasks";
import type { Task } from "@/lib/types";

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function HistoryList() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listDoneTasks().then(setTasks).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!tasks) return <p className="p-6 text-stone-500">불러오는 중…</p>;

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-xl font-bold">지난 기록 ({tasks.length})</h1>
      {tasks.length === 0 && <p className="text-stone-500">완료한 업무가 아직 없습니다.</p>}
      <ul className="space-y-2">
        {tasks.map((t) => (
          <li key={t.id} className="rounded-lg border border-stone-200 bg-white p-4">
            <Link href={`/tasks/${t.id}`} className="font-medium hover:underline">
              {t.title}
            </Link>
            <p className="text-sm text-stone-500">
              할 날짜 {t.due_date} · 완료 {formatDateTime(t.completed_at)} · {t.completed_by}
            </p>
            {t.completion_memo && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">{t.completion_memo}</p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}

export default function HistoryPage() {
  return (
    <AuthGate>
      {() => (
        <>
          <AppHeader />
          <HistoryList />
        </>
      )}
    </AuthGate>
  );
}
