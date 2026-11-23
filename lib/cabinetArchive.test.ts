import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ calls: [] as Array<{ table: string; method: string; args: unknown[] }>, error: null as null | { message: string }, items: [] as Record<string, unknown>[], moves: [] as Record<string, unknown>[] }));
vi.mock("./supabaseClient", () => ({ getSupabase: () => ({ from: (table: string) => {
  const q: Record<string, unknown> = {};
  const filters: Array<[string, unknown]> = [];
  for (const method of ["select", "order", "eq", "range", "insert", "update", "delete", "single"]) q[method] = (...args: unknown[]) => { db.calls.push({ table, method, args }); if (method === "eq") filters.push([String(args[0]), args[1]]); if (method === "single") return Promise.resolve({ data: null, error: db.error }); return q; };
  q.then = (resolve: (v: unknown) => unknown) => resolve({ data: (table === "cabinet_items" ? db.items : db.moves).filter(row => filters.every(([key, value]) => row[key] === value)), error: db.error });
  return q;
} }) }));
import { archiveCabinetItem, deleteCabinetItem, loadCabinet, restoreCabinetItem } from "./cabinet";

const active = { id: 1, name: "활성", kind: "medicine", min_stock: 0, active: true, sort_order: 1, clinic: null, unit: "개", created_at: "2026-01-01" };
const inactive = { ...active, id: 2, name: "보관", active: false, sort_order: 2 };
const move = { id: 10, item_id: 2, kind: "in", qty: 7, expiry: null, purpose: null, patient_id: null, patient_name: null, staff_name: "테스트", memo: null, diff: null, created_at: "2026-01-02" };
beforeEach(() => { db.calls.length = 0; db.error = null; db.items = [active, inactive]; db.moves = [move]; });

describe("cabinet archive lifecycle", () => {
  it("keeps inactive items and all moves in load results, but excludes inactive from statuses", async () => {
    const result = await loadCabinet();
    expect(result.items).toEqual([active, inactive]);
    expect(db.calls.some(c => c.table === "cabinet_items" && c.method === "eq" && c.args[0] === "active")).toBe(false);
    expect(result.moves).toEqual([move]);
    expect(result.statuses.map(x => x.item.id)).toEqual([1]);
    expect(result.statuses[0].stock).toBe(0);
  });
  it.each([[archiveCabinetItem, false], [restoreCabinetItem, true], [deleteCabinetItem, false]] as const)("updates active=%s without destructive or inventory mutations", async (fn, activeValue) => {
    await fn(2);
    expect(db.calls).toContainEqual({ table: "cabinet_items", method: "update", args: [{ active: activeValue }] });
    expect(db.calls).toContainEqual({ table: "cabinet_items", method: "eq", args: ["id", 2] });
    expect(db.calls.some(c => c.method === "delete")).toBe(false);
    expect(db.calls.some(c => c.table === "cabinet_moves" && ["insert", "update", "delete"].includes(c.method))).toBe(false);
    expect(db.calls.filter(c => c.table === "cabinet_items" && c.method === "update")).toHaveLength(1);
  });
  it.each([archiveCabinetItem, restoreCabinetItem])("propagates update errors", async fn => {
    db.error = { message: "offline" };
    await expect(fn(2)).rejects.toThrow("offline");
  });
});
