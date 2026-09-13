# Screen Spec 13 — Farmer Clusters

Source: `webapp/docs/original-design.dc.html`, template lines 594–705; script: state 2585–2648, renderVals 2650–3808 (cluster logic 3371–3398).

---

## 1. PURPOSE & WHEN IT SHOWS

**What it is:** A read-only repository of "Farmer Clusters" — segmented groups of farmers saved from the Map View. Each cluster is a named, persisted selection (criteria + frozen farmer-id list) that can be turned into a targeted field action (Action Planner project). This screen lists existing clusters and, on selection, shows the cluster's criteria + member farmers.

**View flag:** rendered when `s.view === 'farmerCluster'` → `isFarmerCluster` (line 2685). The whole screen is wrapped in `<sc-if value="{{ isFarmerCluster }}">` (line 595). Page title/sub (line 2718): `['Farmer Clusters', 'Segmented farmer groups for targeted actions']`.

**Role-gating:** NONE. Nav item visibility is `showFarmerCluster = true` (line 2686) — visible to all four roles (regional, officer, central, sysadmin). The screen renders identically for every role. (Clusters are created in Map View, which is also `showMapView = true` for all roles.)

**Nav entry:** sidebar item at template lines 63–67, gated by `showFarmerCluster`. Active styling via `nv('farmerCluster')` → exports `navBgFC / navClFC / navWFC` (line 3514). Clicked via `goToFarmerCluster` (line 3513): `setState({view:'farmerCluster', selectedClusterDetail:null})` — note it RESETS the selected cluster on entry.

> Lines 622–634 contain dead/placeholder `<sc-if>` blocks (all render `display:none` empty divs — composer scaffolding artifacts). **Ignore them entirely in the port.** The real content is the header (599–608), empty state (611–620), and the two-column grid (637–702).

---

## 2. LAYOUT TREE (top → bottom) with Tailwind

Root wrapper (line 596): entrance animation `fadeUp 0.4s ease-out`.
```
<div className="animate-[fadeUp_0.4s_ease-out]">   // define fadeUp keyframe in globals/tailwind config
```
Page chrome (sidebar + top title bar) comes from the shared AppShell; this spec covers only the main content region.

### 2.1 Header row (lines 599–608)
```
<div className="flex items-center justify-between mb-5">
  <div>
    <div className="text-[22px] font-extrabold text-[#1A1C1A]">Farmer Clusters</div>
    <div className="text-[12.5px] text-[#9E9E9E] mt-[3px]">
      Segmented groups created from Map View selections · each cluster drives a targeted field action
    </div>
  </div>
  // Primary button (onClick = goToMapView)
  <div onClick={goToMapView}
       className="flex items-center gap-2 py-[9px] px-5 rounded-[10px] bg-[#1A3A1A] text-white text-[13px] font-bold cursor-pointer hover:bg-[#2E7D32] transition-colors">
     <PlusIcon 13x13 stroke=white sw=2 />  Create New Cluster
  </div>
</div>
```
- Plus icon SVG: 13×13, `viewBox 0 0 13 13`, two strokes forming a `+` (`M6.5 1v11 M1 6.5h11`), stroke white, width 2, round caps.
- `margin-bottom:20px` → `mb-5`.

### 2.2 Empty state (lines 611–620) — `<sc-if value="{{ hasNoCluster }}">`
Shown only when `hasNoCluster === true` (no clusters created yet — the DEFAULT, since `farmerClusters` seeds to `[]`).
```
<div className="bg-white rounded-2xl p-16 px-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] border-2 border-dashed border-[#E0E0E0]">
  // padding:64px 32px → py-16 px-8
  <div className="w-16 h-16 rounded-2xl bg-[#F0F7F0] flex items-center justify-center mx-auto mb-[18px]">
     <ClusterIcon 28x28 stroke=#2E7D32 sw=2 />   // 3 connected circles, same motif as nav icon
  </div>
  <div className="text-base font-bold text-[#1A1C1A] mb-2">No clusters yet</div>
  <div className="text-[13px] text-[#9E9E9E] max-w-[340px] mx-auto mb-[22px] leading-[1.6]">
     Go to Map View, apply a layer and store filter, then click <strong>+ New Action</strong> to create your first farmer cluster.
  </div>
  <div onClick={goToMapView}
       className="inline-flex items-center gap-2 py-[10px] px-6 rounded-[10px] bg-[#1A3A1A] text-white text-[13px] font-bold cursor-pointer hover:bg-[#2E7D32]">
     Open Map View →
  </div>
</div>
```
Empty-state icon SVG: 28×28, `viewBox 0 0 28 28`, stroke `#2E7D32` width 2 round: `<circle 8,14 r5><circle 20,8 r5><circle 20,20 r5>` + two connector lines (`12.5,12.5→15.5,9.5` and `12.5,15.5→15.5,18.5`).

> **Port note on empty state:** In the DSL the empty-state block and the two-column grid below are BOTH rendered (the grid is not guarded by `!hasNoCluster`). When `hasNoCluster` is true the grid still renders but `clusterRows` is empty (so the left column is blank) and `scName` is `''` (so the detail panel shows only its "Select a cluster" placeholder). Visually that means: **empty state card + an empty grid below it.** For a clean port, render `{hasNoCluster ? <EmptyState/> : <ClusterGrid/>}` (recommended), OR replicate faithfully by always rendering the grid. The faithful-but-ugly behavior is the empty card stacked above an empty 2-col grid. **Recommend the cleaner branch** unless pixel-for-pixel parity with the demo's empty layout is required.

### 2.3 Two-column grid (lines 637–702)
```
<div className="grid grid-cols-[1.1fr_1.6fr] gap-[18px]">
```
`grid-template-columns:1.1fr 1.6fr; gap:18px`. Left = cluster list, right = detail panel.

#### Left column — cluster list (lines 639–650)
```
<div className="flex flex-col gap-[10px]">
  {clusterRows.map(cr => (
    <div key={cr.id} onClick={cr.onClick}
         className="bg-white rounded-[14px] py-4 px-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border-[1.5px] border-[#E0E0E0] cursor-pointer transition-all duration-150
                    hover:border-[#2E7D32] hover:shadow-[0_2px_8px_rgba(46,125,50,0.1)]">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-sm font-bold text-[#1A1C1A] leading-[1.3]">{cr.name}</div>
        <div className="py-[2px] px-[9px] rounded-[20px] bg-[#E8F5E9] text-[#2E7D32] text-[10.5px] font-bold flex-none">{cr.farmerCount} farmers</div>
      </div>
      <div className="text-[11px] text-[#9E9E9E] mb-[6px]">{cr.criteriaText}</div>
      <div className="text-[10.5px] text-[#BDBDBD]">Created {cr.createdDate}</div>
    </div>
  ))}
</div>
```
- `sc-for list="{{ clusterRows }}" as="cr"`, placeholder count 3 (composer preview only).
- Card padding `16px 18px`. Border `1.5px solid #E0E0E0`; hover → border `#2E7D32`, lifted shadow.
- Note: although `cr.isSelected` is computed (line 3375), the markup does **not** use it for styling. In the port you SHOULD add a selected-state ring/border using `cr.isSelected` (recommended enhancement) since the design clearly intends a master-detail; but to be faithful to the DSL, selection is only reflected in the right-hand panel.

#### Right column — detail panel (lines 652–701)
```
<div className="bg-white rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] overflow-hidden">
```
Two states inside, driven by `scName` (truthy = a cluster is selected):

**(a) Selected detail** — `<sc-if value="{{ scName }}">` (lines 654–693):

Detail header (656–669):
```
<div className="py-5 px-[22px] pb-4 border-b border-[#F0F0F0]">
  <div className="text-[17px] font-extrabold text-[#1A1C1A] mb-[6px]">{scName}</div>
  // criteria chip row
  <div className="flex items-center gap-2 flex-wrap mb-3">
    <div className="flex items-center gap-[5px] py-1 px-3 rounded-[20px] bg-[#E8F5E9] border border-[#C8E6C9]">
       <InfoIcon 11x11 fill=#2E7D32 />   // filled circle-i glyph
       <span className="text-[11px] font-bold text-[#2E7D32]">{scCriteriaText}</span>
    </div>
    <div className="text-[11px] text-[#BDBDBD]">Created {scDate}</div>
  </div>
  // action button
  <div className="flex gap-2">
    <div onClick={goToActionFromCluster}
         className="flex-1 py-[9px] rounded-[10px] bg-[#1A3A1A] text-white text-[12.5px] font-bold cursor-pointer text-center hover:bg-[#2E7D32]">
       View Linked Action →
    </div>
  </div>
</div>
```
Info icon SVG (line 661): 11×11, `viewBox 0 0 11 11`, `fill=#2E7D32`, path is a filled circle with an "i" cut-out.

Farmer count bar (671–675):
```
<div className="py-3 px-[22px] bg-[#FAFAFA] border-b border-[#F0F0F0] flex items-center gap-[10px]">
   <PersonIcon 14x14 stroke=#2E7D32 sw=1.8 />
   <div className="text-[13px] font-bold text-[#1A1C1A]">{scFarmerCount} Farmers in this cluster</div>
</div>
```
Person icon: 14×14, `viewBox 0 0 14 14`, stroke `#2E7D32` 1.8: `<circle 7,4.5 r2.5>` + `<path M1 12.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5>`.

Farmer rows scroller (677–692):
```
<div className="max-h-[380px] overflow-y-auto py-[10px] px-[14px] flex flex-col gap-2">
  {scFarmerRows.map(sf => (
    <div key={sf.id} onClick={sf.onClick}
         className="flex items-center gap-[10px] py-[10px] px-3 rounded-[10px] border border-[#F0F0F0] cursor-pointer hover:bg-[#F5FFF5]">
      // avatar
      <div style={{background: sf.avBg}}
           className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs text-white flex-none">{sf.init}</div>
      // identity
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-[#1A1C1A]">{sf.name}</div>
        <div className="text-[11px] text-[#9E9E9E] mt-px">{sf.village} · {sf.crop} · {sf.land} acres</div>
      </div>
      // segment + last visit
      <div className="flex flex-col items-end gap-1">
        <div style={{background: sf.segBg, color: sf.segColor}}
             className="py-[2px] px-[9px] rounded-[20px] text-[10px] font-bold">{sf.segment}</div>
        <div className="text-[10px] text-[#BDBDBD]">{sf.lastVisit}</div>
      </div>
    </div>
  ))}
</div>
```
- `sc-for list="{{ scFarmerRows }}" as="sf"`, placeholder count 5.
- Avatar bg (`sf.avBg`), segment bg/color (`sf.segBg`/`sf.segColor`) are dynamic inline styles — must stay inline (computed per-row), not Tailwind classes.

**(b) "No cluster selected" placeholder** (lines 694–700):
The DSL renders a second `<sc-if value="{{ scName }}">` containing only an empty `display:none` div (dead), then an UNGUARDED placeholder:
```
<div className="py-16 px-8 text-center">
  <div className="text-[13px] text-[#BDBDBD] leading-[1.7]">Select a cluster on the left<br/>to view its farmers and criteria.</div>
</div>
```
> **Gotcha:** the placeholder at 698–700 is NOT inside any `sc-if`, so in the raw DSL it would always render — appearing even below a selected cluster's farmer list. This is almost certainly a composer artifact. **Faithful intent:** show the placeholder ONLY when `!scName` (no cluster selected). Port as `{scName ? <Detail/> : <Placeholder/>}`.

### 2.4 Token translation table
| Inline value | Token / Tailwind |
|---|---|
| `#1A3A1A` (dark green) | `--brand-900` / button base bg |
| `#2E7D32` (green) | `--brand-600` / hover, accents |
| `#1A1C1A` | `--ink-900` (primary text) |
| `#9E9E9E` | `--ink-400` (muted) |
| `#BDBDBD` | `--ink-300` (faint) |
| `#E0E0E0` | `--border` (card border, dashed) |
| `#F0F0F0` | `--border-soft` (dividers) |
| `#FAFAFA` | `--surface-2` (count bar bg) |
| `#F0F7F0` / `#E8F5E9` / `#C8E6C9` | green tints (icon bg / chip bg / chip border) |
| `#F5FFF5` | farmer row hover bg |
| radius 10/14/16/20px | `rounded-[10px]/[14px]/2xl/[20px]` (20 = pill) |
| shadow `0 1px 3px rgba(0,0,0,0.04)` | `shadow-card` |

---

## 3. DATA

### 3.1 Source state & entities
- **`s.farmerClusters: Cluster[]`** (state line 2592, seeds to `[]`). A Cluster is created in `createCluster` (line 3356–3368) with shape:
  ```ts
  Cluster = {
    id: number,                 // Date.now()
    name: string,               // draft name or "Cluster N"
    criteria: {
      layer: string,            // s.mapLayer (e.g. 'segment')
      layerLabel: string,       // currentLayerLabel2 (human label of map layer)
      layerValue: string,       // selected sub-filter ('all' | specific)
      store: string|null,       // s.mapStoreFilter (store code)
      storeName: string         // currentStoreName2 (resolved store name or "All Stores")
    },
    farmerIds: number[],        // frozen snapshot of matching farmer ids
    farmerNames: string[],
    farmerCount: number,
    createdDate: string         // hardcoded 'Jun 23' in demo
  }
  ```
- **`s.selectedClusterDetail: Cluster|null`** (state 2596) — which cluster's detail panel is open.
- **Farmer entity** (`farmers[]`, lines 2727+; with per-id overrides via `s.farmerEdits` → `farmersWithEdits`, line 2782). Fields used here: `id, name, village, crop, land, segment, lastVisit`.
- Palettes (renderVals): `avColors` (line 2779, 8 hex), `segColors`/`segBgs` (lines 2725–2726, keyed by segment label).

### 3.2 Derived view bindings (renderVals 3371–3392)
| Binding | Source / formula |
|---|---|
| `isFarmerCluster` | `s.view === 'farmerCluster'` (2685) |
| `hasNoCluster` | `s.farmerClusters.length === 0` (3378) |
| `clusterRows` | `s.farmerClusters.map(...)` (3372). Each row = `{...cl,` `criteriaText`, `isSelected`, `onClick}` |
| `cr.name` | `cl.name` |
| `cr.farmerCount` | `cl.farmerCount` |
| `cr.criteriaText` | `cl.criteria.layerLabel + (layerValue!=='all' ? ': '+layerValue : '') + ' · ' + cl.criteria.storeName` (3374) |
| `cr.createdDate` | `cl.createdDate` (e.g. "Jun 23") |
| `cr.isSelected` | `selectedClusterDetail?.id === cl.id` (3375) — computed, unused in markup |
| `selectedCluster` | `s.selectedClusterDetail` (3379) |
| `scFarmers` | `selectedCluster ? farmersWithEdits.filter(f => selectedCluster.farmerIds.includes(f.id)) : []` (3380) |
| `scName` | `selectedCluster?.name ?? ''` (3387) — used as the "is a cluster selected" flag |
| `scCriteriaText` | `layerLabel + (layerValue!=='all' ? ' : '+layerValue : '') + '  ·  ' + storeName` (3388). NB: detail uses `' : '` (spaces) and `'  ·  '` (double-spaced dot) vs list row's `': '`/`' · '` — slightly different spacing; preserve both. |
| `scDate` | `selectedCluster?.createdDate ?? ''` (3389) |
| `scFarmerCount` | `scFarmers.length` (3390) |
| `scFarmerRows` | `scFarmers.map(...)` (3381). Each = `{...f,` `init`, `avBg`, `segBg`, `segColor`, `onClick}` |
| `sf.init` | initials: `f.name.split(' ').map(n=>n[0]).join('')` |
| `sf.avBg` | `avColors[farmersWithEdits.indexOf(f) % avColors.length]` (color cycles by global farmer index) |
| `sf.name / sf.village / sf.crop / sf.land` | farmer fields |
| `sf.segment` | `f.segment` |
| `sf.segBg / sf.segColor` | `segBgs[f.segment] ?? '#F5F5F5'` / `segColors[f.segment] ?? '#757575'` |
| `sf.lastVisit` | `f.lastVisit` (e.g. "Jun 18") |

### 3.3 sc-for / sc-if summary
- **sc-for** `clusterRows` (left list) → over `s.farmerClusters`.
- **sc-for** `scFarmerRows` (detail) → over `farmersWithEdits` filtered to `selectedCluster.farmerIds`.
- **sc-if** `isFarmerCluster` (whole screen), `hasNoCluster` (empty state), `scName` (detail vs placeholder).

---

## 4. INTERACTIONS

| Element | Handler | Effect |
|---|---|---|
| Header "Create New Cluster" btn (604) | `goToMapView` = `go('mapView')` (3560) → `setState({view:'mapView', step:0, selectedFarmer:null})` | Navigate to Map View (where clusters are actually created). |
| Empty-state "Open Map View →" (618) | `goToMapView` | Same as above. |
| Cluster list card (641) | `cr.onClick` = `setState({selectedClusterDetail: cl})` (3376) | Select this cluster → right detail panel populates. No navigation. |
| Detail "View Linked Action →" (667) | `goToActionFromCluster` (3392) = `setState({view:'actions', clusterSource:selectedCluster||null, showNewProject:false})` | Navigate to Action Planner with this cluster set as `clusterSource` (Action Planner shows a "from cluster" source badge — see `clusterSourceName/Count`, 3395–3398). Does NOT auto-open the new-project form (`showNewProject:false`). |
| Farmer row (680) | `sf.onClick` = `setState({view:'farmerDetail', selectedFarmer:f})` (3385) | Navigate to Farmer 360 profile for that farmer. |
| Sidebar "Farmer Clusters" nav (64) | `goToFarmerCluster` (3513) = `setState({view:'farmerCluster', selectedClusterDetail:null})` | Enter screen; clears any previously selected cluster (detail resets to placeholder). |

**Cluster creation (context, not on this screen):** happens in Map View via `openClusterModal`/`createCluster` (3351–3368). `createCluster` appends to `farmerClusters`, closes the modal, sets `clusterSource` to the new cluster, switches `view:'actions'`, and opens a pre-filled new project (`showNewProject:true`, title `"<name> — Field Action"`). So a freshly created cluster lands the user in Action Planner, not here — this screen is the later "browse/revisit" surface.

---

## 5. ROLE DIFFERENCES, EMPTY STATES, DYNAMIC STYLING

- **Roles:** none. All four personas see the identical screen and all controls. (No `R`-based gating anywhere in this slice.)
- **Empty state:** when `hasNoCluster` (default, since seed = `[]`) → dashed empty card with CTA to Map View. With the demo seed never pre-populating clusters, **this is the state a fresh session always shows.** Clusters only appear after the user creates one in Map View.
- **No-selection state:** when no cluster selected (`!scName`) → detail panel shows the centered "Select a cluster on the left…" placeholder.
- **Dynamic styling (hover):**
  - Buttons (`#1A3A1A` → hover `#2E7D32`).
  - Cluster card: hover `border-color:#2E7D32` + shadow `0 2px 8px rgba(46,125,50,0.1)` + `transition:all 0.15s`.
  - Farmer row: hover `background:#F5FFF5`.
  - Sidebar nav active state via `nv('farmerCluster')` (bg `rgba(255,255,255,0.12)`, color `#fff`, weight 600 when active).
- **Per-item dynamic inline styles (must stay inline, computed):** avatar `sf.avBg`, segment pill `sf.segBg`/`sf.segColor`. The list pill is a static green tint (`#E8F5E9`/`#2E7D32`).

---

## 6. PORT NOTES (React / Next.js)

**Component split:**
- `FarmerClustersScreen` (route content) — owns `selectedClusterDetail` (local state or URL param `?cluster=<id>`), reads cluster list.
- `ClusterListCard` (props: `cluster`, `selected`, `onSelect`) — render `name`, `farmerCount` pill, `criteriaText`, `createdDate`. Add selected ring using `selected` (enhancement over DSL).
- `ClusterDetailPanel` (props: `cluster | null`, `farmers`) — header (name, criteria chip, date, "View Linked Action" btn), count bar, scrollable farmer list. When `null`, render `ClusterEmptyHint`.
- `ClusterFarmerRow` (props: `farmer`, `avatarBg`) — avatar/initials, name, `village · crop · land acres`, segment pill, lastVisit.
- `ClustersEmptyState` (CTA → Map View).

**Data hooks:**
- `useClusters()` → list of saved clusters (Prisma `Cluster` table: `id, name, criteriaLayer, criteriaLayerLabel, criteriaLayerValue, criteriaStoreCode, criteriaStoreName, farmerIds (or join table ClusterFarmer), farmerCount, createdAt`). The demo's `criteria` blob → either a JSON column or discrete columns.
- `useCluster(id)` → cluster + its farmers (resolve `farmerIds` → Farmer rows joined; apply any farmer edits the same way `farmersWithEdits` overlays `farmerEdits`).
- Compute `criteriaText` / `scCriteriaText` as a pure helper (mind the two spacing variants — list uses `: ` / ` · `, detail uses ` : ` / `  ·  `; either unify or keep both to match the original).
- `init`, `avBg` (cycle by farmer index), `segBg/segColor` (lookup by segment, with fallbacks `#F5F5F5`/`#757575`) are presentation helpers — put in a shared `farmerPresentation.ts` (reused by Map View, Farmer 360, etc.).

**Navigation:**
- "Create New Cluster" / "Open Map View" → route to `/map`.
- "View Linked Action →" → route to `/actions` passing the cluster as source (query param `?clusterSource=<id>` or a store/context). The Action Planner reads it to show the source badge and pre-fill a new project. NB the DSL sets `showNewProject:false` here (just navigate with source set, don't auto-open form) — different from the Map View path which sets `showNewProject:true`.
- Farmer row → `/farmers/<id>` (Farmer 360 detail).

**Gotchas:**
1. `farmerClusters` is **ephemeral demo state** (empty on load); in production clusters persist in DB. Seed/migration needs a `Cluster` table; otherwise the screen is always the empty state.
2. `farmerIds` is a **frozen snapshot** at creation — farmers added/removed later don't change the cluster (matches `farmerIds.includes`). Preserve this (snapshot semantics, not a live re-query of criteria) unless product wants live clusters.
3. `createdDate` is a hardcoded string `'Jun 23'` in the demo — use real `createdAt` formatted to "MMM D".
4. Ignore the dead `<sc-if>`/`display:none` scaffolding at lines 622–634 and 694–696, and the unguarded placeholder at 698–700 — gate it on `!cluster` in the port.
5. The cluster card hover and "selected" visuals: DSL only shows selection in the right panel; add an active card style keyed off `cr.isSelected` for better UX.
6. Avatar/segment colors are inline-computed; keep them as inline `style` (not static Tailwind) because they're data-driven.
7. `criteria.layerValue === 'all'` suppresses the `: value` suffix in the criteria text — replicate that conditional.

---

## SUMMARY (3–5 lines)
Farmer Clusters (`view==='farmerCluster'`, visible to all roles) is a master-detail repository of saved Map-View selections: a left list of `clusterRows` (over `s.farmerClusters`, each showing name, farmer-count pill, criteria text, created date) and a right detail panel keyed on `selectedClusterDetail` showing the cluster's criteria chip, member count, and a scrollable list of its farmers (`scFarmerRows` = `farmersWithEdits` filtered by the cluster's frozen `farmerIds`, each row → Farmer 360 on click). Primary actions navigate to Map View (create) and Action Planner (turn cluster into a field action via `clusterSource`). Data deps: `Cluster` entity (name/criteria/farmerIds/farmerCount/createdDate), `Farmer` (name/village/crop/land/segment/lastVisit) with `farmerEdits` overlay, plus `avColors`/`segColors`/`segBgs` presentation palettes. Default/seed state is empty → dashed empty-state card with a "Open Map View" CTA.
