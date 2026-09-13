/** Presentation helpers for canonical crop tags (shared by app + scripts). */

/** Pretty label for a canonical crop tag (title-case, underscores → spaces). */
export function cropLabel(c: string): string {
  return c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Source of a farmer's crop association. */
export type CropSource = "sales" | "visit";
export const CROP_SOURCE_LABEL: Record<CropSource, string> = { sales: "Sales", visit: "Visit" };
