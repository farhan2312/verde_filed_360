/** Display formatting for custom-analytics values and category labels (client + server safe). */
import { cropLabel } from "@/lib/crops";
import { segMeta } from "@/lib/campaign-segments";
import type { FieldFormat } from "./model";
import type { DateGrain } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A dimension value as people should read it (crop keys, segment codes, date buckets). */
export function dimLabel(raw: string | number | null | undefined, format: FieldFormat, grain?: DateGrain): string {
  if (raw == null || raw === "") return "(blank)";
  const s = String(raw);
  if (s === "Other" || s.startsWith("(")) return s;
  if (format === "crop") return cropLabel(s);
  if (format === "segment") return segMeta(s).label;
  if (format === "date") {
    if (grain === "month" && /^\d{4}-\d{2}$/.test(s)) return `${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
    if ((grain === "day" || grain === "week") && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const lbl = `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(2, 4)}`;
      return grain === "week" ? `w/c ${lbl}` : lbl;
    }
  }
  return s;
}

const IN = new Intl.NumberFormat("en-IN");

/** Compact Indian-style money: ₹1.2Cr / ₹4.5L / ₹12.3K / ₹950. */
export function inrCompact(n: number): string {
  const a = Math.abs(n), sign = n < 0 ? "-" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  return `${sign}₹${Math.round(a)}`;
}

/** A measure value. `compact` for axes / chart labels; full for tables and tooltips. */
export function fmtValue(v: number | null | undefined, format: FieldFormat, compact = false): string {
  if (v == null || Number.isNaN(v)) return "—";
  switch (format) {
    case "inr": return compact ? inrCompact(v) : `₹${IN.format(Math.round(v))}`;
    case "pct": return `${v.toFixed(v >= 10 || compact ? 0 : 1)}%`;
    case "rating": return v.toFixed(1);
    case "int": return compact && Math.abs(v) >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : compact && Math.abs(v) >= 1e4 ? `${(v / 1e3).toFixed(0)}K` : IN.format(Math.round(v));
    default: return compact && Math.abs(v) >= 1e4 ? `${(v / 1e3).toFixed(0)}K` : IN.format(Math.round(v * 100) / 100);
  }
}
