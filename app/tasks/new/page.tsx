"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import TaskForm from "@/components/TaskForm";
import { createTask } from "@/lib/tasks";
import { listTemplates } from "@/lib/templates";
import { todayISO } from "@/lib/dates";
import type { TaskInput, Template } from "@/lib/types";

function NewTask() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [picked, setPicked] = useState<Template | null>(null);
  const [initial, setInitial] = useState<TaskInput>({ title: "", due_date: todayISO(), guide_text: "" });

  useEffect(() => {
    listTemplates("task")
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

  function pick(id: string) {
    const t = templates.find((x) => String(x.id) === id) ?? null;
    setPicked(t);
    setInitial({ title: t?.title ?? "", due_date: todayISO(), guide_text: t?.body ?? "" });
  }

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-xl font-bold">업무 등록</h1>

      {templates.length > 0 && (
        <label className="mb-4 block">
          <span className="text-sm text-stone-600">틀에서 시작 (선택)</span>
          <select
            value={picked?.id ?? ""}
            onChange={(e) => pick(e.target.value)}
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
          >
            <option value="">직접 입력</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.date_rule ? ` — ${t.date_rule}` : ""}
              </option>
            ))}
          </select>
          {picked?.date_rule && (
            <p className="mt-1 text-sm text-amber-700">날짜 규칙: {picked.date_rule}. 아래 날짜를 그에 맞게 정하세요.</p>
          )}
        </label>
      )}

      <TaskForm
        key={picked?.id ?? "blank"}
        initial={initial}
        submitLabel="저장"
        onSubmit={async (value) => {
          await createTask(value);
          router.push("/");
        }}
      />
    </main>
  );
}

export default function NewTaskPage() {
  return (
    <AuthGate>
      {() => (
        <>
          <AppHeader />
          <NewTask />
        </>
      )}
    </AuthGate>
  );
}
