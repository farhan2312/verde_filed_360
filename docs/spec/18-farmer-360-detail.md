# Screen 18 — Farmer 360 Detail

Port spec for the per-farmer drill-down screen ("Farmer 360 Detail").
Source: `webapp/docs/original-design.dc.html`, template lines **1323–1457**; script logic in `renderVals()` lines **3164–3186** (selected-farmer derivation) and **3663–3685** (detail bindings), with supporting demo data at 2727–2776 (farmers), 2790–2850 (stores), 2724–2726 (segment color maps), and the edit-modal handlers at 3445–3496.

---

## 1. PURPOSE & WHEN IT SHOWS

- A full-profile detail view for a single farmer: profile + segment, store assignment & relationship officers, lifetime-value KPIs, full sales/invoice history, and full visit-report log.
- **Gate:** rendered inside `<sc-if value="{{ isFarmerDetail }}">`. `isFarmerDetail = (s.view === 'farmerDetail')` (line 2682). So it shows only when `state.view === 'farmerDetail'`.
- The screen is reached by clicking a farmer from many places (all set `view:'farmerDetail'` + `selectedFarmer:f`):
  - Farmer 360 list rows — line 2863 `onClick: () => this.setState({ view:'farmerDetail', selectedFarmer:f })`.
  - Mobile-lookup result (New Visit screen) — line 2990.
  - Farmer cluster detail rows — line 3385.
  - Visit detail "view farmer profile" — line 3544 (`goToSvFarmerProfile`).
  - Map farmer popover "view detail" — line 3567 (`viewFarmerDetail`).
- **Role gating:** the screen itself is NOT role-gated (any role can land here). The ONLY role difference inside is the "Edit Farmer Profile" button, which is wrapped in `<sc-if value="{{ isAdmin }}">` where `isAdmin = (R === 'sysadmin')` (line 2702). So only the **sysadmin** persona sees the edit affordance.
- **Reset behavior:** `selectedFarmer` is cleared (`selectedFarmer:null`) whenever a top-nav `go(view)` runs (line 2652) or the role changes (line 2671). So navigating away and back to `farmerDetail` requires re-selecting a farmer; with `selectedFarmer:null` the derived `sel` is `{}` and all fields fall back to defaults (see Empty States).

---

## 2. LAYOUT TREE (top → bottom) with Tailwind translation

Root wrapper: `<div style="animation:fadeUp 0.4s ease-out;">` — entrance animation. Tailwind: add a `fade-up` keyframe util (`animate-[fadeUp_0.4s_ease-out]`). All cards share the same surface recipe — define a reusable class:

> **`card` recipe** = `bg-white rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]`. Default inner padding `p-[22px]` unless noted.

### 2.1 Back link (line 1326)
`<div onClick=goToFarmers>` → `inline-flex items-center gap-1.5 text-[13px] text-[#757575] cursor-pointer mb-[18px]`. Text: `← Back to Farmer 360`.
Hover (`style-hover="color:#2E7D32;"`) → `hover:text-[#2E7D32]`.

### 2.2 Top grid — Profile + Store + 2 KPI minis (line 1331)
Container: `grid grid-cols-4 gap-4 mb-[18px]` (`grid-template-columns:1fr 1fr 1fr 1fr; gap:16px`).

**(a) Profile card** (line 1333) — `card` + `col-span-2` (`grid-column:span 2`).
- Header row (1334): `flex items-center gap-4 mb-[18px]`.
  - Avatar (1335): `w-14 h-14 rounded-full flex items-center justify-center font-bold text-[20px] text-white shrink-0` with `bg-[linear-gradient(135deg,#2E7D32,#66BB6A)]`. Content `{{ selInit }}`.
  - Name block (1336, `flex-1`):
    - Title row (1337): `flex items-center gap-2.5`.
      - Name (1338): `text-[18px] font-bold text-[#1A1C1A]` → `{{ selName }}`.
      - Segment pill (1339): `px-2.5 py-[3px] rounded-[20px] text-[10px] font-bold` with dynamic `bg={{ selSegBg }}` / `color={{ selSegColor }}` → text `{{ selSegment }}`.
    - Location line (1341): `text-[12px] text-[#9E9E9E] mt-0.5` → `{{ selVillage }}, {{ selDistrict }} · {{ selMobile }}`.
- Detail grid (1344): `grid grid-cols-2 gap-2.5`. Six rows, each `flex justify-between text-[12.5px] py-1.5`. First four have `border-b border-[#F5F5F5]`; the last two (Lead Status, Total Visits) have **no** border. Label span `text-[#9E9E9E]`, value span `font-semibold text-[#1A1C1A]` (Lead Status value uses `text-[#2E7D32]`).
  - Land → `{{ selLand }} acres` · Crop → `{{ selCrop }}` · Season → `{{ selSeason }}` · Soil → `{{ selSoil }}` · Lead Status → `{{ selStatus }}` (green) · Total Visits → `{{ selVisitCount }}`.
- **Edit button** (sysadmin only, 1352–1357): `<sc-if isAdmin>` → `<div onClick=openFarmerEdit>` = `mt-3.5 flex items-center gap-2 px-4 py-2.5 bg-[#F5F7F5] rounded-[10px] cursor-pointer`, hover `hover:bg-[#E8F5E9]`. Contains a pencil SVG (stroke `#2E7D32`) + label `Edit Farmer Profile` (`text-[13px] font-semibold text-[#2E7D32]`).

**(b) Store Assignment card** (line 1360, inside `<sc-if value="{{ hasSelStore }}">`) — `card` but `p-0 overflow-hidden col-span-2 flex flex-col`. Renders only when the farmer maps to a store (`hasSelStore = !!selStore`).
- Header bar (1362): `px-[18px] py-3 flex items-center justify-between` with dynamic `bg={{ selStoreColor }}` (store's brand color).
  - Left (1363): `flex items-center gap-2.5` — a white store-front SVG (one inner rect filled `{{ selStoreColor }}`) + block:
    - Eyebrow: `text-[11px] font-bold text-white/75 uppercase tracking-[0.7px]` → "Primary Store".
    - Store name (1367): `text-[14px] font-bold text-white` → `{{ selStoreName }}`.
  - Right code chip (1370): `text-[11px] font-bold text-white/80 bg-white/[0.18] px-2.5 py-[3px] rounded-[20px]` → `{{ selStoreCode }}`.
- Body (1372): `px-[18px] py-3.5 flex-1`.
  - Address (1373): `text-[11px] text-[#9E9E9E] mb-2.5` → `{{ selStoreAddress }}`.
  - Eyebrow (1374): `text-[10px] font-bold text-[#9E9E9E] uppercase tracking-[0.6px] mb-2` → "Relationship Officers".
  - Officers row (1375): `flex gap-2.5`. Two equal tiles (`flex-1 px-3 py-2.5 bg-[#F5F7F5] rounded-[10px]`):
    - **AO 1 · Primary** (1376): eyebrow `text-[9px] font-bold text-[#9E9E9E] uppercase mb-1`; row `flex items-center gap-[7px]` → circle `w-[26px] h-[26px] rounded-full bg={{ selStoreColor }} text-white text-[9px] font-bold shrink-0` showing `{{ selStoreAO1 }}` (NOTE: the bug carries through — see Data) + name `text-[12.5px] font-semibold text-[#1A1C1A]` → `{{ selStoreAO1 }}`.
    - **AO 2 · Support** (1383): same but circle `bg-[#9E9E9E]`, content/name `{{ selStoreAO2 }}`.

**(c) KPI mini — Lifetime Value** (line 1395) — `card` + `flex flex-col justify-center` (single column, so `p-[22px]`).
- Eyebrow: `text-[10px] font-semibold text-[#9E9E9E] uppercase tracking-[0.8px]` → "Lifetime Value".
- Big value (1397): `text-[28px] font-bold text-[#2E7D32] mt-1.5` → `{{ selLtv }}`.
- Sub (1398): `text-[11px] text-[#9E9E9E] mt-1` → `{{ selSaleCount }} invoices`.

**(d) KPI mini — Last Purchase** (line 1400) — same card; eyebrow "Last Purchase"; value (1402) `text-[28px] font-bold text-[#1A1C1A] mt-1.5` → `{{ selLastPurchaseAmt }}`; sub `{{ selLastPurchaseDate }}`.

### 2.3 Middle grid — Sales History + Visit Log (line 1408)
Container: `grid grid-cols-[1.2fr_1fr] gap-[18px] mb-[18px]`.

**(a) Sales / Invoice History card** (1410) — `card`.
- Title (1411): `text-[15px] font-bold text-[#1A1C1A] mb-3.5` → "Sales / Invoice History".
- `<sc-if value="{{ selHasSales }}">` (1412):
  - Header row (1413): `grid grid-cols-[0.7fr_0.5fr_1.2fr_0.5fr_0.5fr] py-2.5 border-b border-[#F0F0F0] text-[10px] font-semibold text-[#9E9E9E] uppercase tracking-[0.4px]` — columns: Invoice / Date / Items / Amount / Store.
  - `<sc-for list="{{ selSales }}" as="sale">` (1420): each row `grid grid-cols-[0.7fr_0.5fr_1.2fr_0.5fr_0.5fr] py-[11px] border-b border-[#F8F8F8] items-center`:
    - `{{ sale.inv }}` → `text-[12px] font-semibold text-[#1565C0]`
    - `{{ sale.date }}` → `text-[12px] text-[#757575]`
    - `{{ sale.items }}` → `text-[12px] text-[#424242]`
    - `{{ sale.amt }}` → `text-[12.5px] font-bold text-[#1A1C1A]`
    - `{{ sale.store }}` → `text-[11px] text-[#9E9E9E]`
- `<sc-if value="{{ selNoSales }}">` (1430): empty state `p-7 text-center text-[#BDBDBD] text-[13px]` → "No purchase history yet".

**(b) Visit Reports card** (1436) — `card`.
- Header (1437): `flex justify-between items-center mb-3.5` — title "Visit Reports" (`text-[15px] font-bold text-[#1A1C1A]`) + count `{{ selVisitCount }} visits` (`text-[11px] text-[#2E7D32] font-semibold`).
- `<sc-for list="{{ selVisitLog }}" as="vl">` (1441): each entry `py-3.5 border-b border-[#F5F5F5]`:
  - Top row (1443): `flex justify-between items-center mb-1.5` — left `flex items-center gap-2`: green dot `w-2 h-2 rounded-full bg-[#2E7D32] shrink-0` + `{{ vl.purpose }}` (`text-[12.5px] font-semibold text-[#1A1C1A]`); right `{{ vl.date }}` (`text-[11px] text-[#BDBDBD]`).
  - Notes (1450): `text-[12px] text-[#616161] leading-[1.55] ml-4` → `{{ vl.notes }}`.
  - Author (1451): `text-[10.5px] text-[#9E9E9E] ml-4 mt-1` → `By {{ vl.by }}`.

---

## 3. DATA — every value → source field

**Selected farmer derivation** (lines 3166–3170):
```
sel = selectedFarmer ? { ...selectedFarmer, ...farmerEdits[selectedFarmer.id] } : {}
selStoreId = sel.id ? farmerStoreMap[sel.id] : null
selStore   = selStoreId ? storesWithEdits.find(st => st.id === selStoreId) : null
```
`farmerStoreMap` (2848–2849) is built from `baseStores[].farmerIds` (each store owns 2 farmer ids); `storesWithEdits` (2850) overlays `storeEdits[id]`. So the displayed store/officers come from the **Store** entity keyed by the farmer→store assignment, NOT from the farmer record. (The farmer record's own `storeCode` field is not used here.)

Detail bindings (lines 3663–3685):

| Binding | Source / formula | Entity.field |
|---|---|---|
| `selInit` | `(sel.name||'').split(' ').map(n=>n[0]).join('')` | derived from Farmer.name (initials) |
| `selName` | `sel.name||''` | Farmer.name |
| `selVillage` | `sel.village||''` | Farmer.village |
| `selDistrict` | `sel.district||''` | Farmer.district |
| `selMobile` | `sel.mobile||''` | Farmer.mobile |
| `selLand` | `sel.land||0` | Farmer.land (acres) |
| `selCrop` | `sel.crop||''` | Farmer.crop |
| `selSeason` | `sel.season||''` | Farmer.season — **NOT present in farmer demo data → always `''`** |
| `selSoil` | `sel.soil||''` | Farmer.soil — **NOT present in farmer demo data → always `''`** |
| `selStatus` | `sel.status||''` | Farmer.status (e.g. "Contacted","High Value","New","Follow-up","Dormant") |
| `selSegment` | `sel.segment||''` | Farmer.segment |
| `selSegBg` | `segBgs[sel.segment]||'#F5F5F5'` | derived from segment color map (2726) |
| `selSegColor` | `segColors[sel.segment]||'#757575'` | derived from segment color map (2725) |
| `selLtv` | `sel.ltv||'₹0'` | Farmer.ltv — **NOT present in farmer demo data → always `₹0`** |
| `selVisitCount` | `sel.visits||0` | Farmer.visits — **NOT present in farmer demo data → always `0`** (note: the visit log below can still show entries even though the count reads 0) |
| `hasSelStore` | `!!selStore` | derived (sc-if gate for Store card) |
| `selStoreName` | `selStore ? selStore.name : '—'` | Store.name |
| `selStoreCode` | `selStore ? selStore.code : '—'` | Store.code |
| `selStoreColor` | `selStore ? selStore.color : '#9E9E9E'` | Store.color (brand color) |
| `selStoreAddress` | `selStore ? selStore.address : ''` | Store.address |
| `selStoreAO1` | `selStore?.officers?.[0]?.name : ''` | Store.officers[0].name |
| `selStoreAO2` | `selStore?.officers?.[1]?.name : ''` | Store.officers[1].name |
| `selSaleCount` | `(sel.sales||[]).length` | count of Farmer.sales[] |
| `selLastPurchaseAmt` | `(sel.sales||[])[0]?.amt || '—'` | Farmer.sales[0].amt |
| `selLastPurchaseDate` | `(sel.sales||[])[0]?.date || 'No purchases'` | Farmer.sales[0].date |
| `selHasSales` | `(sel.sales||[]).length > 0` | sc-if gate |
| `selNoSales` | `(sel.sales||[]).length === 0` | sc-if gate (empty state) |
| `selSales` | `(sel.sales||[]).map(s=>({...s}))` | Farmer.sales[] → `{inv,date,items,amt,store}` |
| `selVisitLog` | `(sel.visitLog||[]).map(v=>({...v}))` | Farmer.visitLog[] → `{date,purpose,notes}` |

**Loops:**
- Sales rows: `sc-for list="selSales"` over `Farmer.sales[]`; row fields `sale.inv / sale.date / sale.items / sale.amt / sale.store`. (`hint-placeholder-count="3"` in the DSL — just a design-tool hint, not real data.)
- Visit rows: `sc-for list="selVisitLog"` over `Farmer.visitLog[]`; row fields `vl.purpose / vl.date / vl.notes / vl.by`.

**Conditionals:** `isFarmerDetail` (whole screen), `isAdmin` (edit button), `hasSelStore` (store card), `selHasSales` / `selNoSales` (sales table vs empty state).

### Demo-data values per farmer (for fixtures / pixel verification)
Farmers (lines 2727–2776) carry `id, code, name, mobile, village, district, zone, crop, land, status, segment, storeCode, lat, lng, sales[], visitLog[], issues[], concerns, leadStatus`. There is **no** `season`, `soil`, `ltv`, or `visits` field on any farmer — so in the demo those four UI cells render as `` (Season), `` (Soil), `₹0` (Lifetime Value), `0` (Total Visits / "0 visits"). The full sales/visit logs DO populate. Example: farmer id 1 (A K Shukla) → 2 sales, 2 visitLog entries; id 4 (Aadarsh Dwivedi) → `sales:[]` so the Sales card shows the "No purchase history yet" empty state.

Store→farmer mapping (from `baseStores[].farmerIds`):
- Ram Nagar (AGRO0012, #1565C0) → farmers 1,2 — officers Durgesh Mishra / Rinku Verma
- Haidergarh (AGRO0015, #2E7D32) → 3,4 — only ONE officer (Dev Prakash Narayan) ⇒ AO2 empty
- Tiloi (AGRO0018, #E65100) → 5,6 — Aviral Pal / Sujit Kumar Pandey
- Shivgarh (AGRO0019, #7B1FA2) → 7,8 — Aniket Srivastava / Ankur Singh
- Sanda Farm (AGRO0028, #F57F17) → 9,10 — Ajay Pal Yadav / Sant Verma (3rd officer ignored)
- Aliganj (AGRO0031, #C62828) → 11,12 — Ajay Kumar Verma / Abhishek Kumar Verma

Segment color maps (2724–2726):
`'High Value' → bg #E8F5E9 / fg #2E7D32`; `'Medium Value' → #E3F2FD / #1565C0`; `'New/Low' → #FFF8E1 / #F57F17`; `'Dormant' → #F5F5F5 / #9E9E9E`. Fallback bg `#F5F5F5`, fg `#757575`.

---

## 4. INTERACTIONS

| Element | Event | Handler | Behavior |
|---|---|---|---|
| Back link (1326) | `onClick` | `goToFarmers` = `go('farmers')` (3685/3605) | `setState({ view:'farmers', step:0, selectedFarmer:null })` — returns to Farmer 360 list and clears selection. |
| Edit Farmer Profile (1353, sysadmin only) | `onClick` | `openFarmerEdit` (3456–3463) | Opens the global Edit Modal: sets `editModal = { type:'farmer', entityId:f.id, title:'Edit Farmer — '+f.name, sub:f.village+' · '+f.mobile }` and seeds `editDraft` with `fName, fMobile, fVillage, fDistrict, fLand, fCrop, fStatus, fSegment` from the (edit-merged) farmer. Modal markup is elsewhere in the template; on save → `saveEditModal` (3473–3481) writes `farmerEdits[entityId]` and also patches the live `selectedFarmer` so this screen updates immediately. `closeEditModal` clears modal/draft. |

No other onClick/onChange on this screen. The sales rows and visit rows are **not** clickable. There is no inline editing of fields here — all edits flow through the modal.

---

## 5. ROLE DIFFERENCES, EMPTY STATES, DYNAMIC STYLING

**Role differences:** Only `isAdmin` (sysadmin) shows "Edit Farmer Profile". Everything else is identical across roles. The screen has no role-specific data filtering.

**Empty / fallback states:**
- No `selectedFarmer` (e.g., deep-link or after a nav reset): `sel = {}` → name/initials blank, all string fields `''`, land `0`, LTV `₹0`, "0 invoices", last purchase `—` / "No purchases", sales empty state, empty visit list, segment pill empty with fallback grey colors. Store card hidden (`hasSelStore` false). **Port should guard against this** — ideally redirect to the list if no farmer is selected.
- No store mapping → Store Assignment card hidden entirely.
- Single-officer store (Haidergarh) → AO2 tile renders with empty initials/name.
- `sales:[]` → Sales card shows "No purchase history yet"; LTV mini shows "0 invoices", "—", "No purchases".
- `selVisitCount` is always `0` in demo (field missing), so the header reads "0 visits" even when the visit list has entries — a real backend should compute count from `visitLog.length` (call this out as a fix in the port).

**Dynamic / data-driven styling:**
- Segment pill `bg`/`color` from `segBgs`/`segColors` keyed on `sel.segment`.
- Store card header bg, store-icon inner rect fill, and AO1 avatar bg all = `selStoreColor` (Store.color).
- Hover overrides: back link `hover:text-[#2E7D32]`; edit button `hover:bg-[#E8F5E9]`. No `style-active` on this screen.
- Entrance: `animation:fadeUp 0.4s ease-out` on the root.

---

## 6. PORT NOTES (React / Next.js + Tailwind)

**Component split:**
- `FarmerDetailPage` (route segment, e.g. `app/farmers/[id]/page.tsx`) — fetches the farmer + its store, renders layout. Replace the `view==='farmerDetail'` + `selectedFarmer` state pattern with a real route param `[id]`; on missing/invalid id → `notFound()` or redirect to `/farmers`.
- `BackLink` (shared) — `← Back to Farmer 360` → `<Link href="/farmers">`.
- `FarmerProfileCard` — props: `{ farmer, isAdmin, onEdit }`. Internally `SegmentPill` (props: `segment` → looks up the segment token map).
- `StoreAssignmentCard` — props: `{ store }`; render `null` when no store. `OfficerTile` subcomponent (props `{ label, name, color }`).
- `KpiMini` — props `{ label, value, valueColor, sub }`; used twice (LTV green, Last Purchase dark).
- `SalesHistoryCard` — props `{ sales }`; renders header + map, or empty state. Use a CSS grid template `grid-cols-[0.7fr_0.5fr_1.2fr_0.5fr_0.5fr]` shared by header + rows.
- `VisitReportsCard` — props `{ visits, count }`.
- `EditFarmerModal` is a **shared** cross-screen component (also used by Users/KPI/Store master-data edits). Lift it to a layout-level provider/context (`editModal`, `editDraft` state) rather than per-screen.

**Data hooks / layer:**
- One query: farmer by id with its assigned store and store officers. In Prisma terms: `Farmer` (name, mobile, village, district, land, crop, season, soil, status/leadStatus, segment) → relation to `Store` (name, code, color, address) → `Store.officers` (`User`/Officer rows ordered, take first two: primary + support). `Farmer.sales[]` (`Sale`/invoice: inv, date, items, amount, store) and `Farmer.visitLog[]` (`Visit`: date, purpose, notes, by/author).
- **Add the missing computed/real fields** that the demo lacked: `lifetimeValue` (sum of sales), `saleCount`, `lastPurchase` (amount+date from latest sale), `visitCount = visits.length`, plus `season`/`soil` columns on Farmer. The original UI binds them but the demo never populated them.
- Tokenize colors: map literal hexes to design tokens — `#2E7D32` (primary green), `#1565C0` (invoice/info blue), `#1A1C1A` (ink), `#9E9E9E`/`#BDBDBD` (muted), surface `#F5F7F5`/`#F5F5F5`/`#E8F5E9`. Segment + store colors are data-driven; for store color, keep a per-store `color` column (brand color) so the header tints correctly, OR derive from a palette by store index.

**Gotchas:**
1. Store/officer data comes from the store assignment map, not the farmer's own `storeCode` — keep the Farmer→Store relation authoritative.
2. AO1 avatar shows the **full name** (`selStoreAO1`) instead of initials — this is a faithful reproduction of an original bug. Decide whether to keep or fix (recommend computing initials for the avatar in the port).
3. Stores can have 1 or 3+ officers; UI only ever shows slots [0] and [1]. Handle a missing [1] gracefully (empty tile or hide the support tile).
4. "Total Visits" / "N visits" should be derived from `visitLog.length` in the port (demo always shows 0).
5. Guard the no-selected-farmer case (redirect) since the original silently renders an all-blank shell.
6. Saving an edit must update the displayed farmer immediately (original patches `selectedFarmer`); with a route+query approach, revalidate/refetch after the mutation.
