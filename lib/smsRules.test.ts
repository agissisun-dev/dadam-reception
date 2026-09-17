import { describe, it, expect } from "vitest";
import { recipientLabelFor, smsByteLength, smsType, validateSmsRequest } from "./smsRules";

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

const base = { patientId: 7, staff: "이혜경샘" };

describe("validateSmsRequest", () => {
  it("정상: 하이픈 있는 번호도 숫자만 남기고, 환자 번호·보낸 사람을 같이 받는다", () => {
    const r = validateSmsRequest({ ...base, to: "010-1234-5678", text: " 안녕하세요 " });
    expect(r).toEqual({ ok: true, value: { to: "01012345678", text: "안녕하세요", patientId: 7, staff: "이혜경샘" } });
  });
  it("번호 자릿수·휴대폰 여부·빈 문구·너무 긴 문구를 막는다", () => {
    expect(validateSmsRequest({ ...base, to: "0101234", text: "a" }).ok).toBe(false);
    expect(validateSmsRequest({ ...base, to: "0212345678", text: "a" }).ok).toBe(false);
    expect(validateSmsRequest({ ...base, to: "01012345678", text: "  " }).ok).toBe(false);
    expect(validateSmsRequest({ ...base, to: "01012345678", text: "가".repeat(1001) }).ok).toBe(false);
    expect(validateSmsRequest({ ...base, to: "01012345678", text: "가".repeat(1000) }).ok).toBe(true);
  });
  it("환자 번호가 없거나 보낸 사람이 비면 막는다", () => {
    expect(validateSmsRequest({ to: "01012345678", text: "a", staff: "x" }).ok).toBe(false);
    expect(validateSmsRequest({ to: "01012345678", text: "a", patientId: 0, staff: "x" }).ok).toBe(false);
    expect(validateSmsRequest({ to: "01012345678", text: "a", patientId: 7, staff: " " }).ok).toBe(false);
  });
  it("엉뚱한 입력도 오류로", () => {
    expect(validateSmsRequest(null).ok).toBe(false);
    expect(validateSmsRequest({ to: 123, text: ["a"] }).ok).toBe(false);
  });
});

describe("recipientLabelFor — 받는 번호가 그 환자의 것인지", () => {
  const p = { phone: "01011112222", family_phone: "01033334444", family_note: "아들" };
  it("환자 연락처면 '환자', 가족 연락처면 '가족(관계)'", () => {
    expect(recipientLabelFor(p, "01011112222")).toBe("환자");
    expect(recipientLabelFor(p, "01033334444")).toBe("가족(아들)");
  });
  it("둘 다 아니면 null — 등록 안 된 번호로는 못 보낸다", () => {
    expect(recipientLabelFor(p, "01099998888")).toBeNull();
    expect(recipientLabelFor({ phone: "01011112222", family_phone: null, family_note: null }, "01033334444")).toBeNull();
  });
});
