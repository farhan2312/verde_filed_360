/**
 * Email address checks shared by the Users form (live hints) and the server (hard validation).
 * Catches what the staff-master imports actually contain: placeholder addresses (noemail@gmail.com),
 * typo domains (gamil.com — a real, mail-accepting domain owned by someone else; gmail.coom),
 * missing TLDs (…@gmail) and spaces inside the address. The work domain is verdeagrotech.com.
 */

const SHAPE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const PLACEHOLDER_LOCAL = /^(no-?email|noemail\d*|test\d*|testing|na|n-a|none|nil|null|abc\d*|xyz\d*|asdf|dummy|sample|demo|nomail|email|mail|user\d*)$/;

/** Domains people mistype, and what they meant. */
const COMMON = ["gmail.com", "yahoo.com", "yahoo.co.in", "yahoo.in", "outlook.com", "hotmail.com", "rediffmail.com", "verdeagrotech.com"];
/** Real domains that happen to sit close to a common one — never "correct" these. */
const REAL_NEARBY = new Set(["mail.com", "email.com", "gmx.com", "ymail.com", "live.com", "aol.com", "msn.com", "me.com", "zoho.com", "icloud.com", "proton.me", "protonmail.com", "outlook.in"]);

function lev(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export interface EmailCheck {
  ok: boolean;
  normalized: string; // trimmed + lowercased ("" when blank)
  error?: string;
  suggestion?: string; // a corrected address to offer
}

/** Blank is OK (the field is optional). Anything else must be one real-looking address. */
export function checkEmail(raw: string | null | undefined): EmailCheck {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return { ok: true, normalized: "" };
  if (/[\s,;]/.test(v)) {
    const fixed = v.replace(/\s+/g, "");
    return { ok: false, normalized: v, error: "Enter one address only — no spaces, commas or semicolons.", ...(SHAPE.test(fixed) ? { suggestion: fixed } : {}) };
  }
  if ((v.match(/@/g) ?? []).length !== 1) return { ok: false, normalized: v, error: "An email address needs exactly one @." };
  const [local, domain] = v.split("@");
  if (!local || !domain) return { ok: false, normalized: v, error: "That doesn't look like an email address." };
  if (!domain.includes(".")) {
    const guess = COMMON.find((c) => c.startsWith(`${domain}.`));
    return { ok: false, normalized: v, error: `The domain "${domain}" is missing its ending (e.g. .com).`, ...(guess ? { suggestion: `${local}@${guess}` } : {}) };
  }
  if (!SHAPE.test(v) || /\.\.|^\.|\.@|@\./.test(v)) return { ok: false, normalized: v, error: "That doesn't look like a valid email address." };
  if (PLACEHOLDER_LOCAL.test(local)) return { ok: false, normalized: v, error: "That's a placeholder, not a real mailbox — leave the field blank instead." };
  if (!COMMON.includes(domain) && !REAL_NEARBY.has(domain)) {
    let best = "", bd = 99;
    for (const c of COMMON) { const dd = lev(domain, c); if (dd < bd) { bd = dd; best = c; } }
    const workLike = /^verd[ae]?-?agro/.test(domain);
    if (bd <= 2 || workLike) {
      const target = workLike ? "verdeagrotech.com" : best;
      return { ok: false, normalized: v, error: `"${domain}" looks like a typo of "${target}".`, suggestion: `${local}@${target}` };
    }
  }
  return { ok: true, normalized: v };
}
