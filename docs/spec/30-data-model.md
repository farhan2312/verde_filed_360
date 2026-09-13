# 30 — Data Model (UA Field Intel)

How the Prisma/Postgres schema holds **both** the real imported spreadsheet data and the
curated demo records from the original design, how every screen's analytics/KPIs/funnel/leads
numbers are derived, and the exact seed plan.

Inputs reconciled here:
- `prisma/schema.prisma` (current schema)
- `docs/spec/00-global-data.json` + `.md` (every demo dataset, verbatim)
- `scripts/import-data.ts` (real import) + `scripts/seed-demo.ts` (demo seed)
- Real workbooks `data/master-data.xlsx`, `data/field-options.xlsx` (column names verified below)

> Convention: every table carries a `source` enum (`REAL` | `DEMO`) so imported and curated
> rows coexist and either set can be re-seeded idempotently. Demo farmer codes (`FARM003`, …)
> **also exist in the 88k real import** — the demo seed *upserts* onto those real rows, enriching
> them (crop/land/segment/lead/lat/lng) and tagging them `DEMO`. No duplicate farmers result.

---

## 0. Real spreadsheet — verified shape

`master-data.xlsx`:

| Sheet | Rows | Columns (verbatim) |
|---|---|---|
| `1 Stores Master Data` | 84 | Store Code, Status, Zone, Store Name, Address, EMPCode, Regional Manager |
| `2. Stores GPS` | 80 | Store Code, Store Name, LAT, **LOG** (=lng, misspelled) |
| `3.Farmer Master Data` | **88,312** | Farmer Code, Farmer Name, Mobile No., **Vilage Name** (sic), Store Code, Store Name |
| `4.Stores & Employee Mapping` | 169 | Store Code, Store Name, Employee, Mobile No, Email_Id, Designation, POST |
| `Employee Working Area Master` | 92 | Division, Working Area, StoreCode, Designation … (territory mapping — **not imported today**) |
| `BDM&Store Master` | 83 | STORE NAME, BDM, Store, CentreIncharge, Mobileno, Email_Id, Full name, Employee_Code … (BDM contacts — **not imported today**) |

`field-options.xlsx` → `Sheet1`, **21 rows**: Field Name, Selection Options (comma list or `Free text`).
Field names (count of options): Visit Purpose (freetext), Product (11), Crop (21), Crop Insured (2),
Crop Risk (11), Current Problem (11), Dairy Services (2), Danger Zone (20), FPO Member (2),
Interested in Contract Farming (2), Land Holding Unit (16), Main Crop (15), Other Crops & Vegetables
(freetext), Other Shops Buy From (freetext), Product Required (13), Soil Testing (2), Soil Type (10),
Water Source (9), WhatsApp Available (2), Purchase Frequency (4), Annual Agriculture Expense (20).

> Note: the spreadsheet has **21** field-option rows; the design DSL has **22** option sets — the extra
> design set is `Season` (Kharif/Rabi/Zaid), which is **not** in the workbook. Seed it as a constant
> (see §5.6) so the wizard has a Season chip set.

---

## 1. Model-by-model confirmation (does every column have a home?)

Verdict per model: **K** = keep as-is, **C** = change recommended.

### Store — **C (minor)**
Holds the real sheet 1:1 (`code, name, status, zone, address, empCode, regionalManager, lat, lng`).
GPS `LOG` → `lng`. Real `district` is not a separate column in the sheet → demo writes `district`
into … *(Store has no `district`; only `zone`)*. Demo stores carry extra display-only fields with **no column**:

| Demo field | Home |
|---|---|
| `shortName` (e.g. "Ram Nagar") | **No column.** Derive in app: first token before `(` of `name`. Optional: add `shortName String?`. |
| `color` (pin colour `#1565C0`) | **No column.** Deterministic palette by store index/id in the UI (`avColors`-style). Optional: add `pinColor String?`. |
| `farmerCount` (6582, …) | **No column — do not store.** Derive: `count(Farmer where storeId)`. The demo numbers are inflated showcase values; real counts come from the 88k import. Keep a `_demoFarmerCount` constant only if a screen must show the design's exact number. |
| `district` | Sheet has no district; `zone` doubles as district. Keep `zone` only. |
| `officers[]`, `bdm{}` | → **Employee rows** (see Employee). Not store columns. |

Recommendation: optionally add `shortName String?` and `pinColor String?` (both cheap, both used by Map View + Master Data). `farmerCount` stays derived.

### Employee — **K**
Real sheet 4 maps cleanly: `name, storeCode, storeId, mobile, email, designation (AGC/CI/UA…), post`.
Demo store `officers[]` (`{name, role, mobile, email, empCode}`) and `bdm{}` both flatten into Employee
rows (`designation` ← empCode like `AGC`/`CI`/`UA012`; `post` ← role like "Agriculture Officer"/"Store Manager"/"BDM"). The Master-Data **Employees** tab is exactly `Employee` filtered/ordered by store.
One gap: the design's `empCodeRoleMeta` distinguishes BDM vs officer by empCode prefix — derive the badge in the UI from `designation` (AGC→blue, CI→amber, else→purple). No column needed.

### Farmer — **K (one note)**
All demo farmer fields have homes: `code, name, mobile, village, district, zone, crop, land, segment,
leadStatus, status, concerns, issues[], lat, lng, storeCode, storeId, source`.
- `status` (free string like "High Value"/"Dormant"/"Contacted") is kept **separate** from `segment`
  (enum) and `leadStatus` (enum) on purpose — the design's leads kanban filters on `status`, while
  Farmer 360 colours by `segment`. Keep all three.
- Real-import note (current `import-data.ts`): `district` is filled from the store's `zone`
  (sheet has no farmer district). Acceptable; flag that real farmers' `district == zone`.
- Demo-only enrichment columns (`crop, land, segment, leadStatus, concerns, issues, lat, lng`) are
  **null for the 88k real farmers** — every analytics aggregation below must tolerate nulls.

### Sale — **K**
Demo `sales[]` = `{inv, date, items, amt, store}` → `invoice, date, items, amount (₹ string),
amountNum (parsed int), store`. `amountNum` exists for analytics. ✓ Real import has no sales (none in
sheet) → Sale is demo-only today.

### Visit — **K (this is the important consolidation — keep it)**
One `Visit` model doubles as (a) the per-farmer visit-log entry and (b) the Visit-Repository row, and
(c) the New-Visit wizard submission target. It already carries **all** wizard fields (soilType,
soilTesting, waterSource[], mainCrop, crops[], season, cropInsured, landHoldingUnit, products[],
productRequired[], currentProblem[], cropRisk[], dangerZone[], annualExpense, purchaseFreq, otherShops,
fpoMember, contractFarming, dairyServices, whatsappAvail, photos[], voiceNotes[], gpsLat/Lng).
**Critical fix vs the design's data gap:** the design's `visitLog` entries have **no `by`/officer** →
Visit Repository officer was `undefined` and its officer filter was dead. The schema's `officerName`
plus the seed's `OFFICER_BY_STORE` map resolves this. Keep `officerName` populated on every Visit.
- Add `visitedAt DateTime?` is already present (good — enables real date sorting instead of the design's
  hardcoded `dateRank` map). Keep `date` (display string) too for pixel-faithful labels.

### User — **K**
Holds personas + User-Management table: `name, role (enum), roleLabel, initials, gradA, gradB, email,
territory, lastActive, visitsMtd, active`. `visitsMtd`/`lastActive` are **display strings** ("284",
"2 min ago", "—") copied verbatim — keep as String, do not try to derive (the design hardcodes them).

### Project / ProjectUpdate — **K**
`farmerIds Int[]` + `farmerNames String[]` + `groupName, owner, due, status (enum)`; updates as child
rows `{text, by, date}`. Note the design's duplicate `id:2` and farmer-name mismatch are illustrative;
the seed re-keys ids via autoincrement and remaps `farmerIds` to real DB ids (§5.3).

### Cluster — **C (add `farmerNames` + structured criteria)**
Runtime cluster shape (design) is richer than the model:
`{name, criteria{layer, layerLabel, layerValue, store, storeName}, farmerIds[], farmerNames[],
farmerCount, createdDate}`.

| Cluster runtime field | Current column | Action |
|---|---|---|
| `name` | `name` | ✓ |
| `farmerIds[]` | `farmerIds Int[]` | ✓ |
| `farmerNames[]` | — | **Add `farmerNames String[] @default([])`** (avoids N joins to render chips). |
| `criteria{layer,layerLabel,layerValue,store,storeName}` | `layerFilter`, `criteria` (String) | Store the whole object as JSON in `criteria` (or change to `Json`). `layerFilter` can hold `layer` for indexing. |
| `farmerCount` | — | Derive: `farmerIds.length`. No column. |
| `createdDate` ("Jun 23") | `createdAt` | Use `createdAt`; format for display. |
| `createdBy` | `createdBy` | ✓ (set to current user). |

State seeds `farmerClusters: []` → **no demo clusters to seed.** Model exists for runtime creation only.

### Setting — **K**
Key→value store. Holds editable `kpi.data` (JSON of the 4 KPI strings) + the 4 config flags
(`config.primaryIdLabel`, `config.visitReasonRequired`, `config.requireGPS`, `config.defaultDistrict`).
This is the home for everything the design kept in `state.kpiData` and the component `props`. ✓

### FieldOption — **K**
`fieldName (unique), inputType (dropdown|multiselect|toggle|freetext|slider), options String[]`.
Holds all 21 workbook field sets + the seeded `Season` set. The wizard reads chip option lists from here. ✓

### AuditLog — **C (add `ip` + display timestamp; rename for clarity)**
Real demo audit row = `{timestamp (display "Jun 22, 10:42"), user, action, details, ip}`.
Current model = `{actor, action, entity, detail, createdAt}` — and the seed **abuses** it: it crams `ip`
into `detail` (`"… · IP 192.168.1.45"`) and the display timestamp into `entity`. That loses structure and
makes the table column ("IP") underivable.

| Audit field | Current | Action |
|---|---|---|
| user | `actor` | ✓ (rename optional) |
| action (CREATE/UPDATE/CONFIG/EXPORT/DELETE) | `action` | ✓ |
| details | `detail` | ✓ |
| ip | — (stuffed into detail) | **Add `ip String?`** |
| timestamp ("Jun 22, 10:42") | — (stuffed into entity) | **Add `displayTs String?`** (keep `createdAt` for real ordering; `displayTs` for pixel-faithful label) |
| entity | `entity` | repurpose for affected-entity name, or drop |

---

## 2. Recommended schema changes (summary list)

1. **AuditLog:** add `ip String?` and `displayTs String?` (stop overloading `detail`/`entity`).
2. **Cluster:** add `farmerNames String[] @default([])`; treat `criteria` as JSON-encoded
   `{layer,layerLabel,layerValue,store,storeName}` (or switch type to `Json`).
3. **Store (optional, recommended):** add `shortName String?` and `pinColor String?` (both used by
   Map View + Master Data; otherwise derive in app). `farmerCount` stays **derived**, not a column.
4. Everything else (Farmer, Visit, Sale, User, Project/Update, Employee, FieldOption, Setting):
   **no change** — every demo field already has a home.

Nothing in the demo data is *unhomeable* after (1)–(2). Display-only store cosmetics (`color`,
`shortName`, `farmerCount`) are the only fields without a column today and are derivable.

---

## 3. Analytics / KPI / funnel / leads derivations per metric

Two tiers, decided per metric:
- **DERIVED** — compute from tables (real once 88k farmers + seeded demo visits/sales are in).
- **SEEDED CONSTANT** — the design hardcodes a showcase number with no underlying data; store in
  `Setting` (key `analytics.*`) and read it, so the screen is pixel-faithful and editable. Mark each so
  a later pass can flip it to DERIVED when real visit/sale volume exists.

### 3.1 Dashboard KPI cards (screen 11)
Source = `Setting["kpi.data"]` JSON `{visits, farmers, convRate, followups}` — **SEEDED CONSTANT**
(editable via KPI modal; design keeps these in `state.kpiData`). Optional DERIVED equivalents:
- Total Visits = `count(Visit where visitedAt in period)` (period = 30d default).
- Farmers Registered = `count(Farmer)` (≈88k real). *Design shows "22,210" → keep constant unless product wants live count.*
- Conversion Rate = `count(Farmer leadStatus=CONVERTED) / count(Farmer with any leadStatus) * 100`.
- Pending Follow-ups = `count(Visit where followup='Needed')` or `count(Farmer leadStatus=FOLLOWUP)`.
The `change` deltas ("↑ 12.3%") are **SEEDED CONSTANT** (no historical series exists).

### 3.2 Visit Activity bar chart — Mon..Sun (screen 11)
DERIVED-able: `group Visit by weekday(visitedAt)` over current week. Demo seed only yields ~17 visits,
so the design's `[42,38,55,47,61,33,12]` is **SEEDED CONSTANT** (`Setting["analytics.activityBars"]`).
Bar height = `round(c/max*140)`; Friday (idx 4) highlighted `#2E7D32`, else `#81C784`.

### 3.3 Lead Funnel — 5 stages (screens 11 & 22)
**SEEDED CONSTANT** `Setting["analytics.funnel"]` =
`[{New Leads,847,100%},{Contacted,612,72},{Recommendation,458,54},{Follow-up,312,37},{Converted,198,23}]`.
DERIVED alternative (when volume exists): count Farmers per `leadStatus`; pct = stage/firstStage*100;
but note the funnel has a **"Recommendation"** stage that `Farmer.leadStatus` enum lacks (enum is
NEW/CONTACTED/FOLLOWUP/CONVERTED/DORMANT). Either keep funnel seeded, or add `RECOMMENDATION` to the
enum + a `status='Recommendation'` mapping. **Recommendation: keep funnel seeded** (the kanban only has
4 columns anyway).

### 3.4 Crop distribution donut — 6 slices (screen 12)
DERIVED-able from demo farmers: `group Farmer by crop` (Wheat/Rice/Sugarcane/Potato/Mustard/Other).
With only 12 demo farmers the mix won't match the design's `[37,23,17,12,8,3]%` → **SEEDED CONSTANT**
`Setting["analytics.crops"]`. `donutGrad` = conic-gradient from cumulative pct (UI compute).

### 3.5 Insights cards — 4 (screen 12)
**SEEDED CONSTANT** `Setting["analytics.insights"]` (Pest Alert / Top Performer / Coverage Gap /
Kharif Trend) — narrative text, not derivable.

### 3.6 Crop × Problem heatmap — 5×5 (screen 12)
DERIVED-able: cross-tab `Visit.currentProblem[]` × `Farmer.crop` counts. Demo volume too small →
**SEEDED CONSTANT** `Setting["analytics.heatmap"]` (rows=crops, cols=Pest/Disease/Nutrient/Water/Weather,
values 0–85). Cell colour intensity `t = v/85`.

### 3.7 ASR / officer leaderboard — 6 rows (screen 12)
**SEEDED CONSTANT** `Setting["analytics.asrs"]` (name, store, visits, score). Partly DERIVED-able:
`visits = count(Visit where officerName)`; `score` is a composite with no formula → seed. rank=i+1,
top-3 gold, score≥80 green / ≥70 amber / else orange.

### 3.8 Regional performance — 6 rows (screen 12)
**SEEDED CONSTANT** `Setting["analytics.regions"]` (Agra…Hathras; visits, conv%, visitPct). Real zones
are Barabanki/Amethi/Raibareilly/Lakhimpur etc., so the design's Agra-region rows don't map to imported
data → seed verbatim. visitPct drives bar width.

### 3.9 Land-holding segments — 5 buckets (screen 12, var `segments`)
DERIVED-able from `Farmer.land` buckets (<2 / 2–5 / 5–10 / 10–25 / 25+ ac). Demo land is in *acres*;
the wizard captures *Bigha* ranges → mismatch + tiny sample → **SEEDED CONSTANT**
`Setting["analytics.landSegments"]`.

### 3.10 Data-quality bars — 6 (screen 12)
DERIVED-able as completeness %: e.g. Location Data = `% farmers with lat&lng`, Crop Details =
`% with crop`, Commercial Data = `% visits with annualExpense`, Media = `% visits with photos[]`.
Across 88k real farmers these will be **near 0%** (real rows lack enrichment), so to stay faithful keep
**SEEDED CONSTANT** `Setting["analytics.dataQuality"]` = `[98,94,87,72,63,45]%`.

### 3.11 Leads Pipeline kanban — 4 columns (screen 22)
**DERIVED.** Columns filter `Farmer.status` ∈ {New, Contacted, Follow-up, Converted}.
> Known design gap to preserve or fix: farmers with `status` = "High Value"/"Dormant" match **no**
> column and disappear. Faithful port = replicate; improved port = column by `leadStatus` enum instead
> of free `status`. Recommend filtering by `status` for visual parity, documented as a known gap.

### 3.12 Visit Repository KPIs (screen 14)
**DERIVED** from `Visit`: `vrTotal = count`, `vrFollowup = count(followup='Needed')`,
`vrOfficers = distinct(officerName)`, `vrFarmers = distinct(farmerId)`. `followup` flag derived:
'Needed' if `purpose` ∈ {Follow-up, Crop inspection, Re-engagement} else 'None'. Period filter via
`visitedAt` (replaces the design's hardcoded `dateRank`/`periodRankLimit`).

### 3.13 Map View layers & legend (screen 19)
**DERIVED** from `Farmer` rows: pins coloured by selected layer (segment/crop/lastVisit/issues/leadStatus)
via the colour-fn maps in `00-global-data.json → misc.mapLayerColorFns`. `lastVisit` layer needs a
real last-visit date → derive `max(Visit.visitedAt) per farmer` (fixes the design gap where `lastVisit`
was undefined and everything fell to the >30-day red bucket).

### 3.14 Action Planner header counts (screen 20)
**DERIVED:** `N projects` = `count(Project)`, `M active` = `count(Project status=ACTIVE)`.

### 3.15 Audit Log (screen 26)
**DERIVED** (list `AuditLog` ordered by `createdAt` desc). Seeded with the 8 demo entries; new app
actions append rows. Action chip colours by `action`.

> Implementation note: put all SEEDED CONSTANT analytics under `Setting` keys prefixed `analytics.*`
> (JSON values). A single `getAnalytics()` reads them; screens never hardcode. This keeps the data layer
> the one source of truth and lets a later pass flip any metric to DERIVED without touching components.

---

## 4. Mapping of demo IDs → real store codes (it lines up)

Demo farmers reference these store codes, **all of which exist in the real import**:

| Demo store id | code | Demo farmers (ids) |
|---|---|---|
| 1 | AGRO0012 (Ram Nagar) | 1, 2 |
| 2 | AGRO0015 (Haidergarh) | 3, 4 |
| 3 | AGRO0018 (Tiloi) | 5, 6 |
| 4 | AGRO0019 (Shivgarh) | 7, 8 |
| 5 | AGRO0028 (Sanda Farm) | 9, 10 |
| 6 | AGRO0031 (Aliganj) | 11, 12 |

The seed resolves `storeId` by code at runtime (`storeIdByCode`), so demo farmers attach to the **real**
store rows. Demo store `upsert` only enriches GPS — it never creates a competing store.

---

## 5. Seed plan (order matters — run after `db:push` + `db:import`)

`import-data.ts` first loads REAL: 80–84 stores (+GPS), 169 employees, 21 field options, ~88k farmers.
Then `seed-demo.ts` layers DEMO on top:

1. **Demo stores (6):** upsert by code; set `lat/lng/address`. Source stays `REAL` (they are real stores
   we're just GPS-enriching).
2. **Demo farmers (12):** upsert by `code` onto the real rows → enrich crop/land/segment/leadStatus/
   status/concerns/issues/lat/lng/storeId; tag `source=DEMO`. Build `dbIdByDemoId` map.
3. **Sales (~17):** delete existing for demo farmer ids, recreate from `sales[]`; parse `amountNum`.
4. **Visits (~17):** delete `source=DEMO`, recreate one Visit per `visitLog[]` entry; set `officerName`
   from `OFFICER_BY_STORE[storeCode]` (fixes the dead officer filter), `visitedAt` parsed from "Jun 18".
5. **Projects (5) + updates:** delete `source=DEMO`, recreate; remap `farmerIds` through `dbIdByDemoId`;
   keep `farmerNames` verbatim (illustrative). Autoincrement re-keys the design's duplicate id:2.
6. **Field-option `Season`:** upsert `FieldOption{fieldName:'Season', inputType:'dropdown',
   options:['Kharif','Rabi','Zaid']}` (design-only set absent from the workbook).
7. **Users (7):** upsert by email; map status→`active`, role label→`role` enum.
8. **Audit log (8):** clear + recreate; with the schema change, populate `ip` + `displayTs` properly
   (instead of cramming into `detail`/`entity`).
9. **Settings:** `kpi.data` + 4 config flags **+ the `analytics.*` constants** from §3 (funnel, crops,
   insights, heatmap, asrs, regions, landSegments, dataQuality, activityBars). Currently the seed writes
   only kpi+config — **extend it** to write the analytics constants so screens 11/12/22 render faithfully.
10. **Clusters:** none seeded (`state.farmerClusters: []`) — runtime-created only.

### Seed entities to ADD vs current seed-demo.ts
- ✅ already: stores, farmers, sales, visits, projects, users, audit, settings(kpi/config).
- ➕ add: `FieldOption['Season']`; the `analytics.*` Setting constants (§3.2–§3.10); audit `ip`/`displayTs`
  once the AuditLog columns are added.

---

## 6. Known design data gaps and how this model resolves them

| Design gap (from 00-global-data) | Resolution in this model |
|---|---|
| `visitLog` has no officer → Visit Repo officer undefined, filter dead | `Visit.officerName` seeded via `OFFICER_BY_STORE`; filter works. |
| Farmers lack `totalPurchase/ltv/lastVisit/visits` → segCards `₹NaNK`, map lastVisit all-stale | LTV/revenue = `sum(Sale.amountNum) per farmer`; lastVisit = `max(Visit.visitedAt)`. |
| `projects[].farmers[]` names ≠ real farmer names; duplicate id:2 | `farmerIds` remapped to DB ids; autoincrement re-keys; names kept as illustrative `farmerNames`. |
| Leads kanban drops High Value/Dormant farmers | Documented §3.11; faithful port keeps gap or switch column key to `leadStatus`. |
| `saveEditModal` store branch references undefined `st` (runtime throw) | Logic bug, not data — the API/edit handler writes Store columns directly; no schema impact. |
| Funnel has "Recommendation" stage absent from `LeadStatus` enum | Funnel kept as seeded constant; enum unchanged. |
| Store `farmerCount` (6582…) inflated vs real | Derived `count(Farmer)`; design number kept only as optional constant if a screen needs exact parity. |
