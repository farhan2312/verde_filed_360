# Screen Spec — Farmer 360 (list)

Source: `original-design.dc.html` template lines **1263–1322**; script: state **2585–2648**, `renderVals()` **2650–3808** (key spots: `farmers` array 2727–2776; filtering 2782–2787; `farmerRows` 2851–2865; `segCards`/`segFilters` 3650–3662; `onSearch` 3647).

---

## 1. PURPOSE & WHEN IT SHOWS

A segmented, searchable directory of registered farmers ("Farmer 360"). It is the entry point to a single farmer's profile (`farmerDetail`).

- **Gate:** `<sc-if value="{{ isFarmers }}">`, where `isFarmers = s.view === 'farmers'` (line 2678). Renders only when `state.view === 'farmers'`.
- **Role gating:** none. `showFarmer360 = true` for all roles (line 2694). The nav item is visible to every persona (regional / officer / central / sysadmin). No per-role differences in this screen's layout or data (the only role-aware mutation is sysadmin's `farmerEdits`/`storeEdits` overlays applied to the base data — see §5).
- **Header (rendered by the shared page chrome, not this slice):** title `Farmer 360`, subtitle `1,284 registered farmers · Segmented view` (from `titles.farmers`, line 2717). Note: this hard-coded "1,284" does not match the 12 demo rows.
- **Outer wrapper:** `<div style="animation:fadeUp 0.4s ease-out;">` — entrance animation only. Tailwind: wrap in a div with a `fade-up` keyframe (`animate-[fadeUp_0.4s_ease-out]`), no other layout impact.

---

## 2. LAYOUT TREE (top → bottom)

Root: `<div>` (fadeUp). Three stacked blocks: **(A) Segmentation cards**, **(B) Search + filter chips**, **(C) Table**.

### A. Segmentation Summary Cards (lines 1267–1278)
Grid container:
- inline: `display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:20px;`
- Tailwind: `grid grid-cols-4 gap-[14px] mb-5`

`sc-for list="{{ segCards }}" as="sc"` → exactly **4** cards (one per segment label). Each card:
- inline: `background:white; border-radius:12px; padding:16px 18px; box-shadow:0 1px 3px rgba(0,0,0,0.04); border:1px solid rgba(0,0,0,0.03); border-top:3px solid {{ sc.color }}; cursor:pointer;`
- `style-hover="box-shadow:0 2px 8px rgba(0,0,0,0.08);"`
- Tailwind: `bg-white rounded-xl px-[18px] py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] border-t-[3px] cursor-pointer hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]` with dynamic `borderTopColor: sc.color` via style prop.
- Children:
  1. Label: `font-size:10px; font-weight:600; color:#9E9E9E; text-transform:uppercase; letter-spacing:0.8px;` → `text-[10px] font-semibold text-[#9E9E9E] uppercase tracking-[0.8px]` → `{{ sc.label }}`.
  2. Count row: `display:flex; align-items:flex-end; gap:8px; margin-top:6px;` → `flex items-end gap-2 mt-1.5`.
     - Big number: `font-size:24px; font-weight:700; color:#1A1C1A;` → `text-2xl font-bold text-[#1A1C1A]` → `{{ sc.count }}`.
     - Suffix "farmers": `font-size:11px; color:#9E9E9E; margin-bottom:3px;` → `text-[11px] text-[#9E9E9E] mb-[3px]`.
  3. Revenue line: `font-size:11px; color:{{ sc.color }}; font-weight:600; margin-top:4px;` → `text-[11px] font-semibold mt-1` with dynamic `color: sc.color` → `{{ sc.revenue }}`.

### B. Search + Filter row (lines 1280–1285)
Container: `display:flex; gap:12px; margin-bottom:16px; align-items:center;` → `flex gap-3 mb-4 items-center`.

- **Search input** (line 1281): `<input type="text" placeholder="Search by name, village, or mobile..." value="{{ search }}" onChange="{{ onSearch }}">`
  - inline: `flex:1; max-width:420px; padding:11px 18px; border:1.5px solid #E0E0E0; border-radius:12px; font-size:13px; font-family:inherit; background:white; box-sizing:border-box; outline:none;`
  - `style-focus="border-color:#2E7D32; box-shadow:0 0 0 3px rgba(46,125,50,0.1);"`
  - Tailwind: `flex-1 max-w-[420px] px-[18px] py-[11px] border-[1.5px] border-[#E0E0E0] rounded-xl text-[13px] bg-white box-border outline-none focus:border-[#2E7D32] focus:shadow-[0_0_0_3px_rgba(46,125,50,0.1)]`.
- **Filter chips** `sc-for list="{{ segFilters }}" as="sf"` → **5** chips: `All`, `High Value`, `Medium Value`, `New/Low`, `Dormant`. Each:
  - inline: `padding:7px 16px; border-radius:20px; font-size:11.5px; font-weight:600; cursor:pointer; background:{{ sf.bg }}; color:{{ sf.color }}; border:1.5px solid {{ sf.border }};`
  - `style-hover="opacity:0.85;"`
  - Tailwind: `px-4 py-[7px] rounded-full text-[11.5px] font-semibold cursor-pointer border-[1.5px] hover:opacity-85` with dynamic `background/color/borderColor` from `sf` → `{{ sf.label }}`.

### C. Table (lines 1287–1319)
Outer card: `background:white; border-radius:14px; box-shadow:0 1px 3px rgba(0,0,0,0.04); border:1px solid rgba(0,0,0,0.03); overflow:hidden;` → `bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] overflow-hidden`.

- **Header row** (line 1288): grid `grid-template-columns:1.3fr 0.7fr 0.5fr 0.5fr 0.6fr 0.6fr 0.8fr 0.5fr; padding:14px 22px; background:#FAFAFA; border-bottom:1px solid #F0F0F0; font-size:10.5px; font-weight:600; color:#9E9E9E; text-transform:uppercase; letter-spacing:0.5px;`
  - Tailwind: `grid [grid-template-columns:1.3fr_0.7fr_0.5fr_0.5fr_0.6fr_0.6fr_0.8fr_0.5fr] px-[22px] py-3.5 bg-[#FAFAFA] border-b border-[#F0F0F0] text-[10.5px] font-semibold text-[#9E9E9E] uppercase tracking-[0.5px]`.
  - 8 column labels: **Farmer · Village · Crop · Segment · LTV · Last Visit · Store · Status**.

- **Body rows** `sc-for list="{{ farmerRows }}" as="fr"` (one per filtered farmer). Each row (line 1299): same 8-col grid, `padding:13px 22px; border-bottom:1px solid #F8F8F8; cursor:pointer; align-items:center;`, `style-hover="background:#FAFFFE;"`.
  - Tailwind: same grid template, `px-[22px] py-[13px] border-b border-[#F8F8F8] cursor-pointer items-center hover:bg-[#FAFFFE]`.
  - **Col 1 — Farmer** (`flex items-center gap-2.5`):
    - Avatar circle `width:34px; height:34px; border-radius:50%; background:{{ fr.avBg }}; flex/center; font-weight:700; font-size:12px; color:white; flex:none;` → `w-[34px] h-[34px] rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0` + dynamic `background: fr.avBg` → initials `{{ fr.init }}`.
    - Name `font-size:13px; font-weight:600; color:#1A1C1A;` → `text-[13px] font-semibold text-[#1A1C1A]` → `{{ fr.name }}`.
    - Mobile `font-size:10.5px; color:#BDBDBD;` → `text-[10.5px] text-[#BDBDBD]` → `{{ fr.mobile }}`.
  - **Col 2 — Village** `text-xs text-[#616161]` → `{{ fr.village }}`.
  - **Col 3 — Crop** `text-xs text-[#616161]` → `{{ fr.crop }}`.
  - **Col 4 — Segment** pill: wrapper `flex`; pill `padding:2px 9px; border-radius:20px; font-size:10px; font-weight:600; background:{{ fr.segBg }}; color:{{ fr.segColor }};` → `inline-flex px-[9px] py-0.5 rounded-full text-[10px] font-semibold` + dynamic bg/color → `{{ fr.segment }}`.
  - **Col 5 — LTV** `font-size:12.5px; font-weight:600; color:#1A1C1A;` → `text-[12.5px] font-semibold text-[#1A1C1A]` → `{{ fr.ltv }}`.
  - **Col 6 — Last Visit** `text-xs text-[#9E9E9E]` → `{{ fr.lastVisit }}`.
  - **Col 7 — Store** (`flex items-center gap-[5px]`): color square `width:8px; height:8px; border-radius:2px; background:{{ fr.frStoreColor }}; flex:none;` → `w-2 h-2 rounded-sm shrink-0` + dynamic bg; store name `font-size:11px; font-weight:600; color:#616161;` → `text-[11px] font-semibold text-[#616161]` → `{{ fr.frStoreName }}`.
  - **Col 8 — Status** pill: wrapper `flex`; pill `padding:2px 9px; border-radius:20px; font-size:10px; font-weight:600; background:{{ fr.sBg }}; color:{{ fr.sColor }};` → same pill classes + dynamic bg/color → `{{ fr.status }}`.

---

## 3. DATA

### Source entity: **Farmer** (demo array `farmers`, lines 2727–2776; 12 records)
Each base farmer field: `id, code (FARM…), name, mobile, village, district, zone, crop, land, status, segment, storeCode (AGRO…), lat, lng, sales[], visitLog[], issues[], concerns, leadStatus`.

**Pipeline** (lines 2782–2787): `farmersWithEdits = farmers.map(f => ({...f, ...(state.farmerEdits[f.id]||{})}))` (sysadmin overlay) → filter by search `q` (name/village/mobile, lowercased; mobile is substring on raw digits) → filter by `segF = state.segFilter` (exact segment match). Result = `filtered`.

**`farmerRows`** (2851–2865) maps `filtered` → row VM. Per row:
| Template binding | Source / derivation |
|---|---|
| `fr.init` | `name.split(' ').map(n=>n[0]).join('')` (initials) |
| `fr.avBg` | `avColors[i % 8]` (palette line 2779) — index by **filtered position**, so it reshuffles when the list filters |
| `fr.name` | Farmer.name |
| `fr.mobile` | Farmer.mobile |
| `fr.village` | Farmer.village |
| `fr.crop` | Farmer.crop |
| `fr.segment` | Farmer.segment |
| `fr.segBg` / `fr.segColor` | `segBgs[segment]` / `segColors[segment]` (maps line 2725–2726) |
| `fr.status` | Farmer.status |
| `fr.sBg` / `fr.sColor` | `stColors[status]` (fallback `stColors.New`), line 2778 |
| `fr.frStoreName` | Store.name first word, via `farmerStoreMap` → only farmers **1,2,3,4** map to a store; **5–12 render `—`** (see note) |
| `fr.frStoreColor` | Store.color, else `#9E9E9E` |
| `fr.ltv` | **Not present on base farmer** → renders empty/undefined |
| `fr.lastVisit` | **Not present on base farmer** → renders empty/undefined |

**Store lookup (`farmerStoreMap`, lines 2848–2849):** built from each base store's `farmerIds`. In the demo only `AGRO0012.farmerIds=[1,2]` and `AGRO0015.farmerIds=[3,4]` are populated for these IDs, so **only farmer ids 1–4 get a store**; farmers 5–12 show `frStoreName='—'`, `frStoreColor='#9E9E9E'`. (The farmer's own `storeCode` field is *not* used for this column.) Store entity fields used: `Store.name`, `Store.color`. Stores defined in `baseStores` (2790+), overlaid with `state.storeEdits`.

### Segment summary cards: **derived analytics** (`segCards`, lines 3650–3656)
Loops `segLabels = ['High Value','Medium Value','New/Low','Dormant']`. For each label:
- `group = farmers.filter(f=>f.segment===label)` (over the **full unfiltered** demo array).
- `count = group.length` → `{{ sc.count }}`.
- `color = segColors[label]` → border-top + count-color + revenue-color.
- `revenue = '₹' + Math.round(rev/1000) + 'K total revenue'`, where `rev = group.reduce((a,f)=>a+f.totalPurchase,0)`.
  - ⚠️ **`totalPurchase` does not exist on the farmer records**, so `rev = NaN` → revenue line renders **"₹NaNK total revenue"** in the demo. When porting, replace with a real LTV/total-sales aggregate (e.g. sum of `Visit`/`Sale.amount` per farmer) so this shows a real number.

### Filter chips: **derived** (`segFilters`, lines 3657–3662)
`['All', ...segLabels]` → 5 chips. Active chip = `(state.segFilter||'All') === label`. Active styling: bg = `#424242` for All else `segColors[label]`, text white, no border; inactive: white bg, text `#616161`/segColor, `#E0E0E0` border.

### Search box
`{{ search }}` = `state.search`; `{{ onSearch }}` = `e => setState({search: e.target.value})` (line 3647).

---

## 4. INTERACTIONS

| Element | Handler | Behavior |
|---|---|---|
| Search input `onChange` | `onSearch` (3647) | `setState({ search: e.target.value })` → re-filters `farmers` by name/village/mobile (case-insensitive; mobile = substring). |
| Segment **card** `onClick` | `sc.onClick` (3654) | `setState({ search:'', segFilter: label })` → clears search AND sets the segment filter to that card's label (acts as a shortcut filter). |
| Filter **chip** `onClick` | `sf.onClick` (3661) | `setState({ segFilter: label==='All' ? null : label })`. "All" clears the filter. |
| Table **row** `onClick` | `fr.onClick` (2863) | `setState({ view:'farmerDetail', selectedFarmer: f })` → navigates to the Farmer 360 Profile screen, passing the full base farmer object. |

Note the asymmetry: clicking a card *also* resets `search`; clicking a chip does not. Both write to `state.segFilter`.

---

## 5. ROLE DIFFERENCES, EMPTY STATES, DYNAMIC STYLING

- **Roles:** identical for all 4 personas (no conditional UI). Sysadmin's `state.farmerEdits` / `state.storeEdits` are merged into the displayed farmer/store data upstream (2782, 2850), so an admin who edited a farmer in Master Data sees those edits reflected here — but no extra controls render on this screen.
- **Empty state:** none implemented. If search/filter yields zero rows, the table card renders with only the header row and an empty body (no "no results" message). Add one when porting.
- **Initial `segFilter`:** `state.segFilter` is **not** in the initial state object (2586–2648), so it is `undefined` on first render → `segFilters` treats it as `'All'` (All chip active) and `filtered` applies no segment filter.
- **Dynamic styling:**
  - Card hover: shadow deepens (`hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]`); border-top color is the segment color.
  - Chip hover: `opacity:0.85`; active vs inactive bg/text/border driven entirely by `sf`.
  - Input focus: green border `#2E7D32` + green focus ring `0 0 0 3px rgba(46,125,50,0.1)`.
  - Row hover: very pale mint `#FAFFFE`.
  - Avatar background cycles through `avColors` by **filtered index** (not stable per-farmer) — porting decision: keep index-based, or key off `farmer.id` for stability.

---

## 6. PORT NOTES (Next.js 14 + TS + Tailwind)

**Component split:**
- `Farmer360Page` (route/view container) — owns `search` and `segFilter` state (URL search params or local state), fetches data.
- `SegmentSummaryCards` — props: `cards: {label, count, color, revenue}[]`, `onSelect(label)`.
- `FarmerFilterBar` — props: `search`, `onSearchChange`, `filters: {label, active}[]`, `onFilterChange(label|null)`.
- `FarmerTable` — props: `rows: FarmerRowVM[]`, `onRowClick(farmerId)`; render `FarmerTableRow` per row.

**Data hooks / layer:**
- Need a `useFarmers({ search, segment })` query returning farmer + joined store + derived LTV/last-visit.
- **Compute the missing fields server-side / in the query** (the demo omits them):
  - `ltv` = SUM of the farmer's `Sale.amount` (or a `Farmer.lifetimeValue` column).
  - `lastVisit` = MAX `Visit.date` for the farmer, formatted (e.g. "Jun 18").
  - `totalPurchase` per segment for the card revenue — aggregate from sales, not the missing field.
- **Store column:** derive from a real `Farmer.storeId` relation. The demo's `storeCode` on each farmer (e.g. `AGRO0018`) is the correct source of truth; the demo's `farmerStoreMap` (via `Store.farmerIds`) only covers ids 1–4 and should NOT be replicated — join on `storeCode`/`storeId` instead so all rows show their store.
- Segment cards count over **all** farmers (ignore active filters); the table counts over the filtered set.

**Gotchas:**
1. `₹NaNK` revenue bug — fix with a real aggregate.
2. Empty `ltv`/`lastVisit` cells in the original — supply real data.
3. `avBg` keyed by filtered index → flickers on filter; prefer keying by `farmer.id`.
4. Header subtitle hard-codes "1,284 registered farmers" — wire to an actual count.
5. Card click clears search; chip click does not — preserve this UX or unify deliberately.
6. The 8-column grid uses fractional tracks (`1.3fr 0.7fr 0.5fr 0.5fr 0.6fr 0.6fr 0.8fr 0.5fr`) shared between header and rows — keep them in one constant so columns stay aligned. Consider mobile: this table is not responsive in the original; add horizontal scroll or a card layout for small screens.
7. Segment color/bg maps (`segColors`, `segBgs`) and status color map (`stColors`) should become shared design tokens / a util.

---

### SUMMARY
Farmer 360 (list) shows when `view==='farmers'` (all roles). It stacks 4 segment summary cards (counts + ₹revenue per `High/Medium/New/Dormant` segment, computed over all farmers), a search box + 5 segment filter chips, and an 8-column table (Farmer/Village/Crop/Segment/LTV/Last Visit/Store/Status) over `farmerRows` = farmers filtered by `search` (name/village/mobile) and `segFilter`. Data comes from the `Farmer` entity joined to `Store` (name+color), with segment/status color tokens and avatar palette. Rows navigate to `farmerDetail` (sets `selectedFarmer`); cards/chips set `segFilter`. Known demo bugs to fix on port: `ltv`/`lastVisit` are absent on farmer records (empty cells), `totalPurchase` is missing (cards show "₹NaNK"), and the store column only resolves for farmer ids 1–4 (join on `storeCode` instead).
