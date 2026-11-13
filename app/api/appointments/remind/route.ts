import { createClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/dates";
import { renderAppointmentTemplate } from "@/lib/appointmentRules";
import { kstToday, remindTargets } from "@/lib/appointmentNotifyRules";
import { smsType } from "@/lib/smsRules";
import { NOT_CONFIGURED, smsConfig, solapiSend, writeSmsLog } from "@/lib/smsServer";
import type { Appointment, AppointmentSettings } from "@/lib/types";

/**
 * 전날 리마인더 (V8, 2026-11-06 · 병원별 2026-11-13). Vercel 크론이 매일 08:00 UTC(= 한국 17:00)에 부른다 (vercel.json).
 * 병원마다 접수실 계정으로 로그인해 그 병원의 내일 예약 중 휴대폰 번호가 있고 아직 안 보낸 사람에게 리마인더를 보낸다.
 *
 * 잠금
 *   - 크론만 부를 수 있게 CRON_SECRET을 대조한다 (Vercel이 Authorization: Bearer <CRON_SECRET>으로 부른다).
 *   - 표는 서비스 키가 아니라 **접수실 계정으로 로그인**해서 읽는다. 병원별로
 *     REMINDER_LOGIN_EMAIL_S / REMINDER_LOGIN_PASSWORD_S, REMINDER_LOGIN_EMAIL_N / REMINDER_LOGIN_PASSWORD_N.
 *     (옛 이름 REMINDER_LOGIN_EMAIL / REMINDER_LOGIN_PASSWORD 하나만 있으면 그 계정 하나만 돈다.)
 *     그래서 다른 표와 똑같이 RLS가 그 병원 것만 보여 준다. 앱은 anon 키만 쓴다는 규칙 그대로.
 *   - 보낸 것·실패한 것 모두 sms_logs 장부에 남는다 (처리자 "자동 리마인더").
 */
function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

type Login = { tag: string; email: string; password: string };

function logins(env: Record<string, string | undefined>): Login[] {
  const out: Login[] = [];
  for (const c of ["S", "N"] as const) {
    const email = env[`REMINDER_LOGIN_EMAIL_${c}`];
    const password = env[`REMINDER_LOGIN_PASSWORD_${c}`];
    if (email && password) out.push({ tag: c, email, password });
  }
  if (out.length === 0 && env.REMINDER_LOGIN_EMAIL && env.REMINDER_LOGIN_PASSWORD) {
    out.push({ tag: "기본", email: env.REMINDER_LOGIN_EMAIL, password: env.REMINDER_LOGIN_PASSWORD });
  }
  return out;
}

type Outcome = { clinic: string; skipped?: string; error?: string; day?: string; targets?: number; sent?: number; failed?: number };

async function runForLogin(url: string, anon: string, login: Login): Promise<Outcome> {
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: loginError } = await sb.auth.signInWithPassword({ email: login.email, password: login.password });
  if (loginError) return { clinic: login.tag, error: `리마인더용 로그인에 실패했습니다. ${loginError.message}` };
  try {
    const { data: clinic, error: clinicError } = await sb.rpc("current_clinic");
    if (clinicError || (clinic !== "S" && clinic !== "N")) return { clinic: login.tag, error: "리마인더 계정의 병원 연결을 확인하지 못했습니다." };
    const { data: settings, error: e1 } = await sb.from("appointment_settings").select("*").eq("clinic", clinic).maybeSingle<AppointmentSettings>();
    if (e1) return { clinic, error: `예약 설정 읽기 실패: ${e1.message}` };
    if (!settings?.remind_enabled) return { clinic, skipped: "전날 리마인더가 꺼져 있습니다." };
    const cfg = smsConfig(clinic);
    if (!cfg) return { clinic, error: NOT_CONFIGURED };

    const tomorrow = addDays(kstToday(), 1);
    const { data: rows, error: e2 } = await sb.from("appointments").select("*").eq("clinic", clinic).eq("day", tomorrow).eq("status", "booked");
    if (e2) return { clinic, error: `예약 읽기 실패: ${e2.message}` };
    const targets = remindTargets((rows ?? []) as Appointment[], tomorrow);

    let sent = 0;
    let failed = 0;
    for (const a of targets) {
      const text = renderAppointmentTemplate(settings.remind_body, a, clinic);
      const to = a.phone!.replace(/\D/g, "");
      const type = smsType(text);
      const result = await solapiSend(cfg, { to, text, type });
      await writeSmsLog(sb, {
        patient_id: a.patient_id,
        patient_name: a.patient_name,
        recipient_label: "예약 연락처",
        to_phone: to,
        text,
        sms_type: type,
        staff_name: "자동 리마인더",
        ok: result.ok,
        error: result.ok ? null : result.error,
        message_id: result.ok ? result.messageId : null,
      });
      if (result.ok) {
        sent += 1;
        await sb.from("appointments").update({ remind_sent_at: new Date().toISOString(), remind_note: "자동 문자" }).eq("id", a.id);
      } else {
        failed += 1;
        await sb.from("appointments").update({ remind_note: `실패: ${result.error}` }).eq("id", a.id);
      }
    }
    return { clinic, day: tomorrow, targets: targets.length, sent, failed };
  } finally {
    await sb.auth.signOut().catch(() => undefined);
  }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return reply(401, { error: "허용되지 않은 호출입니다." });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return reply(500, { error: "연결 설정이 없습니다." });
  const list = logins(process.env);
  if (list.length === 0) return reply(503, { error: "리마인더용 로그인(REMINDER_LOGIN_EMAIL_S·REMINDER_LOGIN_PASSWORD_S 등)이 아직 없습니다." });

  const results: Outcome[] = [];
  for (const login of list) results.push(await runForLogin(url, anon, login));
  return reply(200, { results });
}
