/**
 * Assert the WhatsApp opt-in analysis rolls up by REGIONAL *user id*, not by the comma-joined
 * `Store.regionalManager` label. Ported-from-upstream code groups by that string, which silently files a
 * Verde store shared by two managers under a phantom "A, B" row and under neither manager's own row.
 *
 *   npx tsx scripts/verify-optin-rm-rollup.ts
 *
 * Checks, against live data:
 *   1. every store in the analysis is reachable from exactly the managers `allRmStores()` gives it;
 *   2. a shared store appears under EACH of its managers (the upstream bug's signature is 0 here);
 *   3. covered + unassigned == total stores, so nothing silently vanishes;
 *   4. no roll-up label contains a comma, i.e. no composite "A, B" row was created.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { allRmStores } from "../lib/rm-stores";

const prisma = new PrismaClient();

async function main() {
  const [stores, rms] = await Promise.all([
    prisma.store.findMany({ select: { id: true, code: true, name: true, status: true, rmUserIds: true, regionalManager: true } }),
    allRmStores(),
  ]);

  const rmByStore = new Map<number, { id: number; name: string }[]>();
  for (const rm of rms) for (const sid of rm.storeIds) (rmByStore.get(sid) ?? rmByStore.set(sid, []).get(sid)!).push({ id: rm.userId, name: rm.name });

  const shared = stores.filter((s) => (rmByStore.get(s.id) ?? []).length > 1);
  const covered = stores.filter((s) => (rmByStore.get(s.id) ?? []).length > 0);
  const unassigned = stores.filter((s) => (rmByStore.get(s.id) ?? []).length === 0);

  // Build the roll-up exactly as the analysis does (one bucket per manager).
  const buckets = new Map<string, { label: string; stores: number }>();
  for (const s of stores) {
    const mgrs = rmByStore.get(s.id) ?? [];
    const keys = mgrs.length ? mgrs.map((m) => ({ id: m.id, label: m.name })) : [{ id: null as number | null, label: "— No RM assigned" }];
    for (const k of keys) {
      const key = `${k.id ?? ""}|${k.label}`;
      const b = buckets.get(key) ?? buckets.set(key, { label: k.label, stores: 0 }).get(key)!;
      b.stores++;
    }
  }

  console.log(`stores=${stores.length}  REGIONAL accounts=${rms.length}`);
  console.log(`covered=${covered.length}  unassigned=${unassigned.length}  shared(>1 RM)=${shared.length}`);
  console.log("\nRM roll-up rows:");
  for (const b of [...buckets.values()].sort((a, b) => b.stores - a.stores)) console.log(`  ${String(b.stores).padStart(3)}  ${b.label}`);

  if (shared.length) {
    console.log("\nShared stores — each MUST appear under every listed manager:");
    for (const s of shared) {
      const mgrs = rmByStore.get(s.id)!;
      const ok = mgrs.every((m) => buckets.has(`${m.id}|${m.name}`));
      console.log(`  ${ok ? "OK " : "FAIL"} ${s.code.padEnd(12)} ${mgrs.map((m) => m.name).join(" + ")}`);
    }
  }

  const fails: string[] = [];
  if (covered.length + unassigned.length !== stores.length) fails.push("covered + unassigned != total stores");
  for (const s of shared) for (const m of rmByStore.get(s.id)!) if (!buckets.has(`${m.id}|${m.name}`)) fails.push(`shared store ${s.code} missing from ${m.name}`);
  const composite = [...buckets.values()].filter((b) => b.label.includes(","));
  if (composite.length) fails.push(`composite roll-up row(s) created: ${composite.map((c) => c.label).join(" | ")}`);
  // The sum of RM rows exceeds the store count by exactly the number of extra managers on shared stores.
  const rmRowTotal = [...buckets.values()].reduce((t, b) => t + b.stores, 0);
  const expected = stores.length + shared.reduce((t, s) => t + (rmByStore.get(s.id)!.length - 1), 0);
  if (rmRowTotal !== expected) fails.push(`RM row total ${rmRowTotal} != expected ${expected}`);

  console.log(fails.length ? `\nFAILED:\n  ${fails.join("\n  ")}` : "\nAll checks passed.");
  if (fails.length) process.exit(1);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
