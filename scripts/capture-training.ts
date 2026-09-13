/**
 * Capture training screenshots by driving the running dev server with the installed Chrome
 * (puppeteer-core). Signs a real session cookie via the app's own signSession — no passwords used.
 * Run the dev server first, then: BASE=http://localhost:3111 npx tsx scripts/capture-training.ts
 */
import path from "node:path";
import fs from "node:fs";
import puppeteer from "puppeteer-core";
import { prisma } from "../lib/prisma";
import { signSession } from "../lib/session-token";

const BASE = process.env.BASE ?? "http://localhost:3111";
const OUT = path.join(process.cwd(), "public", "training");
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => fs.existsSync(p))!;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const admin = await prisma.user.findFirst({ where: { role: "SYSADMIN", approvalStatus: "APPROVED" }, select: { id: true, name: true, employeeCode: true } });
  if (!admin) throw new Error("No sysadmin user found.");
  const token = await signSession({ userId: admin.id, name: admin.name, employeeCode: admin.employeeCode ?? "", roleKey: "sysadmin", isAdmin: true, mustChangePassword: false });
  const farmer = await prisma.farmer.findFirst({ where: { source: "REAL", lifecycleSegment: { not: null } }, orderBy: { lifetimeSpend: "desc" }, select: { id: true } });

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--window-size=1440,900"], defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 } });
  const page = await browser.newPage();
  await page.setCookie({ name: "verde_session", value: token, domain: "localhost", path: "/" });

  const shot = async (file: string, url: string, prep?: () => Promise<void>, clip?: string) => {
    try {
      await page.goto(`${BASE}${url}`, { waitUntil: "networkidle2", timeout: 90000 });
      await new Promise((r) => setTimeout(r, 1800)); // let charts/leaflet settle
      if (prep) await prep();
      const target = clip ? await page.$(clip) : null;
      await (target ?? page).screenshot({ path: path.join(OUT, file) });
      console.log(`  ✓ ${file}`);
    } catch (e) {
      console.log(`  ✗ ${file}: ${e instanceof Error ? e.message : e}`);
    }
  };

  const clickText = async (text: string) => {
    await page.evaluate((t) => {
      const el = [...document.querySelectorAll("button,a")].find((b) => b.textContent?.trim().includes(t));
      (el as HTMLElement | undefined)?.click();
    }, text);
    await new Promise((r) => setTimeout(r, 700));
  };

  // Login page — a SEPARATE incognito context so the session cookie doesn't redirect us away.
  try {
    const ctx = await browser.createBrowserContext();
    const anon = await ctx.newPage();
    await anon.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await anon.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: 90000 });
    await new Promise((r) => setTimeout(r, 1200));
    await anon.screenshot({ path: path.join(OUT, "login.png") });
    await ctx.close();
    console.log("  ✓ login.png");
  } catch (e) { console.log("  ✗ login.png", e instanceof Error ? e.message : e); }

  await shot("analytics.png", "/analytics");
  await shot("topbar.png", "/analytics", undefined, "header");
  // Sidebar clip (left column) for nav.png.
  try {
    await page.goto(`${BASE}/analytics`, { waitUntil: "networkidle2", timeout: 90000 });
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(OUT, "nav.png"), clip: { x: 0, y: 0, width: 360, height: 900 } });
    console.log("  ✓ nav.png");
  } catch (e) { console.log("  ✗ nav.png", e instanceof Error ? e.message : e); }
  await shot("report-bug.png", "/analytics", () => clickText("Report a Bug"));
  await shot("farmers-list.png", "/farmers");
  if (farmer) await shot("farmer-detail.png", `/farmers/${farmer.id}`);
  await shot("new-visit-start.png", "/visits/new");
  await shot("map.png", "/map");
  await shot("bug-tracker.png", "/bugs");
  await shot("visit-repo.png", "/visits");
  await shot("campaigns.png", "/campaigns");
  await shot("comm-plan.png", "/campaigns", () => clickText("Comm Plan"));
  await shot("users.png", "/users");
  await shot("clusters.png", "/clusters");
  await shot("projects.png", "/projects");
  await shot("products.png", "/products");
  await shot("movement.png", "/movement");
  await shot("settings.png", "/settings");
  await shot("audit.png", "/audit");

  await browser.close();
  await prisma.$disconnect();
  console.log("Done →", OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
