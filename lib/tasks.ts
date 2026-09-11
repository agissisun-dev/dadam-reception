import { getSupabase } from "./supabaseClient";
import type { Task, TaskInput } from "./types";

const TABLE = "tasks";

function fail(action: string, message: string): never {
  throw new Error(`${action} 실패: ${message}`);
}

export async function listOpenTasks(): Promise<Task[]> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("status", "todo")
    .order("due_date", { ascending: true });
  if (error) fail("목록 불러오기", error.message);
  return (data ?? []) as Task[];
}

export async function listDoneTasks(): Promise<Task[]> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("status", "done")
    .order("completed_at", { ascending: false });
  if (error) fail("지난 기록 불러오기", error.message);
  return (data ?? []) as Task[];
}

export async function getTask(id: number): Promise<Task | null> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) fail("업무 불러오기", error.message);
  return (data as Task | null) ?? null;
}

export async function createTask(input: TaskInput): Promise<Task> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert({ title: input.title, due_date: input.due_date, guide_text: input.guide_text })
    .select("*")
    .single();
  if (error) fail("업무 등록", error.message);
  return data as Task;
}

export async function updateTask(id: number, input: TaskInput): Promise<Task> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ title: input.title, due_date: input.due_date, guide_text: input.guide_text })
    .eq("id", id)
    .select("*")
    .single();
  if (error) fail("업무 수정", error.message);
  return data as Task;
}

export async function completeTask(id: number, memo: string, by: string): Promise<Task> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
      completed_by: by,
      completion_memo: memo,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) fail("완료 처리", error.message);
  return data as Task;
}

export async function uncompleteTask(id: number): Promise<Task> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ status: "todo", completed_at: null, completed_by: null, completion_memo: null })
    .eq("id", id)
    .select("*")
    .single();
  if (error) fail("완료 취소", error.message);
  return data as Task;
}

export async function deleteTask(id: number): Promise<void> {
  const { error } = await getSupabase().from(TABLE).delete().eq("id", id);
  if (error) fail("업무 삭제", error.message);
}
