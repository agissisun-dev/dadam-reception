import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteEntry } from "./ledger";
import type { CabinetItem, CabinetMove, LedgerEntryWithItems, LedgerItem } from "./types";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), recordIn: vi.fn(), deleteJobs: vi.fn(), writes: vi.fn() }));
vi.mock("./supabaseClient", () => ({ getSupabase: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("./cabinet", async (importOriginal) => ({ ...await importOriginal<Record<string, unknown>>(), recordIn: mocks.recordIn }));
vi.mock("./brew", () => ({ createJobs: vi.fn(), deleteJobsOfEntry: mocks.deleteJobs }));

type Move = Pick<CabinetMove, "id" | "item_id" | "kind" | "qty">;
type Item = Pick<CabinetItem, "id" | "kind" | "clinic" | "legacy_shared">;
const moves = new Map<number, Move>();
const items = new Map<number, Item>();
const initialized = new Set<number>();
const errors = new Map<string, string>();
const events: string[] = [];

function line(id: number, moveId: number | null, group: LedgerItem["group"] = "cabinet", qty = 2): LedgerItem {
  return { id, entry_id: 50, code: "remapped-code", name: "fixture", group, qty, amount: null, days: 2, split: null, raw: "fixture", prescription_id: null, cabinet_move_id: moveId, created_at: "2026-11-17T00:00:00Z" };
}
function entry(lines: LedgerItem[]): LedgerEntryWithItems {
  return { id: 50, day: "2026-11-17", seq: 3, patient_id: null, patient_name: "fixture", insurance_kind: null, cash: 0, cash_receipt: 0, card: 0, note_raw: "", memo: null, staff_name: "test", kind: "normal", corrects_id: null, correction_reason: null, packs_missing: false, off_total: false, pay_note: null, created_at: "2026-11-17T00:00:00Z", updated_at: "2026-11-17T00:00:00Z", items: lines, prescriptions: [] };
}
function original(moveId: number, itemId: number, kind: Item["kind"] = "medicine", clinic: Item["clinic"] = null, qty = 2) {
  moves.set(moveId, { id: moveId, item_id: itemId, kind: "out", qty });
  items.set(itemId, { id: itemId, kind, clinic, legacy_shared: false });
}
function noWrites() {
  expect(mocks.recordIn).not.toHaveBeenCalled();
  expect(mocks.deleteJobs).not.toHaveBeenCalled();
  expect(mocks.writes).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  moves.clear(); items.clear(); initialized.clear(); errors.clear(); events.length = 0;
  mocks.rpc.mockResolvedValue({ data: "S", error: null });
  mocks.recordIn.mockImplementation(async () => { events.push("recordIn"); return { id: 900 }; });
  mocks.deleteJobs.mockResolvedValue(undefined);
  mocks.from.mockImplementation((table: string) => {
    const filters = new Map<string, unknown>();
    let write: string | null = null;
    const resolve = () => {
      if (write) { mocks.writes(table, write); events.push(write + ":" + table); return { data: null, error: null }; }
      let key = table;
      let data: unknown = [];
      if (table === "prescriptions") data = [{ id: 60, happy_calls: [] }];
      else if (table === "cabinet_moves" && filters.get("kind") === "count") {
        key = "count:" + filters.get("item_id");
        data = initialized.has(filters.get("item_id") as number) ? [{ id: 800 }] : [];
      } else if (table === "cabinet_moves") {
        key = "move:" + filters.get("id");
        data = moves.get(filters.get("id") as number) ?? null;
      } else if (table === "cabinet_items") {
        key = "item:" + filters.get("id");
        data = items.get(filters.get("id") as number) ?? null;
      } else if (table !== "ledger_entries") throw new Error("Unexpected table: " + table);
      events.push(key);
      return { data, error: errors.has(key) ? { message: errors.get(key)! } : null };
    };
    const builder = {
      select: vi.fn(), eq: vi.fn(), in: vi.fn(), gt: vi.fn(), order: vi.fn(), limit: vi.fn(),
      delete: vi.fn(), update: vi.fn(), maybeSingle: vi.fn(),
      then: (onfulfilled: (value: ReturnType<typeof resolve>) => unknown, onrejected?: (reason: unknown) => unknown) => Promise.resolve(resolve()).then(onfulfilled, onrejected),
    };
    for (const method of ["select", "in", "gt", "order", "limit"] as const) builder[method].mockReturnValue(builder);
    builder.eq.mockImplementation((key: string, value: unknown) => { filters.set(key, value); return builder; });
    builder.delete.mockImplementation(() => { write = "delete"; return builder; });
    builder.update.mockImplementation(() => { write = "update"; return builder; });
    builder.maybeSingle.mockImplementation(async () => resolve());
    return builder;
  });
  original(11, 101);
});

describe("deleteEntry resolves every original movement before any reversal or delete", () => {
  it("ordinary medicine first, legacy archive last: no returns, brew changes or deletes", async () => {
    original(12, 102, "supply");
    items.set(102, { id: 102, kind: "supply", clinic: null, legacy_shared: true });
    await expect(deleteEntry(entry([line(1, 11), line(2, 12)]), "test")).rejects.toThrow("분리 전 공용 기록은 재고 귀속 확인 후 원장 검토 정정");
    noWrites();
    expect(events).toContain("move:11"); expect(events).toContain("item:102");
    expect(mocks.from.mock.calls.some(([table]) => table === "ledger_codes")).toBe(false);
  });
  it.each(["move:12", "item:102"])("lookup error at %s after valid medicine fails closed", async (key) => {
    original(12, 102); errors.set(key, "lookup offline");
    await expect(deleteEntry(entry([line(1, 11), line(2, 12)]), "test")).rejects.toThrow("lookup offline");
    noWrites();
  });
  it.each(["move", "item", "item-fk"])("missing original %s after valid medicine fails closed", async (missing) => {
    original(12, 102);
    if (missing === "move") moves.delete(12);
    if (missing === "item") items.delete(102);
    if (missing === "item-fk") moves.set(12, { id: 12, item_id: null as unknown as number, kind: "out", qty: 2 });
    await expect(deleteEntry(entry([line(1, 11), line(2, 12)]), "test")).rejects.toThrow("찾을 수 없어");
    noWrites();
  });
  it("even a movement FK on a non-stock group is checked for archive before writes", async () => {
    original(12, 102, "supply");
    items.set(102, { id: 102, kind: "supply", clinic: null, legacy_shared: true });
    await expect(deleteEntry(entry([line(1, 11), line(2, 12, "other")]), "test")).rejects.toThrow("분리 전 공용 기록");
    noWrites();
  });
  it.each([null, "N"] as const)("unresolved/wrong clinic %s cannot cause partial return", async (clinic) => {
    if (clinic === null) mocks.rpc.mockResolvedValue({ data: null, error: null });
    original(12, 102, "insured", "N", 6);
    await expect(deleteEntry(entry([line(1, 11), line(2, 12, "extract")]), "test")).rejects.toThrow("병원");
    noWrites();
  });
  it.each(["missing count", "count error"])("private supply %s is detected before ordinary stock return", async (failure) => {
    original(12, 102, "supply", "S");
    if (failure === "count error") errors.set("count:102", "count offline");
    await expect(deleteEntry(entry([line(1, 11), line(2, 12)]), "test")).rejects.toThrow(failure === "count error" ? "count offline" : "초기 수량 미등록");
    noWrites();
  });
  it.each([0, NaN])("invalid later extract quantity %s fails before any write", async (qty) => {
    original(12, 102, "insured", "S", qty);
    await expect(deleteEntry(entry([line(1, 11), line(2, 12, "extract")]), "test")).rejects.toThrow("수량");
    noWrites();
  });
  it.each(["S", "N"] as const)("allowed %s flow uses original FK and actual extract qty, not remapped code", async (clinic) => {
    mocks.rpc.mockResolvedValue({ data: clinic, error: null });
    original(12, 102, "insured", clinic, 9); original(13, 103, "supply", clinic, 4); initialized.add(103);
    await deleteEntry(entry([line(1, 11, "cabinet", 2), line(2, 12, "extract", 999), line(3, 13, "cabinet", 4)]), "test");
    expect(mocks.recordIn.mock.calls.map(([input]) => [input.item_id, input.qty])).toEqual([[101, 2], [102, 9], [103, 4]]);
    expect(mocks.recordIn).toHaveBeenNthCalledWith(2, expect.objectContaining({ item_id: 102, qty: 9, expiry: null, staff_name: "test" }));
    expect(events.indexOf("count:103")).toBeLessThan(events.indexOf("recordIn"));
    expect(events.indexOf("item:103")).toBeLessThan(events.indexOf("recordIn"));
    expect(mocks.deleteJobs).toHaveBeenCalledExactlyOnceWith(50);
    expect(mocks.writes.mock.calls).toEqual([["prescriptions", "delete"], ["ledger_entries", "delete"]]);
    expect(mocks.from.mock.calls.some(([table]) => table === "ledger_codes")).toBe(false);
  });
  it("unlinked legacy notes delete normally without inventing stock attribution", async () => {
    await deleteEntry(entry([line(1, null)]), "test");
    expect(mocks.recordIn).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.deleteJobs).toHaveBeenCalledExactlyOnceWith(50);
    expect(mocks.writes.mock.calls).toEqual([["prescriptions", "delete"], ["ledger_entries", "delete"]]);
  });
});
