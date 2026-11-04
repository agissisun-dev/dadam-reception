"use client";

/**
 * 금액 칸 + 오른쪽 작은 ● 단추. ●를 누르면 금액이 붉게 표시된다(계좌입금·제로페이처럼 접수실 서랍에 돈이 없는 줄).
 * 표시만 붉고 합계에는 그대로 들어간다(접수실 2026-11-05). 엑셀에서 붉은 글씨로 적던 것.
 */
export default function MoneyInput({
  label,
  value,
  onChange,
  red,
  onToggleRed,
  compact,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  red: boolean;
  onToggleRed: () => void;
  compact?: boolean;
}) {
  const h = compact ? "h-8" : "h-10";
  return (
    <label className="block">
      {label && <span className="text-[11px] text-stone-500">{label}</span>}
      <span className="relative block">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="numeric"
          placeholder="0"
          className={`${h} w-full rounded border px-2 pr-7 text-right text-sm ${red ? "border-red-500 bg-red-50 font-bold text-red-700" : "border-stone-300"}`}
        />
        <button
          type="button"
          onClick={onToggleRed}
          title={red ? "붉은 표시 풀기" : "붉은 금액으로 표시 (계좌입금·제로페이 — 합계에는 그대로 들어감)"}
          aria-label={red ? "붉은 금액 풀기" : "붉은 금액으로"}
          className={`absolute right-1.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border text-[9px] leading-none ${red ? "border-red-600 bg-red-600 text-white" : "border-red-300 bg-white text-red-300 hover:border-red-500 hover:text-red-500"}`}
        >
          ●
        </button>
      </span>
    </label>
  );
}
