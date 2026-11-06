import type { PatientSource } from "./types";

/** 내원 경로 후보 (2026-11-06 사용자: "어떻게 오셨는지 체크, 유튜브면 어떤 영상인지, 블로그면 어떤 글인지") */
export const SOURCES: { value: PatientSource; label: string; hint: string }[] = [
  { value: "youtube", label: "유튜브", hint: "어떤 영상이었는지 대략 (예: 역류성 식도염 영상)" },
  { value: "blog", label: "블로그", hint: "어떤 글이었는지 대략 (예: 손발 찬 사람 글)" },
  { value: "naver", label: "네이버 검색·플레이스", hint: "검색한 말이 있으면 (예: 노원 소화불량 한의원)" },
  { value: "instagram", label: "인스타그램", hint: "어떤 게시물이었는지 대략" },
  { value: "referral", label: "지인 소개", hint: "누가 소개했는지 (예: 어머니 김○○님)" },
  { value: "signboard", label: "간판·지나가다", hint: "메모 (선택)" },
  { value: "other", label: "기타", hint: "어떻게 알게 되셨는지" },
];

export function sourceLabel(s: PatientSource | null | undefined): string {
  return SOURCES.find((x) => x.value === s)?.label ?? "";
}

export function sourceHint(s: PatientSource | ""): string {
  return SOURCES.find((x) => x.value === s)?.hint ?? "어떻게 알게 되셨는지 (선택)";
}
