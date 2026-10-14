"use client";

/**
 * 금액 칸 + 오른쪽 작은 ● 단추. ●를 누르면 금액이 붉게 된다(계좌입금·제로페이처럼 접수실에 현금이 없는 줄).
 * 엑셀에서 붉은 글씨로 적던 것 (접수실 2026-10-05). 붉은 금액도 합계에는 들어간다 (접수실 2026-10-14).
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
          title={red ? "붉은 금액 풀기" : "붉은 금액으로 (계좌입금·제로페이 표시, 합계에는 포함)"}
          aria-label={red ? "붉은 금액 풀기" : "붉은 금액으로"}
          className={`absolute right-1.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border text-[9px] leading-none ${red ? "border-red-600 bg-red-600 text-white" : "border-red-300 bg-white text-red-300 hover:border-red-500 hover:text-red-500"}`}
        >
          ●
        </button>
      </span>
    </label>
  );
}
