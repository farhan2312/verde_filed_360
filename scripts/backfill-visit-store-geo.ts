/**
 * Second-pass backfill for Visit.storeId on visits whose FILLING OFFICER has no store mapped
 * (ASR / REGIONAL accounts with User.storeId = NULL) — the original by-officer backfill could not
 * resolve these because there was no officer store to copy. Resolves the servicing store from
 * signals about WHERE the visit happened, most-reliable first, and district-gated so a bogus GPS
 * can never assign a store in the wrong district:
 *   1. GPS-local     — nearest active store within 15 km AND in the farmer's district
 *   2. Officer+district — a store the SAME officer's already-resolved visits map to in that district
 *   3. Employee master — the officer's store from the Employee master, if in the farmer's district
 *   4. Namesake user  — a store-mapped User of the same name, if unique and in the farmer's district
 * The new farmer created by the visit (if any, and still store-less) inherits the same store.
 * Dry-run by default; pass --apply to write.  DATABASE_URL=... npx tsx scripts/backfill-visit-store-geo.ts [--apply]
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const R = 6371;
const km = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const dLat = ((bLat - aLat) * Math.PI) / 180, dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().trim();

async function main() {
  const stores = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, code, name, zone, lat, lng FROM "Store" WHERE status='Active'`);
  const storeById = new Map(stores.map((s) => [Number(s.id), s]));
  const geoStores = stores.filter((s) => s.lat != null && s.lng != null);

  // Officer -> Employee-master store (single, by name)
  const empRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT lower(btrim(e.name)) nm, e."storeId" sid FROM "Employee" e WHERE e."storeId" IS NOT NULL`);
  const empStores = new Map<string, Set<number>>();
  for (const e of empRows) { (empStores.get(e.nm) ?? empStores.set(e.nm, new Set()).get(e.nm)!).add(Number(e.sid)); }

  // Officer name -> store-mapped User stores (namesakes)
  const userRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT lower(btrim(u.name)) nm, u."storeId" sid FROM "User" u WHERE u."storeId" IS NOT NULL`);
  const userStores = new Map<string, Set<number>>();
  for (const u of userRows) { (userStores.get(u.nm) ?? userStores.set(u.nm, new Set()).get(u.nm)!).add(Number(u.sid)); }

  // Officer name + district -> store, learned from visits that ALREADY have a store
  const learnedRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT lower(btrim(v."officerName")) nm, lower(btrim(f.district)) dist, v."storeId" sid, COUNT(*)::int c
    FROM "Visit" v JOIN "Farmer" f ON f.id = v."farmerId"
    WHERE v."storeId" IS NOT NULL AND v."officerName" IS NOT NULL AND f.district IS NOT NULL
    GROUP BY 1,2,3`);
  const learned = new Map<string, Map<number, number>>(); // "nm|dist" -> storeId -> count
  for (const r of learnedRows) {
    const k = `${r.nm}|${r.dist}`;
    const m = learned.get(k) ?? learned.set(k, new Map()).get(k)!;
    m.set(Number(r.sid), (m.get(Number(r.sid)) ?? 0) + Number(r.c));
  }
  const uniqueInDistrict = (sids: Set<number> | undefined, dist: string) => {
    if (!sids) return null;
    const inDist = [...sids].filter((id) => norm(storeById.get(id)?.zone) === dist);
    return inDist.length === 1 ? inDist[0] : null;
  };

  // Store name -> id, keyed on the leading token before any "(district)" suffix, for village matches.
  const storeByBaseName = new Map<string, number[]>();
  for (const s of stores) {
    const base = norm(String(s.name).replace(/\s*\(.*$/, ""));
    if (base) (storeByBaseName.get(base) ?? storeByBaseName.set(base, []).get(base)!).push(Number(s.id));
  }

  const visits = await prisma.$queryRawUnsafe<any[]>(`
    SELECT v.id, v."officerName" officer, v."gpsLat" lat, v."gpsLng" lng,
      v."farmerId" fid, f.village, f.district, f."storeId" "farmerStore"
    FROM "Visit" v LEFT JOIN "Farmer" f ON f.id = v."farmerId"
    WHERE v."storeId" IS NULL ORDER BY v.id`);

  const decisions: any[] = [];
  let resolved = 0;
  for (const v of visits) {
    const dist = norm(v.district);
    let sid: number | null = null, basis = "";

    // 1) GPS-local, district-gated
    if (v.lat != null && v.lng != null && geoStores.length) {
      let best: any = null;
      for (const s of geoStores) { const d = km(v.lat, v.lng, s.lat, s.lng); if (!best || d < best.d) best = { s, d }; }
      if (best && best.d <= 15 && (!dist || norm(best.s.zone) === dist)) { sid = Number(best.s.id); basis = `GPS ${best.d.toFixed(1)}km`; }
    }
    // 1.5) Exact village-name -> store of the same base name (district-gated when known)
    if (sid == null && v.village) {
      const cand = (storeByBaseName.get(norm(v.village)) ?? []).filter((id) => !dist || norm(storeById.get(id)?.zone) === dist);
      if (cand.length === 1) { sid = cand[0]; basis = "village-name"; }
    }
    // 2) Officer + district (learned from stored visits)
    if (sid == null && dist) {
      const m = learned.get(`${norm(v.officer)}|${dist}`);
      if (m && m.size === 1) { sid = [...m.keys()][0]; basis = "officer+district"; }
    }
    // 3) Employee master (name -> store in district)
    if (sid == null && dist) { const e = uniqueInDistrict(empStores.get(norm(v.officer)), dist); if (e != null) { sid = e; basis = "employee-master"; } }
    // 4) Namesake user (name -> store in district)
    if (sid == null && dist) { const u = uniqueInDistrict(userStores.get(norm(v.officer)), dist); if (u != null) { sid = u; basis = "namesake-user"; } }

    if (sid != null) {
      resolved++;
      // let later visits by the same officer+district learn from this assignment too
      const k = `${norm(v.officer)}|${dist}`;
      if (dist) { const m = learned.get(k) ?? learned.set(k, new Map()).get(k)!; m.set(sid, (m.get(sid) ?? 0) + 1); }
    }
    decisions.push({
      id: Number(v.id), officer: v.officer, district: v.district || "—",
      store: sid != null ? storeById.get(sid)?.name : "*** UNRESOLVED ***", basis: basis || "—",
      fid: v.fid ? Number(v.fid) : null, farmerNeedsStore: v.fid != null && v.farmerStore == null,
    });
  }
  console.table(decisions);
  console.log(`\nResolved ${resolved}/${visits.length}; unresolved ${visits.length - resolved}`);

  if (!APPLY) { console.log("\nDRY RUN — re-run with --apply to write."); await prisma.$disconnect(); return; }

  let vw = 0, fw = 0;
  for (const d of decisions) {
    if (d.store === "*** UNRESOLVED ***") continue;
    const sid = stores.find((s) => s.name === d.store)!.id;
    await prisma.visit.update({ where: { id: d.id }, data: { storeId: Number(sid) } });
    vw++;
    if (d.farmerNeedsStore && d.fid) {
      await prisma.farmer.update({ where: { id: d.fid }, data: { storeId: Number(sid), storeCode: storeById.get(Number(sid))?.code ?? null } });
      fw++;
    }
  }
  console.log(`\nApplied: ${vw} visits updated, ${fw} store-less new farmers stamped.`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
