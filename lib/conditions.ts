import type { Condition } from "./types";

export const CONDITIONS: { value: Condition; label: string }[] = [
  { value: "digestive", label: "소화기" },
  { value: "skin", label: "피부" },
  { value: "general", label: "일반" },
];

export function conditionLabel(c: Condition): string {
  return CONDITIONS.find((x) => x.value === c)?.label ?? c;
}
