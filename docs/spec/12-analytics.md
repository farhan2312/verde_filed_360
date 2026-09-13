# Screen Spec 12 — Analytics & Insights

Source: `original-design.dc.html`, template lines **430–593**, script (state) **2585–2648**, `renderVals()` **2650–3808** (analytics data block **2908–2969**).

---

## 1. PURPOSE & WHEN IT SHOWS

- **Purpose:** Read-only analytics dashboard. A scrollable wall of summary cards covering: a hero KPI banner, a crop×issue problem heatmap, ASR (Agri Sales Rep / field officer) leaderboard, regional performance, conversion funnel detail, farmer land-segmentation, data-quality score, and 4 AI insight cards. There is no data entry — only a period filter changes anything.
- **Activated by:** `isAnalytics = s.view === 'analytics'` (line 2676). The whole template slice is wrapped in `<sc-if value="{{ isAnalytics }}">`.
- **Navigation in:** Sidebar nav item "Analytics" (`goToAnalytics`, line 3605 = `go('analytics')` → `setState({ view:'analytics', step:0, selectedFarmer:null })`). The nav item is shown when `showAnalytics` (line 75/326).
- **Role-gating:** `showAnalytics = true` (line 2695) — **visible to ALL roles** (regional, officer, central, sysadmin). The only role difference is the page subtitle (see §5). All chart data is identical hardcoded demo data regardless of role.
- **View title (header bar, rendered elsewhere):** `titles.analytics = ['Analytics & Insights', R==='central' ? 'Cross-region performance analysis' : 'Deep-dive into field operations data']` (line 2717).

> NOTE: The entire screen is **static demo data hardcoded inside `renderVals()`**. Nothing here is wired to Store/Farmer/Visit/Project entities. The period filter buttons set `s.period` but **none of the chart data reads `s.period`** — so changing the period only restyles the pills; the numbers never change. Treat every number below as a placeholder to be replaced by real aggregate queries in the port.

---

## 2. LAYOUT TREE (top → bottom)

Outer wrapper: `<div style="animation:fadeUp 0.4s ease-out;">` → Tailwind: `animate-[fadeUp_0.4s_ease-out]` (define `fadeUp` keyframe in `tailwind.config`/globals). This sits inside the standard content area (main column is offset by the 256px fixed sidebar elsewhere).

### 2.1 Period Filter row (lines 434–438)
- Container: `display:flex; gap:8px; margin-bottom:22px;` → `flex gap-2 mb-[22px]`.
- `sc-for` over `periods` (4 pills). Each pill:
  - `padding:7px 18px; border-radius:20px; font-size:12px; font-weight:600; cursor:pointer;` → `px-[18px] py-[7px] rounded-[20px] text-xs font-semibold cursor-pointer`.
  - Dynamic: `background:{{p.bg}}; color:{{p.color}}; border:1.5px solid {{p.border}};` (see §3 periods).
  - `style-hover="opacity:0.85;"` → `hover:opacity-85`.
  - Text: `{{ p.label }}`.

### 2.2 Insight Banner — hero KPI strip (lines 441–462)
- Container: `background:linear-gradient(135deg,#1B5E20,#2E7D32,#43A047); border-radius:14px; padding:22px 28px; margin-bottom:20px; display:grid; grid-template-columns:repeat(4,1fr); gap:20px; color:white;`
  → `rounded-[14px] px-7 py-[22px] mb-5 grid grid-cols-4 gap-5 text-white bg-[linear-gradient(135deg,#1B5E20,#2E7D32,#43A047)]`.
- **4 hardcoded cells** (not a loop), each:
  - Label: `font-size:10px; opacity:0.7; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:6px;` → `text-[10px] opacity-70 uppercase tracking-[0.8px] mb-1.5`.
  - Big value: `font-size:28px; font-weight:700;` → `text-[28px] font-bold`.
  - Sub/delta: `font-size:11px; opacity:0.7; margin-top:2px;` → `text-[11px] opacity-70 mt-0.5`.
  - Cell 1: "Visits This Period" / **847** / "↑ 12.3% vs last period"
  - Cell 2: "Avg Visits / ASR" / **14.2** / "↑ 2.1 vs target of 12"
  - Cell 3: "Conversion Rate" / **42.3%** / "↑ 3.2pp vs last period"
  - Cell 4: "Data Completeness" / **84%** / "↑ 6pp improvement"

### 2.3 Standard card style (used by all cards below)
`background:white; border-radius:14px; padding:22px; box-shadow:0 1px 3px rgba(0,0,0,0.04); border:1px solid rgba(0,0,0,0.03);`
→ `bg-white rounded-[14px] p-[22px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]`.

Card title style: `font-size:15px; font-weight:700; color:#1A1C1A; margin-bottom:16px;` → `text-[15px] font-bold text-[#1A1C1A] mb-4`. (Heatmap title uses `mb-1` then a subtitle.)

### 2.4 Row 1 — Heatmap + ASR Leaderboard (lines 465–506)
- Grid: `grid-template-columns:1.2fr 1fr; gap:18px; margin-bottom:18px;` → `grid grid-cols-[1.2fr_1fr] gap-[18px] mb-[18px]`.

**(a) Problem Heatmap card (467–486)**
- Title "Problem Heatmap" (`mb-1`) + subtitle "Crop × Issue intensity — darker = more reports" (`text-[11px] text-[#9E9E9E] mb-4`).
- Header row grid: `grid-template-columns:80px repeat(5,1fr); gap:3px; margin-bottom:3px;` → `grid grid-cols-[80px_repeat(5,1fr)] gap-[3px] mb-[3px]`. First cell empty, then `sc-for hmProbs` (5 problem labels): `text-[9.5px] font-semibold text-[#9E9E9E] text-center px-0.5 py-1 uppercase tracking-[0.3px]`.
- Data rows: `sc-for hmRows` (5 crop rows). Each row = same grid template. First cell = crop name `text-[11px] font-semibold text-[#424242] flex items-center pr-2`. Then `sc-for row.cells` (5 cells): `h-[42px] rounded-md flex items-center justify-center text-xs font-bold` + dynamic `background:{{cell.bg}}; color:{{cell.tc}};`, value `{{cell.val}}`.

**(b) ASR Performance card (488–505)**
- Title "ASR Performance".
- `sc-for asrs` (6 rows). Each row: `flex items-center gap-2.5 mb-3.5` (`gap:10px; margin-bottom:14px`).
  - Rank badge: `width:22px; font-size:12px; font-weight:700; text-align:center;` + dynamic `color:{{a.rankColor}}` → `w-[22px] text-xs font-bold text-center`. Text `{{a.rank}}`.
  - Right block `flex:1; min-width:0` → `flex-1 min-w-0`:
    - Header line `flex justify-between mb-1`: name `text-[12.5px] font-semibold text-[#1A1C1A]` `{{a.name}}`; score `text-[11px] font-bold` + `color:{{a.scoreColor}}` `{{a.score}}%`.
    - Track `height:7px; background:#F0F0F0; border-radius:4px; overflow:hidden` → `h-[7px] bg-[#F0F0F0] rounded overflow-hidden`. Fill: `h-full rounded` + `width:{{a.score}}%; background:{{a.barColor}}`.
    - Meta `text-[10px] text-[#BDBDBD] mt-[3px]`: `{{a.store}} · {{a.visits}} visits`.

### 2.5 Row 2 — Regional Performance + Conversion Funnel (lines 509–544)
- Grid: `grid-cols-2 gap-[18px] mb-[18px]`.

**(a) Regional Performance (511–525)**
- Title "Regional Performance". `sc-for regions` (6 rows). Each `mb-3.5`:
  - Header `flex justify-between mb-[5px]`: name `text-[12.5px] font-semibold text-[#1A1C1A]` `{{r.name}}`; meta `text-[11px] text-[#757575]` = `{{r.visits}} visits · {{r.conv}}% conv`.
  - Bar group `flex gap-1 h-2`: filled `h-full rounded` + `width:{{r.visitPct}}%; background:#2E7D32`; remainder `h-full flex-1 bg-[#F0F0F0] rounded`.

**(b) Conversion Funnel (527–543)**
- Title "Conversion Funnel". `sc-for funnelDetail` (5 rows). Each `flex items-center gap-3 mb-2`:
  - Step circle: `width:28px; height:28px; border-radius:50%; flex; items-center; justify-center; font-size:11px; font-weight:700; color:white; flex:none;` + `background:{{fd.bg}}` → `w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0`. Text `{{fd.step}}`.
  - Bar wrapper `flex-1`: inner bar `height:{{fd.barH}}px` + `background:{{fd.color}}; border-radius:6px; flex items-center; padding-left:12px;` → `rounded-md flex items-center pl-3` with dynamic height. Label `text-[11px] font-semibold text-white` `{{fd.label}}`.
  - Count column `width:60px; text-align:right` → `w-[60px] text-right`: count `text-sm font-bold text-[#1A1C1A]` `{{fd.count}}`; pct `text-[10px] text-[#BDBDBD]` `{{fd.pct}}%`.

### 2.6 Row 3 — Farmer Segmentation + Data Quality (lines 547–580)
- Grid: `grid-cols-2 gap-[18px] mb-[18px]`.

**(a) Farmer Segmentation by Land (549–564)**
- `sc-for segments` (5 rows). Each `mb-3`:
  - Header `flex justify-between mb-1`: label `text-xs text-[#616161]` `{{seg.label}}`; count `text-xs font-bold text-[#1A1C1A]` `{{seg.count}}`.
  - Track `height:20px; background:#F5F5F5; border-radius:6px; overflow:hidden` → `h-5 bg-[#F5F5F5] rounded-md overflow-hidden`. Fill: `h-full rounded-md flex items-center pl-2` + `width:{{seg.pct}}%; background:{{seg.color}}`, inner pct label `text-[10px] font-semibold text-white` `{{seg.pct}}%`.

**(b) Data Quality Score (566–579)**
- `sc-for quality` (6 rows). Each `mb-3`:
  - Header `flex justify-between mb-1`: label `text-xs text-[#616161]` `{{q.label}}`; pct `text-xs font-bold` + `color:{{q.color}}` `{{q.pct}}%`.
  - Track `h-2 bg-[#F0F0F0] rounded overflow-hidden`. Fill: `h-full rounded` + `width:{{q.pct}}%; background:{{q.color}}`.

### 2.7 AI Insights row (lines 583–590)
- Grid: `grid-template-columns:repeat(4,1fr); gap:14px;` → `grid grid-cols-4 gap-3.5`.
- `sc-for insights` (4 cards). Each: standard card with `padding:18px` (`p-[18px]`) and `border-left:3px solid {{ins.accent}}` → `border-l-[3px]` with dynamic color.
  - Title: `text-[11px] font-bold uppercase tracking-[0.5px] mb-1.5` + `color:{{ins.accent}}` `{{ins.title}}`.
  - Body: `text-xs text-[#616161] leading-[1.55]` `{{ins.text}}`.

---

## 3. DATA — bindings, sources, loops, derivations

All data is **hardcoded local consts** in `renderVals()`. None reads from the live state arrays (Store/Farmer/Visit/Project). For the port, replace each with a derived analytics query.

### `periods` (lines 2909–2914) — `sc-for` (4 items)
Built from `['7d','30d','90d','ytd']`:
- `label`: `'7 Days' | '30 Days' | '90 Days' | 'Year'`.
- `bg`: selected→`#2E7D32` else `white`. `color`: selected→`white` else `#616161`. `border`: selected→`#2E7D32` else `#E0E0E0`. Selection = `s.period === p`.
- `onClick`: `() => this.setState({ period: p })` — only mutation on this screen.
- **Default `s.period === '30d'`** (state line 2587), so "30 Days" pill is highlighted on load.

### Hero banner numbers (lines 444–460) — fully static literals
847 / 14.2 / 42.3% / 84% and their delta strings are inline in template, NOT bound. → Port to aggregates: visits-in-period count; avg visits per active ASR; conversion rate; data-completeness %.

### `hmProbs` (2917) — `sc-for` header (5 items)
`['Pest','Disease','Nutrient','Water','Weather']` — column headers (issue categories).

### `hmRows` (2920–2930) — `sc-for` data rows (5 crops × 5 cells)
- Source crops `hmCrops = ['Wheat','Rice','Sugarcane','Potato','Mustard']` (2918).
- Matrix `hmData` (2919): 5×5 ints, max value 85.
- Each cell: `val` = `hmData[ci][pi]`; intensity `t = v/85`.
  - `bg`: if `t > 0.6` a hot red `rgb(200-t*120, 80+t*20, 60+t*10)`; else a green-tint `rgb(232-t*170, 245-t*130, 233-t*175)`.
  - `tc` (text color): `t > 0.6 ? 'white' : '#424242'`.
- Row exposes `row.crop` and `row.cells[]`.
- Port mapping: crop = `Visit.crop`/`Farmer.crop`; issue category = `Visit.currentProblem` / `FieldOption` problem taxonomy. Cell = count of problem reports for that (crop, issue). Recompute the rgb ramp in JS or via a Tailwind/inline-style helper.

### `asrs` (2933–2940) — `sc-for` (6 items)
Base array of `{name, store, visits, score}`, then `.map` adds:
- `rank` = i+1; `rankColor` = top-3→`#F9A825` (gold) else `#BDBDBD`.
- `scoreColor` = `>=80 #2E7D32`, `>=70 #F57F17`, else `#E65100`.
- `barColor` = `>=80 #2E7D32`, `>=70 #F9A825`, else `#FF8F00`.
Values: Raj Kumar/Firozabad/94/96 · Amit Yadav/Agra Main/87/88 · Vikram Singh/Mainpuri/82/84 · Deepak Verma/Etah/76/78 · Sunil Gupta/Mathura/71/74 · Ravi Sharma/Hathras/68/69.
Port mapping: per **User** (role officer/ASR) → `visits` = count of their Visits; `score` = a performance metric (e.g., conversion %); `store` = their **Store**.

### `regions` (2943–2950) — `sc-for` (6 items)
`{name, visits, conv (%), visitPct (bar width %)}`: Agra 245/45/100 · Firozabad 198/52/81 · Mainpuri 156/38/64 · Etah 112/35/46 · Mathura 89/31/36 · Hathras 47/28/19.
Port mapping: group Visits by region/cluster/district (`Store.region` or `Cluster`); `visitPct` = visits ÷ max(visits)·100.

### `funnel` → `funnelDetail` (2882–2889) — `sc-for` (5 items)
`funnel`: New Leads 847/100% · Contacted 612/72% · Recommendation 458/54% · Follow-up 312/37% · Converted 198/23%, each with a `color`. `funnelDetail` adds:
- `step` = i+1; `bg` = `f.color`; `barH` = `32 - i*2` (px, tapering: 32,30,28,26,24).
Port mapping: lead-status pipeline counts from **Farmer.leadStatus** / Visit funnel stages.

### `segments` (2953–2959) — `sc-for` (5 items)
Farmer land-holding buckets `{label, count, pct, color}`: Marginal(<2ac) 312/24% · Small(2–5) 428/33% · Medium(5–10) 298/23% · Large(10–25) 178/14% · Very Large(25+) 68/5%. Greens darken with size.
Port mapping: bucket **Farmer.landHolding** (acres), `pct` = bucket count ÷ total.

### `quality` (2962–2969) — `sc-for` (6 items)
Data-completeness per field group `{label, pct, color}`: Farmer Info 98 · Location Data 94 · Crop Details 87 · Problem Reports 72 · Commercial Data 63 · Media Attachments 45. Color steps from green→orange as pct drops.
Port mapping: % of Farmer/Visit records with non-null values in each field group (derived completeness metric).

### `insights` (2901–2906) — `sc-for` (4 items)
`{title, text, accent}`: "Pest Alert" (#C62828) · "Top Performer" (#2E7D32) · "Coverage Gap" (#F57F17) · "Kharif Trend" (#1565C0). Static narrative copy.
Port mapping: rule-based / LLM-generated insight cards, or curated content table.

---

## 4. INTERACTIONS

- **Period pills (`p.onClick`)**: `setState({ period })` — updates `s.period`, which only re-styles the pills. **No data is filtered** in this design (bug/limitation to preserve or fix in port — decide whether to actually filter aggregates by period).
- **No other onClick/onChange** anywhere on this screen. No navigation, no modals, no forms, no row clicks (cards/rows are display-only, not links).
- The only `style-hover` is on the period pills (`opacity:0.85`). No `style-active`.

---

## 5. ROLE DIFFERENCES, EMPTY STATES, DYNAMIC STYLING

- **Role differences:** Screen is visible to all roles (`showAnalytics = true`). The **only** difference is the header subtitle: `central` → "Cross-region performance analysis"; all others → "Deep-dive into field operations data" (line 2717). Data content is identical across roles in this design.
- **Empty states:** None implemented — all arrays are non-empty literals. In the port, add empty/zero states for each card (e.g., "No visits in this period").
- **Tricky dynamic styling:**
  - Heatmap cell color is computed (two-branch rgb ramp keyed on `t = v/85`), with text color flipping to white when `t > 0.6`. Reproduce the exact formula for pixel-faithfulness.
  - ASR `rankColor`/`scoreColor`/`barColor` and `quality`/`segments` colors are threshold-based; keep the exact hex breakpoints.
  - Funnel bar height tapers via `barH = 32 - i*2`.
  - Bar widths (`a.score%`, `r.visitPct%`, `seg.pct%`, `q.pct%`) are inline `width:` percentages.
  - Period pill bg/color/border are 3 coordinated dynamic values driven by `s.period`.

---

## 6. PORT NOTES (Next.js 14 + TS + Tailwind)

**Component split (`app/(app)/analytics/page.tsx` + components):**
- `AnalyticsPage` — server component: fetch all aggregates (see hooks below), pass to client children. Reads `role` from session/context for the subtitle only.
- `PeriodFilter` — client component; holds `period` state (URL search param `?period=` is the clean approach so server can refetch). Pills array `['7d','30d','90d','ytd']` with the label map.
- `HeroKpiBanner` — props: `{ visits, avgVisitsPerAsr, conversionRate, dataCompleteness }` each with a delta string.
- `ProblemHeatmap` — props: `{ problems: string[], rows: {crop, cells:{val,bg,tc}[]}[] }`. Keep the rgb-ramp helper (`cellStyle(v, max)`) pure and unit-testable.
- `AsrLeaderboard` — props: `asrs: {name, store, visits, score, rank, rankColor, scoreColor, barColor}[]` (or compute the color thresholds inside the component from raw `{name,store,visits,score}`).
- `RegionalPerformance` — props: `regions: {name, visits, conv, visitPct}[]`.
- `ConversionFunnel` — props: `steps: {step, label, count, pct, color, barH}[]`.
- `LandSegmentation` — props: `segments: {label, count, pct, color}[]`.
- `DataQualityScore` — props: `quality: {label, pct, color}[]`.
- `AiInsights` — props: `insights: {title, text, accent}[]`.
- A small reusable `Card` wrapper (white, rounded-[14px], p-[22px], soft shadow, hairline border) used by all sub-cards; `BarTrack`/`BarFill` primitive for the repeated progress-bar pattern.

**Data hooks / queries (replace demo literals):**
- `getAnalytics(period, regionScope)` returning the shapes above. Sub-queries: visit counts (banner + ASR + regional + funnel), conversion rate, problem-report matrix (crop×issue), farmer land buckets, field-completeness percentages.
- For `central` role, scope = all regions; other roles can scope to their own region/territory (the design doesn't do this, but it's the natural extension implied by the subtitle).

**Gotchas:**
1. **Period filter is non-functional in the original** — pills change color but data never changes. Decide explicitly: either wire `period` into the queries (recommended) or replicate the inert behavior.
2. **Inline percentage widths** must stay inline styles (`style={{ width: \`${pct}%\` }}`) — not Tailwind classes — since they are arbitrary runtime values. Same for computed heatmap rgb backgrounds and funnel `barH`.
3. Define the `fadeUp` keyframe (used as the entrance animation) in Tailwind config / globals; it's referenced across many screens.
4. Heatmap normalization divides by the hardcoded **85** (matrix max). In the port, divide by the actual max of the live matrix so the color ramp scales correctly.
5. Hero banner deltas ("↑ 12.3% vs last period", etc.) are literal strings; compute period-over-period deltas in the data layer.
6. Many literal colors map to a small token set (primary green `#2E7D32`/`#1B5E20`/`#43A047`, amber `#F9A825`/`#F57F17`, orange `#E65100`/`#FF8F00`, red `#C62828`, blue `#1565C0`, greys `#1A1C1A`/`#424242`/`#616161`/`#757575`/`#9E9E9E`/`#BDBDBD`/`#E0E0E0`/`#F0F0F0`/`#F5F5F5`). Add these to the Tailwind theme as named tokens for reuse across screens.
