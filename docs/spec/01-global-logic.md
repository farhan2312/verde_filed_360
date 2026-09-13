# 01 — Global Logic, Design Tokens, Roles, Routing & DSL Mapping

Source of truth: `webapp/docs/original-design.dc.html` (Claude design-composer DSL).
- Template (DSL markup): lines ~9–2558, inside `<x-dc>`.
- Script (`class Component extends DCLogic`): lines 2559–3806.
  - `state = {…}` lines 2585–2648.
  - `renderVals()` lines 2650–3805 (computes all `{{ }}` bindings + holds embedded demo data).

This document is the **global** spec: design tokens, the role/nav matrix, the routing/view model, shared helpers, and the DSL→React translation rules. Per-screen specs live in sibling files (`02-…`, `03-…`, etc.). Embedded demo data arrays (farmers, stores, users, projects, analytics) are catalogued in the data-layer spec; here we only describe the *logic* that consumes them.

---

## 1. DESIGN TOKENS

### 1.1 Typography
- **Font family:** `DM Sans` (loaded via Google Fonts `<helmet>`), weights **400, 500, 600, 700**, optical sizing `9..40`. Fallback `system-ui, sans-serif`. `-webkit-font-smoothing:antialiased`.
  - Tailwind: already wired as `font-sans` → `var(--font-dm-sans)`. Load DM Sans via `next/font/google` in `app/layout.tsx` exposing `--font-dm-sans` with the four weights.
- **Type scale observed** (px → suggested Tailwind): 9.5 (`text-[9.5px]` uppercase labels), 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5 (nav items), 14, 15 (card titles), 18, 20 (header title), 24, 26, 30 (KPI numerals). Most are non-standard; use arbitrary values `text-[13.5px]` to stay pixel-faithful.
- **Letter-spacing:** `0.2px`–`1px` on headings/labels; uppercase micro-labels use `letter-spacing:0.5px–1px` (`tracking-[1px]`). `font-feature` not used.
- **Weights in use:** 400 (body/inactive nav), 500, 600 (labels, active nav, buttons), 700 (titles, KPI numbers, avatars).

### 1.2 Colors (every hex used, grouped)

> Inventory built from a full hex scan of the file. ✅ = already in `tailwind.config.ts`; ➕ = **NOT covered, must add**.

**Brand greens / primary**
| Hex | Usage | Token |
|---|---|---|
| `#1A3A1A` | sidebar top, active pills, filter-pill active bg | ✅ `brand.900` |
| `#0F2810` | sidebar gradient bottom | ✅ `brand.950` |
| `#2E7D32` | primary green, High-Value seg, buttons | ✅ `brand` / `brand.600` / `seg.high` |
| `#1B5E20` | button hover (`brand` darker) | ➕ add `brand.700 = #1B5E20` |
| `#388E3C` | gradient stop (lead status badge) | ➕ add `brand.500 = #388E3C` |
| `#43A047` | region bar, persona grad, funnel | ✅ `brand.400` |
| `#66BB6A` | funnel/region/quality mid-green | ➕ add `brand.300 = #66BB6A` |
| `#81C784` | activity bar (non-peak), region | ➕ add `brand.200 = #81C784` |
| `#A5D6A7` | region/segment light green | ➕ add `brand.150 = #A5D6A7` (or reuse) |
| `#C8E6C9` | `::selection`, region lightest, success border | ✅ `brand.100` |
| `#E8F5E9` | success bg, High-Value seg bg | ✅ `brand.50` |
| `#F1F8F1`,`#F0F7F0`,`#F5F7F5`,`#FAFFF9`,`#FAFFF8`,`#F5FFF5`,`#FAFFFE` | very-light green tinted card/hover bgs | ➕ add as `tint.green` set OR keep as arbitrary `bg-[#F5F7F5]` |

**Gold / amber accent**
| Hex | Usage | Token |
|---|---|---|
| `#F9A825` | gold accent, rank #1, funnel, persona grad | ✅ `gold` |
| `#F57F17` | gold-dark, New/Low seg, warnings | ✅ `gold.dark` / `seg.low` |
| `#FF8F00` | funnel/segment/region orange-gold, persona grad | ✅ `orange.light` (note: also amber role) |
| `#FFA000` | crop legend "Barley" | ➕ add `gold.600 = #FFA000` |
| `#FFE082`,`#FFE0B2` | gold/amber soft borders | ➕ add `gold.100 = #FFE082`, `gold.200 = #FFE0B2` |
| `#FFF8E1` | New/Low seg bg, gold tint card | ✅ `gold.50` |
| `#FFF3E0` | warning/orange tint bg (admin mode, follow-up) | ➕ add `orange.50 = #FFF3E0` |

**Info blue**
| Hex | Usage | Token |
|---|---|---|
| `#1565C0` | info, Medium-Value seg, officer persona | ✅ `info` / `seg.medium` |
| `#42A5F5` | officer persona grad light | ✅ `info.light` |
| `#1E88E5`,`#0D47A1` | officer banner gradient stops | ➕ add `info.600 = #1E88E5`, `info.900 = #0D47A1` |
| `#E3F2FD` | info tint bg, Medium-Value seg bg | ✅ `info.50` |
| `#B8D8EA`,`#CCE8F5`,`#5A96B0` | map illustration water tones | ➕ map-only, keep arbitrary |

**Purple (central admin / Converted)**
| Hex | Usage | Token |
|---|---|---|
| `#7B1FA2` | purple, Converted status, central persona | ✅ `purple` |
| `#CE93D8` | central persona grad light | ✅ `purple.light` |
| `#4A148C`,`#9C27B0` | central banner gradient stops | ➕ add `purple.900 = #4A148C`, `purple.500 = #9C27B0` |
| `#4527A0`,`#9575CD` | "Season review" visit type, user grad | ➕ add `purple.dark = #4527A0`, `purple.300 = #9575CD` |
| `#AD1457` | "Re-engagement" visit type (magenta) | ➕ add `magenta = #AD1457` |
| `#E1BEE7`,`#F3E5F5` | purple borders / Converted tint bg | ➕ add `purple.100 = #E1BEE7`, `purple.50 = #F3E5F5` |

**Orange / system-admin / danger**
| Hex | Usage | Token |
|---|---|---|
| `#E65100` | orange, Follow-up status, sysadmin persona, admin-mode text | ✅ `orange` |
| `#C62828` | alert/danger red, "Pest check" | ➕ add `danger = #C62828` |
| `#FFEBEE` | danger tint bg (issue badge) | ➕ add `danger.50 = #FFEBEE` |

**Misc accents (visit types / crops)**
| Hex | Usage | Token |
|---|---|---|
| `#00695C` | "Sowing advisory" teal | ➕ add `teal = #00695C` |
| `#8D6E63`,`#6D4C41`,`#795548` | Potato / "Soil advisory" / soil browns | ➕ add `brown = #6D4C41` (+ `brown.light = #8D6E63`) |
| `#78909C` | crop "Millets" slate | ➕ add `slate = #78909C` |

**Neutrals / ink / surface**
| Hex | Usage | Token |
|---|---|---|
| `#1A1C1A` | primary heading text | ✅ ~`ink` (config `#1A1A1A`; design uses `#1A1C1A` — **align `ink.DEFAULT` to `#1A1C1A`**) |
| `#424242` | dark body text | ➕ add `ink.700 = #424242` |
| `#616161` | secondary text/labels | ➕ add `ink.600 = #616161` |
| `#757575` | muted text | ➕ add `ink.500 = #757575` |
| `#9E9E9E` | muted/dormant seg, subtitles | ✅ `ink.muted` / `seg.dormant` |
| `#BDBDBD` | placeholder/disabled | ➕ add `ink.400 = #BDBDBD` |
| `#E0E0E0` | borders, range track | ✅ `line` |
| `#E6E8E4` | header bottom border | ➕ add `line.warm = #E6E8E4` |
| `#E8E8E8`,`#EEEEEE`,`#F0F0F0`,`#F5F5F5`,`#FAFAFA`,`#F8F8F8` | track / hover / table-row greys | ➕ add `surface` ramp (50–200) |
| `#F2F4F0` | app canvas bg | ✅ `canvas` |
| `#F0EDE8`,`#E4EDD8`,`#DDD8CE`,`#D0C8B8`,`#C0B8A8`,`#5A5248`,`#A09888`,`#8A8078`,`#B0A898` | **map illustration only** (land/road tones) | ➕ map-scoped, keep arbitrary in MapView component |

### 1.3 Gradients
- Sidebar: `linear-gradient(180deg,#1A3A1A 0%,#0F2810 100%)` → `bg-gradient-to-b from-brand-900 to-brand-950`.
- Persona avatar gradients (135deg) — see §2.1.
- Officer dashboard banner: `linear-gradient(135deg,#0D47A1,#1565C0,#1E88E5)`.
- Central dashboard banner: `linear-gradient(135deg,#4A148C,#7B1FA2,#9C27B0)`.
- User-row avatars: `linear-gradient(135deg, gradA, gradB)` (per-user `gradA/gradB`).
- Crop donut: dynamic `conic-gradient(...)` built in JS (`donutGrad`) — render as inline style (Tailwind can't express it).
- Heatmap cells: per-cell `rgb(...)` computed in JS (`hmRows`) — inline style.

### 1.4 Border radius
Common values: `6px`(small chips/bars), `8px`, `10px`(nav items, buttons, list rows), `12px`(role-picker), `14px`(cards/banners), `20px`(pills), `50%`(avatars/dots). Map to `rounded-md/lg/xl/[14px]/full`. Cards are consistently **`14px`**; nav items/buttons **`10px`**; pills **`20px`**.

### 1.5 Shadows
- Card: `0 1px 3px rgba(0,0,0,0.04)` (+ border `1px solid rgba(0,0,0,0.03)`) → close to ✅ `shadow-card`.
- Sidebar: `2px 0 20px rgba(0,0,0,0.15)` → ✅ `shadow-sidebar`.
- Role-picker popover: `0 -4px 20px rgba(0,0,0,0.3)`.
- Modal: `0 20px 60px rgba(0,0,0,0.25)` → ✅ `shadow-modal`.
- Map pins: `0 2px 8px rgba(0,0,0,0.28)` (normal) / `0 4px 16px rgba(0,0,0,0.45)` (selected); store pins `0 2px 10px rgba(0,0,0,0.32)` / selected `0 0 0 4px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.35)` — compute inline (dynamic).

### 1.6 Spacing rhythm
Layout grid uses 2/4/6px increments. Sidebar width **256px** (`ml-64` content offset). Header height **64px**. Main content padding **28px 32px**. Card padding **18–22px**. Card gaps **14–20px** (grids use `gap:14/18/20px`). Nav item padding `11px 14px`, gap `12px`. Pills padding `6px 14px`. Buttons `9px 20px`.

### 1.7 Animations
- `@keyframes fadeUp { opacity 0→1, translateY 12px→0 }` — applied to dashboard/page wrappers (`animation:fadeUp 0.4s ease-out`). ✅ `animation-fadeUp`.
- `@keyframes countUp { opacity 0→1 }` — KPI numbers. ✅ `animation-countUp`.
- Range input thumb styled green (`#2E7D32`), track `#E0E0E0` — add to `globals.css` (Tailwind can't style `::-webkit-slider-thumb` ergonomically).
- `::selection { background:#C8E6C9 }` — add to `globals.css`.
- Nav/button transitions `all 0.15s`; active button `transform:scale(0.97)` (`active:scale-[0.97]`).

### 1.8 Token coverage summary
**Already covered:** canvas, brand 50/100/400/600/900/950, gold + gold.dark + gold.50, seg.high/medium/low/dormant, info + light + 50, purple + light, orange + light, ink.muted, line, shadows, both keyframes/animations.
**Must add** (see tables above): `brand.700 #1B5E20`, `brand.500 #388E3C`, `brand.300 #66BB6A`, `brand.200 #81C784`, `brand.150 #A5D6A7`; `gold.600 #FFA000`, `gold.100 #FFE082`, `gold.200 #FFE0B2`, `orange.50 #FFF3E0`; `info.600 #1E88E5`, `info.900 #0D47A1`; `purple.900 #4A148C`, `purple.500 #9C27B0`, `purple.dark #4527A0`, `purple.300 #9575CD`, `purple.100 #E1BEE7`, `purple.50 #F3E5F5`; `magenta #AD1457`; `danger #C62828` + `danger.50 #FFEBEE`; `teal #00695C`; `brown #6D4C41` + `brown.light #8D6E63`; `slate #78909C`; ink ramp `700 #424242 / 600 #616161 / 500 #757575 / 400 #BDBDBD`; `line.warm #E6E8E4`; a `surface` grey ramp (`#F8F8F8 #F5F5F5 #F0F0F0 #EEEEEE #FAFAFA #E8E8E8`); and align `ink.DEFAULT` to `#1A1C1A`. Map-illustration earth/water tones stay component-scoped (arbitrary classes), not global tokens.

---

## 2. ROLE / PERSONA / NAV MATRIX

State: `state.role` ∈ `'regional' | 'officer' | 'central' | 'sysadmin'` (default `'regional'`). Switching role resets `view:'dashboard'`, clears `selectedFarmer`/`selectedProject`, closes role picker.

### 2.1 Personas (`personas` map, lines 2661–2666)
| key | name | role label | initials | avatar gradient (135deg) |
|---|---|---|---|---|
| `regional` | Rajesh Verma | Regional Manager | RV | `#43A047 → #F9A825` (green→gold) |
| `officer` | Raj Kumar | Agricultural Officer | RK | `#1565C0 → #42A5F5` (blue) |
| `central` | Dr. Anita Sharma | Central Admin | AS | `#7B1FA2 → #CE93D8` (purple) |
| `sysadmin` | Vikash Mehta | System Admin | VM | `#E65100 → #FF8F00` (orange) |

`roleOptions` maps these for the **role-picker popover** (`roleOptions[]` with `key,name,role,init,color,active,onClick`). `active` = `rgba(255,255,255,0.12)` for current role else `transparent`. The footer button (`toggleRolePicker`) shows `personaName/personaRole/personaInit/personaColor`. → React: a `RoleContext` provider + `RoleSwitcher` component.

### 2.2 Nav visibility per role (lines 2693–2758)
| Nav item / flag | regional | officer | central | sysadmin | logic |
|---|:--:|:--:|:--:|:--:|---|
| Dashboard | ✅ | ✅ | ✅ | ✅ | always |
| New Visit (`showNewVisit`) | ✅ | ✅ | ❌ | ✅ | `regional || officer || sysadmin` |
| Visit Repo (`showVisitRepo`) | ✅ | ✅ | ✅ | ✅ | `true` |
| Farmer 360 (`showFarmer360`) | ✅ | ✅ | ✅ | ✅ | `true` |
| Map View (`showMapView`) | ✅ | ✅ | ✅ | ✅ | `true` |
| Farmer Clusters (`showFarmerCluster`) | ✅ | ✅ | ✅ | ✅ | `true` |
| Master Data (`showMasterData`) | ❌ | ❌ | ✅ | ✅ | `central || sysadmin` |
| Analytics (`showAnalytics`) | ✅ | ✅ | ✅ | ✅ | `true` |
| Lead Pipeline (`showLeads`) | ✅ | ✅ | ❌ | ✅ | `regional || officer || sysadmin` |
| Action Planner (`showActions`) | ✅ | ✅ | ✅ | ✅ | `regional || central || officer || sysadmin` (= all 4) |
| **Administration** header + Users (`showUsers`) | ❌ | ❌ | ✅ | ✅ | `central || sysadmin` |
| Settings (`showSettings`) | ❌ | ❌ | ❌ | ✅ | `sysadmin` only |
| Audit Log (`showAudit`) | ❌ | ❌ | ❌ | ✅ | `sysadmin` only |
| `isAdmin` (header "Admin Mode" pill + "+ New Visit" gating uses `showNewVisit`) | ❌ | ❌ | ❌ | ✅ | `R==='sysadmin'` |

Notes:
- `showMasterData` appears **twice**: in `state` it is a stale boolean `false` (ignore), but the authoritative value is returned from `renderVals` as `R === 'central' || R === 'sysadmin'`. Use the role-derived version.
- The **"Administration"** sidebar section label (line 94) is rendered inside the same `sc-if showUsers`, so it only shows when Users is visible.
- The header **"+ New Visit"** button is gated by `showNewVisit` (same as nav). The **"Admin Mode"** orange pill is gated by `isAdmin`.

### 2.3 Per-role dashboard banner & subtitle
Dashboard view (`isDashboard`) renders a different hero per role via nested `sc-if`:
- `isRegional` → standard KPI cards + activity/funnel/insights (no special banner).
- `isOfficer` → blue personal banner ("Welcome back, Raj Kumar", territory, 4 stats: My Visits 94 / My Conv. 67% / Pending 8 / Score 96) + "Today's Schedule" + "My Targets vs Actual" cards.
- `isCentral` → purple 5-stat banner (Total Visits 3,412 / Active Regions 6 / Active ASRs 24 / Org Conversion 38.7% / Total Revenue ₹48.2L) + Region-wise Performance + Top ASR Performers + 3 alert/achievement/opportunity cards.
- `isSysadmin` → 4 system KPI cards (Active Users 5/6, DB Size 2.4 GB, API Calls 1,842, Uptime 99.8%) + "Edit KPI Values" button (`openKpiEdit`) + Quick Actions + Recent System Events.

**Dashboard subtitles** (`dashSubs`, line 2716):
| role | subtitle |
|---|---|
| regional | `Agra Region · Sunday, June 22, 2026` |
| officer | `My Territory · Sunday, June 22, 2026` |
| central | `All Regions · Organization Overview` |
| sysadmin | `System Administration` |

Recent-visits feed is role-filtered: officer sees only visits where `officer === persona.name`; everyone else sees all (`recentPool`, line 3087).

---

## 3. ROUTING / VIEW MODEL

Single-page state machine: `state.view` selects the screen; no URL routing in the DSL. For Next.js App Router, model each `view` as a route segment (e.g. `/dashboard`, `/visits/new`, `/farmers`, `/farmers/[id]`, …) backed by a shared layout, OR keep a single client view-switcher in a `(app)` layout. Either way, the `view` → title/subtitle map below is canonical.

### 3.1 `view` values and `titles` map (lines 2717–2720)
| `view` | viewTitle | viewSub |
|---|---|---|
| `dashboard` | `Dashboard` | `dashSubs[role]` (see §2.3) |
| `analytics` | `Analytics & Insights` | central: `Cross-region performance analysis`; else `Deep-dive into field operations data` |
| `newVisit` | `New Visit Entry` | `Step {step+1} of 5` |
| `farmers` | `Farmer 360` | `1,284 registered farmers · Segmented view` |
| `farmerDetail` | `Farmer 360 — Profile` | `''` |
| `leads` | `Lead Pipeline` | `Track farmer engagement funnel` |
| `actions` | `Action Planner` | `{projects.length} projects · {activeCount} active` |
| `projectDetail` | `Project Details` | `''` |
| `mapView` | `Map View` | `Farmer locations · Agra District & surrounding` |
| `farmerCluster` | `Farmer Clusters` | `Segmented farmer groups for targeted actions` |
| `visitRepo` | `Visit Repository` | `Complete visit records across all officers & stores` |
| `visitDetail` | `Visit Detail` | `''` |
| `users` | `User Management` | `4 active users · Role-based access` |
| `settings` | `System Settings` | `Configuration & master data` |
| `audit` | `Audit Log` | `System activity & data changes` |
| `masterData` | *(not in `titles`)* — falls back to `['Dashboard','']`; handle explicitly: title `Master Data`, sub from template tabs. |

Fallback: `titles[view] || ['Dashboard','']` (line 2721). `masterData` is missing from `titles` (likely a bug) — supply a real title when porting.

View boolean flags returned from renderVals (consumed by `sc-if` in template): `isDashboard, isAnalytics, isNewVisit, isFarmers, isFarmerDetail, isLeads, isActions, isProjectDetail, isUsers, isSettings, isAudit, isMapView, isFarmerCluster, isVisitRepo, isVisitDetail, isMasterData` plus role flags `isRegional/isOfficer/isCentral/isSysadmin/isAdmin`.

### 3.2 Navigation handlers (how state mutates)
Generic helper `go(v) = () => setState({ view:v, step:0, selectedFarmer:null })` (line 2652). Named nav handlers:
- `goToDashboard=go('dashboard')`, `goToNewVisit=go('newVisit')`, `goToFarmers=go('farmers')`, `goToAnalytics=go('analytics')`, `goToLeads=go('leads')`, `goToMapView=go('mapView')`, `goToUsers=go('users')`, `goToSettings=go('settings')`, `goToAudit=go('audit')`.
- Non-`go` variants that reset extra state:
  - `goToActions` → `{ view:'actions', selectedProject:null, showNewProject:false }`.
  - `goToVisitRepo` → `{ view:'visitRepo', selectedVisit:null }`.
  - `goToFarmerCluster` → `{ view:'farmerCluster', selectedClusterDetail:null }`.
  - `goToMasterData` → `{ view:'masterData' }`.
- Drill-in handlers (set selection + view): `farmerRows[].onClick` → `{ view:'farmerDetail', selectedFarmer:f }`; `recent[].onClick` / `visitRepoRows[].onClick` → `{ view:'visitDetail', selectedVisit:v }`; project cards `onClick` → `{ view:'projectDetail', selectedProject:p }`; `mapPins[].onClick` → `{ selectedMapFarmer:f }`; cluster rows → `{ selectedClusterDetail:cl }`.
- Back handlers: `goBackToActions`, `goBackFromVisitDetail` (→ `visitRepo`), `clearSelectedCluster`, `closeMapPanel`.

### 3.3 Key state slices (lines 2585–2648)
`view, step(0–4), search, period('30d'), role, showRolePicker, mapLayer('segment'), farmerClusters[], showClusterModal, clusterDraftName, clusterModalLayerFilter, selectedClusterDetail, clusterSource, visitRepoFilter{officer,store,type,period}, selectedVisit, selectedMapFarmer, mapStoreFilter, showStorePins, adminSubTab, masterDataTab('stores'), storeEdits{}, farmerEdits{}, userEdits{}, editModal, editDraft, kpiData{visits,farmers,convRate,followups}, projects[], selectedProject, showNewProject, newProject{}, newUpdate, form{…29 fields}, segFilter (implicit)`.

**Sysadmin override pattern:** base demo arrays (`farmers`, `baseStores`, `baseUsers`) are merged with per-id edit maps: `farmersWithEdits = farmers.map(f => ({...f, ...(farmerEdits[f.id]||{})}))` (same for stores/users). Edits are saved by `saveEditModal()` keyed on `editModal.type` (`farmer|user|kpi|store`). Replicate as a client-side "overrides" layer or persist to DB.

---

## 4. SHARED HELPERS (promote to utils/components)

1. **`go(view)`** (2652) → a `useNavigate`/router push or a `setView` from context.
2. **`nv(id)`** (2706–2713) — nav-item active styler. Returns `{bg, cl, w}`. `active` when `view===id` OR aliased detail views (`farmers↔farmerDetail`, `actions↔projectDetail`, `visitRepo↔visitDetail`). → `<NavItem active={…}>` component computing classes (active: `bg-white/12 text-white font-semibold`; inactive: `text-white/60 font-normal`). Hover `bg-white/8`.
3. **`go`/`titles` viewTitle resolver** → `getViewMeta(view, role)` util returning `{title, subtitle}`.
4. **Segment color maps** (declared several times, consolidate):
   - `segColors = {High Value:#2E7D32, Medium Value:#1565C0, New/Low:#F57F17, Dormant:#9E9E9E}` (2725; also `segColMap` 3402, `layerColorFn.segment` 3190).
   - `segBgs = {High Value:#E8F5E9, Medium Value:#E3F2FD, New/Low:#FFF8E1, Dormant:#F5F5F5}` (2726).
   - `segLabels = ['High Value','Medium Value','New/Low','Dormant']`.
   → one `lib/segments.ts` exporting `SEGMENTS`, `segColor()`, `segBg()`.
5. **Status color map** `stColors` (2778): New→green, Contacted→blue, Follow-up→orange, Converted→purple, Recommendation→gold, Lost→grey (each `{bg,c}`). → `lib/status.ts`.
6. **Avatar palette** `avColors`/`avC2` (2779/3403): `['#2E7D32','#1565C0','#E65100','#7B1FA2','#F57F17','#C62828','#00695C','#4527A0']`, indexed `i % len`. + `initials(name)` = `name.split(' ').map(n=>n[0]).join('')` (used ~10×). → `lib/avatar.ts` (`avatarColor(i)`, `initials(name)`) + `<Avatar>` component.
7. **Role/status meta for Users** `roleMeta` (3415), `statusMeta2` (3421). → `lib/users.ts`.
8. **Visit-type color map** `visitTypes` (3051) + **visit-type recommendations** `visitRecMap` (3137–3150, with default). → `lib/visitTypes.ts`.
9. **Map layer engine:** `layerColorFn` (3189), `getLayerValue` (3196), `legendMeta` (3222), `legendValueMap` (3232), `layerFilterOpts` (3314), `mapLayers` (3295). → `lib/mapLayers.ts`.
10. **Date-rank maps** `dateRank`/`visitDays` (3083, 3188, 3335 — duplicated) for sorting/filtering "Jun 22"-style string dates. → `lib/dates.ts` (or store real Date objects in DB and drop these).
11. **Form chip builders** `mkMulti(key,opts)` (3005) and `mkSingle(key,opts)` (3011) — produce `{label,bg,color,border,click}` arrays for the wizard's multi/single-select chips. → `<ChipGroup multi/>` + `<Chip>` components reading from form state.
12. **Field setters:** `sf(key)` (3040, text inputs), `mSet(key)` (3454, edit-modal drafts), `setVrf(key)` (3119, visit filters), `setAdminTab`, `setNp*`. → controlled-input `onChange` handlers / a small `useForm` hook.
13. **Toggle switches:** 5 boolean toggles (`toggleCropIns/Fpo/Contract/Dairy/Whatsapp`) each returning `{bg,pos,label}` (on `#2E7D32`/off `#BDBDBD`, knob `pos` 2↔24, label Yes/No). → one `<Toggle>` component.
14. **Edit-modal machine:** `editModal{type,entityId,title,sub}` + `editDraft`, with `openFarmerEdit/openKpiEdit/store onEdit/user onEdit`, `closeEditModal`, `saveEditModal`, `stopProp`. → `<EditModal>` with discriminated-union `type`.
15. **Cluster machine:** `openClusterModal/closeClusterModal/createCluster`, `clusterModalFarmersAll` filtering by `mapLayer`+`clusterModalLayerFilter`+`mapStoreFilter`; creating a cluster jumps to `actions` and pre-fills `newProject`. → `lib/clusters.ts` + `<ClusterModal>`.
16. **`farmerStoreMap`** (2848) — derived `{farmerId: storeId}` index; reuse wherever a farmer's store is needed.

---

## 5. DSL → REACT / TAILWIND MAPPING

| DSL construct | Meaning | React/Next + Tailwind translation |
|---|---|---|
| `{{ expr }}` | interpolate a value returned from `renderVals()` | `{expr}` in JSX. The big flat object returned by `renderVals` becomes derived values inside the component (via `useMemo` / context / props). Prefer computing per-screen rather than one giant object. |
| `onClick="{{ handler }}"` | bind a function from `renderVals` | `onClick={handler}`. These call `this.setState(...)`; translate each to a `setState`/dispatch/router action. Many are factories (e.g. `go(v)`, `setAdminTab(tab)`) — return the closure. |
| `onChange="{{ setX }}"` | controlled input change | `onChange={e => setX(e.target.value)}` (the DSL setters already take the event: `sf=key=>e=>…`). |
| `<sc-if value="{{ flag }}">…</sc-if>` | conditional render | `{flag && (<…/>)}` or early-return per screen. `hint-placeholder-*` attrs are editor hints — drop them. |
| `<sc-for list="{{ rows }}" as="r" hint-placeholder-count="N">…{{ r.x }}…</sc-for>` | list render | `{rows.map(r => (<… key={r.id ?? idx}>{r.x}</…>))}`. Provide stable keys (`id` where present). |
| `style="…{{ x }}…"` (interpolated inline style) | dynamic inline style | If value is a token → Tailwind class. If genuinely dynamic (computed hex, conic-gradient, % widths, pin positions, shadows) → keep `style={{ ... }}`. Static styles → Tailwind utilities. |
| `style-hover="background:…"` | hover override | Tailwind `hover:` variant (e.g. `hover:bg-white/8`). For dynamic hover colors use a CSS var + `hover:` or a small wrapper. |
| `style-active="transform:scale(0.97)"` | active/pressed override | `active:scale-[0.97]`. |
| `<helmet>` font/style block | global head + CSS | DM Sans via `next/font`; keyframes/`::selection`/range-input CSS in `app/globals.css` (Tailwind config already has the keyframes/animations). |
| `data-props` (top of script) | composer "tweakable" props (`primaryIdLabel` enum, `visitReasonRequired`, `requireGPS`, `defaultDistrict`) | App config/feature flags or settings table; defaults: `primaryIdLabel='Mobile Number'`, `visitReasonRequired=true`, `requireGPS=true`, `defaultDistrict='Agra'`. |

**General porting rules**
- The single flat return object of `renderVals` is a presentation viewmodel. Do **not** recreate it verbatim; split per screen and move data into the Prisma-backed data layer. Keep the *derived styling* (seg/status/avatar/visit-type colors, active-nav logic) as the shared utils in §4.
- All hardcoded demo arrays (farmers, stores, users, projects, analytics, heatmap, funnel, crops, segments, quality, ASRs, regions) → seed/import into Postgres; components receive typed data via server components / queries.
- Inline-style numeric widths/heights for bars/progress (`width:94%`, `h:Math.round(...)`) stay as inline `style` (data-driven), not Tailwind.

---

## SUMMARY (role matrix + token gaps)

- **4 personas:** regional=Rajesh Verma (RV, green→gold), officer=Raj Kumar (RK, blue), central=Dr. Anita Sharma (AS, purple), sysadmin=Vikash Mehta (VM, orange). Switching role resets to dashboard.
- **Nav matrix:** Dashboard/Visit Repo/Farmer 360/Map/Clusters/Analytics/Actions are visible to **all 4**. New Visit + Lead Pipeline = regional/officer/sysadmin (not central). Master Data + Users = central/sysadmin. Settings + Audit + Admin-Mode = **sysadmin only**. Each role gets a distinct dashboard banner and subtitle; officer's recent-visits feed is self-filtered.
- **Routing:** 16 `view` values with a canonical `titles` map (newVisit subtitle is step-driven; actions subtitle is count-driven); `masterData` is missing from `titles` (bug — supply a real title). Navigation is `setState({view,…})`; sysadmin edits overlay base data via `farmerEdits/storeEdits/userEdits` merge maps.
- **Token coverage:** brand 50/100/400/600/900/950, gold(+dark/50), seg.*, info(+light/50), purple(+light), orange(+light), ink.muted, line, shadows, fadeUp/countUp are **already covered**. **Gaps to add:** mid/dark green ramp (1B5E20, 388E3C, 66BB6A, 81C784, A5D6A7); gold/amber extras (FFA000, FFE082, FFE0B2, FFF3E0); blue banner stops (1E88E5, 0D47A1); purple ramp (4A148C, 9C27B0, 4527A0, 9575CD, E1BEE7, F3E5F5); magenta AD1457; danger C62828 + FFEBEE; teal 00695C; brown 6D4C41/8D6E63; slate 78909C; a neutral ink ramp (424242/616161/757575/BDBDBD) and surface greys (F8F8F8…E8E8E8); warm line E6E8E4; and align `ink.DEFAULT` from `#1A1A1A` to the design's `#1A1C1A`. Map-illustration earth/water tones stay component-scoped, not global tokens.
