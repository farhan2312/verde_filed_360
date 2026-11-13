/**
 * Custom analytics — the semantic model shown in the builder's Data panel (client-safe metadata only;
 * the matching SQL lives server-side in lib/custom-analytics/sql.ts, keyed by the same ids).
 *
 * Field kinds:
 *  - dim      a category / date you can put on an axis, split or table row (and Count it)
 *  - num      a numeric column you aggregate (Sum / Average / Min / Max)
 *  - measure  a ready-made business number (Sales ₹, % reviewed…) — no aggregation to pick
 */
import type { Agg, DateGrain } from "./types";

export type FieldKind = "dim" | "num" | "measure";
export type FieldFormat = "text" | "date" | "inr" | "int" | "num" | "pct" | "crop" | "segment" | "rating";
/** Dimensions shared across datasets — page filters and click-to-filter work across them. */
export type CommonKey = "store" | "region" | "rm" | "valueSegment" | "lifecycle";

export interface FieldMeta {
  id: string;
  label: string;
  kind: FieldKind;
  format: FieldFormat;
  common?: CommonKey;
  date?: boolean; // dim is a date — pick a grain
  defaultAgg?: Agg; // num fields
  hint?: string;
}

export interface DatasetMeta {
  id: string;
  label: string;
  icon: string;
  description: string;
  dateLabel: string | null; // what the page date filter applies to (null = no date)
  dateField: string | null; // the table's main date field — the shared "Date" link to other tables
  fields: FieldMeta[];
}

const d = (id: string, label: string, format: FieldFormat = "text", extra: Partial<FieldMeta> = {}): FieldMeta => ({ id, label, kind: "dim", format, ...extra });
const num = (id: string, label: string, format: FieldFormat, defaultAgg: Agg = "sum", hint?: string): FieldMeta => ({ id, label, kind: "num", format, defaultAgg, hint });
const m = (id: string, label: string, format: FieldFormat, hint?: string): FieldMeta => ({ id, label, kind: "measure", format, hint });

const STORE_DIMS = [
  d("store", "Store", "text", { common: "store" }),
  d("store_code", "Store code"),
  d("region", "Region / district", "text", { common: "region" }),
  d("rm", "Regional Manager", "text", { common: "rm", hint: "A store with two managers counts under both" }),
];

export const DATASETS: DatasetMeta[] = [
  {
    id: "sales", label: "Sales", icon: "🧾", dateLabel: "Sale date", dateField: "sale_date",
    description: "Every sale line (base / pre-tax price) with the buying farmer and store.",
    fields: [
      m("sales_value", "Sales ₹ (base)", "inr", "Sum of base (pre-tax) value"),
      m("bills", "Bills", "int", "Distinct invoices"),
      m("buyers", "Buying farmers", "int", "Distinct farmers who bought"),
      m("avg_bill", "Average bill ₹", "inr", "Sales ÷ bills"),
      m("lines", "Line items", "int"),
      d("sale_date", "Sale date", "date", { date: true }),
      ...STORE_DIMS,
      d("crop", "Crop", "crop"),
      d("item", "Item"),
      d("category", "Product category"),
      d("coupon", "Coupon code"),
      d("value_segment", "Value segment", "segment", { common: "valueSegment" }),
      d("lifecycle", "Lifecycle", "segment", { common: "lifecycle" }),
      d("village", "Village"),
      d("farmer", "Farmer"),
      num("basic", "Base value ₹", "inr"),
      num("qty", "Quantity", "num"),
      num("total_gst", "Value incl. GST ₹", "inr", "sum", "Display only — everything else uses base price"),
    ],
  },
  {
    id: "farmers", label: "Farmers", icon: "👨‍🌾", dateLabel: "Date added", dateField: "added",
    description: "Every farmer with their segments, crops and spend.",
    fields: [
      m("farmers", "Farmers", "int"),
      m("ltv_total", "Lifetime value ₹ (total)", "inr"),
      m("ltv_avg", "Average lifetime value ₹", "inr"),
      m("hni", "HNI farmers", "int"),
      m("opted_in", "WhatsApp opted-in", "int"),
      m("converted", "Leads converted", "int"),
      ...STORE_DIMS,
      d("value_segment", "Value segment", "segment", { common: "valueSegment" }),
      d("lifecycle", "Lifecycle", "segment", { common: "lifecycle" }),
      d("crop", "Crop (sales or visit)", "crop", { hint: "A farmer with 2 crops counts under both" }),
      d("store_crop", "Store-region crop", "crop", { hint: "Crops set on the farmer's store" }),
      d("village", "Village"),
      d("district", "District"),
      d("whatsapp", "WhatsApp opted-in"),
      d("ghoshti", "Attended a Ghoshti"),
      d("added", "Date added", "date", { date: true }),
      d("last_purchase", "Last purchase date", "date", { date: true }),
      num("ltv", "Lifetime value ₹", "inr"),
      num("p12m", "Spend, last 12 months ₹", "inr"),
    ],
  },
  {
    id: "visits", label: "Visits", icon: "🚜", dateLabel: "Visit date", dateField: "visit_date",
    description: "Field visits with review status, crops, problems and pests.",
    fields: [
      m("visits", "Visits", "int"),
      m("reviewed_pct", "% reviewed", "pct"),
      m("pending", "Pending review", "int"),
      m("avg_rating", "Average rating", "rating"),
      m("farmers_visited", "Farmers visited", "int"),
      m("flagged", "Needs follow-up", "int"),
      d("visit_date", "Visit date", "date", { date: true }),
      ...STORE_DIMS,
      d("officer", "Officer"),
      d("purpose", "Visit purpose"),
      d("reviewed", "Review status"),
      d("rating", "Rating", "rating"),
      d("main_crop", "Main crop"),
      d("crop", "Crop recorded", "text", { hint: "A visit with 2 crops counts under both" }),
      d("problem", "Current problem"),
      d("pest", "Pest / disease seen"),
      d("mode", "Visit mode"),
      d("value_segment", "Farmer value segment", "segment", { common: "valueSegment" }),
      d("lifecycle", "Farmer lifecycle", "segment", { common: "lifecycle" }),
      num("rating_num", "Rating (1–5)", "rating", "avg"),
    ],
  },
  {
    id: "campaigns", label: "Campaigns & outreach", icon: "📣", dateLabel: "Campaign start", dateField: "start_date",
    description: "Every enrolled farmer: group, reach, channel and response.",
    fields: [
      m("members", "Enrolled farmers", "int"),
      m("reached", "Reached", "int"),
      m("reach_pct", "% reached", "pct"),
      m("interested", "Interested", "int"),
      m("unreachable", "Unreachable", "int"),
      d("campaign", "Campaign"),
      d("status", "Campaign status"),
      d("group", "Group (test / control)"),
      d("reach_state", "Reach status"),
      d("response", "Response"),
      d("channel", "Channel", "text", { hint: "A farmer reached 2 ways counts under both" }),
      ...STORE_DIMS,
      d("value_segment", "Value segment", "segment", { common: "valueSegment" }),
      d("lifecycle", "Lifecycle", "segment", { common: "lifecycle" }),
      d("reached_by", "Recorded by"),
      d("reached_date", "Date contacted", "date", { date: true }),
      d("start_date", "Campaign start", "date", { date: true }),
    ],
  },
  {
    id: "actions", label: "Follow-ups", icon: "✅", dateLabel: "Due date", dateField: "due_date",
    description: "Action Registry follow-ups — open, overdue and done.",
    fields: [
      m("actions", "Follow-ups", "int"),
      m("open", "Open", "int"),
      m("overdue", "Overdue", "int"),
      m("done", "Done", "int"),
      m("done_pct", "% done", "pct"),
      d("state", "Status (open / overdue / done)"),
      d("reason", "Reason"),
      d("source", "Source (visit / manual)"),
      ...STORE_DIMS,
      d("created_by", "Created by"),
      d("due_date", "Due date", "date", { date: true }),
      d("completed_date", "Completed date", "date", { date: true }),
    ],
  },
  {
    id: "ghoshti", label: "Ghoshti", icon: "🌾", dateLabel: "Meetup date", dateField: "meetup_date",
    description: "Farmer meetups and their attendees.",
    fields: [
      m("meetups", "Meetups", "int"),
      m("attendees", "Attendees", "int"),
      m("existing", "Existing farmers attended", "int"),
      m("new_people", "New people attended", "int"),
      d("status", "Approval status"),
      ...STORE_DIMS,
      d("organiser", "Organiser"),
      d("topic", "Topic"),
      d("meetup_date", "Meetup date", "date", { date: true }),
    ],
  },
  {
    id: "stores", label: "Stores", icon: "🏪", dateLabel: null, dateField: null,
    description: "Store attributes — region, RM, status, crops and farmer counts.",
    fields: [
      m("stores", "Stores", "int"),
      m("store_farmers", "Farmers attached", "int"),
      ...STORE_DIMS,
      d("status", "Store status"),
      d("store_crop", "Store-region crop", "crop"),
    ],
  },
];

export const DATASET_BY_ID: Record<string, DatasetMeta> = Object.fromEntries(DATASETS.map((x) => [x.id, x]));

export function fieldMeta(dataset: string | null | undefined, field: string): FieldMeta | undefined {
  return dataset ? DATASET_BY_ID[dataset]?.fields.find((f) => f.id === field) : undefined;
}

/**
 * The same dimension in another table, so values from different tables can share one visual. Tables link on
 * their shared fields (store, region, RM, value segment, lifecycle) and on their main dates (same grain).
 * null = these two tables can't be lined up by this field.
 */
export function mapDim(fromDs: string, ref: { field: string; grain?: DateGrain }, toDs: string): { field: string; grain?: DateGrain } | null {
  if (fromDs === toDs) return ref;
  const meta = fieldMeta(fromDs, ref.field);
  const to = DATASET_BY_ID[toDs];
  if (!meta || !to) return null;
  if (meta.common) { const f = to.fields.find((x) => x.common === meta.common && x.kind === "dim"); return f ? { field: f.id } : null; }
  if (meta.date && DATASET_BY_ID[fromDs]?.dateField === ref.field && to.dateField) return { field: to.dateField, grain: ref.grain };
  return null;
}

/** Labels of the fields two tables can be joined on (for messages). */
export const LINK_FIELDS_LABEL = "Store, Region, RM, Value segment, Lifecycle or their main date";

/** Aggregations offered for a value: measures have none; numbers Sum/Avg/Min/Max/Count; dims Count/Distinct. */
export function aggsFor(f: FieldMeta | undefined): Agg[] {
  if (!f || f.kind === "measure") return [];
  if (f.kind === "num") return ["sum", "avg", "min", "max", "count"];
  return ["distinct", "count"];
}

/** Label for a value well item, e.g. "Sum of Base value ₹" / "Bills". */
export function valueLabel(dataset: string | null, v: { field: string; agg?: Agg; dataset?: string }): string {
  const f = fieldMeta(v.dataset ?? dataset, v.field);
  if (!f) return v.field;
  if (f.kind === "measure") return f.label;
  const agg = v.agg ?? (f.kind === "num" ? f.defaultAgg ?? "sum" : "distinct");
  return agg === "distinct" ? `${f.label} (count distinct)` : agg === "count" ? `Count of ${f.label}` : `${agg === "sum" ? "Sum" : agg === "avg" ? "Average" : agg === "min" ? "Min" : "Max"} of ${f.label}`;
}

/** The display format of a value (counts are always integers). */
export function valueFormat(dataset: string | null, v: { field: string; agg?: Agg; dataset?: string }): FieldFormat {
  const f = fieldMeta(v.dataset ?? dataset, v.field);
  if (!f) return "num";
  if (f.kind === "measure") return f.format;
  const agg = v.agg ?? (f.kind === "num" ? f.defaultAgg ?? "sum" : "distinct");
  if (agg === "count" || agg === "distinct") return "int";
  return f.format === "rating" ? "rating" : f.format;
}

/** Page-filter keys each dataset can apply (others are ignored for that visual, with a hint). */
export const FILTER_SUPPORT: Record<string, { date: boolean; store: boolean; valueSegment: boolean; lifecycle: boolean }> = {
  sales: { date: true, store: true, valueSegment: true, lifecycle: true },
  farmers: { date: true, store: true, valueSegment: true, lifecycle: true },
  visits: { date: true, store: true, valueSegment: true, lifecycle: true },
  campaigns: { date: true, store: true, valueSegment: true, lifecycle: true },
  actions: { date: true, store: true, valueSegment: false, lifecycle: false },
  ghoshti: { date: true, store: true, valueSegment: false, lifecycle: false },
  stores: { date: false, store: true, valueSegment: false, lifecycle: false },
};
