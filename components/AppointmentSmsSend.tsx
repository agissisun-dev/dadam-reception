"use client";

import { useRef, useState } from "react";
import SmsSendBox from "./SmsSendBox";
import { markNotified } from "@/lib/appointments";
import { recordAcceptedSms, sendSms, SmsOutcomeUnknown } from "@/lib/sms";
import type { Appointment } from "@/lib/types";

export type AppointmentSmsSendProps = {
  appointment: Appointment;
  text: string;
  staff: string;
  onSent: () => void | Promise<void>;
};

/** Manual only. Never changes auto_notify/remind_enabled or opens an OS SMS handler. */
export default function AppointmentSmsSend({ appointment, text, staff, onSent }: AppointmentSmsSendProps) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sending = useRef(false);
  async function send(to: string) {
    if (sending.current || locked) return;
    sending.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const result = await recordAcceptedSms(
        () => sendSms(to, text, { appointmentId: appointment.id, staff }),
        async () => { await markNotified(appointment.id, "직접 문자"); await onSent(); },
      );
      setLocked(true);
      setConfirm(false);
      setNotice(result.warning ?? "문자 업체가 발송 요청을 접수했습니다. 실제 도착은 업체 내역에서 확인할 수 있습니다.");
    } catch (e) {
      if (e instanceof SmsOutcomeUnknown) setLocked(true);
      setNotice(e instanceof Error ? e.message : "발송 요청을 확인하지 못했습니다.");
    } finally { sending.current = false; setBusy(false); }
  }
  return <div className="space-y-2">
    {!locked && !confirm && <button type="button" disabled={!appointment.phone || !text.trim() || !staff.trim()} className="rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50" onClick={() => setConfirm(true)}>문자 보내기</button>}
    {confirm && !locked && <>
      {appointment.notified_at && <p className="text-xs text-amber-800">이미 안내한 예약입니다. 다시 발송할지 확인해 주세요.</p>}
      <SmsSendBox recipients={appointment.phone ? [{ label: appointment.patient_name, phone: appointment.phone }] : []} text={text} busy={busy} onSend={send} onCancel={() => setConfirm(false)} />
    </>}
    {notice && <p role="status" className="text-xs text-amber-800">{notice}</p>}
  </div>;
}
