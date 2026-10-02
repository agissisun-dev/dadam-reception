import { getSupabase } from "./supabaseClient";

/** 병원. S = 다담에스(김선민 원장, 소화·피부·일반), N = 노원다담한의원(김경태 원장, 구안와사·전립선·관절). */
export type ClinicCode = "S" | "N";

export const CLINICS: Record<ClinicCode, { name: string; short: string; color: string; bg: string; text: string }> = {
  // 홈페이지 색: 김선민 원장 영역 초록, 김경태 원장 영역 남색 (docs/design/brand.md)
  S: { name: "다담에스한의원", short: "다담에스", color: "#16863b", bg: "#f0f7f3", text: "#0f3d23" },
  N: { name: "노원다담한의원", short: "노원다담", color: "#06478f", bg: "#f5f8fc", text: "#06366f" },
};

export function clinicInfo(code: string | null | undefined) {
  return CLINICS[(code === "N" ? "N" : "S") as ClinicCode];
}

let cached: ClinicCode | null = null;

/** 로그인한 계정의 병원. 서버 함수 current_clinic()을 한 번만 묻고 기억한다. 실패하면 S. */
export async function fetchCurrentClinic(): Promise<ClinicCode> {
  if (cached) return cached;
  try {
    const { data, error } = await getSupabase().rpc("current_clinic");
    if (error) return "S";
    cached = data === "N" ? "N" : "S";
    return cached;
  } catch {
    return "S";
  }
}

export function forgetClinic(): void {
  cached = null;
}
