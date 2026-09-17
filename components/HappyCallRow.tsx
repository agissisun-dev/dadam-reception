"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { describePrescription } from "@/lib/packs";
import type { ContactChannel, HappyCallRow as Row, Template } from "@/lib/types";
import { conditionLabel } from "@/lib/conditions";
import { daysBetween } from "@/lib/dates";
import { NOTE_SINGLE } from "@/lib/happyCallRules";
import { pickHappyCallTemplate } from "@/lib/weeklyRules";
import { STAFF_NAMES, loadLastStaff, saveLastStaff, type StaffName } from "@/lib/staff";
import {
  markContacted,
  markMissed,
  markRepresc,
  rescheduleHappyCall,
  resetHappyCallDate,
} from "@/lib/happyCalls";
import { excludePatient } from "@/lib/patients";
import PhoneText from "./PhoneText";
import StaffSelect from "./StaffSelect";
import SmsSendBox, { type SmsRecipient } from "./SmsSendBox";
import { sendSms } from "@/lib/sms";

type Mode = null | "contacted" | "represc" | "exclude" | "reschedule" | "sms";

const CHANNELS: { value: ContactChannel; label: string }[] = [
  { value: "phone", label: "전화" },
  { value: "kakao", label: "카톡" },
  { value: "sms", label: "문자" },
];

const BTN = "rounded border border-stone-300 px-3 py-1.5 text-sm";
const PRIMARY = "rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50";

export default function HappyCallRow({
  row,
  today,
  templates = [],
  onDone,
}: {
  row: Row;
  today: string;
  templates?: Template[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [staff, setStaff] = useState<StaffName>(() =>
    typeof window === "undefined" ? STAFF_NAMES[0] : loadLastStaff(),
  );
  const [channel, setChannel] = useState<ContactChannel>("phone");
  const [memo, setMemo] = useState("");
  const [date, setDate] = useState(row.due_date);
  const tpl = pickHappyCallTemplate(templates, row.round, row.note === NOTE_SINGLE);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const late = daysBetween(row.due_date, today);
  const p = row.prescription;
  const pt = p.patient;
  // 문구 틀은 화면이 뜬 뒤에 도착하므로, 사용자가 고치기 전까지는 틀 본문을 그대로 보여 준다.
  const messageText = message ?? tpl?.body ?? "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("자동 복사가 막혀 있습니다. 문구를 드래그해 Ctrl+C로 복사하세요.");
    }
  }

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

  const recipients: SmsRecipient[] = [
    { label: "환자", phone: pt.phone },
    ...(pt.family_phone ? [{ label: `가족(${pt.family_note ?? ""})`, phone: pt.family_phone }] : []),
  ];

  /** 문자를 보내고, 성공하면 "연락함(문자)"으로 기록한다. 실패하면 기록하지 않는다. */
  async function sendText(to: string, label: string) {
    setBusy(true);
    setError(null);
    try {
      await sendSms(to, messageText, { patientId: pt.id, staff });
    } catch (e) {
      setError(`문자를 보내지 못했습니다. ${(e as Error).message}`);
      setBusy(false);
      return;
    }
    setBusy(false);
    await run(() => markContacted(row.id, "sms", `문자 발송 → ${label}\n${messageText}`, staff));
  }

  return (
    <div className={`rounded-lg border bg-white p-4 ${late > 0 ? "border-red-300" : "border-stone-200"}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{pt.name}</span>
          <span className="rounded bg-stone-200 px-1.5 py-0.5 text-xs">{row.round}차</span>
          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{conditionLabel(pt.condition)}</span>
          <span className="text-xs text-stone-500">{row.prescription_seq}번째 처방</span>
          {row.missed_count > 0 && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
              안 받음 {row.missed_count}회
            </span>
          )}
          {late > 0 && (
            <span className="ml-auto rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">{late}일 지남</span>
          )}
        </div>
        <p className="mt-1 text-sm text-stone-600">{row.note}</p>
        <p className="mt-1 text-xs text-stone-500">
          수령 {p.receive_date} · {describePrescription(p)}
          {p.memo ? ` · ${p.memo}` : ""}
          {pt.memo ? ` · ${pt.memo}` : ""}
        </p>
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-stone-200 pt-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              연락처 <PhoneText phone={pt.phone} revealed />
            </span>
            {pt.family_phone && (
              <span className="text-stone-600">
                가족({pt.family_note ?? ""}) <PhoneText phone={pt.family_phone} revealed />
              </span>
            )}
            <Link href={`/patients/${pt.id}`} className="ml-auto underline">
              환자 상세
            </Link>
          </div>

          {tpl && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600">보낼 문구 ({tpl.name})</span>
                <span className="flex items-center gap-2">
                  {copied && <span className="text-sm text-green-700">복사됨</span>}
                  <button className={BTN} onClick={copy}>
                    문구 복사
                  </button>
                  <button className={PRIMARY} disabled={busy} onClick={() => setMode("sms")}>
                    문자 보내기
                  </button>
                </span>
              </div>
              <textarea
                value={messageText}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
            </div>
          )}

          {mode === null && (
            <div className="flex flex-wrap gap-2">
              <button className={PRIMARY} onClick={() => setMode("contacted")}>
                연락함
              </button>
              <button className={BTN} disabled={busy} onClick={() => run(() => markMissed(row.id, staff))}>
                안 받음
              </button>
              <button className={BTN} onClick={() => setMode("represc")}>
                재처방·예약됨
              </button>
              <button className={`${BTN} text-red-700`} onClick={() => setMode("exclude")}>
                연락 제외
              </button>
              <button className={`${BTN} ml-auto`} onClick={() => setMode("reschedule")}>
                예정일 옮기기
              </button>
            </div>
          )}

          {mode === "sms" && (
            <div className="space-y-3">
              <StaffSelect value={staff} onChange={setStaff} />
              <SmsSendBox
                recipients={recipients}
                text={messageText}
                busy={busy}
                onSend={sendText}
                onCancel={() => setMode(null)}
              />
              <p className="text-xs text-stone-500">보내면 이 해피콜은 연락함(문자)으로 기록되고 명단에서 빠집니다.</p>
            </div>
          )}

          {mode === "contacted" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                {CHANNELS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setChannel(c.value)}
                    className={`rounded border px-3 py-1.5 text-sm ${
                      channel === c.value ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={3}
                placeholder="통화 내용, 환자 상태"
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
              <StaffSelect value={staff} onChange={setStaff} />
              <div className="flex gap-2">
                <button
                  className={PRIMARY}
                  disabled={busy}
                  onClick={() => run(() => markContacted(row.id, channel, memo, staff))}
                >
                  저장
                </button>
                <button className={BTN} onClick={() => setMode(null)}>
                  취소
                </button>
              </div>
            </div>
          )}

          {mode === "represc" && (
            <div className="space-y-3">
              <p className="text-sm text-stone-600">
                이 처방의 남은 해피콜을 모두 닫습니다. 새 약은 [환자 상세]에서 처방 추가.
              </p>
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="메모 (선택)"
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
              <StaffSelect value={staff} onChange={setStaff} />
              <div className="flex gap-2">
                <button className={PRIMARY} disabled={busy} onClick={() => run(() => markRepresc(row.id, memo, staff))}>
                  저장
                </button>
                <button
                  className={PRIMARY}
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await markRepresc(row.id, memo, staff);
                      router.push(`/patients/${pt.id}?add=1`);
                    })
                  }
                >
                  저장하고 새 처방 등록
                </button>
                <button className={BTN} onClick={() => setMode(null)}>
                  취소
                </button>
              </div>
            </div>
          )}

          {mode === "exclude" && (
            <div className="space-y-3">
              <p className="text-sm text-red-700">이 환자는 앞으로 명단에 뜨지 않습니다. 해제는 환자 상세에서.</p>
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="사유 (필수)"
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
              <StaffSelect value={staff} onChange={setStaff} />
              <div className="flex gap-2">
                <button
                  className={PRIMARY}
                  disabled={busy || !memo.trim()}
                  onClick={() => run(() => excludePatient(pt.id, memo.trim(), staff))}
                >
                  연락 제외
                </button>
                <button className={BTN} onClick={() => setMode(null)}>
                  취소
                </button>
              </div>
            </div>
          )}

          {mode === "reschedule" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded border border-stone-300 px-3 py-2 text-sm"
                />
                <span className="text-xs text-stone-500">자동값 {row.auto_due_date}</span>
              </div>
              <StaffSelect value={staff} onChange={setStaff} />
              <div className="flex gap-2">
                <button
                  className={PRIMARY}
                  disabled={busy}
                  onClick={() => run(() => rescheduleHappyCall(row.id, date, staff))}
                >
                  저장
                </button>
                <button className={BTN} disabled={busy} onClick={() => run(() => resetHappyCallDate(row.id, staff))}>
                  자동값으로
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
