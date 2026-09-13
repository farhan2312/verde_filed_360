/**
 * Seed the curated DEMO records from the original design on top of the real data.
 *
 *   npm run db:seed   (run after db:push and db:import)
 *
 * Idempotent: demo stores/farmers/users are upserted; demo sales/visits/projects/
 * audit are cleared (by source) and recreated. Demo farmer codes (FARM003, …) also
 * exist in the real import — upserting enriches those real rows and tags them DEMO.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── enum maps ──────────────────────────────────────────────
const SEG: Record<string, "HIGH_VALUE" | "MEDIUM_VALUE" | "NEW_LOW" | "DORMANT"> = {
  "High Value": "HIGH_VALUE",
  "Medium Value": "MEDIUM_VALUE",
  "New/Low": "NEW_LOW",
  Dormant: "DORMANT",
};
const LEAD: Record<string, "NEW" | "CONTACTED" | "FOLLOWUP" | "CONVERTED" | "DORMANT"> = {
  New: "NEW",
  Contacted: "CONTACTED",
  "Follow-up": "FOLLOWUP",
  Converted: "CONVERTED",
  Dormant: "DORMANT",
};
const PROJ: Record<string, "PLANNED" | "ACTIVE" | "COMPLETED"> = {
  planned: "PLANNED",
  active: "ACTIVE",  
  completed: "COMPLETED",
};
const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};
const parseAmt = (s?: string | null) =>
  s ? Number(String(s).replace(/[^0-9]/g, "")) || null : null;
const parseDate = (s?: string | null): Date | null => {
  if (!s) return null;
  const [m, d] = s.split(" ");
  if (!(m in MONTHS)) return null;
  return new Date(Date.UTC(2026, MONTHS[m], Number(d) || 1));
};

// store code → assigned field officer (also the Visit Repo filter values)
const OFFICER_BY_STORE: Record<string, string> = {
  AGRO0012: "Raj Kumar",
  AGRO0015: "Raj Kumar",
  AGRO0018: "Amit Yadav",
  AGRO0019: "Vikram Singh",
  AGRO0028: "Deepak Verma",
  AGRO0031: "Deepak Verma",
};

// ── demo data (from docs/spec/00-global-data.json) ─────────
const DEMO_STORES = [
  { code: "AGRO0012", name: "Ram Nagar (Barabanki)", zone: "Barabanki", lat: 27.092272, lng: 81.403687, address: "Ram Nagar, Bahraich Road, Burwal, Near Dharam Kanta, Barabanki — 225205" },
  { code: "AGRO0015", name: "Haidergarh (Barabanki)", zone: "Barabanki", lat: 26.59957, lng: 81.373657, address: "Village Ansari, Haidergarh–Jagdishpur Road, Haidergarh, Barabanki — 227301" },
  { code: "AGRO0018", name: "Tiloi (Amethi)", zone: "Amethi", lat: 26.3902, lng: 81.474525, address: "Gram Tiloi, District Amethi — 229309" },
  { code: "AGRO0019", name: "Shivgarh (Raebareli)", zone: "Raibareilly", lat: 26.354658, lng: 82.286346, address: "Village Bhawanigarh, Bachrawan–Haidergarh Road, Raebareli — 229308" },
  { code: "AGRO0028", name: "Sanda Farm (Lakhimpur Kheri)", zone: "Lakhimpur Khiri", lat: 28.023666, lng: 80.799576, address: "Vill Sanda Post Mahewaganj, Lakhimpur Kheri — 261506" },
  { code: "AGRO0031", name: "Aliganj (Lakhimpur Kheri)", zone: "Lakhimpur Khiri", lat: 28.11385, lng: 80.592384, address: "Aliganj–Palia Marg, Aliganj, Lakhimpur Kheri — 262802" },
];

type DemoFarmer = {
  id: number; code: string; name: string; mobile: string; village: string;
  district: string; zone: string; crop: string; land: number; status: string;
  segment: string; storeCode: string; lat: number; lng: number;
  sales: { inv: string; date: string; items: string; amt: string; store: string }[];
  visitLog: { date: string; purpose: string; notes: string }[];
  issues: string[]; concerns: string; leadStatus: string;
};

const DEMO_FARMERS: DemoFarmer[] = [
  { id: 1, code: "FARM003", name: "A K Shukla", mobile: "9454299988", village: "Pipari", district: "Barabanki", zone: "Barabanki", crop: "Wheat", land: 8, status: "Contacted", segment: "Medium Value", storeCode: "AGRO0012", lat: 27.09, lng: 81.41, sales: [{ inv: "INV-3001", date: "Jun 10", items: "DAP 2 bags, Urea 3 bags", amt: "₹11,200", store: "Ram Nagar" }, { inv: "INV-2880", date: "May 22", items: "Wheat Seed 40kg", amt: "₹4,800", store: "Ram Nagar" }], visitLog: [{ date: "Jun 18", purpose: "Crop inspection", notes: "Wheat crop healthy. Recommended DAP top-up. Pest minimal." }, { date: "May 28", purpose: "Follow-up", notes: "Seed delivery confirmed. Field visit done." }], issues: ["Moisture stress"], concerns: "Needs irrigation support before Kharif sowing", leadStatus: "Contacted" },
  { id: 2, code: "FARM004", name: "A K Singh", mobile: "9415111825", village: "Umri", district: "Barabanki", zone: "Barabanki", crop: "Sugarcane", land: 12, status: "High Value", segment: "High Value", storeCode: "AGRO0012", lat: 27.07, lng: 81.39, sales: [{ inv: "INV-3012", date: "Jun 14", items: "Bio Fertilizer 10kg, PGR 2L", amt: "₹8,600", store: "Ram Nagar" }, { inv: "INV-2990", date: "Jun 1", items: "Sugarcane Sets 200kg, NPK", amt: "₹22,400", store: "Ram Nagar" }], visitLog: [{ date: "Jun 15", purpose: "Season review", notes: "Kharif sugarcane excellent stand. Discussed contract farming." }, { date: "Jun 5", purpose: "Crop advisory", notes: "Germination 88%. Micronutrient advisory given." }], issues: [], concerns: "Interested in FPO enrollment", leadStatus: "Follow-up" },
  { id: 3, code: "FARM015", name: "A P Singh", mobile: "9792494095", village: "Bashant Pur", district: "Barabanki", zone: "Barabanki", crop: "Rice", land: 10, status: "Follow-up", segment: "Medium Value", storeCode: "AGRO0015", lat: 26.60, lng: 81.37, sales: [{ inv: "INV-3020", date: "Jun 12", items: "Paddy Seed 30kg, Zinc Sulphate", amt: "₹9,200", store: "Haidergarh" }], visitLog: [{ date: "Jun 16", purpose: "Crop monitoring", notes: "Rice transplanting complete. Weed management advisory given." }], issues: ["Weed pressure"], concerns: "Canal water supply irregular", leadStatus: "Follow-up" },
  { id: 4, code: "FARM024", name: "Aadarsh Dwivedi", mobile: "9956174005", village: "Rai Pur", district: "Barabanki", zone: "Barabanki", crop: "Mustard", land: 6, status: "New", segment: "New/Low", storeCode: "AGRO0015", lat: 26.61, lng: 81.38, sales: [], visitLog: [{ date: "Jun 19", purpose: "First visit", notes: "New farmer registration. 6 acres sandy soil. Interested in mustard advisory and insurance." }], issues: ["Soil fertility low"], concerns: "First-time buyer — needs onboarding", leadStatus: "New" },
  { id: 5, code: "FARM009", name: "A B Singh", mobile: "9919062846", village: "Tiloi", district: "Amethi", zone: "Amethi", crop: "Wheat", land: 15, status: "High Value", segment: "High Value", storeCode: "AGRO0018", lat: 26.39, lng: 81.47, sales: [{ inv: "INV-3031", date: "Jun 8", items: "DAP 4 bags, Fungicide 1L", amt: "₹16,800", store: "Tiloi" }, { inv: "INV-2950", date: "May 18", items: "Wheat Seed 60kg", amt: "₹7,200", store: "Tiloi" }], visitLog: [{ date: "Jun 11", purpose: "Field audit", notes: "15-acre wheat field excellent. Recommended pre-Kharif soil test." }, { date: "May 20", purpose: "Seed delivery", notes: "Confirmed delivery and sowing schedule." }], issues: [], concerns: "Wants Kharif crop planning session", leadStatus: "Converted" },
  { id: 6, code: "FARM018", name: "Aadam Sher", mobile: "9455348497", village: "Pure Shiv Singh", district: "Amethi", zone: "Amethi", crop: "Potato", land: 5, status: "Dormant", segment: "Dormant", storeCode: "AGRO0018", lat: 26.41, lng: 81.46, sales: [{ inv: "INV-2601", date: "Feb 10", items: "Potato Seed 150kg", amt: "₹9,000", store: "Tiloi" }], visitLog: [{ date: "Feb 12", purpose: "Planting advisory", notes: "Potato planting done. Last contact — re-engagement needed." }], issues: ["Buying from competitor"], concerns: "Price sensitivity — lost to local dealer", leadStatus: "Dormant" },
  { id: 7, code: "FARM034", name: "Aadesh Kumar", mobile: "6388309668", village: "Pipri", district: "Raebareli", zone: "Raibareilly", crop: "Rice", land: 7, status: "Contacted", segment: "Medium Value", storeCode: "AGRO0019", lat: 26.35, lng: 82.29, sales: [{ inv: "INV-3040", date: "Jun 13", items: "Paddy Seed 25kg, Herbicide 1L", amt: "₹7,400", store: "Shivgarh" }], visitLog: [{ date: "Jun 17", purpose: "Follow-up", notes: "Irrigation issue — canal delayed. Bore well financing discussed." }], issues: ["Irrigation deficit"], concerns: "Needs bore well financing guidance", leadStatus: "Contacted" },
  { id: 8, code: "FARM1000", name: "Adesh Kumar Srivastav", mobile: "6306675288", village: "Daulat Kheda", district: "Raebareli", zone: "Raibareilly", crop: "Sugarcane", land: 11, status: "Follow-up", segment: "High Value", storeCode: "AGRO0019", lat: 26.36, lng: 82.28, sales: [{ inv: "INV-3050", date: "Jun 9", items: "Bio Fertilizer 8kg, PGR 2L", amt: "₹7,200", store: "Shivgarh" }, { inv: "INV-2970", date: "May 25", items: "Sugarcane Sets 300kg", amt: "₹18,000", store: "Shivgarh" }], visitLog: [{ date: "Jun 14", purpose: "Crop advisory", notes: "Sugarcane germination 82%. Soil nutrients adequate. Discussed contract farming." }, { date: "May 28", purpose: "Planting visit", notes: "Sowing confirmed. Good crop stand." }], issues: [], concerns: "Contract farming interest — follow up with procurement team", leadStatus: "Follow-up" },
  { id: 9, code: "FARM1009", name: "Adil Khan", mobile: "9216907147", village: "Hajrata Pur", district: "Lakhimpur Kheri", zone: "Lakhimpur Khiri", crop: "Wheat", land: 9, status: "Contacted", segment: "Medium Value", storeCode: "AGRO0028", lat: 28.02, lng: 80.80, sales: [{ inv: "INV-3060", date: "Jun 11", items: "Urea 4 bags, Fungicide 500ml", amt: "₹8,400", store: "Sanda Farm" }], visitLog: [{ date: "Jun 15", purpose: "Crop inspection", notes: "Wheat standing crop. Fungal symptoms on leaves — fungicide applied." }], issues: ["Fungal disease"], concerns: "Spray equipment access needed", leadStatus: "Contacted" },
  { id: 10, code: "FARM10111", name: "Ashutosh Verma", mobile: "9040107431", village: "Sanda Farm", district: "Lakhimpur Kheri", zone: "Lakhimpur Khiri", crop: "Sugarcane", land: 18, status: "High Value", segment: "High Value", storeCode: "AGRO0028", lat: 28.03, lng: 80.79, sales: [{ inv: "INV-3071", date: "Jun 6", items: "NPK 10 bags, PGR 3L", amt: "₹28,600", store: "Sanda Farm" }, { inv: "INV-2980", date: "May 15", items: "Sugarcane Sets 400kg", amt: "₹24,000", store: "Sanda Farm" }], visitLog: [{ date: "Jun 10", purpose: "Field review", notes: "18 acres excellent stand. High-value account. Discussed Kharif expansion." }, { date: "May 18", purpose: "Planting advisory", notes: "Sowing schedule set. All inputs delivered on time." }], issues: [], concerns: "Expansion plan — 5 more acres next season", leadStatus: "Converted" },
  { id: 11, code: "FARM027", name: "Aadarsh Verma", mobile: "9452506526", village: "Sariya", district: "Lakhimpur Kheri", zone: "Lakhimpur Khiri", crop: "Rice", land: 8, status: "Follow-up", segment: "Medium Value", storeCode: "AGRO0031", lat: 28.11, lng: 80.59, sales: [{ inv: "INV-3080", date: "Jun 13", items: "Paddy Seed 30kg, Zinc 2kg", amt: "₹8,200", store: "Aliganj" }], visitLog: [{ date: "Jun 17", purpose: "Crop monitoring", notes: "Rice transplanting in progress. Water logging risk discussed." }], issues: ["Water logging risk"], concerns: "Needs drainage advisory", leadStatus: "Follow-up" },
  { id: 12, code: "FARM093", name: "Aaminudeen", mobile: "9554718092", village: "Tajpur", district: "Lakhimpur Kheri", zone: "Lakhimpur Khiri", crop: "Wheat", land: 5, status: "New", segment: "New/Low", storeCode: "AGRO0031", lat: 28.10, lng: 80.60, sales: [], visitLog: [{ date: "Jun 19", purpose: "First visit", notes: "New registration. 5 acres. Interested in wheat variety advisory and soil testing." }], issues: ["Soil pH high"], concerns: "New farmer — needs soil test and crop planning", leadStatus: "New" },
];

const DEMO_PROJECTS = [
  { title: "Issues & Concerns — June 2026 — Field Action", status: "planned", owner: "Amit Yadav", due: "2026-06-30", group: "Farmers with active issues", farmerIds: [2, 5, 8], farmers: ["Suresh Yadav", "Mahesh Patel", "Arun Sharma"], updates: [{ text: "Identified 3 farmers in Fatehabad store territory with active pest and irrigation issues. Coordinating soil and water advisory.", by: "Amit Yadav", date: "Jun 22" }, { text: "Scheduled group visit for Jun 25. Soil test kits arranged from Fatehabad store.", by: "Rajesh Verma", date: "Jun 23" }] },
  { title: "Kharif Pest Control Drive — Agra", status: "active", owner: "Raj Kumar", due: "2026-07-15", group: "Pest-affected wheat farmers (Agra)", farmerIds: [1, 3, 6, 10], farmers: ["Ramesh Kumar", "Pradeep Singh", "Anil Verma", "Bharat Mishra"], updates: [{ text: "Identified 28 farmers with active pest reports in Agra block. Prioritizing wheat growers with >5 acre holdings.", by: "Rajesh Verma", date: "Jun 20" }, { text: "Raj Kumar assigned as field lead. First batch of spray kits dispatched to Chandpur store.", by: "Rajesh Verma", date: "Jun 18" }] },
  { title: "Sugarcane Yield Improvement — Firozabad", status: "active", owner: "Amit Yadav", due: "2026-08-30", group: "Sugarcane growers (Firozabad, Mainpuri)", farmerIds: [2, 11], farmers: ["Suresh Yadav", "Govind Pal"], updates: [{ text: "Soil testing completed for 12 farmers. 8 show nutrient deficiency — recommending micronutrient supplementation.", by: "Amit Yadav", date: "Jun 19" }] },
  { title: "Potato Cold Storage Awareness — Mainpuri", status: "planned", owner: "Vikram Singh", due: "2026-07-30", group: "Potato farmers (Mainpuri)", farmerIds: [5, 12], farmers: ["Mahesh Patel", "Harish Rawat"], updates: [] },
  { title: "FPO Enrollment Campaign", status: "completed", owner: "Deepak Verma", due: "2026-06-10", group: "Non-FPO farmers with >10 Bigha", farmerIds: [1, 5, 8, 10], farmers: ["Ramesh Kumar", "Mahesh Patel", "Rakesh Gupta", "Bharat Mishra"], updates: [{ text: "Campaign completed. 14 out of 22 targeted farmers enrolled in local FPO. Remaining 8 need follow-up.", by: "Deepak Verma", date: "Jun 10" }, { text: "Enrollment forms distributed. Community meeting held at Jaitpur village hall.", by: "Deepak Verma", date: "Jun 5" }, { text: "Project kickoff — identified 22 eligible farmers across Etah and Mainpuri.", by: "Rajesh Verma", date: "May 28" }] },
];

const DEMO_USERS = [
  { init: "RV", name: "Rajesh Verma", email: "rajesh@verdeagrotech.com", roleLabel: "Regional Manager", role: "REGIONAL", territory: "Agra Region", lastActive: "2 min ago", visitsMtd: "284", status: "Active", gradA: "#93B93C", gradB: "#EDA942" },
  { init: "RK", name: "Raj Kumar", email: "raj.kumar@verdeagrotech.com", roleLabel: "Agri Officer", role: "ASR", territory: "Agra — Chandpur, Khandauli", lastActive: "15 min ago", visitsMtd: "94", status: "Active", gradA: "#1565C0", gradB: "#42A5F5" },
  { init: "AY", name: "Amit Yadav", email: "amit.yadav@verdeagrotech.com", roleLabel: "Agri Officer", role: "ASR", territory: "Firozabad — Barauli, Tundla", lastActive: "1 hr ago", visitsMtd: "87", status: "Active", gradA: "#7DA02E", gradB: "#BDD67F" },
  { init: "VS", name: "Vikram Singh", email: "vikram.singh@verdeagrotech.com", roleLabel: "Agri Officer", role: "ASR", territory: "Mainpuri — Sikandra, Jaitpur", lastActive: "3 hrs ago", visitsMtd: "82", status: "Active", gradA: "#93B93C", gradB: "#CCE09A" },
  { init: "DV", name: "Deepak Verma", email: "deepak.verma@verdeagrotech.com", roleLabel: "Agri Officer", role: "ASR", territory: "Etah — Kasganj", lastActive: "Today", visitsMtd: "76", status: "Active", gradA: "#4527A0", gradB: "#9575CD" },
  { init: "VM", name: "Vikash Mehta", email: "vikash@verdeagrotech.com", roleLabel: "System Admin", role: "SYSADMIN", territory: "All Regions", lastActive: "Yesterday", visitsMtd: "—", status: "Active", gradA: "#E65100", gradB: "#FF8F00" },
  { init: "SG", name: "Sunil Gupta", email: "sunil.gupta@verdeagrotech.com", roleLabel: "Agri Officer", role: "ASR", territory: "Mathura", lastActive: "5 days ago", visitsMtd: "71", status: "Inactive", gradA: "#9E9E9E", gradB: "#BDBDBD" },
];

const AUDIT = [
  { timestamp: "Jun 22, 10:42", user: "Raj Kumar", action: "CREATE", details: "New visit entry — Farmer: Sanjay Tiwari, Village: Achhnera", ip: "192.168.1.45" },
  { timestamp: "Jun 22, 09:15", user: "Rajesh Verma", action: "UPDATE", details: "Action project status changed: Kharif Pest Control → Active", ip: "192.168.1.20" },
  { timestamp: "Jun 22, 08:30", user: "Amit Yadav", action: "CREATE", details: "New farmer registered — Harish Rawat, Tundla, Firozabad", ip: "10.0.0.88" },
  { timestamp: "Jun 21, 18:45", user: "Vikash Mehta", action: "CONFIG", details: "System setting changed: GPS Mandatory → Enabled", ip: "192.168.1.10" },
  { timestamp: "Jun 21, 16:20", user: "Dr. Anita Sharma", action: "EXPORT", details: "Data export: All farmer records — Agra Region (CSV, 1,284 rows)", ip: "10.0.0.12" },
  { timestamp: "Jun 21, 14:10", user: "Vikram Singh", action: "CREATE", details: "New visit entry — Farmer: Mahesh Patel, Village: Sikandra", ip: "10.0.0.55" },
  { timestamp: "Jun 21, 11:00", user: "Vikash Mehta", action: "DELETE", details: "Removed inactive user: Ravi Sharma (Agri Officer, Hathras)", ip: "192.168.1.10" },
  { timestamp: "Jun 20, 17:30", user: "Deepak Verma", action: "UPDATE", details: "Lead status changed: Govind Pal → Converted", ip: "10.0.0.88" },
];

const SETTINGS: Record<string, string> = {
  "kpi.data": JSON.stringify({ visits: "1,024", farmers: "22,210", convRate: "38.7%", followups: "34" }),
  "config.primaryIdLabel": "Mobile Number",
  "config.visitReasonRequired": "true",
  "config.requireGPS": "true",
  "config.defaultDistrict": "Agra",
};

// ── seeding ────────────────────────────────────────────────
async function main() {
  console.log("Seeding demo records …");

  // 1. demo stores (ensure exist for FK; enrich GPS)
  for (const s of DEMO_STORES) {
    await prisma.store.upsert({
      where: { code: s.code },
      update: { lat: s.lat, lng: s.lng },
      create: { code: s.code, name: s.name, zone: s.zone, address: s.address, lat: s.lat, lng: s.lng, status: "Active", source: "REAL" },
    });
  }
  const stores = await prisma.store.findMany({ select: { id: true, code: true } });
  const storeIdByCode = new Map(stores.map((s) => [s.code, s.id]));

  // 2. demo farmers (enrich real rows)
  const dbIdByDemoId = new Map<number, number>();
  for (const f of DEMO_FARMERS) {
    const storeId = storeIdByCode.get(f.storeCode) ?? null;
    const data = {
      name: f.name, mobile: f.mobile, village: f.village, district: f.district,
      zone: f.zone, crop: f.crop, land: f.land, status: f.status,
      segment: SEG[f.segment], leadStatus: LEAD[f.leadStatus], concerns: f.concerns,
      issues: f.issues, lat: f.lat, lng: f.lng, storeCode: f.storeCode, storeId,
      source: "DEMO" as const,
    };
    const row = await prisma.farmer.upsert({
      where: { code: f.code },
      update: data,
      create: { code: f.code, ...data },
    });
    dbIdByDemoId.set(f.id, row.id);
  }
  console.log(`  ✓ demo farmers: ${DEMO_FARMERS.length}`);

  // 3. sales + 4. visits (clear demo, recreate)
  const demoFarmerIds = [...dbIdByDemoId.values()];
  await prisma.sale.deleteMany({ where: { farmerId: { in: demoFarmerIds }, source: "DEMO" } });
  await prisma.visit.deleteMany({ where: { source: "DEMO" } });

  let saleCount = 0;
  let visitCount = 0;
  for (const f of DEMO_FARMERS) {
    const farmerId = dbIdByDemoId.get(f.id)!;
    const storeId = storeIdByCode.get(f.storeCode) ?? null;
    const officer = OFFICER_BY_STORE[f.storeCode] ?? null;
    if (f.sales.length) {
      await prisma.sale.createMany({
        data: f.sales.map((s) => ({
          farmerId, invoice: s.inv, date: s.date, items: s.items,
          amount: s.amt, amountNum: parseAmt(s.amt), store: s.store,
          source: "DEMO" as const,
        })),
      });
      saleCount += f.sales.length;
    }
    for (const v of f.visitLog) {
      await prisma.visit.create({
        data: {
          farmerId, storeId, officerName: officer, date: v.date,
          visitedAt: parseDate(v.date), purpose: v.purpose, notes: v.notes,
          type: v.purpose, segment: SEG[f.segment], leadStatus: LEAD[f.leadStatus],
          source: "DEMO",
        },
      });
      visitCount++;
    }
  }
  console.log(`  ✓ demo sales: ${saleCount}, demo visits: ${visitCount}`);

  // 5. projects (clear demo, recreate with mapped farmer ids)
  await prisma.project.deleteMany({ where: { source: "DEMO" } });
  for (const p of DEMO_PROJECTS) {
    await prisma.project.create({
      data: {
        title: p.title, status: PROJ[p.status], owner: p.owner, due: p.due,
        groupName: p.group,
        farmerIds: p.farmerIds.map((id) => dbIdByDemoId.get(id) ?? id),
        farmerNames: p.farmers, source: "DEMO",
        updates: { create: p.updates.map((u) => ({ text: u.text, by: u.by, date: u.date })) },
      },
    });
  }
  console.log(`  ✓ demo projects: ${DEMO_PROJECTS.length}`);

  // 6. users
  for (const u of DEMO_USERS) {
    const data = {
      name: u.name, role: u.role as never, roleLabel: u.roleLabel, initials: u.init,
      gradA: u.gradA, gradB: u.gradB, territory: u.territory, lastActive: u.lastActive,
      visitsMtd: u.visitsMtd, active: u.status === "Active", source: "DEMO" as const,
      approvalStatus: "APPROVED" as const,
    };
    await prisma.user.upsert({
      where: { email: u.email },
      update: data,
      create: { email: u.email, ...data },
    });
  }
  console.log(`  ✓ demo users: ${DEMO_USERS.length}`);

  // 7. audit log (clear + recreate)
  await prisma.auditLog.deleteMany({});
  await prisma.auditLog.createMany({
    data: AUDIT.map((a) => ({
      actor: a.user, action: a.action, detail: a.details,
      ip: a.ip, displayTs: a.timestamp,
    })),
  });
  console.log(`  ✓ audit log: ${AUDIT.length}`);

  // 7b. Season field option (design-only set, absent from the workbook)
  await prisma.fieldOption.upsert({
    where: { fieldName: "Season" },
    update: { options: ["Kharif", "Rabi", "Zaid"], inputType: "dropdown" },
    create: { fieldName: "Season", options: ["Kharif", "Rabi", "Zaid"], inputType: "dropdown" },
  });
  console.log("  ✓ field option: Season");

  // 8. settings
  for (const [key, value] of Object.entries(SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  console.log(`  ✓ settings: ${Object.keys(SETTINGS).length}`);

  console.log("Demo seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
