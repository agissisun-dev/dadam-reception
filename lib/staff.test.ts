import { describe, it, expect } from "vitest";
import { STAFF_NAMES, pickDefaultStaff } from "./staff";

describe("STAFF_NAMES", () => {
  it("접수실 이름 세 분이 순서대로 있다", () => {
    expect([...STAFF_NAMES]).toEqual(["박정희샘", "실장님", "이혜경샘"]);
  });
});

describe("pickDefaultStaff", () => {
  it("저장된 이름이 목록에 있으면 그 이름", () => {
    expect(pickDefaultStaff("이혜경샘")).toBe("이혜경샘");
  });
  it("저장된 이름이 없거나 목록에 없으면 첫 번째 이름", () => {
    expect(pickDefaultStaff(null)).toBe("박정희샘");
    expect(pickDefaultStaff("퇴사자")).toBe("박정희샘");
  });
});
