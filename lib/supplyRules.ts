/**
 * 물품 신청함 규칙 (V14, 2026-11-13).
 * 샘들은 한 줄에 하나씩 자유롭게 적고(알콜솜 2통), 앱이 분류한다. 분류 단추는 없다(사용자 2026-11-13).
 */
import type { SupplyCategory, SupplyRequest, SupplyStatus } from "./types";

export const SUPPLY_CATEGORIES: { value: SupplyCategory; label: string; chip: string }[] = [
  { value: "yakchim", label: "약침", chip: "bg-purple-100 text-purple-800" },
  { value: "treatment", label: "치료실 용품", chip: "bg-sky-100 text-sky-800" },
  { value: "office", label: "병원 용품", chip: "bg-stone-100 text-stone-700" },
];

export function categoryInfo(c: SupplyCategory) {
  return SUPPLY_CATEGORIES.find((x) => x.value === c) ?? SUPPLY_CATEGORIES[2];
}

export const STATUS_LABEL: Record<SupplyStatus, string> = {
  requested: "신청함",
  approved: "승인됨",
  ordered: "주문함",
  received: "받음",
  cancelled: "취소",
};

const YAKCHIM_WORDS = ["약침", "봉침", "봉약침", "자하거", "산삼", "황련", "소염", "BV", "HO", "중성어혈", "신바로", "녹용약침", "자운"];
const TREATMENT_WORDS = [
  "알콜솜", "알코올솜", "소독솜", "거즈", "파스", "핫팩", "부항", "컵", "테이프", "장갑", "침", "침봉", "부직포", "밴드", "밴딩",
  "일회용", "시트", "베드", "커버", "마스크", "뜸", "쑥", "TDP", "적외선", "전침", "패드", "물리치료", "수건", "타올", "베개", "가운", "환의", "소독", "멸균", "주사기", "란셋", "사혈",
];

/** 줄 글로 분류. 약침 → 치료실 → 나머지 병원 용품. "침"만 보고 약침으로 보지 않는다. */
export function classifySupply(line: string): SupplyCategory {
  const s = line.replace(/\s+/g, "").toLowerCase();
  if (YAKCHIM_WORDS.some((w) => s.includes(w.toLowerCase()))) return "yakchim";
  if (TREATMENT_WORDS.some((w) => s.includes(w.toLowerCase()))) return "treatment";
  return "office";
}

/** 여러 줄 글 → 신청 줄들. 빈 줄·머리 기호(-, •, 1.)는 뗀다. 쉼표로만 이어 적은 글은 쉼표로도 나눈다. */
export function parseRequestLines(text: string): { text: string; category: SupplyCategory }[] {
  const out: { text: string; category: SupplyCategory }[] = [];
  const seen = new Set<string>();
  const pieces = text.split(/\r?\n/).flatMap((l) => (l.includes("\n") ? [l] : l.split(/[,，]/)));
  for (const raw of pieces) {
    const t = raw.replace(/^\s*(?:[-•*·]|\d+[.)])\s*/, "").trim();
    if (!t) continue;
    const key = t.replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: t, category: classifySupply(t) });
  }
  return out;
}

/** 품목 이름만 (수량·단위 떼기): "알콜솜 2통" → "알콜솜", "A4 2박스" → "A4". 빈도 표의 묶음 키. */
export function supplyItemKey(text: string): string {
  const t = text.trim();
  const m = t.match(/^(.*?)\s*[x×*]?\s*\d+\s*(?:개|통|박스|box|팩|병|장|세트|set|롤|봉|매|권|묶음|단|쌍|켤레|ea|EA|cc|ml|g|kg|L)?\s*$/);
  const name = (m ? m[1] : t).replace(/[\s()（）]+$/, "").trim();
  return (name || t).replace(/\s+/g, " ");
}

export type SupplyFrequency = {
  key: string;
  category: SupplyCategory;
  count: number;
  lastAt: string; // ISO 시각
  /** 신청 사이 평균 간격(일). 한 번뿐이면 null */
  avgGapDays: number | null;
  /** 마지막 가격(원). 없으면 null */
  lastPrice: number | null;
  lastVendor: string | null;
};

/** "얼마나 자주 시키는지": 품목 키별 횟수·마지막 신청·평균 간격·마지막 가격. 취소는 뺀다. 많이 시킨 순. */
export function frequencyTable(rows: SupplyRequest[]): SupplyFrequency[] {
  const groups = new Map<string, SupplyRequest[]>();
  for (const r of rows) {
    if (r.status === "cancelled") continue;
    const key = supplyItemKey(r.text);
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  const out: SupplyFrequency[] = [];
  for (const [key, g] of groups) {
    const sorted = [...g].sort((a, b) => a.requested_at.localeCompare(b.requested_at));
    const first = new Date(sorted[0].requested_at).getTime();
    const last = new Date(sorted[sorted.length - 1].requested_at).getTime();
    const avgGapDays = sorted.length > 1 ? Math.round((last - first) / 86_400_000 / (sorted.length - 1)) : null;
    const priced = [...sorted].reverse().find((r) => r.price != null);
    out.push({
      key,
      category: sorted[sorted.length - 1].category,
      count: sorted.length,
      lastAt: sorted[sorted.length - 1].requested_at,
      avgGapDays,
      lastPrice: priced?.price ?? null,
      lastVendor: priced?.vendor ?? null,
    });
  }
  return out.sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));
}

/** 상태별 다음 행동. 샘: 신청함→(취소) · 주문함→받음. 원장: 신청함→승인·구매 완료 · 승인됨→구매 완료. */
export function nextStatuses(status: SupplyStatus, owner: boolean): SupplyStatus[] {
  if (status === "requested") return owner ? ["approved", "ordered", "cancelled"] : ["cancelled"];
  if (status === "approved") return owner ? ["ordered", "cancelled"] : [];
  if (status === "ordered") return ["received"];
  return [];
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/** 아사이드가 보낼 줄 수정 내용 검사. 가격은 0 이상 정수(원). */
export function validatePriceUpdate(body: unknown): { ok: true; patch: { price?: number | null; vendor?: string | null; price_note?: string | null; product_url?: string | null } } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "본문이 없습니다" };
  const b = body as Record<string, unknown>;
  const patch: { price?: number | null; vendor?: string | null; price_note?: string | null; product_url?: string | null } = {};
  if ("price" in b) {
    if (b.price === null) patch.price = null;
    else if (typeof b.price === "number" && Number.isInteger(b.price) && b.price >= 0) patch.price = b.price;
    else return { ok: false, error: "price는 0 이상 정수(원)여야 합니다" };
  }
  for (const k of ["vendor", "price_note", "product_url"] as const) {
    if (k in b) {
      if (b[k] === null) patch[k] = null;
      else if (typeof b[k] === "string" && (b[k] as string).length <= 1000) patch[k] = (b[k] as string).trim() || null;
      else return { ok: false, error: `${k}는 1000자 이하 글이어야 합니다` };
    }
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "바꿀 내용이 없습니다 (price·vendor·price_note·product_url)" };
  return { ok: true, patch };
}
