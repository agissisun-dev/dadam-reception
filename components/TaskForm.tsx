"use client";

import { useState, type FormEvent } from "react";
import type { TaskInput } from "@/lib/types";
import { validateTaskInput } from "@/lib/validate";

type Props = {
  initial: TaskInput;
  submitLabel: string;
  onSubmit: (value: TaskInput) => Promise<void>;
};

export default function TaskForm({ initial, submitLabel, onSubmit }: Props) {
  const [title, setTitle] = useState(initial.title);
  const [dueDate, setDueDate] = useState(initial.due_date);
  const [guide, setGuide] = useState(initial.guide_text);
  const [errors, setErrors] = useState<{ title?: string; due_date?: string }>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    const result = validateTaskInput({ title, due_date: dueDate, guide_text: guide });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await onSubmit(result.value);
    } catch (err) {
      setSaveError(`저장되지 않았습니다. ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="text-sm text-stone-600">제목</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
          placeholder="예: 10월 달력 카카오 채널 업로드"
        />
        {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title}</p>}
      </label>

      <label className="block">
        <span className="text-sm text-stone-600">할 날짜</span>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
        />
        {errors.due_date && <p className="mt-1 text-sm text-red-600">{errors.due_date}</p>}
      </label>

      <label className="block">
        <span className="text-sm text-stone-600">안내문 (복사해서 쓸 문구, 처리 순서)</span>
        <textarea
          value={guide}
          onChange={(e) => setGuide(e.target.value)}
          rows={8}
          className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
        />
      </label>

      {saveError && (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{saveError}</p>
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
