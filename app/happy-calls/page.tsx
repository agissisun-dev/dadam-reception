"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import HappyCallRow from "@/components/HappyCallRow";
import { listOpenHappyCalls } from "@/lib/happyCalls";
import { bucketHappyCalls } from "@/lib/happyCallRules";
import { listTemplates } from "@/lib/templates";
import { todayISO, weekdayKo } from "@/lib/dates";
import type { HappyCallRow as Row, Template } from "@/lib/types";

function groupRows(rows: Row[]): { date: string; rows: Row[] }[] {
  const m = new Map<string, Row[]>();
  for (const r of rows) m.set(r.due_date, [...(m.get(r.due_date) ?? []), r]);
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => ({ date, rows }));
}

function Board() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const today = todayISO();

  const load = useCallback(() => {
    listOpenHappyCalls()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    listTemplates("weekly").then(setTemplates).catch(() => setTemplates([]));
  }, [load]);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!rows) return <p className="p-6 text-stone-500">불러오는 중…</p>;

  const { today: todays, upcoming } = bucketHappyCalls(rows, today);

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">해피콜</h1>
        <div className="flex items-baseline gap-3">
          <Link href="/patients/new" className="rounded bg-stone-900 px-3 py-1.5 text-sm text-white">
            환자 등록
          </Link>
          <p className="text-sm text-stone-500">{today}</p>
        </div>
      </div>

      <section>
        <h2 className="mb-2 font-bold">오늘 연락할 환자 ({todays.length})</h2>
        {todays.length === 0 && (
          <p className="rounded-lg border border-stone-200 bg-white p-6 text-center text-stone-600">
            오늘 연락할 환자가 없습니다
          </p>
        )}
        <div className="space-y-2">
          {todays.map((r) => (
            <HappyCallRow key={r.id} row={r} today={today} templates={templates} onDone={load} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold text-stone-700">이번 주 (내일부터 7일, {upcoming.length})</h2>
        <div className="space-y-4">
          {upcoming.length === 0 && <p className="text-sm text-stone-500">7일 안에 예정된 해피콜이 없습니다</p>}
          {groupRows(upcoming).map((g) => (
            <div key={g.date}>
              <p className="mb-1 text-sm text-stone-500">
                {g.date} ({weekdayKo(g.date)})
              </p>
              <div className="space-y-2">
                {g.rows.map((r) => (
                  <HappyCallRow key={r.id} row={r} today={today} templates={templates} onDone={load} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export default function HappyCallsPage() {
  return (
    <AuthGate>
      {() => (
        <>
          <AppHeader />
          <Board />
        </>
      )}
    </AuthGate>
  );
}
