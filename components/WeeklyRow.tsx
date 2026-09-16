"use client";

import { useState } from "react";
import Link from "next/link";
import type { Template, WeeklyRow as Row } from "@/lib/types";
import { conditionLabel } from "@/lib/conditions";
import { daysBetween } from "@/lib/dates";
import { STAFF_NAMES, loadLastStaff, saveLastStaff, type StaffName } from "@/lib/staff";
import { pickWeeklyTemplate } from "@/lib/weeklyRules";
import { recordReply, recordWeekly } from "@/lib/weekly";
import { excludePatient } from "@/lib/patients";
import PhoneText from "./PhoneText";
import StaffSelect from "./StaffSelect";

const BTN = "rounded border border-stone-300 px-3 py-1.5 text-sm";
const PRIMARY = "rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50";

type Mode = null | "reply" | "exclude";

export default function WeeklyRow({
  row,
  today,
  templates,
  onDone,
}: {
  row: Row;
  today: string;
  templates: Template[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [staff, setStaff] = useState<StaffName>(() =>
    typeof window === "undefined" ? STAFF_NAMES[0] : loadLastStaff(),
  );
  const tpl = pickWeeklyTemplate(templates, row.condition, row.weekly_round);
  const [message, setMessage] = useState(tpl?.body ?? "");
  const [reply, setReply] = useState("");
  const [askDoctor, setAskDoctor] = useState(true);
  const [reason, setReason] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const planned = row.weekly_next_date ?? today;
  const late = daysBetween(planned, today);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      saveLastStaff(staff);
      await fn();
      onDone();
    } catch (e) {
      setError(`저장되지 않았습니다. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("자동 복사가 막혀 있습니다. 문구를 드래그해 Ctrl+C로 복사하세요.");
    }
  }

  return (
    <div className={`rounded-lg border bg-white p-4 ${late > 0 ? "border-red-300" : "border-stone-200"}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{row.name}</span>
          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{conditionLabel(row.condition)}</span>
          <span className="rounded bg-stone-200 px-1.5 py-0.5 text-xs">{row.weekly_round}회차</span>
          {row.noReplyStreak >= 4 && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">무응답 {row.noReplyStreak}주</span>
          )}
          {row.noReplyStreak > 0 && row.noReplyStreak < 4 && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">답 없음 {row.noReplyStreak}주</span>
          )}
          {row.lastReviewed?.doctor_note && (
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800">원장 지시 있음</span>
          )}
          {late > 0 && (
            <span className="ml-auto rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">{late}일 지남</span>
          )}
        </div>
        <p className="mt-1 text-xs text-stone-500">
          예정 {planned} · 매{row.weekly_interval > 1 ? `${row.weekly_interval}주` : "주"}
          {row.memo ? ` · ${row.memo}` : ""}
        </p>
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-stone-200 pt-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              연락처 <PhoneText phone={row.phone} revealed />
            </span>
            <Link href={`/patients/${row.id}`} className="ml-auto underline">
              환자 상세
            </Link>
          </div>

          {row.last && (
            <div className="rounded bg-stone-50 p-3 text-sm">
              <p className="text-xs text-stone-500">
                지난 기록 · {row.last.round}회차 · {row.last.planned_date} ·{" "}
                {{ sent: "발송함", skipped_visited: "내원해 건너뜀", no_reply: "답 없음", dormant: "휴면", excluded: "연락 제외" }[row.last.action]}
              </p>
              {row.last.message && <p className="mt-1 whitespace-pre-wrap text-stone-600">{row.last.message}</p>}
              {row.last.patient_reply && (
                <p className="mt-1">
                  <span className="text-stone-500">환자 답변:</span> {row.last.patient_reply}
                  {row.last.reply_status === "waiting_doctor" && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">원장 확인 대기</span>
                  )}
                </p>
              )}
            </div>
          )}
          {row.lastReviewed?.doctor_note && (
            <p className="rounded border border-green-200 bg-green-50 p-3 text-sm">
              <span className="font-medium text-green-800">원장님 지시:</span> {row.lastReviewed.doctor_note}
              <span className="ml-2 text-xs text-stone-500">({row.lastReviewed.round}회차 답변에 대해)</span>
            </p>
          )}

          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-600">
                이번 주 문구 {tpl ? `(${tpl.name})` : "(틀 없음)"}
              </span>
              <button className={BTN} onClick={copy}>
                문구 복사
              </button>
              {copied && <span className="text-sm text-green-700">복사됨</span>}
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm"
            />
          </div>

          <StaffSelect value={staff} onChange={setStaff} />

          {mode === null && (
            <div className="flex flex-wrap gap-2">
              <button className={PRIMARY} disabled={busy || !message.trim()} onClick={() => run(() => recordWeekly(row, "sent", staff, { message }))}>
                발송함
              </button>
              <button className={BTN} disabled={busy} onClick={() => run(() => recordWeekly(row, "skipped_visited", staff))}>
                내원해 건너뜀
              </button>
              <button className={BTN} disabled={busy} onClick={() => run(() => recordWeekly(row, "no_reply", staff))}>
                답 없음 → 다음 주
              </button>
              {row.last && row.last.action === "sent" && (
                <button className={BTN} onClick={() => setMode("reply")}>
                  답변 기록
                </button>
              )}
              <button className={`${BTN} ml-auto`} disabled={busy} onClick={() => run(() => recordWeekly(row, "dormant", staff))}>
                휴면
              </button>
              <button className={`${BTN} text-red-700`} onClick={() => setMode("exclude")}>
                연락 제외
              </button>
            </div>
          )}

          {mode === "reply" && row.last && (
            <div className="space-y-2 rounded border border-stone-200 p-3">
              <p className="text-sm text-stone-600">지난주({row.last.round}회차) 문자에 대한 환자 답변</p>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={3}
                placeholder="예: 식단 사진 3장 보냄. 저녁에 속쓰림 남아 있다고 함"
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={askDoctor} onChange={(e) => setAskDoctor(e.target.checked)} /> 원장님 확인 요청
              </label>
              <div className="flex gap-2">
                <button
                  className={PRIMARY}
                  disabled={busy || !reply.trim()}
                  onClick={() => run(async () => { await recordReply(row.last!.id, reply.trim(), askDoctor); setMode(null); })}
                >
                  저장
                </button>
                <button className={BTN} onClick={() => setMode(null)}>
                  취소
                </button>
              </div>
            </div>
          )}

          {mode === "exclude" && (
            <div className="space-y-2 rounded border border-red-200 p-3">
              <p className="text-sm text-red-700">이 환자는 주간 관리와 해피콜 모두에서 빠집니다. 해제는 환자 상세에서.</p>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="사유 (필수)"
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  className={PRIMARY}
                  disabled={busy || !reason.trim()}
                  onClick={() => run(async () => { await excludePatient(row.id, reason.trim(), staff); })}
                >
                  연락 제외
                </button>
                <button className={BTN} onClick={() => setMode(null)}>
                  취소
                </button>
              </div>
            </div>
          )}

          {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}
