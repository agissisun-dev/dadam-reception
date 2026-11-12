import { markNotified } from "./appointments";
import { renderAppointmentTemplate } from "./appointmentRules";
import { sendSms } from "./sms";
import type { Appointment, AppointmentSettings } from "./types";

/**
 * 예약이 잡히는 순간 확인 문자를 보내고 예약에 "자동 문자"로 남긴다.
 * 실패하면 예외를 던진다 — 예약 자체는 이미 저장되어 있으니 화면이 "문자는 못 보냈습니다"로 안내한다.
 */
export async function autoNotify(a: Appointment, s: AppointmentSettings, _clinicName: string, staff: string): Promise<Appointment> {
  if (!a.phone) throw new Error("연락처가 없습니다.");
  const text = renderAppointmentTemplate(s.notify_body, a, a.clinic);
  await sendSms(a.phone, text, { appointmentId: a.id, staff });
  await markNotified(a.id, "자동 문자");
  return { ...a, notified_at: new Date().toISOString(), notify_note: "자동 문자" };
}
