"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import WeeklyRow from "@/components/WeeklyRow";
import StaffSelect from "@/components/StaffSelect";
import { listWeeklyTargets, listWaitingDoctor, reviewReply, type WaitingItem } from "@/lib/weekly";
import { listTemplates } from "@/lib/templates";
import { todayISO, weekdayKo } from "@/lib/dates";
import { weekEndISO } from "@/lib/weeklyRules";
import { conditionLabel } from "@/lib/conditions";
import { STAFF_NAMES, loadLastStaff, saveLastStaff, type StaffName } from "@/lib/staff";
import type { Template, WeeklyRow as Row } from "@/lib/types";

const BTN = "rounded border border-stone-300 px-3 py-1.5 text-sm";
const PRIMARY = "rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50";

function groupByDate(rows: Row[], today: string): { date: string; rows: Row[] }[] {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const d = r.weekly_next_date ?? today;
    m.set(d, [...(m.get(d) ?? []), r]);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => ({ date, rows }));
}

function ThisWeek({ templates }: { templates: Template[] }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayISO();

  const load = useCallback(() => {
    listWeeklyTargets(weekEndISO(todayISO()))
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!rows) return <p className="text-stone-500">불러오는 중…</p>;

  const overdue = rows.filter((r) => (r.weekly_next_date ?? today) < today);
  const rest = rows.filter((r) => (r.weekly_next_date ?? today) >= today);

  return (
    <div className="space-y-6">
      {rows.length === 0 && (
        <p className="rounded-lg border border-stone-200 bg-white p-6 text-center text-stone-600">
          이번 주 보낼 환자가 없습니다. 환자 상세에서 [주간 관리 시작]으로 대상을 넣습니다.
        </p>
      )}
      {overdue.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold text-red-700">지난 것 ({overdue.length})</h2>
          <div className="space-y-2">
            {overdue.map((r) => (
              <WeeklyRow key={r.id} row={r} today={today} templates={templates} onDone={load} />
            ))}
          </div>
        </section>
      )}
      {groupByDate(rest, today).map((g) => (
        <section key={g.date}>
          <h2 className="mb-2 font-bold">
            {g.date} ({weekdayKo(g.date)}) {g.date === today && <span className="text-sm text-stone-500">오늘</span>}
          </h2>
          <div className="space-y-2">
            {g.rows.map((r) => (
              <WeeklyRow key={r.id} row={r} today={today} templates={templates} onDone={load} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Waiting() {
  const [items, setItems] = useState<WaitingItem[] | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [staff, setStaff] = useState<StaffName>(() =>
    typeof window === "undefined" ? STAFF_NAMES[0] : loadLastStaff(),
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listWaitingDoctor()
      .then(setItems)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!items) return <p className="text-stone-500">불러오는 중…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">접수실이 [원장님 확인 요청]한 답변입니다. 지시사항을 남기면 다음 주 문구 옆에 보입니다.</p>
      <StaffSelect value={staff} onChange={setStaff} />
      {items.length === 0 && (
        <p className="rounded-lg border border-stone-200 bg-white p-6 text-center text-stone-600">확인할 답변이 없습니다</p>
      )}
      {items.map((it) => (
        <div key={it.id} className="rounded-lg border border-amber-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/patients/${it.patient.id}`} className="font-medium hover:underline">
              {it.patient.name}
            </Link>
            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{conditionLabel(it.patient.condition)}</span>
            <span className="text-xs text-stone-500">{it.round}회차 · {it.planned_date}</span>
          </div>
          {it.message && <p className="mt-2 whitespace-pre-wrap text-xs text-stone-500">보낸 문구: {it.message}</p>}
          <p className="mt-2 text-sm">
            <span className="text-stone-500">환자 답변:</span> {it.patient_reply}
          </p>
          <textarea
            value={notes[it.id] ?? ""}
            onChange={(e) => setNotes({ ...notes, [it.id]: e.target.value })}
            rows={2}
            placeholder="원장님 지시사항 (예: 저녁 밀가루 줄이고 다음 주 사진 다시)"
            className="mt-2 w-full rounded border border-stone-300 px-3 py-2 text-sm"
          />
          <button
            className={`${PRIMARY} mt-2`}
            disabled={!(notes[it.id] ?? "").trim()}
            onClick={async () => {
              try {
                saveLastStaff(staff);
                await reviewReply(it.id, (notes[it.id] ?? "").trim());
                load();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            확인 완료
          </button>
        </div>
      ))}
    </div>
  );
}

function Board() {
  const [tab, setTab] = useState<"week" | "waiting">("week");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [waitingCount, setWaitingCount] = useState(0);
  const today = todayISO();

  useEffect(() => {
    listTemplates("weekly").then(setTemplates).catch(() => setTemplates([]));
    listWaitingDoctor().then((w) => setWaitingCount(w.length)).catch(() => setWaitingCount(0));
  }, [tab]);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">주간 관리</h1>
        <p className="text-sm text-stone-500">{today}</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setTab("week")} className={tab === "week" ? PRIMARY : BTN}>
          이번 주
        </button>
        <button onClick={() => setTab("waiting")} className={tab === "waiting" ? PRIMARY : BTN}>
          원장 확인 대기{waitingCount > 0 ? ` (${waitingCount})` : ""}
        </button>
      </div>
      {tab === "week" ? <ThisWeek templates={templates} /> : <Waiting />}
    </main>
  );
}

export default function WeeklyPage() {
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
