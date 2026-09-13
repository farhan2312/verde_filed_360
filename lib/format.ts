/** Display/format helpers. */

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Indian-grouped rupee string, e.g. inr(11200) → "₹11,200". */
export function inr(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

/** Indian-grouped number, e.g. 88312 → "88,312". */
export function grouped(n: number): string {
  return n.toLocaleString("en-IN");
}

/** Avatar palette (from the design `avColors`). */
export const AVATAR_COLORS = [
  "#7DA02E", "#1565C0", "#E65100", "#7B1FA2",
  "#D4881F", "#C62828", "#00695C", "#4527A0",
];

export function avatarColor(i: number): string {
  return AVATAR_COLORS[Math.abs(i) % AVATAR_COLORS.length];
}
