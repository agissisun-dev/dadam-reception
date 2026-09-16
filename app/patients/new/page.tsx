"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import PrescriptionForm from "@/components/PrescriptionForm";
import { addPrescription, createPatient, findPatientByPhone } from "@/lib/patients";
import { isValidPhone, formatPhone, normalizePhone } from "@/lib/phone";
import { DEFAULT_PER_DAY } from "@/lib/packs";
import { CONDITIONS, conditionLabel } from "@/lib/conditions";
import { addDays, todayISO } from "@/lib/dates";
import type { Patient, PatientInput, PrescriptionInput } from "@/lib/types";

const INPUT = "mt-1 w-full rounded border border-stone-300 px-3 py-2";

function NewPatient() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [checked, setChecked] = useState<null | { existing: Patient | null }>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<PatientInput>({
    name: "",
    phone: "",
    family_phone: "",
    family_note: "",
    condition: "general",
    memo: "",
  });

  async function check(value: string = phone) {
    setError(null);
    if (!isValidPhone(value)) {
      setError("연락처는 숫자 10~11자리여야 합니다");
      return;
    }
    try {
      const existing = await findPatientByPhone(value);
      setChecked({ existing });
      setForm((f) => ({ ...f, phone: value }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveNew(p: PrescriptionInput) {
    if (!form.name.trim()) throw new Error("이름을 입력하세요");
    if (form.family_phone && !isValidPhone(form.family_phone)) throw new Error("가족 연락처 형식을 확인하세요");
    const patient = await createPatient(form);
    await addPrescription(patient.id, p);
    router.push(`/patients/${patient.id}`);
  }

  async function saveExisting(p: PrescriptionInput) {
    const id = checked!.existing!.id;
    await addPrescription(id, p);
    router.push(`/patients/${id}`);
  }

  const firstPrescription: PrescriptionInput = {
    receive_date: addDays(todayISO(), 3),
    days: 0,
    packs: null,
    per_day: DEFAULT_PER_DAY,
    memo: "",
  };

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-xl font-bold">환자 등록</h1>

      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-stone-600">이름</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="홍길동"
              className={INPUT}
              autoFocus
            />
          </label>
          <label className="block">
            <span className="text-sm text-stone-600">연락처 (환자 구분 기준)</span>
            <div className="mt-1 flex gap-2">
              <input
                value={phone}
                onChange={(e) => {
                  const v = e.target.value;
                  setPhone(v);
                  setChecked(null);
                  // 휴대폰 11자리가 다 입력되면 [확인] 없이 바로 조회
                  if (normalizePhone(v).length === 11) check(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    check();
                  }
                }}
                placeholder="010-1234-5678"
                className="w-full rounded border border-stone-300 px-3 py-2"
              />
              <button type="button" onClick={() => check()} className="shrink-0 rounded bg-stone-900 px-4 py-2 text-white">
                확인
              </button>
            </div>
          </label>
        </div>
        {!checked && !error && (
          <p className="mt-2 text-sm text-stone-500">연락처를 다 넣으면 같은 번호의 환자가 있는지 자동으로 확인합니다.</p>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>

      {checked?.existing && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="font-medium">
            이미 등록된 환자: {checked.existing.name} ({conditionLabel(checked.existing.condition)}) ·{" "}
            {formatPhone(checked.existing.phone)}
          </p>
          <p className="mt-1 text-sm text-stone-600">
            이 환자에 처방을 추가합니다. 정보 수정은{" "}
            <Link href={`/patients/${checked.existing.id}`} className="underline">
              환자 상세
            </Link>
            에서.
          </p>
          <div className="mt-4">
            <PrescriptionForm initial={firstPrescription} onSubmit={saveExisting} submitLabel="처방 추가" />
          </div>
        </section>
      )}

      {checked && !checked.existing && (
        <section className="space-y-4 rounded-lg border border-stone-200 bg-white p-4">
          <p className="text-sm text-green-700">새 환자입니다. 아래를 채워 주세요.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-stone-600">가족 연락처 (선택)</span>
              <input
                value={form.family_phone}
                onChange={(e) => setForm({ ...form, family_phone: e.target.value })}
                placeholder="010-…"
                className={INPUT}
              />
            </label>
            <label className="block">
              <span className="text-sm text-stone-600">관계</span>
              <input
                value={form.family_note}
                onChange={(e) => setForm({ ...form, family_note: e.target.value })}
                placeholder="예: 배우자, 딸"
                className={INPUT}
              />
            </label>
          </div>
          <div>
            <span className="text-sm text-stone-600">질환 분류</span>
            <div className="mt-1 flex gap-2">
              {CONDITIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setForm({ ...form, condition: c.value })}
                  className={`rounded border px-3 py-1.5 ${
                    form.condition === c.value ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-sm text-stone-600">환자 메모 (선택)</span>
            <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} className={INPUT} />
          </label>
          <h2 className="pt-2 font-medium">첫 처방</h2>
          <PrescriptionForm initial={firstPrescription} onSubmit={saveNew} submitLabel="환자와 처방 저장" />
        </section>
      )}
    </main>
  );
}

export default function NewPatientPage() {
  return (
    <AuthGate>
      {() => (
        <>
          <AppHeader />
          <NewPatient />
        </>
      )}
    </AuthGate>
  );
}
