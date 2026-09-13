"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import PhoneText from "@/components/PhoneText";
import PrescriptionForm from "@/components/PrescriptionForm";
import StaffSelect from "@/components/StaffSelect";
import {
  addPrescription,
  deletePatient,
  excludePatient,
  getPatient,
  listPrescriptionsWithCalls,
  unexcludePatient,
  updatePatient,
  type PrescriptionWithCalls,
} from "@/lib/patients";
import { CONDITIONS, conditionLabel } from "@/lib/conditions";
import { addDays, todayISO } from "@/lib/dates";
import { isValidPhone } from "@/lib/phone";
import { DEFAULT_PER_DAY, describePrescription } from "@/lib/packs";
import { STAFF_NAMES, loadLastStaff, saveLastStaff, type StaffName } from "@/lib/staff";
import { listWeeklyContacts, recordReply, resumeWeekly, startWeekly, stopWeekly } from "@/lib/weekly";
import { DEFAULT_WEEKDAY, WEEKDAYS } from "@/lib/weeklyRules";
import type { WeeklyContact } from "@/lib/types";
import type { Patient, PatientInput } from "@/lib/types";

const CH: Record<string, string> = { phone: "전화", kakao: "카톡", sms: "문자" };
const ACT: Record<string, string> = {
  contacted: "연락함",
  missed: "안 받음",
  represcribed: "재처방·예약됨",
  excluded: "연락 제외",
  rescheduled: "예정일 변경",
};
const ST: Record<string, string> = { pending: "대기", contacted: "연락함", closed: "종료" };
const WA: Record<string, string> = { sent: "발송함", skipped_visited: "내원해 건너뜀", no_reply: "답 없음", dormant: "휴면", excluded: "연락 제외" };

const INPUT = "mt-1 w-full rounded border border-stone-300 px-3 py-2";
const BTN = "rounded border border-stone-300 px-3 py-1.5 text-sm";
const PRIMARY = "rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50";

function fmt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Detail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const validId = Number.isInteger(id) && id > 0;
  const router = useRouter();

  const [patient, setPatient] = useState<Patient | null | undefined>(undefined);
  const [prescs, setPrescs] = useState<PrescriptionWithCalls[]>([]);
  const [weekly, setWeekly] = useState<WeeklyContact[]>([]);
  const [starting, setStarting] = useState(false);
  const [weekday, setWeekday] = useState(DEFAULT_WEEKDAY);
  const [interval, setInterval_] = useState(1);
  const [replyFor, setReplyFor] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [askDoctor, setAskDoctor] = useState(true);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<boolean>(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("add") === "1",
  );
  const [excluding, setExcluding] = useState(false);
  const [reason, setReason] = useState("");
  const [staff, setStaff] = useState<StaffName>(() =>
    typeof window === "undefined" ? STAFF_NAMES[0] : loadLastStaff(),
  );
  const [form, setForm] = useState<PatientInput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!validId) return;
    Promise.all([getPatient(id), listPrescriptionsWithCalls(id), listWeeklyContacts(id)])
      .then(([p, pr, wk]) => {
        setPatient(p);
        setPrescs(pr);
        setWeekly(wk);
      })
      .catch((e: Error) => setError(e.message));
  }, [id, validId]);

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
      setError(`저장되지 않았습니다. ${(e as Error).message}`);
    }
  }

  if (!validId) return <p className="p-6 text-stone-500">환자를 찾을 수 없습니다.</p>;
  if (error && patient === undefined) return <p className="p-6 text-red-600">{error}</p>;
  if (patient === undefined) return <p className="p-6 text-stone-500">불러오는 중…</p>;
  if (patient === null) return <p className="p-6 text-stone-500">환자를 찾을 수 없습니다.</p>;

  function startEdit(p: Patient) {
    setForm({
      name: p.name,
      phone: p.phone,
      family_phone: p.family_phone ?? "",
      family_note: p.family_note ?? "",
      condition: p.condition,
      memo: p.memo ?? "",
    });
    setEditing(true);
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <section className="rounded-lg border border-stone-200 bg-white p-4">
        {!editing ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold">{patient.name}</h1>
              <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{conditionLabel(patient.condition)}</span>
              {patient.excluded_at && (
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                  연락 제외 · {patient.excluded_reason}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm">
              연락처 <PhoneText phone={patient.phone} />
              {patient.family_phone && (
                <span className="ml-3 text-stone-600">
                  가족({patient.family_note ?? ""}) <PhoneText phone={patient.family_phone} />
                </span>
              )}
            </p>
            {patient.memo && <p className="mt-1 text-sm text-stone-600">{patient.memo}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={PRIMARY} onClick={() => setAdding((v) => !v)}>
                처방 추가
              </button>
              <button className={BTN} onClick={() => startEdit(patient)}>
                수정
              </button>
              {patient.excluded_at ? (
                <button className={BTN} onClick={() => run(() => unexcludePatient(patient.id))}>
                  제외 해제
                </button>
              ) : (
                <button className={`${BTN} text-red-700`} onClick={() => setExcluding((v) => !v)}>
                  연락 제외
                </button>
              )}
              <button
                className={`${BTN} ml-auto text-red-700`}
                onClick={() => {
                  if (window.confirm("이 환자와 처방·기록을 모두 삭제할까요? 되돌릴 수 없습니다.")) {
                    run(async () => {
                      await deletePatient(patient.id);
                      router.push("/patients");
                    });
                  }
                }}
              >
                환자 삭제
              </button>
            </div>
          </>
        ) : (
          form && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm text-stone-600">이름</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT} />
              </label>
              <label className="block">
                <span className="text-sm text-stone-600">연락처</span>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={INPUT} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm text-stone-600">가족 연락처</span>
                  <input
                    value={form.family_phone}
                    onChange={(e) => setForm({ ...form, family_phone: e.target.value })}
                    className={INPUT}
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-stone-600">관계</span>
                  <input
                    value={form.family_note}
                    onChange={(e) => setForm({ ...form, family_note: e.target.value })}
                    className={INPUT}
                  />
                </label>
              </div>
              <div className="flex gap-2">
                {CONDITIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setForm({ ...form, condition: c.value })}
                    className={`rounded border px-3 py-1.5 text-sm ${
                      form.condition === c.value ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <label className="block">
                <span className="text-sm text-stone-600">메모</span>
                <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} className={INPUT} />
              </label>
              <div className="flex gap-2">
                <button
                  className={PRIMARY}
                  onClick={() => {
                    if (!form.name.trim()) {
                      setError("이름을 입력하세요");
                      return;
                    }
                    if (!isValidPhone(form.phone)) {
                      setError("연락처는 숫자 10~11자리");
                      return;
                    }
                    if (form.family_phone && !isValidPhone(form.family_phone)) {
                      setError("가족 연락처 형식을 확인하세요");
                      return;
                    }
                    run(async () => {
                      await updatePatient(patient.id, form);
                      setEditing(false);
                    });
                  }}
                >
                  저장
                </button>
                <button className={BTN} onClick={() => setEditing(false)}>
                  취소
                </button>
              </div>
            </div>
          )
        )}

        {excluding && !patient.excluded_at && (
          <div className="mt-3 space-y-2 border-t border-stone-200 pt-3">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="제외 사유 (필수)"
              className={INPUT}
            />
            <StaffSelect value={staff} onChange={setStaff} />
            <div className="flex gap-2">
              <button
                className={PRIMARY}
                disabled={!reason.trim()}
                onClick={() =>
                  run(async () => {
                    await excludePatient(patient.id, reason.trim(), staff);
                    setExcluding(false);
                  })
                }
              >
                연락 제외
              </button>
              <button className={BTN} onClick={() => setExcluding(false)}>
                취소
              </button>
            </div>
          </div>
        )}

        {adding && (
          <div className="mt-3 border-t border-stone-200 pt-3">
            <PrescriptionForm
              initial={{ receive_date: addDays(todayISO(), 3), days: 0, packs: null, per_day: DEFAULT_PER_DAY, memo: "" }}
              submitLabel="처방 추가"
              onSubmit={async (v) => {
                await addPrescription(patient.id, v);
                setAdding(false);
                load();
              }}
            />
          </div>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-bold">주간 관리</h2>
          {patient.weekly_status === "active" && (
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800">
              관리 중 · {WEEKDAYS[patient.weekly_weekday]}요일 · 매{patient.weekly_interval > 1 ? `${patient.weekly_interval}주` : "주"} · {patient.weekly_round}회차 · 다음 {patient.weekly_next_date}
            </span>
          )}
          {patient.weekly_status === "dormant" && (
            <span className="rounded bg-stone-200 px-1.5 py-0.5 text-xs">휴면 · {patient.weekly_round}회차까지 진행</span>
          )}
          {patient.weekly_status === "off" && <span className="text-xs text-stone-500">대상 아님</span>}
          <span className="ml-auto flex gap-2">
            {patient.weekly_status === "off" && !patient.excluded_at && (
              <button className={PRIMARY} onClick={() => setStarting((v) => !v)}>주간 관리 시작</button>
            )}
            {patient.weekly_status === "dormant" && !patient.excluded_at && (
              <button className={PRIMARY} onClick={() => run(() => resumeWeekly(patient.id))}>다시 시작</button>
            )}
            {patient.weekly_status !== "off" && (
              <button className={BTN} onClick={() => { if (window.confirm("주간 관리를 중지할까요? 기록은 남습니다.")) run(() => stopWeekly(patient.id)); }}>중지</button>
            )}
          </span>
        </div>
        {starting && patient.weekly_status === "off" && (
          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-stone-200 pt-3">
            <label className="block">
              <span className="text-sm text-stone-600">보내는 요일</span>
              <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className={INPUT}>
                {WEEKDAYS.map((w, i) => (
                  <option key={i} value={i}>{w}요일</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-stone-600">주기</span>
              <select value={interval} onChange={(e) => setInterval_(Number(e.target.value))} className={INPUT}>
                <option value={1}>매주</option>
                <option value={2}>2주마다</option>
              </select>
            </label>
            <button className={PRIMARY} onClick={() => run(async () => { await startWeekly(patient.id, weekday, interval); setStarting(false); })}>시작</button>
            <button className={BTN} onClick={() => setStarting(false)}>취소</button>
          </div>
        )}
        {weekly.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-stone-200 pt-3 text-sm">
            {weekly.map((w) => (
              <li key={w.id} className="rounded bg-stone-50 p-2">
                <span className="rounded bg-stone-200 px-1.5 py-0.5 text-xs">{w.round}회차</span> {w.planned_date} · {WA[w.action]} · {w.staff_name}
                {w.message && <p className="mt-1 whitespace-pre-wrap text-xs text-stone-500">{w.message}</p>}
                {w.patient_reply && <p className="mt-1 text-xs"><span className="text-stone-500">답변:</span> {w.patient_reply}{w.reply_status === "waiting_doctor" ? " (원장 확인 대기)" : ""}</p>}
                {w.doctor_note && <p className="mt-1 text-xs text-green-800">원장님 지시: {w.doctor_note}</p>}
                {w.action === "sent" && !w.patient_reply && replyFor !== w.id && (
                  <button className="mt-1 text-xs underline" onClick={() => { setReplyFor(w.id); setReplyText(""); }}>답변 기록</button>
                )}
                {replyFor === w.id && (
                  <div className="mt-2 space-y-2">
                    <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={2} placeholder="환자가 보내온 답변 요약" className="w-full rounded border border-stone-300 px-2 py-1 text-sm" />
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={askDoctor} onChange={(e) => setAskDoctor(e.target.checked)} /> 원장님 확인 요청</label>
                    <div className="flex gap-2">
                      <button className={PRIMARY} disabled={!replyText.trim()} onClick={() => run(async () => { await recordReply(w.id, replyText.trim(), askDoctor); setReplyFor(null); })}>저장</button>
                      <button className={BTN} onClick={() => setReplyFor(null)}>취소</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-bold">처방 이력 ({prescs.length})</h2>
        {prescs.length === 0 && <p className="text-sm text-stone-500">처방이 없습니다</p>}
        <div className="space-y-3">
          {prescs.map((p, i) => (
            <div key={p.id} className="rounded-lg border border-stone-200 bg-white p-3">
              <p className="text-sm font-medium">
                {prescs.length - i}번째 · 수령 {p.receive_date} · {describePrescription(p)} ·{" "}
                {p.status === "active" ? "진행" : "종료"}
                {p.memo ? ` · ${p.memo}` : ""}
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {[...p.happy_calls]
                  .sort((a, b) => a.round - b.round)
                  .map((c) => (
                    <li key={c.id}>
                      <span className="rounded bg-stone-200 px-1.5 py-0.5 text-xs">{c.round}차</span> {c.due_date} ·{" "}
                      {ST[c.status]}
                      {c.missed_count > 0 ? ` · 안 받음 ${c.missed_count}회` : ""}
                      {c.contact_logs.length > 0 && (
                        <ul className="ml-4 mt-1 space-y-0.5 text-xs text-stone-600">
                          {[...c.contact_logs]
                            .sort((a, b) => a.created_at.localeCompare(b.created_at))
                            .map((l) => (
                              <li key={l.id}>
                                {fmt(l.created_at)} · {ACT[l.action]}
                                {l.channel ? ` · ${CH[l.channel]}` : ""} · {l.staff_name}
                                {l.memo ? ` · ${l.memo}` : ""}
                              </li>
                            ))}
                        </ul>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export default function PatientDetailPage() {
  return (
    <AuthGate>
      {() => (
        <>
          <AppHeader />
          <Detail />
        </>
      )}
    </AuthGate>
  );
}
