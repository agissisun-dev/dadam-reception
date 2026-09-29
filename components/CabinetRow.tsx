"use client";

import { useState } from "react";
import type { CabinetStatus } from "@/lib/cabinet";
import { recordCount, recordDiscard, recordIn, recordOut } from "@/lib/cabinet";
import { KIND_LABEL, PURPOSES, countDiff, expiryStatus, kindInfo, purposeLabel } from "@/lib/cabinetRules";
import { daysBetween } from "@/lib/dates";
import { conditionLabel } from "@/lib/conditions";
import { listPatients } from "@/lib/patients";
import { STAFF_NAMES, loadLastStaff, saveLastStaff, type StaffName } from "@/lib/staff";
import type { CabinetPurpose, Patient } from "@/lib/types";
import StaffSelect from "./StaffSelect";

const BTN = "rounded border border-stone-300 px-3 py-1.5 text-sm";
const PRIMARY = "rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50";
const INPUT = "w-full rounded border border-stone-300 px-3 py-2 text-sm";

type Mode = null | "out" | "in" | "count" | "discard" | "history";

const REVIEW_HINT = "리뷰 증정 기준: 소화기 환자는 소합원 3개 · 일반 환자는 한방파스 1장 · 피부 환자는 사진까지 올리면 외용제 1개";

export default function CabinetRow({ status, today, onDone }: { status: CabinetStatus; today: string; onDone: () => void }) {
  const { item, stock, nearest, moves } = status;
  const [mode, setMode] = useState<Mode>(null);
  const [staff, setStaff] = useState<StaffName>(() => (typeof window === "undefined" ? STAFF_NAMES[0] : loadLastStaff()));
  const [qty, setQty] = useState(1);
  const [purpose, setPurpose] = useState<CabinetPurpose>("sale");
  const [patientQ, setPatientQ] = useState("");
  const [found, setFound] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [counted, setCounted] = useState<string>("");
  const [expiry, setExpiry] = useState("");
  const [memo, setMemo] = useState("");
  const [inStep, setInStep] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const st = expiryStatus(nearest, today);
  const short = stock <= 0 || (item.min_stock > 0 && stock <= item.min_stock);
  /** 아직 기록이 하나도 없는 품목: 처음 수량을 넣는 단계라 세어 맞춤·사유를 묻지 않는다. */
  const first = moves.length === 0;
  const dot = kindInfo(item.kind).dot;
  const countedNum = counted === "" ? null : Number(counted);
  const diff = countedNum === null ? null : countDiff(stock, countedNum);

  function reset() {
    setMode(null);
    setQty(1);
    setPurpose("sale");
    setPatientQ("");
    setFound([]);
    setPatient(null);
    setCounted("");
    setExpiry("");
    setMemo("");
    setInStep(1);
    setError(null);
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      saveLastStaff(staff);
      await fn();
      reset();
      onDone();
    } catch (e) {
      setError(`저장되지 않았습니다. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function searchPatients(q: string) {
    setPatientQ(q);
    setPatient(null);
    if (!q.trim()) {
      setFound([]);
      return;
    }
    try {
      setFound((await listPatients({ q })).slice(0, 8));
    } catch {
      setFound([]);
    }
  }

  function expiryText(): { text: string; cls: string } {
    if (!nearest) return { text: stock > 0 ? "기한 미입력" : "", cls: "text-stone-400" };
    const d = daysBetween(today, nearest);
    if (st === "expired") return { text: `${nearest} 지남 · 폐기 필요`, cls: "text-red-700 font-medium" };
    if (st === "soon30") return { text: `${nearest} (D-${d})`, cls: "text-red-700" };
    if (st === "soon60") return { text: `${nearest} (D-${d})`, cls: "text-amber-700" };
    return { text: `${nearest}`, cls: "text-stone-500" };
  }
  const ex = expiryText();

  return (
    <div className={`rounded-lg border bg-white p-3 ${st === "expired" || short ? "border-red-300" : "border-stone-200"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} title={kindInfo(item.kind).label} />
        <span className="font-medium">{item.name}</span>
        <span className={`text-lg font-semibold ${short ? "text-red-700" : ""}`}>{stock}개</span>
        {short && <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">부족</span>}
        <span className={`text-xs ${ex.cls}`}>{ex.text}</span>
        <span className="ml-auto flex gap-1.5">
          <button className={PRIMARY} onClick={() => (mode === "out" ? reset() : (reset(), setMode("out")))}>
            나감
          </button>
          <button
            className={BTN}
            onClick={() => {
              if (mode === "in") return reset();
              reset();
              setMode("in");
              if (first) {
                setCounted("0");
                setInStep(2);
              }
            }}
          >
            {first ? "처음 수량 넣기" : "입고"}
          </button>
          <button className={`${BTN} text-stone-500`} onClick={() => (mode === "history" ? reset() : (reset(), setMode("history")))}>
            …
          </button>
        </span>
      </div>

      {mode === "out" && (
        <div className="mt-3 space-y-3 border-t border-stone-200 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-stone-600">수량</label>
            <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} className="w-20 rounded border border-stone-300 px-2 py-1.5 text-sm" />
            <span className="ml-2 text-sm text-stone-600">사유</span>
            {PURPOSES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPurpose(p.value)}
                className={`rounded border px-2.5 py-1 text-sm ${purpose === p.value ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {purpose === "review" && <p className="text-xs text-amber-800">{REVIEW_HINT}</p>}
          <div>
            <label className="text-sm text-stone-600">환자 (이름이나 연락처로 찾기)</label>
            {patient ? (
              <p className="mt-1 flex items-center gap-2 text-sm">
                <span className="font-medium">{patient.name}</span>
                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{conditionLabel(patient.condition)}</span>
                <button className="text-xs underline" onClick={() => setPatient(null)}>
                  다시 고르기
                </button>
              </p>
            ) : (
              <>
                <input value={patientQ} onChange={(e) => searchPatients(e.target.value)} placeholder="예: 홍길동 또는 0101234" className={`mt-1 ${INPUT}`} />
                {found.length > 0 && (
                  <ul className="mt-1 divide-y divide-stone-100 rounded border border-stone-200">
                    {found.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => setPatient(p)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-stone-50">
                          <span>{p.name}</span>
                          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{conditionLabel(p.condition)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {patientQ.trim() && found.length === 0 && (
                  <p className="mt-1 text-xs text-stone-500">등록된 환자가 없으면 적은 이름 그대로 남깁니다.</p>
                )}
              </>
            )}
          </div>
          <StaffSelect value={staff} onChange={setStaff} />
          <div className="flex gap-2">
            <button
              className={PRIMARY}
              disabled={busy || qty < 1}
              onClick={() =>
                run(async () => {
                  await recordOut({
                    item_id: item.id,
                    qty,
                    purpose,
                    patient_id: patient?.id ?? null,
                    patient_name: patient?.name ?? (patientQ.trim() || null),
                    staff_name: staff,
                  });
                })
              }
            >
              {qty}개 나감 저장
            </button>
            <button className={BTN} onClick={reset}>
              취소
            </button>
          </div>
        </div>
      )}

      {(mode === "in" || mode === "count") && (
        <div className="mt-3 space-y-3 border-t border-stone-200 pt-3">
          {inStep === 1 && (
            <>
              <p className="text-sm">
                지금 실제로 몇 개 남았나요? <span className="text-stone-500">(있어야 할 수 {stock}개)</span>
              </p>
              <input type="number" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} className="w-28 rounded border border-stone-300 px-2 py-1.5 text-sm" placeholder="센 수" />
              {first && <p className="text-sm text-stone-600">처음 등록이라 사유 없이 저장됩니다. 유통기한까지 적으려면 [처음 수량 넣기]를 쓰세요.</p>}
              {!first && diff !== null && diff !== 0 && (
                <p className="text-sm text-red-700">
                  {Math.abs(diff)}개 {diff > 0 ? "많습니다" : "모자랍니다"}. 사유를 적어야 저장됩니다.
                </p>
              )}
              {!first && diff === 0 && <p className="text-sm text-green-700">장부와 같습니다.</p>}
              {!first && diff !== null && diff !== 0 && (
                <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="사유 (예: 지난주 리뷰 증정 기록 누락)" className={INPUT} />
              )}
              <StaffSelect value={staff} onChange={setStaff} />
              <div className="flex gap-2">
                <button
                  className={PRIMARY}
                  disabled={busy || countedNum === null || (!first && diff !== 0 && !memo.trim())}
                  onClick={() => {
                    if (mode === "count") {
                      run(async () => {
                        await recordCount({
                          item_id: item.id,
                          counted: countedNum!,
                          expected: stock,
                          staff_name: staff,
                          memo: first ? "처음 수량 등록" : memo,
                        });
                      });
                    } else {
                      setInStep(2);
                    }
                  }}
                >
                  {mode === "count" ? "세어 맞춤 저장" : "다음: 들어온 것 적기"}
                </button>
                <button className={BTN} onClick={reset}>
                  취소
                </button>
              </div>
            </>
          )}
          {inStep === 2 && (
            <>
              <p className="text-sm text-stone-600">
                {first
                  ? "처음이라 지금 약장에 있는 수량과 유통기한을 그대로 적습니다. 기한이 다른 묶음이 섞여 있으면 묶음마다 따로 넣으세요."
                  : `센 수 ${countedNum}개${diff !== 0 ? ` (차이 ${diff! > 0 ? "+" : ""}${diff}, 사유: ${memo})` : ""} 기록 뒤, 새로 들어온 것을 적습니다.`}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm text-stone-600">{first ? "지금 있는 수량" : "들어온 수량"}</span>
                  <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} className={`mt-1 ${INPUT}`} />
                </label>
                <label className="block">
                  <span className="text-sm text-stone-600">유통기한</span>
                  <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={`mt-1 ${INPUT}`} />
                </label>
              </div>
              <StaffSelect value={staff} onChange={setStaff} />
              <div className="flex gap-2">
                <button
                  className={PRIMARY}
                  disabled={busy || qty < 1}
                  onClick={() =>
                    run(async () => {
                      if (!first) {
                        await recordCount({ item_id: item.id, counted: countedNum!, expected: stock, staff_name: staff, memo: diff !== 0 ? memo : undefined });
                      }
                      await recordIn({ item_id: item.id, qty, expiry: expiry || null, staff_name: staff, memo: first ? "처음 수량 등록" : undefined });
                    })
                  }
                >
                  {first ? `${qty}개로 시작` : `${qty}개 입고 저장`}
                </button>
                <button className={BTN} onClick={() => (first ? reset() : setInStep(1))}>
                  {first ? "취소" : "이전"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {mode === "discard" && (
        <div className="mt-3 space-y-3 border-t border-stone-200 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-stone-600">폐기 수량</span>
              <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} className={`mt-1 ${INPUT}`} />
            </label>
            <label className="block">
              <span className="text-sm text-stone-600">사유 (필수)</span>
              <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 유통기한 지남" className={`mt-1 ${INPUT}`} />
            </label>
          </div>
          <StaffSelect value={staff} onChange={setStaff} />
          <div className="flex gap-2">
            <button className={`${PRIMARY} bg-red-700`} disabled={busy || qty < 1 || !memo.trim()} onClick={() => run(async () => { await recordDiscard({ item_id: item.id, qty, staff_name: staff, memo }); })}>
              폐기 저장
            </button>
            <button className={BTN} onClick={reset}>
              취소
            </button>
          </div>
        </div>
      )}

      {mode === "history" && (
        <div className="mt-3 space-y-3 border-t border-stone-200 pt-3">
          <div className="flex flex-wrap gap-2">
            <button className={BTN} onClick={() => { reset(); setMode("count"); }}>
              세어 넣기
            </button>
            <button className={`${BTN} text-red-700`} onClick={() => { reset(); setMode("discard"); }}>
              폐기
            </button>
            {status.lots.length > 0 && (
              <span className="ml-auto text-xs text-stone-500">
                남은 묶음: {status.lots.map((l) => `${l.expiry ?? "기한 없음"} ${l.qty}개`).join(" · ")}
              </span>
            )}
          </div>
          <ul className="divide-y divide-stone-100 text-xs">
            {[...moves].reverse().slice(0, 10).map((m) => (
              <li key={m.id} className={`flex flex-wrap gap-2 py-1 ${m.kind === "count" && m.diff ? "text-red-700" : "text-stone-600"}`}>
                <span>{m.created_at.slice(0, 10)}</span>
                <span className="font-medium">{KIND_LABEL[m.kind]}</span>
                <span>{m.kind === "count" ? `${m.qty}개로 맞춤${m.diff ? ` (${m.diff > 0 ? "+" : ""}${m.diff})` : ""}` : `${m.qty}개`}</span>
                {m.purpose && <span>{purposeLabel(m.purpose)}</span>}
                {m.patient_name && <span>{m.patient_name}</span>}
                {m.expiry && <span>기한 {m.expiry}</span>}
                <span>{m.staff_name}</span>
                {m.memo && <span className="text-stone-500">{m.memo}</span>}
              </li>
            ))}
            {moves.length === 0 && <li className="py-1 text-stone-400">기록 없음</li>}
          </ul>
        </div>
      )}

      {error && <p className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
