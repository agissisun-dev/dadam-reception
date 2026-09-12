"use client";

import { useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import TaskForm from "@/components/TaskForm";
import { createTask } from "@/lib/tasks";
import { todayISO } from "@/lib/dates";

export default function NewTaskPage() {
  const router = useRouter();

  return (
    <AuthGate>
      {() => (
        <>
          <AppHeader />
          <main className="mx-auto max-w-2xl p-4">
            <h1 className="mb-4 text-xl font-bold">업무 등록</h1>
            <TaskForm
              initial={{ title: "", due_date: todayISO(), guide_text: "" }}
              submitLabel="저장"
              onSubmit={async (value) => {
                await createTask(value);
                router.push("/");
              }}
            />
          </main>
        </>
      )}
    </AuthGate>
  );
}
