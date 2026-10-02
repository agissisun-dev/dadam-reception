"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import StaffSelect from "@/components/StaffSelect";
import {
  clearOverride,
  createAppointment,
  deleteAppointment,
  getSettings,
  listOverrides,
  listRange,
  markNotified,
  saveSettings,
  setOverride,
  setStatus,
  updateAppointment,
} from "@/lib/appointments";
import { KIND_LABEL, SOURCE_LABEL, STATUS_LABEL, countByDay, dateKo, dayHours, fillTemplate, parseNaverPaste, slotLoad, slotsOf } from "@/lib/appointmentRules";
import { clinicInfo, fetchCurrentClinic, type ClinicCode } from "@/lib/clinic";
import { firstDayISO, isInMonth, lastDayISO, monthGrid, monthLabel, shiftMonth, yearMonthOf, type YearMonth } from "@/lib/calendarRules";
import { addDays, todayISO } from "@/lib/dates";
import { holidayLabel } from "@/lib/holidays";
import { listPatients } from "@/lib/patients";
import { maskPhone } from "@/lib/phone";
import { conditionLabel } from "@/lib/conditions";
import { STAFF_NAMES, loadLastStaff, saveLastStaff, type StaffName } from "@/lib/staff";
import type { Appointment, AppointmentKind, AppointmentSettings, ClinicDayOverride, Patient } from "@/lib/types";

const BTN = "rounded border border-stone-300 bg-white px-3 py-1.5 text-sm";
const PRIMARY = "rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50";
const IN = "h-8 rounded border border-stone-300 px-2 text-sm";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type Banner = { patientId: number | null; name: string; entryId: number | null; happyCallId: number | null } | null;

/** 빈 자리를 눌렀을 때 뜨는 작은 창 */
function BookBox({
  day, time, kind, patients, staff, preset, onDone, onCancel, full,
}: {
  day: string; time: string; kind: AppointmentKind; patients: Patient[]; staff: StaffName;
  preset: Banner; onDone: (a: Appointment) => void; onCancel: () => void; full: boolean;
}) {
  const [name, setName] = useState(preset?.name ?? "");
  const [patientId, setPatientId] = useState<number | null>(preset?.patientId ?? null);
  const [phone, setPhone] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();
  const same = trimmed ? patients.filter((p) => p.name === trimmed) : [];
  const linked = patientId ? patients.find((p) => p.id === patientId) ?? null : same.length === 1 ? same[0] : null;

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const a = await createAppointment({
        day, time, kind,
        patient_id: linked?.id ?? null,
        patient_name: trimmed,
        phone: linked ? linked.phone : phone || null,
        source: preset?.happyCallId ? "happycall" : preset?.entryId ? "ledger" : "desk",
        memo,
        happy_call_id: preset?.happyCallId ?? null,
        ledger_entry_id: preset?.entryId ?? null,
        staff_name: staff,
      });
      onDone(a);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-[#16863b] bg-white p-3 text-sm shadow">
      <p className="font-bold">
        {dateKo(day)} {time} · {KIND_LABEL[kind]}
        {full && <span className="ml-2 text-xs text-red-700">이 칸은 꽉 찼지만 그래도 잡습니다</span>}
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-[11px] text-stone-500">이름 (두세 글자 치면 환자 목록에서 찾음)</span>
          <input
            list="appt-patients"
            value={name}
            onChange={(e) => { setName(e.target.value); setPatientId(null); }}
            autoFocus
            autoComplete="off"
            className={`${IN} block w-44 ${linked ? "border-[#16863b]" : ""}`}
          />
          <datalist id="appt-patients">
            {patients.map((p) => (
              <option key={p.id} value={p.name}>{`${maskPhone(p.phone)} · ${conditionLabel(p.condition)}`}</option>
            ))}
          </datalist>
        </label>
        {!linked && (
          <label className="block">
            <span className="text-[11px] text-stone-500">연락처 (선택, 안내 문자용)</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" placeholder="01012345678" className={`${IN} block w-36`} />
          </label>
        )}
        <label className="block">
          <span className="text-[11px] text-stone-500">메모</span>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} className={`${IN} block w-44`} />
        </label>
        <button type="button" onClick={save} disabled={busy || !trimmed} className={PRIMARY}>{busy ? "저장 중…" : "예약 잡기"}</button>
        <button type="button" onClick={onCancel} className={BTN}>닫기</button>
      </div>
      {same.length > 1 && !patientId && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-stone-500">같은 이름이 {same.length}명입니다. 누구인가요?</span>
          {same.map((p) => (
            <button key={p.id} type="button" onClick={() => setPatientId(p.id)} className="rounded border border-stone-300 px-2 py-0.5">{p.name} · {maskPhone(p.phone)}</button>
          ))}
        </div>
      )}
      {linked && <p className="mt-1 text-xs text-[#16863b]">환자 연결됨 · {maskPhone(linked.phone)} · {conditionLabel(linked.condition)}</p>}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

function Board() {
  const router = useRouter();
  const params = useSearchParams();
  const today = todayISO();
  const [clinic, setClinic] = useState<ClinicCode>("S");
  const [day, setDay] = useState(() => todayISO());
  const [month, setMonth] = useState<YearMonth>(() => yearMonthOf(todayISO()));
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [overrides, setOverrides] = useState<ClinicDayOverride[]>([]);
  const [settings, setSettings] = useState<AppointmentSettings | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [staff, setStaff] = useState<StaffName>(() => (typeof window === "undefined" ? STAFF_NAMES[0] : loadLastStaff()));
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<{ time: string; kind: AppointmentKind; full: boolean } | null>(null);
  const [justBooked, setJustBooked] = useState<Appointment | null>(null);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNaver, setShowNaver] = useState(false);
  const [naverText, setNaverText] = useState("");
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const banner: Banner = useMemo(() => {
    const forId = params.get("for");
    const name = params.get("name");
    if (!forId && !name) return null;
    return { patientId: forId ? Number(forId) : null, name: name ?? "", entryId: params.get("entry") ? Number(params.get("entry")) : null, happyCallId: params.get("hc") ? Number(params.get("hc")) : null };
  }, [params]);
  const bannerName = banner ? (banner.name || patients.find((p) => p.id === banner.patientId)?.name || "") : "";

  const monthFrom = firstDayISO(month);
  const monthTo = lastDayISO(month);
  const load = useCallback(() => {
    const from = addDays(monthFrom, -7);
    const to = addDays(monthTo, 7);
    Promise.all([listRange(from, to), listOverrides(from, to)])
      .then(([a, o]) => {
        setAppts(a);
        setOverrides(o);
        setLoadedKey(`${monthFrom}`);
      })
      .catch((e: Error) => setError(e.message));
  }, [monthFrom, monthTo]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    Promise.all([getSettings(), listPatients(), fetchCurrentClinic()])
      .then(([s, p, c]) => {
        setSettings(s);
        setPatients(p);
        setClinic(c);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const changed = () => {
    saveLastStaff(staff);
    load();
  };
  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      changed();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const s = settings ?? { clinic, slot_minutes: 30, consult_per_slot: 1, treatment_per_slot: 3, notify_body: "" };
  const overrideOf = (iso: string) => overrides.find((o) => o.day === iso) ?? null;
  const hours = dayHours(day, clinic, overrideOf(day));
  const slots = slotsOf(hours, s.slot_minutes);
  const dayAppts = appts.filter((a) => a.day === day);
  const counts = countByDay(appts);
  const info = clinicInfo(clinic);
  const live = dayAppts.filter((a) => a.status !== "cancelled");
  const consultN = live.filter((a) => a.kind === "consult").length;

  const notifyText = (a: Appointment) => fillTemplate(s.notify_body, { 이름: a.patient_name, 병원: info.name, 날짜: dateKo(a.day), 시간: a.time });

  function pickDay(iso: string) {
    setDay(iso);
    setBooking(null);
    setEditing(null);
    if (!isInMonth(iso, month)) setMonth(yearMonthOf(iso));
  }

  return (
    <main className="mx-auto max-w-7xl space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => pickDay(addDays(day, -1))} className={BTN} aria-label="전날">◀</button>
          <h1 className="text-xl font-bold">{dateKo(day)} 예약</h1>
          <button type="button" onClick={() => pickDay(addDays(day, 1))} className={BTN} aria-label="다음 날">▶</button>
          {day !== today && <button type="button" onClick={() => pickDay(today)} className="text-sm text-stone-500 underline">오늘</button>}
          <span className="text-xs text-stone-500">
            예약 {live.length}명 (상담 {consultN} · 침 {live.length - consultN}) · 내원 {live.filter((a) => a.status === "arrived").length} · 노쇼 {dayAppts.filter((a) => a.status === "noshow").length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={`${BTN} border-[#06478f] text-[#06366f]`} onClick={() => setShowNaver((v) => !v)}>N 네이버 붙여넣기</button>
          <button type="button" className={BTN} onClick={() => setShowSettings((v) => !v)}>설정 (간격·안내 문구)</button>
          <div className="w-36"><StaffSelect value={staff} onChange={setStaff} /></div>
        </div>
      </div>

      {banner && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#16863b] bg-[#f0f7f3] px-3 py-2 text-sm">
          <b className="text-[#0f3d23]">{bannerName || "환자"}님 다음 예약 잡는 중</b>
          <span className="text-stone-600">— 달력에서 날짜, 시간표에서 빈 자리를 누르면 그 자리로 잡힙니다.</span>
          <button type="button" className={`${BTN} ml-auto`} onClick={() => router.push(banner.entryId ? "/ledger" : banner.happyCallId ? "/happy-calls" : "/appointments")}>
            취소하고 돌아가기
          </button>
        </div>
      )}

      {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {showSettings && settings && (
        <SettingsBox settings={settings} onSaved={(ns) => { setSettings(ns); setShowSettings(false); }} onClose={() => setShowSettings(false)} />
      )}

      {showNaver && (
        <NaverBox text={naverText} setText={setNaverText} patients={patients} staff={staff} onDone={() => { setShowNaver(false); setNaverText(""); changed(); }} onClose={() => setShowNaver(false)} />
      )}

      <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)_300px]">
        {/* 달력 */}
        <section className="rounded-lg border border-stone-200 bg-white p-3 text-sm">
          <div className="mb-1 flex items-center justify-between">
            <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="rounded border border-stone-300 px-2 text-xs" aria-label="지난 달">◀</button>
            <b>{monthLabel(month)}</b>
            <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="rounded border border-stone-300 px-2 text-xs" aria-label="다음 달">▶</button>
          </div>
          <div className="grid grid-cols-7 text-center text-[10px] text-stone-500">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={i === 0 ? "text-red-600" : i === 6 ? "text-blue-700" : ""}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {monthGrid(month).flat().map((iso) => {
              const inMonth = isInMonth(iso, month);
              const h = dayHours(iso, clinic, overrideOf(iso));
              const ov = overrideOf(iso);
              const n = counts.get(iso) ?? 0;
              const sel = iso === day;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => pickDay(iso)}
                  className={`flex min-h-11 flex-col items-center rounded border px-0.5 py-0.5 text-xs ${
                    sel ? "border-2 border-[#16863b] bg-[#f0f7f3] font-bold" : ov ? "border-amber-600 bg-amber-50" : h.open ? "border-stone-200 bg-white" : "border-stone-100 bg-stone-100 text-stone-400"
                  } ${inMonth ? "" : "opacity-40"}`}
                  title={h.note ?? (h.open ? "" : "휴진")}
                >
                  <span className={iso === today ? "rounded-full bg-[#16863b] px-1.5 text-white" : ""}>{Number(iso.slice(8))}</span>
                  <span className="text-[10px] text-stone-500">{h.open ? (n > 0 ? n : " ") : (holidayLabel(iso) ? holidayLabel(iso)!.slice(0, 4) : "휴진")}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-stone-500">날짜 아래 숫자 = 예약 수. 회색 = 휴진, 주황 = 그날만 바꾼 날. 누르면 오른쪽 시간표가 그날로 바뀝니다.</p>
          <button type="button" className={`${BTN} mt-2 w-full`} onClick={() => setShowOverride((v) => !v)}>
            {dateKo(day)} 진료 바꾸기 (휴진 ↔ 진료)
          </button>
          {showOverride && (
            <OverrideBox day={day} current={overrideOf(day)} open={hours.open} onDone={() => { setShowOverride(false); changed(); }} onClose={() => setShowOverride(false)} />
          )}
        </section>

        {/* 시간표 */}
        <section className="min-w-0 rounded-lg border border-stone-200 bg-white">
          <div className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-3 py-2 text-[11px] font-bold text-stone-500">
            <span className="w-12">시간</span>
            <span className="w-52">초진·약상담 ({s.slot_minutes}분에 {s.consult_per_slot}명)</span>
            <span>침치료 ({s.slot_minutes}분에 {s.treatment_per_slot}명)</span>
            {hours.note && <span className="ml-auto font-normal text-amber-800">{hours.note}</span>}
          </div>
          {loadedKey === null ? (
            <p className="p-4 text-sm text-stone-500">불러오는 중…</p>
          ) : !hours.open ? (
            <p className="p-6 text-center text-sm text-stone-500">{dateKo(day)}은 휴진입니다{hours.note ? ` (${hours.note})` : ""}. 진료하려면 왼쪽 아래 [진료 바꾸기].</p>
          ) : (
            slots.map((t, idx) => {
              const lo = slotLoad(dayAppts, t, s);
              const here = dayAppts.filter((a) => a.time === t && a.status !== "cancelled");
              const lunchBefore = hours.lunchStart && idx > 0 && slots[idx - 1] < hours.lunchStart && t >= hours.lunchStart;
              return (
                <div key={t}>
                  {lunchBefore && <div className="border-t border-stone-100 bg-stone-50 px-3 py-1 text-xs text-stone-400">점심시간 {hours.lunchStart} ~ {hours.lunchEnd}</div>}
                  <div className="flex min-h-10 items-center gap-2 border-t border-stone-100 px-3 py-1.5 text-sm">
                    <span className="w-12 text-stone-500">{t}</span>
                    <span className="flex w-52 flex-wrap gap-1">
                      {here.filter((a) => a.kind === "consult").map((a) => <Chip key={a.id} a={a} onClick={() => setEditing(a)} consult />)}
                      {!lo.consultFull ? (
                        <button type="button" onClick={() => setBooking({ time: t, kind: "consult", full: false })} className="rounded border border-dashed border-amber-600 px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-50">+ 빈 자리</button>
                      ) : (
                        <button type="button" onClick={() => setBooking({ time: t, kind: "consult", full: true })} className="rounded px-1 text-[10px] text-red-700 underline" title="꽉 찼지만 잡기">꽉 참 · 그래도</button>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-1">
                      {here.filter((a) => a.kind === "treatment").map((a) => <Chip key={a.id} a={a} onClick={() => setEditing(a)} />)}
                      {Array.from({ length: Math.max(0, lo.treatmentMax - lo.treatment) }).map((_, i) => (
                        <button key={i} type="button" onClick={() => setBooking({ time: t, kind: "treatment", full: false })} className="rounded-full border border-dashed border-stone-400 px-2 py-0.5 text-xs text-stone-500 hover:bg-stone-50">+ 빈 자리</button>
                      ))}
                      {lo.treatmentFull && (
                        <button type="button" onClick={() => setBooking({ time: t, kind: "treatment", full: true })} className="px-1 text-[10px] text-red-700 underline">침 {lo.treatment}/{lo.treatmentMax} · 그래도</button>
                      )}
                    </span>
                  </div>
                  {booking && booking.time === t && (
                    <div className="px-3 pb-2">
                      <BookBox
                        day={day} time={t} kind={booking.kind} full={booking.full} patients={patients} staff={staff} preset={banner}
                        onDone={(a) => {
                          setBooking(null);
                          setJustBooked(a);
                          saveLastStaff(staff);
                          load();
                          if (banner) router.replace("/appointments");
                        }}
                        onCancel={() => setBooking(null)}
                      />
                    </div>
                  )}
                  {editing && editing.time === t && (
                    <div className="px-3 pb-2">
                      <EditBox a={editing} staff={staff} notify={notifyText(editing)} onChanged={() => { setEditing(null); changed(); }} onClose={() => setEditing(null)} />
                    </div>
                  )}
                </div>
              );
            })
          )}
          <p className="border-t border-stone-200 px-3 py-2 text-[11px] text-stone-500">
            빈 자리를 누르면 그 시간·그 종류로 잡힙니다. 칸을 누르면 고치거나 상태를 바꿉니다. N 네이버 · 해 해피콜에서 · 수 수납 뒤 다음 예약.
          </p>
        </section>

        {/* 올 사람 */}
        <section className="rounded-lg border border-stone-200 bg-white p-3 text-sm">
          <h2 className="font-bold">{dateKo(day)} 올 사람 {live.length}명</h2>
          <ul className="mt-2 space-y-1">
            {dayAppts.map((a) => {
              const done = a.status === "arrived";
              const bad = a.status === "noshow" || a.status === "cancelled";
              return (
                <li key={a.id} className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${done ? "bg-stone-200 text-stone-500" : bad ? "border border-red-200 bg-red-50 text-red-700" : "border border-stone-200"}`}>
                  <span className="w-10">{a.time}</span>
                  <span className={`min-w-0 flex-1 truncate ${bad ? "line-through" : ""}`}>
                    {a.patient_name} · {KIND_LABEL[a.kind]} {a.source !== "desk" && <b>{SOURCE_LABEL[a.source]}</b>}
                  </span>
                  {a.status === "booked" ? (
                    <>
                      <button type="button" className="rounded bg-[#16863b] px-2 py-0.5 text-[11px] font-bold text-white" onClick={() => run(async () => { await setStatus(a.id, "arrived", staff); router.push(`/ledger?name=${encodeURIComponent(a.patient_name)}&appt=${a.id}${a.patient_id ? `&pid=${a.patient_id}` : ""}`); })}>내원</button>
                      <button type="button" className="rounded border border-stone-300 px-1.5 py-0.5 text-[11px]" onClick={() => run(() => setStatus(a.id, "noshow", staff))}>노쇼</button>
                      <button type="button" className="rounded border border-stone-300 px-1.5 py-0.5 text-[11px]" onClick={() => run(() => setStatus(a.id, "cancelled", staff))}>취소</button>
                    </>
                  ) : (
                    <span>{STATUS_LABEL[a.status]}{a.ledger_entry_id ? " · 수납 끝" : ""}</span>
                  )}
                </li>
              );
            })}
            {dayAppts.length === 0 && <li className="text-xs text-stone-400">예약이 없습니다.</li>}
          </ul>
          <p className="mt-3 rounded bg-[#f0f7f3] p-2 text-[11px] text-[#0f3d23]">[내원]을 누르면 오늘 장부로 가서 새 줄에 이름이 미리 들어갑니다.</p>
        </section>
      </div>

      {justBooked && (
        <section className="flex flex-wrap items-center gap-3 rounded-lg border border-[#16863b] bg-white p-3 text-sm">
          <b className="text-[#0f3d23]">잡혔습니다 · {justBooked.patient_name} · {dateKo(justBooked.day)} {justBooked.time} {KIND_LABEL[justBooked.kind]}</b>
          <span className="min-w-[280px] flex-1 rounded bg-stone-50 px-3 py-1.5">{notifyText(justBooked)}</span>
          <button type="button" className={BTN} onClick={() => { navigator.clipboard?.writeText(notifyText(justBooked)).catch(() => undefined); }}>복사</button>
          <button type="button" className={PRIMARY} onClick={() => run(async () => { await markNotified(justBooked.id, "병원 휴대폰"); setJustBooked(null); })}>병원 휴대폰으로 보냈음</button>
          <button type="button" className="text-xs text-stone-500 underline" onClick={() => setJustBooked(null)}>닫기</button>
          {banner?.entryId && <Link href="/ledger" className="text-xs underline">장부로 돌아가기</Link>}
        </section>
      )}
    </main>
  );
}

function Chip({ a, onClick, consult }: { a: Appointment; onClick: () => void; consult?: boolean }) {
  const done = a.status === "arrived";
  const bad = a.status === "noshow";
  const base = done ? "border-stone-400 bg-stone-200 text-stone-500" : bad ? "border-red-600 bg-red-50 text-red-700 line-through" : consult ? "border-amber-600 bg-amber-50 font-bold text-amber-900" : "border-stone-400 bg-white";
  return (
    <button type="button" onClick={onClick} className={`rounded${consult ? "" : "-full"} border px-2 py-0.5 text-xs ${base}`} title={a.memo ?? ""}>
      {a.patient_name}
      {done && " ✓"}
      {a.source !== "desk" && <b className="ml-1 text-[10px]">{SOURCE_LABEL[a.source]}</b>}
    </button>
  );
}

function EditBox({ a, staff, notify, onChanged, onClose }: { a: Appointment; staff: StaffName; notify: string; onChanged: () => void; onClose: () => void }) {
  const [day, setDay] = useState(a.day);
  const [time, setTime] = useState(a.time);
  const [kind, setKind] = useState<AppointmentKind>(a.kind);
  const [name, setName] = useState(a.patient_name);
  const [memo, setMemo] = useState(a.memo ?? "");
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="rounded-lg border border-stone-300 bg-white p-3 text-sm shadow">
      <div className="flex flex-wrap items-end gap-2">
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={IN} />
        <input value={time} onChange={(e) => setTime(e.target.value)} className={`${IN} w-20`} placeholder="HH:MM" />
        <select value={kind} onChange={(e) => setKind(e.target.value as AppointmentKind)} className={IN}>
          <option value="consult">약상담</option>
          <option value="treatment">침치료</option>
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${IN} w-32`} />
        <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모" className={`${IN} w-40`} />
        <button type="button" className={PRIMARY} onClick={() => run(() => updateAppointment(a.id, { day, time, kind, patient_name: name.trim() || a.patient_name, memo: memo.trim() || null }))}>저장</button>
        <button type="button" className={BTN} onClick={onClose}>닫기</button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-stone-500">{STATUS_LABEL[a.status]} · {SOURCE_LABEL[a.source] === "N" ? "네이버" : a.source === "happycall" ? "해피콜에서" : a.source === "ledger" ? "수납 뒤" : "접수실"} · {a.staff_name}{a.notified_at ? ` · 안내 보냄(${a.notify_note ?? ""})` : ""}</span>
        {a.status !== "booked" && <button type="button" className="underline" onClick={() => run(() => setStatus(a.id, "booked", staff))}>예약으로 되돌리기</button>}
        {a.status === "booked" && <button type="button" className="underline" onClick={() => run(() => setStatus(a.id, "cancelled", staff))}>취소</button>}
        {a.patient_id && <Link href={`/patients/${a.patient_id}`} className="underline">환자 상세</Link>}
        <button type="button" className="ml-auto text-red-700 underline" onClick={() => { if (window.confirm("이 예약을 지울까요?")) run(() => deleteAppointment(a.id)); }}>지우기</button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded bg-stone-50 p-2 text-xs">
        <span className="min-w-[240px] flex-1">{notify}</span>
        <button type="button" className={BTN} onClick={() => { navigator.clipboard?.writeText(notify).catch(() => undefined); }}>복사</button>
        <button type="button" className={BTN} onClick={() => run(() => markNotified(a.id, "병원 휴대폰"))}>병원 휴대폰으로 보냈음</button>
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

function OverrideBox({ day, current, open, onDone, onClose }: { day: string; current: ClinicDayOverride | null; open: boolean; onDone: () => void; onClose: () => void }) {
  const [willOpen, setWillOpen] = useState(!open);
  const [start, setStart] = useState(current?.start_time ?? "09:30");
  const [end, setEnd] = useState(current?.end_time ?? "18:00");
  const [lunch, setLunch] = useState(!!(current?.lunch_start ?? true));
  const [memo, setMemo] = useState(current?.memo ?? "");
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setError(null);
    try {
      await setOverride({ day, open: willOpen, start_time: willOpen ? start : null, end_time: willOpen ? end : null, lunch_start: willOpen && lunch ? "13:00" : null, lunch_end: willOpen && lunch ? "14:00" : null, memo: memo.trim() || null });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="mt-2 space-y-2 rounded border border-amber-600 bg-amber-50 p-2 text-xs">
      <p>{dateKo(day)}은 지금 <b>{open ? "진료" : "휴진"}</b>입니다. 이날만 바꿉니다.</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setWillOpen(true)} className={`rounded border px-2 py-1 ${willOpen ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white"}`}>진료</button>
        <button type="button" onClick={() => setWillOpen(false)} className={`rounded border px-2 py-1 ${!willOpen ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white"}`}>휴진</button>
      </div>
      {willOpen && (
        <div className="flex flex-wrap items-center gap-1.5">
          <input value={start} onChange={(e) => setStart(e.target.value)} className="h-7 w-16 rounded border border-stone-300 px-1" /> ~
          <input value={end} onChange={(e) => setEnd(e.target.value)} className="h-7 w-16 rounded border border-stone-300 px-1" />
          <label className="flex items-center gap-1"><input type="checkbox" checked={lunch} onChange={(e) => setLunch(e.target.checked)} /> 점심 13~14</label>
        </div>
      )}
      <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (예: 개천절 대신 진료)" className="h-7 w-full rounded border border-stone-300 px-2" />
      <div className="flex gap-2">
        <button type="button" className={PRIMARY} onClick={save}>저장</button>
        {current && <button type="button" className={BTN} onClick={async () => { try { await clearOverride(day); onDone(); } catch (e) { setError((e as Error).message); } }}>원래대로</button>}
        <button type="button" className={BTN} onClick={onClose}>닫기</button>
      </div>
      {error && <p className="text-red-700">{error}</p>}
    </div>
  );
}

function SettingsBox({ settings, onSaved, onClose }: { settings: AppointmentSettings; onSaved: (s: AppointmentSettings) => void; onClose: () => void }) {
  const [slot, setSlot] = useState(settings.slot_minutes);
  const [consult, setConsult] = useState(settings.consult_per_slot);
  const [treat, setTreat] = useState(settings.treatment_per_slot);
  const [body, setBody] = useState(settings.notify_body);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="rounded-lg border border-stone-300 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="text-[11px] text-stone-500">칸 간격(분)</span>
          <select value={slot} onChange={(e) => setSlot(Number(e.target.value))} className={`${IN} block`}><option value={15}>15</option><option value={30}>30</option></select></label>
        <label className="block"><span className="text-[11px] text-stone-500">한 칸 상담</span><input type="number" min={0} value={consult} onChange={(e) => setConsult(Number(e.target.value))} className={`${IN} block w-16`} /></label>
        <label className="block"><span className="text-[11px] text-stone-500">한 칸 침</span><input type="number" min={0} value={treat} onChange={(e) => setTreat(Number(e.target.value))} className={`${IN} block w-16`} /></label>
      </div>
      <label className="mt-2 block"><span className="text-[11px] text-stone-500">예약 안내 문구 — 자리표 {"{이름} {병원} {날짜} {시간}"}</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} className="w-full rounded border border-stone-300 px-2 py-1 text-sm" /></label>
      <div className="mt-2 flex gap-2">
        <button type="button" className={PRIMARY} onClick={async () => { try { await saveSettings({ slot_minutes: slot, consult_per_slot: consult, treatment_per_slot: treat, notify_body: body }); onSaved({ ...settings, slot_minutes: slot, consult_per_slot: consult, treatment_per_slot: treat, notify_body: body }); } catch (e) { setError((e as Error).message); } }}>저장</button>
        <button type="button" className={BTN} onClick={onClose}>닫기</button>
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </section>
  );
}

function NaverBox({ text, setText, patients, staff, onDone, onClose }: { text: string; setText: (s: string) => void; patients: Patient[]; staff: StaffName; onDone: () => void; onClose: () => void }) {
  const rows = useMemo(() => parseNaverPaste(text), [text]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function importAll() {
    setBusy(true);
    setError(null);
    let ok = 0;
    const fails: string[] = [];
    for (const r of rows.filter((x) => x.ok)) {
      const found = r.phone ? patients.find((p) => p.phone === r.phone) : null;
      try {
        await createAppointment({ day: r.day, time: r.time, kind: "treatment", patient_id: found?.id ?? null, patient_name: found?.name ?? r.name, phone: r.phone, source: "naver", naver_key: r.key, staff_name: staff });
        ok += 1;
      } catch (e) {
        fails.push(`${r.name}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    if (fails.length) setError(`${ok}건 넣음. 못 넣은 것: ${fails.join(" / ")}`);
    else onDone();
  }
  return (
    <section className="rounded-lg border border-[#06478f] bg-white p-3 text-sm">
      <p className="text-xs text-stone-600">스마트플레이스 예약 목록을 복사해 붙여 넣으세요. 한 줄에 하나(날짜 · 시간 · 이름 · 연락처 · 예약번호). 종류는 침으로 들어가고, 칸을 눌러 바꿀 수 있습니다. 같은 예약번호는 두 번 안 들어갑니다.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={"2026.10.19 오후 2:30 홍길동 010-1234-5678 예약번호 A1B2C3"} className="mt-2 w-full rounded border border-stone-300 px-2 py-1 text-sm" />
      {rows.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {rows.map((r, i) => (
            <li key={i} className={r.ok ? "" : "text-red-700"}>{r.ok ? `${r.day} ${r.time} ${r.name}${r.phone ? ` · ${maskPhone(r.phone)}` : ""}${r.key ? ` · ${r.key}` : ""}` : `못 읽음: ${r.raw}`}</li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex gap-2">
        <button type="button" className={PRIMARY} disabled={busy || rows.filter((r) => r.ok).length === 0} onClick={importAll}>N 표시로 넣기 ({rows.filter((r) => r.ok).length}건)</button>
        <button type="button" className={BTN} onClick={onClose}>닫기</button>
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </section>
  );
}

export default function AppointmentsPage() {
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
