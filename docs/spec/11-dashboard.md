# Screen 11 — Dashboard (Home / `view === 'dashboard'`)

> Source: `original-design.dc.html` template lines 170–429; script: `renderVals()` lines 2650–3808 (state 2585–2648).
> This is the default landing screen (`state.view` initializes to `'dashboard'`). The whole block is gated by `<sc-if value="{{ isDashboard }}">` where `isDashboard = s.view === 'dashboard'` (line 2675).

---

## 1. PURPOSE & WHEN IT SHOWS

The Dashboard is the role-aware home screen. It renders when `view === 'dashboard'` (the initial view; also returned to by `go('dashboard')` and on role switch — `roleOptions[].onClick` resets `view:'dashboard'`).

It is composed of **four independently-gated sections** layered top-to-bottom inside one wrapper `<div style="animation:fadeUp 0.4s ease-out;">`:

| Section | Gate flag | Source | Shows for role |
|---|---|---|---|
| Agri-Officer personal banner + 2 cards | `isOfficer` = `R === 'officer'` (3510) | role | **officer** only |
| Central Admin banner + cards | `isCentral` = `R === 'central'` (3510) | role | **central** only |
| Sysadmin system cards + quick actions | `isSysadmin` = `R === 'sysadmin'` (3510) | role | **sysadmin** only |
| Shared analytics block (KPIs, charts, insights) | `showAnalytics` (line 2695) | **`const showAnalytics = true;`** | **ALL roles** |

> CRITICAL: `showAnalytics` is hardcoded `true`, so the shared analytics block (lines 326–426) renders for **every** role — including officer, central, and sysadmin — appearing *below* their role-specific banner. `regional` role gets ONLY the shared analytics block (none of the three role banners match). `R = s.role` (line 2653), one of `regional | officer | central | sysadmin` (state default `'regional'`, line 2589).

In the port, `view` maps to the route (this is `/` or `/dashboard`). Role comes from the authenticated `User.role`.

---

## 2. LAYOUT TREE (top→bottom, with Tailwind translation)

Design tokens (recurring inline values → suggested Tailwind / CSS-var tokens):

| Inline value | Token / Tailwind |
|---|---|
| white card bg | `bg-white` |
| `border-radius:14px` | `rounded-[14px]` |
| `box-shadow:0 1px 3px rgba(0,0,0,0.04)` | `shadow-[0_1px_3px_rgba(0,0,0,0.04)]` |
| `border:1px solid rgba(0,0,0,0.03)` | `border border-black/[0.03]` |
| `padding:22px` | `p-[22px]` |
| `gap:18px` | `gap-[18px]` |
| text `#1A1C1A` | `text-[#1A1C1A]` (ink) |
| muted `#9E9E9E` / `#BDBDBD` / `#757575` / `#616161` | grays |
| green `#2E7D32` (primary) | `text-/bg-[#2E7D32]` |
| amber `#F57F17`, orange `#E65100`, blue `#1565C0`, purple `#7B1FA2`, red `#C62828` | status accents |

Wrapper: `<div className="animate-[fadeUp_0.4s_ease-out]">` (define `fadeUp` keyframe: translateY+opacity).

### 2A. OFFICER banner (`isOfficer`) — lines 175–225

- **Hero banner** (176): `flex items-center gap-6 rounded-[14px] px-7 py-[22px] mb-5 text-white` with `bg-[linear-gradient(135deg,#0D47A1,#1565C0,#1E88E5)]`.
  - Avatar circle (177): `w-14 h-14 rounded-full bg-white/15 flex items-center justify-center font-bold text-xl flex-none` → text `RK` (hardcoded).
  - Center block `flex-1`: title `text-lg font-bold` = **"Welcome back, Raj Kumar"** (hardcoded); subtitle `text-xs opacity-70 mt-0.5` = **"Barabanki · Amethi · Raebareli · Lakhimpur Kheri"** (hardcoded).
  - Stats row `flex gap-6 flex-none`: 4 stacked stats, each `text-center` with `text-2xl font-bold` value + `text-[10px] opacity-70` label: **94 My Visits**, **67% My Conv.**, **8 Pending**, **96% Score** (all hardcoded).
- **2-up grid** (189): `grid grid-cols-2 gap-[18px] mb-5`.
  - Card "Today's Schedule" (190): white card; title `text-[15px] font-bold mb-3.5`; list `flex flex-col gap-2.5`. 4 schedule rows (193–212), each `flex items-center gap-3 px-3.5 py-2.5 rounded-[10px]`. Row 1 highlighted `bg-[#E8F5E9]` with green dot `#2E7D32`; rows 2–4 `bg-[#F5F7F5]` with amber/grey dots. Each row: status dot (`w-2 h-2 rounded-full`), `flex-1` with name (`text-[13px] font-semibold`) + sub (`text-[11px] text-[#757575]`), and right time label (`text-[11px] font-semibold`, colored to match dot). Content hardcoded (Ramesh Kumar 9:00 AM, Anil Verma 11:30 AM, Bharat Mishra 2:00 PM, Rakesh Gupta 4:00 PM).
  - Card "My Targets vs Actual" (215): white card; 4 progress rows `flex flex-col gap-3.5`. Each row: label/value line (`flex justify-between text-xs mb-1.5`) + track (`h-2.5 bg-[#F0F0F0] rounded-[5px] overflow-hidden`) + fill (`h-full rounded-[5px]`, width & color hardcoded). Rows: Visits 94/100 (94% green), Conversions 63/60 (100% green), New Registrations 14/20 (70% amber), Data Completeness 92% (92% green). All hardcoded.

### 2B. CENTRAL banner (`isCentral`) — lines 228–273

- **5-col stat banner** (229): `grid grid-cols-5 gap-5 rounded-[14px] px-7 py-[22px] mb-5 text-white bg-[linear-gradient(135deg,#4A148C,#7B1FA2,#9C27B0)]`. Each cell: uppercase label (`text-[10px] opacity-70 uppercase tracking-[0.8px] mb-1.5`), value (`text-[26px] font-bold`), delta (`text-[11px] opacity-70 mt-0.5`). Cells: **Total Visits (All) 3,412 / ↑14.2%**, **Active Regions 6 / All operational**, **Active ASRs 24 / 5 inactive**, **Org Conversion 38.7% / ↑2.1pp**, **Total Revenue ₹48.2L / ↑22% YoY**. Hardcoded.
- **2-up grid** (236): `grid grid-cols-2 gap-[18px] mb-5`.
  - "Region-wise Performance" (237): 6 horizontal bar rows (240–245). Each: `flex items-center gap-3` → fixed-width label (`w-[65px] text-xs font-semibold`) + track (`flex-1 h-5 bg-[#F0F0F0] rounded-md overflow-hidden`) + fill (`h-full rounded-md` colored, with inset `text-[10px] font-semibold text-white` label like "847 visits · 45%"). Rows: Agra 88% green, Amethi 76%, Raebareli 62%, Lakhimpur Kheri 48%, Mathura 38%, Hathras 28% (last uses dark text `#424242`). Hardcoded.
  - "Top ASR Performers (Org-wide)" (248): 5 ranked rows (251–255). Each: `flex items-center gap-3 px-3 py-2 rounded-[10px]`; rank #1 `bg-[#E8F5E9]` with gold `#F9A825` rank number, rest `bg-[#F5F7F5]` grey rank. Row: rank (`w-[22px] text-sm font-bold`), `flex-1` name (`text-[13px] font-semibold`) + sub (`text-[10px] text-[#757575]`), score (`text-sm font-bold`, color tiered). Raj Kumar/Agra/96%, Amit Yadav/Firozabad/88%, Vikram Singh/Mainpuri/84%, Deepak Verma/Etah/78%, Sunil Gupta/Mathura/74%. Hardcoded.
- **3-up alert cards** (259): `grid grid-cols-3 gap-3.5 mb-5`. Each white card `p-[18px]` with left accent border (`border-l-[3px]`): **Alert** (red `#C62828`), **Achievement** (green `#2E7D32`), **Opportunity** (amber `#F57F17`). Label `text-[11px] font-bold uppercase tracking-[0.5px] mb-1.5` + body `text-xs text-[#616161] leading-[1.55]`. Hardcoded copy.

### 2C. SYSADMIN block (`isSysadmin`) — lines 276–323

- **4-col KPI grid** (277): `grid grid-cols-4 gap-[18px] mb-5`. Each white card: label (`text-[11px] font-semibold text-[#9E9E9E] uppercase tracking-[0.8px]`), value (`text-[30px] font-bold mt-2`), sub (`text-[11px] mt-1`, colored). Cards: **Active Users 5 / 6** (sub green "1 inactive user"), **Database Size 2.4 GB** (amber "68% of 3.5 GB limit"), **API Calls (Today) 1,842** (green "Normal range"), **System Uptime 99.8%** (green value, grey sub "Last 30 days"). Hardcoded.
- **"Edit KPI Values" pill** (299): clickable; `inline-flex items-center gap-2 px-[18px] py-2 rounded-[10px] bg-[#FFF3E0] border-[1.5px] border-[#FFE0B2] text-[#E65100] text-xs font-semibold cursor-pointer mb-[18px]`; hover → `bg-[#FFE0B2]` (`style-hover`). Leading pencil SVG. `onClick="{{ openKpiEdit }}"`.
- **2-up grid** (303): `grid grid-cols-2 gap-[18px]`.
  - "Quick Actions" (304): 4 rows (`flex flex-col gap-2.5`). Each `px-4 py-3 bg-[#FAFAFA] rounded-[10px] cursor-pointer flex justify-between items-center`, hover → `bg-[#F0F0F0]`. Label `text-[13px] font-semibold` + right arrow `text-lg text-[#BDBDBD]`. Rows: **Manage Users** (`onClick="{{ goToUsers }}"`, →), **System Settings** (`onClick="{{ goToSettings }}"`, →), **View Audit Log** (`onClick="{{ goToAudit }}"`, →), **Export Full Backup** (no handler — static, ↓).
  - "Recent System Events" (313): 4 timeline rows; first 3 have `border-b border-[#F5F5F5]`. Each `flex gap-2.5 py-2`: colored dot (`w-1.5 h-1.5 rounded-full mt-1.5 flex-none`) + text (`text-xs text-[#424242]`) + meta (`text-[10px] text-[#BDBDBD]`). Events hardcoded (DB backup green; GPS setting amber; user removed red; crop master blue).

### 2D. SHARED ANALYTICS block (`showAnalytics`, always true) — lines 326–426

- **KPI cards grid** (327): `grid grid-cols-4 gap-[18px] mb-6`. `<sc-for list="{{ kpis }}" as="k">` (4 items). Each card `p-[22px_22px_18px]`: title `text-[11px] font-semibold text-[#9E9E9E] uppercase tracking-[0.8px]` = `{{ k.title }}`; value+badge row `flex items-end gap-2.5 mt-2.5` → value `text-[30px] font-bold text-[#1A1C1A] leading-none` = `{{ k.value }}` and badge `text-[11px] font-semibold` with **dynamic** `color:{{ k.accent }}` + `background:{{ k.bg }}` `px-2 py-0.5 rounded-[20px] mb-1` = `{{ k.change }}`; sub `text-[10.5px] text-[#BDBDBD] mt-2` = `{{ k.sub }}`.
- **Charts Row 1** (341): `grid grid-cols-[1.6fr_1fr] gap-[18px] mb-[18px]`.
  - "Visit Activity" card (343): header `flex justify-between items-center mb-5` → title "Visit Activity" + "Last 7 days". Bars container `flex items-end gap-2.5 h-40`. `<sc-for list="{{ activityBars }}" as="b">` (7 items). Each column `flex-1 flex flex-col items-center justify-end h-full`: count `text-[11px] font-semibold text-[#424242] mb-1.5` = `{{ b.count }}`; bar **dynamic** `h-[{{ b.h }}px] w-full bg-[{{ b.color }}] rounded-t-lg rounded-b-[2px]`; label `text-[10.5px] text-[#BDBDBD] font-medium mt-2` = `{{ b.label }}`.
  - "Lead Funnel" card (359): title; `<sc-for list="{{ funnel }}" as="f">` (5 items). Each `mb-3.5`: label/count line (`flex justify-between text-xs mb-1.5`) = `{{ f.label }}` / `{{ f.count }}`; track `h-2.5 bg-[#F0F0F0] rounded-[5px] overflow-hidden` with fill **dynamic** `w-[{{ f.pct }}%] h-full bg-[{{ f.color }}] rounded-[5px]`.
- **Charts Row 2** (376): `grid grid-cols-[1.6fr_1fr] gap-[18px] mb-[18px]`.
  - "Recent Visits" card (378): title; `<sc-for list="{{ recent }}" as="v">` (5 items). Each row is **clickable** (`onClick="{{ v.onClick }}"`): `flex items-center py-3 border-b border-[#F5F5F5] gap-3.5 cursor-pointer rounded-lg -mx-2 px-2`; hover → `bg-[#F5FFF5]`. Contents: avatar circle `w-[38px] h-[38px] rounded-full` with **dynamic** `bg:{{ v.avatarBg }}` + white initials `{{ v.init }}`; `flex-1 min-w-0` → farmer `text-[13.5px] font-semibold` `{{ v.farmer }}`, `{{ v.village }} · {{ v.crop }}` (`text-[11.5px] text-[#9E9E9E]`), `By {{ v.officer }}` (`text-[10.5px] text-[#BDBDBD]`); right block `text-right flex-none` → `{{ v.date }}` + static "View →" green; status pill **dynamic** `bg:{{ v.sBg }}` `color:{{ v.sColor }}` `px-2.5 py-0.5 rounded-[20px] text-[10.5px] font-semibold` = `{{ v.status }}`.
  - "Top Crops" card (397): title; **donut** centered `flex justify-center mb-[18px]`: outer `w-40 h-40 rounded-full` with **dynamic** `background:{{ donutGrad }}` (conic-gradient), inner white hole `absolute top-7 left-7 w-[104px] h-[104px] rounded-full bg-white flex flex-col items-center justify-center` showing **hardcoded** "847" (`text-2xl font-bold`) + "visits" (`text-[10px] text-[#9E9E9E]`). Legend `<sc-for list="{{ crops }}" as="c">` (6 items): each `flex items-center gap-2 mb-2` → swatch `w-2.5 h-2.5 rounded-[3px]` **dynamic** `bg:{{ c.color }}`, name `flex-1 text-xs text-[#616161]` `{{ c.name }}`, pct `text-xs font-semibold` `{{ c.pct }}%`.
- **Smart Insights** (418): `grid grid-cols-4 gap-3.5`. `<sc-for list="{{ insights }}" as="ins">` (4 items). Each card `p-[18px]` with **dynamic** top accent `border-t-[3px] border-t-[{{ ins.accent }}]`: title `text-xs font-bold mb-2` **dynamic** `color:{{ ins.accent }}` = `{{ ins.title }}`; body `text-xs text-[#616161] leading-[1.55]` = `{{ ins.text }}`.

---

## 3. DATA — bindings → entity/field

### Role/view flags
- `isDashboard` = `s.view === 'dashboard'` (2675).
- `isOfficer` / `isCentral` / `isSysadmin` = `R === 'officer' | 'central' | 'sysadmin'` (3510) where `R = s.role`.
- `showAnalytics` = literal `true` (2695).

### `kpis` (2868–2874) — `<sc-for>`, 4 items. Sourced from **`s.kpiData`** (state, 2611), editable via the KPI modal.
| field | binding | value (default) |
|---|---|---|
| `k.title` | title | Total Visits / Farmers Registered / Conversion Rate / Pending Follow-ups |
| `k.value` | value | `kd.visits`='1,024', `kd.farmers`='22,210', `kd.convRate`='38.7%', `kd.followups`='34' |
| `k.change` | delta badge | ↑12.3% / ↑8.7% / ↑3.2pp / ↓15% (hardcoded literals) |
| `k.accent`,`k.bg` | badge fg/bg | green/blue/amber/orange tints (hardcoded) |
| `k.sub` | caption | This month / Total database / Visit → purchase / Due this week |
> Port mapping: in a real backend `value` = derived analytics (count of `Visit`, count of `Farmer`, computed conversion %, count of follow-up `Visit`s). Here they are admin-overridable strings held in `kpiData`.

### `activityBars` (2877–2879) — `<sc-for>`, 7 items. Derived from hardcoded `raw` Mon–Sun counts.
- `b.label` = day; `b.count` = visit count; `b.h` = `round(count/max*140)` px (max=61 → Fri); `b.color` = `#2E7D32` for Fri (peak, index 4) else `#81C784`. Port: aggregate `Visit` count per day for last 7 days.

### `funnel` (2882–2888) — `<sc-for>`, 5 items. Hardcoded lead funnel.
- `f.label`/`f.count`/`f.pct`/`f.color`: New Leads 847/100%, Contacted 612/72%, Recommendation 458/54%, Follow-up 312/37%, Converted 198/23%. Port: count `Lead`/`Farmer` grouped by `leadStatus`.

### `crops` (2892–2896) + `donutGrad` (2897–2898) — `<sc-for>`, 6 items.
- `c.name`/`c.pct`/`c.color`: Wheat 37%, Rice 23%, Sugarcane 17%, Potato 12%, Mustard 8%, Other 3% (each with a color).
- `donutGrad` = computed `conic-gradient(...)` string built by accumulating each crop's pct into segments. Port: replicate the conic-gradient builder from the same crop list. The donut **center "847" is hardcoded in template** (NOT a binding — line 402). Port: derive from total or keep as a passed prop.

### `recent` (3090–3102) — `<sc-for>`, 5 items. **Dynamic, role-filtered visit feed.** Built from `recentPool` (3087–3089):
- `recentPool = (R === 'officer') ? allVisitsRaw.filter(v => v.officer === persona.name) : allVisitsRaw`, then `.slice(0,5)`.
- `allVisitsRaw` is built (3061–3079) by flattening each farmer's `visitLog` entries → carries `farmerName`, `village`, `district`, `crop`, `officer (v.by)`, `date`, `purpose`, `notes`, `init`, `avBg`, store fields; sorted by `dateRank` descending (3083–3084).
- Per item:
  - `v.farmer` = `farmerName` (**Farmer.name** via visit), `v.village` = Farmer.village, `v.crop` = Farmer.crop, `v.date` = Visit.date, `v.officer` = Visit.by (**User**).
  - `v.init` = farmer initials, `v.avatarBg` = `v.avBg` (color from `avColors` by index).
  - `v.status` = the **current farmer's status** (`farmersWithEdits.find(...).status`, fallback to `v.purpose`); `v.sBg`/`v.sColor` from `stColors[status]` (2778) — status→{bg,c} map (New/Contacted/Follow-up/Converted/Recommendation/Lost).
  - `v.onClick` = `() => setState({ view:'visitDetail', selectedVisit:v })`.
> Port: query latest 5 `Visit` rows (joined to `Farmer` for name/village/crop/status and `User` for officer); for officer role filter `Visit.officerName === currentUser.name`.

### `insights` (2901–2906) — `<sc-for>`, 4 items. Hardcoded analytics insights.
- `ins.title`/`ins.text`/`ins.accent`: Pest Alert (red), Top Performer (green), Coverage Gap (amber), Kharif Trend (blue). Port: rule-engine / curated insights table.

### Handlers
- `openKpiEdit` (3464–3470): opens edit modal `editModal:{type:'kpi',...}`, seeds `editDraft` from `s.kpiData` (visits/farmers/convRate/followups). Saved via `saveEditModal` (3487–3488) → writes back to `s.kpiData`.
- `goToUsers` = `go('users')`, `goToSettings` = `go('settings')`, `goToAudit` = `go('audit')` (3506). `go(v)` = `() => setState({ view:v, step:0, selectedFarmer:null })`.

---

## 4. INTERACTIONS

| Element | Event | Effect |
|---|---|---|
| Sysadmin "Edit KPI Values" pill (299) | `onClick=openKpiEdit` | Opens the KPI edit modal (type `'kpi'`), pre-filled with current `kpiData`. Save updates the shared KPI cards. |
| Quick Action "Manage Users" (307) | `onClick=goToUsers` | Navigate to `view:'users'`. |
| Quick Action "System Settings" (308) | `onClick=goToSettings` | Navigate to `view:'settings'`. |
| Quick Action "View Audit Log" (309) | `onClick=goToAudit` | Navigate to `view:'audit'`. |
| Quick Action "Export Full Backup" (310) | none | No handler — static placeholder (cursor:pointer but inert). Port: wire to backup export or remove cursor. |
| Recent Visit row (381) | `onClick=v.onClick` | Navigate to `view:'visitDetail'` with `selectedVisit` set to that visit object. |
| All hover states | `style-hover` | Pills/quick-actions/visit-rows lighten background on hover (see §5). |

No `onChange` inputs on this screen. There is no period/filter control on the dashboard itself (period filtering lives on the Analytics screen).

---

## 5. ROLE DIFFERENCES, EMPTY STATES, DYNAMIC STYLING

**Role composition (what each role sees, top→bottom):**
- **regional**: shared analytics block ONLY (KPIs → charts → recent visits/crops → insights). No personalized banner.
- **officer**: officer hero banner + Today's Schedule + Targets, THEN shared analytics block. `recent` is filtered to visits where `officer === persona.name` ("Raj Kumar"). The KPI "Edit" pill does NOT appear (sysadmin-only).
- **central**: purple org banner + region/ASR cards + 3 alert cards, THEN shared analytics block.
- **sysadmin**: system KPI cards + Edit-KPI pill + Quick Actions + Recent System Events, THEN shared analytics block.

**Empty states:** the demo data always populates every list, so no empty branch exists. Port should still handle: empty `recent` (officer with no visits) → render an empty-state row; KPIs always present.

**Dynamic styling (`style-hover` / inline `{{ }}`):**
- Edit-KPI pill hover: `bg-[#FFF3E0]` → `bg-[#FFE0B2]`.
- Quick Action rows hover: `bg-[#FAFAFA]` → `bg-[#F0F0F0]`.
- Recent Visit rows hover: transparent → `bg-[#F5FFF5]` (note negative margins `-mx-2 px-2` so the hover highlight extends past the divider into the card padding).
- Dynamic inline styles to translate to runtime style props (not static Tailwind, since values come from data): KPI badge `color`/`background` (`k.accent`/`k.bg`); activity bar `height`/`background` (`b.h`/`b.color`); funnel fill `width`/`background` (`f.pct`/`f.color`); recent avatar `background` (`v.avatarBg`) and status pill `background`/`color` (`v.sBg`/`v.sColor`); crop swatch `background` (`c.color`); donut `background` (`donutGrad`); insight top-border + title `color` (`ins.accent`). Use inline `style={{...}}` for these; keep the static box model in Tailwind classes.

---

## 6. PORT NOTES (React/Next + Tailwind)

**Component split (suggested):**
- `app/(app)/dashboard/page.tsx` (or `DashboardScreen`) — chooses sub-banner by role, then always renders `<AnalyticsOverview />`.
- `OfficerBanner` — hero + `TodaySchedule` + `MyTargets` (officer-only). Currently 100% hardcoded; expose props (`visits`, `conv`, `pending`, `score`, `schedule[]`, `targets[]`) for the real data layer.
- `CentralBanner` — `OrgStatBanner` + `RegionPerformance` + `TopAsrPerformers` + `OrgAlertCards`. All hardcoded → props later.
- `SysadminPanel` — `SystemKpiCards` + `EditKpiButton` + `QuickActions` + `RecentSystemEvents`. `RecentSystemEvents` maps to `AuditLog`.
- `AnalyticsOverview` (shared) — `KpiCardGrid` (over `kpis`), `VisitActivityChart` (over `activityBars`), `LeadFunnel` (over `funnel`), `RecentVisits` (over `recent`), `TopCropsDonut` (over `crops`/`donutGrad`), `SmartInsights` (over `insights`).
- Small primitives to extract: `KpiCard`, `ProgressBar`, `StatPill`, `Avatar`, `Donut`.

**Data hooks / props:**
- `useRole()` (or server-resolved `session.user.role`) → drives which banner renders.
- KPI values come from a settings/KPI store (in the design, `state.kpiData` — admin-editable). Port: `KpiSettings` table or computed metrics with admin override; `openKpiEdit` → modal that PATCHes those values (sysadmin-gated).
- `recent` → `getRecentVisits({ limit:5, officerName: role==='officer' ? user.name : undefined })`, joining `Visit`→`Farmer`(name/village/crop/status)→`User`(officer). Row click routes to `/visits/[id]`.
- `funnel`, `crops`, `activityBars`, `insights` → derived analytics endpoints; in the demo they are static so seed equivalents or compute server-side.

**Gotchas:**
1. `showAnalytics` is unconditionally `true` — the shared block is NOT mutually exclusive with role banners; every role shows it. Do not gate it behind role.
2. Donut center "847" and the officer/central/sysadmin banners are **hardcoded literals** in the template, not bindings — decide whether to keep static or wire to real metrics; flag for product.
3. `recent` status (`v.status`) is the FARMER's *current* status, not the visit's purpose — pull live farmer status, falling back to visit purpose.
4. Officer `recent` filter keys on `officer === persona.name` (display name match) — in the port use the user id, not name, to avoid collisions.
5. `donutGrad` must be computed identically (cumulative conic-gradient over the same crop ordering) for colors to align with the legend.
6. Recent-visit row hover uses negative margins to bleed the highlight into card padding — preserve `-mx-2 px-2` (or equivalent) for pixel fidelity.
7. "Export Full Backup" has no handler in the source — intentionally inert; either implement or drop the pointer cursor.
