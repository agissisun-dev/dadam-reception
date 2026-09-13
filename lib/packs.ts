/** 자주 나가는 포 수. 버튼으로 보인다. */
export const PACK_PRESETS = [20, 35, 40, 70] as const;

/** 기본 하루 복용 포수 */
export const DEFAULT_PER_DAY = 2;

/** 처방 일수 = 포 수 ÷ 하루 포수, 올림. 값이 이상하면 0. */
export function daysFromPacks(packs: number, perDay: number): number {
  if (!(packs > 0) || !(perDay > 0)) return 0;
  return Math.ceil(packs / perDay);
}

/** 화면 표기: "35포(18일분)" 또는 "18일분" */
export function describePrescription(p: { days: number; packs: number | null }): string {
  return p.packs ? `${p.packs}포(${p.days}일분)` : `${p.days}일분`;
}
