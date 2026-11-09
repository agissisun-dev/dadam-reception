import type { ClinicCode } from "./clinic";

/** 운영 주소만 병원을 고정한다. 다른 주소에는 병원 제한을 적용하지 않는다. */
export const CLINIC_HOSTS: Readonly<Record<ClinicCode, string>> = {
  S: "dadam-reception.vercel.app",
  N: "nowon-dadam-reception.vercel.app",
};

export const CLINIC_URLS: Readonly<Record<ClinicCode, string>> = {
  S: "https://dadam-reception.vercel.app",
  N: "https://nowon-dadam-reception.vercel.app",
};

export const CLINIC_TITLES: Readonly<Record<ClinicCode, string>> = {
  S: "다담S 접수실",
  N: "노원다담 접수실",
};

/** URL이나 접미사가 아닌, 정확한 hostname만 비교한다 (대소문자 무시). */
export function clinicFromHostname(hostname: string): ClinicCode | null {
  const normalized = hostname.toLowerCase();
  if (normalized === CLINIC_HOSTS.S) return "S";
  if (normalized === CLINIC_HOSTS.N) return "N";
  return null;
}
