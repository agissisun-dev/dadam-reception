"use client";

import { useCallback, useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import StaffSelect from "@/components/StaffSelect";
import { loadLastStaff, saveLastStaff, STAFF_NAMES, type StaffName } from "@/lib/staff";
import { clinicInfo } from "@/lib/clinic";
import {
  addSupplyRequests,
  getOwnerPin,
  isMissingTable,
  listAllSupplyRequests,
  listSupplyRequests,
  setOwnerPin,
  setSupplyCategory,
  setSupplyMemo,
  setSupplyPrice,
  setSupplyStatus,
} from "@/lib/supplies";
import { categoryInfo, frequencyTable, isValidPin, nextStatuses, parseRequestLines, STATUS_LABEL, SUPPLY_CATEGORIES } from "@/lib/supplyRules";
import type { SupplyCategory, SupplyRequest, SupplyStatus } from "@/lib/types";

const BTN = "rounded border border-stone-300 px-2 py-1 text-xs";
const PRIMARY = "rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50";
const INPUT = "rounded border border-stone-300 px-2 py-1 text-sm";
const UNLOCK_KEY = "supplies.ownerUnlocked";

function whenKo(ts: string): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

const ACTION_LABEL: Record<SupplyStatus, string> = {
  requested: "신청으로",
  approved: "승인",
  ordered: "구매 완료",
  received: "받음",
  cancelled: "취소",
};

/** 원장 칸: 가격·업체·메모·상품 주소. 잠금을 연 뒤에만 보인다. */
function PriceEditor({ row, onSaved }: { row: SupplyRequest; onSaved: () => void }) {
  const [price, setPrice] = useState(row.price != null ? String(row.price) : "");
  const [vendor, setVendor] = useState(row.vendor ?? "");
  const [note, setNote] = useState(row.price_note ?? "");
  const [url, setUrl] = useState(row.product_url ?? "");
  const [error, setError] = useState<string | null>(null);
  async function save() {
    const n = price.trim() === "" ? null : Number(price.replace(/[^\d]/g, ""));
    if (n != null && !(Number.isInteger(n) && n >= 0)) {
      setError("가격은 원 단위 숫자로 적어 주세요");
      return;
    }
    try {
      await setSupplyPrice(row.id, { price: n, vendor: vendor.trim() || null, price_note: note.trim() || null, product_url: url.trim() || null });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded bg-amber-50 p-2 text-xs">
      <span className="font-medium text-amber-900">원장</span>
      <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="가격(원)" className={`${INPUT} w-24`} inputMode="numeric" />
      <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="업체" className={`${INPUT} w-28`} />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모(최저가 비교 등)" className={`${INPUT} min-w-40 flex-1`} />
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="상품 주소" className={`${INPUT} min-w-40 flex-1`} />
      <button type="button" onClick={save} className={BTN}>
        저장
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}

function Row({ row, owner, staff, onChanged }: { row: SupplyRequest; owner: boolean; staff: string; onChanged: () => void }) {
  const [editingPrice, setEditingPrice] = useState(false);
  const [memo, setMemo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cat = categoryInfo(row.category);
  const clinic = clinicInfo(row.clinic);
  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const actions = nextStatuses(row.status, owner);
  return (
    <li className={`rounded-lg border border-stone-200 bg-white p-3 ${row.status === "cancelled" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{row.text}</span>
        <select
          value={row.category}
          onChange={(e) => run(() => setSupplyCategory(row.id, e.target.value as SupplyCategory))}
          className={`rounded px-1.5 py-0.5 text-xs ${cat.chip}`}
          title="분류 (앱이 자동으로 나눕니다. 틀리면 고쳐 주세요)"
        >
          {SUPPLY_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="rounded px-1.5 py-0.5 text-[11px]" style={{ background: clinic.bg, color: clinic.text }}>
          {clinic.short}
        </span>
        <span className="text-xs text-stone-500">
          {row.requested_by} · {whenKo(row.requested_at)}
        </span>
        {row.status === "ordered" && row.ordered_at && <span className="text-xs text-stone-500">· 주문 {whenKo(row.ordered_at)}</span>}
        {row.status === "received" && row.received_at && (
          <span className="text-xs text-stone-500">
            · 받음 {whenKo(row.received_at)} {row.received_by}
          </span>
        )}
        {owner && row.price != null && (
          <span className="text-xs text-amber-800">
            {won(row.price)}
            {row.vendor ? ` · ${row.vendor}` : ""}
          </span>
        )}
        {!owner && row.price != null && <span className="text-xs text-stone-400">가격 확인됨</span>}
        <span className="ml-auto flex flex-wrap gap-1">
          {owner && row.status !== "received" && row.status !== "cancelled" && (
            <button type="button" onClick={() => setEditingPrice((v) => !v)} className={BTN}>
              가격·업체
            </button>
          )}
          {actions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                if (s === "cancelled" && !window.confirm(`"${row.text}" 신청을 취소할까요?`)) return;
                run(() => setSupplyStatus(row.id, s, staff));
              }}
              className={s === "received" || s === "ordered" ? "rounded bg-stone-900 px-2 py-1 text-xs text-white" : BTN}
            >
              {ACTION_LABEL[s]}
            </button>
          ))}
          <button type="button" onClick={() => setMemo((m) => (m == null ? (row.memo ?? "") : null))} className={BTN}>
            메모
          </button>
        </span>
      </div>
      {owner && row.price_note && <p className="mt-1 text-xs text-amber-800">{row.price_note}</p>}
      {owner && row.product_url && (
        <a href={row.product_url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-sky-700 underline">
          {row.product_url}
        </a>
      )}
      {row.memo && memo == null && <p className="mt-1 text-xs text-stone-600">메모: {row.memo}</p>}
      {memo != null && (
        <div className="mt-2 flex gap-2">
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (어디에 쓰는지, 급한지 등)" className={`${INPUT} flex-1`} />
          <button
            type="button"
            onClick={() =>
              run(async () => {
                await setSupplyMemo(row.id, memo);
                setMemo(null);
              })
            }
            className={BTN}
          >
            저장
          </button>
        </div>
      )}
      {owner && editingPrice && (
        <PriceEditor
          row={row}
          onSaved={() => {
            setEditingPrice(false);
            onChanged();
          }}
        />
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </li>
  );
}

function OwnerLock({ unlocked, onChange }: { unlocked: boolean; onChange: (v: boolean) => void }) {
  const [pin, setPin] = useState<string | null | undefined>(undefined); // undefined = 아직 안 읽음
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [setting, setSetting] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getOwnerPin().then(setPin).catch(() => setPin(null));
  }, []);
  if (pin === undefined) return null;
  function unlock() {
    if (input === pin) {
      try {
        sessionStorage.setItem(UNLOCK_KEY, "1");
      } catch {}
      onChange(true);
      setOpen(false);
      setInput("");
      setError(null);
    } else setError("번호가 다릅니다");
  }
  function lock() {
    try {
      sessionStorage.removeItem(UNLOCK_KEY);
    } catch {}
    onChange(false);
  }
  async function savePin() {
    if (newPin !== "" && !isValidPin(newPin)) {
      setError("숫자 4자리로 적어 주세요");
      return;
    }
    try {
      await setOwnerPin(newPin || null);
      setPin(newPin || null);
      setSetting(false);
      setNewPin("");
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const effectivelyOpen = unlocked || !pin;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {effectivelyOpen ? (
        <>
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">원장 칸 열림{!pin && " (잠금 번호 없음)"}</span>
          {pin && (
            <button type="button" onClick={lock} className={BTN}>
              잠그기
            </button>
          )}
          <button type="button" onClick={() => setSetting((v) => !v)} className={BTN}>
            {pin ? "잠금 번호 바꾸기" : "잠금 번호 만들기"}
          </button>
          {setting && (
            <span className="flex items-center gap-1">
              <input value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="4자리 (비우면 잠금 없음)" className={`${INPUT} w-40`} inputMode="numeric" />
              <button type="button" onClick={savePin} className={BTN}>
                저장
              </button>
            </span>
          )}
        </>
      ) : (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)} className={BTN}>
            원장
          </button>
          {open && (
            <span className="flex items-center gap-1">
              <input
                type="password"
                value={input}
                onChange={(e) => setInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(e) => e.key === "Enter" && unlock()}
                placeholder="잠금 번호"
                className={`${INPUT} w-24`}
                inputMode="numeric"
                autoFocus
              />
              <button type="button" onClick={unlock} className={BTN}>
                열기
              </button>
            </span>
          )}
        </>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

function Supplies() {
  const [rows, setRows] = useState<SupplyRequest[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [staff, setStaff] = useState<StaffName>(() => (typeof window === "undefined" ? STAFF_NAMES[0] : loadLastStaff()));
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(UNLOCK_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [pinExists, setPinExists] = useState<boolean | null>(null);
  const [showFreq, setShowFreq] = useState(false);
  const [all, setAll] = useState<SupplyRequest[] | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    listSupplyRequests()
      .then((r) => {
        setRows(r);
        setMissing(false);
      })
      .catch((e: Error) => {
        if (isMissingTable(e)) setMissing(true);
        else setError(e.message);
      });
    getOwnerPin().then((p) => setPinExists(!!p)).catch(() => setPinExists(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (showFreq && !all) listAllSupplyRequests().then(setAll).catch((e: Error) => setError(e.message));
  }, [showFreq, all]);

  const owner = unlocked || pinExists === false;
  const preview = parseRequestLines(text);

  async function submit() {
    if (preview.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await addSupplyRequests(text, staff);
      saveLastStaff(staff);
      setText("");
      setAll(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function changed() {
    setAll(null);
    load();
  }

  const open = (rows ?? []).filter((r) => r.status === "requested" || r.status === "approved");
  const ordered = (rows ?? []).filter((r) => r.status === "ordered");
  const done = (rows ?? []).filter((r) => r.status === "received" || r.status === "cancelled");

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">물품 신청</h1>
        <OwnerLock
          unlocked={unlocked}
          onChange={(v) => {
            setUnlocked(v);
            if (v) setPinExists(true);
          }}
        />
      </div>

      {missing && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          물품 신청 표가 아직 없습니다. Supabase에서 <code>supabase/schema-v14-supplies.sql</code>을 한 번 실행하면 바로 쓸 수 있습니다.
        </p>
      )}

      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="font-bold">필요한 것을 한 줄에 하나씩 적어 주세요</h2>
        <p className="mt-1 text-xs text-stone-500">예: 알콜솜 2통 / 봉약침 10개 / A4 2박스. 분류(약침·치료실 용품·병원 용품)는 앱이 나누고, 틀리면 줄에서 고칩니다.</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={"알콜솜 2통\n봉약침 10개\nA4 2박스"}
          className="mt-2 w-full rounded border border-stone-300 px-3 py-2 text-sm"
        />
        {preview.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1">
            {preview.map((l, i) => (
              <li key={i} className={`rounded px-2 py-0.5 text-xs ${categoryInfo(l.category).chip}`}>
                {l.text} · {categoryInfo(l.category).label}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <StaffSelect value={staff} onChange={setStaff} />
          </div>
          <button type="button" onClick={submit} disabled={saving || preview.length === 0 || missing} className={PRIMARY}>
            {saving ? "신청하는 중…" : `신청 (${preview.length}줄)`}
          </button>
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section>
        <h2 className="mb-2 font-bold">
          신청함 <span className="text-sm font-normal text-stone-500">({open.length}) — {owner ? "가격을 보고 [승인] 또는 [구매 완료]를 누릅니다" : "원장님이 보고 삽니다"}</span>
        </h2>
        {!rows ? (
          <p className="text-stone-500">불러오는 중…</p>
        ) : open.length === 0 ? (
          <p className="text-sm text-stone-500">신청한 것이 없습니다</p>
        ) : (
          <ul className="space-y-2">
            {open.map((r) => (
              <Row key={r.id} row={r} owner={owner} staff={staff} onChanged={changed} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-bold">
          주문함 <span className="text-sm font-normal text-stone-500">({ordered.length}) — 물건이 오면 [받음]을 눌러 주세요</span>
        </h2>
        {ordered.length === 0 ? (
          <p className="text-sm text-stone-500">기다리는 물건이 없습니다</p>
        ) : (
          <ul className="space-y-2">
            {ordered.map((r) => (
              <Row key={r.id} row={r} owner={owner} staff={staff} onChanged={changed} />
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer font-bold">
            받음·취소 <span className="text-sm font-normal text-stone-500">(최근 60일, {done.length})</span>
          </summary>
          <ul className="mt-2 space-y-2">
            {done.map((r) => (
              <Row key={r.id} row={r} owner={owner} staff={staff} onChanged={changed} />
            ))}
          </ul>
        </details>
      )}

      <details open={showFreq} onToggle={(e) => setShowFreq((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer font-bold">
          얼마나 자주 시키는지 <span className="text-sm font-normal text-stone-500">(품목별 횟수·간격{owner ? "·마지막 가격" : ""})</span>
        </summary>
        {showFreq && (
          <div className="mt-2 overflow-x-auto">
            {!all ? (
              <p className="text-sm text-stone-500">불러오는 중…</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-stone-500">
                  <tr>
                    <th className="py-1">품목</th>
                    <th>분류</th>
                    <th className="text-right">횟수</th>
                    <th className="text-right">평균 간격</th>
                    <th>마지막 신청</th>
                    {owner && <th className="text-right">마지막 가격</th>}
                  </tr>
                </thead>
                <tbody>
                  {frequencyTable(all).map((f) => (
                    <tr key={f.key} className="border-t border-stone-100">
                      <td className="py-1">{f.key}</td>
                      <td>
                        <span className={`rounded px-1.5 py-0.5 text-xs ${categoryInfo(f.category).chip}`}>{categoryInfo(f.category).label}</span>
                      </td>
                      <td className="text-right">{f.count}</td>
                      <td className="text-right">{f.avgGapDays != null ? `${f.avgGapDays}일` : "-"}</td>
                      <td>{whenKo(f.lastAt)}</td>
                      {owner && (
                        <td className="text-right">
                          {f.lastPrice != null ? won(f.lastPrice) : "-"}
                          {f.lastVendor ? <span className="text-xs text-stone-500"> {f.lastVendor}</span> : null}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </details>

      <p className="text-xs text-stone-400">
        상태: {Object.values(STATUS_LABEL).join(" → ")}. 가격·업체는 원장 칸을 연 뒤에만 보입니다(아사이드가 API로 적어 넣습니다, <code>docs/setup-supplies.md</code>).
      </p>
    </main>
  );
}

export default function SuppliesPage() {
  return (
    <AuthGate>
      {() => (
        <>
          <AppHeader />
          <Supplies />
        </>
      )}
    </AuthGate>
  );
}
