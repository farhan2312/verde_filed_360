/**
 * Resolve friendly variable names for Meta templates. Meta only stores positional {{1}},{{2}}… — we
 * layer names on top from two sources, in priority order:
 *   1. WaTemplateVar rows (names an admin typed/edited in the portal).
 *   2. guessVarLabels() — inferred from our preset library ("with our knowledge").
 * Everything below is server-only (touches Prisma).
 */
import { prisma } from "@/lib/prisma";
import { guessVarLabels, countVars } from "@/lib/wa-template-presets";

const key = (name: string, language: string) => `${name}||${language}`;

export interface LabelledTemplate { name: string; language: string; body: string }

/** Map "name||language" → ordered variable labels for a batch of templates. */
export async function resolveVarLabels(list: LabelledTemplate[]): Promise<Map<string, string[]>> {
  const stored = await prisma.waTemplateVar.findMany().catch(() => []);
  const byKey = new Map(stored.map((s) => [key(s.name, s.language), s.labels]));
  const out = new Map<string, string[]>();
  for (const t of list) {
    const n = countVars(t.body);
    const custom = byKey.get(key(t.name, t.language));
    const base = custom && custom.length ? custom : guessVarLabels(t.name, t.body);
    // Always return exactly n labels — trim extras, backfill any gaps with the guess.
    const guess = guessVarLabels(t.name, t.body);
    out.set(key(t.name, t.language), Array.from({ length: n }, (_, i) => (base[i]?.trim() || guess[i])));
  }
  return out;
}

/** Persist admin-entered variable names for one template (empty labels are ignored). */
export async function saveVarLabels(name: string, language: string, labels: string[]): Promise<void> {
  const clean = labels.map((l) => (l ?? "").trim());
  await prisma.waTemplateVar.upsert({
    where: { name_language: { name, language } },
    create: { name, language, labels: clean },
    update: { labels: clean },
  });
}
