import { describe, it, expect } from "vitest";
import { smsByteLength, smsType, validateSmsRequest } from "./smsRules";

describe("smsByteLength / smsType", () => {
  it("한글은 2바이트, 영문·숫자·줄바꿈은 1바이트", () => {
    expect(smsByteLength("abc")).toBe(3);
    expect(smsByteLength("다담")).toBe(4);
    expect(smsByteLength("a\n다")).toBe(4);
  });
  it("90바이트까지 SMS, 넘으면 LMS", () => {
    expect(smsType("가".repeat(45))).toBe("SMS");
    expect(smsType("가".repeat(46))).toBe("LMS");
  });
});

describe("validateSmsRequest", () => {
  it("정상: 하이픈 있는 번호도 숫자만 남긴다", () => {
    const r = validateSmsRequest({ to: "010-1234-5678", text: " 안녕하세요 " });
    expect(r).toEqual({ ok: true, value: { to: "01012345678", text: "안녕하세요" } });
  });
  it("번호 자릿수·휴대폰 여부·빈 문구·너무 긴 문구를 막는다", () => {
    expect(validateSmsRequest({ to: "0101234", text: "a" }).ok).toBe(false);
    expect(validateSmsRequest({ to: "0212345678", text: "a" }).ok).toBe(false);
    expect(validateSmsRequest({ to: "01012345678", text: "  " }).ok).toBe(false);
    expect(validateSmsRequest({ to: "01012345678", text: "가".repeat(1001) }).ok).toBe(false);
    expect(validateSmsRequest({ to: "01012345678", text: "가".repeat(1000) }).ok).toBe(true);
  });
  it("엉뚱한 입력도 오류로", () => {
    expect(validateSmsRequest(null).ok).toBe(false);
    expect(validateSmsRequest({ to: 123, text: ["a"] }).ok).toBe(false);
  });
});
