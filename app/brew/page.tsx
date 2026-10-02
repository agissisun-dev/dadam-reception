"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import StaffSelect from "@/components/StaffSelect";
import { createJobs, deleteJob, listJobs, listUnscheduled, listWeekdayRules, markDone, saveWeekdayRule, updateJob } from "@/lib/brew";
import { KIND_LABEL, POUCHES, dayCounts, dayHeader, fermentMidDays, jobLabel, planJobsFromLedger, weekDays, weekMonday } from "@/lib/brewRules";
import { addDays, todayISO } from "@/lib/dates";
import { holidayLabel, isClinicClosed } from "@/lib/holidays";
import { STAFF_NAMES, loadLastStaff, saveLastStaff, type StaffName } from "@/lib/staff";
import type { BrewJob, BrewWeekdayRule } from "@/lib/types";

const BTN = "rounded border border-stone-300 bg-white px-3 py-1.5 text-sm";
const PRIMARY = "rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50";
const IN = "h-8 rounded border border-stone-300 px-2 text-sm";
const WEEKDAY_KO = ["", "월", "화", "수", "목", "금", "토"];

function cardClass(j: BrewJob): string {
  if (j.status === "done") return "border-stone-400 bg-stone-200 text-stone-500";
  if (j.kind === "ferment_start" || j.kind === "ferment_end") return "border-[#16863b] bg-[#f0f7f3]";
  if (j.kind === "batch") return "border-[#06478f] bg-[#f5f8fc]";
  if (j.kind === "note") return "border-yellow-600 bg-yellow-50";
  return "border-amber-600 bg-amber-50";
}

const POUCH_COLOR: Record<string, string> = { 다담: "#16863b", 애장금: "#bfa37a", 자연과사람: "#06478f", 공룡: "#b91c1c" };

/** 칸 하나. 누르면 펼쳐져 고칠 수 있다. */
function Card({ j, staff, onChanged }: { j: BrewJob; staff: StaffName; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(j.day ?? "");
  const [slot, setSlot] = useState(j.slot);
  const [title, setTitle] = useState(j.title);
  const [name, setName] = useState(j.patient_name);
  const [delivery, setDelivery] = useState<"pickup" | "courier" | "">(j.delivery ?? "");
  const [region, setRegion] = useState(j.region ?? "");
  const [pouch, setPouch] = useState(j.pouch ?? "");
  const [memo, setMemo] = useState(j.memo ?? "");
  const [receive, setReceive] = useState(j.receive_day ?? "");
  const [maxJobs, setMaxJobs] = useState(j.max_jobs === null ? "" : String(j.max_jobs));
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const label = jobLabel(j);
  return (
    <div className={`rounded border px-2 py-1.5 text-xs ${cardClass(j)}`}>
      <div className="flex items-center gap-1">
        {j.pouch && <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: POUCH_COLOR[j.pouch] ?? "#a8a29e" }} title={`파우치 ${j.pouch}`} />}
        <button type="button" onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 truncate text-left" title={label}>
          {label}
          {j.memo && <span className={`ml-1 ${j.memo === "포 수 없음" ? "text-red-700" : "text-stone-500"}`}>· {j.memo}</span>}
        </button>
        {j.kind !== "note" && (
          <button
            type="button"
            onClick={() => run(() => markDone(j, j.status !== "done", staff))}
            className={`h-6 w-6 shrink-0 rounded-full border text-[11px] ${j.status === "done" ? "border-stone-500 bg-stone-500 text-white" : "border-stone-400 bg-white"}`}
            title={j.status === "done" ? "끝남 취소" : "끝남"}
          >
            o
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-stone-300/60 pt-2 text-stone-800">
          <div className="flex flex-wrap items-center gap-1.5">
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={IN} />
            <select value={slot} onChange={(e) => setSlot(e.target.value as "am" | "pm")} className={IN}>
              <option value="am">오전</option>
              <option value="pm">오후</option>
            </select>
            <span className="text-[11px] text-stone-500">{KIND_LABEL[j.kind]}{j.pair_id ? " · 짝 있음(같이 옮김)" : ""}</span>
          </div>
          {j.kind !== "note" && j.kind !== "batch" && (
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" className={IN} />
          )}
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="종류 (보험(처방) · 일반 · 디스크 100팩 · 메모)" className={IN} />
          {j.kind !== "note" && (
            <div className="flex flex-wrap items-center gap-1.5">
              <select value={delivery} onChange={(e) => setDelivery(e.target.value as "pickup" | "courier" | "")} className={IN}>
                <option value="">받는 방법 없음</option>
                <option value="pickup">직접</option>
                <option value="courier">택배</option>
              </select>
              <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="지역 · 시간 메모" className={`${IN} w-32`} />
              <select value={pouch} onChange={(e) => setPouch(e.target.value)} className={IN}>
                <option value="">파우치 없음</option>
                {POUCHES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          )}
          {j.kind === "note" && (
            <label className="flex items-center gap-1.5 text-[11px] text-stone-600">
              그날 한도 바꾸기 <input type="number" min={0} value={maxJobs} onChange={(e) => setMaxJobs(e.target.value)} placeholder="예: 0" className={`${IN} w-16`} /> (월차면 0)
            </label>
          )}
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모" className={IN} />
          {j.prescription_id && (
            <label className="flex items-center gap-1.5 text-[11px] text-stone-600">
              받는 날(해피콜 기준) <input type="date" value={receive} onChange={(e) => setReceive(e.target.value)} className={IN} />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={PRIMARY}
              onClick={() =>
                run(async () => {
                  await updateJob(j, {
                    day: day || null,
                    slot,
                    title: title.trim() || j.title,
                    patient_name: name.trim(),
                    delivery: delivery || null,
                    region: region.trim() || null,
                    pouch: pouch || null,
                    memo: memo.trim() || null,
                    max_jobs: j.kind === "note" ? (maxJobs === "" ? null : Number(maxJobs)) : null,
                    receive_day: j.prescription_id ? receive || null : undefined,
                  });
                  setOpen(false);
                })
              }
            >
              저장
            </button>
            <button type="button" className={BTN} onClick={() => setOpen(false)}>닫기</button>
            {j.patient_id && (
              <Link href={`/patients/${j.patient_id}`} className="text-[11px] underline">환자 상세</Link>
            )}
            {j.ledger_entry_id && <span className="text-[11px] text-stone-500">장부에서 들어옴</span>}
            <button
              type="button"
              className="ml-auto text-[11px] text-red-700 underline"
              onClick={() => {
                if (window.confirm(`"${label}" 칸을 지울까요?${j.pair_id ? " 발효 짝도 같이 지워집니다." : ""} 처방·해피콜은 그대로 둡니다.`)) run(() => deleteJob(j));
              }}
            >
              칸 지우기
            </button>
          </div>
          {error && <p className="text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}

type AddKind = "general" | "fermented" | "batch" | "note";

/** 손으로 칸 넣기: 탕약일반 · 탕약발효 · 지정처방 · 메모 (순서는 접수실 2026-10-02) */
function AddJob({ defaultDay, staff, onDone, onCancel }: { defaultDay: string; staff: StaffName; onDone: () => void; onCancel: () => void }) {
  const [kind, setKind] = useState<AddKind>("general");
  const [day, setDay] = useState(defaultDay);
  const [slot, setSlot] = useState<"am" | "pm">("am");
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");
  const [delivery, setDelivery] = useState<"pickup" | "courier" | "">("");
  const [region, setRegion] = useState("");
  const [maxJobs, setMaxJobs] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if ((kind === "general" || kind === "fermented") && !name.trim()) {
      setError("이름을 적어 주세요.");
      return;
    }
    if ((kind === "batch" || kind === "note") && !memo.trim()) {
      setError(kind === "batch" ? "어떤 지정처방을 달일지 적어 주세요. 예: 디스크약, 아토피약 발효" : "메모 내용을 적어 주세요.");
      return;
    }
    try {
      if (kind === "general" || kind === "fermented") {
        await createJobs(
          planJobsFromLedger({
            patient_id: null,
            patient_name: name.trim(),
            title: kind === "fermented" ? "탕약발효" : "탕약일반",
            fermented: kind === "fermented",
            day,
            slot,
            delivery: delivery || null,
            region: region.trim() || null,
            pouch: null,
            split: null,
            staff_name: staff,
            prescription_id: null,
            ledger_entry_id: null,
          }).map((j) => ({ ...j, memo: memo.trim() || null })),
        );
      } else {
        await createJobs([
          {
            day: day || null,
            slot,
            kind: kind === "batch" ? "batch" : "note",
            patient_id: null,
            patient_name: "",
            title: kind === "batch" ? "지정처방" : memo.trim(),
            delivery: null,
            region: null,
            pouch: null,
            split_no: null,
            split_of: null,
            memo: kind === "batch" ? memo.trim() : null,
            max_jobs: kind === "note" && maxJobs !== "" ? Number(maxJobs) : null,
            receive_day: null,
            prescription_id: null,
            ledger_entry_id: null,
            sort_order: 0,
            staff_name: staff,
          },
        ]);
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const isDecoction = kind === "general" || kind === "fermented";
  return (
    <section className="rounded-lg border border-stone-300 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-[11px] text-stone-500">무엇</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as AddKind)} className={`${IN} block`}>
            <option value="general">탕약일반</option>
            <option value="fermented">탕약발효 (사흘)</option>
            <option value="batch">지정처방</option>
            <option value="note">메모 (월차 · 택배 마감)</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] text-stone-500">날짜</span>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={`${IN} block`} />
        </label>
        <select value={slot} onChange={(e) => setSlot(e.target.value as "am" | "pm")} className={IN}>
          <option value="am">오전</option>
          <option value="pm">오후</option>
        </select>
        {isDecoction && (
          <>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" className={`${IN} w-28`} />
            <select value={delivery} onChange={(e) => setDelivery(e.target.value as "pickup" | "courier" | "")} className={IN}>
              <option value="">받는 방법</option>
              <option value="pickup">직접</option>
              <option value="courier">택배</option>
            </select>
            <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="지역 · 시간" className={`${IN} w-28`} />
          </>
        )}
        <input
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder={kind === "batch" ? "어떤 지정처방 (예: 디스크약, 아토피약 발효)" : kind === "note" ? "탕쌤 월차" : "메모 (선택)"}
          className={`${IN} w-64`}
        />
        {kind === "note" && (
          <label className="flex items-center gap-1 text-[11px] text-stone-600">
            그날 한도 <input type="number" min={0} value={maxJobs} onChange={(e) => setMaxJobs(e.target.value)} placeholder="비우면 그대로" className={`${IN} w-24`} />
          </label>
        )}
        <button type="button" className={PRIMARY} onClick={save}>넣기</button>
        <button type="button" className={BTN} onClick={onCancel}>닫기</button>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </section>
  );
}

function RulesEditor({ rules, onSaved, onClose }: { rules: BrewWeekdayRule[]; onSaved: () => void; onClose: () => void }) {
  const [rows, setRows] = useState<BrewWeekdayRule[]>(() => [1, 2, 3, 4, 5, 6].map((w) => rules.find((r) => r.weekday === w) ?? { weekday: w, note: "", max_jobs: 4 }));
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setError(null);
    try {
      for (const r of rows) await saveWeekdayRule(r);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="rounded-lg border border-stone-300 bg-white p-3 text-sm">
      <p className="mb-2 text-xs text-stone-500">요일마다 매주 되풀이되는 메모와 하루 한도(달이는 것 + 짜는 것). 한 번 고치면 계속 적용됩니다. 넘겨도 막지는 않고 붉게만 보입니다.</p>
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r, i) => (
          <div key={r.weekday} className="flex items-center gap-1.5">
            <span className="w-5 font-bold">{WEEKDAY_KO[r.weekday]}</span>
            <input value={r.note} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, note: e.target.value } : x)))} placeholder="메모" className={`${IN} min-w-0 flex-1`} />
            <input type="number" min={0} value={r.max_jobs} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, max_jobs: Number(e.target.value) } : x)))} className={`${IN} w-16`} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" className={PRIMARY} onClick={save}>저장</button>
        <button type="button" className={BTN} onClick={onClose}>닫기</button>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </section>
  );
}

function Board() {
  const today = todayISO();
  const [monday, setMonday] = useState(() => weekMonday(todayISO()));
  const [jobs, setJobs] = useState<BrewJob[]>([]);
  const [unscheduled, setUnscheduled] = useState<BrewJob[]>([]);
  const [rules, setRules] = useState<BrewWeekdayRule[]>([]);
  const [staff, setStaff] = useState<StaffName>(() => (typeof window === "undefined" ? STAFF_NAMES[0] : loadLastStaff()));
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [editingRules, setEditingRules] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const load = useCallback(() => {
    const from = monday;
    const to = addDays(monday, 12);
    Promise.all([listJobs(from, to), listUnscheduled(), listWeekdayRules()])
      .then(([j, u, r]) => {
        setJobs(j);
        setUnscheduled(u);
        setRules(r);
        setLoadedFor(monday);
      })
      .catch((e: Error) => setError(e.message));
  }, [monday]);

  useEffect(() => {
    load();
  }, [load]);

  const changed = () => {
    saveLastStaff(staff);
    load();
  };

  const weeks = [weekDays(monday), weekDays(addDays(monday, 7))];
  const ruleOf = (iso: string) => rules.find((r) => r.weekday === new Date(iso + "T00:00:00").getDay());
  /** 발효 중인 날(시작과 끝 사이)에 보여 줄 표시. 저장하지 않고 화면에서만 계산한다. */
  const mids = fermentMidDays(jobs);
  const real = jobs.filter((j) => j.kind !== "note" && j.day && j.day <= addDays(monday, 5));
  const doneCount = real.filter((j) => j.status === "done").length;

  return (
    <main className="mx-auto max-w-7xl space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setMonday(addDays(monday, -7))} className={BTN} aria-label="지난 주">◀</button>
          <h1 className="text-xl font-bold">
            약대장 · {monday.slice(5).replace("-", "/")} ~ {addDays(monday, 12).slice(5).replace("-", "/")}
          </h1>
          <button type="button" onClick={() => setMonday(addDays(monday, 7))} className={BTN} aria-label="다음 주">▶</button>
          {monday !== weekMonday(today) && (
            <button type="button" onClick={() => setMonday(weekMonday(today))} className="text-sm text-stone-500 underline">이번 주</button>
          )}
          <span className="text-xs text-stone-500">
            오늘 {today.slice(5).replace("-", "/")} · 이번 주 {real.length}건 중 {doneCount}건 끝남
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unscheduled.length > 0 && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">날짜 미정 {unscheduled.length}건</span>}
          <button type="button" className={BTN} onClick={() => setAdding(adding ? null : today)}>+ 칸 넣기</button>
          <button type="button" className={BTN} onClick={() => setEditingRules((v) => !v)}>요일별 기준 고치기</button>
          <div className="w-36">
            <StaffSelect value={staff} onChange={setStaff} />
          </div>
        </div>
      </div>

      {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {adding && <AddJob defaultDay={adding} staff={staff} onDone={() => { setAdding(null); changed(); }} onCancel={() => setAdding(null)} />}
      {editingRules && <RulesEditor rules={rules} onSaved={() => { setEditingRules(false); changed(); }} onClose={() => setEditingRules(false)} />}

      <p className="flex flex-wrap gap-3 text-[11px] text-stone-500">
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded border border-amber-600 bg-amber-50 align-middle" />보험·일반 탕약</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded border border-[#16863b] bg-[#f0f7f3] align-middle" />발효 (시작→끝 짝)</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded border border-[#06478f] bg-[#f5f8fc] align-middle" />지정처방</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded border border-yellow-600 bg-yellow-50 align-middle" />메모</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded border border-stone-400 bg-stone-200 align-middle" />끝남 o</span>
        <span>· 색 점 = 파우치 · &ldquo;3/12개&rdquo; = 잡힌 수(짜는 것 포함)/그 요일 한도 (넘으면 붉게, 막지는 않음)</span>
      </p>

      {loadedFor !== monday ? (
        <p className="text-sm text-stone-500">불러오는 중…</p>
      ) : (
        weeks.map((days, wi) => (
          <section key={wi} className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <div className="grid min-w-[900px] grid-cols-6 border-b border-stone-200 bg-stone-50">
              {days.map((iso) => {
                const dj = jobs.filter((j) => j.day === iso);
                const c = dayCounts(dj, ruleOf(iso));
                const over = c.brew + c.press > c.max; // 한도는 짜는 것까지 포함 (접수실 2026-10-02)
                const closed = isClinicClosed(iso);
                const hol = holidayLabel(iso);
                return (
                  <div key={iso} className={`px-2 py-1.5 ${iso === today ? "bg-[#f0f7f3]" : ""}`}>
                    <div className="flex flex-wrap items-baseline gap-1.5">
                      <b className={closed ? "text-red-600" : iso.endsWith(days[5].slice(-2)) && iso === days[5] ? "text-blue-700" : ""}>{dayHeader(iso)}</b>
                      <span className={`text-[11px] font-bold ${over ? "text-red-700" : "text-[#0f3d23]"}`}>
                        {c.brew + c.press}/{c.max}개{over ? " ↑" : ""}
                        {c.press > 0 && ` (짜기 ${c.press} 포함)`}
                        {c.batch > 0 && ` · 지정처방 ${c.batch}`}
                      </span>
                    </div>
                    <div className="h-4 truncate text-[10px] text-stone-500">{[hol ? `${hol}${closed ? " 휴진" : ""}` : "", ruleOf(iso)?.note ?? ""].filter(Boolean).join(" · ") || " "}</div>
                  </div>
                );
              })}
            </div>
            <div className="grid min-w-[900px] grid-cols-6" style={{ minHeight: wi === 0 ? 260 : 180 }}>
              {days.map((iso) => {
                const am = jobs.filter((j) => j.day === iso && j.slot === "am");
                const pm = jobs.filter((j) => j.day === iso && j.slot === "pm");
                return (
                  <div key={iso} className={`flex flex-col gap-1 border-r border-stone-100 p-1.5 last:border-r-0 ${isClinicClosed(iso) ? "bg-stone-50" : ""}`}>
                    {am.map((j) => (
                      <Card key={j.id} j={j} staff={staff} onChanged={changed} />
                    ))}
                    {mids
                      .filter((m) => m.day === iso)
                      .map((m) => (
                        <div key={`mid-${m.jobId}`} className="rounded border border-dashed border-[#16863b] bg-[#f0f7f3]/60 px-2 py-1 text-xs text-[#0f3d23]">
                          {m.label}-발효중
                        </div>
                      ))}
                    {pm.length > 0 && <div className="py-0.5 text-center text-[10px] text-stone-400">↓(오후)↓</div>}
                    {pm.map((j) => (
                      <Card key={j.id} j={j} staff={staff} onChanged={changed} />
                    ))}
                    <button type="button" onClick={() => setAdding(iso)} className="mt-auto rounded border border-dashed border-stone-300 py-1 text-[11px] text-stone-400 hover:bg-stone-50">
                      + 여기에
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      {unscheduled.length > 0 && (
        <section className="rounded-lg border border-amber-600 bg-amber-50/40 p-3 text-sm">
          <b className="text-amber-900">날짜 미정 {unscheduled.length}건</b>
          <span className="ml-2 text-xs text-stone-600">분할 수령 2회분이나 아직 날을 못 잡은 건. 환자와 상의한 뒤 칸을 눌러 날짜를 넣으면 약대장로 들어갑니다.</span>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {unscheduled.map((j) => (
              <Card key={j.id} j={j} staff={staff} onChanged={changed} />
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-stone-500">
        오늘 장부에서 탕약 줄을 저장하면 자동으로 들어오고, [+ 칸 넣기]로 탕약일반·탕약발효·지정처방·메모를 손으로 넣을 수도 있습니다. 칸을 누르면 날짜·오전/오후·받는 방법·지역·파우치·메모를 고치고, 날짜를 옮기면 받는 날과 해피콜이 따라가며 발효 짝은 같이 움직입니다.
      </p>
    </main>
  );
}

export default function BrewPage() {
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
