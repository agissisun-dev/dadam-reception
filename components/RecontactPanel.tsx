"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SmsAppLink from "./SmsAppLink";
import StaffSelect from "./StaffSelect";
import { todayISO } from "@/lib/dates";
import { maskPhone } from "@/lib/phone";
import {
  RECONTACT_NAME,
  SEGMENT_LABEL,
  SEGMENT_ORDER,
  blockReason,
  contactBlockReason,
  bodyKindFor,
  factLine,
  firstText,
  kstDay,
  missedText,
  needsCall,
  parseImportTable,
  quickRepliesFor,
  replyText,
  sendWindow,
  sentToday,
  shouldRest,
  todaysBatch,
  type ImportRow,
  type RecontactContext,
} from "@/lib/recontactRules";
import {
  NameMismatch,
  MissingPatient,
  assertRecontactContact,
  optOutRecontact,
  deleteRecontact,
  getRecontactSettings,
  importRecontacts,
  linkPhone,
  listRecontacts,
  markCalled,
  markReplied,
  markSent,
  readWorkbook,
  recontactContext,
  saveRecontactSettings,
  setRecontactStatus,
  updateRecontact,
} from "@/lib/recontacts";
import { STAFF_NAMES, loadLastStaff, saveLastStaff, type StaffName } from "@/lib/staff";
import type { RecontactRow, RecontactSegment, RecontactSettings } from "@/lib/types";

const BTN = "rounded border border-stone-300 bg-white px-3 py-1.5 text-sm";
const PRIMARY = "rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50";
const IN = "h-9 rounded border border-stone-300 px-2 text-sm";
const CARD = "rounded-lg border border-stone-200 bg-white p-3 text-sm";

type View = "today" | "waiting" | "doctor" | "prep" | "done";
const STATUS_KO: Record<string, string> = { booked: "예약됨", declined: "거절", rest: "쉼" };

function Badge({ children, tone = "stone" }: { children: React.ReactNode; tone?: "stone" | "green" | "red" | "amber" }) {
  const c = { stone: "bg-stone-100 text-stone-700", green: "bg-[#f0f7f3] text-[#0f3d23]", red: "bg-red-50 text-red-700", amber: "bg-amber-50 text-amber-800" }[tone];
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${c}`}>{children}</span>;
}

function CopyButton({ text, label = "문구 복사", disabled = false }: { text: string; label?: string; disabled?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={BTN}
      disabled={disabled}
      onClick={() => {
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 2000);
          })
          .catch(() => undefined);
      }}
    >
      {done ? "복사됨" : label}
    </button>
  );
}

function Head({ r, today, run }: { r: RecontactRow; today: string; run: (fn: () => Promise<unknown>) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <b className="text-base">{r.patient_name}</b>
      <Badge tone="green">{SEGMENT_LABEL[r.segment]}</Badge>
      {r.patient_id && <button type="button" className="text-xs text-red-700 underline" disabled={!!r.patient?.excluded_at} onClick={() => {
        if (window.confirm(`${r.patient_name}님이 모든 연락의 수신거부를 요청하셨나요? 확인하면 해피콜을 포함한 전체 연락에서 제외됩니다. 일반적인 이번 제안 거절은 [거절]을 사용하세요.`)) run(() => optOutRecontact(r.id, "환자 요청: 전체 연락 수신거부"));
      }}>{r.patient?.excluded_at ? "전체 연락 제외됨" : "수신거부(전체 연락 제외)"}</button>}
      {r.patient && <span className="text-xs text-stone-500">{maskPhone(r.patient.phone)}</span>}
      {r.patient_id && (
        <Link href={`/patients/${r.patient_id}`} className="text-xs text-stone-500 underline">
          환자 상세
        </Link>
      )}
      <span className="basis-full text-xs text-stone-500">{factLine(r, today)}</span>
    </div>
  );
}

/** 원장님 칸: 무엇을 물을지 한 줄 */
function DoctorNote({ r, run }: { r: RecontactRow; run: (fn: () => Promise<unknown>) => void }) {
  const [note, setNote] = useState(r.doctor_note ?? "");
  const dirty = note.trim() !== (r.doctor_note ?? "").trim();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-[11px] text-stone-500">원장님 칸</span>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="무엇을 물을지 한 줄. 예) 밤에 신물 올라오는 건 좀 줄었는지요?"
        className={`${IN} min-w-[260px] flex-1`}
      />
      <button type="button" className={BTN} disabled={!dirty} onClick={() => run(() => updateRecontact(r.id, { doctor_note: note.trim() || null, draft_text: null }))}>
        저장
      </button>
    </div>
  );
}

type ContactGuard = { disabled: boolean; reason: string | null; beforeOpen: () => Promise<void> };

function TodayRow({ r, settings, today, staff, run, contact }: { contact: ContactGuard; r: RecontactRow; settings: RecontactSettings; today: string; staff: StaffName; run: (fn: () => Promise<unknown>) => void }) {
  const [text, setText] = useState(() => firstText(r, settings, today));
  return (
    <li className={CARD}>
      <Head r={r} today={today} run={run} />
      {contact.reason && <p className="mt-1 text-xs text-red-700">{contact.reason}</p>}
      <DoctorNote r={r} run={run} />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="mt-2 w-full rounded border border-stone-300 px-2 py-1 text-sm" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <SmsAppLink phone={r.patient?.phone} text={text} disabled={contact.disabled} beforeOpen={contact.beforeOpen} />
        <CopyButton text={text} disabled={contact.disabled} />
        <button type="button" className={PRIMARY} disabled={!text.trim()} onClick={() => run(() => markSent(r, staff, text))}>
          보냈음
        </button>
        {bodyKindFor(r.segment) === "ab" && <span className="text-[11px] text-stone-500">문구 {r.variant}</span>}
        <button type="button" className="ml-auto text-xs text-stone-500 underline" onClick={() => run(() => setRecontactStatus(r.id, "rest"))}>
          이번엔 쉬게 하기
        </button>
      </div>
    </li>
  );
}

function WaitingRow({ r, settings, today, run, contact }: { contact: ContactGuard; r: RecontactRow; settings: RecontactSettings; today: string; run: (fn: () => Promise<unknown>) => void }) {
  const [mode, setMode] = useState<"reply" | "call" | null>(null);
  const [reply, setReply] = useState("");
  const [callResult, setCallResult] = useState("");
  const [docReply, setDocReply] = useState(r.doctor_reply ?? "");
  const second = replyText({ ...r, doctor_reply: docReply }, settings, today);
  const missed = missedText(r, settings, today);
  const sentDay = r.sent_at ? kstDay(r.sent_at) : "";

  return (
    <li className={CARD}>
      <Head r={r} today={today} run={run} />
      {contact.reason && <p className="mt-1 text-xs text-red-700">{contact.reason}</p>}
      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-stone-600">
        <span>
          보냄 {sentDay.slice(5).replace("-", "/")} · {r.sent_by}
        </span>
        {r.status === "replied" && <Badge tone="green">답 옴</Badge>}
        {needsCall(r, today) && <Badge tone="red">사흘 지남 → 전화</Badge>}
        {r.called_at && <Badge tone="amber">전화함: {r.call_result}</Badge>}
        {shouldRest(r, today) && <Badge>답이 없어 쉬게 할 때</Badge>}
      </p>
      {r.sent_text && (
        <details className="mt-1 text-xs text-stone-500">
          <summary className="cursor-pointer">보낸 글 보기</summary>
          <p className="mt-1 whitespace-pre-wrap rounded bg-stone-50 p-2">{r.sent_text}</p>
        </details>
      )}

      {r.status === "replied" ? (
        <div className="mt-2 space-y-2">
          <p className="whitespace-pre-wrap rounded bg-[#f0f7f3] p-2 text-sm">
            <span className="text-[11px] text-stone-500">환자 답 </span>
            {r.reply_text}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-stone-500">원장님 말씀</span>
            <input value={docReply} onChange={(e) => setDocReply(e.target.value)} placeholder="예) 한 달 더 드시면 좋겠다고 하세요." className={`${IN} min-w-[240px] flex-1`} />
            <button type="button" className={BTN} disabled={docReply.trim() === (r.doctor_reply ?? "").trim()} onClick={() => run(() => updateRecontact(r.id, { doctor_reply: docReply.trim() || null }))}>
              저장
            </button>
          </div>
          <p className="whitespace-pre-wrap rounded bg-stone-50 p-2 text-sm">{second}</p>
          <div className="flex flex-wrap items-center gap-2">
            <SmsAppLink phone={r.patient?.phone} text={second} disabled={contact.disabled} beforeOpen={contact.beforeOpen} />
            <CopyButton text={second} disabled={contact.disabled} />
            {r.patient_id && (
              <Link href={`/appointments?for=${r.patient_id}&name=${encodeURIComponent(r.patient_name)}`} className={BTN}>
                예약 잡기
              </Link>
            )}
            <button type="button" className={PRIMARY} onClick={() => run(() => setRecontactStatus(r.id, "booked"))}>
              예약됨
            </button>
            <button type="button" className={BTN} onClick={() => run(() => setRecontactStatus(r.id, "declined"))}>
              거절
            </button>
            <button type="button" className="text-xs text-stone-500 underline" onClick={() => run(() => setRecontactStatus(r.id, "rest"))}>
              쉬게 하기
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={PRIMARY} onClick={() => setMode(mode === "reply" ? null : "reply")}>
              답 옴
            </button>
            <button type="button" className={BTN} onClick={() => setMode(mode === "call" ? null : "call")}>
              전화함
            </button>
            <button type="button" className={BTN} onClick={() => run(() => setRecontactStatus(r.id, "booked"))}>
              예약됨
            </button>
            <button type="button" className={BTN} onClick={() => run(() => setRecontactStatus(r.id, "declined"))}>
              거절
            </button>
            <button type="button" className="text-xs text-stone-500 underline" onClick={() => run(() => setRecontactStatus(r.id, "rest"))}>
              답 없음 → 쉬게 하기
            </button>
          </div>
          {mode === "reply" && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-stone-500">번호로 답하셨으면</span>
                {quickRepliesFor(r.segment).map((q) => (
                  <button key={q} type="button" className={BTN} onClick={() => setReply(q)}>
                    {q}
                  </button>
                ))}
              </div>
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="환자가 보낸 답을 그대로 붙여 넣으세요" className="w-full rounded border border-stone-300 px-2 py-1 text-sm" />
              <button type="button" className={PRIMARY} disabled={!reply.trim()} onClick={() => run(() => markReplied(r.id, reply))}>
                답 저장
              </button>
            </div>
          )}
          {mode === "call" && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input value={callResult} onChange={(e) => setCallResult(e.target.value)} placeholder="통화 결과 한 줄. 안 받으셨으면 '안 받음'" className={`${IN} min-w-[240px] flex-1`} />
                <button type="button" className={PRIMARY} onClick={() => run(() => markCalled(r, callResult))}>
                  전화 기록
                </button>
              </div>
              <p className="text-[11px] text-stone-500">안 받으셨을 때 남기는 문자</p>
              <p className="whitespace-pre-wrap rounded bg-stone-50 p-2 text-sm">{missed}</p>
              <div className="flex flex-wrap items-center gap-2">
                <SmsAppLink phone={r.patient?.phone} text={missed} disabled={contact.disabled} beforeOpen={contact.beforeOpen} />
                <CopyButton text={missed} disabled={contact.disabled} />
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function PrepRow({ r, today, run }: { r: RecontactRow; today: string; run: (fn: () => Promise<unknown>) => void }) {
  const [phone, setPhone] = useState("");
  const link = () =>
    run(async () => {
      let acceptDifferentName = false;
      let allowCreate = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await linkPhone(r, phone, acceptDifferentName, allowCreate);
          return;
        } catch (e) {
          if (e instanceof NameMismatch && !acceptDifferentName) {
            if (!window.confirm(`${e.message}\n\n같은 분이 맞으면 [확인]을 누르세요. 그 환자와 이어집니다.`)) return;
            acceptDifferentName = true;
            continue;
          }
          if (e instanceof MissingPatient && !allowCreate) {
            if (!window.confirm(`등록된 환자를 찾지 못했습니다. ${r.patient_name}님을 이 번호로 새 환자 등록하고 연결할까요? 동명이인과 번호를 먼저 확인해 주세요.`)) return;
            allowCreate = true;
            continue;
          }
          throw e;
        }
      }
      throw new Error("환자 연결을 다시 확인해 주세요.");
    });
  return (
    <li className={CARD}>
      <Head r={r} today={today} run={run} />
      {r.birth_hint && <p className="mt-1 text-xs text-stone-500">확인 메모: {r.birth_hint}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" placeholder="연락처 01012345678" aria-label={`${r.patient_name} 연락처`} className={`${IN} w-44`} />
        <button type="button" className={PRIMARY} disabled={phone.replace(/\D/g, "").length < 10} onClick={link}>
          연결
        </button>
        <span className="text-[11px] text-stone-500">이미 등록된 번호를 먼저 찾습니다. 새 환자 등록은 별도 확인 후 진행합니다.</span>
        <button
          type="button"
          className="ml-auto text-xs text-red-700 underline"
          onClick={() => {
            if (window.confirm(`${r.patient_name}님을 명단에서 보관할까요? 연락 이력과 오늘 연락한 횟수는 삭제하지 않고 유지합니다.`)) run(() => deleteRecontact(r.id));
          }}
        >
          명단에서 보관
        </button>
      </div>
    </li>
  );
}

function UploadBox({ staff, onDone, onClose }: { staff: StaffName; onDone: (msg: string) => void; onClose: () => void }) {
  const [sheets, setSheets] = useState<{ name: string; table: string[][] }[]>([]);
  const [sheet, setSheet] = useState(0);
  const [sourceIdentity, setSourceIdentity] = useState("");
  const [fallback, setFallback] = useState<RecontactSegment>("vip");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = useMemo(() => (sheets[sheet] ? parseImportTable(sheets[sheet].table, fallback) : null), [sheets, sheet, fallback]);
  const bySeg = (rows: ImportRow[]) =>
    SEGMENT_ORDER.map((s) => ({ s, n: rows.filter((r) => r.segment === s).length }))
      .filter((x) => x.n > 0)
      .map((x) => `${SEGMENT_LABEL[x.s]} ${x.n}`)
      .join(" · ");

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const all = (await readWorkbook(file)).filter((s) => !/작성\s*안내/.test(s.name));
      setSheets(all);
      setSourceIdentity(file.name);
      const first = all.findIndex((s) => parseImportTable(s.table, fallback).problem === null);
      setSheet(first >= 0 ? first : 0);
    } catch {
      setError("파일을 읽지 못했습니다. 엑셀(.xlsx) 파일인지 확인해 주세요.");
    }
  }
  async function save() {
    if (!parsed || parsed.rows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const r = await importRecontacts(parsed.rows, staff, JSON.stringify([sourceIdentity, sheets[sheet]?.name ?? ""]));
      onDone(`${r.added}명 넣음${r.duplicated ? ` · 이미 있던 ${r.duplicated}명 건너뜀` : ""} · 연락처 연결 ${r.linked}명${r.problems.length ? ` · 확인할 것: ${r.problems.join(" / ")}` : ""}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-[#16863b] bg-white p-3 text-sm">
      <p className="text-xs text-stone-600">
        엑셀 파일(.xlsx)을 고르면 이 PC에서 바로 읽습니다. 첫 줄이 머리글(이름 · 연락처 · 한약 횟수 · 마지막 한약 · 원장님 칸 …)인 시트를 읽고, 최근 내원 메모가 있어도 명단은 보존하고 연락 대기 이유를 따로 표시합니다. 작성안내 시트는 읽지 않습니다.
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <input type="file" accept=".xlsx" onChange={(e) => pick(e.target.files?.[0])} className="text-sm" />
        {sheets.length > 1 && (
          <label className="block">
            <span className="text-[11px] text-stone-500">시트</span>
            <select value={sheet} onChange={(e) => setSheet(Number(e.target.value))} className={`${IN} block`}>
              {sheets.map((s, i) => (
                <option key={s.name} value={i}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="text-[11px] text-stone-500">묶음 칸이 없는 줄은</span>
          <select value={fallback} onChange={(e) => setFallback(e.target.value as RecontactSegment)} className={`${IN} block`}>
            {SEGMENT_ORDER.map((s) => (
              <option key={s} value={s}>
                {SEGMENT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {parsed && (
        <p className={`mt-2 text-xs ${parsed.problem ? "text-red-700" : "text-[#0f3d23]"}`}>
          {parsed.problem ?? `${parsed.rows.length}명 읽음 (${bySeg(parsed.rows)}) · 연락처 있는 줄 ${parsed.rows.filter((r) => r.phone).length} · 원장님 칸 채워진 줄 ${parsed.rows.filter((r) => r.doctor_note).length}${parsed.skipped ? ` · 빼기 ${parsed.skipped}명` : ""}`}
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <button type="button" className={PRIMARY} disabled={busy || !parsed || parsed.rows.length === 0} onClick={save}>
          {busy ? "넣는 중…" : `명단에 넣기${parsed && parsed.rows.length ? ` (${parsed.rows.length}명)` : ""}`}
        </button>
        <button type="button" className={BTN} onClick={onClose}>
          닫기
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </section>
  );
}

function SettingsBox({ settings, onSaved, onClose }: { settings: RecontactSettings; onSaved: (s: RecontactSettings) => void; onClose: () => void }) {
  const [cap, setCap] = useState(settings.daily_cap);
  const [a, setA] = useState(settings.body_a);
  const [b, setB] = useState(settings.body_b);
  const [vip, setVip] = useState(settings.body_vip);
  const [once, setOnce] = useState(settings.body_once);
  const [reply, setReply] = useState(settings.body_reply);
  const [missed, setMissed] = useState(settings.body_missed);
  const [error, setError] = useState<string | null>(null);
  const area = (label: string, value: string, set: (v: string) => void) => (
    <label className="mt-2 block">
      <span className="text-[11px] text-stone-500">{label}</span>
      <textarea value={value} onChange={(e) => set(e.target.value)} rows={3} className="mt-0.5 w-full rounded border border-stone-300 px-2 py-1 text-sm" />
    </label>
  );
  return (
    <section className="rounded-lg border border-stone-300 bg-white p-3 text-sm">
      <label className="flex items-center gap-2">
        <span>하루에 보내는 수</span>
        <input type="number" min={1} max={100} value={cap} onChange={(e) => setCap(Number(e.target.value))} className={`${IN} w-20`} />
        <span className="text-[11px] text-stone-500">한꺼번에 보내면 답을 못 받아 줍니다. 15~20통을 권합니다.</span>
      </label>
      <p className="mt-2 text-[11px] text-stone-500">
        자리표 {"{이름} {월} {약} {원장한줄} {원장답}"} 은 그 사람 것으로 채워집니다. 첫 문자에는 재주문·택배·할인 이야기를 넣지 않습니다(답 온 분께 드리는 글에서만).
      </p>
      {area("첫 문자 A — 지금·곧 (열린 질문)", a, setA)}
      {area("첫 문자 B — 지금·곧 (번호로 답, A와 반씩 보내 비교)", b, setB)}
      {area("첫 문자 — 오래 못 뵌 단골 (VIP·오래됨·공진단)", vip, setVip)}
      {area("첫 문자 — 한 번 드신 분", once, setOnce)}
      {area("답 온 분께 (두 번째 문자)", reply, setReply)}
      {area("전화 안 받으셨을 때", missed, setMissed)}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className={PRIMARY}
          onClick={async () => {
            try {
              onSaved(await saveRecontactSettings({ daily_cap: Math.min(100, Math.max(1, cap || 20)), body_a: a, body_b: b, body_vip: vip, body_once: once, body_reply: reply, body_missed: missed }));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          저장
        </button>
        <button type="button" className={BTN} onClick={onClose}>
          닫기
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </section>
  );
}

/**
 * 재진콜 (V12) — 해피콜 화면 안의 탭. 한약 드신 분께 경과를 묻고 답 온 분부터 예약으로 잇는다.
 * 보기 다섯 가지: 오늘 보낼 사람 · 답 기다리는 분 · 원장님 칸 · 연락처 넣기 · 끝난 분.
 */
export default function RecontactPanel() {
  const [rows, setRows] = useState<RecontactRow[] | null>(null);
  const [settings, setSettings] = useState<RecontactSettings | null>(null);
  const [ctx, setCtx] = useState<RecontactContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<View>("today");
  const [showUpload, setShowUpload] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [staff, setStaff] = useState<StaffName>(() => (typeof window === "undefined" ? STAFF_NAMES[0] : loadLastStaff()));
  const [now, setNow] = useState(() => new Date());
  const win = sendWindow(now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const today = todayISO();

  const load = useCallback(() => {
    const day = todayISO();
    setCtx(null);
    Promise.all([listRecontacts(), getRecontactSettings()])
      .then(async ([list, s]) => {
        setRows(list);
        setSettings(s);
        const c = await recontactContext(list, day);
        setCtx(c);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) load();
    });
    return () => { cancelled = true; };
  }, [load]);

  const run = (fn: () => Promise<unknown>) => {
    setError(null);
    setNotice(null);
    saveLastStaff(staff);
    fn()
      .then(load)
      .catch((e: Error) => setError(e.message));
  };

  if (error && !rows) return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  if (!rows || !settings) return <p className="p-6 text-stone-500">불러오는 중…</p>;

  const todo = rows.filter((r) => r.status === "todo");
  const prep = todo.filter((r) => !r.patient_id || !r.patient);
  const doctor = todo.filter((r) => !(r.doctor_note ?? "").trim());
  const { batch, waiting: tomorrow, left } = todaysBatch(rows, ctx, settings.daily_cap, today);
  const sentN = sentToday(rows, today);
  const held = todo.filter((r) => r.patient_id && blockReason(r, ctx));
  const waiting = rows.filter((r) => r.status === "sent" || r.status === "replied").sort((a, b) => Number(b.status === "replied") - Number(a.status === "replied") || Number(needsCall(b, today)) - Number(needsCall(a, today)) || (a.sent_at ?? "").localeCompare(b.sent_at ?? ""));
  const done = rows.filter((r) => r.status === "booked" || r.status === "declined" || r.status === "rest");

  const contactFor = (r: RecontactRow, purpose: "initial" | "followup" = "initial"): ContactGuard => {
    const reason = purpose === "initial" ? blockReason(r, ctx) : contactBlockReason(r, ctx);
    return {
      disabled: !!reason || !win.ok,
      reason: reason || (!win.ok ? win.reason : null),
      beforeOpen: async () => {
        const currentReason = purpose === "initial" ? blockReason(r, ctx) : contactBlockReason(r, ctx);
        if (currentReason) throw new Error(currentReason);
        const currentWindow = sendWindow(new Date());
        if (!currentWindow.ok) throw new Error(currentWindow.reason);
        await assertRecontactContact(r.id, purpose);
        const finalWindow = sendWindow(new Date());
        if (!finalWindow.ok) throw new Error(finalWindow.reason);
      },
    };
  };

  const tab = (v: View, label: string, n: number) => (
    <button type="button" onClick={() => setView(v)} className={`rounded-full border px-3 py-1 text-sm ${view === v ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white"}`}>
      {label} {n}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone-600">
          한약 드신 분께 경과를 여쭙고, 답 주신 분부터 재진으로 모십니다. 오늘 {sentN}통 보냄 · 하루 {settings.daily_cap}통까지.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={BTN} onClick={() => setShowUpload((v) => !v)}>
            명단 올리기
          </button>
          <button type="button" className={BTN} onClick={() => setShowSettings((v) => !v)}>
            설정 (하루 수 · 문구)
          </button>
          <div className="w-36">
            <StaffSelect value={staff} onChange={setStaff} />
          </div>
        </div>
      </div>

      {showUpload && (
        <UploadBox
          staff={staff}
          onDone={(msg) => {
            setShowUpload(false);
            setNotice(msg);
            load();
          }}
          onClose={() => setShowUpload(false)}
        />
      )}
      {showSettings && (
        <SettingsBox
          settings={settings}
          onSaved={(s) => {
            setSettings(s);
            setShowSettings(false);
            load();
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
      {notice && <p className="rounded bg-[#f0f7f3] p-2 text-sm text-[#0f3d23]">{notice}</p>}
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {!ctx && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">연락 가능 여부를 확인할 때까지 문자창과 연락처 복사를 사용할 수 없습니다. <button type="button" className="underline" onClick={load}>다시 불러오기</button></p>}

      <div className="flex flex-wrap gap-2">
        {tab("today", "오늘 보낼 사람", batch.length)}
        {tab("waiting", "답 기다리는 분", waiting.length)}
        {tab("doctor", "원장님 칸", doctor.length)}
        {tab("prep", "연락처 넣기", prep.length)}
        {tab("done", "끝난 분", done.length)}
      </div>

      {rows.length === 0 && (
        <p className="rounded-lg border border-stone-200 bg-white p-6 text-center text-stone-600">
          아직 명단이 없습니다. 위의 [명단 올리기]로 엑셀 파일을 올려 주세요.
        </p>
      )}

      {view === "today" && rows.length > 0 && (
        <section className="space-y-2">
          {!win.ok && <p className="rounded bg-red-50 p-2 text-sm font-bold text-red-700">지금은 보내는 시간이 아닙니다. {win.reason}</p>}
          <p className="text-xs text-stone-500">
            문구를 읽고 고친 뒤 병원 휴대폰으로 보내고 [보냈음]을 누르세요. 답은 병원 휴대폰으로 옵니다.
            {left === 0 ? " 오늘 보낼 수를 다 채웠습니다." : ""}
            {tomorrow > 0 ? ` 하루 수 때문에 ${tomorrow}명은 다음 날로 넘어갑니다.` : ""}
          </p>
          {batch.length === 0 && <p className="rounded-lg border border-stone-200 bg-white p-6 text-center text-stone-600">오늘 보낼 사람이 없습니다</p>}
          <ul className="space-y-2">
            {batch.map((r) => (
              <TodayRow key={`${r.id}-${r.updated_at}`} r={r} settings={settings} today={today} staff={staff} run={run} contact={contactFor(r)} />
            ))}
          </ul>
          {held.length > 0 && (
            <details className="text-sm text-stone-600">
              <summary className="cursor-pointer">지금은 빠진 분 ({held.length})</summary>
              <ul className="mt-1 space-y-1 text-xs">
                {held.map((r) => (
                  <li key={r.id}>
                    {r.patient_name} — {blockReason(r, ctx)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {view === "waiting" && (
        <section className="space-y-2">
          <p className="text-xs text-stone-500">답이 오면 [답 옴]에 내용을 붙여 넣으세요. 재진·택배 안내는 답 주신 분께만 합니다. 사흘 지나도 답이 없는 분은 전화합니다.</p>
          {waiting.length === 0 && <p className="rounded-lg border border-stone-200 bg-white p-6 text-center text-stone-600">답을 기다리는 분이 없습니다</p>}
          <ul className="space-y-2">
            {waiting.map((r) => (
              <WaitingRow key={`${r.id}-${r.updated_at}`} r={r} settings={settings} today={today} run={run} contact={contactFor(r, "followup")} />
            ))}
          </ul>
        </section>
      )}

      {view === "doctor" && (
        <section className="space-y-2">
          <p className="text-xs text-stone-500">원장님이 그분께 무엇을 물을지 한 줄 적어 주세요. 문자와 전화에 그대로 들어갑니다. 비워 두면 &ldquo;요즘 몸은 좀 어떠세요?&rdquo;가 들어갑니다.</p>
          {doctor.length === 0 && <p className="rounded-lg border border-stone-200 bg-white p-6 text-center text-stone-600">채울 칸이 없습니다</p>}
          <ul className="space-y-2">
            {doctor.map((r) => (
              <li key={`${r.id}-${r.updated_at}`} className={CARD}>
                <Head r={r} today={today} run={run} />
                <DoctorNote r={r} run={run} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {view === "prep" && (
        <section className="space-y-2">
          <p className="text-xs text-stone-500">연락처가 없는 분입니다. 전자차트에서 찾아 넣어 주세요. 이름이 같은 분이 여럿이면 확인 메모(생년)를 보고 고르세요.</p>
          {prep.length === 0 && <p className="rounded-lg border border-stone-200 bg-white p-6 text-center text-stone-600">연락처를 넣을 분이 없습니다</p>}
          <ul className="space-y-2">
            {prep.map((r) => (
              <PrepRow key={r.id} r={r} today={today} run={run} />
            ))}
          </ul>
        </section>
      )}

      {view === "done" && (
        <section className="space-y-2">
          {done.length === 0 && <p className="rounded-lg border border-stone-200 bg-white p-6 text-center text-stone-600">끝난 분이 없습니다</p>}
          <ul className="space-y-1">
            {done.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded border border-stone-200 bg-white px-3 py-2 text-sm">
                <b>{r.patient_name}</b>
                <Badge tone={r.status === "booked" ? "green" : "stone"}>{STATUS_KO[r.status]}</Badge>
                <span className="text-xs text-stone-500">{SEGMENT_LABEL[r.segment]}{r.sent_at ? ` · 보냄 ${kstDay(r.sent_at).slice(5).replace("-", "/")}` : ""}{r.reply_text ? " · 답 있음" : ""}</span>
                <button type="button" className="ml-auto text-xs underline" onClick={() => run(() => setRecontactStatus(r.id, "todo"))}>
                  다시 올리기
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[11px] text-stone-400">{RECONTACT_NAME} · 명단 {rows.length}명</p>
    </div>
  );
}
