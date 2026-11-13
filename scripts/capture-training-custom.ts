/**
 * Capture the Custom analytics training screenshots (public/training/ca-*.png) from the running dev server.
 * Creates ONE temporary report owned by a System Admin (two template pages), screenshots the list, builder,
 * viewer, click-to-filter, visual menu and share dialog, then deletes the report. Nothing is shared or pinned.
 * Signs a real session cookie via the app's own signSession — no passwords used (same as
 * scripts/capture-training.ts). Run the dev server first, then:
 *   BASE=http://localhost:3111 npx tsx scripts/capture-training-custom.ts
 */
import path from "node:path";
import fs from "node:fs";
import puppeteer, { type Page } from "puppeteer-core";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { signSession } from "../lib/session-token";
import { TEMPLATES } from "../lib/custom-analytics/templates";

const BASE = process.env.BASE ?? "http://localhost:3111";
const OUT = path.join(process.cwd(), "public", "training");
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => fs.existsSync(p))!;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const admin = await prisma.user.findFirst({ where: { role: "SYSADMIN", approvalStatus: "APPROVED", active: true }, select: { id: true, name: true, employeeCode: true } });
  if (!admin) throw new Error("No sysadmin user found.");
  const token = await signSession({ userId: admin.id, name: admin.name, employeeCode: admin.employeeCode ?? "", roleKey: "sysadmin", isAdmin: true, mustChangePassword: false });

  const sales = TEMPLATES.find((t) => t.id === "sales-overview")!.build();
  const visits = TEMPLATES.find((t) => t.id === "visit-quality")!.build();
  // Page 3: one table combining three tables (sales, visits, follow-ups) lined up by store.
  const byStore = {
    id: "bystore", name: "By store", filters: { datePreset: "thisFy" },
    visuals: [{
      id: "combo", type: "table", dataset: "sales", title: "Sales, visits and follow-ups by store", layout: { x: 0, y: 0, w: 12, h: 10 },
      dims: [{ field: "store" }], values: [{ field: "sales_value" }, { field: "visits", dataset: "visits" }, { field: "reviewed_pct", dataset: "visits" }, { field: "open", dataset: "actions" }, { field: "overdue", dataset: "actions" }],
    }],
  };
  const doc = { version: 1, pages: [{ ...sales.pages[0], name: "Sales" }, { ...visits.pages[0], name: "Visit reviews" }, byStore] };
  const report = await prisma.customReport.create({
    data: { ownerId: admin.id, ownerName: admin.name, title: "Sales & visits overview", description: "This FY at a glance", doc: doc as unknown as Prisma.InputJsonValue },
  });

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--window-size=1440,900"], defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 } });
  const page = await browser.newPage();
  await page.setCookie({ name: "verde_session", value: token, domain: "localhost", path: "/" });

  const go = async (url: string, settle = 6000) => { await page.goto(`${BASE}${url}`, { waitUntil: "networkidle2", timeout: 180000 }); await wait(settle); };
  const snap = async (file: string) => { await page.screenshot({ path: path.join(OUT, file) }); console.log(`  ✓ ${file}`); };
  const clickText = async (p: Page, sel: string, text: string) => {
    const ok = await p.evaluate((s, t) => {
      // The innermost matching element (shortest text) — not a page-level wrapper that happens to contain it.
      const el = [...document.querySelectorAll(s)].filter((b) => b.textContent?.trim().includes(t))
        .sort((a, b) => (a.textContent?.length ?? 0) - (b.textContent?.length ?? 0))[0] as HTMLElement | undefined;
      if (!el) return false;
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      el.click();
      return true;
    }, sel, text);
    await wait(900);
    return ok;
  };
  const step = async (name: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : e}`); } };

  try {
    await step("ca-home", async () => { await go("/analytics?tab=mine", 4000); await snap("ca-home.png"); });

    await step("ca-builder", async () => {
      await go(`/analytics/custom/${report.id}/edit`, 9000);
      await clickText(page, "div", "Sales by month"); // select a visual → Build panel shows its wells
      await wait(1500);
      await snap("ca-builder.png");
    });

    await step("ca-layout", async () => {
      await page.keyboard.press("Escape");
      await wait(800);
      await page.evaluate(() => window.scrollTo(0, 0));
      await snap("ca-layout.png");
    });

    await step("ca-combine", async () => {
      await clickText(page, "button", "By store");
      await wait(7000);
      await clickText(page, "div", "Sales, visits and follow-ups by store");
      await wait(1500);
      await snap("ca-combine.png");
    });

    await step("ca-viewer", async () => {
      await go(`/analytics/custom/${report.id}`, 9000);
      await snap("ca-viewer.png");
    });

    await step("ca-crossfilter", async () => {
      // Click the first slice in the donut's legend → the other visuals filter by it.
      await page.evaluate(() => {
        const btn = document.querySelector("svg[role=img] + div button, div.overflow-y-auto > button") as HTMLElement | null;
        btn?.click();
      });
      await wait(7000);
      await snap("ca-crossfilter.png");
    });

    await step("ca-visual-menu", async () => {
      await go(`/analytics/custom/${report.id}`, 8000);
      // Open the menu on the first chart (after the 4 KPI cards) so "Show as table" is visible too.
      await page.evaluate(() => { (document.querySelectorAll('button[aria-label="Visual options"]')[4] as HTMLElement | undefined)?.click(); });
      await wait(900);
      await snap("ca-visual-menu.png");
    });

    await step("ca-share", async () => {
      await go(`/analytics/custom/${report.id}`, 6000);
      await clickText(page, "button", "Share");
      await wait(3000);
      await snap("ca-share.png");
    });
  } finally {
    await browser.close();
    await prisma.customReport.delete({ where: { id: report.id } }).catch(() => {});
    await prisma.$disconnect();
    console.log("Done → temporary report removed");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
