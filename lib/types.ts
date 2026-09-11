export type TaskStatus = "todo" | "done";

export type Task = {
  id: number;
  title: string;
  due_date: string; // YYYY-MM-DD
  guide_text: string;
  status: TaskStatus;
  completed_at: string | null;
  completed_by: string | null;
  completion_memo: string | null;
  created_at: string;
};

export type TaskInput = {
  title: string;
  due_date: string;
  guide_text: string;
};
