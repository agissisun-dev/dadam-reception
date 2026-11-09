import { describe, expect, it } from "vitest";
import { CLINIC_HOSTS, CLINIC_URLS, clinicFromHostname } from "./clinicHosts";

describe("clinicFromHostname", () => {
  it("운영 hostname과 병원을 정확히 연결한다", () => {
    expect(clinicFromHostname(CLINIC_HOSTS.S)).toBe("S");
    expect(clinicFromHostname(CLINIC_HOSTS.N)).toBe("N");
    expect(CLINIC_URLS.S).toBe("https://dadam-reception.vercel.app");
    expect(CLINIC_URLS.N).toBe("https://nowon-dadam-reception.vercel.app");
  });

  it("hostname의 대소문자를 구분하지 않는다", () => {
    expect(clinicFromHostname("DADAM-RECEPTION.VERCEL.APP")).toBe("S");
    expect(clinicFromHostname("NOWON-DADAM-RECEPTION.VERCEL.APP")).toBe("N");
  });

  it.each([
    "", "example.com", "localhost", "localhost:3000", "127.0.0.1", "[::1]",
    "dadam-reception-git-main-example.vercel.app",
    "dadam-reception-abc123-example.vercel.app",
    "nowon-dadam-reception-abc123-example.vercel.app",
    "www.dadam-reception.vercel.app",
    "sub.nowon-dadam-reception.vercel.app",
    "dadam-reception.vercel.app.evil.com",
    "nowon-dadam-reception.vercel.app.evil.com",
    "notdadam-reception.vercel.app",
    "notnowon-dadam-reception.vercel.app",
    "dadam-recepti0n.vercel.app",
    "dadam-reception.vercel.app.",
    "https://dadam-reception.vercel.app",
    "dadam-reception.vercel.app:443",
    " dadam-reception.vercel.app ",
  ])("운영 주소와 정확히 같지 않으면 병원을 고정하지 않는다: %s", (hostname) => {
    expect(clinicFromHostname(hostname)).toBeNull();
  });
});
