/**
 * Generate the one-time VISIT DATA MIGRATION template (.xlsx) with strict Excel data validation.
 *
 * - Every enumerable field is a locked dropdown sourced from the canonical option catalog
 *   (components/new-visit/field-options.ts) + the live Store list from the DB.
 * - Free text only where a list can't apply: Farmer Name, Village, Officer Name, Notes, Other Crops.
 * - Mobile / WhatsApp numbers: digits-only, 10-length (custom validation), stored as text.
 * - Dates: free text in DD-Mon-YYYY format (kept as text to avoid Excel locale surprises).
 * - Yes/No fields are dropdowns.
 *
 * Column → Visit model mapping (for the later ingest):
 *   Farmer Mobile→farmer(mobile, KEY)  Farmer Name→name  Village→village  Store→storeId
 *   Officer Name→officerName  Visit Date→date/visitedAt  Visit Reason→type  Visit Mode→visitMode(lc)
 *   Notes→notes  Follow-up Date→followUpDate  Main Crop→mainCrop  Other Crops→otherCrops
 *   Season→season  Land Holding→landHoldingUnit  Soil Type→soilType  Soil Testing→soilTesting
 *   Water Source→waterSource[]  Annual Agriculture Expense→annualExpense  Purchase Frequency→purchaseFreq
 *   Product In Use→products[]  Product Required→productRequired[]  Current Problem→currentProblem[]
 *   Crop Risk→cropRisk[]  Danger Zone→dangerZone[]  Crop Insured/FPO Member/Contract Farming/
 *   Dairy Services/WhatsApp Available→booleans  WhatsApp Number→whatsappNumber
 *
 *   npx tsx scripts/gen-visit-migration-template.ts
 */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { FALLBACK_OPTIONS, VISIT_REASONS } from "../components/new-visit/field-options";

const prisma = new PrismaClient();
const OUT = "C:\\Users\\Cosmos\\Documents\\Verde Agrotech documents\\Visit Data Migration Template.xlsx";
const DATA_ROWS = 5000; // rows the validations cover

type Kind = "text" | "phone" | "date" | "list" | "yesno";
interface Col { header: string; kind: Kind; list?: string[]; required?: boolean; note?: string; width?: number }

const YESNO = ["Yes", "No"];
const MODE = ["Field", "Store"];
const GREEN = "FF1B5E20", RED = "FFB71C1C", HDR_TXT = "FFFFFFFF";
const thin = { style: "thin" as const, color: { argb: "FFBDBDBD" } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
// exceljs' TS types omit worksheet.dataValidations (present at runtime) — narrow accessor.
const dvOf = (ws: ExcelJS.Worksheet) => (ws as unknown as { dataValidations: { add: (range: string, rule: object) => void } }).dataValidations;

async function main() {
  const stores = (await prisma.store.findMany({ select: { name: true }, orderBy: { name: "asc" } })).map((s) => s.name);

  const cols: Col[] = [
    { header: "Farmer Mobile", kind: "phone", required: true, width: 16, note: "10-digit mobile, digits only. This links the visit to the farmer." },
    { header: "Farmer Name", kind: "text", width: 22 },
    { header: "Village", kind: "text", width: 18 },
    { header: "Store", kind: "list", list: stores, width: 32, note: "Verde Agrotech store." },
    { header: "Officer Name", kind: "text", width: 20 },
    { header: "Visit Date", kind: "date", required: true, width: 14, note: "Format DD-Mon-YYYY, e.g. 05-Jul-2025." },
    { header: "Visit Reason", kind: "list", list: VISIT_REASONS, width: 24 },
    { header: "Visit Mode", kind: "list", list: MODE, width: 12, note: "Field = at the farm; Store = at the centre." },
    { header: "Notes", kind: "text", width: 40 },
    { header: "Follow-up Date", kind: "date", width: 14, note: "Optional. Format DD-Mon-YYYY." },
    { header: "Main Crop", kind: "list", list: FALLBACK_OPTIONS.mainCrop, width: 14 },
    { header: "Other Crops", kind: "text", width: 22, note: "Optional. Free text; separate multiple with commas." },
    { header: "Season", kind: "list", list: FALLBACK_OPTIONS.season, width: 10 },
    { header: "Land Holding", kind: "list", list: FALLBACK_OPTIONS.landHolding, width: 14 },
    { header: "Soil Type", kind: "list", list: FALLBACK_OPTIONS.soilType, width: 14 },
    { header: "Soil Testing", kind: "list", list: FALLBACK_OPTIONS.soilTesting, width: 14 },
    { header: "Water Source", kind: "list", list: FALLBACK_OPTIONS.waterSource, width: 18 },
    { header: "Annual Agriculture Expense", kind: "list", list: FALLBACK_OPTIONS.annualExpense, width: 16 },
    { header: "Purchase Frequency", kind: "list", list: FALLBACK_OPTIONS.purchaseFreq, width: 16 },
    { header: "Product In Use", kind: "list", list: FALLBACK_OPTIONS.product, width: 16 },
    { header: "Product Required", kind: "list", list: FALLBACK_OPTIONS.productRequired, width: 16 },
    { header: "Current Problem", kind: "list", list: FALLBACK_OPTIONS.currentProblem, width: 18 },
    { header: "Crop Risk", kind: "list", list: FALLBACK_OPTIONS.cropRisk, width: 16 },
    { header: "Danger Zone", kind: "list", list: FALLBACK_OPTIONS.dangerZone, width: 16 },
    { header: "Crop Insured", kind: "yesno", width: 12 },
    { header: "FPO Member", kind: "yesno", width: 12 },
    { header: "Contract Farming", kind: "yesno", width: 14 },
    { header: "Dairy Services", kind: "yesno", width: 12 },
    { header: "WhatsApp Available", kind: "yesno", width: 14 },
    { header: "WhatsApp Number", kind: "phone", width: 16, note: "Optional 10-digit number, digits only." },
  ];

  const wb = new ExcelJS.Workbook();
  wb.creator = "Verde Field Intel";

  // ── Hidden Lists sheet: one column per dropdown; validations reference these ranges. ──
  const lists = wb.addWorksheet("Lists");
  let listCol = 0;
  const putList = (header: string, values: string[]): string => {
    listCol += 1;
    lists.getCell(1, listCol).value = header;
    values.forEach((v, i) => { lists.getCell(2 + i, listCol).value = v; });
    const L = lists.getColumn(listCol).letter;
    return `Lists!$${L}$2:$${L}$${values.length + 1}`;
  };
  const yesnoRange = putList("YesNo", YESNO);

  // ── Visits sheet: the data-entry grid. ──
  const ws = wb.addWorksheet("Visits", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.getRow(1).height = 30;

  cols.forEach((c, i) => {
    const idx = i + 1;
    const cell = ws.getCell(1, idx);
    cell.value = c.required ? `${c.header} *` : c.header;
    cell.font = { bold: true, color: { argb: HDR_TXT }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.required ? RED : GREEN } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = border;
    if (c.note) cell.note = c.note;
    ws.getColumn(idx).width = c.width ?? 16;

    const letter = ws.getColumn(idx).letter;
    const range = `${letter}2:${letter}${DATA_ROWS + 1}`;

    if (c.kind === "list" || c.kind === "yesno") {
      const formula = c.kind === "yesno" ? yesnoRange : putList(c.header.replace(/[^A-Za-z]/g, ""), c.list!);
      dvOf(ws).add(range, {
        type: "list", allowBlank: !c.required, formulae: [formula],
        showErrorMessage: true, errorStyle: "error", errorTitle: "Not in list",
        error: `Please pick a value from the ${c.header} dropdown.`,
      });
    } else if (c.kind === "phone") {
      ws.getColumn(idx).numFmt = "@"; // text so long digit strings aren't mangled
      dvOf(ws).add(range, {
        type: "custom", allowBlank: !c.required, formulae: [`AND(ISNUMBER(--${letter}2),LEN(${letter}2)=10)`],
        showErrorMessage: true, errorStyle: "error", errorTitle: "Invalid mobile",
        error: "Enter a 10-digit mobile number — digits only, no spaces or +91.",
      });
    } else if (c.kind === "date") {
      ws.getColumn(idx).numFmt = "@"; // keep as typed text
    }
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  lists.state = "veryHidden";

  // ── Instructions sheet ──
  const info = wb.addWorksheet("Instructions");
  info.getColumn(1).width = 120;
  const lines: [string, boolean?][] = [
    ["Verde Agrotech — Visit Data Migration Template", true],
    ["", false],
    ["One row per visit. Fill the 'Visits' sheet. Red headers are REQUIRED; everything else is optional.", false],
    ["", false],
    ["REQUIRED", true],
    ["• Farmer Mobile — 10 digits, numbers only (no +91 / spaces). This is how each visit is matched to a farmer.", false],
    ["• Visit Date — format DD-Mon-YYYY, e.g. 05-Jul-2025.", false],
    ["", false],
    ["HOW TO FILL", true],
    ["• Dropdown columns are locked — click the cell and pick from the list. Typing an off-list value is rejected.", false],
    ["• Yes/No columns (Crop Insured, FPO Member, Contract Farming, Dairy Services, WhatsApp Available) are Yes/No dropdowns.", false],
    ["• Multi-value fields (Water Source, Product In Use, Product Required, Current Problem, Crop Risk, Danger Zone) accept ONE value each — pick the main one.", false],
    ["• Other Crops and Notes are free text. Leave anything unknown blank — don't invent values.", false],
    ["• Do not rename, reorder, or delete columns, and don't add columns. Keep the header row as row 1.", false],
    ["", false],
    ["EXAMPLE ROW", true],
    ["9876543210 | Ram Singh | Chandpur | RAM NAGAR ( BARABANKI ) | A. Verma | 05-Jul-2025 | Crop Inspection | Field | Advised on stem borer | 12-Jul-2025 | Paddy | | Kharif | 1–3 Bigha | Loam | Required | Tube Well | ₹25–50K | Seasonal | Pesticides | Insecticides | Pest Infestation | Pest Attack | Flood Prone | No | No | No | No | Yes | 9876543210", false],
    ["", false],
    ["When done, save as .xlsx and send it back — it will be ingested directly.", false],
  ];
  lines.forEach(([t, bold], i) => {
    const cell = info.getCell(i + 1, 1);
    cell.value = t;
    if (bold) cell.font = { bold: true, size: i === 0 ? 14 : 12, color: { argb: GREEN } };
  });

  await wb.xlsx.writeFile(OUT);
  console.log(`Wrote ${OUT}`);
  console.log(`  ${cols.length} columns · ${cols.filter((c) => c.kind === "list" || c.kind === "yesno").length} dropdowns · ${stores.length} stores in the Store list`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); return prisma.$disconnect().finally(() => process.exit(1)); });
