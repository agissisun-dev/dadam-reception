"use client";

import { useState, type FormEvent } from "react";
import type { PrescriptionInput } from "@/lib/types";
import { planHappyCalls } from "@/lib/happyCallRules";
import { todayISO, weekdayKo } from "@/lib/dates";
import { DEFAULT_PER_DAY, PACK_PRESETS, daysFromPacks } from "@/lib/packs";

type Props = {
  initial: PrescriptionInput;
  onSubmit: (v: PrescriptionInput) => Promise<void>;
  submitLabel?: string;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const INPUT = "mt-1 w-full rounded border border-stone-300 px-3 py-2";

export default function PrescriptionForm({ initial, onSubmit, submitLabel = "저장" }: Props) {
  const [receive, setReceive] = useState(initial.receive_date);
  const [packs, setPacks] = useState(initial.packs ? String(initial.packs) : "");
  const [perDay, setPerDay] = useState(initial.per_day ?? DEFAULT_PER_DAY);
  const [memo, setMemo] = useState(initial.memo);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const packsN = Number(packs);
  const days = daysFromPacks(packsN, perDay);
  const preview = ISO.test(receive) && days > 0 ? planHappyCalls(receive, days) : [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!ISO.test(receive)) {
      setError("약 수령 예정일을 선택하세요");
      return;
    }
    if (!(packsN > 0)) {
      setError("포 수를 고르거나 입력하세요");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ receive_date: receive, days, packs: packsN, per_day: perDay, memo });
    } catch (err) {
      setError(`저장되지 않았습니다. ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const chip = (active: boolean) =>
    `rounded border px-3 py-1.5 text-sm ${active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300"}`;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <span className="text-sm text-stone-600">약 수령 예정일</span>
        <div className="mt-1 flex gap-2">
          <input
            type="date"
            value={receive}
            onChange={(e) => setReceive(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
          <button type="button" onClick={() => setReceive(todayISO())} className={chip(receive === todayISO())}>
            오늘 수령
          </button>
        </div>
      </div>

      <div>
        <span className="text-sm text-stone-600">포 수</span>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {PACK_PRESETS.map((n) => (
            <button key={n} type="button" onClick={() => setPacks(String(n))} className={chip(packsN === n)}>
              {n}포
            </button>
          ))}
          <input
            type="number"
            min={1}
            value={packs}
            onChange={(e) => setPacks(e.target.value)}
            placeholder="직접 입력"
            className="w-28 rounded border border-stone-300 px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-stone-600">하루 포수</span>
          <select value={perDay} onChange={(e) => setPerDay(Number(e.target.value))} className={INPUT}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                하루 {n}포
              </option>
            ))}
          </select>
        </label>
        <div className="block">
          <span className="text-sm text-stone-600">처방 일수 (계산)</span>
          <p className="mt-1 rounded border border-stone-200 bg-stone-50 px-3 py-2">
            {days > 0 ? `${days}일분` : "—"}
          </p>
        </div>
      </div>

      <label className="block">
        <span className="text-sm text-stone-600">처방 메모 (선택)</span>
        <input
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="예: 발효한약, 택배 지방"
          className={INPUT}
        />
      </label>

      {preview.length > 0 && (
        <p className="rounded bg-stone-100 p-3 text-sm text-stone-700">
          {packsN}포 · 하루 {perDay}포 → {days}일분. 해피콜:{" "}
          {preview.map((c) => `${c.round}차 ${c.due_date} (${weekdayKo(c.due_date)})`).join(" · ")}
          {preview.length === 1 && " — 12일 이하라 한 번만"}
        </p>
      )}
      {error && (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-stone-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {busy ? "저장 중…" : submitLabel}
      </button>
    </form>
  );
}
