"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listPrescriptionsWithCalls, type PrescriptionWithCalls } from "@/lib/patients";
import { lastVisitDay } from "@/lib/ledger";
import { nextAppointmentFor } from "@/lib/appointments";
import { KIND_LABEL } from "@/lib/appointmentRules";
import { describeAgo, describeRemaining, monthDay, remainingMedicine } from "@/lib/patientSummaryRules";
import { describePrescription } from "@/lib/packs";
import { todayISO, weekdayKo } from "@/lib/dates";
import { WEEKDAYS } from "@/lib/weeklyRules";
import type { Appointment, Patient } from "@/lib/types";

type Loaded = {
  lastVisit: string | null;
  prescriptions: PrescriptionWithCalls[];
  next: Appointment | null;
};

/** 환자 찾기에서 줄을 펼치면 보이는 요약: 최종 내원일 · 남은 탕약 · 다음 예약 · 주간 관리 */
export default function PatientSummary({ patient }: { patient: Patient }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const today = todayISO();
    Promise.all([lastVisitDay(patient.id), listPrescriptionsWithCalls(patient.id), nextAppointmentFor(patient.id, today)])
      .then(([lastVisit, prescriptions, next]) => {
        if (alive) setData({ lastVisit, prescriptions, next });
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [patient.id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-stone-500">불러오는 중…</p>;

  const today = todayISO();
  const latest = data.prescriptions[0] ?? null;
  const remaining = latest ? remainingMedicine(latest, today) : null;
  const pendingCall = latest?.happy_calls.filter((c) => c.status === "pending").sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null;
  const lastDay = data.lastVisit ?? latest?.receive_date ?? null;

  return (
    <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
      <dt className="text-stone-500">최종 내원일</dt>
      <dd>
        {lastDay ? (
          <>
            {monthDay(lastDay)} <span className="text-stone-500">({describeAgo(lastDay, today)}{!data.lastVisit && ", 처방 수령일 기준"})</span>
          </>
        ) : (
          <span className="text-stone-400">장부 기록 없음</span>
        )}
      </dd>

      <dt className="text-stone-500">남은 탕약</dt>
      <dd>
        {latest && remaining ? (
          <>
            <span className={remaining.daysLeft > 0 && remaining.daysLeft <= 3 ? "font-medium text-amber-700" : remaining.daysLeft === 0 ? "text-stone-500" : ""}>
              {describeRemaining(remaining, today)}
            </span>
            <span className="ml-1 text-xs text-stone-500">
              ({monthDay(latest.receive_date)} 수령 · {describePrescription(latest)}{latest.memo ? ` · ${latest.memo}` : ""})
            </span>
            {pendingCall && (
              <span className="ml-1 text-xs text-stone-500">· 해피콜 {pendingCall.round}차 {monthDay(pendingCall.due_date)}</span>
            )}
          </>
        ) : (
          <span className="text-stone-400">처방 기록 없음</span>
        )}
      </dd>

      <dt className="text-stone-500">다음 예약</dt>
      <dd>
        {data.next ? (
          <>
            {monthDay(data.next.day)}({weekdayKo(data.next.day)}) {data.next.time} {KIND_LABEL[data.next.kind]}
            {data.next.notified_at && <span className="ml-1 text-xs text-stone-500">· 안내 보냄</span>}
          </>
        ) : (
          <>
            <span className="text-stone-400">없음</span>
            {!patient.excluded_at && (
              <Link href={`/appointments?for=${patient.id}&name=${encodeURIComponent(patient.name)}`} className="ml-2 text-xs underline">
                예약 잡기
              </Link>
            )}
          </>
        )}
      </dd>

      {patient.weekly_status !== "off" && (
        <>
          <dt className="text-stone-500">주간 관리</dt>
          <dd>
            {patient.weekly_status === "active"
              ? `관리 중 · ${WEEKDAYS[patient.weekly_weekday]}요일 · ${patient.weekly_round}회차 · 다음 ${patient.weekly_next_date ? monthDay(patient.weekly_next_date) : "-"}`
              : `휴면 · ${patient.weekly_round}회차까지`}
          </dd>
        </>
      )}

      {(patient.memo || patient.family_note) && (
        <>
          <dt className="text-stone-500">메모</dt>
          <dd className="text-stone-700">{[patient.memo, patient.family_note].filter(Boolean).join(" · ")}</dd>
        </>
      )}
    </dl>
  );
}
