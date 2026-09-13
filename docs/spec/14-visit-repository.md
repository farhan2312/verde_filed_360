# Screen 14 — Visit Repository (`view === 'visitRepo'`)

Port spec for the "Visit Repository" screen. Source DSL: `docs/original-design.dc.html`
template lines **706–817**; logic in `renderVals()` lines **3050–3134** plus shared
helpers. Target: Next.js 14 App Router + TypeScript + Tailwind.

---

## 1. PURPOSE & WHEN IT SHOWS

A flat, filterable **table of every field visit** across all officers and stores — the
"all visits" master log (as opposed to the dashboard's "recent 5"). Each row is a visit;
clicking a row opens the Visit Detail screen.

- **Shown when** `state.view === 'visitRepo'`. Template gate: `<sc-if value="{{ isVisitRepo }}">`
  where `isVisitRepo = s.view === 'visitRepo'` (line 2687).
- **Header** (rendered by the shared shell, not this slice): title/sub come from
  `titles.visitRepo = ['Visit Repository', 'Complete visit records across all officers & stores']`
  (line 2719).
- **Role gating:** the **nav item is visible to ALL roles** — `showVisitRepo = true` (line 2701),
  used by the sidebar `<sc-if value="{{ showVisitRepo }}">` at line 45. There is **no role
  restriction on the screen itself**. The only role-dependent behavior is the underlying
  data pool selection (see §5).
- **Nav active state:** `nv('visitRepo')` treats the item as active for both `visitRepo` and
  `visitDetail` views (line 2707), so the sidebar stays highlighted while drilled into a visit.
- **Navigation in:** sidebar `goToVisitRepo` = `() => setState({ view:'visitRepo', selectedVisit:null })`
  (line 3529). Note it clears `selectedVisit`.

---

## 2. LAYOUT TREE (top → bottom)

Root wrapper: `<div>` with entrance animation `animation:fadeUp 0.4s ease-out`.
Tailwind: add a keyframe `fade-up` to config (translateY + opacity) → `className="animate-[fadeUp_0.4s_ease-out]"`.
The screen has three stacked blocks: **KPI strip**, **Filter bar**, **Visit table**.

### 2.1 KPI strip (4 cards)
Outer grid (line 710):
- `grid grid-cols-4 gap-[14px] mb-5` (gap 14px, margin-bottom 20px).

Each KPI card (lines 711–734) — 4 identical except icon tile color + value:
- Card: `bg-white rounded-xl px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] flex items-center gap-[14px]`
  (radius 12px, padding 16px 20px).
- Icon tile: `w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0` with a per-card pastel `background`:
  | KPI | Icon tile bg | SVG fill | Icon glyph |
  |-----|--------------|----------|-----------|
  | Total Visits | `#E8F5E9` | `#2E7D32` | stacked bars (list) |
  | Need Follow-up | `#FFF3E0` | `#E65100` | star |
  | Officers Active | `#E3F2FD` | `#1565C0` | person |
  | Farmers Covered | `#F3E5F5` | `#7B1FA2` | shield |
- Text block: value `text-2xl font-bold text-[#1A1C1A] leading-none` (24px/700);
  label `text-[11px] text-[#9E9E9E] mt-[3px]`.

KPI values (left→right): `{{ vrTotal }}`, `{{ vrFollowup }}`, `{{ vrOfficers }}`, `{{ vrFarmers }}`.

### 2.2 Filter bar (line 738)
- Card: `bg-white rounded-xl px-5 py-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] mb-4`.
- Inner row: `flex items-center gap-[10px] flex-wrap`.
- **Period pills** — `<sc-for list="{{ vrPeriodPills }}" as="pp">` (4 pills). Each pill:
  `px-[14px] py-[6px] rounded-[20px] text-xs font-semibold cursor-pointer transition-all`
  with **dynamic** `background:{{pp.bg}}`, `color:{{pp.color}}`, `border:1.5px solid {{pp.border}}`,
  and `style-hover="opacity:0.85"` → `hover:opacity-85`. Label `{{ pp.label }}`.
- **Divider**: `w-px h-6 bg-[#F0F0F0] mx-1`.
- **3 `<select>` dropdowns** (Officer / Store / Visit type). Each:
  `px-3 py-[6px] border-[1.5px] border-[#E0E0E0] rounded-lg text-xs bg-white outline-none text-[#616161] cursor-pointer`.
  - Officer select: `value={{vrfOfficer}}` `onChange={{setVrfOfficer}}`; hard-coded `<option>`s:
    `all`→"All Officers", then `Raj Kumar`, `Amit Yadav`, `Vikram Singh`, `Deepak Verma`.
  - Store select: `value={{vrfStore}}` `onChange={{setVrfStore}}`; options `all`→"All Stores", then
    `Chandpur`, `Fatehabad`, `Bah`, `Firozabad`, `Mainpuri`, `Etah`.
  - Type select: `value={{vrfType}}` `onChange={{setVrfType}}`; options `all`→"All Types", then 12
    visit types: `First visit`, `Crop inspection`, `Crop monitoring`, `Product demo`,
    `Product delivery`, `Follow-up`, `Sowing advisory`, `Harvest planning`, `Re-engagement`,
    `Season review`, `Soil advisory`, `Pest check`. (Option label may differ in case from value,
    e.g. value `First visit` / label "First Visit".)
- **Count label** (right): `ml-auto text-xs text-[#9E9E9E] font-medium` → `{{ vrTotal }} visits found`.

> Note: the `<option>` lists are **static markup**, not data-bound. Script does compute
> `allOfficers`, `allStoreNames`, `allVisitTypes` (lines 3132–3134) and exports them, but the
> template uses literal options. For the port, prefer rendering options from those exported
> arrays so they stay in sync (gotcha: the static markup store options are short names like
> "Chandpur" matched against `v.storeName`, which is the store name's **first word** — see §3).

### 2.3 Visit table (line 784)
- Card: `bg-white rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] overflow-hidden`.
- **Header row** (line 785): a grid
  `grid grid-cols-[0.5fr_1.4fr_0.8fr_0.8fr_0.8fr_0.7fr_0.6fr_0.6fr] px-[22px] py-[13px] bg-[#FAFAFA] border-b border-[#F0F0F0] text-[10.5px] font-semibold text-[#9E9E9E] uppercase tracking-[0.5px]`.
  Columns: **Date · Farmer · Visit Type · Officer · Store · Crop · Follow-up · (blank)**.
- **Body rows** — `<sc-for list="{{ visitRepoRows }}" as="vr">`. Each row:
  - Same grid template as header; `px-[22px] py-[13px] border-b border-[#F8F8F8] items-center cursor-pointer`,
    `onClick={{vr.onClick}}`, `style-hover="background:#FAFFFE"` → `hover:bg-[#FAFFFE]`.
  - **Date** cell: `text-xs font-semibold text-[#1A1C1A]` → `{{ vr.date }}`.
  - **Farmer** cell: `flex items-center gap-[9px]`:
    - Avatar: `w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px] text-white shrink-0`
      with dynamic `background:{{vr.avBg}}`, content `{{ vr.init }}` (initials).
    - Name `text-[13px] font-semibold text-[#1A1C1A]` → `{{ vr.farmerName }}`;
      sub `text-[10.5px] text-[#BDBDBD]` → `{{ vr.village }}, {{ vr.district }}`.
  - **Visit Type** cell: an inline pill `inline-flex items-center gap-[5px] px-[10px] py-[3px] rounded-[20px] bg-[#F5F5F5]`
    containing a `w-[7px] h-[7px] rounded-full` dot with dynamic `background:{{vr.typeColor}}`
    and `<span class="text-[11px] font-semibold text-[#616161]">{{ vr.purpose }}</span>`.
  - **Officer** cell: `text-xs text-[#616161]` → `{{ vr.officer }}`.
  - **Store** cell: `flex items-center gap-[5px]` with a `w-[7px] h-[7px] rounded-[2px]` square
    swatch (`background:{{vr.storeColor}}`) + `<span class="text-xs text-[#616161]">{{ vr.storeName }}</span>`.
  - **Crop** cell: `text-xs text-[#616161]` → `{{ vr.crop }}`.
  - **Follow-up** cell: pill `px-[9px] py-[2px] rounded-[20px] text-[10px] font-semibold inline-block`
    with dynamic `background:{{vr.followupBg}}` `color:{{vr.followupColor}}` → `{{ vr.followup }}`.
  - **Action** cell: `text-[11px] font-semibold text-[#2E7D32]` → literal `View →`.

### Tailwind color token mapping (recurring hexes)
| Hex | Suggested token | Use |
|-----|------|-----|
| `#1A1C1A` | `ink` / text-primary | headings, values |
| `#616161` | text-secondary | row text |
| `#9E9E9E` | text-muted | labels / KPI captions |
| `#BDBDBD` | text-faint | village/district |
| `#2E7D32` | brand-green | "View →", green accents |
| `#1A3A1A` | brand-dark-green | active period pill bg |
| `#FAFAFA` | surface-alt | table header bg |
| `#FAFFFE` | row-hover | row hover bg |
| `#F0F0F0`,`#F8F8F8` | border-subtle | dividers/row borders |
| `#E0E0E0` | border-input | select borders |
Follow-up/type/store/segment colors are **data-driven** (see §3) and must stay inline styles
or be mapped via a lookup util.

---

## 3. DATA

All rows derive from `allVisitsRaw` (built lines 3052–3084), which is **flattened from
farmer visit logs**: for every farmer in `farmersWithEdits`, iterate `farmer.visitLog[]` and
emit one record per log entry. Mapping to target entities:

**Data entity = `Visit`** (one row per visit log entry), joined to `Farmer` and `Store`.

Per-visit record fields (source → meaning), produced at lines 3061–3079:
| Field | Source | Notes |
|-------|--------|-------|
| `id` | counter `visId++` (starts 2401) | synthetic; in port use Visit PK |
| `vid` | `'VIS-' + visId` | display id (used on detail screen) |
| `farmerId` | `farmer.id` | FK Farmer |
| `farmerName` | `farmer.name` | shown in row |
| `farmerMobile` | `farmer.mobile` | (detail only) |
| `village`, `district` | `farmer.village/.district` | row sub-label |
| `crop`, `segment`, `land` | `farmer.crop/.segment/.land` | crop shown in row |
| `officer` | `visitLog.by` | who did the visit |
| `date` | `visitLog.date` | e.g. "Jun 22" |
| `purpose` | `visitLog.purpose` | visit type |
| `notes` | `visitLog.notes` | (detail only) |
| `storeName` | first word of the farmer's mapped store name | via `farmerStoreMap[f.id]` → `storesWithEdits`; e.g. "Chandpur" |
| `storeColor` | mapped store's `.color`, else `#9E9E9E` | square swatch |
| `typeColor` | `visitTypes[purpose]` lookup, else `#757575` | type dot color |
| `followup` | `'Needed'` if purpose ∈ {Follow-up, Crop inspection, Re-engagement} else `'None'` | derived |
| `followupBg` | `#FFF3E0` if Needed else `#E8F5E9` | pill bg |
| `followupColor` | `#E65100` if Needed else `#2E7D32` | pill text |
| `segBg`,`segColor` | `segBgs[segment]`/`segColors[segment]` | (detail only) |
| `init` | initials from `farmer.name` | avatar |
| `avBg` | `avColors[index % 8]` | avatar bg (palette line 2779) |

**`visitTypes` color map** (line 3051): Crop inspection/monitoring `#2E7D32`; Product demo/delivery `#1565C0`;
Follow-up `#E65100`; First visit `#F57F17`; Sowing advisory `#00695C`; Harvest planning `#7B1FA2`;
Re-engagement `#AD1457`; Season review `#4527A0`; Soil advisory `#6D4C41`; Pest check `#C62828`.

**`storeName` gotcha:** it's the store name's **first word** (`.name.split(' ').slice(0,1)`),
so the static store filter options ("Chandpur", "Bah", …) must equal that first word for the
`v.storeName === vrf.store` filter (line 3110) to match.

### Sorting
`allVisitsRaw.sort` by `dateRank[date]` ascending (line 3084), where `dateRank` (line 3083)
maps each date string to an "age in days" (Jun 22 = 0 = newest). So the table is **newest first**.
Port: store an actual `date`/`visitedAt` timestamp and sort descending.

### Filtering pipeline → `filteredVisits` (lines 3104–3111)
Read from `vrf = state.visitRepoFilter` (default `{ officer:'all', store:'all', type:'all', period:'month' }`, line 2598):
1. **Period:** `periodRankLimit = { today:1, week:8, month:32, all:999 }`; keep visits where
   `dateRank[date] < rankLimit`. (i.e. today = age 0; week = age <8; month = age <32; all = everything.)
2. If `vrf.officer !== 'all'` → keep `v.officer === vrf.officer`.
3. If `vrf.store !== 'all'` → keep `v.storeName === vrf.store`.
4. If `vrf.type !== 'all'` → keep `v.purpose === vrf.type`.

### Derived KPIs (lines 3114–3117), all computed over `filteredVisits`
- `vrTotal` = count of filtered visits.
- `vrFollowup` = count where `followup === 'Needed'`.
- `vrOfficers` = distinct `officer` count.
- `vrFarmers` = distinct `farmerId` count.

### `visitRepoRows` (line 3126)
`filteredVisits.map(v => ({ ...v, onClick: () => setState({ view:'visitDetail', selectedVisit:v }) }))`.

### `vrPeriodPills` (lines 3120–3124)
Four pills: `{label:'Today',key:'today'}`, `{This Week, week}`, `{This Month, month}`, `{All Time, all}`.
Each augmented with selected styling and an onClick:
- `bg` = `#1A3A1A` if `vrf.period===key` else `white`
- `color` = `white` if selected else `#616161`
- `border` = `#1A3A1A` if selected else `#E0E0E0`
- `onClick` = `() => setState(pr => ({ visitRepoFilter:{ ...pr.visitRepoFilter, period:key } }))`

---

## 4. INTERACTIONS

| Element | Event | Handler (source) | Effect |
|---------|-------|------------------|--------|
| Period pill ×4 | onClick | `pp.onClick` (line 3124) | sets `visitRepoFilter.period = key`; re-filters list + KPIs; updates pill styling |
| Officer `<select>` | onChange | `setVrfOfficer = setVrf('officer')` (3119/3533) | `setState(p => ({ visitRepoFilter:{ ...p.visitRepoFilter, officer: e.target.value } }))` |
| Store `<select>` | onChange | `setVrfStore = setVrf('store')` | sets `visitRepoFilter.store` |
| Type `<select>` | onChange | `setVrfType = setVrf('type')` | sets `visitRepoFilter.type` |
| Table row | onClick | `vr.onClick` (line 3128) | `setState({ view:'visitDetail', selectedVisit:v })` → navigates to **Visit Detail** screen, passing the full visit record |

`setVrf = key => e => setState(p => ({ visitRepoFilter:{ ...p.visitRepoFilter, [key]: e.target.value } }))`.
All filter/period changes mutate one `visitRepoFilter` object in state; everything downstream
(KPIs, count label, rows) recomputes from it. No modals, no API calls in the demo.

---

## 5. ROLE DIFFERENCES / EMPTY STATES / DYNAMIC STYLING

- **Role differences:** none in this slice's markup (`showVisitRepo = true` for everyone, no
  per-role `<sc-if>` inside). **However**, the dashboard "recent" pool (line 3087) restricts
  officers to their own visits — the **Visit Repository itself does NOT apply that restriction**;
  it always builds from the full `allVisitsRaw`. The officer persona name is `'Raj Kumar'`
  (line 2663), which is also a hard-coded officer filter option. In the port, decide whether an
  Officer role should be scoped to their own visits here; the original is intentionally global
  ("across all officers & stores" per the subtitle).
- **Empty state:** none authored. If filters yield 0 rows, the `<sc-for>` renders nothing (an
  empty table body under the header), and `vrTotal` shows `0` / "0 visits found". **Add a proper
  empty-state row in the port.**
- **Dynamic styling (must replicate):**
  - Period pill selected vs unselected (bg/color/border) — see §3.
  - Pill `hover:opacity-85`; row `hover:bg-[#FAFFFE]`.
  - Per-row data-driven colors: `avBg` (avatar), `typeColor` (type dot), `storeColor` (store
    swatch), `followupBg`/`followupColor` (follow-up pill). These come from data, not classes —
    keep as inline `style` or a typed color-lookup util.

---

## 6. PORT NOTES

**Component split (suggested):**
- `VisitRepositoryScreen` (server or client wrapper) — fetches visits + filter options.
- `VisitKpiStrip` — props: `{ total, followup, officers, farmers }`. Pure presentational; map
  the 4 cards from a config array `[{key,label,iconTileBg,iconFill,Icon}]`.
- `VisitFilterBar` — props: `{ filter, options, total, onChange }`; renders period pills + 3
  selects + count. Render selects from `options.officers/stores/types` (use exported
  `allOfficers`/`allStoreNames`/`allVisitTypes` arrays, lines 3132–3134) rather than static markup.
- `VisitTable` — props: `{ rows, onRowClick }`; header + mapped body rows. Extract
  `VisitRow` for the row markup.
- Shared color utils: `visitTypeColor(purpose)`, `followupStyle(needsFollowup)`, `storeColor`,
  `avatarColor(index)` — mirror the maps at lines 3051, 3060/3072–3074, store `.color`, 2779.

**Data hooks / layer:**
- Source of truth = a `Visit` table joined to `Farmer` (name, village, district, crop, segment,
  land, mobile, initials/avatarColor) and `Store` (name→firstWord, color). `officer` is a
  `User`/visit author field; `purpose` an enum (12 values listed in §2.2); `notes`, `date`.
- The **follow-up** flag is **derived** in the demo from `purpose ∈ {Follow-up, Crop inspection,
  Re-engagement}`. In the port either persist a real `followUpRequired` boolean on Visit or keep
  the same derivation rule — be explicit.
- Filtering can be a client-side `useMemo` over the loaded list (mirrors `filteredVisits`), or
  pushed to a server query (`where: { officer, storeName, purpose, visitedAt >= periodCutoff }`).
  KPIs (`vrTotal/Followup/Officers/Farmers`) recompute from the filtered set.
- Filter state: a single object `{ officer, store, type, period }` (URL search params are a good
  fit so the view is shareable). Defaults `{ all, all, all, month }`.

**Gotchas:**
1. `storeName` = first word of store name; filter values must match that first word.
2. `period` filter uses an **age-bucket** model (`dateRank` → days; limits 1/8/32/999), NOT
   calendar boundaries. Re-implement as `today/week(<8d)/month(<32d)/all` relative to "now".
   The demo's "now" is fixed at Jun 22, 2026; the live app should use real dates.
3. Row click passes the **entire visit object** as `selectedVisit`; Visit Detail (screen 15)
   reads `sv.*` from it (and re-resolves the farmer via `farmerId`). Ensure the row object (or
   the id used to fetch detail) carries enough to render detail, including derived color fields.
4. Static `<option>` lists in the markup can drift from real data — render from data arrays.
5. Add an explicit empty-state; the original silently renders nothing.
6. Officer-scoping is NOT applied here in the original even though it is on the dashboard —
   decide intentionally.

---

### SUMMARY
The Visit Repository is a global, filterable master table of all field visits, gated only by
`view === 'visitRepo'` (nav visible to every role). It flattens every `farmer.visitLog` entry
into `allVisitsRaw`, sorts newest-first via a `dateRank` age map, then derives `filteredVisits`
by a `visitRepoFilter` of `{period, officer, store, type}`. From the filtered set it computes 4
KPI cards (total / follow-up-needed / distinct officers / distinct farmers) and renders an
8-column table (Date, Farmer+avatar, Visit-type pill, Officer, Store swatch, Crop, Follow-up
pill, "View →"); clicking a row sets `selectedVisit` and navigates to Visit Detail. Data deps:
Visit ⟂ Farmer ⟂ Store, with derived follow-up flag and color lookups (`visitTypes`, store color,
avatar palette).
