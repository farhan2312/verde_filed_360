import { AVATAR_COLORS } from "./format";

/** Short store name: the part before the "(" — e.g. "Ram Nagar (Barabanki)" → "Ram Nagar". */
export function shortStoreName(name?: string | null): string {
  if (!name) return "";
  const i = name.indexOf("(");
  return (i > 0 ? name.slice(0, i) : name).trim();
}

/** Deterministic pin/store colour by id. */
export function storeColor(id: number): string {
  return AVATAR_COLORS[Math.abs(id) % AVATAR_COLORS.length];
}
