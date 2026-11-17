"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import CabinetRow from "@/components/CabinetRow";
import { buildStatuses, createCabinetItem, loadCabinet, updateCabinetItem, type CabinetStatus } from "@/lib/cabinet";
import { CABINET_KINDS, KIND_LABEL, expiryStatus, kindInfo, purposeLabel, cabinetInitialized, isLegacyCabinetItem, normalizedCabinetUnit } from "@/lib/cabinetRules";
import { clinicInfo, type ClinicCode } from "@/lib/clinic";
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

const UNITS = ["개", "박스", "봉지", "팩", "통", "병", "포", "장"];
function UnitEditor({ item, locked, busy, save }: { item: CabinetItem; locked: boolean; busy: boolean; save: (unit: string) => void }) {
  const [value, setValue] = useState(item.unit);
  return <span className="flex items-center gap-1 text-xs">
    <input aria-label={item.name + " 단위"} list="cabinet-units" value={value} maxLength={20} disabled={locked || busy} onChange={(e) => setValue(e.target.value)} className="w-20 rounded border px-1 py-0.5" />
    {!locked && <button disabled={busy || value.trim() === item.unit} onClick={() => save(value)} className="underline disabled:opacity-40">단위 저장</button>}
    {locked && <span className="text-stone-500">기록 있음: 단위 변경 불가. 다른 단위는 새 품목으로 등록 (기존 수량 변환 안 됨)</span>}
  </span>;
}
function ItemManager({ onChanged, clinic }: { onChanged: () => void; clinic: ClinicCode }) {
  const [items, setItems] = useState<CabinetItem[]>([]);
  const [history, setHistory] = useState<Set<number>>(new Set());
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CabinetKind>("medicine");
  const [unit, setUnit] = useState("개");
  const [minStock, setMinStock] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const load = useCallback(async () => {
    const data = await loadCabinet();
    setItems(data.allItems.filter((i) => !isLegacyCabinetItem(i)));
    setHistory(new Set(data.moves.map((m) => m.item_id)));
    setReady(true);
  }, []);
  useEffect(() => {
    let active = true;
    loadCabinet().then((data) => {
      if (!active) return;
      setItems(data.allItems.filter((item) => !isLegacyCabinetItem(item)));
      setHistory(new Set(data.moves.map((move) => move.item_id)));
      setReady(true);
    }).catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  async function run(fn: () => Promise<void>, message = "저장했습니다.") {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null); setNotice("저장 중…");
    try { await fn(); setNotice(message); onChanged(); await load(); }
    catch (e) { setError((e as Error).message); setNotice(""); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
    <h2 className="mb-2 font-bold">품목 관리</h2>
    <p className="mb-3 text-xs text-stone-500">보험약·용품은 {clinicInfo(clinic).short} 전용, 나머지는 공용입니다. 용품 추가 후 실제 수량을 직접 세어 [현재 수량 등록]을 저장하세요. 추가만으로 수량은 기록되지 않습니다.</p>
    <datalist id="cabinet-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
    <ul className="divide-y divide-stone-100">{items.map((it) => <li key={it.id} className="flex flex-wrap items-center gap-2 py-2">
      <span className={it.active ? "" : "text-stone-400 line-through"}>{it.name}</span>
      <span className="text-xs text-stone-500">{kindInfo(it.kind).label} · {it.clinic ? clinicInfo(it.clinic).short + " 전용" : "공용"}</span>
      <UnitEditor key={`${it.id}:${it.unit}`} item={it} locked={!ready || history.has(it.id)} busy={busy} save={(value) => run(async () => { await updateCabinetItem(it.id, { unit: value }); })} />
      <label className="text-xs">부족 기준 <input type="number" min={0} defaultValue={it.min_stock} disabled={busy} onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0 && v !== it.min_stock) run(async () => { await updateCabinetItem(it.id, { min_stock: v }); }); }} className="w-16 rounded border px-1" /></label>
      <button disabled={busy} className="ml-auto text-xs underline" onClick={() => run(async () => { await updateCabinetItem(it.id, { active: !it.active }); })}>{it.active ? "사용 안 함" : "다시 사용"}</button>
    </li>)}</ul>
    <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
      <label>새 품목<input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder="이름" className={INPUT} /></label>
      <label>구분<select value={kind} disabled={busy} onChange={(e) => { const k = e.target.value as CabinetKind; setKind(k); setUnit(kindInfo(k).unit); }} className={INPUT}>{CABINET_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></label>
      <label>단위<input list="cabinet-units" value={unit} maxLength={20} disabled={busy} onChange={(e) => setUnit(e.target.value)} className={INPUT + " w-20"} /></label>
      <label>부족 기준<input type="number" min={0} value={minStock} disabled={busy} onChange={(e) => setMinStock(Math.max(0, Number(e.target.value)))} className={INPUT + " w-20"} /></label>
      <button className={PRIMARY} disabled={busy || !ready || !name.trim()} onClick={() => run(async () => {
        const validUnit = normalizedCabinetUnit(unit);
        const order = items.filter((i) => i.kind === kind).length + kindInfo(kind).order;
        await createCabinetItem({ name: name.trim(), kind, unit: validUnit, min_stock: minStock, active: true, sort_order: order, clinic: kind === "insured" || kind === "supply" ? clinic : null });
        setName(""); setMinStock(0);
      }, "품목을 추가했습니다. 수량은 별도로 등록해 주세요.")}>{busy ? "저장 중…" : "추가"}</button>
    </div>
    <div aria-live="polite" className="mt-2">{error ? <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-red-700">저장되지 않았습니다. {error}</p> : <p role="status" className="text-stone-600">{notice}</p>}</div>
  </section>;
}

function Board() {
  const today = todayISO();
  const [statuses, setStatuses] = useState<CabinetStatus[] | null>(null);
  const [allItems, setAllItems] = useState<CabinetItem[]>([]);
  const [moves, setMoves] = useState<CabinetMove[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const [clinic, setClinic] = useState<ClinicCode | null>(null);
  const [activeKind, setActiveKind] = useState<CabinetKind | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(() => {
    loadCabinet()
      .then((d) => {
        setClinic(d.clinic);
        setAllItems(d.allItems);
        setStatuses(d.statuses);
        setMoves(d.moves);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!statuses || !clinic) return <p className="p-6 text-stone-500">병원과 재고를 확인하는 중…</p>;

  const nameOf = new Map(allItems.map((item) => [item.id, item.name]));
  const kindOf = new Map(allItems.map((item) => [item.id, item.kind]));
  const unitOf = new Map(allItems.map((item) => [item.id, item.unit || (item.kind === "insured" ? "포" : "개")]));
  const summaries = CABINET_KINDS.map((k) => {
    const list = statuses.filter((s) => s.item.kind === k.value && !isLegacyCabinetItem(s.item));
    const ex = list.map((s) => expiryStatus(s.nearest, today));
    return {
      kind: k,
      list,
      short: list.filter((s) => cabinetInitialized(s.item, s.moves) && s.stock < s.item.min_stock).length,
      uninitialized: list.filter((s) => !cabinetInitialized(s.item, s.moves)).length,
      expired: ex.filter((x) => x === "expired").length,
      soon: ex.filter((x) => x === "soon30" || x === "soon60").length,
    };
  });
  // 처음엔 경고가 있는 칸, 없으면 품목이 있는 첫 칸을 펼친다.
  // 처음엔 경고가 있는 칸(없으면 품목 있는 첫 칸)을 펼친다. [접기]로 닫으면 아무 칸도 안 고른 상태 = 전체 기록.
  const shownKind = collapsed ? null : (activeKind ?? summaries.find((s) => s.short + s.expired + s.soon > 0)?.kind.value ?? summaries.find((s) => s.list.length > 0)?.kind.value ?? null);
  // 최근 기록은 누른 칸 것만(사용자 2026-11-17 "외용제 아래는 외용제 나간 것만"). 칸을 접으면 전체.
  const showAll = !shownKind;
  const archiveIds = new Set(allItems.filter(isLegacyCabinetItem).map((i) => i.id));
  const archive = buildStatuses(allItems.filter(isLegacyCabinetItem), moves);
  const recent = [...moves].reverse().filter((m) => !archiveIds.has(m.item_id) && (showAll || kindOf.get(m.item_id) === shownKind)).slice(0, 30);
  const shownLabel = shownKind ? kindInfo(shownKind).label : "";

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

      <p className="text-xs text-stone-500">칸을 누르면 그 품목만 보입니다. 숫자는 있어야 할 수, 유통기한은 남은 것 중 가장 빠른 것(30일 안 붉게, 60일 안 노랗게). 보험약·용품의 품목·수량·입출고 기록은 {clinicInfo(clinic).short} 전용입니다. 나머지 세 칸은 두 병원 공용입니다.</p>

      {manage && <ItemManager onChanged={load} clinic={clinic} />}

      {/* 다섯 칸 타일: 품목 수·부족·기한 경고가 한눈에. 누른 칸의 품목만 아래에 보인다(사용자 2026-11-17 "스크롤 없이 한눈에"). */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {summaries.map(({ kind: k, list, short, expired, soon, uninitialized }) => {
          const active = shownKind === k.value;
          return (
            <button
              key={k.value}
              type="button"
              onClick={() => {
                setCollapsed(active);
                setActiveKind(active ? null : k.value);
              }}
              aria-pressed={active}
              className={`rounded-lg border bg-white p-3 text-left ${active ? "border-stone-900 ring-2 ring-stone-900/10" : "border-stone-200 hover:border-stone-400"}`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${k.dot}`} />
                <span className="font-bold">{k.label}</span>
              </div>
              <div className="mt-1 text-[11px] text-stone-500">{(k.value === "insured" || k.value === "supply") ? `${clinicInfo(clinic).short} 전용` : "두 병원 공용"}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{list.length}<span className="ml-0.5 text-xs font-normal text-stone-500">품목</span></div>
              <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                {uninitialized > 0 && <span className="text-amber-800">초기 수량 미등록 {uninitialized}</span>}
                {short > 0 && <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">부족 {short}</span>}
                {expired > 0 && <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">기한 지남 {expired}</span>}
                {soon > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">기한 60일 안 {soon}</span>}
                {short + expired + soon + uninitialized === 0 && <span className="text-stone-400">이상 없음</span>}
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
              <button type="button" onClick={() => { setCollapsed(true); setActiveKind(null); }} className="ml-auto text-xs text-stone-400 underline">접기 (전체 기록 보기)</button>
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
      {!shownKind && <p className="text-center text-xs text-stone-400">위 칸을 누르면 그 품목과 그 품목의 기록만 보입니다. 지금은 전체 기록입니다.</p>}

      {archive.length > 0 && <section className="rounded-lg border border-stone-300 bg-stone-50 p-4 text-sm">
        <h2 className="font-bold">분리 전 공용 기록 / 수량 미배분</h2>
        <p className="mb-2 text-xs text-stone-500">읽기 전용 보관입니다. 아래 수량은 어느 병원에도 배분·복사되지 않았으며 현재 병원 용품 합계에 포함되지 않습니다.</p>
        {archive.map((s) => <div key={s.item.id} className="border-t py-2"><p className="font-medium">{s.item.name} · {s.stock}{s.item.unit}</p><ul className="text-xs text-stone-600">{[...s.moves].reverse().map((m) => <li key={m.id}>{whenKo(m.created_at)} · {KIND_LABEL[m.kind]} {m.qty}{s.item.unit} · {m.staff_name}{m.patient_name ? " · " + m.patient_name : ""}{m.memo ? " · " + m.memo : ""}</li>)}</ul></div>)}
      </section>}
      <section className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-bold">최근 기록{shownKind === "supply" ? ` · ${clinicInfo(clinic).short} 전용` : ""}{shownKind ? ` — ${shownLabel}` : ""}</h2>
          <span className="text-xs text-stone-500">{shownKind ? `${shownLabel} 최근 30건` : "전체 최근 30건"} · 고치거나 지울 수 없습니다</span>
        </div>
        {recent.length === 0 && <p className="text-stone-500">{showAll ? "아직 기록이 없습니다. 용품은 [현재 수량 등록], 나머지 품목은 [입고]로 시작하세요." : `${shownLabel} 기록이 아직 없습니다.`}</p>}
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
                const unit = unitOf.get(m.item_id) ?? "개";
                return (
                  <tr key={m.id} className={`border-t border-stone-100 ${bad ? "text-red-700" : ""}`}>
                    <td className="px-2 py-1.5 whitespace-nowrap">{whenKo(m.created_at)}</td>
                    <td className="px-2 py-1.5">{nameOf.get(m.item_id) ?? m.item_id}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {KIND_LABEL[m.kind]} {m.kind === "count" ? `${m.qty}${unit}로${m.diff ? ` (${m.diff > 0 ? "+" : ""}${m.diff})` : ""}` : `${m.qty}${unit}`}
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
