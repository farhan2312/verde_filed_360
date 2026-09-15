/**
 * Client for the Verde ERP sales API (uaagrostore.com/APPs/api.php).
 *
 * One POST returns every invoice line-item for the company in a bill-date window (no pagination;
 * `store_id` is optional and omitted so a single call covers all stores). An empty window comes
 * back as HTTP 404 "Data not found", which we treat as zero records.
 *
 * Env: SALES_API_TOKEN (Bearer), optional SALES_API_URL, SALES_API_COMPANY_ID (default "2").
 */

export interface ApiSaleLine {
  RetailerName: string;
  OrderNo: string;
  ItemName: string;
  MainCategory: string | null;
  SubCategory: string | null;
  PaymentType: string | null;
  Qty: string | number | null;
  Rate: number | null;
  CGSTRate: number | null;
  SGSTRate: number | null;
  IGSTRate: number | null;
  CGSTValue: number | null;
  SGSTValue: number | null;
  IGSTValue: number | null;
  Total: number | null;
  TaxableValue: number | null;
  ItemDiscountAmount: number | null;
  InvoiceDiscountAmount: number | null;
  CouponCode?: string | null; // legacy field (pre Sep-2026 payloads)
  item_coupon_code: string | null; // line-level offer code; "0" = none
  invoice_coupon_code: string | null; // bill-level offer code; "0" = none
  UsedInCrop: string | null; // crop the store tagged the line to (free text)
  BatchNo: string | null;
  ExpiryDate: string | null;
  HSNCODE: string | null;
  UOM: string | null;
  FinancialYear: string | null;
  BillDate: string; // YYYY-MM-DD
  CusName: string | null;
  CusAddress: string | null; // village name (free text, often blank)
  CusMobile: string | null;
  CusAdhar: string | null;
  CusVillage: string | null; // ERP village id (numeric), not a name
  CusPincode: string | null;
  ReturnQty: number | null;
}

export function salesApiConfig() {
  const token = process.env.SALES_API_TOKEN?.trim() ?? "";
  return {
    url: process.env.SALES_API_URL?.trim() || "http://uaagrostore.com/APPs/api.php",
    companyId: process.env.SALES_API_COMPANY_ID?.trim() || process.env.ERP_COMPANY_ID?.trim() || "2",
    token,
    ready: token.length > 0,
  };
}

export class SalesApiError extends Error {
  constructor(message: string, public readonly httpStatus?: number) { super(message); this.name = "SalesApiError"; }
}

/** Fetch all line-items with bill dates in [from, to] (inclusive, YYYY-MM-DD). */
export async function fetchSalesWindow(from: string, to: string, opts: { storeId?: string; timeoutMs?: number } = {}): Promise<ApiSaleLine[]> {
  const cfg = salesApiConfig();
  if (!cfg.ready) throw new SalesApiError("SALES_API_TOKEN is not configured.");
  const body: Record<string, string> = { type: "sales", company_id: cfg.companyId, from_order_date: from, to_order_date: to };
  if (opts.storeId) body.store_id = opts.storeId;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 120_000);
  let res: Response;
  try {
    res = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (e) {
    throw new SalesApiError(e instanceof Error && e.name === "AbortError" ? "ERP API timed out." : `ERP API unreachable: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let json: { status?: string | number; response?: unknown } = {};
  try { json = JSON.parse(text); } catch { throw new SalesApiError(`ERP API returned non-JSON (HTTP ${res.status}).`, res.status); }

  if (res.status === 404 || String(json.status) === "404") return []; // "Data not found" — empty window
  if (!res.ok || String(json.status) !== "200") {
    const msg = typeof json.response === "string" ? json.response : `HTTP ${res.status}`;
    throw new SalesApiError(`ERP API error: ${msg}`, res.status);
  }
  if (!Array.isArray(json.response)) throw new SalesApiError("ERP API returned an unexpected payload shape.");
  return json.response as ApiSaleLine[];
}
