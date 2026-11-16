"use client";

import { useCallback, useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import CabinetRow from "@/components/CabinetRow";
import { createCabinetItem, listCabinetItems, loadCabinet, updateCabinetItem, type CabinetStatus } from "@/lib/cabinet";
import { CABINET_KINDS, KIND_LABEL, expiryStatus, kindInfo, purposeLabel } from "@/lib/cabinetRules";
import { clinicInfo, fetchCurrentClinic, type ClinicCode } from "@/lib/clinic";
import { todayISO } from "@/lib/dates";
import type { CabinetItem, CabinetKind, CabinetMove } from "@/lib/types";

const BTN = "rounded border border-stone-300 px-3 py-1.5 text-sm";
const PRIMARY = "rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50";
const INPUT = "rounded border border-stone-300 px-3 py-2 text-sm";

function whenKo(ts: string): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 품목 관리: 이름·구분·부족 기준 추가·수정, 사용 안 함. */
function ItemManager({ onChanged, clinic }: { onChanged: () => void; clinic: ClinicCode }) {
  const [items, setItems] = useState<CabinetItem[] | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CabinetKind>("medicine");
  const [unit, setUnit] = useState("개");
  const [minStock, setMinStock] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listCabinetItems(true).then(setItems).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
      <h2 className="mb-2 font-bold">품목 관리</h2>
      <p className="mb-3 text-xs text-stone-500">부족 기준 밑으로 내려가면 붉게 표시됩니다. 안 쓰는 품목은 지우지 말고 [사용 안 함]으로 두면 기록이 남습니다.</p>
      {error && <p className="mb-2 text-red-600">{error}</p>}
      <ul className="divide-y divide-stone-100">
        {(items ?? []).map((it) => (
          <li key={it.id} className="flex flex-wrap items-center gap-2 py-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${kindInfo(it.kind).dot}`} />
            <span className={it.active ? "" : "text-stone-400 line-through"}>{it.name}</span>
            <span className="text-xs text-stone-500">{kindInfo(it.kind).label}{it.unit && it.unit !== "개" ? ` · ${it.unit}` : ""}</span>
            {it.clinic && <span className="rounded px-1.5 py-0.5 text-[11px]" style={{ background: clinicInfo(it.clinic).bg, color: clinicInfo(it.clinic).text }}>{clinicInfo(it.clinic).short}</span>}
            <label className="ml-2 text-xs text-stone-500">
              부족 기준{" "}
              <input
                type="number"
                min={0}
                defaultValue={it.min_stock}
                onBlur={(e) => {
                  const v = Math.max(0, Number(e.target.value));
                  if (v !== it.min_stock) run(async () => { await updateCabinetItem(it.id, { min_stock: v }); });
                }}
                className="w-16 rounded border border-stone-300 px-1.5 py-0.5 text-xs"
              />
            </label>
            <button className="ml-auto text-xs underline" onClick={() => run(async () => { await updateCabinetItem(it.id, { active: !it.active }); })}>
              {it.active ? "사용 안 함" : "다시 사용"}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-stone-100 pt-3">
        <label className="block">
          <span className="text-xs text-stone-500">새 품목</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" className={`mt-1 ${INPUT}`} />
        </label>
        <label className="block">
          <span className="text-xs text-stone-500">구분</span>
          <select
            value={kind}
            onChange={(e) => {
              const k = e.target.value as CabinetKind;
              setKind(k);
              setUnit(kindInfo(k).unit);
            }}
            className={`mt-1 ${INPUT}`}
          >
            {CABINET_KINDS.map((k) => (<option key={k.value} value={k.value}>{k.label}</option>))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-stone-500">단위</span>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} className={`mt-1 w-16 ${INPUT}`} />
        </label>
        {kind === "insured" && (
          <span className="rounded px-2 py-1 text-xs" style={{ background: clinicInfo(clinic).bg, color: clinicInfo(clinic).text }}>
            {clinicInfo(clinic).short} 보험약 (병원별)
          </span>
        )}
        <label className="block">
          <span className="text-xs text-stone-500">부족 기준</span>
          <input type="number" min={0} value={minStock} onChange={(e) => setMinStock(Math.max(0, Number(e.target.value)))} className={`mt-1 w-20 ${INPUT}`} />
        </label>
        <button
          className={PRIMARY}
          disabled={!name.trim()}
          onClick={() =>
            run(async () => {
              const order = (items ?? []).filter((i) => i.kind === kind).length + kindInfo(kind).order;
              await createCabinetItem({ name: name.trim(), kind, min_stock: minStock, active: true, sort_order: order, clinic: kind === "insured" ? clinic : null, unit: unit.trim() || kindInfo(kind).unit });
              setName("");
              setMinStock(0);
            })
          }
        >
          추가
        </button>
      </div>
    </section>
  );
}

function Board() {
  const today = todayISO();
  const [statuses, setStatuses] = useState<CabinetStatus[] | null>(null);
  const [moves, setMoves] = useState<CabinetMove[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const [clinic, setClinic] = useState<ClinicCode>("S");
  const [activeKind, setActiveKind] = useState<CabinetKind | null>(null);

  const load = useCallback(() => {
    loadCabinet()
      .then((d) => {
        setStatuses(d.statuses);
        setMoves(d.moves);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
    fetchCurrentClinic().then(setClinic).catch(() => undefined);
  }, [load]);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!statuses) return <p className="p-6 text-stone-500">불러오는 중…</p>;

  const nameOf = new Map(statuses.map((s) => [s.item.id, s.item.name]));
  const recent = [...moves].reverse().slice(0, 30);
  const summaries = CABINET_KINDS.map((k) => {
    const list = statuses.filter((s) => s.item.kind === k.value);
    const ex = list.map((s) => expiryStatus(s.nearest, today));
    return {
      kind: k,
      list,
      short: list.filter((s) => s.stock < s.item.min_stock).length,
      expired: ex.filter((x) => x === "expired").length,
      soon: ex.filter((x) => x === "soon30" || x === "soon60").length,
    };
  });
  // 처음엔 경고가 있는 칸, 없으면 품목이 있는 첫 칸을 펼친다.
  const shownKind = activeKind ?? summaries.find((s) => s.short + s.expired + s.soon > 0)?.kind.value ?? summaries.find((s) => s.list.length > 0)?.kind.value ?? null;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">재고현황 <span className="text-sm font-normal text-stone-500">(약장)</span></h1>
        <div className="flex items-baseline gap-3">
          <button className={BTN} onClick={() => setManage((v) => !v)}>
            {manage ? "품목 관리 닫기" : "품목 관리"}
          </button>
          <p className="text-sm text-stone-500">{today}</p>
        </div>
      </div>

      <p className="text-xs text-stone-500">칸을 누르면 그 품목만 보입니다. 숫자는 있어야 할 수, 유통기한은 남은 것 중 가장 빠른 것(30일 안 붉게, 60일 안 노랗게). 보험약은 {clinicInfo(clinic).short} 것만 보입니다.</p>

      {manage && <ItemManager onChanged={load} clinic={clinic} />}

      {/* 다섯 칸 타일: 품목 수·부족·기한 경고가 한눈에. 누른 칸의 품목만 아래에 보인다(사용자 2026-11-17 "스크롤 없이 한눈에"). */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {summaries.map(({ kind: k, list, short, expired, soon }) => {
          const active = shownKind === k.value;
          return (
            <button
              key={k.value}
              type="button"
              onClick={() => setActiveKind(active ? null : k.value)}
              aria-pressed={active}
              className={`rounded-lg border bg-white p-3 text-left ${active ? "border-stone-900 ring-2 ring-stone-900/10" : "border-stone-200 hover:border-stone-400"}`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${k.dot}`} />
                <span className="font-bold">{k.label}</span>
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{list.length}<span className="ml-0.5 text-xs font-normal text-stone-500">품목</span></div>
              <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                {short > 0 && <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">부족 {short}</span>}
                {expired > 0 && <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">기한 지남 {expired}</span>}
                {soon > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">기한 60일 안 {soon}</span>}
                {short + expired + soon === 0 && <span className="text-stone-400">이상 없음</span>}
              </div>
            </button>
          );
        })}
      </section>

      {shownKind && (() => {
        const cur = summaries.find((s) => s.kind.value === shownKind)!;
        return (
          <section className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${cur.kind.dot}`} />
              <h2 className="font-bold">{cur.kind.label}</h2>
              <span className="text-xs text-stone-500">{cur.kind.hint}</span>
              <button type="button" onClick={() => setActiveKind(null)} className="ml-auto text-xs text-stone-400 underline">접기</button>
            </div>
            {cur.list.map((s) => <CabinetRow key={s.item.id} status={s} today={today} onDone={load} />)}
            {cur.list.length === 0 && (
              <p className="rounded-lg border border-dashed border-stone-200 bg-white p-3 text-center text-xs text-stone-500">
                아직 품목이 없습니다. [품목 관리]에서 {cur.kind.label} 품목을 추가하세요.
              </p>
            )}
          </section>
        );
      })()}
      {!shownKind && <p className="text-center text-xs text-stone-400">위 칸을 누르면 그 품목들이 보입니다.</p>}

      <section className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-bold">최근 기록</h2>
          <span className="text-xs text-stone-500">최근 30건 · 고치거나 지울 수 없습니다</span>
        </div>
        {recent.length === 0 && <p className="text-stone-500">아직 기록이 없습니다. 각 품목의 [입고]로 지금 있는 수를 넣어 시작하세요.</p>}
        {recent.length > 0 && (
          <table className="w-full text-xs">
            <thead className="text-stone-500">
              <tr>
                <th className="px-2 py-1 text-left">언제</th>
                <th className="px-2 py-1 text-left">품목</th>
                <th className="px-2 py-1 text-left">무엇</th>
                <th className="px-2 py-1 text-left">환자·사유</th>
                <th className="px-2 py-1 text-left">담당</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((m) => {
                const bad = m.kind === "count" && !!m.diff;
                return (
                  <tr key={m.id} className={`border-t border-stone-100 ${bad ? "text-red-700" : ""}`}>
                    <td className="px-2 py-1.5 whitespace-nowrap">{whenKo(m.created_at)}</td>
                    <td className="px-2 py-1.5">{nameOf.get(m.item_id) ?? m.item_id}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {KIND_LABEL[m.kind]} {m.kind === "count" ? `${m.qty}개로${m.diff ? ` (${m.diff > 0 ? "+" : ""}${m.diff})` : ""}` : `${m.qty}개`}
                      {m.expiry ? ` · 기한 ${m.expiry}` : ""}
                    </td>
                    <td className="px-2 py-1.5">
                      {m.purpose ? purposeLabel(m.purpose) : ""}
                      {m.patient_name ? ` ${m.patient_name}` : ""}
                      {m.memo ? <span className="text-stone-500"> {m.memo}</span> : null}
                    </td>
                    <td className="px-2 py-1.5">{m.staff_name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

export default function CabinetPage() {
  return (
    <AuthGate>
      {() => (
        <>
          <AppHeader />
          <Board />
        </>
      )}
    </AuthGate>
  );
}
