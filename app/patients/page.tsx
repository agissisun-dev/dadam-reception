"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import PhoneText from "@/components/PhoneText";
import PatientSmsBox from "@/components/PatientSmsBox";
import PatientSummary from "@/components/PatientSummary";
import { listPatients } from "@/lib/patients";
import { CONDITIONS, conditionLabel } from "@/lib/conditions";
import { isFullPhoneQuery } from "@/lib/patientSummaryRules";
import { normalizePhone, formatPhone } from "@/lib/phone";
import type { Condition, Patient } from "@/lib/types";

const SMALL = "rounded border border-stone-300 px-2 py-0.5 text-xs";

function List() {
  const [q, setQ] = useState("");
  const [smsFor, setSmsFor] = useState<number | null>(null);
  const [opened, setOpened] = useState<{ q: string; id: number | null } | null>(null);
  const [cond, setCond] = useState<Condition | "">("");
  const [excluded, setExcluded] = useState(false);
  const [rows, setRows] = useState<Patient[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      listPatients({ q, condition: cond, includeExcluded: excluded })
        .then(setRows)
        .catch((e: Error) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [q, cond, excluded]);

  // 찾는 글이 있고 결과가 한 명이면 바로 펼쳐 보인다(연락처를 다 치면 신규 등록 확인처럼).
  const searching = q.trim().length > 0;
  const openId = opened && opened.q === q ? opened.id : rows && rows.length === 1 && searching ? rows[0].id : null;
  const phoneQuery = isFullPhoneQuery(q);
  const noMatch = rows !== null && rows.length === 0 && searching;

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">환자등록·찾기</h1>
        <Link href="/patients/new" className="rounded bg-stone-900 px-3 py-1.5 text-sm text-white">
          환자 등록
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름 또는 연락처 (번호를 다 치면 바로 찾습니다)"
          className="w-full rounded border border-stone-300 px-3 py-2 sm:w-auto sm:flex-1"
          autoFocus
        />
        <select
          value={cond}
          onChange={(e) => setCond(e.target.value as Condition | "")}
          className="rounded border border-stone-300 px-3 py-2"
        >
          <option value="">전체 질환</option>
          {CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={excluded} onChange={(e) => setExcluded(e.target.checked)} /> 제외 환자 포함
        </label>
      </div>
      {error && <p className="text-red-600">{error}</p>}
      {!rows ? (
        <p className="text-stone-500">불러오는 중…</p>
      ) : noMatch ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          {phoneQuery ? (
            <>
              <p className="font-medium text-amber-900">{formatPhone(normalizePhone(q))} 로 등록된 분이 없습니다.</p>
              <p className="mt-1 text-amber-800">처음 오신 분이면 바로 등록해 주세요. 이름·질환·처방을 이어서 넣습니다.</p>
              <Link href={`/patients/new?phone=${normalizePhone(q)}`} className="mt-2 inline-block rounded bg-stone-900 px-3 py-1.5 text-sm text-white">
                이 번호로 새로 등록
              </Link>
            </>
          ) : (
            <>
              <p className="text-amber-900">찾는 분이 없습니다. 연락처로도 찾아보시고, 처음 오신 분이면 등록해 주세요.</p>
              <Link href="/patients/new" className="mt-2 inline-block rounded bg-stone-900 px-3 py-1.5 text-sm text-white">
                환자 등록
              </Link>
            </>
          )}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-stone-500">환자가 없습니다</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((p) => {
            const open = openId === p.id;
            return (
              <li key={p.id} className={`rounded-lg border bg-white p-3 ${open ? "border-stone-400" : "border-stone-200"} ${p.excluded_at ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpened({ q, id: open ? null : p.id })}
                    className="font-medium hover:underline"
                    aria-expanded={open}
                  >
                    {p.name}
                  </button>
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{conditionLabel(p.condition)}</span>
                  {p.excluded_at && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">연락 제외</span>
                  )}
                  <span className="ml-auto text-sm">
                    <PhoneText phone={p.phone} revealed={open} />
                  </span>
                  {!p.excluded_at && (
                    <button type="button" onClick={() => setSmsFor((v) => (v === p.id ? null : p.id))} className="rounded border border-[#16863b] px-2 py-0.5 text-xs font-bold text-[#0f3d23]">
                      문자
                    </button>
                  )}
                  <Link href={`/patients/${p.id}`} className={SMALL}>
                    상세
                  </Link>
                </div>
                {!open && p.memo && <p className="mt-1 text-xs text-stone-500">{p.memo}</p>}
                {open && (
                  <div className="mt-2 border-t border-stone-100 pt-2">
                    <PatientSummary patient={p} />
                  </div>
                )}
                {smsFor === p.id && (
                  <div className="mt-2">
                    <PatientSmsBox patient={p} onClose={() => setSmsFor(null)} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

export default function PatientsPage() {
  return (
    <AuthGate>
      {() => (
        <>
          <AppHeader />
          <List />
        </>
      )}
    </AuthGate>
  );
}
