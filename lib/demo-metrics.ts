/**
 * Presentation metrics from the original design (dashboard + analytics).
 * These are illustrative figures that are NOT derivable from the basic imported
 * master data, so they live here as constants and feed the analytics/dashboard
 * charts verbatim. Editable KPI values are stored in the Setting table instead.
 */

export const DEFAULT_KPI = {
  visits: "1,024",
  farmers: "22,210",
  convRate: "38.7%",
  followups: "34",
};

export const KPI_CARDS = [
  { key: "visits", title: "Total Visits", change: "↑ 12.3%", accent: "#7DA02E", bg: "#F5F9EA", sub: "This month" },
  { key: "farmers", title: "Farmers Registered", change: "↑ 8.7%", accent: "#1565C0", bg: "#E3F2FD", sub: "Total database" },
  { key: "convRate", title: "Conversion Rate", change: "↑ 3.2pp", accent: "#D4881F", bg: "#FEF6E9", sub: "Visit → purchase" },
  { key: "followups", title: "Pending Follow-ups", change: "↓ 15%", accent: "#E65100", bg: "#FFF3E0", sub: "Due this week" },
] as const;

export const ACTIVITY_BARS = [
  { l: "Mon", c: 42 }, { l: "Tue", c: 38 }, { l: "Wed", c: 55 },
  { l: "Thu", c: 47 }, { l: "Fri", c: 61 }, { l: "Sat", c: 33 }, { l: "Sun", c: 12 },
];

export const FUNNEL = [
  { label: "New Leads", count: 847, pct: 100, color: "#7DA02E" },
  { label: "Contacted", count: 612, pct: 72, color: "#93B93C" },
  { label: "Recommendation", count: 458, pct: 54, color: "#BDD67F" },
  { label: "Follow-up", count: 312, pct: 37, color: "#EDA942" },
  { label: "Converted", count: 198, pct: 23, color: "#FF8F00" },
];

export const CROPS = [
  { name: "Wheat", pct: 37, color: "#EDA942" },
  { name: "Rice", pct: 23, color: "#BDD67F" },
  { name: "Sugarcane", pct: 17, color: "#7DA02E" },
  { name: "Potato", pct: 12, color: "#8D6E63" },
  { name: "Mustard", pct: 8, color: "#FF8F00" },
  { name: "Other", pct: 3, color: "#BDBDBD" },
];

export const INSIGHTS = [
  { title: "Pest Alert", text: "Wheat pest reports in Agra are 34% above seasonal avg. Prioritize spray recommendations.", accent: "#C62828" },
  { title: "Top Performer", text: "ASR Raj Kumar achieved 94% conversion in Firozabad — highest across all stores.", accent: "#7DA02E" },
  { title: "Coverage Gap", text: "15 villages in Mathura block have zero visits this quarter. Reassign territory.", accent: "#D4881F" },
  { title: "Kharif Trend", text: "Early sugarcane adoption up 18% in Mainpuri. Season visits on track to exceed target.", accent: "#1565C0" },
];

export const HEATMAP = {
  problems: ["Pest", "Disease", "Nutrient", "Water", "Weather"],
  crops: ["Wheat", "Rice", "Sugarcane", "Potato", "Mustard"],
  data: [
    [85, 42, 28, 15, 32],
    [38, 65, 45, 72, 18],
    [22, 35, 55, 28, 12],
    [48, 28, 38, 18, 42],
    [32, 52, 22, 25, 28],
  ],
};

export const ASRS = [
  { name: "Raj Kumar", store: "Firozabad", visits: 94, score: 96 },
  { name: "Amit Yadav", store: "Agra Main", visits: 87, score: 88 },
  { name: "Vikram Singh", store: "Mainpuri", visits: 82, score: 84 },
  { name: "Deepak Verma", store: "Etah", visits: 76, score: 78 },
  { name: "Sunil Gupta", store: "Mathura", visits: 71, score: 74 },
  { name: "Ravi Sharma", store: "Hathras", visits: 68, score: 69 },
];

export const REGIONS = [
  { name: "Agra", visits: 245, conv: 45, visitPct: 100 },
  { name: "Firozabad", visits: 198, conv: 52, visitPct: 81 },
  { name: "Mainpuri", visits: 156, conv: 38, visitPct: 64 },
  { name: "Etah", visits: 112, conv: 35, visitPct: 46 },
  { name: "Mathura", visits: 89, conv: 31, visitPct: 36 },
  { name: "Hathras", visits: 47, conv: 28, visitPct: 19 },
];

export const LAND_SEGMENTS = [
  { label: "Marginal (< 2 ac)", count: 312, pct: 24, color: "#DBE9B4" },
  { label: "Small (2–5 ac)", count: 428, pct: 33, color: "#BDD67F" },
  { label: "Medium (5–10 ac)", count: 298, pct: 23, color: "#93B93C" },
  { label: "Large (10–25 ac)", count: 178, pct: 14, color: "#7DA02E" },
  { label: "Very Large (25+ ac)", count: 68, pct: 5, color: "#66852A" },
];

export const DATA_QUALITY = [
  { label: "Farmer Info", pct: 98, color: "#7DA02E" },
  { label: "Location Data", pct: 94, color: "#93B93C" },
  { label: "Crop Details", pct: 87, color: "#BDD67F" },
  { label: "Problem Reports", pct: 72, color: "#EDA942" },
  { label: "Commercial Data", pct: 63, color: "#FF8F00" },
  { label: "Media Attachments", pct: 45, color: "#E65100" },
];

/** Officer-banner stats (per-role dashboards). */
export const OFFICER_STATS = { myVisits: 94, myConv: "67%", pending: 8, score: 96 };
export const CENTRAL_STATS = {
  totalVisits: "3,412", activeRegions: 6, activeAsrs: 24, orgConversion: "38.7%", totalRevenue: "₹48.2L",
};
export const SYSADMIN_STATS = { activeUsers: "5/6", dbSize: "2.4 GB", apiCalls: "1,842", uptime: "99.8%" };

export const PERIOD_PILLS = [
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "90d", label: "90 Days" },
  { key: "ytd", label: "Year" },
];
