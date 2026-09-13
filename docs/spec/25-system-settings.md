# Screen Spec: System Settings

> Source: `original-design.dc.html` template lines **2257–2327** (`<sc-if value="{{ isSettings }}">` block);
> script refs: `isSettings` (line 2689), role gating `showSettings` (line 2699), nav helper `nv()` (2706–2713),
> view title map `titles.settings` (line 2720), `go()` navigator (line 2652), persona/role `R` (2653, 2661–2671).

---

## 1. PURPOSE & WHEN IT SHOWS

A read-only **admin landing page** that surfaces master-data registries, system-wide configuration toggles, and bulk data-management actions for the agri-retail field platform (UA Field Intel / Kisan Sewa Kendra).

- **View value:** renders only when `state.view === 'settings'`.
  - `const isSettings = s.view === 'settings';` (line 2689) → returned as `isSettings` (line 3500) → drives `<sc-if value="{{ isSettings }}">`.
- **Role gating:** `const showSettings = R === 'sysadmin';` (line 2699). The **Settings** nav item (template lines 100–104, inside `<sc-if value="{{ showSettings }}">`) is visible **only to System Admin** (`role === 'sysadmin'`, persona "Vikash Mehta"). All other roles (`regional`, `officer`, `central`) never see the entry point.
  - Secondary entry point: the **System Settings** quick-link row on the admin dashboard hub (template line 308, `onClick="{{ goToSettings }}"`).
- **Navigation in:** `goToSettings: go('settings')` (line 3506), where `go = v => () => this.setState({ view: v, step: 0, selectedFarmer: null })` (line 2652). Clicking the nav/hub item sets `view:'settings'`, resets wizard `step` to 0, clears `selectedFarmer`.
- **Page header (rendered by the shared app shell, not this slice):** `titles.settings = ['System Settings', 'Configuration & master data']` (line 2720). Title = **"System Settings"**, subtitle = **"Configuration & master data"**.
- **Active-nav styling:** `nv('settings')` (line 2706) → when active, nav pill gets `bg: rgba(255,255,255,0.12)`, `color: #ffffff`, `font-weight: 600`; otherwise transparent / `rgba(255,255,255,0.6)` / `400`. Exposed as `navBgSet / navClSet / navWSet` (line 3508).

> NOTE: This screen contains **no `{{ }}` interpolations and no event handlers inside the slice itself.** Every label, count, and toggle state is **hard-coded static markup**. The only dynamic wiring is the outer `isSettings` conditional and the (separate) nav entry. In the port these should become real data-bound values + working handlers — see §6.

---

## 2. LAYOUT TREE (top → bottom) with Tailwind translation

Design tokens used: brand green `#2E7D32` (→ `bg-brand-700` / token), ink `#1A1C1A` (→ `text-ink`), muted `#9E9E9E` (→ `text-neutral-400`), arrow gray `#BDBDBD` (→ `text-neutral-400`), row surface `#FAFAFA` (→ `bg-neutral-50`), row hover `#F0F0F0` (→ `hover:bg-neutral-100`), toggle-off track `#BDBDBD` (→ `bg-neutral-400`), warning surface `#FFF3E0` (→ `bg-orange-50`), warning hover `#FFE0B2` (→ `bg-orange-100`), warning text `#E65100` (→ `text-orange-800`).

```
<sc-if isSettings>                                   line 2258
└─ div  animation:fadeUp 0.4s ease-out               line 2259
   → className: "animate-fade-up"   (keyframe fadeUp; translateY+opacity entrance)

   └─ div  GRID  2 columns 1fr/1fr, gap 18px          line 2260
      → className: "grid grid-cols-2 gap-[18px]"
      (responsive: collapse to grid-cols-1 on < md)

      ├─ COLUMN A — "Master Data" CARD                 line 2262–2286
      │  div  card
      │  → "bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]"
      │     (radius 14px≈rounded-[14px]; padding 24px=p-6)
      │
      │  ├─ div  card title "Master Data"              line 2263
      │  │  → "text-base font-bold text-ink mb-4"      (16px/700/#1A1C1A; margin-bottom 16px)
      │  │
      │  └─ div  rows wrapper                          line 2264
      │     → "flex flex-col gap-2.5"                  (gap 10px)
      │     │
      │     5× ROW (identical structure, lines 2265,2269,2273,2277,2281):
      │     div  row
      │     → "flex justify-between items-center px-4 py-3 bg-neutral-50 rounded-[10px] cursor-pointer hover:bg-neutral-100"
      │        (padding 12px 16px; style-hover background:#F0F0F0)
      │        ├─ div (left)
      │        │   ├─ div  primary  → "text-[13px] font-semibold text-ink"     (13px/600/#1A1C1A)
      │        │   └─ div  caption  → "text-[11px] text-neutral-400"           (11px/#9E9E9E)
      │        └─ div  arrow "→"  → "text-lg text-neutral-400"                 (18px/#BDBDBD)
      │
      │     Row 1: "Crop Master"        / "21 crops configured"
      │     Row 2: "Village Directory"  / "186 villages across 5 districts"
      │     Row 3: "Product Catalog"    / "11 categories, 148 products"
      │     Row 4: "Store Locations"    / "6 stores configured"
      │     Row 5: "Problem Categories" / "11 problem types, 16 danger zones"
      │
      └─ COLUMN B — vertical stack of 2 cards          line 2288
         div → "flex flex-col gap-[18px]"

         ├─ CARD "System Configuration"                line 2289–2309
         │  div card (same card classes as above)
         │  ├─ div title "System Configuration"  → "text-base font-bold text-ink mb-4"
         │  └─ div rows wrapper → "flex flex-col gap-3.5"   (gap 14px)
         │     4× TOGGLE ROW (lines 2292,2296,2300,2304):
         │     div → "flex justify-between items-center"
         │       ├─ div (left): primary "text-[13px] font-semibold text-ink"
         │       │              caption "text-[11px] text-neutral-400"
         │       └─ div TOGGLE PILL (see toggle markup below)
         │
         │     Row 1: "GPS Mandatory"   / "Require location for each visit"   → ON  (green)
         │     Row 2: "Photo Required"  / "At least 1 photo per visit"        → ON  (green)
         │     Row 3: "Offline Mode"    / "Allow data entry without internet" → ON  (green)
         │     Row 4: "WhatsApp Alerts" / "Send farmer notifications via WA"  → OFF (gray)
         │
         └─ CARD "Data Management"                     line 2310–2323
            div card (same card classes)
            ├─ div title "Data Management"  → "text-base font-bold text-ink mb-4"
            └─ div rows wrapper → "flex flex-col gap-2.5"   (gap 10px)
               3× ACTION ROW:
               div → "flex justify-between items-center px-4 py-3 rounded-[10px] cursor-pointer"
                 Row 1 (line 2313): bg-neutral-50 hover:bg-neutral-100
                    span "Export All Data (CSV)" (13px/600/#1A1C1A) + span "↓" (18px/#BDBDBD)
                 Row 2 (line 2316): bg-neutral-50 hover:bg-neutral-100
                    span "Import Farmer Data" (13px/600/#1A1C1A) + span "↑" (18px/#BDBDBD)
                 Row 3 (line 2319): DANGER — bg-orange-50 hover:bg-orange-100
                    span "Purge Old Data (>2 yr)" (13px/600/#E65100) + span "⚠" (18px/#E65100)
```

### Toggle pill markup (System Configuration)

ON toggle (green, knob right) — lines 2294/2298/2302:
```
track: width:48px; height:26px; border-radius:13px; background:#2E7D32; position:relative
  → "relative w-12 h-[26px] rounded-[13px] bg-brand-700"
knob:  width:22px; height:22px; border-radius:50%; background:white; box-shadow:0 1px 3px rgba(0,0,0,0.2); position:absolute; top:2px; left:24px
  → "absolute top-0.5 left-6 w-[22px] h-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
```
OFF toggle (gray, knob left) — line 2306:
```
track background:#BDBDBD  → "bg-neutral-400"
knob left:2px             → "left-0.5"
```
(48×26 track, 22×22 knob; on = `left:24px`, off = `left:2px`. In React drive the knob position + track color off a boolean.)

---

## 3. DATA — every displayed value & its target entity

This slice is **100% static** in the source. The numbers are illustrative; in the port they must be derived from real entities. Mapping each label to its intended data source:

### Master Data card (registry counts → should become live counts)
| Label | Static caption | Maps to entity / derived count |
|---|---|---|
| Crop Master | "21 crops configured" | `FieldOption` where `type='CROP'` → `count()`. (Crops also appear on Farmer.crop, NewVisit form.) |
| Village Directory | "186 villages across 5 districts" | `FieldOption type='VILLAGE'` count; "5 districts" = distinct `Store.district` / `Farmer.district`. |
| Product Catalog | "11 categories, 148 products" | Product catalog table — `count(distinct category)` + `count(product)`. (No product entity exists yet in demo data; new table.) |
| Store Locations | "6 stores configured" | `Store` → `count()`. Matches the 6 demo stores (`stores[]` array, lines ~2790+ — AGRO0012 etc.). |
| Problem Categories | "11 problem types, 16 danger zones" | `FieldOption type='PROBLEM'` count + danger-zone classification (`FieldOption type='DANGER_ZONE'` or derived). Visit-issue taxonomy used in Farmer.issues / Visit problem tagging. |

### System Configuration card (org-level settings → should become a Settings/Config entity)
| Toggle | Caption | State (static) | Target field |
|---|---|---|---|
| GPS Mandatory | Require location for each visit | ON | `SystemConfig.gpsMandatory: boolean` |
| Photo Required | At least 1 photo per visit | ON | `SystemConfig.photoRequired: boolean` |
| Offline Mode | Allow data entry without internet | ON | `SystemConfig.offlineMode: boolean` |
| WhatsApp Alerts | Send farmer notifications via WA | OFF | `SystemConfig.whatsappAlerts: boolean` |

> Suggested entity: a singleton `SystemConfig` (or key/value `Setting` rows). These flags affect the New Visit wizard (GPS/photo gating) and farmer notifications.

### Data Management card (bulk operations — no displayed data, action buttons only)
| Action | Operation |
|---|---|
| Export All Data (CSV) | Server export of all entities → CSV download. |
| Import Farmer Data | Upload/CSV import into `Farmer`. |
| Purge Old Data (>2 yr) | Destructive: delete `Visit`/`AuditLog` records older than 2 years. |

### Loops / conditionals
- **No `sc-for`** in this slice — all 5 master-data rows, 4 toggle rows, and 3 action rows are hand-written literals. In the port these should be `.map()` over config arrays.
- **One `sc-if`**: the outer `value="{{ isSettings }}"` (view gate). No inner conditionals; toggle on/off state is encoded purely by static color/position (not a flag binding).

---

## 4. INTERACTIONS

In the source markup, **none of the rows/toggles/buttons have `onClick` or `onChange`** — they carry only `style-hover` (visual hover) and `cursor:pointer`. So in the original demo this screen is non-functional (decorative). The only real interaction is reaching it:

- **Entry navigation** (defined elsewhere, not in slice):
  - Sidebar nav "Settings" (line 101) `onClick="{{ goToSettings }}"`.
  - Admin hub quick-link "System Settings" (line 308) `onClick="{{ goToSettings }}"`.
  - `goToSettings = go('settings')` → `setState({ view:'settings', step:0, selectedFarmer:null })`.
- **Hover styling (the only in-screen interaction):**
  - Master-data rows + Data-Management normal rows: `style-hover="background:#F0F0F0"` → `hover:bg-neutral-100`.
  - Purge (danger) row: `style-hover="background:#FFE0B2"` → `hover:bg-orange-100`.

### Intended interactions to implement in the port (currently missing)
- Master-data rows → navigate to / open a registry editor for each category (crops, villages, products, stores, problem categories).
- Config toggles → `onChange` flips boolean, persists to `SystemConfig` via mutation (optimistic local toggle + API).
- Export → triggers CSV download endpoint. Import → opens file-upload modal/route. Purge → opens a **confirm modal** (destructive) before deleting (>2 yr).

---

## 5. ROLE DIFFERENCES, EMPTY STATES, DYNAMIC STYLING

- **Role differences:** Entire screen is **System Admin only** (`showSettings = R === 'sysadmin'`). For `regional` / `officer` / `central` the nav item is hidden and the view is unreachable (no fallback render — `isSettings` would be false → blank). In the port, guard the route server-side (403 / redirect) for non-admins, not just hide the link.
- **Empty states:** None in the static source. With live counts: render `0` counts gracefully (e.g. "0 crops configured"). No list to be empty since there are no loops.
- **Dynamic styling / hover-active:**
  - All clickable rows use `style-hover` only (no `style-active`); translate to Tailwind `hover:` variants above.
  - Toggle state is purely presentational in source: ON = track `#2E7D32` + knob `left:24px`; OFF = track `#BDBDBD` + knob `left:2px`. Animate knob with `transition-all` and drive `left`/track color from boolean state.
  - Card chrome is uniform: `rounded-[14px]`, `p-6`, soft shadow `0 1px 3px rgba(0,0,0,0.04)`, hairline border `1px solid rgba(0,0,0,0.03)`.
  - Entrance: `animation:fadeUp 0.4s ease-out` on the outer wrapper (shared fadeUp keyframe used across screens).

---

## 6. PORT NOTES (React/Next + Tailwind + Prisma)

**Routing/gate**
- Route: `/settings` (App Router segment). Server-guard for `role === 'SYSADMIN'`; redirect or 403 otherwise. Reuse the role/persona context already powering the sidebar.
- Page header ("System Settings" / "Configuration & master data") comes from the shared `AppShell`/layout title map — pass via route metadata, mirroring `titles.settings`.

**Component split**
- `SettingsPage` (server component): fetches counts + config in one call, renders a 2-column grid (`grid grid-cols-2 gap-[18px]`, collapse to 1 col on mobile).
- `SettingsCard` (presentational): white card chrome + bold title; reused by all three cards.
- `MasterDataList` (client or server): maps an array of `{ label, caption, href }` → `RegistryRow` (left text block + `→`). Drives navigation to per-registry editors.
- `SystemConfigList` (client): maps `{ key, label, caption, value }` → `ToggleRow`; `ToggleRow` is a controlled switch (48×26 track, 22×22 knob) wired to a `useUpdateSettings()` mutation (optimistic).
- `DataManagementList` (client): three `ActionRow`s; the Purge row is the danger variant and must open a `ConfirmDialog` before calling the purge mutation.

**Data hooks / API**
- `getSettingsCounts()` server fn → returns `{ crops, villages, districts, products, productCategories, stores, problemTypes, dangerZones }` aggregated from `FieldOption`, `Store`, product tables.
- `getSystemConfig()` → singleton `SystemConfig` row (`gpsMandatory, photoRequired, offlineMode, whatsappAlerts`).
- Mutations: `updateSystemConfig(key, value)`, `exportAllDataCsv()`, `importFarmerData(file)`, `purgeOldData()`.

**Gotchas**
- Source is decorative: do NOT hard-code the "21 / 186 / 148 / 6 / 11 / 16" numbers — wire to real counts. (The "6 stores" does match the 6 demo `stores[]` entries, but treat as derived.)
- Toggle on/off is encoded only by color+position in source — there is no boolean binding to copy; introduce real `SystemConfig` state.
- Purge is destructive (>2 yr): require explicit confirm + ideally write an `AuditLog` entry for the action.
- The `→ / ↓ / ↑ / ⚠` glyphs are literal text (font-size 18px, `#BDBDBD`, except ⚠ `#E65100`); reproduce as inline characters or swap for lucide icons (`ChevronRight`, `Download`, `Upload`, `AlertTriangle`) sized to ~18px.
- Keep card radius at 14px (use `rounded-[14px]` if your token scale lacks it) to stay pixel-faithful.

---

## SUMMARY
System Settings (`view==='settings'`) is a **System-Admin-only** admin hub (gated by `showSettings = R==='sysadmin'`) rendered inside `<sc-if isSettings>` at template lines 2257–2327, with header "System Settings / Configuration & master data". Layout is a 2-column grid: left card **Master Data** (5 registry rows: Crop/Village/Product/Store/Problem counts), right column stacking **System Configuration** (4 toggles: GPS Mandatory, Photo Required, Offline Mode ON; WhatsApp Alerts OFF) and **Data Management** (Export CSV, Import Farmers, Purge >2yr danger). The slice is **entirely static** — no `{{ }}` bindings, no `sc-for`, no `onClick`/`onChange` inside it (only `style-hover`); the only live wiring is the outer view gate and the external nav `goToSettings = go('settings')`. Port must replace the hard-coded counts with derived aggregates over `FieldOption`/`Store`/product tables, back the toggles with a `SystemConfig` entity, and implement export/import/purge mutations (purge behind a confirm dialog).
