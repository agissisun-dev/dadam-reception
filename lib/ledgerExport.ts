import { listMonthEntries, listRangeEntries, loadDay } from "./ledger";
import { addDays } from "./dates";
import { monthRows, splitByMonth, type DayBlock, type DayBlockInput } from "./ledgerExportRules";

/** 셀 배열을 엑셀 파일로 만들어 내려받는다(브라우저). exceljs는 쓸 때만 불러온다. 합계에서 뺀 줄은 붉은 글씨. */
async function downloadRows(block: DayBlock, sheetName: string, fileName: string): Promise<void> {
  await downloadSheets([{ sheet: sheetName, block }], fileName);
}

/** 시트 여러 장(기간 내려받기는 달마다 한 장) */
async function downloadSheets(sheets: { sheet: string; block: DayBlock }[], fileName: string): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  for (const { sheet, block } of sheets) {
    const ws = wb.addWorksheet(sheet);
    ws.columns = [
      { width: 5 }, { width: 12 }, { width: 9 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 34 }, { width: 14 }, { width: 11 },
    ];
    for (const r of block.rows) ws.addRow(r.map((c) => (c === null ? undefined : c)));
    const red = new Set(block.redRows.map((i) => i + 1)); // 엑셀 행은 1부터
    ws.eachRow((row, rowNumber) => {
      row.eachCell((cell, col) => {
        if (col >= 4 && col <= 7) cell.numFmt = "#,##0";
        if (col === 10) cell.numFmt = "#,##0";
        if (red.has(rowNumber) && col >= 4 && col <= 7) cell.font = { color: { argb: "FFC00000" } };
      });
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function groupByDay(data: Awaited<ReturnType<typeof listMonthEntries>>): DayBlockInput[] {
  const map = new Map<string, DayBlockInput>();
  const get = (day: string) => {
    let d = map.get(day);
    if (!d) {
      d = { day, entries: [], expenses: [] };
      map.set(day, d);
    }
    return d;
  };
  for (const e of data.entries) get(e.day).entries.push(e);
  for (const x of data.expenses) get(x.day).expenses.push(x);
  return [...map.values()];
}

/** 한 달 전체. monthKey = "2026-10" */
export async function downloadMonthExcel(monthKey: string): Promise<void> {
  const data = await listMonthEntries(monthKey);
  const block = monthRows(groupByDay(data));
  if (block.rows.length === 0) throw new Error("이 달에는 적은 줄이 없습니다.");
  await downloadRows(block, `${Number(monthKey.slice(5))}월`, `일일장부_${monthKey}.xlsx`);
}

/** 기간(from~to, 둘 다 포함). 달마다 시트 한 장. 몰아서 볼 때(사용자 2026-11-04). */
export async function downloadRangeExcel(from: string, to: string): Promise<void> {
  if (!from || !to) throw new Error("시작일과 끝날을 골라 주세요.");
  if (from > to) throw new Error("시작일이 끝날보다 뒤입니다.");
  const data = await listRangeEntries(from, addDays(to, 1));
  const sheets = splitByMonth(groupByDay(data));
  if (sheets.length === 0) throw new Error("이 기간에는 적은 줄이 없습니다.");
  await downloadSheets(sheets, `일일장부_${from}_${to}.xlsx`);
}

/** 하루만 */
export async function downloadDayExcel(day: string): Promise<void> {
  const d = await loadDay(day);
  const block = monthRows([{ day, entries: d.entries, expenses: d.expenses }]);
  if (block.rows.length === 0) throw new Error("이날에는 적은 줄이 없습니다.");
  await downloadRows(block, day, `일일장부_${day}.xlsx`);
}
