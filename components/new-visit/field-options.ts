/**
 * New Visit wizard — chip / select option catalog.
 *
 * The canonical source is the `FieldOption` table (loaded server-side in
 * `page.tsx` and passed down). These constants are the verbatim fallbacks from
 * the screen spec (16-new-visit-wizard.md §3) used when the DB is empty /
 * unavailable, or when a particular field has no `FieldOption` row.
 *
 * `FIELD` keys map 1:1 to the `FieldOption.fieldName` values produced by the
 * data import (scripts/import-data.ts).
 */
import { FOLLOWUP_REASONS } from "@/lib/action-constants";

export const FIELD = {
  landHolding: "Land Holding",
  soilType: "Soil Type",
  soilTesting: "Soil Testing",
  waterSource: "Water Source",
  mainCrop: "Main Crop",
  crop: "Crop",
  pests: "Pest / Disease / Weed",
  season: "Season",
  product: "Product",
  productRequired: "Product Required",
  currentProblem: "Current Problem",
  cropRisk: "Crop Risk",
  dangerZone: "Danger Zone",
  annualExpense: "Annual Agriculture Expense",
  purchaseFreq: "Purchase Frequency",
  leadStatus: "Lead Status",
  followUpReason: "Follow-up Reason",
} as const;

export type FieldKey = keyof typeof FIELD;

/** Verbatim option lists from the spec — fallback when no FieldOption row. */
export const FALLBACK_OPTIONS: Record<FieldKey, string[]> = {
  landHolding: [
    "< 1 Bigha", "1–3 Bigha", "3–5 Bigha", "5–10 Bigha",
    "10–20 Bigha", "20–50 Bigha", "50–100 Bigha", "100+ Bigha",
  ],
  soilType: [
    "Sandy", "Sandy Loam", "Loam", "Clay Loam", "Clay",
    "Black Soil", "Red Soil", "Alluvial Soil", "Saline Soil", "Other",
  ],
  soilTesting: ["Required", "Not Required"],
  waterSource: [
    "Canal", "Tube Well", "Bore Well", "River", "Pond",
    "Rain Water", "Drip Irrigation", "Sprinkler Irrigation", "Other",
  ],
  mainCrop: [
    "Wheat", "Paddy", "Maize", "Mustard", "Potato", "Sugarcane", "Gram",
    "Arhar", "Urad", "Moong", "Soybean", "Groundnut", "Vegetables", "Fruits", "Other",
  ],
  crop: [
    "Wheat", "Paddy", "Maize", "Mustard", "Potato", "Sugarcane", "Gram",
    "Arhar", "Urad", "Moong", "Soybean", "Groundnut", "Tomato", "Onion",
    "Chilli", "Brinjal", "Okra", "Cabbage", "Cauliflower", "Pea", "Other",
  ],
  pests: [
    // Insect pests
    "Aphids", "Whitefly", "Thrips", "Jassids", "Stem Borer", "Fruit / Pod Borer", "Bollworm",
    "Pink Bollworm", "Leaf Folder", "Brown Plant Hopper", "Shoot Borer", "Mealybug", "Mites",
    "Termite", "Armyworm", "Cutworm",
    // Diseases
    "Blast", "Blight", "Leaf Spot", "Rust", "Powdery Mildew", "Downy Mildew", "Wilt", "Root Rot",
    "Smut", "Sheath Blight", "Yellow Mosaic Virus", "Anthracnose",
    // Weeds
    "Grassy Weeds", "Broadleaf Weeds", "Sedges", "Other",
  ],
  season: ["Kharif", "Rabi", "Zaid"],
  product: [
    "Seeds", "Fertilizers", "Pesticides", "Fungicides", "Herbicides",
    "Insecticides", "Bio Products", "Micronutrients", "PGR", "Farm Equipment", "Other",
  ],
  productRequired: [
    "Seeds", "Fertilizers", "DAP", "Urea", "NPK", "Micronutrients",
    "Insecticides", "Fungicides", "Herbicides", "Bio Fertilizers",
    "Growth Promoters", "Equipment", "Other",
  ],
  currentProblem: [
    "Pest Infestation", "Disease Infection", "Weed Problem", "Irrigation Issue",
    "Fertilizer Req.", "Seed Req.", "Low Yield", "Soil Issue", "Market Price",
    "Labour Shortage", "Other",
  ],
  cropRisk: [
    "Pest Attack", "Disease", "Drought", "Flood", "Water Logging",
    "Low Germination", "Nutrient Deficiency", "Weather Damage", "Animal Damage",
    "None", "Other",
  ],
  dangerZone: [
    "Flood Prone", "Water Logging", "Heavy Rainfall", "Drought Prone", "Hailstorm",
    "Heat Wave", "Frost", "Cold Wave", "Storm/Wind", "River Overflow", "Salinity",
    "Soil Erosion", "Wild Animal", "Pest Outbreak", "Disease Outbreak", "No Major Risk",
  ],
  annualExpense: ["< ₹10K", "₹10–25K", "₹25–50K", "₹50K–1L", "₹1–2.5L", "₹2.5L+"],
  purchaseFreq: ["Weekly", "Monthly", "As Required"],
  leadStatus: [
    "New", "Contacted", "Recommendation Given",
    "Follow-up Scheduled", "Converted", "Lost",
  ],
  followUpReason: [...FOLLOWUP_REASONS],
};

/** Step-0 geo fallbacks (used only when the DB has no farmers to derive from). */
export const VILLAGES = [
  "Chandpur", "Barauli", "Khandauli", "Fatehabad", "Sikandra", "Shamsabad",
];
export const DISTRICTS = ["Agra", "Firozabad", "Mainpuri", "Etah", "Mathura"];

/**
 * Canonical Visit Reason list. A controlled dropdown (not free text) so the same
 * reason isn't stored under a dozen spelling variants. "Other" is the escape hatch.
 */
export const VISIT_REASONS = [
  "Crop Inspection",
  "Product Demonstration",
  "Follow-up Visit",
  "New Farmer Registration",
  "Advisory / Recommendation",
  "Complaint / Issue Resolution",
  "Order Booking",
  "Payment Collection",
  "Soil Testing",
  "Scheme / Subsidy Info",
  "Other",
];

/** Resolved option lists handed to the client wizard (one array per FieldKey). */
export type WizardOptions = Record<FieldKey, string[]>;

/** Merge DB FieldOption rows over the spec fallbacks. */
export function resolveOptions(
  dbRows: { fieldName: string; options: string[] }[],
): WizardOptions {
  const byName = new Map(dbRows.map((r) => [r.fieldName, r.options]));
  const out = {} as WizardOptions;
  (Object.keys(FIELD) as FieldKey[]).forEach((key) => {
    const fromDb = byName.get(FIELD[key]);
    out[key] = fromDb && fromDb.length > 0 ? fromDb : FALLBACK_OPTIONS[key];
  });
  return out;
}
