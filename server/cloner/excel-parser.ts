import * as XLSX from "xlsx";
import type { ExcelSheet, ParsedExcel } from "../../shared/types.js";

/**
 * Parse an uploaded .xlsx workbook into a plain structure.
 *
 * Each sheet's `rows` includes the header as `rows[0]` so the data can be written
 * straight to a Google Sheet starting at cell A1; `headers` duplicates that first
 * row for convenience. Every cell is coerced to a string.
 */
export function parseExcel(
  buffer: Buffer,
  options: { maxRowsPerSheet?: number; fileName?: string } = {}
): ParsedExcel {
  const maxRows = options.maxRowsPerSheet ?? 10000;
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheets: ExcelSheet[] = [];

  for (const name of workbook.SheetNames) {
    const worksheet = workbook.Sheets[name];
    if (!worksheet) {
      sheets.push({ name, headers: [], rows: [], rowCount: 0 });
      continue;
    }

    const raw = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false, defval: "" });
    const rows: string[][] = raw
      .slice(0, maxRows)
      .map((row) => (Array.isArray(row) ? row.map((cell) => (cell == null ? "" : String(cell))) : []));
    const headers = rows[0] ?? [];

    sheets.push({ name, headers, rows, rowCount: rows.length });
  }

  return {
    fileName: options.fileName ?? "upload.xlsx",
    sheetCount: sheets.length,
    sheets
  };
}
