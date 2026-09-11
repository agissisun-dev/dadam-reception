import { describe, it, expect } from "vitest";
import { validateTaskInput } from "./validate";

describe("validateTaskInput", () => {
  it("제목과 날짜가 있으면 통과하고 제목 앞뒤 공백을 지운다", () => {
    const r = validateTaskInput({ title: "  달력 업로드 ", due_date: "2026-09-23", guide_text: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.title).toBe("달력 업로드");
  });
  it("제목이 비면 실패", () => {
    const r = validateTaskInput({ title: "   ", due_date: "2026-09-23", guide_text: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.title).toBe("제목을 입력하세요");
  });
  it("날짜가 비거나 형식이 틀리면 실패", () => {
    const r1 = validateTaskInput({ title: "a", due_date: "", guide_text: "" });
    const r2 = validateTaskInput({ title: "a", due_date: "2026/09/23", guide_text: "" });
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.errors.due_date).toBe("날짜를 선택하세요");
  });
  it("안내문은 비어 있어도 된다", () => {
    const r = validateTaskInput({ title: "a", due_date: "2026-09-23", guide_text: "" });
    expect(r.ok).toBe(true);
  });
});
