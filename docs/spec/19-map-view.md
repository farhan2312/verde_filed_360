# Screen Spec 19 — Map View

> Source: `webapp/docs/original-design.dc.html` template lines **1459–1748**, script `renderVals()` lines **3177–3578** (+ shared data 2727–2850, state 2585–2648).

---

## 1. PURPOSE & WHEN IT SHOWS

An illustrative geographic map of registered farmers across UA's UP store network. Farmers are plotted as colored pins; the pin color encodes one of five selectable **layers** (Segment / Crop / Last Visited / Issues / Lead Status). Stores can be overlaid as square pins, and a **Store Filter** dims pins outside the selected store's farmer set. Clicking a pin opens a right-hand **Farmer Detail panel**. The primary CTA is **New Action → Create Farmer Cluster** modal, which captures the current layer/store criteria into a saved cluster and hands off to the Action Planner.

- **Shows when** `state.view === 'mapView'`. Template gate `<sc-if value="{{ isMapView }}">`; `isMapView = (s.view === 'mapView')` (line 2684).
- **Navigated to** via the sidebar item wired to `goToMapView = go('mapView')` (line 3560). `go(v)` resets `{ view, step:0, selectedFarmer:null }`.
- **Role-gating:** NONE for visibility. `showMapView = true` unconditionally (line 2703) — the nav item is shown for **all four roles** (regional, officer, central, sysadmin). There are no role-conditional branches inside the screen itself; every role sees the identical map. (Contrast with screens gated by `showNewVisit`/`showLeads`/`showUsers`.)
- Header title bar (rendered by the shared chrome, not this slice): `['Map View', 'Farmer locations · Agra District & surrounding']` (line 2717). Note the subtitle text says "Agra District" but the demo store/farmer data is actually Barabanki / Amethi / Raebareli / Lakhimpur Kheri — the illustrative SVG basemap is hard-coded with Agra-area town labels.

---

## 2. LAYOUT TREE (top → bottom)

Root: `<div>` with entrance animation `animation:fadeUp 0.4s ease-out` → Tailwind `animate-[fadeUp_0.4s_ease-out]` (define `fadeUp` keyframes once, mirroring other screens).

### 2a. Layer Controls Bar (line 1464)
`flex items-center gap-2 mb-2.5 flex-wrap` (`gap:8px; margin-bottom:10px`).
- Label chip: text "Farmer Layer:" — `text-[10.5px] font-bold uppercase tracking-[0.8px] text-[#9E9E9E] mr-1 flex-none`.
- `sc-for` over **`mapLayers`** (5 items) → layer pill:
  - `px-3.5 py-1.5 rounded-[20px] text-[12px] font-semibold cursor-pointer border-[1.5px] flex items-center gap-1.5 transition-all`
  - Dynamic: `background:{{ml.bg}}; color:{{ml.color}}; border-color:{{ml.border}}`.
  - `style-hover="opacity:0.85"` → `hover:opacity-85`.
  - Leading swatch: `w-2 h-2 rounded-[2px]` filled `{{ml.swatch}}` (the layer's representative color, static per layer).
  - Trailing text `{{ml.label}}`.
- Right-aligned count: `ml-auto text-[12px] text-[#9E9E9E] font-medium` → `{{mapFarmerCount}} farmers · {{storeCount}} stores`.

### 2b. Store Filter Bar (line 1475)
`flex items-center gap-2 mb-4 flex-wrap`.
- Label chip "Store Filter:" — same style as Farmer Layer label.
- `sc-for` over **`storeFilterPills`** (7 = "All Stores" + 6 stores) → pill:
  - `px-3.5 py-1.5 rounded-[20px] text-[11.5px] font-semibold cursor-pointer border-[1.5px] flex items-center gap-1.5 transition-all`, dynamic `background/color/border` from `sp.bg/sp.color/sp.border`, `hover:opacity-[0.82]`.
  - Leading dot: `w-[7px] h-[7px] rounded-[1px]` filled `{{sp.dot}}` (store color; absent for "All Stores" pill), `active:scale-[0.97]`.
  - Text `{{sp.label}}`.
- "Store Pins" toggle (right, `ml-auto`): `px-3.5 py-1.5 rounded-[20px] text-[11.5px] font-semibold cursor-pointer bg-[#F5F5F5] text-[#616161] border-[1.5px] border-[#E0E0E0] flex items-center gap-1.5`, `hover:bg-[#EEEEEE]`. Inline lock/box SVG icon (12×12) + label "Store Pins". onClick `toggleStores`. (Static styling — it does not visually reflect on/off state; it just toggles.)

### 2c. Sub-header + New Action button (line 1490)
`flex items-center justify-between mb-3.5` (`14px`).
- Left summary text `text-[12px] text-[#9E9E9E]`: bold `{{mapFarmerCount}}` + " farmers · Layer: " + bold `{{mapActiveLayerLabel}}` (bold spans `font-semibold text-[#1A1C1A]`).
- Right CTA "New Action": `flex items-center gap-2 px-5 py-[9px] rounded-[10px] bg-[#1A3A1A] text-white text-[13px] font-bold cursor-pointer shadow-[0_2px_8px_rgba(26,58,26,0.25)]`, `hover:bg-[#2E7D32]`. Inline plus SVG. onClick `openClusterModal`.

### 2d. Cluster Modal (line 1501, gated `<sc-if value="{{ showClusterModal }}">`)
Overlay: `fixed inset-0 bg-black/45 z-[200] flex items-center justify-center`, onClick `closeClusterModal` (backdrop dismiss). Dialog: `bg-white rounded-[18px] w-[540px] max-h-[80vh] overflow-hidden flex flex-col shadow-[0_24px_64px_rgba(0,0,0,0.22)]`, onClick `stopPropagation`.
- **Header** (`p-[22px_26px_18px] border-b border-[#F0F0F0]`): title "Create Farmer Cluster" (`text-[17px] font-extrabold text-[#1A1C1A]`) + close ✕ button (`w-[30px] h-[30px] rounded-[8px] bg-[#F5F5F5] ... text-[16px] text-[#757575]`, hover `#EEEEEE`, onClick `closeClusterModal`). Sub-line `text-[12px] text-[#9E9E9E]`: "Current view: " + bold `{{currentLayerLabel2}}` + " · " + bold `{{currentStoreName2}}` (bold spans `font-semibold text-[#616161]`).
- **Body** (`p-[18px_26px_0]`):
  - Label "Cluster Name" (`text-[11px] font-bold uppercase tracking-[0.7px] text-[#9E9E9E] mb-[7px]`).
  - Text input: `w-full px-3.5 py-[11px] border-[1.5px] border-[#E0E0E0] rounded-[10px] text-[14px] outline-none box-border`, placeholder "e.g. High Value Wheat Farmers — June 2026". value `{{clusterDraftName}}`, onChange `setClusterDraftName`.
  - Label "Narrow by {{currentLayerLabel2}}" (`mt-4`, same label style).
  - `<select>` (`w-full px-3.5 py-2.5 border-[1.5px] border-[#E0E0E0] rounded-[10px] text-[13px] bg-white`), value `{{clusterModalLayerFilter}}`, onChange `setClusterModalLayerFilter`; options `sc-for` over **`clusterLayerOpts`** → `<option value="{{opt.value}}">{{opt.label}}</option>`.
  - Criteria badge (`mt-3.5 px-3.5 py-2.5 bg-[#F0F7F0] rounded-[10px] border border-[#C8E6C9] flex items-center gap-2`): green check SVG + text `text-[12px] text-[#2E7D32] font-semibold` "{{clusterModalCount}} farmers selected · criteria will be saved with this cluster".
  - **Selected Farmers list** (`flex-1 overflow-y-auto p-[14px_26px]`): label "Selected Farmers" + `flex flex-col gap-2`; `sc-for` over **`clusterModalFarmerRows`** → row card `flex items-center gap-2.5 px-3 py-[9px] bg-[#FAFAFA] rounded-[10px] border border-[#F0F0F0]`:
    - Avatar `w-8 h-8 rounded-full` bg `{{mf.avBg}}`, white bold initials `{{mf.init}}`.
    - Middle: name `text-[13px] font-semibold text-[#1A1C1A]`; sub `text-[11px] text-[#9E9E9E]` = `{{mf.village}} · {{mf.crop}}`.
    - Segment chip `px-[9px] py-0.5 rounded-[20px] text-[10px] font-bold` bg `{{mf.segBg}}` color `{{mf.segColor}}` → `{{mf.segment}}`.
- **Footer** (`p-[16px_26px] border-t border-[#F0F0F0] flex gap-2.5`):
  - Cancel: `flex-1 py-[11px] rounded-[10px] border-[1.5px] border-[#E0E0E0] text-[13px] font-semibold text-[#757575] text-center`, hover `#F5F5F5`, onClick `closeClusterModal`.
  - Save: `flex-[2] py-[11px] rounded-[10px] bg-[#1A3A1A] text-white text-[13px] font-bold text-center flex items-center justify-center gap-2`, hover `#2E7D32`. Plus SVG + "Save Cluster & Plan Action". onClick `createCluster`.

### 2e. Map Container (line 1563)
`flex bg-white rounded-[14px] shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-black/[0.04] overflow-hidden mb-3.5`. Two columns:

**Map area (left, `flex-1 relative h-[564px] overflow-hidden min-w-0`):**
- **Static SVG basemap** (lines 1569–1632): `absolute inset-0 w-full h-full`, `viewBox="0 0 900 564" preserveAspectRatio="xMidYMid slice"`. Hard-coded illustrative content — agricultural field rects (`#E4EDD8`), Yamuna river path (`#B8D8EA`/`#CCE8F5`), urban blocks (`#DDD8CE`), NH2 + several inter-town roads (`#C0B8A8` w/ white centerline), town labels (Agra/Mathura/Firozabad/Mainpuri/Etah, font `DM Sans`), river label (rotated), scale bar "0 … 20 km", compass "N", attribution "UA Field Intel · Illustrative map". **All static — copy verbatim as an inline SVG asset/component.**
- **Farmer Pins** (`sc-for` over **`mapPins`**, line 1635): each `absolute` positioned `left:{{pin.left}}; top:{{pin.top}}; transform:translate(-50%,-50%)`, `cursor-pointer`, `z-index:{{pin.zIndex}}`, `transition-all`, `opacity:{{pin.opacity}}`; `style-hover` → `hover:scale-[1.15]` (combined with the translate). Inner circle `w/h = {{pin.size}}px`, `rounded-full`, bg `{{pin.color}}`, border `{{pin.border}}`, box-shadow `{{pin.shadow}}`, centered white initials `{{pin.init}}` at `{{pin.fontSize}}px`. Below: a small CSS triangle "tail" (`border-top:8px solid {{pin.color}}`, opacity 0.9). onClick `{{pin.onClick}}`.
- **Store Pins** (`<sc-if value="{{ showStorePinsVal }}">` then `sc-for` over **`storePins`**, line 1644): each `absolute` at `{{sp.left}}/{{sp.top}}`, `z-index:{{sp.zIndex}}`, `hover:scale-[1.1]`. Body = rounded square `w-9 h-9 rounded-[8px]` bg `{{sp.color}}`, border `{{sp.borderWidth}} solid white`, shadow `{{sp.shadow}}`, contains a white store-front SVG + tiny `{{sp.code}}` label (`text-[7px] font-extrabold`). Triangle tail below. Tooltip `absolute bottom-[52px] left-1/2 -translate-x-1/2 bg-black/[0.92] text-white text-[10px] font-semibold px-[9px] py-1 rounded-[6px] whitespace-nowrap pointer-events-none opacity-0` → `group-hover:opacity-100` showing `{{sp.name}}`. onClick `{{sp.onClick}}`.

**Farmer Detail panel (right, `<sc-if value="{{ showMapPanel }}">`, line 1663):** `w-[284px] flex-none border-l border-[#F0F0F0] bg-white overflow-y-auto h-[564px] flex flex-col`.
- Header (`p-[16px_18px] border-b border-[#F5F5F5] flex items-center justify-between`): "Farmer Details" (`text-[13.5px] font-bold`) + round close button (`w-[26px] h-[26px] rounded-full bg-[#F5F5F5]`, hover `#EEEEEE`, X SVG) onClick `closeMapPanel`.
- Profile (`p-[18px] flex-1`):
  - Avatar `w-11 h-11 rounded-full` bg `{{mapSelAvBg}}` initials `{{mapSelInit}}`; name `text-[14.5px] font-bold` `{{mapSelName}}`; sub `text-[11px] text-[#9E9E9E]` = `{{mapSelVillage}}, {{mapSelDistrict}}`.
  - **Field rows** table card (`border border-[#F0F0F0] rounded-[10px] overflow-hidden`), 6 rows, each `flex justify-between px-3 py-[9px]`, odd rows `bg-[#FAFAFA]`, bottom borders `#F8F8F8`. Label `text-[11.5px] text-[#9E9E9E]`, value `text-[11.5px] font-semibold text-[#1A1C1A]`:
    1. Mobile → `{{mapSelMobile}}`
    2. Crop → `{{mapSelCrop}}`
    3. Land → `{{mapSelLand}} acres`
    4. Segment → `{{mapSelSegment}}` (value color = `{{mapSelSegColor}}`, font-bold)
    5. Status → `{{mapSelStatus}}` (value `text-[#2E7D32]`)
    6. Last Visit → `{{mapSelLastVisit}}`
  - **Active layer highlight** (`px-3.5 py-3 rounded-[10px] bg-[#F5F7F5] mb-3.5`): tiny uppercase label `{{mapSelLayerLabel}}`; row with `w-3.5 h-3.5 rounded-[4px]` swatch bg `{{mapSelLayerColor}}` + `text-[13.5px] font-bold` `{{mapSelLayerValue}}`.
  - CTA "View Full Profile →": `py-[11px] rounded-[10px] bg-[#2E7D32] text-white text-[12.5px] font-semibold text-center`, hover `#1B5E20`, active `scale-[0.97]`. onClick `viewFarmerDetail`.

### 2f. Legend Bars (line 1721)
`flex gap-3 flex-wrap`. Two equal cards (`flex-1 min-w-[300px] bg-white rounded-[12px] px-[18px] py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] flex items-center gap-1.5 flex-wrap`):
- **Farmer legend:** label "👤 {{mapActiveLayerLabel}}" then `sc-for` over **`mapLegendItems`** → clickable chip `flex items-center gap-1.5 px-[9px] py-[3px] rounded-[20px] bg-[#F5F5F5] cursor-pointer`, `hover:bg-[#E8F5E9] hover:outline hover:outline-[1.5px] hover:outline-[#A5D6A7]`. Dot `w-[9px] h-[9px] rounded-full` bg `{{li.color}}`; `{{li.label}}`; count `({{li.count}})`. onClick `{{li.onClick}}`.
- **Store legend:** label "🏪 Stores" then `sc-for` over **`storePins`** → non-clickable chip with square dot `rounded-[2px]` bg `{{sp.color}}`; `{{sp.name}}`; count `({{sp.farmerCount}})`.

> **Color token mapping** (HTML hex → suggested Tailwind tokens): `#1A3A1A` = brand-deep-green (selected pill / CTA bg); `#2E7D32` = brand-green (hover / high-value); `#1565C0` = blue (medium value); `#F57F17`/`#E65100` = amber/orange; `#7B1FA2` = purple; `#C62828` = red; `#9E9E9E`/`#757575`/`#616161` = grey scale text; `#F5F5F5`/`#FAFAFA`/`#F0F7F0` = surface tints; `#E0E0E0`/`#F0F0F0` = borders. Keep these in the shared token map already used by sibling screens.

---

## 3. DATA — every value → entity/field

All map data derives from two demo arrays + state. **Entities:** Farmer, Store; derived: Cluster (created here).

### Source arrays
- **`farmers`** (12 records, lines 2727–2776) — fields used here: `id, name, mobile, village, district, crop, land, status, segment, storeCode, issues[]` (lat/lng/sales/visitLog also present but unused by map). **NOTE:** farmers have **no `lastVisit` field** in the demo data → see Last Visited layer caveat below.
- **`baseStores`** (6 records, lines 2790–2845) — fields used: `id, code, name, shortName, district, lat, lng, left, top, color, status, farmerIds[], farmerCount, officers[]`.
- `farmerStoreMap` (line 2848): `{ farmerId → storeId }` built from each store's `farmerIds`.
- `storesWithEdits` / `farmersWithEdits`: base arrays merged with `state.storeEdits` / `state.farmerEdits` (sysadmin in-place edits applied; map reflects edited names/colors/etc).

### `mapLayers` (line 3295) — 5 layer pills
Static `{key,label,swatch}`: `segment`/"Farmer Segment"/`#2E7D32`, `crop`/"Crop"/`#F9A825`, `lastVisit`/"Last Visited"/`#E65100`, `issues`/"Issues & Concerns"/`#C62828`, `leadStatus`/"Lead Status"/`#7B1FA2`. Per-pill `bg/color/border` computed from `state.mapLayer===key` (selected = `#1A3A1A`/white/`#1A3A1A`, else white/`#616161`/`#E0E0E0`). `onClick` sets `mapLayer:key`.

### `mapPins` (line 3208) — one per farmer
`farmersWithEdits.map`. Position from static **`pinPositions`** (line 3178, 12 fixed `{id,left%,top%}`; fallback 50%/50%). Fields: `init` (name initials), `color = colorFn(f)` where `colorFn = layerColorFn[state.mapLayer]` (line 3189-3195, maps the active layer's field → hex), `size` 40 if selected else 30, `fontSize` 12/10, `border` 3.5/2.5px white, `shadow` heavy/light, `zIndex` 20/10, `opacity` = `inFilter ? 1 : 0.18` (dimmed when a store filter excludes it). `inFilter = !mapStoreFilter || farmerStoreMap[id]===mapStoreFilter`.
- **`layerColorFn.segment`**: `f.segment` → High Value `#2E7D32`, Medium `#1565C0`, New/Low `#F57F17`, Dormant `#9E9E9E`.
- **`.crop`**: `f.crop` → Wheat `#F9A825`, Rice/Paddy `#66BB6A`, Sugarcane `#2E7D32`, Potato `#8D6E63`, Mustard/Millets/Barley variants.
- **`.lastVisit`**: `visitDays[f.lastVisit] ?? 30` then bucket ≤7 green / ≤14 amber / ≤30 orange / else red. **Caveat:** demo farmers have no `lastVisit`, so all resolve to 30 → orange `#E65100` and bucket ">30 days"… wait, 30 → "15–30 days". (Default 30 maps to `d<=30` → `#E65100` "15–30 days".) Effectively this layer is uniform in the demo.
- **`.issues`**: `farmerIssueMap[f.id]` (= first element of `f.issues[]`, else 'None') → mapped to colors; but the color map keys (`Pest Infestation`, `Disease Infection`, etc.) **do not match** the actual demo issue strings (`Moisture stress`, `Weed pressure`, `Fungal disease`…) so unmatched issues fall through to `None`/`#2E7D32` (green). Tricky data mismatch — see Port Notes.
- **`.leadStatus`**: `f.status` → New `#2E7D32`, Contacted `#1565C0`, Follow-up `#E65100`, Converted `#7B1FA2`, Lost `#757575`.

### `storePins` (line 3247) — one per store
`storesWithEdits.map`: `left/top` (static %), `color`, `code`, `name`, `farmerCount = farmerIds.length` (**= number of plotted farmers in that store, NOT the large `farmerCount` field like 6582**), `borderWidth` 3px if selected else 2px, `shadow` (ring if selected), `zIndex` 25/15. `onClick` toggles `mapStoreFilter` between this store id and null (and clears `selectedMapFarmer`).

### `storeFilterPills` (line 3263)
"All Stores" pill (id:null) + one per store. Label = store name with suffixes stripped ("Agri Store"/"Kisan Center"/etc — note demo store names don't contain those suffixes so labels = full names). Selected styling uses the store's own `color`.

### Counts & labels
- `mapFarmerCount = mapPins.length` (=12, all farmers; **note: NOT filtered by store** — store filter only dims via opacity, it does not remove pins from the count).
- `storeCount = storeRows.length` (=6).
- `mapActiveLayerLabel = currLegend.label` (e.g. "Farmer Segment", "Main Crop", "Last Visited", "Issues & Concerns", "Lead Status").
- `currentLayerLabel2` (line 3309) = `layerLabelMap[mapLayer]` ("Farmer Segment"/"Crop Type"/"Last Visited"/"Issues & Concerns"/"Lead Status") — used in modal header & "Narrow by …". (Slightly different label set than `currLegend.label`.)
- `currentStoreName2` = selected store's `name`, else "All Stores".

### `mapLegendItems` (line 3239)
`currLegend.items` (static per-layer legend from `legendMeta`, line 3222) each augmented with `count` = number of currently-plotted pins of that `color` (`colorCounts`), and `onClick`. **Filtered to `count>0`** — zero-count legend entries are hidden (empty-state behavior). `legendMeta` per layer:
- segment: High Value/Medium Value/New/Low/Dormant
- crop: Wheat/Sugarcane/Rice-Paddy/Potato/Mustard/Millets/Barley
- lastVisit: Within 7 days / 8–14 / 15–30 / >30
- issues: Pest/Disease/Irrigation/Nutrient/Weed/None
- leadStatus: New/Contacted/Follow-up/Converted/Lost

### Cluster modal data
- `clusterLayerOpts` (line 3321): from `layerFilterOpts[mapLayer]` (`['all', …values]`), first option labeled "All — {layerLabel}". crop options derived dynamically from `new Set(farmers.crop)`.
- `clusterModalFarmersAll` (line 3325): `farmersWithEdits` filtered by (a) store match (if `mapStoreFilter` set) **and** (b) `clusterModalLayerFilter` value matched against the active layer's field (segment/crop/leadStatus exact; issues Active/No; lastVisit by `dRank` buckets — again unreliable since farmers lack `lastVisit`, so most rank 99 → "Older").
- `clusterModalFarmerRows` (line 3343): the above with `init`, `avBg` (from `avColors` by index), `segBg`/`segColor` (from `segBgs`/`segColors`).
- `clusterModalCount = clusterModalFarmersAll.length`.

### Farmer detail panel (selected pin)
`selMapF = farmersWithEdits.find(id === state.selectedMapFarmer.id)` (re-resolved so edits apply). `showMapPanel = !!selMapF`. Values: `mapSelName/Village/District/Mobile/Crop/Land/Segment/Status` from farmer fields; `mapSelLastVisit = selMapF.lastVisit` (**empty string in demo**); `mapSelSegColor` from `segColMap`; `mapSelAvBg` from `avC2[index]`; `mapSelInit` initials; `mapSelLayerLabel = currLegend.label`; `mapSelLayerValue = getLayerValue(selMapF, mapLayer)` (line 3196 — returns the human-readable layer value e.g. segment string, crop, "15–30 days", issue name, status); `mapSelLayerColor = colorFn(selMapF)`.

---

## 4. INTERACTIONS

| Trigger | Handler (line) | Effect |
|---|---|---|
| Click layer pill | `mapLayers[].onClick` (3305) | `setState({mapLayer:key})` → recolors all pins, swaps legend, changes panel layer value/color, changes modal "Narrow by" options. |
| Click store filter pill | `storeFilterPills[].onClick` (3265/3271) | "All Stores" → `mapStoreFilter:null`. Store pill → toggle id↔null + `selectedMapFarmer:null`. Pins outside store dim to opacity 0.18. |
| Click "Store Pins" toggle | `toggleStores` (3273) | Flips `showStorePins` → shows/hides store pin overlay (`showStorePinsVal`). |
| Click a farmer pin | `mapPins[].onClick` (3219) | If `inFilter` (or no store filter): `setState({selectedMapFarmer:f})` → opens right panel. Dimmed (filtered-out) pins are non-selecting. |
| Click a store pin | `storePins[].onClick` (3259) | Same as the matching store filter pill — toggle `mapStoreFilter`, clear selected farmer. |
| Click legend chip (farmer legend) | `mapLegendItems[].onClick` (3243) | Opens cluster modal pre-seeded: `showClusterModal:true, clusterDraftName:'', clusterModalLayerFilter:layerVal` where `layerVal` is derived from the clicked legend item (via `legendValueMap`). I.e. "create a cluster of exactly this legend bucket". |
| Click "New Action" | `openClusterModal` (3351) | `setState({showClusterModal:true, clusterDraftName:'', clusterModalLayerFilter:'all'})`. |
| Backdrop / ✕ / Cancel | `closeClusterModal` (3352) | `showClusterModal:false`. |
| Modal inner click | `stopPropagation` (3472) | Prevents backdrop dismiss. |
| Cluster name input | `setClusterDraftName` (3353) | `clusterDraftName = e.target.value`. |
| "Narrow by" select | `setClusterModalLayerFilter` (3354) | `clusterModalLayerFilter = e.target.value` → re-filters preview list & count. |
| "Save Cluster & Plan Action" | `createCluster` (3356) | Builds cluster `{id:Date.now(), name (or "Cluster N"), criteria:{layer,layerLabel,layerValue,store,storeName}, farmerIds, farmerNames, farmerCount, createdDate:'Jun 23'}`; then `setState({ farmerClusters:[...prev,cluster], showClusterModal:false, clusterDraftName:'', clusterSource:cluster, view:'actions', showNewProject:true, newProject:{ title:name+' — Field Action', owner:persona.name, due:'', group:name } })`. **Navigates away to Action Planner** with a pre-filled New Project drawer sourced from this cluster. |
| Panel close button | `closeMapPanel` (3566) | `selectedMapFarmer:null`. |
| "View Full Profile →" | `viewFarmerDetail` (3567) | If a farmer is selected: `setState({view:'farmerDetail', selectedFarmer:selMapF})` → navigates to Farmer 360 detail. |

---

## 5. ROLE DIFFERENCES / EMPTY STATES / DYNAMIC STYLING

- **Roles:** None inside this screen. Identical for all roles. (Only the `persona.name` written into the new project owner by `createCluster` differs by role.)
- **Empty states:** Farmer Detail panel hidden until a pin is selected (`showMapPanel`). Cluster modal preview list shows whatever matches the filter — if filter yields zero, the list is empty (no explicit "no results" message). Legend chips with `count===0` are hidden (filtered out). Store pins hidden when `showStorePins===false`.
- **Dynamic styling:**
  - Selected farmer pin grows (40px vs 30px), thicker white border, heavier shadow, higher z-index, larger font.
  - Store-filter dimming: non-matching farmer pins drop to `opacity:0.18` and their tap is suppressed.
  - Selected store pin: thicker border (3px), ring shadow, z-25.
  - Hover: layer pills `opacity 0.85`, store pills `0.82`, farmer pin `scale(1.15)` (preserving the `-50%,-50%` translate — must compose both transforms), store pin `scale(1.1)`, store pin tooltip fades in (`opacity 0→1` — implement as group-hover), CTA hover bg shifts, legend chip hover green outline.
  - Active: store-pill dot and "View Full Profile" CTA `scale(0.97)`.
  - The compound `transform:translate(-50%,-50%) scale(...)` is the only real gotcha — in Tailwind use an absolute-centered wrapper with `[transform:translate(-50%,-50%)] hover:[transform:translate(-50%,-50%)_scale(1.15)]` or a CSS class, NOT `-translate-x-1/2 -translate-y-1/2 hover:scale-110` (which would drop the translate on hover).

---

## 6. PORT NOTES (React/Next + Tailwind)

**Component split:**
- `MapViewScreen` (page-level under the role-gated app shell) — owns layer/store/panel/modal state via a `useMapView()` hook or local `useReducer` mirroring `mapLayer`, `mapStoreFilter`, `showStorePins`, `selectedMapFarmer`, `showClusterModal`, `clusterDraftName`, `clusterModalLayerFilter`.
- `<LayerControlsBar layers stores counts onSelectLayer/>`.
- `<StoreFilterBar pills onToggleStores showStorePins/>`.
- `<IllustrativeBasemap/>` — the static SVG (pure presentational; paste verbatim, parameterize nothing).
- `<FarmerPin pin/>` and `<StorePin pin/>` (use `position:absolute` with the compound transform).
- `<FarmerDetailPanel farmer layerLabel layerValue layerColor onClose onViewProfile/>`.
- `<ClusterModal …/>` (portal/dialog; backdrop-dismiss + stopPropagation).
- `<LegendBar variant="farmer|store" items/>`.

**Data hooks / props:**
- Needs `farmers` (with store relation), `stores` (with `farmerIds` and pin `left/top` or computed projection). In the real DB these become `Farmer` and `Store` Prisma models. The pin `left/top` percentages and the basemap are **illustrative placeholders** — for a real map, replace with a tiling map (Leaflet/Mapbox) + farmer `lat/lng` (present in both `farmers` and `baseStores`). Keep the layer-coloring logic (`colorFn`) as a pure util.
- The five layer color/value maps (`layerColorFn`, `getLayerValue`, `legendMeta`, `layerLabelMap`, `layerFilterOpts`) should live in one shared `mapLayers.ts` config so pins, legend, panel, and modal stay consistent.

**Gotchas / data-quality bugs to fix on port (do NOT replicate blindly):**
1. **Issues layer mismatch:** `layerColorFn.issues`/`legendMeta.issues` use keys like "Pest Infestation" but `farmers[].issues` contain unrelated strings ("Moisture stress", "Weed pressure", "Fungal disease"…). Almost everything falls through to green/None. When wiring real data, normalize issue categories to a fixed enum.
2. **`lastVisit` absent:** farmers have no `lastVisit` field, so the Last Visited layer, its panel row, and the cluster `dRank` filter are effectively inert (all default to ~30 days / "Older", panel shows blank). Source `lastVisit` from the most recent `Visit` record.
3. **`mapFarmerCount` is unfiltered** (always 12) even when a store filter is active — store filter only dims, doesn't subset the count. Decide whether the port should show filtered counts.
4. **`storePins[].farmerCount` = `farmerIds.length`** (plotted farmers, e.g. 2) which differs from the store's headline `farmerCount` field (e.g. 6582). The store legend shows the small number.
5. **Compound transform on hover** — see §5; don't let Tailwind's `hover:scale` clobber the centering translate.
6. `createCluster` is a **cross-screen handoff**: it mutates global cluster list + navigates to Action Planner and opens its New Project drawer. Model `farmerClusters` and `clusterSource` in shared/global state (Zustand/Context), not local to this screen.
7. Legend chip onClick + "New Action" both open the same modal but with different `clusterModalLayerFilter` seeds (legend → that bucket; button → 'all').

---

## SUMMARY (3–5 lines)

Map View is an all-roles, illustrative farmer-location map: 12 farmer pins (colored by one of five selectable layers — Segment/Crop/Last Visited/Issues/Lead Status) over a static hand-drawn SVG basemap, with an optional store-pin overlay and a store filter that dims non-matching pins. Clicking a pin opens a right-side Farmer Detail panel (mobile/crop/land/segment/status + active-layer value) with a "View Full Profile" link to Farmer 360; clicking a legend chip or the "New Action" button opens a Create Farmer Cluster modal that snapshots the current layer+store criteria and selected farmers, then hands off to the Action Planner with a pre-filled project. Data comes entirely from the demo `farmers` (12) and `baseStores` (6) arrays plus `farmerStoreMap`, with all colors/labels driven by per-layer config maps; key port caveats are the issues/lastVisit data mismatches, the unfiltered farmer count, and the compound `translate+scale` pin transform.
