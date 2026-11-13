"use client";

import { useEffect, useState } from "react";
import SmsSendBox, { type SmsRecipient } from "./SmsSendBox";
import SmsAppLink from "./SmsAppLink";
import StaffSelect from "./StaffSelect";
import { listTemplates } from "@/lib/templates";
import { sendSms } from "@/lib/sms";
import { STAFF_NAMES, loadLastStaff, saveLastStaff, type StaffName } from "@/lib/staff";
import { PUBLIC_CLINIC_NAME } from "@/lib/appointmentRules";
import type { Patient, Template } from "@/lib/types";

const PRIMARY = "rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50";

/**
 * 환자 찾기에서 바로 문자 보내기 (사용자 2026-11-13: "해피콜이든 재진콜에 안 떠도, 환자 검색해서 바로 보낼 수 있게").
 * 문구는 주간 관리 문구 틀 중 하나를 고르거나 직접 쓴다. 보내는 길은 둘 중 고른다:
 *   - 병원 휴대폰: 윈도우 "휴대폰과 연결"/휴대폰 문자 앱이 열린다(답장을 받을 수 있음). 앱 장부에는 안 남는다.
 *   - 병원 전화번호: 솔라피 대표번호로 나가고 문자 장부(현황 아래)에 남는다. 답장은 못 받는다.
 */
export default function PatientSmsBox({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [text, setText] = useState(`${patient.name}님, ${PUBLIC_CLINIC_NAME}입니다. `);
  const [staff, setStaff] = useState<StaffName>(() => (typeof window === "undefined" ? STAFF_NAMES[0] : loadLastStaff()));
  const [recipient, setRecipient] = useState<SmsRecipient>({ label: "환자", phone: patient.phone });
  const [route, setRoute] = useState<null | "solapi">(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTemplates("weekly").then(setTemplates).catch(() => setTemplates([]));
  }, []);

  const recipients: SmsRecipient[] = [
    { label: "환자", phone: patient.phone },
    ...(patient.family_phone ? [{ label: `가족(${patient.family_note ?? ""})`, phone: patient.family_phone }] : []),
  ];

  function applyTemplate(t: Template) {
    setText(t.body.replace(/\{이름\}/g, patient.name));
  }

  async function sendViaClinicNumber(to: string, label: string) {
    setBusy(true);
    setError(null);
    try {
      saveLastStaff(staff);
      await sendSms(to, text, { patientId: patient.id, staff });
      setDone(`${label} 번호로 보냈습니다. 문자 장부(현황 아래)에 남았습니다.`);
      setRoute(null);
    } catch (e) {
      setError(`문자를 보내지 못했습니다. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (patient.excluded_at) {
    return <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">연락 제외된 환자입니다. 해제는 환자 상세에서.</p>;
  }

  return (
    <div className="space-y-3 rounded-lg border border-[#16863b] bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-[#0f3d23]">{patient.name}님께 문자</b>
        {recipients.length > 1 && (
          <span className="flex gap-1">
            {recipients.map((r) => (
              <button key={r.phone} type="button" onClick={() => setRecipient(r)} className={`rounded border px-2 py-0.5 text-xs ${recipient.phone === r.phone ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300"}`}>
                {r.label}
              </button>
            ))}
          </span>
        )}
        <button type="button" className="ml-auto text-xs text-stone-500 underline" onClick={onClose}>닫기</button>
      </div>

      {templates.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-stone-500">문구 틀:</span>
          {templates.map((t) => (
            <button key={t.id} type="button" onClick={() => applyTemplate(t)} className="rounded border border-stone-300 px-2 py-0.5 hover:bg-stone-50">
              {t.name}
            </button>
          ))}
        </div>
      )}
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="w-full rounded border border-stone-300 px-3 py-2 text-sm" />
      <StaffSelect value={staff} onChange={setStaff} />

      {route === null ? (
        <div className="flex flex-wrap items-center gap-2">
          <SmsAppLink phone={recipient.phone} text={text} disabled={!text.trim()} />
          <button type="button" className={PRIMARY} disabled={!text.trim()} onClick={() => setRoute("solapi")}>
            병원 전화번호로 보내기
          </button>
          <span className="text-[11px] text-stone-500">답장을 받아야 하면 병원 휴대폰, 안내만이면 병원 전화번호.</span>
        </div>
      ) : (
        <SmsSendBox recipients={[recipient]} text={text} busy={busy} onSend={sendViaClinicNumber} onCancel={() => setRoute(null)} />
      )}
      {done && <p className="text-xs text-[#0f3d23]">{done}</p>}
      {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      <p className="text-[11px] text-stone-500">병원 휴대폰으로 보낸 문자는 앱에 자동으로 남지 않습니다. 필요하면 환자 메모에 적어 주세요.</p>
    </div>
  );
}
