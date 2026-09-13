/**
 * Campaign rounds domain model (pure — safe to import from server actions AND client components).
 *
 * A campaign runs in ordered ROUNDS. Each round carries its own dates, coupons and a MESSAGING config:
 *   • Round 1        — a single list of "message targets".
 *   • Round 2 and up — split into two buckets, "Purchased" and "Not yet purchased" (by whether the
 *                      farmer made any purchase in the campaign window), EACH with its own target list.
 * A message target = a group of value+lifecycle segments (or "All") mapped to a comm plan + channel.
 * Farmers are matched to the first target they satisfy, in order.
 */
import { segMeta } from "@/lib/campaign-segments";

export type Channel = "CALL" | "SMS" | "WHATSAPP" | "VOICE_NOTE" | "IN_PERSON";

export const CHANNELS: { key: Channel; label: string }[] = [
  { key: "CALL", label: "Call" },
  { key: "SMS", label: "SMS" },
  { key: "WHATSAPP", label: "WhatsApp" },
  { key: "VOICE_NOTE", label: "Voice note" },
  { key: "IN_PERSON", label: "In person" },
];
/** Map a comm plan's medium ("WhatsApp" | "SMS" | "Call", incl. combos) to a send Channel. */
export function mediumToChannel(medium: string | null | undefined): Channel | undefined {
  const m = (medium ?? "").toLowerCase();
  if (m.includes("whatsapp")) return "WHATSAPP";
  if (m.includes("sms")) return "SMS";
  if (m.includes("call")) return "CALL";
  return undefined;
}

export function channelLabel(ch: string | null | undefined): string {
  return CHANNELS.find((c) => c.key === ch)?.label ?? (ch ?? "—");
}

export interface Coupon { label: string; code: string; minSpend?: number }

/** A message target — a group of value+lifecycle segments (or All) → a comm plan + channel. */
export interface MessageTarget {
  all: boolean;          // "All farmers" — matches everyone (ignores the segment lists)
  value: string[];       // value segments (empty = any)
  lifecycle: string[];   // lifecycle segments (empty = any)
  commPlan?: string;
  channel?: Channel;
}

/** Round 1 uses `targets`. Round 2+ splits into `purchased` / `notPurchased`, each a target list. */
export interface RoundMessaging {
  targets: MessageTarget[];
  purchased: MessageTarget[];
  notPurchased: MessageTarget[];
}
export const EMPTY_MESSAGING: RoundMessaging = { targets: [], purchased: [], notPurchased: [] };

export const PURCHASED_LABEL = "Purchased";
export const NOT_PURCHASED_LABEL = "Not yet purchased";

export function newTarget(): MessageTarget { return { all: false, value: [], lifecycle: [] }; }

/** Coerce a Prisma Json blob into a Coupon[] safely. */
export function asCoupons(v: unknown): Coupon[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      label: String(x.label ?? "").trim(),
      code: String(x.code ?? "").trim(),
      minSpend: x.minSpend != null && !Number.isNaN(Number(x.minSpend)) ? Number(x.minSpend) : undefined,
    }))
    .filter((c) => c.code);
}

function oneTarget(x: unknown): MessageTarget {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  return {
    all: !!o.all,
    value: Array.isArray(o.value) ? o.value.map(String) : [],
    lifecycle: Array.isArray(o.lifecycle) ? o.lifecycle.map(String) : [],
    commPlan: o.commPlan ? String(o.commPlan) : undefined,
    channel: o.channel ? (String(o.channel) as Channel) : undefined,
  };
}
export function asTargets(v: unknown): MessageTarget[] {
  return Array.isArray(v) ? v.map(oneTarget) : [];
}

/** Coerce the round's `commConfig` Json into the RoundMessaging shape (back-compat tolerant). */
export function asRoundMessaging(v: unknown): RoundMessaging {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    targets: asTargets(o.targets),
    purchased: asTargets(o.purchased),
    notPurchased: asTargets(o.notPurchased),
  };
}

/** First target a farmer satisfies (order matters). `all` matches everyone; empty lists = any. */
export function matchTarget(
  targets: MessageTarget[],
  seg: { value: string | null | undefined; lifecycle: string | null | undefined },
): MessageTarget | null {
  for (const t of targets) {
    if (t.all) return t;
    const vOk = t.value.length === 0 || (seg.value != null && t.value.includes(seg.value));
    const lOk = t.lifecycle.length === 0 || (seg.lifecycle != null && t.lifecycle.includes(seg.lifecycle));
    if (vOk && lOk) return t;
  }
  return null;
}

/** Human label for a target — "All farmers" or the segment names joined. */
export function targetLabel(t: MessageTarget): string {
  if (t.all) return "All farmers";
  const parts = [...t.value, ...t.lifecycle];
  return parts.length ? parts.map((s) => segMeta(s).label).join(" · ") : "All farmers";
}
