"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ImportSummary } from "@/lib/sales-import";
import { useConfirm } from "@/components/ConfirmDialog";
import { deleteSalesImport, previewSalesImportDeletion } from "@/app/actions/imports";

export interface ImportRow {
  id: number;
  filename: string;
  fileType: string;
  uploadedBy: string;
  status: string;
  lineItems: number | null;
  bills: number | null;
  newCustomers: number | null;
  salesInserted: number | null;
  skipped: number | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  error: string | null;
  when: string;
}

const TEMPLATE_HREF = "/templates/Verde-Agrotech-Monthly-Sales-Template.xlsx";
const CARD =
  "rounded-[14px] border border-black/[0.04] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
const num = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-IN"));

function UploadIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#678722" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
      <path d="M12 15V3M7 8l5-5 5 5" />
    </svg>
  );
}

export function SalesImportScreen({ history }: { history: ImportRow[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    setUploadedName(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/imports/sales", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Import failed.");
      setResult(json.summary as ImportSummary);
      router.refresh(); // refresh the history table
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  function onFiles(files: FileList | null) {
    const f = files?.[0];
    if (f) void upload(f);
  }

  const { confirm, dialog } = useConfirm();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [, startDel] = useTransition();

  async function onDelete(h: ImportRow) {
    setDeletingId(h.id);
    try {
      const preview = await previewSalesImportDeletion(h.id);
      const counts = preview.ok
        ? `${(preview.sales ?? 0).toLocaleString("en-IN")} sales record(s)${preview.farmers ? ` and ${(preview.farmers).toLocaleString("en-IN")} new-customer farmer(s)` : ""}`
        : "its sales records";
      const ok = await confirm({
        title: "Delete this import?",
        message: (
          <span>
            Permanently delete <b>{h.filename}</b> and <b>{counts}</b> it added.
            <br />This cannot be undone.
          </span>
        ),
        confirmLabel: "Delete import",
      });
      if (!ok) { setDeletingId(null); return; }
      startDel(async () => {
        const res = await deleteSalesImport(h.id);
        setDeletingId(null);
        if (!res.ok) { setError(res.error ?? "Delete failed."); return; }
        router.refresh();
      });
    } catch {
      setDeletingId(null);
      setError("Delete failed.");
    }
  }

  return (
    <div className="animate-[fadeUp_0.4s_ease-out]">
      {dialog}
      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1.4fr_1fr]">
        {/* ── Dropzone ── */}
        <div className={`${CARD} p-[22px]`}>
          <div className="mb-1 text-[15px] font-bold text-[#1A1C1A]">Upload monthly invoices</div>
          <div className="mb-4 text-[12.5px] text-[#757575]">
            Drop your monthly sales export (same format as shared) — one row per invoice line-item.
          </div>

          <div
            onClick={() => !busy && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) onFiles(e.dataTransfer.files); }}
            className="flex cursor-pointer flex-col items-center justify-center rounded-[14px] border-[2px] border-dashed px-6 py-10 text-center transition-colors"
            style={{
              borderColor: dragging ? "#678722" : "#CFE3CF",
              background: dragging ? "#F1F8F1" : "#FAFFFA",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? (
              <>
                <div className="mb-3 h-7 w-7 animate-spin rounded-full border-[3px] border-[#E4EFC9] border-t-[#678722]" />
                <div className="text-[13px] font-semibold text-[#678722]">Importing {uploadedName}…</div>
                <div className="mt-1 text-[11.5px] text-[#9E9E9E]">Large files can take a minute — please keep this tab open.</div>
              </>
            ) : (
              <>
                <UploadIcon />
                <div className="mt-3 text-[13.5px] font-semibold text-[#1A1C1A]">
                  Drop your Excel / CSV here, or <span className="text-[#678722] underline">browse</span>
                </div>
                <div className="mt-1 text-[11.5px] text-[#9E9E9E]">Accepts .xlsx or .csv</div>
              </>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}
          />

          {result && (
            <div className="mt-4 rounded-[12px] border border-[#D3E4AB] bg-[#F3F8E6] px-4 py-3.5">
              <div className="mb-2 flex items-center gap-2 text-[13px] font-bold text-[#678722]">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="#678722"><path d="M10 1a9 9 0 100 18 9 9 0 000-18zm4.2 6.7l-5 5a.75.75 0 01-1.06 0l-2.3-2.3a.75.75 0 011.06-1.06l1.77 1.77 4.47-4.47a.75.75 0 011.06 1.06z" /></svg>
                Import complete
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-[#33691E] sm:grid-cols-3">
                <div>Bills: <b>{num(result.bills)}</b></div>
                <div>Sales added: <b>{num(result.salesInserted)}</b></div>
                <div>New customers: <b>{num(result.newCustomers)}</b></div>
                <div>Line-items: <b>{num(result.lineItems)}</b></div>
                <div>Sale lines: <b>{num(result.linesInserted)}</b></div>
                <div>Skipped (no mobile): <b>{num(result.skipped)}</b></div>
                {result.rangeStart && <div>Range: <b>{result.rangeStart} – {result.rangeEnd}</b></div>}
                {result.itemCodesSeen != null && result.itemCodesSeen > 0 && (
                  <div className="col-span-2 sm:col-span-3">Crop/pest auto-map: <b>{num(result.itemCodesMatched)}</b>/{num(result.itemCodesSeen)} item codes matched · <b>{num(result.farmersTagged)}</b> farmers tagged</div>
                )}
              </div>
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-[12px] border border-[#F5C6C6] bg-[#FDECEA] px-4 py-3 text-[12.5px] font-medium text-[#C62828]">
              {error}
            </div>
          )}
        </div>

        {/* ── Template + description ── */}
        <div className={`${CARD} p-[22px]`}>
          <div className="mb-1 text-[15px] font-bold text-[#1A1C1A]">Template &amp; format</div>
          <div className="mb-4 text-[12.5px] leading-[1.7] text-[#616161]">
            Each row is one invoice <b>line-item</b>; rows sharing an <b>Order No</b> are grouped into a bill.
            Required columns: <b>Order No</b>, <b>Total</b>, <b>BillDate</b> (DD-Mon-YYYY), and{" "}
            <b>Cus Mobile</b>. New mobiles are added as new customers; re-uploading a file replaces only
            its own invoices — history stays intact.
          </div>
          <a
            href={TEMPLATE_HREF}
            download
            className="inline-flex items-center gap-2 rounded-[10px] bg-[#678722] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#516A1B]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
            </svg>
            Download Excel template
          </a>
          <div className="mt-3 text-[11px] text-[#9E9E9E]">
            The template includes a filled example row and an “Instructions” sheet.
          </div>
        </div>
      </div>

      {/* ── Previous imports ── */}
      <div className={`${CARD} mt-[18px] overflow-hidden`}>
        <div className="border-b border-[#F0F0F0] px-[22px] py-3.5 text-[15px] font-bold text-[#1A1C1A]">
          Previous imports
        </div>
        {history.length === 0 ? (
          <div className="px-[22px] py-10 text-center text-[13px] text-[#9E9E9E]">
            No imports yet — upload your first monthly file above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[820px] lg:min-w-0">
              <div className="grid grid-cols-[1.6fr_1fr_0.9fr_1.1fr_0.7fr_0.8fr_0.8fr_0.7fr_auto] border-b border-[#F0F0F0] bg-[#FAFAFA] px-[22px] py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[#9E9E9E]">
                <div>File</div><div>When</div><div>By</div><div>Range</div>
                <div className="text-right">Bills</div><div className="text-right">New cust.</div>
                <div className="text-right">Sales added</div><div>Status</div><div />
              </div>
              {history.map((h) => (
                <div key={h.id} className="grid grid-cols-[1.6fr_1fr_0.9fr_1.1fr_0.7fr_0.8fr_0.8fr_0.7fr_auto] items-center border-b border-[#F8F8F8] px-[22px] py-3 text-[12px]">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-[#1A1C1A]" title={h.filename}>{h.filename}</div>
                    {h.error && <div className="truncate text-[10.5px] text-[#C62828]" title={h.error}>{h.error}</div>}
                  </div>
                  <div className="text-[#616161]">{h.when}</div>
                  <div className="truncate text-[#616161]" title={h.uploadedBy}>{h.uploadedBy || "—"}</div>
                  <div className="text-[11.5px] text-[#616161]">
                    {h.rangeStart ? `${h.rangeStart} – ${h.rangeEnd}` : "—"}
                  </div>
                  <div className="text-right font-semibold text-[#1A1C1A]">{num(h.bills)}</div>
                  <div className="text-right text-[#616161]">{num(h.newCustomers)}</div>
                  <div className="text-right font-semibold text-[#678722]">{num(h.salesInserted)}</div>
                  <div>
                    <span
                      className="inline-block rounded-[20px] px-2.5 py-[3px] text-[10px] font-semibold"
                      style={{
                        background: h.status === "SUCCESS" ? "#F3F8E6" : "#FDECEA",
                        color: h.status === "SUCCESS" ? "#678722" : "#C62828",
                      }}
                    >
                      {h.status === "SUCCESS" ? "Success" : "Failed"}
                    </span>
                  </div>
                  <div className="pl-3 text-right">
                    <button
                      type="button"
                      onClick={() => onDelete(h)}
                      disabled={deletingId === h.id}
                      title="Delete this import and the sales it added"
                      className="inline-flex items-center gap-1 rounded-[8px] border border-[#F5C6C6] px-2.5 py-1 text-[11px] font-semibold text-[#C62828] hover:bg-[#FDECEA] disabled:opacity-50"
                    >
                      {deletingId === h.id ? "Deleting…" : (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" /></svg>
                          Delete
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
