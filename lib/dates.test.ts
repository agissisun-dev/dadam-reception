import { describe, it, expect } from "vitest";
import { todayISO, addDays, daysBetween, bucketOpenTasks } from "./dates";
import type { Task } from "./types";

function task(partial: Partial<Task> & { id: number; due_date: string }): Task {
  return {
    title: `업무 ${partial.id}`,
    guide_text: "",
    status: "todo",
    completed_at: null,
    completed_by: null,
    completion_memo: null,
    created_at: "2026-09-01T00:00:00+09:00",
    ...partial,
  };
}

describe("todayISO", () => {
  it("현지 날짜를 YYYY-MM-DD로 돌려준다", () => {
    const d = new Date(2026, 8, 11, 23, 30); // 2026-09-11 23:30 현지
    expect(todayISO(d)).toBe("2026-09-11");
  });
  it("한 자리 월·일을 0으로 채운다", () => {
    expect(todayISO(new Date(2027, 0, 7))).toBe("2027-01-07");
  });
});

describe("addDays / daysBetween", () => {
  it("월을 넘어가는 더하기", () => {
    expect(addDays("2026-09-28", 7)).toBe("2026-10-05");
  });
  it("두 날짜의 차이(일)", () => {
    expect(daysBetween("2026-09-10", "2026-09-14")).toBe(4);
    expect(daysBetween("2026-09-14", "2026-09-10")).toBe(-4);
  });
});

describe("bucketOpenTasks", () => {
  const today = "2026-09-11";
  const tasks: Task[] = [
    task({ id: 1, due_date: "2026-09-10" }), // 어제 → 기한 지남
    task({ id: 2, due_date: "2026-09-11" }), // 오늘
    task({ id: 3, due_date: "2026-09-14" }), // 3일 뒤 → 다가오는 일
    task({ id: 4, due_date: "2026-09-18" }), // 7일 뒤 → 다가오는 일 (경계 포함)
    task({ id: 5, due_date: "2026-09-19" }), // 8일 뒤 → 안 보임
    task({ id: 6, due_date: "2027-01-07" }), // 내년 → 안 보임
    task({ id: 7, due_date: "2026-08-25", status: "done" }), // 완료 → 어디에도 안 보임
    task({ id: 8, due_date: "2026-09-01" }), // 더 오래 지남 → 기한 지남, 1번보다 앞
  ];

  it("기한 지난 일은 due_date < today 이고 todo인 것, 오래된 순", () => {
    const { overdue } = bucketOpenTasks(tasks, today);
    expect(overdue.map((t) => t.id)).toEqual([8, 1]);
  });
  it("오늘 할 일은 due_date == today", () => {
    const { today: t } = bucketOpenTasks(tasks, today);
    expect(t.map((x) => x.id)).toEqual([2]);
  });
  it("다가오는 일은 today < due_date <= today+7, 가까운 순", () => {
    const { upcoming } = bucketOpenTasks(tasks, today);
    expect(upcoming.map((t) => t.id)).toEqual([3, 4]);
  });
  it("완료된 업무는 어느 묶음에도 없다", () => {
    const b = bucketOpenTasks(tasks, today);
    const ids = [...b.overdue, ...b.today, ...b.upcoming].map((t) => t.id);
    expect(ids).not.toContain(7);
  });
});
