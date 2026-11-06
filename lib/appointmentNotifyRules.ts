import { normalizePhone } from "./phone";

/** 전날 리마인더 기본 문구. 자리표는 예약 안내 문구와 같다: {이름} {병원} {날짜} {시간} */
export const DEFAULT_REMIND_BODY = "{이름}님, 내일 {날짜} {시간} {병원} 예약 안내드립니다. 변경이 필요하시면 전화 주세요.";

/** 휴대폰 번호(01로 시작, 10~11자리)인가 */
export function isMobile(phone: string | null | undefined): boolean {
  const d = normalizePhone(phone ?? "");
  return (d.length === 10 || d.length === 11) && d.startsWith("01");
}

/**
 * 잡히는 순간 확인 문자를 보낼지 (사용자 결정 2026-11-06).
 * - 설정에서 자동 안내가 켜져 있고
 * - 접수실에서 잡은 것만 (desk·ledger·happycall). 네이버 예약은 네이버가 이미 알림을 보내므로 제외
 * - 휴대폰 번호가 있고, 아직 안내를 안 보냈을 때
 */
export function shouldAutoNotify(
  a: { source: string; phone: string | null; status: string; notified_at: string | null },
  s: { auto_notify: boolean },
): boolean {
  if (!s.auto_notify) return false;
  if (a.source === "naver") return false;
  if (a.status !== "booked") return false;
  if (a.notified_at) return false;
  return isMobile(a.phone);
}

/**
 * 전날 리마인더 대상: 내일 예약 중 예약 상태이고 휴대폰 번호가 있고 아직 리마인더를 안 보낸 것.
 * 네이버 예약도 포함(리마인더는 어디서 잡혔든 보낸다).
 */
export function remindTargets<T extends { day: string; status: string; phone: string | null; remind_sent_at: string | null }>(
  appts: T[],
  tomorrow: string,
): T[] {
  return appts.filter((a) => a.day === tomorrow && a.status === "booked" && !a.remind_sent_at && isMobile(a.phone));
}

/** 서버(UTC)에서 한국 날짜 YYYY-MM-DD */
export function kstToday(nowMs: number = Date.now()): string {
  return new Date(nowMs + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
