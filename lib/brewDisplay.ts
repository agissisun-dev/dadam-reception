import { fermentEndDay, layoutWeek, type WeekCell, type WeekRow } from "./brewRules";
import { addDays } from "./dates";
import type { BrewJob, BrewKind } from "./types";

/** Public display mark: the database's N clinic is shown as D. */
export function clinicMark(clinic?: "S" | "N"): "S" | "D" {
  return clinic === "N" ? "D" : "S";
}

export function isFermentKind(kind: BrewKind): boolean {
  return kind === "ferment_start" || kind === "ferment_end";
}

/** Mid cells use kind: "ferment_start" and their originating job's status. */
export function brewCardColors(job: Pick<BrewJob, "kind" | "clinic" | "status">): {
  borderColor: string; background: string; color: string; borderWidth?: number; borderLeftWidth?: number;
} {
  const border = { borderWidth: 2, borderLeftWidth: 4 };
  const color = job.status === "done" ? "#78716c" : "#172022";
  // Fermentation stays red even when completed, regardless of clinic.
  if (isFermentKind(job.kind)) return { ...border, borderColor: "#dc2626", background: "#fff1f2", color };
  if (job.kind === "note") return { ...border, borderColor: "#ca8a04", background: "#fefce8", color };
  if (job.status === "done") return { ...border, borderColor: "#a8a29e", background: "#e7e5e4", color };
  return job.clinic === "N"
    ? { ...border, borderColor: "#2563eb", background: "#eff6ff", color }
    : { ...border, borderColor: "#16a34a", background: "#f0fdf4", color };
}

const oldestFirst = (a: BrewJob, b: BrewJob): number =>
  a.created_at.localeCompare(b.created_at) || a.id - b.id;

/**
 * General jobs keep layoutWeek's AM/PM behavior. Fermentation rows are bottom-first
 * for flex-col-reverse, independent of slot and requested days. Pass the same full
 * jobs collection for adjacent weeks to keep the same absolute row across weeks.
 * Leading empty rows intentionally preserve those row numbers. Trailing empty rows
 * are removed. Null-date jobs remain unscheduled, not rendered in a dated grid.
 * No input jobs, counters, dates, or persisted pairing fields are changed.
 */
export function layoutBrewSections(days: string[], jobs: BrewJob[]): {
  general: { am: WeekRow[]; pm: WeekRow[] }; fermented: WeekRow[];
} {
  const general = layoutWeek(days, jobs.filter((job) => !isFermentKind(job.kind)));
  if (!days.length) return { general, fermented: [] };
  const fermentation = jobs.filter((job) => isFermentKind(job.kind)).sort(oldestFirst);
  const byId = new Map(fermentation.map((job) => [job.id, job]));
  const handled = new Set<number>();
  const families: BrewJob[][] = [];

  // Resolve both ordinary reciprocal pairs and historical one-way references.
  for (const start of fermentation.filter((job) => job.kind === "ferment_start")) {
    if (handled.has(start.id)) continue;
    const direct = start.pair_id == null ? undefined : byId.get(start.pair_id);
    const end = direct?.kind === "ferment_end" && !handled.has(direct.id)
      ? direct
      : fermentation.find((job) => job.kind === "ferment_end" && job.pair_id === start.id && !handled.has(job.id));
    const family = end ? [start, end] : [start];
    family.forEach((job) => handled.add(job.id));
    families.push(family);
  }
  for (const job of fermentation) {
    if (!handled.has(job.id)) families.push([job]);
  }
  families.sort((a, b) => oldestFirst([...a].sort(oldestFirst)[0], [...b].sort(oldestFirst)[0]));

  // Allocate on the complete calendar before projecting onto a week. Allocating
  // only visible cells would make a continued family jump rows next Monday.
  const occupied: Map<string, WeekCell>[] = [];
  for (const family of families) {
    const cells = new Map<string, WeekCell[]>();
    const append = (day: string, cell: WeekCell) => {
      const list = cells.get(day) ?? [];
      list.push(cell);
      cells.set(day, list);
    };
    for (const job of family) {
      if (job.day) append(job.day, { type: "job", job });
    }
    const start = family.find((job) => job.kind === "ferment_start");
    const end = family.find((job) => job.kind === "ferment_end");
    if (start?.day) {
      const endDay = end?.day ?? fermentEndDay(start.day);
      for (let day = addDays(start.day, 1); day < endDay; day = addDays(day, 1)) {
        append(day, { type: "mid", jobId: start.id, label: start.patient_name || start.title, clinic: start.clinic ?? "S" });
      }
    }
    // Normal pairs occupy one layer. If malformed data puts both actual jobs on
    // one day, use an overflow row rather than overwrite or drop either job.
    let firstRow = 0;
    while (cells.size) {
      let row = firstRow;
      while (occupied[row] && [...cells.keys()].some((day) => occupied[row].has(day))) row++;
      if (!occupied[row]) occupied[row] = new Map();
      for (const [day, list] of cells) {
        occupied[row].set(day, list.shift()!);
        if (!list.length) cells.delete(day);
      }
      firstRow = row + 1;
    }
  }
  const fermented = occupied.map((row): WeekRow => days.map((day) => row.get(day) ?? null));
  while (fermented.length && fermented[fermented.length - 1].every((cell) => cell === null)) fermented.pop();
  return { general, fermented };
}
