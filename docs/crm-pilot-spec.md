# UA Agro — CRM Pilot Spec (Segmentation + Maize/Potato Campaign)

Status: **DRAFT for sign-off** · Owner: engineering · Source: Marketing "Pilot CRM plan" (WF1–4) + "Customer Segmentation Proposal"

This spec turns the marketing pilot (4 workflows) into a buildable design against our real data
(106,689 farmers · 253,410 sales · dates Apr 2024 → Jul 2026, refreshed monthly).

---

## 0. Locked decisions (from review)

| Topic | Decision |
|---|---|
| Recency anchor | **Real calendar today** (with a one-line config override to "latest bill date" for demos) |
| Tag computation | **Precompute monthly** onto the farmer record (rolling) |
| Map exploration filter | Multi-select, **match ANY** tag |
| Campaign segment | **Mutually exclusive**, one per customer, by priority |
| Segment priority | **HNI > Potential HNI > Regular > At Risk > New > Lapsed** (Loyal folds into Regular) |
| Old segment (High/Med/New-Low/Dormant) | **Replaced** by this scheme app-wide |
| Crop affinity | **Seed purchases only** (bought maize seed ⇒ maize; potato seed ⇒ potato) |
| Messages | **Slot-filled Hindi templates now**, optional "AI rephrase" later |

---

## 1. Segmentation engine (foundation — Phase 0)

### 1.1 Rolling windows (anchored to `ASOF`, default = today)
- **P6M** = `(ASOF − 6mo, ASOF]`
- **P7-12M** = `(ASOF − 12mo, ASOF − 6mo]`
- **P13-24M** = `(ASOF − 24mo, ASOF − 12mo]`
- **P12M** = `(ASOF − 12mo, ASOF]` (= P6M ∪ P7-12M)

`ASOF` is a single config constant/env (`SEGMENT_ASOF`, default = `now`). All windows derive from it.

### 1.2 Per-farmer facts (from `Sale`, grouped by `farmerId`)
- `boughtP6M`, `boughtP7_12M`, `boughtP13_24M` — booleans (any sale in window)
- `hasAnyBefore` — any sale strictly before P12M (for New vs Lapsed)
- `firstSaleAt`, `lastSaleAt`
- `spendP12M` = Σ `amountNum` where `soldAt` in P12M

### 1.3 Lifecycle tags (multi — kept for map/analysis)
| Tag | Rule |
|---|---|
| Regular | `boughtP6M && boughtP7_12M` |
| Loyal | `boughtP6M && boughtP7_12M && boughtP13_24M` (⊂ Regular; analysis only) |
| At Risk | `boughtP7_12M && !boughtP6M` |
| Lapsed | `!boughtP6M && !boughtP7_12M && hasAnyBefore` |
| New | `firstSaleAt in P12M && no sale before firstSaleAt in the 24-mo horizon` |

### 1.4 Value tags (multi)
| Tag | Rule |
|---|---|
| HNI | `spendP12M >= 12000` |
| Potential HNI | `10000 <= spendP12M < 12000` |

### 1.5 Exclusive **campaign segment** (one per customer)
Assign the **highest-priority** tag the customer holds:
```
1 HNI            if spendP12M >= 12000
2 POTENTIAL_HNI  else if spendP12M >= 10000
3 REGULAR        else if Regular (or Loyal)
4 AT_RISK        else if At Risk
5 NEW            else if New
6 LAPSED         else if Lapsed
- OTHER          else  (gap-buyer edge case — see §7)
```
> Consequence to confirm: a customer who is both **New and At Risk** (first buy 7–12mo ago, no repeat)
> is assigned **At Risk** (priority 4 < 5), i.e. gets the re-engagement message, not the welcome. (§7)

### 1.6 Derived helper fields
- `hniGap` = `max(0, 12000 − spendP12M)` — the "₹X to reach HNI" shown to Potential-HNI (message `[gap]`).
- `p12mSpend` = `spendP12M` (cached).

### 1.7 Crop affinity — **seed only** (WF1)
- `cropTags String[]` ⊆ `{maize, potato}` (also allow `paddy` etc. internally; pilot uses maize/potato).
- A farmer is tagged **maize** iff they bought a **maize seed** line-item in history; **potato** iff a **potato seed** line-item. Both ⇒ both tags. Crop group for the matrix: `Maize Only` / `Potato Only` / `Maize + Potato Combined`.
- Detection = keyword classifier on raw **line-item** name / sub-category (e.g. `MAIZE SEED*`, `POTATO SEED* / ALOO`). **Requires raw line-item data** (the aggregated `Sale` table only keeps a summary — see §7 data dependency).
- Message/list fields per crop: `lastMaizeItem`, `lastMaizeAt`, `lastPotatoItem`, `lastPotatoAt` (most recent seed purchase of that crop).

### 1.8 Compute job (monthly, rolling)
- Script `scripts/compute-segments.ts`, runnable monthly / on-demand; one grouped SQL pass over `Sale` per farmer for the lifecycle/value/spend facts, plus a crop pass over raw line-items.
- Writes all fields onto `Farmer` (§2). Idempotent; logs a summary (counts per segment/crop).
- Feasible at our scale (≈106k farmers) in one batched pass.

---

## 2. Schema changes

### 2.1 `Farmer` — add
```prisma
segmentTags     String[] @default([])   // regular, loyal, at_risk, lapsed, new, hni, potential_hni
campaignSegment String?                 // HNI | POTENTIAL_HNI | REGULAR | AT_RISK | NEW | LAPSED | OTHER
cropTags        String[] @default([])   // maize, potato
p12mSpend       Int?                    // ₹ spend in P12M (cached)
hniGap          Int?                    // ₹ to reach HNI (Potential-HNI list + message [gap])
lastMaizeItem   String?
lastMaizeAt     DateTime?
lastPotatoItem  String?
lastPotatoAt    DateTime?
segmentComputedAt DateTime?
// indexes: campaignSegment, cropTags (GIN), segmentTags (GIN)
```
> Old `segment` enum is retired from the UI but kept as a nullable column during migration.

### 2.2 New models
```prisma
model Campaign {
  id           Int      @id @default(autoincrement())
  name         String
  startDate    DateTime
  endDate      DateTime
  targetSegments String[] @default([])  // campaign segments included
  targetCrops    String[] @default([])  // maize / potato
  testPct      Int      @default(75)    // % test (rest = control holdout)
  status       String   @default("DRAFT") // DRAFT | ACTIVE | CLOSED
  createdAt    DateTime @default(now())
  members      CampaignMember[]
}

model CampaignMember {
  id          Int      @id @default(autoincrement())
  campaignId  Int
  farmerId    Int
  segment     String              // snapshot at enrolment
  group       String              // TEST | CONTROL
  reached     Boolean  @default(false)
  reachedAt   DateTime?
  medium      String?             // IN_PERSON | CALL | WHATSAPP
  reachedBy   String?             // officer name/code
  // purchase attribution is computed from Sale in [start,end]; not stored
  @@unique([campaignId, farmerId])
}

model CommTemplate {           // WF3 config (admin-editable)
  id          Int    @id @default(autoincrement())
  segment     String @unique    // HNI | POTENTIAL_HNI | REGULAR | AT_RISK | NEW | LAPSED
  priority    Int
  medium      String            // "1:1 or Call" | "Whatsapp" | "Whatsapp + Call"
  offer       String
  timingLabel String
  template    String            // Hindi text with [Naam] [gap] [last item] [Store] [number] [date]
  active      Boolean @default(true)
}
```

---

## 3. Workflow 1 — Crop tagging
- Output: `Farmer.cropTags` + last-seed fields (§1.7), computed in the monthly job.
- Bootstrap classifier = seed keyword list (`MAIZE`, `POTATO`/`ALOO` within SEEDS lines); swap in the marketing **product→crop master** when supplied (config file `data/product-crop-map.csv`).
- **Data dependency (blocker for full history):** crop identity lives in raw line-items; we currently retain full item detail only for the **Apr–Jul 2026** export. To identify *past-season* maize/potato growers (the actual target set), we need the **historical raw sales exports** re-supplied. (§7)

## 4. Workflow 2 — Segmented list by store

### 4.1 Matrix report (new screen "Campaign Segments")
- Grid: **rows = stores** (+ Total), **column groups = Maize Only / Potato Only / Maize+Potato**, **columns per group = HNI · Potential HNI · Regular · At Risk · New · Lapsed** (counts).
- Exclusive counts ⇒ each customer appears in exactly one cell; group totals reconcile.
- Region/national roll-ups; store search.

### 4.2 Per-cell customer list (drill-down) & officer surface
- Click a cell → list: Name · Mobile · Village · **last maize/potato-season item** · P12M spend · **gap-to-HNI** (if Potential) · **recommended medium** (from CommTemplate) · reached-status.
- Same list is available in the **map / cluster builder** via two new filters (Crop, Campaign Segment) so field officers can pull "Maize · At Risk · near Store X" and **save as a campaign cluster**.
- CSV export per store/segment.

### 4.3 Media recommendation
- Driven by `CommTemplate.medium` per segment (HNI/Potential → 1:1/Call; Regular/New → Whatsapp; At Risk/Lapsed → Whatsapp+Call). "Based on numbers per cell" → matrix shows counts so ops can prioritise.

## 5. Workflow 3 — Communication plan
- **Config screen** (admin): edit `CommTemplate` rows (priority, medium, offer, timing, Hindi template).
- **Templating engine**: fill slots per customer — `[Naam]`→name, `[gap]`→hniGap, `[last item]`→lastMaize/PotatoItem, `[Store name]`→store, `[number]`→officer/store phone, `[date]`→offer deadline. Deterministic, previewable, reviewable.
- **Optional later**: "AI rephrase" button → LLM (Claude) rewrites one filled message in Hindi, human-approved before use. Off by default.
- Export: per segment/store, a message sheet (name, mobile, medium, filled message) for outreach.

## 6. Workflow 4 — Execute & track

### 6.1 Setup
- Create Campaign (name, period e.g. 20 Jul–31 Aug, target segments/crops, `testPct`=75).
- On activation: eligible farmers (matching segments/crops, scoped to stores) split **75% Test / 25% Control** (deterministic hash on farmerId; control is a silent holdout). Snapshot `segment` per member.
- Small-cell rule: if a segment cell < threshold, **auto-combine** segments for test/control (per slide note).

### 6.2 Outreach logging
- Officer contact list (from §4.2) shows campaign members; officer marks **Reached** + medium (+ auto officer/timestamp). Writes `CampaignMember.reached*`.

### 6.3 Purchase attribution
- "Purchased" = farmer has ≥1 `Sale` with `soldAt ∈ [start, end]` (needs the **monthly refresh** to have loaded that period's sales — so results mature after the period + import).

### 6.4 Uplift dashboard (slide-4 layout) — per segment × {Test, Control, Uplift}, at store/region/national
| Metric | Definition |
|---|---|
| No. of farmers | members in group |
| No. reached | test: logged reached · control: n/a (holdout) |
| % reached | reached / test members |
| No. purchased | members with a sale in window |
| % purchased | test: purchased / reached · control: purchased / control members |
| Avg sales/farmer | avg `amountNum` in window among purchasers |
| Uplift | test − control (% purchased, avg sales) |
| **Total incremental** | **formula needs confirmation — see §7** |

## 7. Open items to confirm (before build)

1. **[DATA — key] Historical raw sales for crop tags.** We need the raw line-item exports for prior periods (not just Apr–Jul 2026) to identify past-season maize/potato growers. Options: (a) supply historical raw files; (b) scope crop affinity to available raw data for the pilot.
2. **Product→crop master.** When ready, replace the seed-keyword bootstrap with the technical mapping.
3. **New + At Risk tie-break.** Priority makes such a customer **At Risk** (re-engagement), not New (welcome). OK, or special-case New?
4. **"OTHER" catch-all.** Gap-buyers (bought P6M & P13-24M, skipped P7-12M, not first-time) match no lifecycle rule. Exclude from campaigns, or treat as Regular?
5. **Season windows.** Define maize & potato **season calendars** (default: Maize Kharif sowing ~Jun–Jul; Potato Rabi sowing ~Oct–Nov) for "last season purchase", or use "last seed purchase of that crop" regardless of strict window.
6. **"Total incremental" formula.** The slide note ("test farmers reached × uplift% × avg sales uplift") doesn't reconcile with the example (17,500). Confirm the exact incrementality definition; proposed rigorous version: `incremental ₹ = TestReached × (Test%purch − Control%purch) × Test avg order value`.
7. **HNI/Potential thresholds** (₹12,000 / ₹10,000) — final and global, or per store/region?

## 8. Delivery phases
- **P0** Segmentation engine + schema + monthly job + replace old segment in UI. (foundation)
- **P1** Crop tagging (WF1) — pending §7.1 data.
- **P2** Segment matrix + officer contact lists (WF2).
- **P3** Comm plan config + templating (WF3).
- **P4** Campaign + test/control + outreach logging + uplift dashboard (WF4).

P0 depends on none of the §7 answers and can start immediately; P1 is gated on §7.1.
