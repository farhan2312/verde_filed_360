/**
 * Generates the downloadable monthly-sales upload template.
 *   npx tsx scripts/gen-sales-template.ts
 * Output: public/templates/Verde-Agrotech-Monthly-Sales-Template.xlsx
 */
import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";

const HEADERS = [
  "Retailer Name", "Order No", "Item Name", "Item Code", "MainCategory", "SubCategory",
  "PaymentType", "Qty", "Rate", "CGST Rate", "SGST Rate", "IGST Rate",
  "CGST Value", "SGST Value", "IGST Value", "Total", "Taxable Value",
  "DiscountAmount", "CouponCode", "Batch No", "Expiry Date", "HSNCODE", "UOM",
  "Financial Year", "BillDate", "Cus Name", "Cus Address", "Cus Mobile",
  "Cus Adhar", "Cus Village", "Cus Pincode", "Return Qty", "Crops",
];

// Two line-items of ONE bill (same Order No) → shows how bills are grouped.
const EXAMPLES = [
  ["RAM NAGAR ( BARABANKI )", "UAAG/15/2627/1", "MAIZE DEKALB DKC 9108 - 4.5 KG", "AGRO1234", "SEEDS",
    "MAIZE SEEDS", "CASH", 4, 700, 0, 0, 0, 0, 0, 0, 12600, 12600, 0, "", "9CFA4G", "05-Nov-2026",
    "10051000", "KG", "2627", "01-Apr-2026", "AJAY SINGH", "SUBEDARPURWA", "6394925426", "NA",
    "SUBEDARPURWA", "", 0, "MAIZE"],
  ["RAM NAGAR ( BARABANKI )", "UAAG/15/2627/1", "N.P.K 16-16-16 (IPL) 50 KG", "AGRO5678", "FERTILIZER BULK",
    "FERTILIZER BULK", "CASH", 6, 1675, 2.5, 2.5, 0, 239.28, 239.28, 0, 10050, 9571.44, 0, "",
    "XXXXX", "18-Nov-2030", "31059010", "KG", "2627", "01-Apr-2026", "AJAY SINGH", "SUBEDARPURWA",
    "6394925426", "NA", "SUBEDARPURWA", "", 0, ""],
];

const INSTRUCTIONS = [
  ["Verde Agrotech — Monthly Sales Upload Template"],
  [""],
  ["HOW TO USE"],
  ["1. Export your monthly invoice line-items in this exact column layout (row 1 = headers)."],
  ["2. One row per invoice LINE-ITEM. Rows sharing the same 'Order No' are grouped into one bill."],
  ["3. Save as .xlsx or .csv and drop it on the Sales Import page."],
  [""],
  ["REQUIRED COLUMNS (import fails without these)"],
  ["Order No        — bill / invoice number (groups the line-items into one bill)"],
  ["Total           — line amount incl. tax (₹); the bill total is the sum of its lines"],
  ["BillDate        — format DD-Mon-YYYY, e.g. 01-Apr-2026"],
  ["Cus Mobile      — 10-digit mobile starting 6/7/8/9 (used to match/create the customer)"],
  [""],
  ["ALSO USED (recommended)"],
  ["Retailer Name   — store name; links new customers to the store (match store master exactly)"],
  ["Item Name       — product; the first item is shown in the sales history summary"],
  ["Item Code       — inventory-master Item Code; auto-maps the buyer to the product's Target Crop + Target Pest classification"],
  ["Crops           — (optional) the crop this line was for; used as the buyer's crop tag. Blank / 0 / N/A → falls back to the Item Code's catalogue crop"],
  ["MainCategory    — dominant product category for the bill"],
  ["Cus Name, Cus Village — used when a new customer is created"],
  ["Financial Year  — e.g. 2627 → shown as 'FY 26-27'"],
  [""],
  ["NOTES"],
  ["• New mobiles (no existing customer) are created automatically as new customers."],
  ["• Re-uploading a file replaces only its own invoices — historical data is untouched."],
  ["• Other columns (tax, HSN, batch, etc.) may be present; they are ignored by the import."],
];

const wb = XLSX.utils.book_new();

const wsSales = XLSX.utils.aoa_to_sheet([HEADERS, ...EXAMPLES]);
wsSales["!cols"] = HEADERS.map((h) => ({ wch: Math.max(12, Math.min(28, h.length + 4)) }));
XLSX.utils.book_append_sheet(wb, wsSales, "Sales");

const wsInfo = XLSX.utils.aoa_to_sheet(INSTRUCTIONS);
wsInfo["!cols"] = [{ wch: 95 }];
XLSX.utils.book_append_sheet(wb, wsInfo, "Instructions");

const outDir = path.join(process.cwd(), "public", "templates");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "Verde-Agrotech-Monthly-Sales-Template.xlsx");
XLSX.writeFile(wb, out);
console.log(`Wrote ${out}`);
