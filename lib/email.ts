import { prisma } from "@/lib/prisma";
import { checkEmail } from "@/lib/email-validate";
import { getReviewSettings } from "@/lib/review-settings";

/**
 * Outbound email via Resend (REST, no SDK). Env-only config, like the ERP sales API:
 *   RESEND_API_KEY   — Resend API key (sending access, restricted to the verified domain)
 *   EMAIL_FROM       — e.g. "Verde Field Intel <noreply@verdeagrotech.com>" (domain verified in Resend)
 *   EMAIL_REPLY_TO   — optional; leave unset for no-reply (the footer tells readers not to reply)
 *   APP_URL          — optional; links in emails (defaults to the Vercel production URL, else localhost)
 * Automatic/scheduled email also needs the Settings switch (`email.enabled`) — off by default.
 *
 * Until RESEND_API_KEY exists nothing throws: `sendEmail` records the intent in EmailLog (ok = false,
 * "not configured"), writes one server log line and returns `skipped: "not-configured"`. Callers treat
 * that as a non-event, so the review queue, the bell, the weekly reports, the digests and the cron all
 * work with email off — and start delivering the moment the key is set. Dedupe only ever matches an
 * ok = true row, so nothing is "already sent" because of a not-configured attempt.
 * Every attempt is written to EmailLog. Plain module (not "use server").
 */

export type EmailType = "TEST" | "DIGEST" | "REPORT_READY" | "SLA_BREACH" | "GENERIC";

export function emailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const from = process.env.EMAIL_FROM?.trim() ?? "";
  const replyTo = process.env.EMAIL_REPLY_TO?.trim() ?? "";
  const missing = [!apiKey && "RESEND_API_KEY", !from && "EMAIL_FROM"].filter(Boolean) as string[];
  return { ready: missing.length === 0, missing, from, replyTo, apiKey };
}

export function appUrl(path = "/"): string {
  const env = process.env.APP_URL?.trim()
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}` : "")
    || "http://localhost:3000";
  const base = env.replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  type: EmailType;
  userId?: number | null;
  /** Scheduled sends: skip if an OK send with this key already exists; also Resend's Idempotency-Key. */
  dedupeKey?: string;
  sentByName?: string | null;
  /** Bypass the Settings on/off switch (used by the admin test / sample-email buttons only). */
  force?: boolean;
}

export interface SendEmailResult { ok: boolean; id?: string; skipped?: "disabled" | "duplicate" | "not-configured" | "bad-address"; error?: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Record an attempt we never handed to Resend (best-effort; a logging failure is not an error). */
async function logAttempt(input: SendEmailInput, to: string, error: string): Promise<void> {
  await prisma.emailLog.create({
    data: {
      to, subject: input.subject.slice(0, 250), type: input.type, userId: input.userId ?? null, ok: false,
      providerId: null, error: error.slice(0, 500), dedupeKey: input.dedupeKey ?? null,
      sentByName: input.sentByName ?? null,
    },
  }).catch(() => {});
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const cfg = emailConfig();
  const chk = checkEmail(input.to);
  if (!cfg.ready) {
    // No API key yet — leave a trail an admin can see in Settings, then carry on quietly.
    const error = `Email not configured: missing ${cfg.missing.join(", ")}`;
    console.warn(`[email] not sent (${input.type}) to ${chk.normalized || input.to}: ${error}`);
    await logAttempt(input, chk.normalized || input.to.trim().slice(0, 200), error);
    return { ok: false, skipped: "not-configured", error };
  }
  if (!input.force && !(await getReviewSettings()).emailEnabled) return { ok: false, skipped: "disabled", error: "Email is switched off in Settings." };
  if (!chk.ok || !chk.normalized) return { ok: false, skipped: "bad-address", error: chk.error ?? "No address." };
  const to = chk.normalized;

  if (input.dedupeKey) {
    const dup = await prisma.emailLog.findFirst({ where: { dedupeKey: input.dedupeKey, ok: true }, select: { id: true } }).catch(() => null);
    if (dup) return { ok: true, skipped: "duplicate" };
  }

  let ok = false, providerId: string | undefined, error: string | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
          ...(input.dedupeKey ? { "Idempotency-Key": input.dedupeKey.slice(0, 256) } : {}),
        },
        body: JSON.stringify({
          from: cfg.from,
          to: [to],
          subject: input.subject.slice(0, 250),
          html: input.html,
          ...(input.text != null ? { text: input.text } : {}),
          ...(cfg.replyTo ? { reply_to: cfg.replyTo } : {}),
          tags: [{ name: "type", value: input.type }],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      if (res.ok && body.id) { ok = true; providerId = body.id; error = undefined; break; }
      error = `${res.status} ${body.name ?? ""} ${body.message ?? ""}`.trim();
      if (res.status !== 429 && res.status < 500) break; // client error — retrying won't help
    } catch (e) {
      error = e instanceof Error ? e.message : "Network error";
    }
    await sleep(800 * (attempt + 1)); // 429 / 5xx / network: back off and retry
  }

  await prisma.emailLog.create({
    data: {
      to, subject: input.subject.slice(0, 250), type: input.type, userId: input.userId ?? null, ok,
      providerId: providerId ?? null, error: error?.slice(0, 500) ?? null, dedupeKey: input.dedupeKey ?? null,
      sentByName: input.sentByName ?? null,
    },
  }).catch(() => {});
  return ok ? { ok, id: providerId } : { ok, error };
}

/* ── Templates ── */

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The one email shell every Verde Field Intel message uses: brand header, title, body, optional button,
 * footer. Inline styles + table layout (what email clients actually render) — no Tailwind, so the brand
 * green is written out as #7DA02E. `bodyHtml` must already be escaped.
 */
export function emailLayout(o: { title: string; preheader?: string; bodyHtml: string; cta?: { label: string; href: string } }): string {
  const cta = o.cta
    ? `<tr><td style="padding:8px 28px 4px"><a href="${esc(o.cta.href)}" style="display:inline-block;background:#7DA02E;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 20px;border-radius:10px">${esc(o.cta.label)}</a></td></tr>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F3F4EF;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1A1C1A">
<span style="display:none;max-height:0;overflow:hidden">${esc(o.preheader ?? "")}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4EF;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E6E8E4">
<tr><td style="background:#5C7D22;padding:16px 28px;color:#ffffff;font-size:15px;font-weight:700;letter-spacing:.3px">Verde Field Intel · Verde Agrotech</td></tr>
<tr><td style="padding:24px 28px 6px;font-size:19px;font-weight:700">${esc(o.title)}</td></tr>
<tr><td style="padding:6px 28px 14px;font-size:14px;line-height:1.55;color:#33373A">${o.bodyHtml}</td></tr>
${cta}
<tr><td style="padding:22px 28px;font-size:11.5px;color:#8A8F8A;border-top:1px solid #EEF1EE">Automated message from Verde Field Intel — please do not reply; this inbox isn't monitored. Times are IST.</td></tr>
</table></td></tr></table></body></html>`;
}
