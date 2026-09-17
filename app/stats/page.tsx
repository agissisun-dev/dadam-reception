"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import MonthColumns from "@/components/MonthColumns";
import { loadStats, type StatsData } from "@/lib/stats";
import { todayISO } from "@/lib/dates";
import {
  happyCallMonth,
  monthKey,
  monthShort,
  monthlyRows,
  pct,
  prevMonthKey,
  recentMonthKeys,
  weeklyMonth,
} from "@/lib/statsRules";

const GREEN = "#16863b";
const GRAY = "#d6d3d1";
const MONTHS = 12;

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-stone-500">{sub}</p>}
    </div>
  );
}

function delta(now: number, before: number): string {
  const d = now - before;
  if (d === 0) return `지난달과 같음 (${before})`;
  return `지난달 ${before} · ${d > 0 ? "+" : ""}${d}`;
}

function Board() {
  const [data, setData] = useState<StatsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayISO();

  useEffect(() => {
    loadStats().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!data) return <p className="p-6 text-stone-500">불러오는 중…</p>;

  const keys = recentMonthKeys(today, MONTHS);
  const rows = monthlyRows(data, keys);
  const thisKey = monthKey(today);
  const cur = rows[rows.length - 1];
  const prev = monthlyRows(data, [prevMonthKey(thisKey)])[0];
  const hc = happyCallMonth(data.calls, data.logs, thisKey);
  const wk = weeklyMonth(data.weekly, thisKey);
  const labels = keys.map(monthShort);
  const represcPct = pct(cur.represcriptions, cur.prescriptions);
  const prevRepresc = pct(prev.represcriptions, prev.prescriptions);

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">현황</h1>
        <p className="text-sm text-stone-500">{monthShort(thisKey)} · {today} 기준</p>
      </div>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile label="이번 달 신규 환자" value={`${cur.newPatients}명`} sub={delta(cur.newPatients, prev.newPatients)} />
        <Tile label="이번 달 처방" value={`${cur.prescriptions}건`} sub={delta(cur.prescriptions, prev.prescriptions)} />
        <Tile label="이번 달 포 수" value={`${cur.packs.toLocaleString()}포`} sub={delta(cur.packs, prev.packs)} />
        <Tile
          label="재처방 비율"
          value={represcPct === null ? "–" : `${represcPct}%`}
          sub={`처방 ${cur.prescriptions}건 중 두 번째 이상 ${cur.represcriptions}건${prevRepresc === null ? "" : ` · 지난달 ${prevRepresc}%`}`}
        />
        <Tile
          label="해피콜 제때 처리"
          value={pct(hc.onTime, hc.due) === null ? "–" : `${pct(hc.onTime, hc.due)}%`}
          sub={`예정 ${hc.due}건 중 예정일 안에 ${hc.onTime}건`}
        />
        <Tile label="해피콜로 재처방·예약" value={`${hc.represcribed}건`} sub={`처리 ${hc.handled}건 중`} />
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
        <h2 className="mb-2 font-bold">이번 달 주간 관리</h2>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-stone-700">
          <span>발송 {wk.sent}건</span>
          <span>답변 {wk.replies}건</span>
          <span>내원해 건너뜀 {wk.visited}건</span>
          <span>답 없음 {wk.noReply}건</span>
          <span>휴면 {wk.dormant}건</span>
        </p>
      </section>

      <section className="space-y-6">
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="font-bold">월별 처방 건수</h2>
          <p className="mb-2 flex gap-4 text-xs text-stone-500">
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded align-middle" style={{ background: GREEN }} />
              재처방(두 번째 이상)
            </span>
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded align-middle" style={{ background: GRAY }} />
              첫 처방
            </span>
          </p>
          <MonthColumns
            labels={labels}
            series={[
              { name: "첫 처방", color: GRAY },
              { name: "재처방", color: GREEN },
            ]}
            values={rows.map((r) => [r.prescriptions - r.represcriptions, r.represcriptions])}
            unit="건"
          />
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="mb-2 font-bold">월별 포 수</h2>
          <MonthColumns labels={labels} series={[{ name: "포 수", color: GREEN }]} values={rows.map((r) => [r.packs])} unit="포" />
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="mb-2 font-bold">월별 신규 환자</h2>
          <MonthColumns labels={labels} series={[{ name: "신규 환자", color: GREEN }]} values={rows.map((r) => [r.newPatients])} unit="명" />
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs text-stone-500">
            <tr>
              <th className="px-3 py-2">달</th>
              <th className="px-3 py-2 text-right">신규 환자</th>
              <th className="px-3 py-2 text-right">처방</th>
              <th className="px-3 py-2 text-right">재처방</th>
              <th className="px-3 py-2 text-right">포 수</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {[...rows].reverse().map((r) => (
              <tr key={r.key} className="border-t border-stone-100">
                <td className="px-3 py-1.5">{r.key.replace("-", "년 ").replace(/^(\d+)년 0?(\d+)$/, "$1년 $2월")}</td>
                <td className="px-3 py-1.5 text-right">{r.newPatients}</td>
                <td className="px-3 py-1.5 text-right">{r.prescriptions}</td>
                <td className="px-3 py-1.5 text-right">{r.represcriptions}</td>
                <td className="px-3 py-1.5 text-right">{r.packs.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-stone-500">
        포 수는 처방에 적힌 포 수를 더한 값이고, 포 수가 없는 옛 처방은 일수 × 하루 포수로 봅니다. 신규 환자는 등록한 달 기준입니다.
      </p>
    </main>
  );
}

export default function StatsPage() {
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
