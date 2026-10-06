import * as XLSX from "xlsx";

/** A live Excel formula cell, e.g. { f: "D2/B2", z: "0.0%", v: 0.25 }. `v` is the cached value shown by viewers that do not recalculate. */
export interface FormulaCell { f: string; v?: string | number; t?: "n" | "s"; z?: string }
export type Cell = string | number | null | FormulaCell;
const isFormula = (c: Cell): c is FormulaCell => c != null && typeof c === "object" && "f" in c;

export interface SheetSpec {
  /** Tab name (Excel truncates to 31 chars; avoid []:*?/\). */
  name: string;
  /** Array-of-arrays, including the header row. Cells may be plain values or `{ f: "..." }` formulas. */
  rows: Cell[][];
  /** Optional merged-cell ranges (0-indexed), e.g. grouped two-row headers. */
  merges?: { s: { r: number; c: number }; e: { r: number; c: number } }[];
}

/**
 * Build a multi-sheet .xlsx from array-of-arrays and return it base64-encoded, so a Server Action
 * can hand the workbook to the browser for download (client decodes with lib/download → Blob).
 * Cells may be live formulas (`{ f, z? }`) - written as real Excel formulas so the sheet recalculates
 * when opened (SheetJS flags the workbook fullCalcOnLoad).
 */
export function buildWorkbookB64(sheets: SheetSpec[]): string {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    // aoa_to_sheet only understands primitives, so seed formula cells with their cached value first...
    const aoa = s.rows.map((row) => row.map((c) => (isFormula(c) ? (c.v ?? 0) : c)));
    const ws = XLSX.utils.aoa_to_sheet(aoa as (string | number | null)[][]);
    // ...then attach the actual formula (+ optional number format) to those cells.
    s.rows.forEach((row, r) => row.forEach((c, col) => {
      if (!isFormula(c)) return;
      const cell = (ws[XLSX.utils.encode_cell({ r, c: col })] ??= {}) as XLSX.CellObject;
      cell.t = c.t ?? (typeof c.v === "string" ? "s" : "n");
      cell.f = c.f;
      if (c.v != null) cell.v = c.v;
      if (c.z) cell.z = c.z;
    }));
    if (s.merges?.length) ws["!merges"] = s.merges;
    XLSX.utils.book_append_sheet(wb, ws, s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  }
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}
