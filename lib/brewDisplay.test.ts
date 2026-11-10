import { describe, expect, it } from "vitest";
import { brewCardColors, clinicMark, isFermentKind, layoutBrewSections } from "./brewDisplay";
import { dayCounts, layoutWeek, weekDays, type WeekRow } from "./brewRules";
import type { BrewJob } from "./types";

const days = weekDays("2026-10-05");
const nextDays = weekDays("2026-10-12");
const job = (id: number, patch: Partial<BrewJob> = {}): BrewJob => ({
  id, day: "2026-10-06", slot: "am", kind: "decoction", patient_id: null,
  patient_name: `환자${id}`, title: "탕약", delivery: null, region: null, pouch: null,
  split_no: null, split_of: null, memo: null, max_jobs: null, status: "planned",
  done_at: null, done_by: null, receive_day: null, prescription_id: null,
  ledger_entry_id: null, pair_id: null, sort_order: 0, staff_name: "",
  created_at: "2026-10-01T09:00:00Z", updated_at: "2026-10-01T09:00:00Z", ...patch,
});
const pair = (id: number, startDay: string, endDay: string, patch: Partial<BrewJob> = {}): BrewJob[] => [
  job(id, { ...patch, kind: "ferment_start", day: startDay, pair_id: id + 1 }),
  job(id + 1, { ...patch, kind: "ferment_end", day: endDay, pair_id: id }),
];
const ids = (rows: WeekRow[]): number[] => rows.flatMap((row) =>
  row.flatMap((cell) => cell?.type === "job" ? [cell.job.id] : []));
const phases = (row: WeekRow): (string | null)[] => row.map((cell) =>
  !cell ? null : cell.type === "mid" ? "mid" : cell.job.kind);
const rowFor = (rows: WeekRow[], id: number): number => rows.findIndex((row) =>
  row.some((cell) => cell?.type === "job" && cell.job.id === id));

describe("brew display colors and marks", () => {
  it("maps S/default to S and database N to visible D", () => {
    expect(clinicMark()).toBe("S");
    expect(clinicMark("S")).toBe("S");
    expect(clinicMark("N")).toBe("D");
  });
  it("identifies only the two persisted fermentation phases", () => {
    expect(isFermentKind("ferment_start")).toBe(true);
    expect(isFermentKind("ferment_end")).toBe(true);
    for (const kind of ["decoction", "batch", "note"] as const) expect(isFermentKind(kind)).toBe(false);
  });
  it("uses green S/default, blue N and the same dark ink for ordinary jobs", () => {
    expect(brewCardColors(job(1))).toEqual({ borderWidth: 2, borderLeftWidth: 4, borderColor: "#16a34a", background: "#f0fdf4", color: "#172022" });
    expect(brewCardColors(job(2, { clinic: "S", kind: "batch" }))).toEqual(brewCardColors(job(1)));
    expect(brewCardColors(job(3, { clinic: "N" }))).toEqual({ borderWidth: 2, borderLeftWidth: 4, borderColor: "#2563eb", background: "#eff6ff", color: "#172022" });
  });
  it("keeps both fermentation phases red for both clinics, even when done", () => {
    for (const clinic of ["S", "N"] as const) {
      for (const kind of ["ferment_start", "ferment_end"] as const) {
        for (const status of ["planned", "done"] as const) {
          expect(brewCardColors({ clinic, kind, status })).toEqual({
            borderWidth: 2, borderLeftWidth: 4, borderColor: "#dc2626", background: "#fff1f2", color: status === "done" ? "#78716c" : "#172022",
          });
        }
      }
    }
  });
  it("uses yellow notes and existing gray completed ordinary cards without changing their mark", () => {
    for (const clinic of ["S", "N"] as const) {
      expect(brewCardColors(job(1, { clinic, kind: "note" }))).toEqual({ borderWidth: 2, borderLeftWidth: 4, borderColor: "#ca8a04", background: "#fefce8", color: "#172022" });
      const done = job(2, { clinic, status: "done" });
      expect(brewCardColors(done)).toEqual({ borderWidth: 2, borderLeftWidth: 4, borderColor: "#a8a29e", background: "#e7e5e4", color: "#78716c" });
      expect(clinicMark(done.clinic)).toBe(clinic === "N" ? "D" : "S");
    }
  });
  it("lets a virtual mid reuse the originating fermentation style", () => {
    const jobs = pair(10, "2026-10-06", "2026-10-08", { clinic: "N" });
    const mid = layoutBrewSections(days, jobs).fermented[0][2];
    expect(mid?.type).toBe("mid");
    if (mid?.type === "mid") {
      expect(clinicMark(mid.clinic)).toBe("D");
      expect(brewCardColors({ kind: "ferment_start", clinic: mid.clinic, status: "planned" })).toEqual(brewCardColors(jobs[0]));
    }
  });
});

describe("layoutBrewSections", () => {
  it("excludes fermentation from general AM/PM and otherwise preserves layoutWeek", () => {
    const ordinary = [job(1), job(2, { slot: "pm", kind: "batch" }), job(3, { kind: "note" })];
    const jobs = [...ordinary, ...pair(10, "2026-10-06", "2026-10-08")];
    const result = layoutBrewSections(days, jobs);
    expect(result.general).toEqual(layoutWeek(days, ordinary));
    expect(ids([...result.general.am, ...result.general.pm]).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(ids(result.fermented)).toEqual([10, 11]);
  });
  it("places start/mid/end on one row despite mixed AM/PM slots", () => {
    const jobs = pair(10, "2026-10-06", "2026-10-08", { slot: "pm" });
    jobs[1].slot = "am";
    const rows = layoutBrewSections(days, jobs).fermented;
    expect(rows).toHaveLength(1);
    expect(phases(rows[0])).toEqual([null, "ferment_start", "mid", "ferment_end", null, null]);
    expect(jobs.map((j) => j.slot)).toEqual(["pm", "am"]);
  });
  it("packs same-day new insertions above old ones in bottom-first order, not by array or day order", () => {
    const oldest = pair(30, "2026-10-08", "2026-10-10", { created_at: "2026-09-01T00:00:00Z" });
    const newer = pair(10, "2026-10-06", "2026-10-08", { created_at: "2026-09-02T00:00:00Z" });
    const newest = pair(20, "2026-10-06", "2026-10-08", { created_at: "2026-09-03T00:00:00Z" });
    const original = layoutBrewSections(days, [...newer, ...oldest]).fermented;
    const all = [...newest, ...newer, ...oldest];
    const rows = layoutBrewSections(days, all).fermented;
    expect(rows[0]).toEqual(original[0]);
    expect(rows[1]).toEqual(original[1]);
    expect([rowFor(rows, 30), rowFor(rows, 10), rowFor(rows, 20)]).toEqual([0, 1, 2]);
    expect(layoutBrewSections(days, [...all].reverse()).fermented).toEqual(rows);
  });
  it("breaks creation-time ties by id and first-fits nonoverlapping families into the bottom row", () => {
    const jobs = [...pair(20, "2026-10-06", "2026-10-08"), ...pair(10, "2026-10-06", "2026-10-08"), ...pair(30, "2026-10-09", "2026-10-10")];
    const rows = layoutBrewSections(days, jobs).fermented;
    expect(rows).toHaveLength(2);
    expect([rowFor(rows, 10), rowFor(rows, 20), rowFor(rows, 30)]).toEqual([0, 1, 0]);
  });
  it("preserves the same family row across two weeks, including blank leading rows", () => {
    const jobs = [...pair(10, "2026-10-08", "2026-10-10"), ...pair(20, "2026-10-09", "2026-10-13", { slot: "pm" })];
    const first = layoutBrewSections(days, jobs).fermented;
    const second = layoutBrewSections(nextDays, jobs).fermented;
    expect(rowFor(first, 20)).toBe(1);
    expect(rowFor(second, 21)).toBe(1);
    expect(second[0]).toEqual(nextDays.map(() => null));
    expect(phases(second[1])).toEqual(["mid", "ferment_end", null, null, null, null]);
    expect(ids([...first, ...second]).sort((a, b) => a - b)).toEqual([10, 11, 20, 21]);
    expect(ids(layoutBrewSections([...days, ...nextDays], jobs).fermented).sort((a, b) => a - b)).toEqual([10, 11, 20, 21]);
  });
  it("renders a mid even when both real endpoints fall outside the requested week", () => {
    const rows = layoutBrewSections(days, pair(10, "2026-10-03", "2026-10-12")).fermented;
    expect(rows).toHaveLength(1);
    expect(phases(rows[0])).toEqual(days.map(() => "mid"));
    expect(ids(rows)).toEqual([]);
  });
  it("supports one-way pair links in either direction without duplicate endpoints", () => {
    for (const missingLink of [0, 1]) {
      const jobs = pair(10, "2026-10-06", "2026-10-08");
      jobs[missingLink].pair_id = null;
      const rows = layoutBrewSections(days, jobs.reverse()).fermented;
      expect(rows).toHaveLength(1);
      expect(ids(rows)).toEqual([10, 11]);
      expect(phases(rows[0])).toEqual([null, "ferment_start", "mid", "ferment_end", null, null]);
    }
  });
  it("handles missing partners, null dates, standalone ends, and done jobs without inventing actual jobs", () => {
    const jobs = [
      job(1, { kind: "ferment_start", day: null }),
      job(2, { kind: "ferment_start", day: "2026-10-08", pair_id: 999 }),
      job(3, { kind: "ferment_end", day: "2026-10-10", status: "done" }),
      ...pair(10, "2026-10-06", "2026-10-08", { status: "done" }),
      job(20, { day: null }),
    ];
    const result = layoutBrewSections(days, jobs);
    expect(ids(result.fermented).sort((a, b) => a - b)).toEqual([2, 3, 10, 11]);
    expect(result.fermented.flat().some((cell) => cell?.type === "mid" && cell.jobId === 2)).toBe(true);
    expect(result.general).toEqual({ am: [], pm: [] });
  });
  it("handles a null-date half-pair without dropping its dated partner", () => {
    const jobs = pair(10, "2026-10-06", "2026-10-08");
    jobs[0].day = null;
    expect(ids(layoutBrewSections(days, jobs).fermented)).toEqual([11]);
    jobs[0].day = "2026-10-06";
    jobs[1].day = null;
    const rows = layoutBrewSections(days, jobs).fermented;
    expect(ids(rows)).toEqual([10]);
    expect(phases(rows[0])).toEqual([null, "ferment_start", "mid", null, null, null]);
  });
  it("does not overwrite either job if a malformed pair has the same date", () => {
    const rows = layoutBrewSections(days, pair(10, "2026-10-06", "2026-10-06")).fermented;
    expect(rows).toHaveLength(2);
    expect(ids(rows)).toEqual([10, 11]);
  });
  it("returns empty exact-shaped sections for empty or wholly unscheduled inputs", () => {
    const empty = { general: { am: [], pm: [] }, fermented: [] };
    expect(layoutBrewSections(days, [])).toEqual(empty);
    expect(layoutBrewSections([], pair(10, "2026-10-06", "2026-10-08"))).toEqual(empty);
    expect(layoutBrewSections(days, [job(1, { kind: "ferment_start", day: null }), job(2, { day: null })])).toEqual(empty);
  });
  it("does not mutate frozen input data or change day counters", () => {
    const jobs = [...pair(10, "2026-10-06", "2026-10-08"), job(1), job(2, { kind: "batch" }), job(3, { kind: "note", max_jobs: 0 })];
    const snapshot = JSON.stringify(jobs);
    const before = dayCounts(jobs, undefined);
    const frozenDays = [...days];
    jobs.forEach((j) => Object.freeze(j));
    Object.freeze(jobs);
    Object.freeze(frozenDays);
    layoutBrewSections(frozenDays, jobs);
    expect(JSON.stringify(jobs)).toBe(snapshot);
    expect(frozenDays).toEqual(days);
    expect(dayCounts(jobs, undefined)).toEqual(before);
    expect(before).toEqual({ brew: 2, press: 1, batch: 1, max: 0 });
  });
});
