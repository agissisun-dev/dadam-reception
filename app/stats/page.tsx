"use client";

import { Fragment, useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import MonthColumns from "@/components/MonthColumns";
import { loadStats, type StatsData } from "@/lib/stats";
import { listSmsLogs } from "@/lib/smsLogs";
import { loadCabinet, type CabinetStatus } from "@/lib/cabinet";
import { expiryStatus } from "@/lib/cabinetRules";
import { maskPhone } from "@/lib/phone";
import type { CabinetMove, SmsLog } from "@/lib/types";
import { todayISO } from "@/lib/dates";
import { listMonthEntries } from "@/lib/ledger";
import { GROUP_LABEL, won } from "@/lib/ledgerRules";
import type { LedgerGroup } from "@/lib/types";
import {
  happyCallMonth,
  ledgerItemCounts,
  ledgerMonth,
  type ItemCount,
  type LedgerMonth,
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

      <LedgerSummary thisKey={thisKey} />

      <CabinetSummary today={today} thisKey={thisKey} />

      <SmsLedger />
    </main>
  );
}

/** 수납 장부 요약(접혀 있음): 이번 달 매출·지출·일 평균, 지난달 비교, 항목별 건수. */
function LedgerSummary({ thisKey }: { thisKey: string }) {
  const [data, setData] = useState<{ cur: LedgerMonth; prev: LedgerMonth; items: ItemCount[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prevKey = prevMonthKey(thisKey);
    Promise.all([listMonthEntries(thisKey), listMonthEntries(prevKey)])
      .then(([a, b]) => {
        const cur = ledgerMonth(a.entries, a.expenses, thisKey);
        const prev = ledgerMonth(b.entries, b.expenses, prevKey);
        const items = ledgerItemCounts(
          a.entries.filter((e) => e.kind === "normal").flatMap((e) => e.items.map((i) => ({ day: e.day, name: i.name, group: i.group, qty: i.qty, amount: i.amount }))),
          thisKey,
        );
        setData({ cur, prev, items });
      })
      .catch((e: Error) => setError(e.message));
  }, [thisKey]);

  if (error) return <p className="text-sm text-red-600">장부: {error}</p>;
  if (!data) return null;
  const { cur, prev, items } = data;
  const avg = cur.days > 0 ? Math.round(cur.subtotal / cur.days) : 0;

  return (
    <details className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
      <summary className="cursor-pointer font-bold">이번 달 매출 보기 (오늘 장부에서 집계)</summary>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile label="소계" value={won(cur.subtotal)} sub={`지난달 ${won(prev.subtotal)}`} />
        <Tile label="현금" value={won(cur.cash)} sub={`지난달 ${won(prev.cash)}`} />
        <Tile label="현영" value={won(cur.cash_receipt)} sub={`지난달 ${won(prev.cash_receipt)}`} />
        <Tile label="카드" value={won(cur.card)} sub={`지난달 ${won(prev.card)}`} />
        <Tile label="지출" value={won(cur.expenses)} sub={`지난달 ${won(prev.expenses)}`} />
        <Tile label="하루 평균 소계" value={won(avg)} sub={`장부 적은 날 ${cur.days}일`} />
      </div>
      {items.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs text-stone-500">
            <tr>
              <th className="px-3 py-1.5">항목</th>
              <th className="px-3 py-1.5">묶음</th>
              <th className="px-3 py-1.5 text-right">건수·개수</th>
              <th className="px-3 py-1.5 text-right">기타 칸 금액</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {items.map((i) => (
              <tr key={`${i.group}:${i.name}`} className="border-t border-stone-100">
                <td className="px-3 py-1">{i.name}</td>
                <td className="px-3 py-1 text-xs text-stone-500">{GROUP_LABEL[i.group as LedgerGroup] ?? i.group}</td>
                <td className="px-3 py-1 text-right">{i.qty}</td>
                <td className="px-3 py-1 text-right">{i.amount ? won(i.amount) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-xs text-stone-500">정정 줄은 금액에 더해져 있고, 항목 건수에는 들어가지 않습니다. 기타 칸 금액은 &ldquo;일반(42)&rdquo;처럼 괄호에 적은 만원 금액의 합입니다.</p>
    </details>
  );
}

/** 약장 요약: 이번 달 나간 수(품목·사유별), 세어 맞춤 차이, 기한 30일 안 품목. */
function CabinetSummary({ today, thisKey }: { today: string; thisKey: string }) {
  const [data, setData] = useState<{ statuses: CabinetStatus[]; moves: CabinetMove[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCabinet()
      .then((d) => setData({ statuses: d.statuses, moves: d.moves }))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-red-600">약장: {error}</p>;
  if (!data) return null;

  const nameOf = new Map(data.statuses.map((s) => [s.item.id, s.item.name]));
  const monthMoves = data.moves.filter((m) => monthKey(m.created_at.slice(0, 10)) === thisKey);
  const outs = monthMoves.filter((m) => m.kind === "out");
  const byItem = new Map<number, { total: number; review: number }>();
  for (const m of outs) {
    const c = byItem.get(m.item_id) ?? { total: 0, review: 0 };
    c.total += m.qty;
    if (m.purpose === "review") c.review += m.qty;
    byItem.set(m.item_id, c);
  }
  const counts = monthMoves.filter((m) => m.kind === "count" && m.diff);
  const diffSum = counts.reduce((a, m) => a + (m.diff ?? 0), 0);
  const soon = data.statuses.filter((s) => ["expired", "soon30"].includes(expiryStatus(s.nearest, today) ?? ""));

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
      <h2 className="mb-2 font-bold">약장</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <p className="text-xs text-stone-500">이번 달 나간 것 (리뷰 증정)</p>
          {byItem.size === 0 && <p className="text-stone-500">없음</p>}
          <ul>
            {[...byItem.entries()].map(([id, c]) => (
              <li key={id}>
                {nameOf.get(id) ?? id} {c.total}개{c.review > 0 ? ` (리뷰 ${c.review})` : ""}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs text-stone-500">세어 맞춤에서 차이</p>
          <p className={counts.length > 0 ? "text-red-700" : ""}>
            {counts.length}회{counts.length > 0 ? ` · 합계 ${diffSum > 0 ? "+" : ""}${diffSum}개` : ""}
          </p>
        </div>
        <div>
          <p className="text-xs text-stone-500">유통기한 30일 안</p>
          {soon.length === 0 && <p>없음</p>}
          <ul>
            {soon.map((s) => (
              <li key={s.item.id} className="text-red-700">
                {s.item.name} {s.nearest}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function whenKo(ts: string): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 문자 발송 장부. 서버가 남긴 모든 시도(성공·실패·거절)를 최근 것부터 보여 준다. 앱에서는 지울 수 없다. */
function SmsLedger() {
  const [logs, setLogs] = useState<SmsLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    listSmsLogs(100)
      .then(setLogs)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="font-bold">문자 발송 장부</h2>
        <span className="text-xs text-stone-500">최근 100건 · 성공·실패 모두</span>
      </div>
      <p className="mb-3 text-xs text-stone-500">
        등록된 환자·가족 번호로만 보낼 수 있고, 모든 시도가 여기 남습니다. 줄을 누르면 보낸 문구가 보입니다.
      </p>
      {error && <p className="text-red-600">{error}</p>}
      {logs && logs.length === 0 && <p className="text-stone-500">아직 보낸 문자가 없습니다.</p>}
      {logs && logs.length > 0 && (
        <table className="w-full text-xs">
          <thead className="text-stone-500">
            <tr>
              <th className="px-2 py-1 text-left">언제</th>
              <th className="px-2 py-1 text-left">환자</th>
              <th className="px-2 py-1 text-left">받는 사람</th>
              <th className="px-2 py-1 text-left">보낸 사람</th>
              <th className="px-2 py-1 text-left">결과</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <Fragment key={l.id}>
                <tr
                  onClick={() => setOpenId(openId === l.id ? null : l.id)}
                  className="cursor-pointer border-t border-stone-100 hover:bg-stone-50"
                >
                  <td className="px-2 py-1.5 whitespace-nowrap">{whenKo(l.created_at)}</td>
                  <td className="px-2 py-1.5">{l.patient_name}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {l.recipient_label} {maskPhone(l.to_phone)}
                  </td>
                  <td className="px-2 py-1.5">{l.staff_name}</td>
                  <td className="px-2 py-1.5">
                    {l.ok ? (
                      <span className="text-green-700">보냄 ({l.sms_type})</span>
                    ) : (
                      <span className="text-red-700">실패</span>
                    )}
                  </td>
                </tr>
                {openId === l.id && (
                  <tr className="bg-stone-50">
                    <td colSpan={5} className="px-3 py-2">
                      <p className="whitespace-pre-wrap text-stone-700">{l.text}</p>
                      {l.error && <p className="mt-1 text-red-700">{l.error}</p>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </section>
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
