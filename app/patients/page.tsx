"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import PhoneText from "@/components/PhoneText";
import { listPatients } from "@/lib/patients";
import { CONDITIONS, conditionLabel } from "@/lib/conditions";
import type { Condition, Patient } from "@/lib/types";

function List() {
  const [q, setQ] = useState("");
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

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">환자</h1>
        <Link href="/patients/new" className="rounded bg-stone-900 px-3 py-1.5 text-sm text-white">
          환자 등록
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름 또는 연락처"
          className="w-full rounded border border-stone-300 px-3 py-2 sm:w-auto sm:flex-1"
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
      ) : rows.length === 0 ? (
        <p className="text-stone-500">환자가 없습니다</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((p) => (
            <li key={p.id} className={`rounded-lg border border-stone-200 bg-white p-3 ${p.excluded_at ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/patients/${p.id}`} className="font-medium hover:underline">
                  {p.name}
                </Link>
                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{conditionLabel(p.condition)}</span>
                {p.excluded_at && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">연락 제외</span>
                )}
                <span className="ml-auto text-sm">
                  <PhoneText phone={p.phone} />
                </span>
              </div>
              {p.memo && <p className="mt-1 text-xs text-stone-500">{p.memo}</p>}
            </li>
          ))}
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
