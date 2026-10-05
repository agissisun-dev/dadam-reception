"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { linkLedgerEntry } from "@/lib/appointments";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import LedgerEntryForm from "@/components/LedgerEntryForm";
import LedgerTable from "@/components/LedgerTable";
import StaffSelect from "@/components/StaffSelect";
import { listCabinetItems } from "@/lib/cabinet";
import { addDays, todayISO, weekdayKo } from "@/lib/dates";
import {
  addCorrection,
  addExpense,
  closeDay,
  deleteEntry,
  deleteExpense,
  listCodes,
  loadDay,
} from "@/lib/ledger";
import { downloadDayExcel, downloadMonthExcel } from "@/lib/ledgerExport";
import { nextSeq, parseWon, sumEntries, sumExpenses, won } from "@/lib/ledgerRules";
import { listPatients } from "@/lib/patients";
import { STAFF_NAMES, loadLastStaff, saveLastStaff, type StaffName } from "@/lib/staff";
import type { CabinetItem, LedgerCode, LedgerDay, LedgerEntryWithItems, LedgerExpense, Patient } from "@/lib/types";

const BTN = "rounded border border-stone-300 bg-white px-3 py-1.5 text-sm";
const PRIMARY = "rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50";

function Tile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`min-w-[110px] rounded-lg border px-3 py-2 ${strong ? "border-[#16863b] bg-[#f0f7f3]" : "border-stone-200 bg-white"}`}>
      <p className="text-[11px] text-stone-500">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${strong ? "text-[#0f3d23]" : ""}`}>{value}</p>
    </div>
  );
}

function dayLabel(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${y}년 ${Number(m)}월 ${Number(d)}일 (${weekdayKo(iso)})`;
}

function Board() {
  const router = useRouter();
  const params = useSearchParams();
  // 예약 화면 [내원]에서 넘어온 경우: 이름을 미리 채우고, 저장되면 그 예약에 수납 줄을 붙인다
  const presetName = params.get("name");
  const presetAppt = params.get("appt");
  const presetPid = params.get("pid");
  const [day, setDay] = useState(() => todayISO());
  const [dayRow, setDayRow] = useState<LedgerDay | null>(null);
  const [entries, setEntries] = useState<LedgerEntryWithItems[]>([]);
  const [expenses, setExpenses] = useState<LedgerExpense[]>([]);
  const [codes, setCodes] = useState<LedgerCode[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [cabinetItems, setCabinetItems] = useState<CabinetItem[]>([]);
  const [staff, setStaff] = useState<StaffName>(() => (typeof window === "undefined" ? STAFF_NAMES[0] : loadLastStaff()));
  const [loadedDay, setLoadedDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expTitle, setExpTitle] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [correcting, setCorrecting] = useState<LedgerEntryWithItems | null>(null);
  const [dCash, setDCash] = useState("");
  const [dCashReceipt, setDCashReceipt] = useState("");
  const [dCard, setDCard] = useState("");
  const [dReason, setDReason] = useState("");
  const [exporting, setExporting] = useState(false);

  const loadStatic = useCallback(() => {
    Promise.all([listCodes(), listPatients(), listCabinetItems()])
      .then(([c, p, ci]) => {
        setCodes(c);
        setPatients(p);
        setCabinetItems(ci);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const load = useCallback(() => {
    loadDay(day)
      .then((d) => {
        setDayRow(d.dayRow);
        setEntries(d.entries);
        setExpenses(d.expenses);
        setLoadedDay(day);
      })
      .catch((e: Error) => setError(e.message));
  }, [day]);

  useEffect(() => {
    loadStatic();
  }, [loadStatic]);
  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      saveLastStaff(staff);
      await fn();
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const loading = loadedDay !== day;
  const closed = !!dayRow?.closed_at;
  const today = todayISO();
  /** 마감했어도 그날 밤 12시까지는 고칠 수 있다. 다음 날부터 잠긴다(정정 줄만). */
  const locked = closed && day < today;
  const total = sumEntries(entries);
  const exp = sumExpenses(expenses);
  const seq = nextSeq(entries);

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setDay(addDays(day, -1))} className={BTN} aria-label="전날">◀</button>
          <h1 className="text-xl font-bold">{dayLabel(day)} 장부</h1>
          <button type="button" onClick={() => setDay(addDays(day, 1))} className={BTN} aria-label="다음 날">▶</button>
          {day !== today && (
            <button type="button" onClick={() => setDay(today)} className="text-sm text-stone-500 underline">오늘</button>
          )}
          <span className={`rounded px-2 py-0.5 text-xs ${locked ? "bg-stone-800 text-white" : closed ? "bg-stone-200 text-stone-800" : "bg-amber-100 text-amber-900"}`}>
            {locked ? `마감됨 · ${dayRow?.closed_by ?? ""} · 정정 줄만` : closed ? `마감됨 · ${dayRow?.closed_by ?? ""} · 오늘 안에는 고칠 수 있음` : "마감 전"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Tile label="현금" value={won(total.cash)} />
          <Tile label="현영" value={won(total.cash_receipt)} />
          <Tile label="카드" value={won(total.card)} />
          <Tile label="소계" value={won(total.subtotal)} />
          <Tile label="지출" value={won(exp)} />
          <Tile label="입금 (계좌·제로페이, 붉은 금액)" value={won(total.offTotal)} />
          <Tile label="합계 (소계 − 지출)" value={won(total.subtotal - exp)} strong />
        </div>
      </div>

      {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="w-44">
          <StaffSelect value={staff} onChange={setStaff} />
        </div>
        <Link href="/ledger/codes" className="text-sm text-stone-500 underline">약어 표 고치기</Link>
      </div>

      {presetName && !locked && (
        <p className="rounded border border-[#16863b] bg-[#f0f7f3] px-3 py-2 text-sm text-[#0f3d23]">
          예약에서 넘어왔습니다. <b>{presetName}</b> 수납을 적고 저장하면 그 예약에 &ldquo;수납 끝&rdquo;이 붙습니다.
        </p>
      )}
      {!loading && !locked && (
        <LedgerEntryForm
          key={`${day}-${seq}`}
          day={day}
          seq={seq}
          codes={codes}
          patients={patients}
          cabinetItems={cabinetItems}
          staff={staff}
          preset={presetName ? { name: presetName, patientId: presetPid ? Number(presetPid) : null } : null}
          onSaved={(entry) => {
            if (presetAppt) {
              linkLedgerEntry(Number(presetAppt), entry.id).catch(() => undefined);
              router.replace("/ledger");
            }
            load();
            loadStatic();
          }}
          onCodesChanged={loadStatic}
        />
      )}

      {loading ? (
        <p className="text-sm text-stone-500">불러오는 중…</p>
      ) : (
        <LedgerTable
          entries={entries}
          closed={locked}
          onDelete={(e) => {
            if (window.confirm(`${e.seq}번 ${e.patient_name} 줄을 지울까요? 따라온 처방·해피콜은 같이 지워지고, 약장 나감은 되돌림 입고로 남습니다.`)) {
              run(() => deleteEntry(e, staff));
            }
          }}
          onCorrect={(e) => {
            setCorrecting(e);
            setDCash("");
            setDCashReceipt("");
            setDCard("");
            setDReason("");
          }}
          onChanged={load}
        />
      )}

      {correcting && (
        <section className="rounded-lg border border-amber-600 bg-amber-50 p-3 text-sm">
          <p className="font-bold">
            {correcting.seq}번 {correcting.patient_name} 정정 줄
          </p>
          <p className="mt-1 text-xs text-stone-600">마감된 날이라 원래 줄은 못 고칩니다. 바뀌는 금액의 차이만 적어 주세요. 예: 현금을 카드로 잘못 적었으면 현금 −11000, 카드 11000.</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            {[
              ["현금", dCash, setDCash],
              ["현영", dCashReceipt, setDCashReceipt],
              ["카드", dCard, setDCard],
            ].map(([label, v, set]) => (
              <label key={label as string} className="block">
                <span className="text-[11px] text-stone-500">{label as string} 차이</span>
                <input value={v as string} onChange={(e) => (set as (s: string) => void)(e.target.value)} placeholder="0" className="h-9 w-28 rounded border border-stone-300 px-2 text-right text-sm" />
              </label>
            ))}
            <label className="block flex-1">
              <span className="text-[11px] text-stone-500">사유 (필수)</span>
              <input value={dReason} onChange={(e) => setDReason(e.target.value)} className="h-9 w-full rounded border border-stone-300 px-2 text-sm" />
            </label>
            <button
              type="button"
              className={PRIMARY}
              onClick={() =>
                run(async () => {
                  await addCorrection({
                    day,
                    seq,
                    original: correcting,
                    delta: { cash: parseWon(dCash), cash_receipt: parseWon(dCashReceipt), card: parseWon(dCard) },
                    reason: dReason,
                    staff,
                  });
                  setCorrecting(null);
                })
              }
            >
              정정 줄 넣기
            </button>
            <button type="button" className={BTN} onClick={() => setCorrecting(null)}>취소</button>
          </div>
        </section>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <section className="rounded-lg border border-stone-200 bg-white p-3 text-sm">
          <h2 className="font-bold">지출</h2>
          <ul className="mt-2 space-y-1">
            {expenses.map((x) => (
              <li key={x.id} className="flex items-center justify-between tabular-nums">
                <span>{x.title}</span>
                <span className="flex items-center gap-2">
                  {won(x.amount)}
                  {!locked && (
                    <button type="button" onClick={() => run(() => deleteExpense(x.id))} className="text-[11px] text-stone-400 underline">지우기</button>
                  )}
                </span>
              </li>
            ))}
            {expenses.length === 0 && <li className="text-xs text-stone-400">없음</li>}
          </ul>
          {!locked && (
            <form
              className="mt-2 flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await addExpense(day, expTitle, parseWon(expAmount), staff);
                  setExpTitle("");
                  setExpAmount("");
                });
              }}
            >
              <input value={expTitle} onChange={(e) => setExpTitle(e.target.value)} placeholder="내용" className="h-9 min-w-0 flex-1 rounded border border-stone-300 px-2 text-sm" />
              <input value={expAmount} onChange={(e) => setExpAmount(e.target.value)} placeholder="금액" inputMode="numeric" className="h-9 w-24 rounded border border-stone-300 px-2 text-right text-sm" />
              <button type="submit" className={BTN}>추가</button>
            </form>
          )}
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-3 text-sm">
          <h2 className="font-bold">오늘 마감</h2>
          <p className="mt-1 text-xs text-stone-500">종이 장부와 소계를 맞춘 뒤 누릅니다. 마감해도 그날 밤 12시까지는 고칠 수 있고, 다음 날부터는 잠겨서 정정 줄로만 남깁니다.</p>
          {closed ? (
            <p className="mt-2 text-xs">
              마감 {dayRow?.closed_at ? new Date(dayRow.closed_at).toLocaleString("ko-KR") : ""} · {dayRow?.closed_by}
            </p>
          ) : (
            <button
              type="button"
              className={`${PRIMARY} mt-2`}
              disabled={entries.length === 0 && expenses.length === 0}
              onClick={() => {
                if (window.confirm(`${dayLabel(day)} 장부를 마감할까요? 소계 ${won(total.subtotal)}원, 지출 ${won(exp)}원. 마감 뒤에는 고칠 수 없습니다.`)) {
                  run(() => closeDay(day, staff));
                }
              }}
            >
              마감하기
            </button>
          )}
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-3 text-sm">
          <h2 className="font-bold">엑셀로</h2>
          <p className="mt-1 text-xs text-stone-500">지금 쓰는 일일장부 모양 그대로 내려받습니다. 세무사에게 보낼 때, 10월 병행 기간에 대조할 때 씁니다.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={BTN}
              disabled={exporting}
              onClick={() =>
                run(async () => {
                  setExporting(true);
                  try {
                    await downloadMonthExcel(day.slice(0, 7));
                  } finally {
                    setExporting(false);
                  }
                })
              }
            >
              {Number(day.slice(5, 7))}월 전체
            </button>
            <button
              type="button"
              className={BTN}
              disabled={exporting}
              onClick={() =>
                run(async () => {
                  setExporting(true);
                  try {
                    await downloadDayExcel(day);
                  } finally {
                    setExporting(false);
                  }
                })
              }
            >
              이날만
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function LedgerPage() {
  return (
    <AuthGate>
      {() => (
        <>
          <AppHeader />
          <Suspense fallback={<p className="p-6 text-stone-500">불러오는 중…</p>}>
            <Board />
          </Suspense>
        </>
      )}
    </AuthGate>
  );
}
