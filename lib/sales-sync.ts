/**
 * ERP sales sync — pulls invoice line-items from the sales API for a date window and feeds them
 * through the shared importer (lib/sales-import.ts), so farmers are created by mobile, products
 * resolve by item name, segments recompute and re-runs stay idempotent by invoice number.
 *
 * Every run is a `SalesImport` row (kind = API): RUNNING with live `progress` JSON while it works,
 * then SUCCESS / FAILED with totals. Long windows are fetched month by month so one bad month
 * doesn't lose the whole backfill; each month's totals are folded into the run as it goes.
 *
 * Entry points: the daily cron route (yesterday, IST), the Settings "Run now" card, and
 * `scripts/sales-sync.ts` for CLI backfills.
 */
import { prisma } from "@/lib/prisma";
import { fetchSalesWindow, salesApiConfig, type ApiSaleLine } from "@/lib/sales-api";
import { importSalesMatrix, type ImportSummary } from "@/lib/sales-import";

export type SyncTrigger = "MANUAL" | "SCHEDULED" | "BACKFILL";

export interface SyncProgress {
  step: number; // windows completed
  total: number; // windows planned
  window: string | null; // window in flight, "YYYY-MM-DD → YYYY-MM-DD"
  message: string;
  apiRecords: number;
  bills: number;
  salesInserted: number;
  linesInserted: number;
  newCustomers: number;
  skipped: number;
  stores: number;
}

/** Setting keys for the sync (stored in `Setting`). */
export const SYNC_SETTING_KEYS = {
  lookbackDays: "sync.lookbackDays", // how many days back the scheduled run covers (1 = yesterday only)
  enabled: "sync.enabled", // "true" | "false" — pause the schedule without removing the cron
} as const;

export async function getSyncSettings(): Promise<{ lookbackDays: number; enabled: boolean }> {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.values(SYNC_SETTING_KEYS) } } });
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const lb = parseInt(m.get(SYNC_SETTING_KEYS.lookbackDays) ?? "1", 10);
  return { lookbackDays: Number.isFinite(lb) && lb >= 1 ? Math.min(lb, 31) : 1, enabled: (m.get(SYNC_SETTING_KEYS.enabled) ?? "true") !== "false" };
}

// ── Dates (the ERP's bill dates are Indian calendar days) ──
const IST_OFFSET_MS = 5.5 * 3600 * 1000;
/** Today's calendar date in IST as YYYY-MM-DD. */
export function todayIst(now = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());

/** The window the scheduled run covers: the last `lookbackDays` full days before today (IST). */
export function scheduledWindow(lookbackDays: number, now = new Date()): { from: string; to: string } {
  const yesterday = addDays(todayIst(now), -1);
  return { from: addDays(yesterday, -(lookbackDays - 1)), to: yesterday };
}

/** Split [from, to] into calendar-month windows (single window if it already fits in one month). */
export function monthlyWindows(from: string, to: string): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  let cur = from;
  while (cur <= to) {
    const d = new Date(`${cur}T00:00:00Z`);
    const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const end = monthEnd < to ? monthEnd : to;
    out.push({ from: cur, to: end });
    cur = addDays(end, 1);
  }
  return out;
}

// ── API record → importer matrix ──
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-01" → "01-Sep-2026" (the importer's primary date format, also what Sale.date displays). */
function billDateOut(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}-${MONTHS[parseInt(m[2], 10) - 1]}-${m[1]}` : iso ?? "";
}
/** The ERP puts the village NAME in CusAddress and a numeric village ID in CusVillage. */
function villageOut(r: ApiSaleLine): string {
  const addr = (r.CusAddress ?? "").trim();
  if (addr && !/^\d+$/.test(addr)) return addr;
  const v = (r.CusVillage ?? "").trim();
  return v && !/^\d+$/.test(v) ? v : "";
}
const s = (v: unknown) => (v == null ? "" : String(v));
/** Coupon codes come through as "0" / "" / "NA" when none was used. */
const coupon = (v: unknown) => { const c = s(v).trim(); return /^(0|na|n\/a|null|none)?$/i.test(c) ? "" : c.toUpperCase(); };

export const MATRIX_HEADER = [
  "Retailer Name", "Order No", "Item Name", "MainCategory", "SubCategory", "Qty", "Rate",
  "CGST Rate", "SGST Rate", "CGST Value", "SGST Value", "Total", "Taxable Value", "DiscountAmount",
  "Batch No", "UOM", "Financial Year", "BillDate", "Cus Name", "Cus Mobile", "Cus Village", "Return Qty",
  "Crops", "CouponCode", "Invoice Coupon",
];

export function toMatrix(records: ApiSaleLine[]): string[][] {
  const rows: string[][] = [MATRIX_HEADER];
  for (const r of records) {
    const discount = (Number(r.ItemDiscountAmount) || 0) + (Number(r.InvoiceDiscountAmount) || 0);
    rows.push([
      s(r.RetailerName).trim(), s(r.OrderNo).trim(), s(r.ItemName).trim(), s(r.MainCategory), s(r.SubCategory), s(r.Qty), s(r.Rate),
      s(r.CGSTRate), s(r.SGSTRate), s(r.CGSTValue), s(r.SGSTValue), s(r.Total), s(r.TaxableValue), discount ? String(discount) : "",
      s(r.BatchNo), s(r.UOM), s(r.FinancialYear), billDateOut(r.BillDate), s(r.CusName).trim(), s(r.CusMobile), villageOut(r), s(r.ReturnQty),
      s(r.UsedInCrop).trim(), coupon(r.item_coupon_code), coupon(r.invoice_coupon_code),
    ]);
  }
  return rows;
}

// ── Runs ──
const STALE_RUN_MS = 45 * 60 * 1000; // a RUNNING row older than this is assumed dead (crashed function)

/** The run currently in flight, if any (ignores stale ones). */
export async function activeSyncRun() {
  return prisma.salesImport.findFirst({
    where: { kind: "API", status: "RUNNING", createdAt: { gte: new Date(Date.now() - STALE_RUN_MS) } },
    orderBy: { createdAt: "desc" },
  });
}

/** Mark abandoned RUNNING rows (older than the stale threshold) as FAILED so they don't block new runs. */
export async function reapStaleRuns(): Promise<number> {
  const r = await prisma.salesImport.updateMany({
    where: { kind: "API", status: "RUNNING", createdAt: { lt: new Date(Date.now() - STALE_RUN_MS) } },
    data: { status: "FAILED", error: "Run did not finish (process ended before completion).", finishedAt: new Date() },
  });
  return r.count;
}

export interface SyncRunResult { runId: number; status: "SUCCESS" | "FAILED"; progress: SyncProgress; error: string | null; durationMs: number }

const labelFor = (from: string, to: string) => {
  const d = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return from === to ? `ERP API · ${d(from)}` : `ERP API · ${d(from)} → ${d(to)}`;
};

/**
 * Run a sync for [from, to]. Creates the SalesImport row, fetches month by month, imports, and keeps
 * `progress` current so the UI can poll. Never throws for API/import failures — they land on the row.
 */
export async function runSalesSync(opts: { from: string; to: string; trigger: SyncTrigger; actor: string; onProgress?: (p: SyncProgress) => void }): Promise<SyncRunResult> {
  const { from, to, trigger, actor } = opts;
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) throw new Error("Invalid date window.");
  if (!salesApiConfig().ready) throw new Error("SALES_API_TOKEN is not configured.");
  await reapStaleRuns();
  const active = await activeSyncRun();
  if (active) throw new Error(`A sync is already running (started ${active.createdAt.toISOString()}).`);

  const windows = monthlyWindows(from, to);
  const progress: SyncProgress = { step: 0, total: windows.length, window: null, message: "Starting…", apiRecords: 0, bills: 0, salesInserted: 0, linesInserted: 0, newCustomers: 0, skipped: 0, stores: 0 };
  const storesSeen = new Set<string>();
  let rangeStart: string | null = null, rangeEnd: string | null = null;
  const t0 = Date.now();

  const run = await prisma.salesImport.create({
    data: { filename: labelFor(from, to), kind: "API", trigger, fileType: "api", uploadedBy: actor, status: "RUNNING", fromDate: from, toDate: to, progress: JSON.stringify(progress) },
  });
  const save = async (extra: Record<string, unknown> = {}) => {
    opts.onProgress?.(progress);
    await prisma.salesImport.update({ where: { id: run.id }, data: { progress: JSON.stringify(progress), apiRecords: progress.apiRecords, storesSeen: storesSeen.size, lineItems: progress.apiRecords, bills: progress.bills, newCustomers: progress.newCustomers, salesInserted: progress.salesInserted, linesInserted: progress.linesInserted, skipped: progress.skipped, rangeStart, rangeEnd, ...extra } });
  };

  let error: string | null = null;
  try {
    for (const w of windows) {
      progress.window = `${w.from} → ${w.to}`;
      progress.message = `Fetching ${progress.window} from ERP…`;
      await save();

      const records = await fetchSalesWindow(w.from, w.to);
      progress.apiRecords += records.length;
      for (const r of records) storesSeen.add(String(r.RetailerName ?? "").trim().toUpperCase());
      progress.stores = storesSeen.size;

      if (records.length) {
        progress.message = `Importing ${records.length.toLocaleString("en-IN")} line-items for ${progress.window}…`;
        await save();
        const sum: ImportSummary = await importSalesMatrix(toMatrix(records), actor, run.id);
        progress.bills += sum.bills;
        progress.salesInserted += sum.salesInserted;
        progress.linesInserted += sum.linesInserted;
        progress.newCustomers += sum.newCustomers;
        progress.skipped += sum.skipped;
        if (sum.rangeStart && (!rangeStart || new Date(sum.rangeStart) < new Date(rangeStart))) rangeStart = sum.rangeStart;
        if (sum.rangeEnd && (!rangeEnd || new Date(sum.rangeEnd) > new Date(rangeEnd))) rangeEnd = sum.rangeEnd;
      }
      progress.step += 1;
      progress.message = `${progress.step}/${progress.total} window(s) done`;
      await save();
    }
    progress.window = null;
    progress.message = progress.apiRecords ? `Done — ${progress.salesInserted.toLocaleString("en-IN")} bills, ${progress.newCustomers.toLocaleString("en-IN")} new customers` : "Done — no sales in this window";
  } catch (e) {
    error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    progress.message = `Failed: ${error}`;
  }

  const durationMs = Date.now() - t0;
  const status = error ? "FAILED" : "SUCCESS";
  await save({ status, error, durationMs, finishedAt: new Date() });
  await prisma.auditLog.create({
    data: { actor, action: error ? "SYNC_FAILED" : "SYNC", entity: "Sale", detail: error ? `ERP sales sync ${from}→${to} failed: ${error}` : `ERP sales sync ${from}→${to}: ${progress.apiRecords} line-items, ${progress.salesInserted} bills, ${progress.newCustomers} new customers` },
  }).catch(() => {});
  return { runId: run.id, status, progress, error, durationMs };
}

export function parseProgress(json: string | null): SyncProgress | null {
  if (!json) return null;
  try { return JSON.parse(json) as SyncProgress; } catch { return null; }
}
