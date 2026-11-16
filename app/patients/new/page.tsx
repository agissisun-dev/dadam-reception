"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import PrescriptionForm from "@/components/PrescriptionForm";
import { addPrescription, createPatient, findPatientByPhone } from "@/lib/patients";
import { isValidPhone, formatPhone, normalizePhone } from "@/lib/phone";
import { DEFAULT_PER_DAY } from "@/lib/packs";
import { CONDITIONS, conditionLabel } from "@/lib/conditions";
import { SOURCES, sourceHint } from "@/lib/sources";
import { addDays, todayISO } from "@/lib/dates";
import type { Patient, PatientInput, PrescriptionInput } from "@/lib/types";

const INPUT = "mt-1 w-full rounded border border-stone-300 px-3 py-2";

function emptyPatient(): PatientInput {
  return {
    name: "",
    phone: "",
    family_phone: "",
    family_note: "",
    condition: "general",
    memo: "",
    source: "",
    source_note: "",
  };
}

function NewPatient() {
  const params = useSearchParams();
  const initialPhone = params.get("phone") ?? "";
  const nameInput = useRef<HTMLInputElement>(null);
  const focusNextName = useRef(true);
  const phoneRevision = useRef(0);
  const saveInFlight = useRef<Promise<void> | null>(null);
  // Keep the created identity even if the subsequent prescription request fails.
  const partialPatient = useRef<{ patient: Patient; input: string } | null>(null);
  const [pendingPatient, setPendingPatient] = useState<Patient | null>(null);
  const [saving, setSaving] = useState(false);
  const [registration, setRegistration] = useState(0);
  const [success, setSuccess] = useState<Patient | null>(null);
  const [prescriptionWarning, setPrescriptionWarning] = useState<Patient | null>(null);
  const [phone, setPhone] = useState(initialPhone);
  const [checked, setChecked] = useState<null | { existing: Patient | null; phone: string }>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<PatientInput>(emptyPatient);

  useEffect(() => {
    if (!saving && focusNextName.current) {
      nameInput.current?.focus();
      focusNextName.current = false;
    }
  }, [registration, saving]);

  useEffect(() => () => {
    // Ignore lookups that finish after leaving this page.
    phoneRevision.current += 1;
  }, []);

  // 환자 찾기에서 "이 번호로 새로 등록"으로 들어오면 번호가 채워진 채 바로 조회한다.
  const checkedInitial = useRef(false);
  useEffect(() => {
    if (checkedInitial.current || normalizePhone(initialPhone).length < 10) return;
    checkedInitial.current = true;
    check(initialPhone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPhone]);

  async function check(value: string = phone) {
    if (saveInFlight.current || partialPatient.current) return;
    const revision = ++phoneRevision.current;
    setError(null);
    setChecked(null);
    if (!isValidPhone(value)) {
      setError("연락처는 숫자 10~11자리여야 합니다");
      return;
    }
    try {
      const existing = await findPatientByPhone(value);
      if (revision !== phoneRevision.current) return;
      setChecked({ existing, phone: normalizePhone(value) });
      setForm((f) => ({ ...f, phone: value }));
    } catch (e) {
      if (revision !== phoneRevision.current) return;
      setError((e as Error).message);
    }
  }

  function finish(patient: Patient) {
    phoneRevision.current += 1;
    partialPatient.current = null;
    setPendingPatient(null);
    setPrescriptionWarning(null);
    focusNextName.current = true;
    setSuccess(patient);
    setForm(emptyPatient());
    setPhone("");
    setChecked(null);
    setError(null);
    // Remount PrescriptionForm so its fields, error and busy state all reset.
    setRegistration((n) => n + 1);
  }

  function saveOnce(action: () => Promise<void>): Promise<void> {
    if (saveInFlight.current) return saveInFlight.current;
    phoneRevision.current += 1;
    setSaving(true);
    setSuccess(null);
    const request = Promise.resolve().then(action).finally(() => {
      saveInFlight.current = null;
      setSaving(false);
    });
    saveInFlight.current = request;
    return request;
  }

  async function savePrescription(patient: Patient, p: PrescriptionInput) {
    try {
      await addPrescription(patient.id, p);
    } catch (e) {
      // The API can fail after inserting the prescription but before happy calls.
      // Do not retry automatically or clear any entered data.
      setPrescriptionWarning(patient);
      throw e;
    }
  }

  function saveNew(p: PrescriptionInput): Promise<void> {
    return saveOnce(async () => {
      if (!checked || checked.existing || checked.phone !== normalizePhone(phone) || checked.phone !== normalizePhone(form.phone)) {
        throw new Error("현재 연락처를 다시 확인하세요");
      }
      if (!form.name.trim()) throw new Error("이름을 입력하세요");
      if (form.family_phone && !isValidPhone(form.family_phone)) throw new Error("가족 연락처 형식을 확인하세요");
      const input = JSON.stringify(form);
      if (partialPatient.current && partialPatient.current.input !== input) {
        throw new Error("이미 등록된 환자 정보와 다릅니다. 환자 상세에서 확인하세요");
      }
      let patient = partialPatient.current?.patient;
      if (!patient) {
        patient = await createPatient(form);
        partialPatient.current = { patient, input };
        setPendingPatient(patient);
      }
      await savePrescription(patient, p);
      finish(patient);
    });
  }

  function saveExisting(p: PrescriptionInput): Promise<void> {
    return saveOnce(async () => {
      const patient = checked?.existing;
      if (!checked || !patient || checked.phone !== normalizePhone(phone)) {
        throw new Error("현재 연락처를 다시 확인하세요");
      }
      // Never attach a retry to a different patient after a partial save.
      if (partialPatient.current) {
        throw new Error("이미 등록 중인 환자가 있습니다. 해당 환자의 처방 저장을 다시 시도하세요");
      }
      await savePrescription(patient, p);
      finish(patient);
    });
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
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">환자 등록</h1>
        <Link href="/patients" className="text-sm underline">환자등록·찾기로</Link>
      </div>

      <div role="status" aria-live="polite" aria-atomic="true">
        {success && (
          <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            {success.name}님의 환자·처방 정보가 저장되었습니다. 다음 환자를 입력하세요.{" "}
            <Link href={`/patients/${success.id}`} className="underline">저장한 환자 상세</Link>
          </p>
        )}
      </div>

      {pendingPatient && (
        <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {pendingPatient.name}님의 환자 정보는 등록되었습니다. 처방 저장 결과를 확인해 주세요.
          환자 정보는 중복 등록 방지를 위해 잠겨 있습니다.{" "}
          <Link href={`/patients/${pendingPatient.id}`} className="underline">환자 상세 · 정보 수정</Link>
        </p>
      )}

      {prescriptionWarning && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          처방 저장 완료를 확인할 수 없습니다. 처방이나 해피콜 일부가 이미 저장되었을 수 있습니다.
          중복 처방을 막으려면{" "}
          <Link href={`/patients/${prescriptionWarning.id}`} className="underline">{prescriptionWarning.name}님 환자 상세</Link>
          에서 처방 내역을 확인한 뒤 다시 시도하세요. 입력 내용은 유지됩니다.
        </p>
      )}

      <fieldset disabled={saving} aria-busy={saving} className="min-w-0 space-y-6">
        <fieldset disabled={!!pendingPatient} className="min-w-0 rounded-lg border border-stone-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm text-stone-600">이름</span>
              <input
                ref={nameInput}
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
                    phoneRevision.current += 1;
                    setError(null);
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
          {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        </fieldset>

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
              <PrescriptionForm key={registration} initial={firstPrescription} onSubmit={saveExisting} submitLabel="처방 저장 후 다음 환자" />
            </div>
          </section>
        )}

        {checked && !checked.existing && (
          <section className="space-y-4 rounded-lg border border-stone-200 bg-white p-4">
            <p className="text-sm text-green-700">새 환자입니다. 아래를 채워 주세요.</p>
            <fieldset disabled={!!pendingPatient} className="min-w-0 space-y-4">
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
              <div>
                <span className="text-sm text-stone-600">어떻게 오셨어요? (선택)</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {SOURCES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setForm({ ...form, source: form.source === s.value ? "" : s.value })}
                      className={`rounded border px-3 py-1.5 text-sm ${
                        form.source === s.value ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                {form.source && (
                  <input
                    value={form.source_note}
                    onChange={(e) => setForm({ ...form, source_note: e.target.value })}
                    placeholder={sourceHint(form.source)}
                    className={INPUT}
                  />
                )}
                <p className="mt-1 text-xs text-stone-500">정확하지 않아도 됩니다. 그런 내용이었다 정도면 충분합니다.</p>
              </div>
              <label className="block">
                <span className="text-sm text-stone-600">환자 메모 (선택)</span>
                <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} className={INPUT} />
              </label>
              </fieldset>
            <h2 className="pt-2 font-medium">첫 처방</h2>
            <PrescriptionForm key={registration} initial={firstPrescription} onSubmit={saveNew} submitLabel="환자·처방 저장 후 다음 환자" />
          </section>
        )}
      </fieldset>
    </main>
  );
}

export default function NewPatientPage() {
  return (
    <AuthGate>
      {() => (
        <>
          <AppHeader />
          <Suspense fallback={<p className="p-6 text-stone-500">불러오는 중…</p>}>
            <NewPatient />
          </Suspense>
        </>
      )}
    </AuthGate>
  );
}
