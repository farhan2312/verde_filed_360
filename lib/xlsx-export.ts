import * as XLSX from "xlsx";

export interface SheetSpec {
  /** Tab name (Excel truncates to 31 chars; avoid []:*?/\). */
  name: string;
  /** Array-of-arrays, including the header row. */
  rows: (string | number | null)[][];
  /** Optional merged-cell ranges (0-indexed), e.g. grouped two-row headers. */
  merges?: { s: { r: number; c: number }; e: { r: number; c: number } }[];
}

/**
 * Build a multi-sheet .xlsx from array-of-arrays and return it base64-encoded, so a Server Action
 * can hand the workbook to the browser for download (client decodes with lib/download → Blob).
 */
export function buildWorkbookB64(sheets: SheetSpec[]): string {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    if (s.merges?.length) ws["!merges"] = s.merges;
    XLSX.utils.book_append_sheet(wb, ws, s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  }
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}
