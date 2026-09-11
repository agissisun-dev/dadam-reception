import Link from "next/link";
import type { Task } from "@/lib/types";
import { daysBetween } from "@/lib/dates";

export default function TaskCard({ task, today }: { task: Task; today: string }) {
  const overdueDays = daysBetween(task.due_date, today);
  const isOverdue = task.status === "todo" && overdueDays > 0;

  return (
    <Link
      href={`/tasks/${task.id}`}
      className={`block rounded-lg border bg-white p-4 shadow-sm hover:bg-stone-50 ${
        isOverdue ? "border-red-300" : "border-stone-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium">{task.title}</h3>
        {isOverdue && (
          <span className="shrink-0 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
            {overdueDays}일 지남
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-stone-500">{task.due_date}</p>
    </Link>
  );
}
