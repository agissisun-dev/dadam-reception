"use client";

import { useState, type FormEvent } from "react";
import type { PrescriptionInput } from "@/lib/types";
import { planHappyCalls } from "@/lib/happyCallRules";
import { weekdayKo } from "@/lib/dates";

type Props = {
  initial: PrescriptionInput;
  onSubmit: (v: PrescriptionInput) => Promise<void>;
  submitLabel?: string;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default function PrescriptionForm({ initial, onSubmit, submitLabel = "저장" }: Props) {
  const [receive, setReceive] = useState(initial.receive_date);
  const [days, setDays] = useState(String(initial.days));
  const [memo, setMemo] = useState(initial.memo);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const n = Number(days);
  const preview = ISO.test(receive) && n > 0 ? planHappyCalls(receive, n) : [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!ISO.test(receive)) {
      setError("약 수령 예정일을 선택하세요");
      return;
    }
    if (!(n > 0)) {
      setError("처방 일수는 1 이상이어야 합니다");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ receive_date: receive, days: n, memo });
    } catch (err) {
      setError(`저장되지 않았습니다. ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-stone-600">약 수령 예정일</span>
          <input
            type="date"
            value={receive}
            onChange={(e) => setReceive(e.target.value)}
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm text-stone-600">처방 일수</span>
          <input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-sm text-stone-600">처방 메모 (선택)</span>
        <input
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="예: 발효한약, 택배 지방"
          className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
        />
      </label>
      {preview.length > 0 && (
        <p className="rounded bg-stone-100 p-3 text-sm text-stone-700">
          해피콜 예정:{" "}
          {preview.map((c) => `${c.round}차 ${c.due_date} (${weekdayKo(c.due_date)})`).join(" · ")}
          {preview.length === 1 && " — 12일 이하 처방이라 한 번만"}
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
