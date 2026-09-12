/** 완료 처리 때 고르는 접수실 이름. 순서대로 보인다. */
export const STAFF_NAMES = ["박정희샘", "실장님", "이혜경샘"] as const;
export type StaffName = (typeof STAFF_NAMES)[number];

const KEY = "dadam-reception:last-staff";

/** 저장된 이름이 목록에 있으면 그것, 아니면 첫 번째 이름. */
export function pickDefaultStaff(saved: string | null): StaffName {
  return (STAFF_NAMES as readonly string[]).includes(saved ?? "")
    ? (saved as StaffName)
    : STAFF_NAMES[0];
}

/** 이 브라우저에서 마지막으로 고른 이름 (없으면 첫 번째). */
export function loadLastStaff(): StaffName {
  try {
    return pickDefaultStaff(window.localStorage.getItem(KEY));
  } catch {
    return STAFF_NAMES[0];
  }
}

export function saveLastStaff(name: StaffName): void {
  try {
    window.localStorage.setItem(KEY, name);
  } catch {
    // 저장이 막혀 있어도 동작에는 지장 없음
  }
}
