import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supplyApiClinic } from "./suppliesServer";
function client(data: unknown, error: unknown = null) { return { rpc: vi.fn().mockResolvedValue({ data, error }) } as unknown as SupabaseClient; }
const s = "https://dadam-reception.vercel.app/api/supplies";
const n = "https://nowon-dadam-reception.vercel.app/api/supplies";
describe("물품 API 계정·주소 병원 일치", () => {
  it("S 계정은 S 주소", async () => { await expect(supplyApiClinic(client("S"), new Request(s))).resolves.toBe("S"); });
  it("N 계정은 N 주소", async () => { await expect(supplyApiClinic(client("N"), new Request(n))).resolves.toBe("N"); });
  it("N 주소에서 S 계정 데이터를 반환하지 않음", async () => { const r = await supplyApiClinic(client("S"), new Request(n)); expect(r).toBeInstanceOf(Response); expect((r as Response).status).toBe(403); });
  it.each([null, "X"])("미확인 매핑 %s 차단", async data => { expect(((await supplyApiClinic(client(data), new Request(s))) as Response).status).toBe(403); });
  it("RPC 오류도 기본 병원으로 돌아가지 않음", async () => { expect(((await supplyApiClinic(client("N", { message: "offline" }), new Request(n))) as Response).status).toBe(403); });
  it("쿼리로 다른 병원을 요청해도 차단", async () => { expect(((await supplyApiClinic(client("S"), new Request(s + "?clinic=N"))) as Response).status).toBe(403); });
  it("잘못된 병원 구분 차단", async () => { expect(((await supplyApiClinic(client("S"), new Request(s + "?clinic=X"))) as Response).status).toBe(400); });
  it("미리보기 주소도 실제 매핑만 사용", async () => { await expect(supplyApiClinic(client("N"), new Request("https://preview.invalid/api/supplies?clinic=N"))).resolves.toBe("N"); });
});
