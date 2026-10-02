"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import TaskCard from "@/components/TaskCard";
import HappyCallRow from "@/components/HappyCallRow";
import WeeklyRow from "@/components/WeeklyRow";
import MonthCalendar, { EMPTY_COUNTS, type DayCounts } from "@/components/MonthCalendar";
import Celebration from "@/components/Celebration";
import { pickMessage, shouldCelebrate } from "@/lib/celebrationRules";
import { listDoneTasks, listOpenTasks } from "@/lib/tasks";
import { listHandledHappyCalls, listOpenHappyCalls } from "@/lib/happyCalls";
import { listAllWeeklyContacts, listWaitingDoctor, listWeeklyTargets } from "@/lib/weekly";
import { listTemplates } from "@/lib/templates";
import { loadCabinet } from "@/lib/cabinet";
import { expiryStatus } from "@/lib/cabinetRules";
import { listLedgerDaysOpen, loadDay } from "@/lib/ledger";
import { sumEntries, won } from "@/lib/ledgerRules";
import { countToday } from "@/lib/appointments";
import { weekEndISO } from "@/lib/weeklyRules";
import { addDays, todayISO, weekdayKo } from "@/lib/dates";
import { dayLabel, sameMonth, shiftMonth, yearMonthOf, type YearMonth } from "@/lib/calendarRules";
import type { HandledHappyCall, HappyCallRow as HcRow, Task, Template, WeeklyContactWithName, WeeklyRow as WkRow } from "@/lib/types";

type Data = {
  tasks: Task[];
  happyCalls: HcRow[];
  weekly: WkRow[];
  waiting: number;
  cabinet: { soon: number; short: number };
  /** 오늘 장부: 줄 수·소계, 어제까지 마감 안 한 날 */
  ledger: { count: number; subtotal: number; openDays: string[] };
  /** 오늘 예약 수·내원 수 */
  appts: { total: number; arrived: number };
  /** 완료된 것들 — 달력에 ✓로 남기고 그날 목록 아래 "완료됨"에 보인다 */
  doneTasks: Task[];
  handledHc: HandledHappyCall[];
  weeklyDone: WeeklyContactWithName[];
};

const HC_RESULT: Record<string, string> = {
  contacted: "연락함",
  represcribed: "재처방·예약됨",
  excluded: "연락 제외",
  missed: "안 받음",
  closed: "닫힘",
};
const WK_RESULT: Record<string, string> = {
  sent: "발송함",
  skipped_visited: "내원해 건너뜀",
  no_reply: "답 없음",
  dormant: "휴면",
  excluded: "연락 제외",
};

/** 약장 요약: 기한 30일 안(지난 것 포함) 품목 수, 부족 품목 수. 실패하면 0으로. */
async function cabinetSummary(today: string): Promise<{ soon: number; short: number }> {
  try {
    const { statuses } = await loadCabinet();
    const soon = statuses.filter((s) => ["expired", "soon30"].includes(expiryStatus(s.nearest, today) ?? "")).length;
    const short = statuses.filter((s) => s.stock <= 0 || (s.item.min_stock > 0 && s.stock <= s.item.min_stock)).length;
    return { soon, short };
  } catch {
    return { soon: 0, short: 0 };
  }
}

/** 오늘 장부 요약. 실패하면 0으로. */
async function ledgerSummary(today: string): Promise<{ count: number; subtotal: number; openDays: string[] }> {
  try {
    const [d, openDays] = await Promise.all([loadDay(today), listLedgerDaysOpen(today)]);
    return { count: d.entries.filter((e) => e.kind === "normal").length, subtotal: sumEntries(d.entries).subtotal, openDays };
  } catch {
    return { count: 0, subtotal: 0, openDays: [] };
  }
}

function weeklyDate(r: WkRow, today: string): string {
  return r.weekly_next_date ?? today;
}

function buildCounts(data: Data, today: string): Map<string, DayCounts> {
  const m = new Map<string, DayCounts>();
  const bump = (iso: string, key: keyof DayCounts) => {
    const c = m.get(iso) ?? { ...EMPTY_COUNTS };
    c[key] += 1;
    m.set(iso, c);
  };
  for (const t of data.tasks) bump(t.due_date, "tasks");
  for (const h of data.happyCalls) bump(h.due_date, "happyCalls");
  for (const w of data.weekly) bump(weeklyDate(w, today), "weekly");
  // 완료된 것은 예정됐던 날에 남긴다 ("그날 예정된 걸 다 했는지"와 짝이 맞게)
  for (const t of data.doneTasks) bump(t.due_date, "doneTasks");
  for (const h of data.handledHc) bump(h.due_date, "doneHappyCalls");
  for (const w of data.weeklyDone) bump(w.planned_date, "doneWeekly");
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
      cabinetSummary(now),
      listDoneTasks().catch(() => [] as Task[]),
      listHandledHappyCalls().catch(() => [] as HandledHappyCall[]),
      listAllWeeklyContacts().catch(() => [] as WeeklyContactWithName[]),
      ledgerSummary(now),
      countToday(now),
    ])
      .then(([tasks, happyCalls, weekly, waiting, cabinet, doneTasks, handledHc, weeklyDone, ledger, appts]) => {
        const next = { tasks, happyCalls, weekly, waiting, cabinet, ledger, appts, doneTasks, handledHc, weeklyDone };
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
  const doneDayTasks = data.doneTasks.filter((t) => t.due_date === selected);
  const doneDayHc = data.handledHc.filter((h) => h.due_date === selected);
  const doneDayWk = data.weeklyDone.filter((w) => w.planned_date === selected);
  const doneCount = doneDayTasks.length + doneDayHc.length + doneDayWk.length;

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
          <Link href="/appointments" className="underline">
            오늘 예약 {data.appts.total}명{data.appts.arrived > 0 ? ` · 내원 ${data.appts.arrived}` : ""}
          </Link>
          <Link href="/ledger" className="underline">
            오늘 장부 {data.ledger.count}줄{data.ledger.count > 0 ? ` · ${won(data.ledger.subtotal)}원` : ""}
          </Link>
          {data.ledger.openDays.length > 0 && (
            <Link href="/ledger" className="text-red-700 underline">
              마감 안 한 날 {data.ledger.openDays.length}일 ({data.ledger.openDays.map((d) => d.slice(5).replace("-", "/")).join(", ")})
            </Link>
          )}
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
          {(data.cabinet.soon > 0 || data.cabinet.short > 0) && (
            <Link href="/cabinet" className="text-red-700 underline">
              약장{data.cabinet.soon > 0 ? ` 기한 임박 ${data.cabinet.soon}` : ""}
              {data.cabinet.short > 0 ? ` 부족 ${data.cabinet.short}` : ""}
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

        {doneCount > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-bold text-stone-500">완료됨 ({doneCount})</h3>
            <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white text-sm">
              {doneDayTasks.map((t) => (
                <li key={`dt${t.id}`} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="inline-block h-2 w-2 rounded-sm bg-stone-500" />
                  <Link href={`/tasks/${t.id}`} className="font-medium hover:underline">
                    {t.title}
                  </Link>
                  <span className="text-xs text-stone-500">
                    완료 {t.completed_at ? t.completed_at.slice(0, 10) : ""} · {t.completed_by ?? ""}
                    {t.completion_memo ? ` · ${t.completion_memo}` : ""}
                  </span>
                </li>
              ))}
              {doneDayHc.map((h) => (
                <li key={`dh${h.id}`} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="inline-block h-2 w-2 rounded-sm bg-amber-500" />
                  <Link href={`/patients/${h.prescription.patient.id}`} className="font-medium hover:underline">
                    {h.prescription.patient.name}
                  </Link>
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{h.round}차</span>
                  <span className="text-xs text-stone-500">
                    {HC_RESULT[h.last?.action ?? h.status] ?? h.status}
                    {h.last ? ` · ${h.last.created_at.slice(0, 10)} · ${h.last.staff_name}` : ""}
                  </span>
                </li>
              ))}
              {doneDayWk.map((w) => (
                <li key={`dw${w.id}`} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="inline-block h-2 w-2 rounded-sm bg-[#16863b]" />
                  <Link href={`/patients/${w.patient_id}`} className="font-medium hover:underline">
                    {w.patient?.name ?? "환자"}
                  </Link>
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{w.round}회차</span>
                  <span className="text-xs text-stone-500">
                    {WK_RESULT[w.action] ?? w.action} · {w.created_at.slice(0, 10)} · {w.staff_name}
                  </span>
                </li>
              ))}
            </ul>
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
          <CalendarBoard />
        </>
      )}
    </AuthGate>
  );
}
