/**
 * Spend tiers — shared by Farmer 360, the analytics workbench, and the map cluster builder.
 * Boundaries line up with the value-segment thresholds (₹8k = Potential HNI, ₹12k = HNI): Regular
 * splits at 2.5k/5k/8k, Potential at 10k, HNI at 20k/50k — so every bracket sits fully inside one tier.
 */
export const SPEND_TIERS: { label: string; min?: number; max?: number }[] = [
  { label: "₹50K+", min: 50000 },
  { label: "₹20–50K", min: 20000, max: 50000 },
  { label: "₹12–20K", min: 12000, max: 20000 },
  { label: "₹10–12K", min: 10000, max: 12000 },
  { label: "₹8–10K", min: 8000, max: 10000 },
  { label: "₹5–8K", min: 5000, max: 8000 },
  { label: "₹2.5–5K", min: 2500, max: 5000 },
  { label: "< ₹2.5K", min: 1, max: 2500 },
  { label: "No spend", max: 0 }, // no purchases at all (max:0 = the no-spend sentinel)
];
