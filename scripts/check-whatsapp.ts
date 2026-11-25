/**
 * Check the WhatsApp Cloud API credentials in .env without ever printing them.
 *
 *   npx tsx scripts/check-whatsapp.ts
 *
 * Paste the values into .env first. This script reports only pass/fail, lengths and masked
 * fragments — never a token, never an app secret — so its output is safe to share or paste anywhere.
 *
 * It catches, in order:
 *   1. missing / blank keys;
 *   2. the classic paste mistakes (wrapping quotes, stray whitespace, a phone NUMBER pasted where the
 *      phone number ID belongs, the 24-hour token from the API Setup page);
 *   3. whether the token actually works, by calling Graph for the phone number  → proves
 *      whatsapp_business_messaging and that the token/number pair match;
 *   4. whether templates work, by listing them on the WABA → proves whatsapp_business_management,
 *      which is the scope most often missing and which fails ONLY on the templates screen;
 *   5. whether an appsecret_proof is required and whether the app secret satisfies it.
 */
import "dotenv/config";
import { createHmac } from "crypto";

const DEFAULT_VERSION = "v21.0";
const clean = (v: string | undefined) => (v ?? "").trim().replace(/^['"]|['"]$/g, "").trim();
const raw = (k: string) => process.env[k] ?? "";
const mask = (s: string) => (s.length <= 10 ? "*".repeat(s.length) : `${s.slice(0, 4)}…${s.slice(-4)} (${s.length} chars)`);

let fails = 0, warns = 0;
const ok = (m: string) => console.log(`  OK    ${m}`);
const bad = (m: string) => { fails++; console.log(`  FAIL  ${m}`); };
const warn = (m: string) => { warns++; console.log(`  WARN  ${m}`); };

async function main() {
  const token = clean(raw("WHATSAPP_ACCESS_TOKEN"));
  const phoneId = clean(raw("WHATSAPP_PHONE_NUMBER_ID"));
  const wabaId = clean(raw("WHATSAPP_WABA_ID"));
  const secret = clean(raw("WHATSAPP_APP_SECRET"));
  const businessId = clean(raw("WHATSAPP_BUSINESS_ID")); // Business portfolio id — only used to find the WABA id
  const verify = clean(raw("WHATSAPP_VERIFY_TOKEN"));
  const version = clean(raw("WHATSAPP_API_VERSION")) || DEFAULT_VERSION;

  console.log("\n1. Values present\n");
  for (const [k, v] of [["WHATSAPP_ACCESS_TOKEN", token], ["WHATSAPP_PHONE_NUMBER_ID", phoneId],
    ["WHATSAPP_WABA_ID", wabaId], ["WHATSAPP_APP_SECRET", secret], ["WHATSAPP_VERIFY_TOKEN", verify]] as const) {
    if (!v) { (k === "WHATSAPP_ACCESS_TOKEN" || k === "WHATSAPP_PHONE_NUMBER_ID" ? bad : warn)(`${k} is blank`); continue; }
    ok(`${k} set — ${k.includes("TOKEN") || k.includes("SECRET") ? mask(v) : v}`);
  }

  console.log("\n2. Common paste mistakes\n");
  for (const k of ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_WABA_ID", "WHATSAPP_APP_SECRET"]) {
    const r = raw(k);
    const inner = r.replace(/^['"]|['"]$/g, "");
    if (/^['"]|['"]$/.test(inner.trim())) warn(`${k} looks double-quoted — Meta will reject the extra quotes`);
    if (r && r !== r.trim()) warn(`${k} has leading/trailing whitespace (harmless here, but check Vercel)`);
  }
  if (token && !token.startsWith("EAA")) warn("Access token does not start with 'EAA' — is it really a Meta token?");
  if (phoneId && !/^\d+$/.test(phoneId)) bad("PHONE_NUMBER_ID must be digits only — it is an ID, not the phone number");
  else if (phoneId && (phoneId.length === 10 || phoneId.startsWith("91")) && phoneId.length <= 12)
    warn("PHONE_NUMBER_ID looks like an actual phone number. It should be the long numeric *ID* shown under the From dropdown.");
  if (wabaId && !/^\d+$/.test(wabaId)) bad("WABA_ID must be digits only");
  if (!token || !phoneId) { console.log("\nStopping — cannot call Meta without a token and phone number ID.\n"); process.exit(1); }

  const proof = secret ? createHmac("sha256", secret).update(token).digest("hex") : "";
  const url = (path: string) => `https://graph.facebook.com/${version}/${path}${path.includes("?") ? "&" : "?"}${proof ? `appsecret_proof=${proof}` : ""}`;
  const call = async (path: string) => {
    try {
      const res = await fetch(url(path), { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body: body as any };
    } catch (e) {
      return { status: 0, body: { error: { message: e instanceof Error ? e.message : String(e) } } };
    }
  };
  const errOf = (b: any) => `${b?.error?.message ?? "unknown error"}${b?.error?.code ? ` (code ${b.error.code})` : ""}`;

  console.log("\n3. Sending — can the token use this number?\n");
  const ph = await call(`${phoneId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`);
  if (ph.status === 200) {
    ok(`Number reachable: ${ph.body.display_phone_number ?? "?"} — "${ph.body.verified_name ?? "?"}"`);
    if (ph.body.quality_rating) ok(`Quality rating: ${ph.body.quality_rating}`);
  } else {
    bad(`Cannot read the phone number: ${errOf(ph.body)}`);
    const c = ph.body?.error?.code;
    if (c === 190) console.log("        → token expired/invalid. The 24h token from API Setup does this; use a System User permanent token.");
    if (c === 100 && /appsecret_proof/i.test(ph.body?.error?.message ?? "")) console.log("        → the app requires app secret proof; set WHATSAPP_APP_SECRET.");
    if (c === 200 || c === 10) console.log("        → the token lacks whatsapp_business_messaging, or the system user has no access to this number.");
  }

  console.log("\n4. Templates — is whatsapp_business_management present?\n");
  // The WABA id is NOT the Business portfolio id. If only the business id is known, ask Meta which
  // WhatsApp accounts that business owns — saves hunting for it in the UI, and proves they match.
  if (!wabaId && businessId) {
    const owned = await call(`${businessId}/owned_whatsapp_business_accounts?fields=id,name`);
    if (owned.status === 200) {
      const list: any[] = owned.body?.data ?? [];
      if (list.length === 1) ok(`Found the WABA id — put this in WHATSAPP_WABA_ID:  ${list[0].id}   ("${list[0].name ?? "?"}")`);
      else if (list.length > 1) { warn(`Business ${businessId} owns ${list.length} WhatsApp accounts — pick the Verde one:`); for (const x of list) console.log(`        · ${x.id}  "${x.name ?? "?"}"`); }
      else warn(`Business ${businessId} owns no WhatsApp Business Accounts — is that the right business id?`);
    } else warn(`Could not look the WABA id up from business ${businessId}: ${errOf(owned.body)}`);
  }
  // Fallback: the token itself knows which WABAs it was granted. debug_token reports granular_scopes,
  // whose target_ids for the whatsapp_business_* scopes ARE the WABA ids — no business_management needed.
  if (!wabaId) {
    const dbg = await call(`debug_token?input_token=${encodeURIComponent(token)}`);
    const scopes: any[] = dbg.body?.data?.granular_scopes ?? [];
    const ids = [...new Set(scopes.filter((s) => /^whatsapp_business_/.test(s?.scope ?? "")).flatMap((s) => s?.target_ids ?? []))] as string[];
    const granted: string[] = dbg.body?.data?.scopes ?? [];
    if (granted.length) ok(`Token scopes: ${granted.join(", ")}`);
    const waba = ids.filter((id) => id !== phoneId && id !== businessId);
    if (waba.length === 1) ok(`Found the WABA id — put this in WHATSAPP_WABA_ID:  ${waba[0]}`);
    else if (waba.length > 1) { warn("The token covers several WhatsApp accounts — pick the Verde one:"); for (const id of waba) console.log(`        · ${id}`); }
    else if (dbg.status !== 200) warn(`Could not inspect the token: ${errOf(dbg.body)}`);
  }
  if (!wabaId) warn("WHATSAPP_WABA_ID is blank — sending will work, the Templates tab stays disabled.");
  else {
    const t = await call(`${wabaId}/message_templates?fields=name,status&limit=5`);
    if (t.status === 200) {
      const list: any[] = t.body?.data ?? [];
      ok(`Template access works — ${list.length === 0 ? "no templates yet (expected before any are submitted)" : `${list.length} template(s) visible`}`);
      for (const x of list) console.log(`        · ${x.name} — ${x.status}`);
    } else {
      bad(`Cannot list templates: ${errOf(t.body)}`);
      console.log("        → almost always the missing whatsapp_business_management scope. Sending still works;");
      console.log("          only the Templates screen fails, which looks like an app bug but is a token scope.");
    }
  }

  console.log("\n5. Webhook\n");
  if (!verify) warn("WHATSAPP_VERIFY_TOKEN is blank — Meta's webhook handshake will return 403.");
  else ok(`Verify token set (${verify.length} chars). It must match Meta's webhook config byte-for-byte.`);
  if (!secret) warn("WHATSAPP_APP_SECRET is blank — inbound webhooks will not be signature-verified.");
  else ok("App secret set — inbound webhook signatures will be checked.");

  console.log(`\n${fails ? `FAILED — ${fails} problem(s)` : "All required checks passed"}${warns ? `, ${warns} warning(s)` : ""}.\n`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
