import type { ClinicCode } from "./clinic";
import { clinicFromHostname } from "./clinicHosts";

/** S 접수실 이름. 기존 순서를 유지한다. */
export const STAFF_NAMES = ["박정희샘", "실장님", "이혜경샘"] as const;
export type StaffName = string;
export const STAFF_NAME_MAX_LENGTH = 30;
export const RECENT_STAFF_LIMIT = 10;
const LEGACY_KEY = "dadam-reception:last-staff";
const lastKey = (clinic: ClinicCode) => `dadam-reception:last-staff:${clinic}`;
const recentKey = (clinic: ClinicCode) => `dadam-reception:recent-staff:${clinic}`;

/** 기존 S 목록 선택 규칙은 그대로 유지한다. */
export function pickDefaultStaff(saved: string | null): StaffName {
  return (STAFF_NAMES as readonly string[]).includes(saved ?? "")
    ? (saved as StaffName)
    : STAFF_NAMES[0];
}

/** 계정 조회 없이 운영 hostname으로만 구분한다. 그 외 주소는 기존 S 동작. */
export function staffClinicFromBrowser(): ClinicCode {
  try {
    return clinicFromHostname(window.location.hostname) ?? "S";
  } catch {
    return "S";
  }
}

export function normalizeStaffName(name: string | null, clinic: ClinicCode): StaffName {
  if (clinic === "S") return pickDefaultStaff(name);
  return name?.trim().slice(0, STAFF_NAME_MAX_LENGTH).trim() || "접수실";
}

/** 최근 이름만 유지하며, 공백·중복·잘못된 저장값은 제외한다. */
export function recentStaffNames(names: readonly unknown[], clinic: ClinicCode): StaffName[] {
  const valid = names.filter((name): name is string =>
    typeof name === "string" && name.trim().length > 0 &&
    (clinic === "N" || (STAFF_NAMES as readonly string[]).includes(name)),
  );
  return [...new Set(valid.map((name) => normalizeStaffName(name, clinic)))].slice(0, RECENT_STAFF_LIMIT);
}

/** 이 PC의 이 브라우저 전용 기억이며, 공유 직원 명단이 아니다. */
export function loadLastStaff(clinic: ClinicCode = staffClinicFromBrowser()): StaffName {
  try {
    const saved = window.localStorage.getItem(lastKey(clinic));
    // N은 예전 S 공용 키를 읽지 않는다. S만 한 번 옮긴다.
    if (saved === null && clinic === "S") {
      const migrated = pickDefaultStaff(window.localStorage.getItem(LEGACY_KEY));
      try {
        window.localStorage.setItem(lastKey(clinic), migrated);
      } catch {
        // 읽기는 가능하지만 쓰기가 막힌 경우에도 기존 선택은 유지한다.
      }
      return migrated;
    }
    return normalizeStaffName(saved, clinic);
  } catch {
    return normalizeStaffName(null, clinic);
  }
}

export function loadRecentStaff(clinic: ClinicCode = staffClinicFromBrowser()): StaffName[] {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(recentKey(clinic)) ?? "[]");
    return Array.isArray(saved) ? recentStaffNames(saved, clinic) : [];
  } catch {
    return [];
  }
}

export function saveLastStaff(name: StaffName, clinic: ClinicCode = staffClinicFromBrowser()): void {
  const normalized = normalizeStaffName(name, clinic);
  try {
    window.localStorage.setItem(lastKey(clinic), normalized);
    window.localStorage.setItem(
      recentKey(clinic),
      JSON.stringify(recentStaffNames([normalized, ...loadRecentStaff(clinic)], clinic)),
    );
  } catch {
    // 저장이 막혀 있어도 이름 입력·업무 처리는 계속할 수 있다.
  }
}
