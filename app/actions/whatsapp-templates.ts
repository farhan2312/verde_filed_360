"use server";

import { getScope, canManage } from "@/lib/scope";
import { waListTemplates, waCreateTemplate, waDeleteTemplate, waConfig, type WaTemplate } from "@/lib/whatsapp";
import { resolveVarLabels, saveVarLabels } from "@/lib/wa-template-vars";

async function adminOnly(): Promise<boolean> {
  const { role } = await getScope();
  return canManage(role);
}

export type { WaTemplate };

/** Attach friendly variable names to a list of templates (custom names, else preset guesses). */
async function withVarLabels(templates: WaTemplate[]): Promise<WaTemplate[]> {
  const labels = await resolveVarLabels(templates.map((t) => ({ name: t.name, language: t.language, body: t.body })));
  return templates.map((t) => ({ ...t, varLabels: labels.get(`${t.name}||${t.language}`) ?? [] }));
}

/** Whether template management is possible (token + WABA id present). */
export async function waTemplatesStatus(): Promise<{ ready: boolean; missing: string[] }> {
  const { ready, missing, cfg } = waConfig();
  const m = [...missing];
  if (!cfg.wabaId) m.push("WHATSAPP_WABA_ID");
  return { ready: ready && !!cfg.wabaId, missing: m };
}

export async function listTemplates(): Promise<{ ok: boolean; templates?: WaTemplate[]; error?: string }> {
  if (!(await adminOnly())) return { ok: false, error: "Admins only." };
  const r = await waListTemplates();
  if (!r.ok || !r.templates) return r;
  return { ok: true, templates: await withVarLabels(r.templates) };
}

export async function createTemplate(input: {
  name: string; language: string; category: string; body: string; examples?: string[]; varLabels?: string[];
}): Promise<{ ok: boolean; id?: string; status?: string; error?: string }> {
  if (!(await adminOnly())) return { ok: false, error: "Admins only." };
  const res = await waCreateTemplate(input);
  // Remember the friendly variable names against the normalized name Meta actually stored.
  if (res.ok && input.varLabels?.some((l) => l.trim())) {
    const metaName = input.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    await saveVarLabels(metaName, (input.language || "en").trim(), input.varLabels).catch(() => null);
  }
  return res;
}

/** Save/edit the friendly variable names for an existing template (backfill). Admin-only. */
export async function saveTemplateVarLabels(input: { name: string; language: string; labels: string[] }): Promise<{ ok: boolean; error?: string }> {
  if (!(await adminOnly())) return { ok: false, error: "Admins only." };
  await saveVarLabels(input.name, (input.language || "en").trim(), input.labels);
  return { ok: true };
}

export async function deleteTemplate(name: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await adminOnly())) return { ok: false, error: "Admins only." };
  return waDeleteTemplate(name);
}
