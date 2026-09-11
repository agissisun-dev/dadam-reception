import type { TaskInput } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ValidationResult =
  | { ok: true; value: TaskInput }
  | { ok: false; errors: { title?: string; due_date?: string } };

export function validateTaskInput(input: TaskInput): ValidationResult {
  const title = input.title.trim();
  const due_date = input.due_date.trim();
  const errors: { title?: string; due_date?: string } = {};

  if (!title) errors.title = "제목을 입력하세요";
  if (!ISO_DATE.test(due_date)) errors.due_date = "날짜를 선택하세요";

  if (errors.title || errors.due_date) return { ok: false, errors };
  return { ok: true, value: { title, due_date, guide_text: input.guide_text ?? "" } };
}
