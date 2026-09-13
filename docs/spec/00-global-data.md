# 00 — Global Data Index (UA Field Intel)

Extracted from the **SCRIPT region** of `webapp/docs/original-design.dc.html` (lines **2559–3808**), the `class Component extends DCLogic` block: `state` (2586–2648) and `renderVals()` (2650–3805). The Audit Log is the one exception — it is hardcoded **template markup** (lines 2336–2391), captured here because it is embedded demo data.

All values in `00-global-data.json` are copied **verbatim**. This file describes each dataset, its fields, and source line numbers, plus runtime caveats / data gaps an engineer must handle when wiring to Prisma/Postgres.

---

## 1. `state` — UI state + embedded data (lines 2586–2648)

The component's `state` object. Keys split into pure UI flags and embedded demo data.

| Key | Initial | Notes |
|---|---|---|
| `view` | `'dashboard'` | active screen route |
| `step` | `0` | New Visit wizard step (0–4) |
| `search` | `''` | farmer search box |
| `period` | `'30d'` | analytics period (`7d/30d/90d/ytd`) |
| `ready` | `true` | |
| `selectedFarmer` | `null` | currently-open farmer |
| `role` | `'regional'` | one of `regional / officer / central / sysadmin` |
| `showRolePicker` | `false` | |
| `mapLayer` | `'segment'` | map colour layer |
| `farmerClusters` | `[]` | **empty** — clusters are runtime-created |
| `showClusterModal`, `clusterDraftName`, `clusterModalLayerFilter` (`'all'`), `selectedClusterDetail`, `clusterSource` | various | cluster workflow |
| `visitRepoFilter` | `{officer:'all', store:'all', type:'all', period:'month'}` | visit repo filters |
| `selectedVisit`, `selectedMapFarmer`, `mapStoreFilter` | `null` | |
| `showStorePins` | `true` | |
| `adminSubTab` | `'users'`; `masterDataTab` | `'stores'`; `showMasterData` `false` | admin tabs |
| `storeEdits` / `farmerEdits` / `userEdits` | `{}` | sysadmin in-place edit overlays (merged on top of base data via `{...base, ...edits[id]}`) |
| `editModal` `null` / `editDraft` `{}` | edit modal state |
| `kpiData` | `{visits:'1,024', farmers:'22,210', convRate:'38.7%', followups:'34'}` | editable dashboard KPIs |
| `projects` | see §2 | Action Planner data |
| `selectedProject`, `showNewProject`, `newProject` (`{title,owner,due,group}`), `newUpdate` | project workflow |
| `form` | see §11 | New Visit wizard form object |

**New Visit `form` object (lines 2636–2647)** — full field list captured in §11. Note: the initial form defaults `village:'Ram Nagar'`, `district:'Barabanki'`, but `submitVisit()` (line 3619) **resets** to `village:'Chandpur'`, `district:'Agra'`. Setters `setLand`/`setIrr` write `form.totalLand`/`form.irrigatedLand`, which are **not** in the initial form object.

---

## 2. `projects` — Action Planner (state, lines 2613–2631)

**5 project records.** Fields: `id, title, status (active/planned/completed), owner, due (YYYY-MM-DD), group, farmerIds[], farmers[] (denormalised names), updates[]`. Each `update` = `{text, by, date}`.

Caveats:
- **Duplicate ids** in source: two records have `id:2`. Re-key on import.
- `farmerIds` reference the `farmers` array; `farmers[]` name strings (e.g. "Suresh Yadav", "Arun Sharma") **do not match** the actual farmer-array names (which are "A K Singh" etc.) — they are illustrative.
- `createProject()` adds new with `id:Date.now()`, empty `farmerIds/farmers/updates`. `addUpdate()` prepends `{text, by:'Rajesh Verma', date:'Jun 22'}`.
- Status display meta (bg/color/label) at lines 3729–3731 / 3690–3706.

---

## 3. `farmers` — Sample Farmers (renderVals local, lines 2727–2776)

**12 farmer records.** Every field captured verbatim:
`id, code, name, mobile, village, district, zone, crop, land (number, acres), status, segment, storeCode, lat, lng, sales[], visitLog[], issues[], concerns, leadStatus`.

- `sales[]` = `{inv, date, items, amt (₹ string), store}`
- `visitLog[]` = `{date, purpose, notes}` — **no `by`/officer field** (see §4 gap)
- `issues[]` = array of strings (may be empty)

**Data gaps** — these bindings reference fields **absent** from farmer records (resolve to `undefined`/`NaN`):
- `lastVisit`, `ltv`, `totalPurchase`, `visits`, `season`, `soil` — used in lookup card, detail header, segCards revenue, map lastVisit layer. `segCards` revenue computes `₹NaNK`/`₹0K` (line 3653, sums non-existent `totalPurchase`). Map `lastVisit` layer always falls to the `>30 days`/`#C62828` bucket since `lastVisit` is undefined.

Supporting maps (same section):
- **`stColors`** (status → bg/c), line 2778: New, Contacted, Follow-up, Converted, Recommendation, Lost.
- **`avColors`** (avatar palette, 8 colours), line 2779.
- `farmersWithEdits` = farmers merged with `state.farmerEdits` (line 2782).

---

## 4. `visitRepo` — Visit Repository (DERIVED, lines 3050–3134)

**Not a stored array.** `allVisitsRaw` (3052–3081) is built by flattening every farmer's `visitLog[]` into visit rows. `visId` starts at **2401**, pre-incremented → first `vid='VIS-2402'`.

Row shape documented in JSON. Key derivations: `storeName` (first word of mapped store), `typeColor` (from `visitTypes`), `followup` ('Needed' for Follow-up/Crop inspection/Re-engagement).

**Major data gap:** row `officer` = `v.by`, but `visitLog` entries have **no `by` field** → `officer` is `undefined` for every generated visit. The officer filter (`allOfficers` = `['all','Raj Kumar','Amit Yadav','Vikram Singh','Deepak Verma']`, line 3133) therefore never matches. When rebuilding, assign officers from the store's `officers[]` or seed `by` onto visit logs.

Also captured here:
- **`visitTypes`** colour map (12 purposes), line 3051.
- **`dateRank`** sort map (line 3083) and **`periodRankLimit`** (`today:1, week:8, month:32, all:999`).
- **`visitRecMap`** — visit-type → 3 recommendation cards (lines 3137–3151) + default fallback. 12 keyed entries.
- Filter pills, KPI summary derivations (`vrTotal/vrFollowup/vrOfficers/vrFarmers`).

---

## 5. `users` — Personas + User Management (lines 2661–2666, 3406–3424)

- **`personas`** (4, line 2661): current-user identity per role — `{name, role, init, color (gradient)}`. regional=Rajesh Verma, officer=Raj Kumar, central=Dr. Anita Sharma, sysadmin=Vikash Mehta.
- **`baseUsers`** (7, lines 3406–3414): User Management table. Fields `id, init, name, email, role, territory, lastActive, visitsMtd, status (Active/Inactive), gradA, gradB`. User #7 (Sunil Gupta) is Inactive.
- **`roleMeta`** (4) + **`statusMeta`** (2) badge colour maps.
- **`officerNamesByStoreId`** (line 2847): store-id → primary officer name.

---

## 6. `auditLog` — Audit Log (TEMPLATE markup, lines 2336–2391)

**8 entries hardcoded as `<div>` rows** (not a script array). Columns: `Timestamp, User, Action, Details, IP`. Actions: CREATE / UPDATE / CONFIG / EXPORT / DELETE, each with its own chip colours (CREATE=#E8F5E9/#2E7D32, UPDATE=#E3F2FD/#1565C0, CONFIG=#FFF3E0/#E65100, EXPORT=#F3E5F5/#7B1FA2, DELETE=#FFEBEE/#C62828). All entries captured verbatim in JSON.

---

## 7. `analytics` — figures & series (renderVals locals)

| Dataset | Lines | Contents |
|---|---|---|
| `periods` | 2909–2914 | period selector (`7d/30d/90d/ytd` → labels) |
| `activityBars` (`raw`) | 2877–2879 | Mon–Sun visit counts (42,38,55,47,61,33,12); Fri highlighted |
| `funnel` / `funnelDetail` | 2882–2889 | 5-stage lead funnel (847→198) |
| `crops` / `donutGrad` | 2892–2898 | crop distribution donut (Wheat 37%…Other 3%) |
| `insights` | 2901–2906 | 4 insight cards (Pest Alert / Top Performer / Coverage Gap / Kharif Trend) |
| heatmap (`hmProbs/hmCrops/hmData`) | 2917–2930 | 5×5 Crop × Problem matrix |
| `asrs` | 2933–2940 | 6 officer leaderboard rows (name, store, visits, score) |
| `regions` | 2943–2950 | 6 region rows (visits, conv, visitPct) |
| `segments` (land buckets) | 2953–2959 | 5 land-holding size buckets — **named `segments` but is land-size, distinct from value segments in §10** |
| `quality` | 2962–2969 | 6 data-quality completeness bars |

---

## 8. `kpis` (lines 2611 + 2867–2874)

`state.kpiData` (4 editable values) mapped to 4 dashboard cards (title/value/change/accent/bg/sub). Editable via KPI edit modal (`openKpiEdit`, 3464).

---

## 9. `leads` (lines 3043–3048)

Lead Pipeline kanban — **4 columns** (New/Contacted/Follow-up/Converted) that filter the `farmers` array by `f.status`. **Caveat:** farmers with `status` of `'High Value'` or `'Dormant'` match **no** column and disappear from the board. Funnel numbers live under `analytics.funnel`.

---

## 10. `clusters` (lines 3158–3398)

**No seeded clusters** — `state.farmerClusters` starts `[]`. `createCluster()` (3356) builds `{id, name, criteria{layer,layerLabel,layerValue,store,storeName}, farmerIds[], farmerNames[], farmerCount, createdDate:'Jun 23'}` from the active map layer + store filter, then jumps to Action Planner pre-filling a new project. Shape + `layerLabelMap` + `layerFilterOpts` captured for the data layer.

---

## 11. `segments` — value segment maps + `newVisitForm`

### Value segment maps
- **`segLabels`** (2724): `High Value, Medium Value, New/Low, Dormant`.
- **`segColors`** (2725) / **`segBgs`** (2726): text & background colours.
- `segFilters` pills (3657), `segCards` summary (3650 — revenue is `NaN`, see §3).

### `newVisitForm` — New Visit wizard (5 steps)
`stepLabels` (line 2994): **Farmer & Location · Land & Crops · Products & Issues · Commercial & Services · Review & Submit**.

| Step | Field (`form` key) | Type | Option set (line) |
|---|---|---|---|
| 1 | name, father | text | sf() |
| 1 | mobile | text | label = `primaryIdLabel` prop; triggers mobile lookup ≥10 digits |
| 1 | village (`Ram Nagar`), district (`Barabanki`) | text | |
| 1 | visitPurpose | text | required iff `visitReasonRequired` prop |
| 2 | landHolding | single | `landChips` (3019) — 8 Bigha buckets |
| 2 | soil | single | `soilChips` (3020) — 10 soil types |
| 2 | soilTesting | single | `soilTestChips` (3021) — Required/Not Required |
| 2 | waterSource | multi | `waterChips` (3022) — 9 sources |
| 2 | mainCrop | single | `mainCropChips` (3023) — 15 crops |
| 2 | crop | multi | `cropChips` (3024) — 21 crops |
| 2 | otherCrops | text | |
| 2 | season (`Rabi`) | single | `seasonChips` (3025) — Kharif/Rabi/Zaid |
| 2 | cropInsured | toggle | |
| 3 | product | multi | `productChips` (3028) — 11 |
| 3 | productRequired | multi | `prodReqChips` (3029) — 13 |
| 3 | currentProblem | multi | `probChips` (3030) — 11 |
| 3 | cropRisk | multi | `riskChips` (3031) — 11 |
| 3 | dangerZone | multi | `dangerChips` (3032) — 16 |
| 4 | annualExpense | single | `expenseChips` (3035) — 6 ₹ ranges |
| 4 | purchaseFreq | single | `freqChips` (3036) — Weekly/Monthly/Seasonal/As Required |
| 4 | otherShops | text | |
| 4 | fpoMember, contractFarming, dairyServices, whatsappAvail | toggle | |
| 4 | leadStatus (`New`) | single | `statusChips` (3037) — 6 (New, Contacted, Recommendation Given, Follow-up Scheduled, Converted, Lost) |
| 5 | — | review | submit → `submitVisit()` resets form & returns to dashboard |

Chip helpers: `mkSingle`/`mkMulti` (3005–3016). Selected chip styling: bg `#E8F5E9`, text `#2E7D32`, border `#2E7D32`. Toggle: on `#2E7D32` / off `#BDBDBD`, label Yes/No. Stepper colours at 2995–3002.

> Full option-value arrays are in the JSON under `newVisitForm.steps`.

---

## 12. `stores` — Store Master Data (lines 2790–2845)

**6 stores** (`baseStores`). Fields: `id, code, name, shortName, zone, district, address, lat, lng, left, top (map %), color, status, farmerIds[], farmerCount, officers[], bdm{}`.
- `officers[]` = `{name, role, mobile, email, empCode}` (empCode `AGC`=Agriculture Officer, `CI`=Store Manager).
- `bdm` = `{name, mobile, email, empCode}`.
- `farmerStoreMap` (2848) maps farmer-id → store-id from `farmerIds`. **Note:** farmers also carry `storeCode`; the Master Data farmer tab matches on `storeCode` (3785) while the map/rows use `farmerStoreMap` (`farmerIds`). Both align for this dataset.
- Employees table (Master Data, 3797) flattens all `officers[]` + `bdm` across stores.

---

## 13. `misc` (catch-all)

- **`componentProps`** (2559–2583): `primaryIdLabel` (enum), `visitReasonRequired` (bool), `requireGPS` (bool), `defaultDistrict` (enum). `$preview` 1440×900.
- **`dashboardSubtitles`** per role (2716); **`viewTitles`** per view (2717–2720) — note hardcoded counts ("1,284 registered farmers", "4 active users").
- **`navVisibilityByRole`** (2693–2703): which nav items each role sees.
- **`mapPinPositions`** (3178–3185): farmer map pins by id (%); **separate** from store `left/top`.
- **`legacyIssueMap`** (3187): unused `_legacy` map.
- **`mapLayerColorFns`** (3189–3195), **`mapLegendMeta`** (3222–3228), **`mapLayerPills`** (3295–3306).
- **`farmerDetailVisitHistory`** (3171–3175): 3 hardcoded fallback timeline items on Farmer 360 detail (distinct from `farmer.visitLog`).
- **`masterDataTabs`** (stores/farmers/employees).
- **`editModalTypes`**: farmer/user/kpi/store. **Bug note:** `saveEditModal` store branch references undefined `st` (line 3492) — would throw at runtime.

---

## Counts summary

- **Farmers:** 12 · **Projects:** 5 (2 share id:2) · **Stores:** 6 · **Officers (in stores):** 12 across stores + 5 distinct BDMs · **Users (table):** 7 · **Personas:** 4 · **Audit entries:** 8 · **ASR leaderboard:** 6 · **Regions:** 6 · **Funnel stages:** 5 · **Crops (donut):** 6 · **Heatmap:** 5×5 · **Visit-type recommendation sets:** 12 (+default) · **New Visit option sets:** 18.

## Data gaps / things that won't fully resolve at runtime
1. `farmer.visitLog` entries lack `by` → Visit Repository `officer` undefined; officer filter is dead.
2. Farmers lack `totalPurchase / ltv / lastVisit / visits / season / soil` → segCards revenue = `₹NaNK`, map `lastVisit` layer all-stale, lookup/detail fields blank.
3. `projects[].farmers[]` names don't match real farmer names; duplicate project ids.
4. Leads kanban drops farmers with status `High Value`/`Dormant`.
5. `saveEditModal` store branch references undefined `st` (would throw).
