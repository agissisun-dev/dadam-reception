import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CabinetItem, LedgerCode } from "./types";

const mocks = vi.hoisted(() => ({
  ledgerItems: [] as Array<Record<string, unknown>>,
  codes: [] as Array<Record<string, unknown>>,
  recordOut: vi.fn(async (_input: Record<string, unknown>) => ({ id: 900 })),
}));

vi.mock("./supabaseClient", () => ({
  getSupabase: () => ({
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      for (const method of ["select", "is", "gte", "update", "eq"]) {
        query[method] = (..._args: unknown[]) => query;
      }
      query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
        data: table === "ledger_items" ? mocks.ledgerItems : mocks.codes,
        error: null,
      }));
      return query;
    },
  }),
}));
vi.mock("./cabinet", () => ({ recordOut: mocks.recordOut }));

import { backfillFromLedger } from "./cabinetBackfill";

const cabinetItem: CabinetItem = {
  id: 1, name: "감기약", kind: "medicine", min_stock: 0, active: true,
  sort_order: 1, clinic: null, unit: "개", created_at: "2026-01-01",
};
const insuredItem: CabinetItem = { ...cabinetItem, id: 2, name: "보험엑스제", kind: "insured", clinic: "S", unit: "포" };

function ledgerRow(id: number, group: string, name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id, entry_id: id, code: "", name, group, qty: 1, amount: null, days: null,
    split: null, raw: "", prescription_id: null, cabinet_move_id: null,
    created_at: "2026-01-01",
    entry: { id, day: "2026-01-02", seq: id, patient_id: null, patient_name: "테스트", kind: "normal" },
    ...extra,
  };
}

beforeEach(() => {
  mocks.ledgerItems = [];
  mocks.codes = [];
  mocks.recordOut.mockClear();
  mocks.recordOut.mockImplementation(async () => ({ id: 900 }));
});

describe("backfillFromLedger group matching", () => {
  it("skips an extract row with the same name as a medicine and does not record an out", async () => {
    mocks.ledgerItems = [ledgerRow(1, "extract", cabinetItem.name)];
    const result = await backfillFromLedger(cabinetItem, "2026-01-01", "직원");
    expect(result).toEqual({ applied: 0, qty: 0 });
    expect(mocks.recordOut).not.toHaveBeenCalled();
  });

  it("backfills one cabinet row with the same name", async () => {
    mocks.ledgerItems = [ledgerRow(1, "cabinet", cabinetItem.name)];
    const result = await backfillFromLedger(cabinetItem, "2026-01-01", "직원");
    expect(result).toEqual({ applied: 1, qty: 1 });
    expect(mocks.recordOut).toHaveBeenCalledTimes(1);
  });

  it("converts insured extract days by per_day and skips cabinet rows", async () => {
    mocks.ledgerItems = [
      ledgerRow(1, "extract", insuredItem.name, { days: 4 }),
      ledgerRow(2, "cabinet", insuredItem.name, { days: 9 }),
    ];
    mocks.codes = [{ id: 1, code: "", name: insuredItem.name, group: "extract", cabinet_item_id: null, decoction_kind: null, per_day: 3, active: true, sort_order: 1, created_at: "2026-01-01" } satisfies LedgerCode];
    const result = await backfillFromLedger(insuredItem, "2026-01-01", "직원");
    expect(result).toEqual({ applied: 1, qty: 12 });
    expect(mocks.recordOut).toHaveBeenCalledTimes(1);
    expect(mocks.recordOut).toHaveBeenCalledWith(expect.objectContaining({ item_id: insuredItem.id, qty: 12 }));
  });
});
