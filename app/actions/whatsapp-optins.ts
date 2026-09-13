"use server";

import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getScope, canManage } from "@/lib/scope";
import { buildWorkbookB64 } from "@/lib/xlsx-export";

async function adminOnly(): Promise<boolean> {
  const { role } = await getScope();
  return canManage(role);
}

export interface OptInRow {
  id: number;
  mobile: string;
  waId: string | null; // full international number (country code + number) as Meta reports it
  name: string;
  farmerId: number | null;
  farmerName: string;
  lastMessage: string;
  messageCount: number;
  optInAt: string;
  lastMessageAt: string;
}

/** WhatsApp opt-ins (people who messaged our number / scanned the QR). Admin-only. */
export async function listOptIns(q?: string): Promise<{ total: number; rows: OptInRow[] }> {
  if (!(await adminOnly())) return { total: 0, rows: [] };
  const term = (q ?? "").trim();
  const digits = term.replace(/\D/g, "");
  const where = term
    ? { OR: [
        { mobile: { contains: digits || term } },
        ...(digits ? [{ waId: { contains: digits } }] : []),
        { name: { contains: term, mode: "insensitive" as const } },
      ] }
    : {};
  const [total, rows] = await Promise.all([
    prisma.whatsAppOptIn.count(),
    prisma.whatsAppOptIn.findMany({ where, orderBy: { lastMessageAt: "desc" }, take: 5000 }),
  ]);
  const farmerIds = rows.map((r) => r.farmerId).filter((x): x is number => x != null);
  const farmers = farmerIds.length
    ? new Map((await prisma.farmer.findMany({ where: { id: { in: farmerIds } }, select: { id: true, name: true } })).map((f) => [f.id, f.name]))
    : new Map<number, string>();
  return {
    total,
    rows: rows.map((r) => ({
      id: r.id, mobile: r.mobile, waId: r.waId ?? null, name: r.name ?? "", farmerId: r.farmerId,
      farmerName: r.farmerId ? farmers.get(r.farmerId) ?? "" : "",
      lastMessage: r.lastMessage ?? "", messageCount: r.messageCount,
      optInAt: r.optInAt.toISOString(), lastMessageAt: r.lastMessageAt.toISOString(),
    })),
  };
}

/** Excel export of the opt-in list (respects the same search term). Admin-only. */
export async function exportOptInsXlsx(q?: string): Promise<{ ok: boolean; filename?: string; b64?: string; error?: string }> {
  if (!(await adminOnly())) return { ok: false, error: "Admins only." };
  const { rows } = await listOptIns(q);
  const header = ["Number", "Name", "Type", "Farmer name", "Messages", "Last message", "Opted in", "Last message at"];
  const body = rows.map((r) => [
    r.waId ? `+${r.waId.replace(/\D/g, "")}` : r.mobile,
    r.name || "",
    r.farmerId ? "Registered farmer" : "Not registered farmer",
    r.farmerName || "",
    r.messageCount,
    r.lastMessage || "",
    r.optInAt.slice(0, 10),
    r.lastMessageAt.slice(0, 10),
  ]);
  const b64 = buildWorkbookB64([{ name: "WhatsApp opt-ins", rows: [header, ...body] }]);
  const today = new Date().toISOString().slice(0, 10);
  return { ok: true, filename: `whatsapp-optins-${today}.xlsx`, b64 };
}

const OPTIN_NUMBER_KEY = "whatsapp.optInNumber";
const OPTIN_MESSAGE_KEY = "whatsapp.optInMessage";
const DEFAULT_OPTIN_MESSAGE = "Hi Verde Agrotech, I'd like to receive product updates & offers on WhatsApp.";

/** wa.me link + QR PNG data URL for a number + message (no persistence). "" number → nulls. */
export async function buildOptInQr(businessNumber: string, message: string): Promise<{ link: string | null; qr: string | null }> {
  const num = (businessNumber ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (num.length < 10) return { link: null, qr: null };
  const to = num.length === 10 ? `91${num}` : num; // default India code if a bare 10-digit was given
  const msg = (message ?? "").trim();
  const link = `https://wa.me/${to}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`;
  try {
    const qr = await QRCode.toDataURL(link, { margin: 1, width: 512, errorCorrectionLevel: "M" });
    return { link, qr };
  } catch {
    return { link, qr: null };
  }
}

/** Ad-hoc QR generator for the Settings card. Admin-only. */
export async function generateOptInQr(input: { businessNumber: string; message: string }): Promise<{ ok: boolean; link?: string; qr?: string; error?: string }> {
  if (!(await adminOnly())) return { ok: false, error: "Admins only." };
  const num = (input.businessNumber ?? "").replace(/\D/g, "");
  if (num.length < 10) return { ok: false, error: "Enter a valid business WhatsApp number (with country code, e.g. 91XXXXXXXXXX)." };
  const { link, qr } = await buildOptInQr(input.businessNumber, input.message);
  return qr ? { ok: true, link: link ?? "", qr } : { ok: false, error: "Could not generate the QR." };
}

/** The saved opt-in QR config used on the visit form's last page. */
export async function getOptInQrConfig(): Promise<{ number: string; message: string; qr: string | null; link: string | null }> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [OPTIN_NUMBER_KEY, OPTIN_MESSAGE_KEY] } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const number = map.get(OPTIN_NUMBER_KEY) ?? "";
  const message = map.get(OPTIN_MESSAGE_KEY) ?? DEFAULT_OPTIN_MESSAGE;
  const { qr, link } = number ? await buildOptInQr(number, message) : { qr: null, link: null };
  return { number, message, qr, link };
}

/** Save the number + message shown as the visit-form opt-in QR. Admin-only. */
export async function saveOptInQrConfig(input: { number: string; message: string }): Promise<{ ok: boolean; error?: string }> {
  if (!(await adminOnly())) return { ok: false, error: "Admins only." };
  const num = (input.number ?? "").replace(/\D/g, "");
  if (num && num.length < 10) return { ok: false, error: "Enter a valid number with country code, or clear it to hide the QR." };
  try {
    await prisma.setting.upsert({ where: { key: OPTIN_NUMBER_KEY }, create: { key: OPTIN_NUMBER_KEY, value: num }, update: { value: num } });
    await prisma.setting.upsert({ where: { key: OPTIN_MESSAGE_KEY }, create: { key: OPTIN_MESSAGE_KEY, value: (input.message ?? "").trim() }, update: { value: (input.message ?? "").trim() } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}
