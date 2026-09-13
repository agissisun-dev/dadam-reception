import { describe, it, expect } from "vitest";
import { normalizePhone, isValidPhone, formatPhone, maskPhone } from "./phone";

describe("phone", () => {
  it("하이픈·공백을 지우고 숫자만 남긴다", () => {
    expect(normalizePhone("010-1234-5678")).toBe("01012345678");
    expect(normalizePhone(" 010 1234 5678 ")).toBe("01012345678");
  });
  it("10~11자리만 유효", () => {
    expect(isValidPhone("01012345678")).toBe(true);
    expect(isValidPhone("0212345678")).toBe(true);
    expect(isValidPhone("123")).toBe(false);
    expect(isValidPhone("010-1234-5678")).toBe(true);
  });
  it("표시용 하이픈", () => {
    expect(formatPhone("01012345678")).toBe("010-1234-5678");
    expect(formatPhone("0212345678")).toBe("02-1234-5678");
  });
  it("가운데 가림", () => {
    expect(maskPhone("01012345678")).toBe("010-****-5678");
    expect(maskPhone("0212345678")).toBe("02-****-5678");
  });
});
