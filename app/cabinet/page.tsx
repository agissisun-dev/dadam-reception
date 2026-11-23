"use client";

import { useCallback, useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import CabinetRow from "@/components/CabinetRow";
import { archiveCabinetItem, createCabinetItem, restoreCabinetItem, listCabinetItems, loadCabinet, updateCabinetItem, type CabinetStatus } from "@/lib/cabinet";
import { CABINET_KINDS, KIND_LABEL, expiryStatus, isPerClinicKind, kindInfo, purposeLabel } from "@/lib/cabinetRules";
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
function ItemManager({ onChanged, clinic, initialKind, compact }: { onChanged: () => void; clinic: ClinicCode; initialKind?: CabinetKind; compact?: boolean }) {
  const [items, setItems] = useState<CabinetItem[] | null>(null);
  const [archiveId, setArchiveId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CabinetKind>(initialKind ?? "medicine");
  const [unit, setUnit] = useState(kindInfo(initialKind ?? "medicine").unit);
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
    setBusy(true);
    try {
      await fn();
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
      {compact && <p className="mb-2 text-xs text-stone-500">새 품목을 넣고 [입고]로 지금 있는 수량을 적으면, 그날부터 장부에 적힌 같은 이름의 항목이 재고에서 소급해 빠집니다.</p>}
      {!compact && <h2 className="mb-2 font-bold">품목 관리</h2>}
      {!compact && <p className="mb-3 text-xs text-stone-500">[품목 삭제]는 현재 목록에서만 숨깁니다. 수량과 입출고·폐기·장부 기록은 남고, 여기에서 [복원]할 수 있습니다. 공용 품목은 두 병원 목록에 함께 적용됩니다.</p>}
      {error && <p className="mb-2 text-red-600">{error}</p>}
      <ul className={`divide-y divide-stone-100 ${compact ? "hidden" : ""}`}>
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
            {it.active ? (
              <button type="button" disabled={busy} className="ml-auto text-xs text-red-700 underline" onClick={() => setArchiveId(it.id)}>품목 삭제</button>
            ) : (
              <button type="button" disabled={busy} className="ml-auto text-xs underline" onClick={() => run(async () => { await restoreCabinetItem(it.id); })}>복원</button>
            )}
            {archiveId === it.id && (
              <div role="alert" className="w-full space-y-2 rounded border border-red-200 bg-red-50 p-3">
                <p><strong>{it.name}</strong> 품목을 현재 목록에서 삭제할까요?</p>
                <p className="text-xs">재고 수량과 입출고·폐기·장부 기록은 그대로 보관됩니다. 실물 재고 폐기는 [폐기]에서 별도로 기록하세요. {it.clinic !== null ? "이 병원 목록에만 적용됩니다." : "공용 품목이므로 두 병원 목록에서 함께 숨겨집니다."}</p>
                <button type="button" disabled={busy} className={PRIMARY} onClick={() => run(async () => { await archiveCabinetItem(it.id); setArchiveId(null); })}>품목 삭제 확인</button>{" "}
                <button type="button" disabled={busy} className={BTN} onClick={() => setArchiveId(null)}>취소</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className={`flex flex-wrap items-end gap-2 ${compact ? "" : "mt-3 border-t border-stone-100 pt-3"}`}>
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
        {isPerClinicKind(kind) && (
          <span className="rounded px-2 py-1 text-xs" style={{ background: clinicInfo(clinic).bg, color: clinicInfo(clinic).text }}>
            {clinicInfo(clinic).short} {kindInfo(kind).label} (병원별)
          </span>
        )}
        <label className="block">
          <span className="text-xs text-stone-500">부족 기준</span>
          <input type="number" min={0} value={minStock} onChange={(e) => setMinStock(Math.max(0, Number(e.target.value)))} className={`mt-1 w-20 ${INPUT}`} />
        </label>
        <button
          className={PRIMARY}
          disabled={busy || !name.trim()}
          onClick={() =>
            run(async () => {
              const order = (items ?? []).filter((i) => i.kind === kind).length + kindInfo(kind).order;
              await createCabinetItem({ name: name.trim(), kind, min_stock: minStock, active: true, sort_order: order, clinic: isPerClinicKind(kind) ? clinic : null, unit: unit.trim() || kindInfo(kind).unit });
              setName("");
              setMinStock(0);
            })
          }
        >
          {busy ? "저장 중…" : "추가"}
        </button>
      </div>
    </section>
  );
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
  const [quickAdd, setQuickAdd] = useState<CabinetKind | null>(null);

  const load = useCallback(() => {
    loadCabinet()
      .then((d) => {
        setStatuses(d.statuses);
        setAllItems(d.items);
        setMoves(d.moves);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
    fetchCurrentClinic().then(setClinic).catch((e: Error) => setError(`병원 정보를 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요. ${e.message}`));
  }, [load]);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!statuses) return <p className="p-6 text-stone-500">불러오는 중…</p>;

  const nameOf = new Map(allItems.map((item) => [item.id, item.name]));
  const kindOf = new Map(allItems.map((item) => [item.id, item.kind]));
  const unitOf = new Map(allItems.map((item) => [item.id, item.unit || "개"]));
  const summaries = CABINET_KINDS.map((k) => {
    const list = statuses.filter((s) => s.item.kind === k.value);
    const ex = k.value === "yakchim" ? [] : list.map((s) => expiryStatus(s.nearest, today));
    return {
      kind: k,
      list,
      short: list.filter((s) => s.stock < s.item.min_stock).length,
      expired: ex.filter((x) => x === "expired").length,
      soon: ex.filter((x) => x === "soon30" || x === "soon60").length,
    };
  });
  // 처음엔 경고가 있는 칸, 없으면 품목이 있는 첫 칸을 펼친다.
  // 처음엔 경고가 있는 칸(없으면 품목 있는 첫 칸)을 펼친다. [접기]로 닫으면 아무 칸도 안 고른 상태 = 전체 기록.
  const shownKind = collapsed ? null : (activeKind ?? summaries.find((s) => s.short + s.expired + s.soon > 0)?.kind.value ?? summaries.find((s) => s.list.length > 0)?.kind.value ?? null);
  // 최근 기록은 누른 칸 것만(사용자 2026-11-17 "외용제 아래는 외용제 나간 것만"). 칸을 접으면 전체.
  const showAll = !shownKind;
  const recent = [...moves].reverse().filter((m) => showAll || kindOf.get(m.item_id) === shownKind).slice(0, 30);
  const shownLabel = shownKind ? kindInfo(shownKind).label : "";

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">재고현황 <span className="text-sm font-normal text-stone-500">(약장)</span></h1>
        <div className="flex items-baseline gap-3">
          <button className={BTN} disabled={!clinic} onClick={() => setManage((v) => !v)}>
            {manage ? "품목 관리 닫기" : "품목 관리"}
          </button>
          <p className="text-sm text-stone-500">{today}</p>
        </div>
      </div>

      <p className="text-xs text-stone-500">칸을 누르면 그 품목만 보입니다. 숫자는 있어야 할 수, 유통기한은 남은 것 중 가장 빠른 것(30일 안 붉게, 60일 안 노랗게). 보험약·치료실 용품은 {clinic ? clinicInfo(clinic).short : "병원 확인 중"} 것만 보입니다.</p>

      {manage && clinic && <ItemManager onChanged={load} clinic={clinic} />}

      {/* 다섯 칸 타일: 품목 수·부족·기한 경고가 한눈에. 누른 칸의 품목만 아래에 보인다(사용자 2026-11-17 "스크롤 없이 한눈에"). */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {summaries.map(({ kind: k, list, short, expired, soon }) => {
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
                <span className="text-sm font-bold leading-tight">{k.label}</span>
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{list.length}<span className="ml-0.5 text-xs font-normal text-stone-500">품목</span></div>
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
              <button type="button" disabled={!clinic} onClick={() => setQuickAdd((q) => (q === cur.kind.value ? null : cur.kind.value))} className={`ml-auto ${BTN}`}>+ 품목 추가</button>
              <button type="button" onClick={() => { setCollapsed(true); setActiveKind(null); }} className="text-xs text-stone-400 underline">접기 (전체 기록 보기)</button>
            </div>
            {clinic && quickAdd === cur.kind.value && (
              <ItemManager key={cur.kind.value} compact initialKind={cur.kind.value} clinic={clinic} onChanged={() => { setQuickAdd(null); load(); }} />
            )}
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

      <section className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-bold">최근 기록{shownKind ? ` — ${shownLabel}` : ""}</h2>
          <span className="text-xs text-stone-500">{shownKind ? `${shownLabel} 최근 30건` : "전체 최근 30건"} · 고치거나 지울 수 없습니다</span>
        </div>
        {recent.length === 0 && <p className="text-stone-500">{showAll ? "아직 기록이 없습니다. 각 품목의 [입고]로 지금 있는 수를 넣어 시작하세요." : `${shownLabel} 기록이 아직 없습니다.`}</p>}
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
                      {KIND_LABEL[m.kind]} {m.kind === "count" ? `${m.qty}${unitOf.get(m.item_id) || "개"}로${m.diff ? ` (${m.diff > 0 ? "+" : ""}${m.diff})` : ""}` : `${m.qty}${unitOf.get(m.item_id) || "개"}`}
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
