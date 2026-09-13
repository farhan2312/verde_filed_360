# Screen 15 — Visit Detail

Port spec for the **Visit Detail** screen of *UA Field Intel*. Source: `original-design.dc.html`
template lines **818–917**; script bindings in `renderVals()` (≈3052–3156, 3528–3545) and `state`
(2585–2648). Target: Next.js 14 App Router + TypeScript + Tailwind.

---

## 1. PURPOSE & WHEN IT SHOWS

- **What it is:** The read-only detail page for a single field visit. Shows a structured summary of
  the visit (ID, type, officer, date, location, crop/land, store, segment), a farmer mini-card, the
  free-text field notes, an auto-generated Recommendations & Actions list (derived from visit
  purpose), and a GPS/meta footer.
- **View gate:** Rendered inside `<sc-if value="{{ isVisitDetail }}">` where
  `isVisitDetail = s.view === 'visitDetail'` (line 2688). The screen is reached by clicking a row in
  the Visit Repository (`visitRepoRows[].onClick` → `setState({ view:'visitDetail', selectedVisit:v })`,
  line 3128) or a Recent-visit card on the dashboard (line 3100). Both set `state.selectedVisit` to the
  full visit object.
- **Data source object:** Everything keys off `s.selectedVisit` (aliased `const sv = s.selectedVisit || {}`,
  line 3155). If `selectedVisit` is null the screen renders with all-empty/fallback values (it is never
  reachable without a selection in normal flow).
- **Role-gating:** None on the screen itself. There is no role check in the `sc-if`. Reachability is
  inherited from the Visit Repository / Dashboard, which themselves are visible to all roles. For an
  **officer** role, the upstream visit pool is filtered to their own visits (`recentPool`, line 3087–3089),
  but the Visit Repository (`filteredVisits`) is NOT officer-filtered — so an officer can open any
  visit from the repo. Treat this screen as role-agnostic.

---

## 2. LAYOUT TREE (top → bottom) with Tailwind translation

Root wrapper has `animation:fadeUp 0.4s ease-out` — port as a fade-up entrance
(`motion-safe:animate-[fadeUp_0.4s_ease-out]` or a Framer Motion fade/translateY).

```
<div>  (fadeUp wrapper)
├─ Back nav row  (clickable)
└─ 2-column grid  [grid-template-columns:1fr 1.4fr; gap:18px]
   ├─ LEFT column  [flex-col; gap:14px]
   │  ├─ Visit header card
   │  └─ Farmer mini card
   └─ RIGHT column [flex-col; gap:14px]
      ├─ Field Notes card
      ├─ Recommendations & Actions card  (sc-for)
      └─ GPS + Meta footer card
```

### 2.1 Back nav (line 822)
- `inline-flex items-center gap-[6px] text-[13px] text-[#757575] cursor-pointer mb-5`
- Hover (`style-hover="color:#2E7D32;"`): `hover:text-[#2E7D32]` (also recolors the inline SVG via
  `stroke="currentColor"`).
- Contains a 14×14 left-chevron SVG (`stroke-width 2`, `currentColor`) + label "Back to Visit Repository".
- `onClick="{{ goBackFromVisitDetail }}"` → see §4.

### 2.2 Two-column grid (line 826)
- `grid grid-cols-[1fr_1.4fr] gap-[18px]`. On mobile collapse to single column (`grid-cols-1`).

### 2.3 LEFT — Visit header card (lines 830–862)
Card shell (reused 3× on this screen): `bg-white rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]
border border-black/[0.03]`. This card pad = `p-[22px]`.

- **Header row** (`flex items-center justify-between mb-4`):
  - Left block:
    - Eyebrow: `text-[10.5px] font-bold text-[#9E9E9E] uppercase tracking-[0.7px] mb-1` →
      `Visit ID · {{ svDate }}`.
    - Title: `text-[18px] font-bold text-[#1A1C1A]` → `{{ svVid }}`.
  - Right pill (follow-up): `px-[14px] py-1 rounded-[20px] text-[11px] font-bold`, dynamic
    `background:{{ svFollowupBg }}; color:{{ svFollowupColor }}` → text `Follow-up: {{ svFollowup }}`.
- **Visit-type badge** (`inline-flex items-center gap-2 px-4 py-2 rounded-[10px] bg-[#F5F7F5] mb-4`):
  - 10×10 dot `rounded-full` with dynamic `background:{{ svTypeColor }}`.
  - Label `text-[13px] font-semibold text-[#1A1C1A]` → `{{ svPurpose }}`.
- **Field rows table** — a bordered, rounded, clipped container of 4 two-column rows:
  Container: `flex flex-col border border-[#F0F0F0] rounded-[10px] overflow-hidden`.
  Each row: `grid grid-cols-2 px-[14px] py-[9px]`. Rows 1 & 3 are zebra
  `bg-[#FAFAFA]`; rows 1–3 have `border-b border-[#F5F5F5]`, row 4 has no border.
  Each cell: label `text-[10px] text-[#9E9E9E] font-semibold uppercase`, value
  `text-[13px] font-semibold text-[#1A1C1A] mt-[3px]`.
  - Row 1: **Officer** = `{{ svOfficer }}` · **Date** = `{{ svDate }}, 2026` (note hard-coded `, 2026` suffix).
  - Row 2: **Village** = `{{ svVillage }}` · **District** = `{{ svDistrict }}`.
  - Row 3: **Crop** = `{{ svCrop }}` · **Land** = `{{ svLand }} acres` (hard-coded ` acres` suffix).
  - Row 4: **Store** = colored square (8×8 `rounded-[2px]`, `background:{{ svStoreColor }}`) + `{{ svStore }}`
    (flex gap-[5px]) · **Segment** = inline pill `px-[9px] py-[2px] rounded-[20px] text-[10px] font-semibold`,
    dynamic `background:{{ svSegBg }}; color:{{ svSegColor }}` → `{{ svSegment }}`.

### 2.4 LEFT — Farmer mini card (lines 864–877)
Card shell, pad `p-[18px]`.
- Eyebrow: `text-[11px] font-bold text-[#9E9E9E] uppercase tracking-[0.6px] mb-3` → "Farmer".
- Identity row (`flex items-center gap-3 mb-[14px]`):
  - Avatar: `w-11 h-11 rounded-full flex items-center justify-center font-bold text-[15px] text-white shrink-0`,
    dynamic `background:{{ svAvBg }}` → initials `{{ svInit }}`.
  - Name `text-[15px] font-bold text-[#1A1C1A]` → `{{ svFarmerName }}`; below it
    `text-[11.5px] text-[#9E9E9E] mt-[2px]` → `{{ svMobile }}`.
- CTA button (`onClick="{{ goToSvFarmerProfile }}"`):
  `p-[10px] rounded-[10px] bg-[#F5F7F5] text-[#2E7D32] text-[12.5px] font-semibold cursor-pointer
  text-center flex items-center justify-center gap-[6px]`; hover (`style-hover="background:#E8F5E9;"`)
  → `hover:bg-[#E8F5E9]`. Contains a 13×13 user-outline SVG (`stroke="#2E7D32"`) + "View Full Farmer Profile".

### 2.5 RIGHT — Field Notes card (lines 882–888)
Card shell, pad `p-[22px]`.
- Heading row (`flex items-center gap-2 mb-[14px] text-[15px] font-bold text-[#1A1C1A]`): 16×16 doc SVG
  (`stroke="#2E7D32"`) + "Field Notes".
- Notes body: `text-[13.5px] text-[#424242] leading-[1.75] p-4 bg-[#FAFFF9] rounded-[10px]
  border-[1.5px] border-[#E8F5E9]` → `{{ svNotes }}`.

### 2.6 RIGHT — Recommendations & Actions card (lines 890–903)
Card shell, pad `p-[22px]`.
- Heading row (same style as 2.5): 16×16 info-circle SVG (`stroke="#1565C0"`) + "Recommendations & Actions".
- List container `flex flex-col gap-[10px]`.
- **`<sc-for list="{{ svRecs }}" as="rec" hint-placeholder-count="3">`** — iterate `svRecs` (array of
  `{ c, t }`). Each item:
  - `flex items-start gap-[10px] px-[14px] py-3 bg-[#F5F7F5] rounded-[10px]`.
  - Bullet dot: `w-2 h-2 rounded-full shrink-0 mt-[5px]`, dynamic `background:{{ rec.c }}`.
  - Text: `text-[12.5px] text-[#424242] leading-[1.65]` → `{{ rec.t }}`.

### 2.7 RIGHT — GPS + Meta footer card (lines 905–913)
Card shell, pad `py-[18px] px-[22px]`, plus `flex items-center justify-between`.
- Left cluster (`flex items-center gap-[10px]`):
  - Icon tile `w-[34px] h-[34px] rounded-[8px] bg-[#E8F5E9] flex items-center justify-center shrink-0`
    with a 14×14 map-pin SVG (`stroke="#2E7D32"`).
  - Text block: label `text-[10px] font-bold text-[#9E9E9E] uppercase` "GPS Location"; value
    `text-[12.5px] font-semibold text-[#2E7D32] mt-[2px]` → **hard-coded** `27.1767° N, 78.0081° E · Verified`.
- Right cluster (`text-right`): label "Logged by" (same style as GPS label); value
  `text-[12.5px] font-semibold text-[#1A1C1A] mt-[2px]` → `{{ svOfficer }}`.

### Token mapping (inline color → suggested Tailwind theme token)
| Inline hex | Meaning | Token |
|---|---|---|
| `#2E7D32` | brand green (primary) | `brand-green` / `primary` |
| `#1A3A1A` | dark green (nav) | `brand-green-dark` |
| `#1A1C1A` | near-black text | `ink` |
| `#424242` | body text | `ink-700` |
| `#757575` / `#9E9E9E` | muted / placeholder | `muted` / `muted-2` |
| `#F5F7F5` / `#FAFAFA` / `#FAFFF9` | surface tints | `surface-1/2/note` |
| `#E8F5E9` / `#FFF3E0` | success/warn pill bg | `success-50` / `warn-50` |
| `#1565C0` | info blue | `info` |
| card border `rgba(0,0,0,0.03)`, shadow `0 1px 3px rgba(0,0,0,0.04)` | card chrome | `card` utility |

---

## 3. DATA — every value mapped to its entity/field

`sv = state.selectedVisit`. Each visit object is **synthesized** in `allVisitsRaw` (lines 3052–3081) by
flattening every `farmer.visitLog[]` entry and joining farmer + store data. So a "Visit" is a derived
row, not yet a first-class table.

| Binding | renderVals source (default) | Underlying entity.field |
|---|---|---|
| `isVisitDetail` | `s.view === 'visitDetail'` | UI state |
| `svVid` | `sv.vid \|\| ''` | derived `'VIS-' + visId` (running counter from 2402; **not** a stable id — see gotcha) |
| `svDate` | `sv.date \|\| ''` | `Visit.date` ← `farmer.visitLog[].date` (e.g. "Jun 18") |
| `svPurpose` | `sv.purpose \|\| ''` | `Visit.purpose` ← `farmer.visitLog[].purpose` |
| `svNotes` | `sv.notes \|\| ''` | `Visit.notes` ← `farmer.visitLog[].notes` |
| `svOfficer` | `sv.officer \|\| ''` | `Visit.officer` ← `v.by` — **`by` does not exist in visitLog data**, so always `undefined` → renders empty. (Used twice: Officer cell + "Logged by".) |
| `svFarmerName` | `sv.farmerName \|\| ''` | `Farmer.name` |
| `svMobile` | `sv.farmerMobile \|\| ''` | `Farmer.mobile` |
| `svVillage` | `sv.village \|\| ''` | `Farmer.village` |
| `svDistrict` | `sv.district \|\| ''` | `Farmer.district` |
| `svCrop` | `sv.crop \|\| ''` | `Farmer.crop` |
| `svLand` | `sv.land \|\| ''` | `Farmer.land` (number; ` acres` appended in template) |
| `svSegment` | `sv.segment \|\| ''` | `Farmer.segment` (High Value / Medium Value / New/Low / Dormant) |
| `svStore` | `sv.storeName \|\| ''` | `Store.name` first word (`fStore.name.split(' ')[0]`) via `farmerStoreMap[f.id]`; `'—'` if no store |
| `svInit` | `sv.init \|\| ''` | derived from `Farmer.name` initials |
| `svTypeColor` | `sv.typeColor \|\| '#757575'` | derived from `visitTypes[purpose]` lookup map (line 3051) |
| `svStoreColor` | `sv.storeColor \|\| '#9E9E9E'` | `Store.color` |
| `svFollowup` | `sv.followup \|\| 'None'` | derived: `'Needed'` if purpose ∈ {Follow-up, Crop inspection, Re-engagement} else `'None'` |
| `svFollowupBg` | `sv.followupBg \|\| '#E8F5E9'` | derived (`#FFF3E0` if Needed else `#E8F5E9`) |
| `svFollowupColor` | `sv.followupColor \|\| '#2E7D32'` | derived (`#E65100` if Needed else `#2E7D32`) |
| `svSegBg` | `sv.segBg \|\| '#F5F5F5'` | `segBgs[segment]` map (line 2726) |
| `svSegColor` | `sv.segColor \|\| '#757575'` | `segColors[segment]` map (line 2725) |
| `svAvBg` | `sv.avBg \|\| '#2E7D32'` | `avColors[indexOf(farmer)]` palette |
| `svRecs` | `visitRecMap[sv.purpose]` or generic 3-item fallback (line 3151) | derived recommendation list (see below) |
| GPS string | hard-coded literal | none (static `27.1767° N, 78.0081° E · Verified`) |

**`svRecs` (Recommendations & Actions)** — `visitRecMap` (lines 3137–3150) maps each visit purpose to a
fixed array of 3 `{ c (dot color hex), t (text) }`. Keys present: Crop inspection, Crop monitoring,
Product demo, Product delivery, Follow-up, First visit, Sowing advisory, Harvest planning,
Re-engagement, Season review, Soil advisory, Pest check. If the purpose is not in the map (e.g.
"Crop advisory", "Field audit", "Seed delivery", "Planting advisory", "Season review" variants that
appear in some farmers' logs but not in the map), it falls back to a generic 3-item list (schedule
follow-up / update profile / coordinate inputs). The `sc-for` always renders ≥3 rows.

**`svFarmer`** (line 3156) = `farmersWithEdits.find(f => f.id === sv.farmerId)` — the live farmer record
(with any in-session `farmerEdits` merged). Used only by the "View Full Farmer Profile" handler, not
rendered directly.

### sc-if / sc-for summary
- `sc-if isVisitDetail` — the whole screen.
- `sc-for svRecs as rec` — the recommendation list (the only loop; `hint-placeholder-count="3"`).

---

## 4. INTERACTIONS

| Element | Event | Handler (renderVals) | Behavior |
|---|---|---|---|
| Back nav row (822) | onClick | `goBackFromVisitDetail` = `()=>this.setState({ view:'visitRepo' })` (3530) | Navigate to Visit Repository. (Note: does **not** clear `selectedVisit`; only the `goToVisitRepo` nav handler clears it.) |
| "View Full Farmer Profile" button (873) | onClick | `goToSvFarmerProfile` = `()=> svFarmer.id ? this.setState({ view:'farmerDetail', selectedFarmer:svFarmer }) : null` (3544) | If a matching farmer exists, navigate to Farmer Detail (screen) with that farmer selected. If `svFarmer.id` is falsy (no farmerId match), the click is a no-op. |

No `onChange`, no modals, no filters, no form mutation — this is a read-only detail view with two
navigation actions.

---

## 5. ROLE DIFFERENCES, EMPTY STATES, DYNAMIC STYLING

- **Role differences:** none on the screen. Same render for all four roles. (Upstream reachability
  differs slightly for officer via `recentPool`, but the repo path is open to all.)
- **Empty / fallback states:**
  - `svOfficer` is effectively always empty (the demo `visitLog` rows have no `by`), so the **Officer**
    cell and **Logged by** value render blank. In the port, either source `officer` from the visit's
    assigned user, or hide/placeholder the label when empty.
  - `svStore` shows `'—'` when the farmer has no mapped store.
  - All `sv*` bindings have `|| fallback`, so a null `selectedVisit` degrades gracefully (empty strings +
    default colors/badges), though that state is not normally reachable.
  - `svRecs` never empty — falls back to a generic 3-item list.
- **Dynamic styling:**
  - Follow-up pill bg/color, visit-type dot color, store square color, segment pill bg/color, avatar bg,
    and each recommendation dot color are all data-driven inline styles → render as inline `style={{ }}`
    in React (do not try to express arbitrary hex via Tailwind class names; use `style` for these).
  - Two hover overrides: back-nav `hover:text-[#2E7D32]`; farmer-CTA `hover:bg-[#E8F5E9]`.
  - Entrance animation `fadeUp` on the root.

---

## 6. PORT NOTES (React/Next + Tailwind)

**Component split (suggested):**
- `VisitDetailPage` (route or view component) — receives the `visit` object; owns `onBack` and
  `onViewFarmer` callbacks (or uses the app router/nav store).
- `VisitHeaderCard` — props: `{ vid, date, purpose, officer, village, district, crop, land, segment,
  storeName, typeColor, storeColor, followup, followupBg, followupColor, segBg, segColor }`.
- `FarmerMiniCard` — props: `{ name, mobile, init, avatarBg, onViewProfile }`.
- `FieldNotesCard` — props: `{ notes }`.
- `RecommendationsCard` — props: `{ recs: { color, text }[] }`.
- `GpsMetaCard` — props: `{ lat, lng, verified, loggedBy }` (currently lat/lng/verified are static).
- A shared `Card` primitive for the repeated white/rounded/shadow shell (used 5×).

**Data hooks / layer:**
- Needs the selected visit. In the demo it's a synthesized row carrying denormalized farmer + store
  fields. For the real app, model a **Visit** entity (Prisma) with relations:
  - `Visit { id, visitedOn(date), purpose, notes, gpsLat, gpsLng, gpsVerified, officerId(User),
    farmerId(Farmer), storeId(Store) }`.
  - Page query: fetch Visit by id, `include: { farmer, store, officer }`. Compute the presentational
    derivations (typeColor via a purpose→color map, followup flag, segment colors, initials, avatar
    color) in a selector/util, NOT in the DB — keep these maps (`visitTypes`, `segBgs`, `segColors`,
    `visitRecMap`) as shared client constants ported verbatim.
- `svRecs` should be a pure function `recommendationsFor(purpose)` returning `{color,text}[]` with the
  same map + generic fallback.

**Gotchas:**
1. **`svVid` is unstable** — `vid` is `'VIS-' + (++visId)`, computed off a counter, and is set to the
   value *after* increment so it's offset by one from `id`. It is not a real key; the real app must use a
   stable visit id. Don't rely on `vid` for routing.
2. **Officer is always blank** in the demo (`v.by` missing). Wire the real `officer.name` and decide on
   an empty-state placeholder.
3. **Hard-coded literals in the template:** `, 2026` appended to date, ` acres` appended to land, and the
   entire GPS coordinate string. Make these data-driven in the port (visit year, units, real lat/lng).
4. **`goBackFromVisitDetail` does not clear `selectedVisit`** — if you keep a single selection slot,
   clear it on back-nav or it lingers. (The repo's own nav handler clears it; back-nav doesn't.)
5. **Store name is truncated to first word** (`name.split(' ')[0]`). Decide whether to keep this
   truncation or show the full store name in the port.
6. Colors for badges/dots are arbitrary hex from JS maps → render via inline `style`, not Tailwind
   class strings (Tailwind can't generate dynamic arbitrary values at runtime).
```

---

## SUMMARY

Read-only **Visit Detail** screen (`view === 'visitDetail'`, gated by `isVisitDetail`), reached by clicking a Visit Repository row or a Dashboard recent-visit card, which set `state.selectedVisit`. Layout is a `1fr / 1.4fr` two-column grid: left = visit-header card (ID/type/officer/date/village/district/crop/land/store/segment) + farmer mini-card; right = Field Notes + auto-generated Recommendations & Actions list + GPS/meta footer. All data comes from `sv = state.selectedVisit`, a denormalized row synthesized in `allVisitsRaw` from `farmer.visitLog[]` joined with Farmer + Store (segment/type/follow-up colors derived via lookup maps; `svRecs` derived from `visitRecMap[purpose]` with a generic 3-item fallback). Two interactions only: back-nav (`goBackFromVisitDetail` → `visitRepo`) and "View Full Farmer Profile" (`goToSvFarmerProfile` → `farmerDetail`). Role-agnostic. Key gotchas: officer is always blank (`v.by` absent from demo data), `vid` is an unstable counter, and date/land-unit/GPS strings are hard-coded literals. Spec written to `C:/Users/Cosmos/Documents/ua_agro_field_360/webapp/docs/spec/15-visit-detail.md`.

