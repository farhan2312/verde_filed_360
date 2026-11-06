import ExcelJS from "exceljs";

/**
 * Styled .xlsx builder matching the house template:
 *  - Aptos 11 everywhere
 *  - single header row: light-blue fill (#BDD7EE), bold navy (#002060), centred
 *  - thick black outer border around the whole table; thin grey (#BFBFBF) inner gridlines
 *  - frozen header row, auto-fit column widths, thousands/▪ number formats
 *  - no cell comments
 * Returns base64 so a Server Action can hand it to the browser (lib/download → Blob).
 */
export type StyledCell = string | number | null;

export interface StyledSheetSpec {
  name: string;
  /** Array-of-arrays; row 0 is the header. */
  rows: StyledCell[][];
  /** Column index → Excel number format (e.g. { 4: "#,##0", 5: "#,##0.0" }). */
  numFmt?: Record<number, string>;
  /** Absolute row indices (0-based, header = 0) to render bold — e.g. a totals row at index 1. */
  boldRows?: number[];
  /** Columns (0-based) to left-align (labels); everything else right-aligns numbers, left-aligns text. */
  leftCols?: number[];
  /** Long-text columns (0-based) — wrapped, wider cap (house rule: wrap only genuinely long text). */
  wrapCols?: number[];
  /** Header cells carry explanations — wrap them and size columns from the body instead. Opt-in. */
  wrapHeaders?: boolean;
}

const HEADER_FILL = "FFBDD7EE"; // light blue (Accent 1, lighter 60%)
const HEADER_FONT = "FF002060"; // dark navy
const FONT = { name: "Aptos", size: 11 } as const;

export async function buildStyledWorkbookB64(sheets: StyledSheetSpec[]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
    const nCols = Math.max(0, ...spec.rows.map((r) => r.length));
    const nRows = spec.rows.length;
    const bold = new Set(spec.boldRows ?? []);
    const leftCols = new Set(spec.leftCols ?? []);
    const wrapCols = new Set(spec.wrapCols ?? []);

    spec.rows.forEach((row, r) => {
      const cells: StyledCell[] = Array.from({ length: nCols }, (_, c) => row[c] ?? (row[c] === 0 ? 0 : null));
      const xlRow = ws.addRow(cells);
      xlRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const c = colNumber - 1;
        const isHeader = r === 0;
        cell.font = { ...FONT, bold: isHeader || bold.has(r), color: isHeader ? { argb: HEADER_FONT } : undefined };
        if (isHeader) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
        const numeric = typeof cells[c] === "number";
        cell.alignment = {
          vertical: wrapCols.has(c) && !isHeader ? "top" : "middle",
          horizontal: isHeader ? "center" : leftCols.has(c) ? "left" : numeric ? "right" : "left",
          ...((isHeader && spec.wrapHeaders) || (!isHeader && wrapCols.has(c)) ? { wrapText: true } : {}),
        };
        if (!isHeader && numeric && spec.numFmt?.[c]) cell.numFmt = spec.numFmt[c];
        else if (!isHeader && numeric) cell.numFmt = "#,##0";
        // Borders: medium black on the table's outer edge, thin grey inside.
        const thin = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
        const med = { style: "medium" as const, color: { argb: "FF000000" } };
        cell.border = {
          top: r === 0 ? med : thin,
          bottom: r === nRows - 1 ? med : thin,
          left: c === 0 ? med : thin,
          right: c === nCols - 1 ? med : thin,
        };
      });
    });

    // Auto-fit column widths from content length (clamped). With wrapHeaders, headers wrap (they carry
    // explanations) so columns size from the body; wrap columns get a wider cap instead of being cut off.
    for (let c = 0; c < nCols; c++) {
      let max = 8;
      for (const row of spec.wrapHeaders ? spec.rows.slice(1) : spec.rows) { const v = row[c]; const len = v == null ? 0 : String(v).length; if (len > max) max = len; }
      const want = spec.wrapHeaders ? Math.max(max, Math.min(String(spec.rows[0]?.[c] ?? "").length, 18)) : max;
      ws.getColumn(c + 1).width = wrapCols.has(c) ? Math.min(70, Math.max(30, want + 2)) : Math.min(44, want + 2);
    }
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer).toString("base64");
}
