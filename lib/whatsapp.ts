/**
 * WhatsApp Cloud API client (server-only). Meta Graph API — https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Config comes entirely from env so you only ever edit .env, never code:
 *   WHATSAPP_ACCESS_TOKEN    — System User permanent token (auth)          [required]
 *   WHATSAPP_PHONE_NUMBER_ID — sender phone number id (NOT the number)     [required]
 *   WHATSAPP_API_VERSION     — Graph API version                          [optional — default below]
 *   WHATSAPP_WABA_ID         — WhatsApp Business Account id                [optional — not needed to send]
 *
 * Two send modes:
 *   • text     — a plain text message. Only delivered to numbers that messaged you in the last 24h
 *                or your app's registered test numbers (Meta's session-message rule).
 *   • template — a pre-approved template by name + language. Required for cold / business-initiated
 *                outreach; the approved template's body variables are filled from `bodyParams`.
 */

import { createHmac } from "crypto";

const DEFAULT_VERSION = "v21.0";

export interface WaConfig {
  accessToken: string; phoneNumberId: string; version: string; wabaId: string;
}

// Trim whitespace AND strip one layer of wrapping quotes — a token pasted as "EAAG…" (quotes included)
// is a very common cause of Meta "Authentication Error" (the quotes travel in the Bearer header).
const clean = (v: string | undefined) => (v ?? "").trim().replace(/^['"]|['"]$/g, "").trim();

// Meta apps with "Require app secret proof for server API calls" ON reject every Graph call that
// lacks an appsecret_proof (error code 100: "appsecret_proof is required but not provided"). The proof
// is HMAC-SHA256(access_token) keyed by the app secret, sent as a query param. We attach it whenever
// WHATSAPP_APP_SECRET is set; if the setting is off, the extra param is simply ignored by Meta.
function appSecretProof(accessToken: string): string {
  const secret = clean(process.env.WHATSAPP_APP_SECRET);
  if (!secret || !accessToken) return "";
  return createHmac("sha256", secret).update(accessToken).digest("hex");
}

/** Append `appsecret_proof` to a Graph URL when an app secret is configured. */
function withProof(url: string, accessToken: string): string {
  const proof = appSecretProof(accessToken);
  if (!proof) return url;
  return `${url}${url.includes("?") ? "&" : "?"}appsecret_proof=${proof}`;
}

/** Read + validate env config. `missing` lists which REQUIRED keys are blank. */
export function waConfig(): { cfg: WaConfig; ready: boolean; missing: string[] } {
  const cfg: WaConfig = {
    accessToken: clean(process.env.WHATSAPP_ACCESS_TOKEN),
    phoneNumberId: clean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    version: clean(process.env.WHATSAPP_API_VERSION) || DEFAULT_VERSION,
    wabaId: clean(process.env.WHATSAPP_WABA_ID),
  };
  const missing = (Object.entries({
    WHATSAPP_ACCESS_TOKEN: cfg.accessToken, WHATSAPP_PHONE_NUMBER_ID: cfg.phoneNumberId,
  }) as [string, string][]).filter(([, v]) => !v).map(([k]) => k);
  return { cfg, ready: missing.length === 0, missing };
}

/** Inbound-webhook config. `verifyToken` is the string you set in the Meta webhook setup;
 *  `appSecret` (optional) enables X-Hub-Signature-256 verification of incoming payloads. */
export function waWebhookConfig(): { verifyToken: string; appSecret: string } {
  return {
    verifyToken: clean(process.env.WHATSAPP_VERIFY_TOKEN),
    appSecret: clean(process.env.WHATSAPP_APP_SECRET),
  };
}

/** Last 10 digits of an Indian mobile (drops country code / leading zeros). "" if not usable. */
export function toMobile10(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return d.length >= 10 ? d.slice(-10) : "";
}

export interface WaResult {
  ok: boolean;
  providerId?: string; // wamid.* message id
  status?: string;
  raw?: string;
  error?: string;
}

/** Normalise to E.164 digits with the India country code (gateway wants the full number, no +). */
function normalizeMobile(mobile: string): string | null {
  const d = mobile.replace(/\D/g, "").replace(/^0+/, "");
  if (d.length < 10) return null;
  return d.length === 10 ? `91${d}` : d;
}

/**
 * Send one WhatsApp message. Provide `templateName` (+ `languageCode`, optional `bodyParams`) for a
 * template send, otherwise `message` is sent as plain text. Returns a normalized result; never throws.
 */
export async function sendWhatsApp(opts: {
  mobile: string;
  message?: string;
  templateName?: string | null;
  languageCode?: string | null;
  bodyParams?: string[];
}): Promise<WaResult> {
  const { cfg, ready, missing } = waConfig();
  if (!ready) return { ok: false, error: `WhatsApp not configured — set ${missing.join(", ")} in the environment.` };

  const to = normalizeMobile(opts.mobile);
  if (!to) return { ok: false, error: "Invalid mobile number." };

  const isTemplate = !!opts.templateName;
  if (!isTemplate && !(opts.message ?? "").trim()) return { ok: false, error: "Message is empty." };

  const payload: Record<string, unknown> = { messaging_product: "whatsapp", recipient_type: "individual", to };
  if (isTemplate) {
    const components = opts.bodyParams && opts.bodyParams.length
      ? [{ type: "body", parameters: opts.bodyParams.map((t) => ({ type: "text", text: t })) }]
      : [];
    payload.type = "template";
    payload.template = {
      name: opts.templateName,
      language: { code: (opts.languageCode || "en").trim() },
      ...(components.length ? { components } : {}),
    };
  } else {
    payload.type = "text";
    payload.text = { preview_url: false, body: opts.message };
  }

  try {
    const res = await fetch(withProof(`https://graph.facebook.com/${cfg.version}/${cfg.phoneNumberId}/messages`, cfg.accessToken), {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const raw = (await res.text()).slice(0, 2000);
    let body: unknown = null;
    try { body = JSON.parse(raw); } catch { /* non-JSON */ }
    const b = (body ?? {}) as Record<string, unknown>;
    const err = b.error as Record<string, unknown> | undefined;
    const messages = Array.isArray(b.messages) ? (b.messages as Record<string, unknown>[]) : [];
    const providerId = String(messages[0]?.id ?? "") || undefined;
    const ok = res.ok && !err && !!providerId;

    // Meta returns { error: { message, code, error_subcode, error_data: { details }, error_user_msg } }.
    // Surface the code + detail so the failure is actionable (e.g. 190 = bad/expired token).
    let detail = "";
    if (err) {
      const ed = (err.error_data ?? {}) as Record<string, unknown>;
      const bits = [
        err.message ? String(err.message) : "",
        err.code != null ? `code ${err.code}${err.error_subcode != null ? `/${err.error_subcode}` : ""}` : "",
        ed.details ? String(ed.details) : err.error_user_msg ? String(err.error_user_msg) : "",
      ].filter(Boolean);
      detail = bits.join(" · ");
    }

    return {
      ok,
      providerId,
      status: ok ? "Sent" : detail || `HTTP ${res.status}`,
      raw,
      error: ok ? undefined : detail || `Gateway returned ${res.status}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error contacting WhatsApp." };
  }
}

/* ─────────────────── WhatsApp Business Management API — message templates ───────────────────
 * Create / list / delete message templates entirely via the API (no Meta UI). Needs the access
 * token to carry `whatsapp_business_management` + WHATSAPP_WABA_ID. Approval is still Meta's review
 * (usually minutes–hours); we submit + poll status, never touching WhatsApp Manager. */

export interface WaTemplate {
  id?: string;
  name: string;
  language: string;
  category: string; // MARKETING | UTILITY | AUTHENTICATION
  status: string;   // APPROVED | PENDING | REJECTED | ...
  body: string;     // BODY component text
  rejectedReason?: string;
  varLabels?: string[]; // friendly names for {{1}},{{2}}… (portal-side; not stored by Meta)
}

/** Pull one field out of a raw Graph error body into a readable message. */
function graphError(b: Record<string, unknown>, httpStatus: number): string {
  const err = b.error as Record<string, unknown> | undefined;
  if (!err) return `HTTP ${httpStatus}`;
  const ed = (err.error_data ?? {}) as Record<string, unknown>;
  return [err.message, err.code != null ? `code ${err.code}` : "", ed.details ?? err.error_user_msg ?? ""]
    .filter(Boolean).join(" · ") || `HTTP ${httpStatus}`;
}

async function graph(path: string, init: RequestInit): Promise<{ ok: boolean; body: any; status: number }> {
  const { cfg } = waConfig();
  const res = await fetch(withProof(`https://graph.facebook.com/${cfg.version}/${path}`, cfg.accessToken), {
    ...init,
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  let body: any = {};
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { ok: res.ok && !body?.error, body, status: res.status };
}

/** List all message templates on the WABA, newest concerns first. */
export async function waListTemplates(): Promise<{ ok: boolean; templates?: WaTemplate[]; error?: string }> {
  const { cfg, ready, missing } = waConfig();
  if (!ready) return { ok: false, error: `WhatsApp not configured — set ${missing.join(", ")}.` };
  if (!cfg.wabaId) return { ok: false, error: "Set WHATSAPP_WABA_ID (your WhatsApp Business Account id) to manage templates." };
  const { ok, body, status } = await graph(`${cfg.wabaId}/message_templates?fields=name,status,category,language,components,rejected_reason&limit=250`, { method: "GET" });
  if (!ok) return { ok: false, error: graphError(body, status) };
  const data: any[] = Array.isArray(body?.data) ? body.data : [];
  const templates: WaTemplate[] = data.map((t) => ({
    id: t.id, name: t.name, language: t.language, category: t.category, status: t.status,
    body: (Array.isArray(t.components) ? t.components.find((c: any) => c.type === "BODY")?.text : "") ?? "",
    rejectedReason: t.rejected_reason && t.rejected_reason !== "NONE" ? String(t.rejected_reason) : undefined,
  }));
  return { ok: true, templates };
}

/** Submit a new BODY-only template for approval. `examples` fill any {{n}} variables (Meta requires them). */
export async function waCreateTemplate(input: {
  name: string; language: string; category: string; body: string; examples?: string[];
}): Promise<{ ok: boolean; id?: string; status?: string; error?: string }> {
  const { cfg, ready, missing } = waConfig();
  if (!ready) return { ok: false, error: `WhatsApp not configured — set ${missing.join(", ")}.` };
  if (!cfg.wabaId) return { ok: false, error: "Set WHATSAPP_WABA_ID to create templates." };

  const name = (input.name ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (!name) return { ok: false, error: "Give the template a name (lowercase letters, numbers, underscores)." };
  const body = (input.body ?? "").trim();
  if (!body) return { ok: false, error: "Template body is empty." };

  // Meta requires example values for every {{n}} placeholder in the body.
  const varCount = new Set((body.match(/\{\{\s*(\d+)\s*\}\}/g) ?? []).map((m) => m.replace(/\D/g, ""))).size;
  const bodyComponent: Record<string, unknown> = { type: "BODY", text: body };
  if (varCount > 0) {
    const ex = (input.examples ?? []).map((s) => s.trim()).filter(Boolean);
    while (ex.length < varCount) ex.push("Sample");
    bodyComponent.example = { body_text: [ex.slice(0, varCount)] };
  }

  const { ok, body: resBody, status } = await graph(`${cfg.wabaId}/message_templates`, {
    method: "POST",
    body: JSON.stringify({
      name,
      language: (input.language ?? "en").trim() || "en",
      category: (input.category ?? "MARKETING").trim().toUpperCase(),
      components: [bodyComponent],
    }),
  });
  if (!ok) return { ok: false, error: graphError(resBody, status) };
  return { ok: true, id: String(resBody?.id ?? ""), status: String(resBody?.status ?? "PENDING") };
}

/** Delete a template by name. */
export async function waDeleteTemplate(name: string): Promise<{ ok: boolean; error?: string }> {
  const { cfg, ready } = waConfig();
  if (!ready) return { ok: false, error: "WhatsApp not configured." };
  if (!cfg.wabaId) return { ok: false, error: "Set WHATSAPP_WABA_ID." };
  const { ok, body, status } = await graph(`${cfg.wabaId}/message_templates?name=${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!ok) return { ok: false, error: graphError(body, status) };
  return { ok: true };
}
