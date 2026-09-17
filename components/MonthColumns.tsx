"use client";

import { niceMax } from "@/lib/statsRules";

export type Series = { name: string; color: string };

/**
 * 월별 세로 막대. 한 계열이거나 두 계열을 쌓는다(강조 색 + 회색).
 * 값 글자는 마지막 달과 가장 큰 달에만 붙이고, 나머지는 아래 표가 맡는다.
 */
export default function MonthColumns({
  labels,
  series,
  values,
  unit = "",
}: {
  labels: string[];
  series: Series[];
  values: number[][]; // [월][계열]
  unit?: string;
}) {
  const n = labels.length;
  const slot = 44;
  const bar = 24;
  const left = 36;
  const top = 18;
  const plotH = 140;
  const bottom = 22;
  const W = left + slot * n + 8;
  const H = top + plotH + bottom;
  const totals = values.map((v) => v.reduce((a, b) => a + b, 0));
  const max = niceMax(Math.max(0, ...totals));
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const maxIdx = totals.indexOf(Math.max(...totals));
  const ticks = Number.isInteger(max / 2) ? [0, max / 2, max] : [0, max];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={series.map((s) => s.name).join(", ")}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={W - 8} y1={y(t)} y2={y(t)} stroke="#e7e5e4" strokeWidth={1} />
          <text x={left - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="#78716c">
            {t}
          </text>
        </g>
      ))}
      {labels.map((label, i) => {
        const x = left + slot * i + (slot - bar) / 2;
        let acc = 0;
        const segs = values[i].map((v, si) => {
          const y0 = y(acc + v);
          const h = (v / max) * plotH;
          acc += v;
          return { v, si, y0, h };
        });
        const total = totals[i];
        const showLabel = total > 0 && (i === n - 1 || i === maxIdx);
        return (
          <g key={label}>
            <title>{`${label}: ${series.map((s, si) => `${s.name} ${values[i][si]}${unit}`).join(" · ")}`}</title>
            {segs.map((s, k) => {
              if (s.v <= 0) return null;
              const isTop = k === segs.filter((z) => z.v > 0).length - 1 && segs.slice(k + 1).every((z) => z.v <= 0);
              const gap = k > 0 ? 2 : 0;
              return (
                <g key={k}>
                  <rect x={x} y={s.y0 + gap} width={bar} height={Math.max(0, s.h - gap)} rx={isTop ? 4 : 0} fill={series[s.si].color} />
                  {isTop && s.h - gap > 4 && (
                    <rect x={x} y={s.y0 + gap + (s.h - gap) - 4} width={bar} height={4} fill={series[s.si].color} />
                  )}
                </g>
              );
            })}
            {showLabel && (
              <text x={x + bar / 2} y={y(total) - 4} textAnchor="middle" fontSize={11} fill="#292524" fontWeight={600}>
                {total}
              </text>
            )}
            <text x={x + bar / 2} y={H - 6} textAnchor="middle" fontSize={10} fill={i === n - 1 ? "#292524" : "#78716c"}>
              {label}
            </text>
          </g>
        );
      })}
      <line x1={left} x2={W - 8} y1={top + plotH} y2={top + plotH} stroke="#a8a29e" strokeWidth={1} />
    </svg>
  );
}
