import { daysBetween } from "./dates";
import type { CabinetKind, CabinetMove, CabinetMoveKind, CabinetPurpose } from "./types";

/**
 * 있어야 할 수. 장부를 시간순으로 따라간다.
 *   in +qty · out/discard −qty · count는 그 시점의 값을 qty로 덮어쓴다(차이는 diff에 남김).
 * moves는 created_at 오름차순이어야 한다.
 */
export function expectedStock(moves: CabinetMove[]): number {
  let n = 0;
  for (const m of moves) {
    if (m.kind === "in") n += m.qty;
    else if (m.kind === "out" || m.kind === "discard") n -= m.qty;
    else if (m.kind === "count") n = m.qty;
  }
  return n;
}

export type Lot = { expiry: string | null; qty: number };

/**
 * 남은 입고 묶음. 오래된 묶음부터 나간 것으로 보고, 지금 수(stock)를 최근 입고부터 채워 넣는다.
 * inMoves는 created_at 오름차순. 결과는 기한 빠른 순(기한 없는 묶음은 뒤).
 */
export function remainingLots(inMoves: CabinetMove[], stock: number): Lot[] {
  const lots: Lot[] = [];
  let left = Math.max(0, stock);
  for (let i = inMoves.length - 1; i >= 0 && left > 0; i--) {
    const m = inMoves[i];
    const take = Math.min(m.qty, left);
    if (take > 0) lots.push({ expiry: m.expiry, qty: take });
    left -= take;
  }
  return lots.sort((a, b) => {
    if (a.expiry === null) return 1;
    if (b.expiry === null) return -1;
    return a.expiry.localeCompare(b.expiry);
  });
}

/** 남은 묶음 중 가장 빠른 기한. 기한 없는 묶음뿐이거나 비어 있으면 null. */
export function nearestExpiry(lots: Lot[]): string | null {
  const dated = lots.filter((l) => l.expiry !== null);
  return dated.length ? dated[0].expiry : null;
}

export type ExpiryStatus = "expired" | "soon30" | "soon60" | null;

/** 지남 → expired, 30일 안 → soon30, 60일 안 → soon60, 그 외 null. */
export function expiryStatus(expiry: string | null, today: string): ExpiryStatus {
  if (!expiry) return null;
  const d = daysBetween(today, expiry);
  if (d < 0) return "expired";
  if (d <= 30) return "soon30";
  if (d <= 60) return "soon60";
  return null;
}

/** 센 수 − 있어야 할 수. 0이 아니면 사유가 필요하다. */
export function countDiff(expected: number, counted: number): number {
  return counted - expected;
}

export const KIND_LABEL: Record<CabinetMoveKind, string> = {
  in: "입고",
  out: "나감",
  count: "세어 맞춤",
  discard: "폐기",
};

export const PURPOSES: { value: CabinetPurpose; label: string }[] = [
  { value: "sale", label: "판매" },
  { value: "review", label: "리뷰 증정" },
  { value: "service", label: "서비스" },
  { value: "other", label: "기타" },
];

export function purposeLabel(p: CabinetPurpose | null): string {
  return PURPOSES.find((x) => x.value === p)?.label ?? "";
}

/** 품목 구분(재고 5칸, V15): 외용제(파랑) · 다담환약(초록) · 보험약(주황, 병원별·포) · 약침(보라) · 용품(회색, 핫팩·한방파스 등). */
export const CABINET_KINDS: { value: CabinetKind; label: string; dot: string; order: number; unit: string; hint: string }[] = [
  { value: "topical", label: "외용제", dot: "bg-blue-500", order: 11, unit: "개", hint: "기한 1년 안이면 판매 어려움 — 미리 확인" },
  { value: "medicine", label: "다담환약", dot: "bg-[#16863b]", order: 1, unit: "개", hint: "공진단·경옥환·소합원·보비환" },
  { value: "insured", label: "보험약", dot: "bg-orange-500", order: 31, unit: "포", hint: "병원별 · 장부의 엑스제(N일)에서 자동으로 뺌" },
  { value: "yakchim", label: "약침", dot: "bg-purple-500", order: 41, unit: "병", hint: "물품 신청에서 사서 받으면 여기 입고" },
  { value: "supply", label: "용품", dot: "bg-stone-400", order: 21, unit: "개", hint: "핫팩·한방파스" },
];

/** 엑스제 하루 포 수 기본값(접수실 확인 전까지 3). */
export const DEFAULT_EXTRACT_PER_DAY = 3;

/** 장부 "오적산2일" → 나가는 포 수. 일수·하루 포 수가 없으면 0. */
export function extractPacks(days: number | null, perDay: number | null): number {
  if (!days || days <= 0) return 0;
  const p = perDay && perDay > 0 ? perDay : DEFAULT_EXTRACT_PER_DAY;
  return days * p;
}

export function kindInfo(kind: CabinetKind) {
  return CABINET_KINDS.find((k) => k.value === kind) ?? CABINET_KINDS[CABINET_KINDS.length - 1];
}
