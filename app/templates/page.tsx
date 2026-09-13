"use client";

import { useCallback, useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import { createTemplate, deleteTemplate, listTemplates, updateTemplate } from "@/lib/templates";
import { CONDITIONS, conditionLabel } from "@/lib/conditions";
import type { Condition, Template, TemplateInput, TemplateKind } from "@/lib/types";

const INPUT = "mt-1 w-full rounded border border-stone-300 px-3 py-2";
const BTN = "rounded border border-stone-300 px-3 py-1.5 text-sm";
const PRIMARY = "rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50";

function emptyTask(): TemplateInput {
  return { kind: "task", name: "", title: "", body: "", date_rule: "", condition: null, round: null, sort_order: 0 };
}

function TemplateEditor({
  value,
  onSave,
  onCancel,
}: {
  value: TemplateInput;
  onSave: (v: TemplateInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [v, setV] = useState<TemplateInput>(value);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isTask = v.kind === "task";

  async function save() {
    setError(null);
    if (!v.name.trim()) {
      setError("틀 이름을 입력하세요");
      return;
    }
    if (!v.body.trim()) {
      setError("본문을 입력하세요");
      return;
    }
    setBusy(true);
    try {
      await onSave({ ...v, name: v.name.trim(), title: v.title?.trim() || null, date_rule: v.date_rule?.trim() || null });
    } catch (e) {
      setError(`저장되지 않았습니다. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-stone-300 bg-stone-50 p-4">
      <label className="block">
        <span className="text-sm text-stone-600">틀 이름</span>
        <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className={INPUT} />
      </label>
      {isTask ? (
        <>
          <label className="block">
            <span className="text-sm text-stone-600">기본 제목 (업무 제목으로 들어감)</span>
            <input value={v.title ?? ""} onChange={(e) => setV({ ...v, title: e.target.value })} className={INPUT} />
          </label>
          <label className="block">
            <span className="text-sm text-stone-600">날짜 규칙 메모 (예: 연휴 시작 10일 전)</span>
            <input value={v.date_rule ?? ""} onChange={(e) => setV({ ...v, date_rule: e.target.value })} className={INPUT} />
          </label>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-stone-600">질환</span>
            <select
              value={v.condition ?? ""}
              onChange={(e) => setV({ ...v, condition: (e.target.value || null) as Condition | null })}
              className={INPUT}
            >
              <option value="">공통</option>
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-stone-600">회차</span>
            <select
              value={v.round ?? ""}
              onChange={(e) => setV({ ...v, round: e.target.value ? Number(e.target.value) : null })}
              className={INPUT}
            >
              <option value="">공통</option>
              {[1, 2, 3, 4].map((r) => (
                <option key={r} value={r}>
                  {r}주차
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <label className="block">
        <span className="text-sm text-stone-600">본문</span>
        <textarea value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} rows={6} className={INPUT} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button className={PRIMARY} disabled={busy} onClick={save}>
          저장
        </button>
        <button className={BTN} onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
}

function Manager() {
  const [kind, setKind] = useState<TemplateKind>("task");
  const [rows, setRows] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | "new" | null>(null);

  const load = useCallback(() => {
    listTemplates(kind)
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, [kind]);
  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      setEditing(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const tab = (k: TemplateKind, label: string) => (
    <button
      onClick={() => {
        setKind(k);
        setEditing(null);
      }}
      className={`rounded px-3 py-1.5 text-sm ${kind === k ? "bg-stone-900 text-white" : "border border-stone-300"}`}
    >
      {label}
    </button>
  );

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">문구 틀</h1>
        <div className="flex gap-2">
          {tab("task", "업무 안내문")}
          {tab("weekly", "주간 관리 문구")}
        </div>
      </div>
      <p className="text-sm text-stone-500">
        {kind === "task"
          ? "업무 등록 때 고르면 제목과 안내문이 채워집니다. 이미 등록된 업무는 바뀌지 않습니다."
          : "주간 관리 명단에서 환자의 질환과 회차에 맞는 문구가 자동으로 채워집니다. 5주차부터는 4주차 문구를 씁니다."}
      </p>

      {editing === "new" ? (
        <TemplateEditor
          value={kind === "task" ? emptyTask() : { ...emptyTask(), kind: "weekly", title: null, date_rule: null }}
          onSave={(v) => run(() => createTemplate(v))}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button className={PRIMARY} onClick={() => setEditing("new")}>
          새 틀
        </button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!rows ? (
        <p className="text-stone-500">불러오는 중…</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((t) =>
            editing === t.id ? (
              <li key={t.id}>
                <TemplateEditor
                  value={{ kind: t.kind, name: t.name, title: t.title, body: t.body, date_rule: t.date_rule, condition: t.condition, round: t.round, sort_order: t.sort_order }}
                  onSave={(v) => run(() => updateTemplate(t.id, v))}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={t.id} className="rounded-lg border border-stone-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t.name}</span>
                  {t.kind === "weekly" && (
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">
                      {t.condition ? conditionLabel(t.condition) : "공통"}
                      {t.round ? ` · ${t.round}주차` : ""}
                    </span>
                  )}
                  {t.kind === "task" && t.date_rule && (
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{t.date_rule}</span>
                  )}
                  <span className="ml-auto flex gap-2 text-sm">
                    <button className="underline" onClick={() => setEditing(t.id)}>
                      수정
                    </button>
                    <button
                      className="text-red-600 underline"
                      onClick={() => {
                        if (window.confirm(`"${t.name}" 틀을 삭제할까요?`)) run(() => deleteTemplate(t.id));
                      }}
                    >
                      삭제
                    </button>
                  </span>
                </div>
                {t.kind === "task" && t.title && <p className="mt-1 text-sm text-stone-600">제목: {t.title}</p>}
                <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{t.body}</p>
              </li>
            ),
          )}
        </ul>
      )}
    </main>
  );
}

export default function TemplatesPage() {
  return (
    <AuthGate>
      {() => (
        <>
          <AppHeader />
          <Manager />
        </>
      )}
    </AuthGate>
  );
}
