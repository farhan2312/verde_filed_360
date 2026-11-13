/** Starter reports — "Use template" copies one into the user's own reports to tweak. Client-safe. */
import { uid, type ReportDoc, type Visual, type VisualType, type FieldRef, type ValueRef, type Layout } from "./types";

const vis = (type: VisualType, dataset: string, layout: Layout, o: { title?: string; axis?: FieldRef; split?: FieldRef; dims?: FieldRef[]; values: ValueRef[]; topN?: number; stacked?: boolean }): Visual =>
  ({ id: uid(), type, dataset, layout, values: o.values, axis: o.axis ?? null, split: o.split ?? null, dims: o.dims, title: o.title, topN: o.topN, stacked: o.stacked });

export interface Template { id: string; title: string; description: string; icon: string; build: () => ReportDoc }

export const TEMPLATES: Template[] = [
  {
    id: "sales-overview", title: "Sales overview", icon: "🧾",
    description: "Sales, bills and buyers this FY, monthly trend, top stores, crops and segments.",
    build: () => ({
      version: 1,
      pages: [{
        id: uid(), name: "Overview", filters: { datePreset: "thisFy" },
        visuals: [
          vis("kpi", "sales", { x: 0, y: 0, w: 3, h: 3 }, { values: [{ field: "sales_value" }] }),
          vis("kpi", "sales", { x: 3, y: 0, w: 3, h: 3 }, { values: [{ field: "bills" }] }),
          vis("kpi", "sales", { x: 6, y: 0, w: 3, h: 3 }, { values: [{ field: "buyers" }] }),
          vis("kpi", "sales", { x: 9, y: 0, w: 3, h: 3 }, { values: [{ field: "avg_bill" }] }),
          vis("column", "sales", { x: 0, y: 3, w: 8, h: 7 }, { title: "Sales by month", axis: { field: "sale_date", grain: "month" }, values: [{ field: "sales_value" }] }),
          vis("donut", "sales", { x: 8, y: 3, w: 4, h: 7 }, { title: "Sales by value segment", axis: { field: "value_segment" }, values: [{ field: "sales_value" }] }),
          vis("bar", "sales", { x: 0, y: 10, w: 6, h: 8 }, { title: "Top stores", axis: { field: "store" }, values: [{ field: "sales_value" }], topN: 12 }),
          vis("treemap", "sales", { x: 6, y: 10, w: 6, h: 8 }, { title: "Sales by crop", axis: { field: "crop" }, values: [{ field: "sales_value" }], topN: 15 }),
        ],
      }],
    }),
  },
  {
    id: "visit-quality", title: "Visit quality", icon: "🚜",
    description: "Visits, % reviewed and ratings by RM and officer, plus top problems and pests.",
    build: () => ({
      version: 1,
      pages: [
        {
          id: uid(), name: "Reviews", filters: { datePreset: "90d" },
          visuals: [
            vis("kpi", "visits", { x: 0, y: 0, w: 3, h: 3 }, { values: [{ field: "visits" }] }),
            vis("kpi", "visits", { x: 3, y: 0, w: 3, h: 3 }, { values: [{ field: "reviewed_pct" }] }),
            vis("kpi", "visits", { x: 6, y: 0, w: 3, h: 3 }, { values: [{ field: "pending" }] }),
            vis("kpi", "visits", { x: 9, y: 0, w: 3, h: 3 }, { values: [{ field: "avg_rating" }] }),
            vis("line", "visits", { x: 0, y: 3, w: 12, h: 7 }, { title: "Visits per week", axis: { field: "visit_date", grain: "week" }, values: [{ field: "visits" }] }),
            vis("table", "visits", { x: 0, y: 10, w: 12, h: 9 }, { title: "By Regional Manager", dims: [{ field: "rm" }], values: [{ field: "visits" }, { field: "reviewed_pct" }, { field: "pending" }, { field: "avg_rating" }] }),
          ],
        },
        {
          id: uid(), name: "In the field", filters: { datePreset: "90d" },
          visuals: [
            vis("bar", "visits", { x: 0, y: 0, w: 6, h: 8 }, { title: "Top problems", axis: { field: "problem" }, values: [{ field: "visits" }], topN: 10 }),
            vis("bar", "visits", { x: 6, y: 0, w: 6, h: 8 }, { title: "Top pests / diseases", axis: { field: "pest" }, values: [{ field: "visits" }], topN: 10 }),
            vis("bar", "visits", { x: 0, y: 8, w: 12, h: 9 }, { title: "Visits by officer", axis: { field: "officer" }, values: [{ field: "visits" }], topN: 20 }),
          ],
        },
      ],
    }),
  },
  {
    id: "campaign-reach", title: "Campaign reach", icon: "📣",
    description: "Enrolled vs reached per campaign, reach by store, channels and responses.",
    build: () => ({
      version: 1,
      pages: [{
        id: uid(), name: "Reach", filters: { datePreset: "all" },
        visuals: [
          vis("kpi", "campaigns", { x: 0, y: 0, w: 3, h: 3 }, { values: [{ field: "members" }] }),
          vis("kpi", "campaigns", { x: 3, y: 0, w: 3, h: 3 }, { values: [{ field: "reached" }] }),
          vis("kpi", "campaigns", { x: 6, y: 0, w: 3, h: 3 }, { values: [{ field: "reach_pct" }] }),
          vis("kpi", "campaigns", { x: 9, y: 0, w: 3, h: 3 }, { values: [{ field: "interested" }] }),
          vis("column", "campaigns", { x: 0, y: 3, w: 12, h: 7 }, { title: "Reach status by campaign", axis: { field: "campaign" }, split: { field: "reach_state" }, values: [{ field: "members" }], stacked: true }),
          vis("donut", "campaigns", { x: 0, y: 10, w: 4, h: 7 }, { title: "Channels used", axis: { field: "channel" }, values: [{ field: "members" }] }),
          vis("donut", "campaigns", { x: 4, y: 10, w: 4, h: 7 }, { title: "Responses", axis: { field: "response" }, values: [{ field: "members" }] }),
          vis("bar", "campaigns", { x: 8, y: 10, w: 4, h: 7 }, { title: "% reached by store", axis: { field: "store" }, values: [{ field: "reach_pct" }], topN: 10 }),
        ],
      }],
    }),
  },
  {
    id: "follow-ups", title: "Follow-ups & meetups", icon: "✅",
    description: "Open, overdue and done follow-ups by store and reason, and Ghoshti attendance.",
    build: () => ({
      version: 1,
      pages: [{
        id: uid(), name: "Follow-ups", filters: { datePreset: "all" },
        visuals: [
          vis("kpi", "actions", { x: 0, y: 0, w: 3, h: 3 }, { values: [{ field: "open" }] }),
          vis("kpi", "actions", { x: 3, y: 0, w: 3, h: 3 }, { values: [{ field: "overdue" }] }),
          vis("kpi", "actions", { x: 6, y: 0, w: 3, h: 3 }, { values: [{ field: "done_pct" }] }),
          vis("kpi", "ghoshti", { x: 9, y: 0, w: 3, h: 3 }, { values: [{ field: "attendees" }] }),
          vis("bar", "actions", { x: 0, y: 3, w: 7, h: 9 }, { title: "Follow-ups by store", axis: { field: "store" }, split: { field: "state" }, values: [{ field: "actions" }], stacked: true, topN: 15 }),
          vis("donut", "actions", { x: 7, y: 3, w: 5, h: 9 }, { title: "By reason", axis: { field: "reason" }, values: [{ field: "actions" }] }),
        ],
      }],
    }),
  },
];
