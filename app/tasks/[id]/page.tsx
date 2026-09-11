"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import TaskForm from "@/components/TaskForm";
import {
  getTask,
  updateTask,
  completeTask,
  uncompleteTask,
  deleteTask,
} from "@/lib/tasks";
import type { Task } from "@/lib/types";

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function TaskDetail({ email }: { email: string }) {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();

  const [task, setTask] = useState<Task | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [memo, setMemo] = useState("");
  const [editing, setEditing] = useState(false);
  const guideRef = useRef<HTMLPreElement>(null);

  const validId = Number.isInteger(id) && id > 0;

  useEffect(() => {
    if (!validId) return;
    getTask(id).then(setTask).catch((e: Error) => setError(e.message));
  }, [id, validId]);

  async function run(action: () => Promise<Task | void>, after?: () => void) {
    setError(null);
    try {
      const result = await action();
      if (result) setTask(result);
      after?.();
    } catch (e) {
      setError(`저장되지 않았습니다. ${(e as Error).message}`);
    }
  }

  async function copyGuide() {
    if (!task) return;
    try {
      await navigator.clipboard.writeText(task.guide_text);
      setCopied(true);
      setCopyHint(null);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = guideRef.current;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      setCopyHint("자동 복사가 막혀 있습니다. 선택된 문구를 Ctrl+C로 복사하세요.");
    }
  }

  if (!validId) return <p className="p-6 text-stone-500">업무를 찾을 수 없습니다.</p>;
  if (error && task === undefined) return <p className="p-6 text-red-600">{error}</p>;
  if (task === undefined) return <p className="p-6 text-stone-500">불러오는 중…</p>;
  if (task === null) return <p className="p-6 text-stone-500">업무를 찾을 수 없습니다.</p>;

  if (editing) {
    return (
      <main className="mx-auto max-w-2xl p-4">
        <h1 className="mb-4 text-xl font-bold">업무 수정</h1>
        <TaskForm
          initial={{ title: task.title, due_date: task.due_date, guide_text: task.guide_text }}
          submitLabel="저장"
          onSubmit={async (value) => {
            const updated = await updateTask(task.id, value);
            setTask(updated);
            setEditing(false);
          }}
        />
        <button onClick={() => setEditing(false)} className="mt-3 text-sm text-stone-600 underline">
          취소
        </button>
      </main>
    );
  }

  const isDone = task.status === "done";

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-bold">{task.title}</h1>
        <p className="text-sm text-stone-500">할 날짜: {task.due_date}</p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-stone-600">안내문</h2>
        <pre
          ref={guideRef}
          className="whitespace-pre-wrap rounded-lg border border-stone-200 bg-white p-4 font-[inherit]"
        >
          {task.guide_text || "(안내문 없음)"}
        </pre>
        <div className="mt-2 flex items-center gap-3">
          <button onClick={copyGuide} className="rounded border border-stone-300 px-3 py-1.5">
            안내문 복사
          </button>
          {copied && <span className="text-sm text-green-700">복사됨</span>}
          {copyHint && <span className="text-sm text-stone-600">{copyHint}</span>}
        </div>
      </section>

      {error && (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {isDone ? (
        <section className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="font-medium text-green-800">완료됨</p>
          <p className="text-sm text-stone-700">
            {formatDateTime(task.completed_at)} · {task.completed_by}
          </p>
          {task.completion_memo && (
            <p className="mt-2 whitespace-pre-wrap text-sm">{task.completion_memo}</p>
          )}
          <button
            onClick={() => run(() => uncompleteTask(task.id))}
            className="mt-3 rounded border border-stone-300 px-3 py-1.5 text-sm"
          >
            완료 취소
          </button>
        </section>
      ) : completing ? (
        <section className="rounded-lg border border-stone-200 bg-white p-4">
          <label className="block">
            <span className="text-sm text-stone-600">완료 메모 (무엇을 어떻게 했는지)</span>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
              placeholder="예: 카카오 채널에 올림. 작년보다 하루 빨리 보냄"
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => run(() => completeTask(task.id, memo, email), () => setCompleting(false))}
              className="rounded bg-stone-900 px-4 py-2 text-white"
            >
              저장
            </button>
            <button onClick={() => setCompleting(false)} className="rounded border border-stone-300 px-4 py-2">
              취소
            </button>
          </div>
        </section>
      ) : (
        <button
          onClick={() => setCompleting(true)}
          className="rounded bg-stone-900 px-4 py-2 text-white"
        >
          완료 처리
        </button>
      )}

      <div className="flex gap-3 border-t border-stone-200 pt-4 text-sm">
        <button onClick={() => setEditing(true)} className="underline">
          수정
        </button>
        <button
          onClick={() => {
            if (window.confirm("이 업무를 삭제할까요? 되돌릴 수 없습니다.")) {
              run(() => deleteTask(task.id), () => router.push("/"));
            }
          }}
          className="text-red-600 underline"
        >
          삭제
        </button>
        <button onClick={() => router.push("/")} className="ml-auto text-stone-600 underline">
          첫 화면으로
        </button>
      </div>
    </main>
  );
}

export default function TaskDetailPage() {
  return (
    <AuthGate>
      {(email) => (
        <>
          <AppHeader email={email} />
          <TaskDetail email={email} />
        </>
      )}
    </AuthGate>
  );
}
