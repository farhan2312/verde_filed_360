# Screen Spec 24 — Master Data Management

Source: `webapp/docs/original-design.dc.html`
- Template slice: lines **2146–2255** (inside `<x-dc>`).
- Script: `state` lines 2585–2648; `renderVals()` lines 2650–3804; Master Data block lines **3756–3803**; source data arrays `farmers` (2727–2776) and `baseStores` (2790–2845).

---

## 1. PURPOSE & WHEN IT SHOWS

A read-only central registry that lets HQ-level users browse three master entities through sub-tabs:
**Stores**, **Farmers**, **Employees**. It is the "single source of truth" reference screen — no inline editing, navigation, or modals are wired into this slice (rows are display-only).

### Visibility / routing
- Renders only when `view === 'masterData'` — wrapped in `<sc-if value="{{ isMasterData }}">`.
  - `isMasterData: s.view === 'masterData'` (line 3757).
  - Entered via `goToMasterData: () => this.setState({ view:'masterData' })` (line 3759), invoked from the left nav item (nav styling: `navBgMD/navClMD/navWMD` via `nv('masterData')`, line 3760).

### Role gating
- `showMasterData: R === 'central' || R === 'sysadmin'` (line 3758), where `R = s.role` (line 2653); roles are `regional | officer | central | sysadmin` (state line 2589).
- The nav entry that reaches this view is shown only to **Central HQ** and **System Admin**. There is no role branching **inside** the screen body — content is identical for both. Treat `central` + `sysadmin` as the only roles that can land here; guard the route accordingly.

### Sub-tab state
- `s.masterDataTab` (default `'stores'`, state line 2605). Active tab resolved everywhere as `(s.masterDataTab || 'stores')`.
- `isMdStores / isMdFarmers / isMdEmployees` (lines 3765–3767) drive which table block renders.

---

## 2. LAYOUT TREE (top → bottom, with Tailwind translation)

Root wrapper has entrance animation `animation:fadeUp 0.4s ease-out` (keep a `fadeUp` keyframe util / `animate-[fadeUp_0.4s_ease-out]`).

```
<section>                                            // root, fadeUp on mount
 ├─ Header row
 │   ├─ Title  "Master Data Management"
 │   └─ Subtitle "Central repository — Stores, Farmers & Employees"
 ├─ Sub-tab pill bar  (Stores | Farmers | Employees)
 └─ ONE of three tables (sc-if on active tab)
     ├─ Stores table   (7-col grid)
     ├─ Farmers table  (9-col grid)
     └─ Employees table(6-col grid)
```

### 2.1 Header (line 2150–2155)
- Container: `flex justify-between items-center mb-[22px]`.
- Title: `text-[22px] font-extrabold text-[#1A1C1A]` → token `text-ink` (`#1A1C1A`). Text: `Master Data Management`.
- Subtitle: `text-[13px] text-[#757575] mt-0.5` → `text-muted`. Text: `Central repository — Stores, Farmers & Employees`.
- (The right side of the flex is empty — no action button in this slice.)

### 2.2 Sub-tab pill bar (line 2157–2161)
- Bar container: `flex gap-1.5 mb-[22px] bg-white rounded-xl p-[5px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] w-fit`.
- Three pills, each: `px-[22px] py-2 rounded-lg text-[13px] font-semibold cursor-pointer transition-all duration-150` plus dynamic `background` + `color`:
  - **Active** pill: `bg:#1A3A1A` (deep brand green → `bg-brand-900`), `color:white`.
  - **Inactive** pill: `bg:transparent`, `color:#757575`.
  - Bindings: Stores `mdTabStoreBg`/`mdTabStoreColor`; Farmers `mdTabFarmerBg`/`mdTabFarmerColor`; Employees `mdTabEmployeeBg`/`mdTabEmployeeColor` (lines 3768–3773).
  - Handlers: `setMdTabStores` / `setMdTabFarmers` / `setMdTabEmployees` (lines 3762–3764).
- Labels: `Stores`, `Farmers`, `Employees`.

### 2.3 Generic table shell (all three tabs share this)
- Card: `bg-white rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-[#F0F0F0] overflow-hidden`.
- Header row: `grid <cols> px-5 py-3 bg-[#F8F8F8] border-b border-[#EEEEEE] text-[11px] font-bold text-[#9E9E9E] tracking-[0.04em] gap-3` (gap is `gap-3`=12px for Stores/Employees, `gap-2.5`=10px for Farmers).
- Body rows (`sc-for`): `grid <same cols> px-5 border-b border-[#F5F5F5] gap-X transition-[background] duration-[120ms]` with **hover** `style-hover="background:#FAFFF8"` → `hover:bg-[#FAFFF8]`.
  - Row vertical padding & align differ per tab (see below).

### 2.4 STORES table (sc-if `isMdStores`, lines 2164–2204)
- Grid columns (header + rows): `grid-template-columns:0.5fr 1.4fr 1fr 1fr 1fr 0.8fr 0.6fr`, `gap-3`.
- Header labels: `CODE`, `STORE NAME`, `ZONE / DISTRICT`, `AGRI OFFICER`, `BDM`, `FARMERS`, `STATUS`.
- Body row: `py-3.5 px-5` (`14px 20px`), `items-start`, hover `#FAFFF8`.
  - **CODE** cell: badge `text-[10.5px] font-bold` color = `{{ st.color }}`, background = `{{ st.color }}18` (hex `color` + alpha `18` ≈ 9% opacity), `px-[7px] py-[3px] rounded-md w-fit`. Text `{{ st.code }}`.
  - **STORE NAME**: name `text-[13px] font-bold text-[#1A1C1A] mb-0.5` = `{{ st.name }}`; address `text-[11px] text-[#9E9E9E] leading-[1.4]` = `{{ st.address }}`.
  - **ZONE / DISTRICT**: zone `text-xs font-semibold text-ink` = `{{ st.zone }}`; district `text-[11px] text-[#9E9E9E]` = `{{ st.district }}`.
  - **AGRI OFFICER**: officer-1 name `text-xs font-semibold text-ink mb-0.5` = `{{ st.ao1Name }}`; mobile `text-[10.5px] text-[#9E9E9E]` = `{{ st.ao1Mobile }}`. Then `<sc-if value="{{ st.ao2Name }}">` renders officer-2: name `text-[11.5px] font-semibold text-ink mt-1.5` = `{{ st.ao2Name }}`; mobile `text-[10.5px] text-[#9E9E9E]` = `{{ st.ao2Mobile }}`.
  - **BDM**: name `text-xs font-semibold text-ink` = `{{ st.bdmName }}`; mobile `text-[10.5px] text-[#9E9E9E]` = `{{ st.bdmMobile }}`.
  - **FARMERS**: count `text-sm font-extrabold text-[#2E7D32]` = `{{ st.farmerCountLabel }}`; static caption `registered` `text-[10.5px] text-[#9E9E9E]`.
  - **STATUS**: pill `px-2.5 py-[3px] rounded-full text-[10.5px] font-semibold bg-[#E8F5E9] text-[#2E7D32] w-fit` = `{{ st.status }}` (always green; status is hard-coded `Active` in data).

### 2.5 FARMERS table (sc-if `isMdFarmers`, lines 2207–2229)
- Grid columns: `grid-template-columns:0.3fr 0.5fr 1.2fr 0.9fr 1fr 0.8fr 0.7fr 0.8fr 0.8fr`, `gap-2.5`.
- Header labels: `#`, `CODE`, `FARMER NAME`, `MOBILE`, `VILLAGE`, `CROP`, `STORE`, `AGR. OFFICER`, `SEGMENT`.
- Body row: `py-3 px-5` (`12px 20px`), `items-center`, hover `#FAFFF8`.
  - **#**: `text-[11px] text-[#BDBDBD] font-semibold` = `{{ fr.idx }}` (1-based).
  - **CODE**: badge `text-[10.5px] font-bold text-[#757575] bg-[#F5F5F5] px-1.5 py-0.5 rounded-[5px] w-fit` = `{{ fr.code }}`.
  - **FARMER NAME**: name `text-[13px] font-semibold text-ink` = `{{ fr.name }}`; district subtext `text-[10.5px] text-[#9E9E9E]` = `{{ fr.district }}`.
  - **MOBILE**: `text-xs text-[#1565C0] font-medium` = `{{ fr.mobile }}`.
  - **VILLAGE**: `text-xs text-[#424242]` = `{{ fr.village }}`.
  - **CROP**: `text-xs text-[#424242]` = `{{ fr.crop }}`.
  - **STORE**: `text-[11px] font-bold` color = `{{ fr.storeColor }}`, text `{{ fr.storeName }}` (the store's `shortName`).
  - **AGR. OFFICER**: `text-[11.5px] text-[#424242]` = `{{ fr.aoName }}` (store's first officer).
  - **SEGMENT**: pill `px-[9px] py-[3px] rounded-full text-[10.5px] font-semibold bg-[#E8F5E9] text-[#2E7D32] w-fit` = `{{ fr.segment }}` (always green styling regardless of segment value).

### 2.6 EMPLOYEES table (sc-if `isMdEmployees`, lines 2232–2253)
- Grid columns: `grid-template-columns:0.3fr 1.4fr 1fr 1fr 0.8fr 1.2fr`, `gap-3`.
- Header labels: `#`, `EMPLOYEE NAME`, `ROLE`, `MOBILE`, `STORE CODE`, `STORE NAME`.
- Body row: `py-[13px] px-5`, `items-center`, hover `#FAFFF8`.
  - **#**: `text-[11px] text-[#BDBDBD] font-semibold` = `{{ emp.idx }}`.
  - **EMPLOYEE NAME**: name `text-[13px] font-semibold text-ink` = `{{ emp.name }}`; email `text-[10.5px] text-[#9E9E9E]` = `{{ emp.email }}` (may be empty).
  - **ROLE**: pill `px-2.5 py-[3px] rounded-full text-[10.5px] font-bold w-fit`, dynamic bg `{{ emp.roleBg }}` + color `{{ emp.roleColor }}`, text `{{ emp.role }}`.
  - **MOBILE**: `text-xs text-[#1565C0] font-medium` = `{{ emp.mobile }}`.
  - **STORE CODE**: badge `text-[11px] font-bold px-2 py-[3px] rounded-md w-fit`, color `{{ emp.storeColor }}`, bg `{{ emp.storeColor }}15` (~8% alpha), text `{{ emp.storeCode }}`.
  - **STORE NAME**: `text-xs text-[#424242]` = `{{ emp.storeName }}` (store `shortName`).

---

## 3. DATA

### Source arrays (currently embedded demo data; map to DB)
- **`farmers`** (2727–2776): 12 records. Fields used here: `id, code, name, mobile, village, district, crop, segment, storeCode, issues[]`. → **Farmer** entity.
- **`baseStores`** (2790–2845): 6 records. Fields used here: `id, code, name, shortName, zone, district, address, color, status, farmerCount, officers[], bdm`. → **Store** entity.
  - `officers[]`: `{ name, role, mobile, email, empCode }`. → **User/StoreStaff** (empCode `AGC` = Agriculture Officer, `CI` = Store Manager).
  - `bdm`: `{ name, mobile, email, empCode }`. → **User** (BDM / Regional Manager; empCode like `UA012`).
- **Edits overlay**: `storesWithEdits = baseStores.map(st => ({...st, ...(s.storeEdits[st.id]||{})}))` (2850); `farmersWithEdits = farmers.map(f => ({...f, ...(s.farmerEdits[f.id]||{})}))` (2782). Sysadmin edits made elsewhere are layered before display. → in the port these overlays correspond to persisted records; no edit UI exists on this screen.

### Derived row builders (renderVals 3774–3803)
**`mdStoreRows`** — `storesWithEdits.map(st => ({ ...st, derived }))`:
| Row field | Source | Notes |
|---|---|---|
| `code`,`name`,`address`,`zone`,`district`,`color`,`status` | Store | direct |
| `ao1Name` | `st.officers[0].name` else `'—'` | first officer |
| `ao1Mobile` | `st.officers[0].mobile` else `''` | |
| `ao2Name` | `st.officers[1].name` else `'—'` | gates `sc-if` (note: falsy is `'—'` string which is truthy → see Gotchas) |
| `ao2Mobile` | `st.officers[1].mobile` else `''` | |
| `bdmName` | `st.bdm.name` else `'—'` | |
| `bdmMobile` | `st.bdm.mobile` else `''` | |
| `farmerCountLabel` | `(st.farmerCount||0).toLocaleString()` | thousands-separated (e.g. `6,582`) |

**`mdFarmerRows`** — `farmersWithEdits.map((f,i) => {...})`:
| Row field | Source | Notes |
|---|---|---|
| `idx` | `i+1` | 1-based |
| `code,name,mobile,village,district,crop,segment` | Farmer | direct |
| `storeName` | `fst.shortName` (store where `st.code === f.storeCode`) else `'—'` | joins Store on `storeCode` |
| `storeColor` | `fst.color` else `'#9E9E9E'` | |
| `aoName` | `fst.officers[0].name` else `'—'` | store's first officer |
| `issueLabel`,`issueBg`,`issueColor` | from `f.issues[]` | **computed but NOT used in this slice's template** (used elsewhere) |

**`mdEmployeeRows`** — flatten all staff across stores (3797–3803):
- For each store: spread each officer (`{...o, storeCode, storeName:st.shortName, storeColor:st.color}`) plus the BDM (`{...st.bdm, role:'BDM / Regional Manager', storeCode, storeName, storeColor}` if present). `filter(Boolean)`, concat across stores.
- Then `.map((e,i) => ({ ...e, idx:i+1, roleBg, roleColor }))`:
  - `roleBg`/`roleColor` keyed off `empCode`:
    - `AGC` → bg `#E3F2FD`, color `#1565C0` (blue).
    - `CI` → bg `#FFF8E1`, color `#E65100` (amber/orange).
    - else (BDM, `UA###`) → bg `#F3E5F5`, color `#7B1FA2` (purple).
  - `role` text comes from the officer's own `role` field (`Agriculture Officer` / `Store Manager`) or the literal `'BDM / Regional Manager'` for BDMs.
- Result ≈ 14 rows (`hint-placeholder-count="14"`): 6 stores → 13 officers (1+1+2+2+3+2... per data) + 6 BDMs (with duplicates by person — Arun Verma appears twice as he is BDM for two stores). Order: store-by-store, officers then BDM.

### sc-for / sc-if summary
- `sc-for list="mdStoreRows" as="st"` (placeholder 6).
- `sc-for list="mdFarmerRows" as="fr"` (placeholder 12).
- `sc-for list="mdEmployeeRows" as="emp"` (placeholder 14).
- `sc-if isMasterData` (whole screen), `sc-if isMdStores / isMdFarmers / isMdEmployees` (tab body), `sc-if st.ao2Name` (second officer block).

---

## 4. INTERACTIONS

Only the three sub-tab pills are interactive in this slice.

| Element | Event | Handler (line) | Effect |
|---|---|---|---|
| Stores pill | onClick | `setMdTabStores` (3762) | `setState({ masterDataTab:'stores' })` → shows Stores table; pill goes active (green/white). |
| Farmers pill | onClick | `setMdTabFarmers` (3763) | `setState({ masterDataTab:'farmers' })` → shows Farmers table. |
| Employees pill | onClick | `setMdTabEmployees` (3764) | `setState({ masterDataTab:'employees' })` → shows Employees table. |

- No row clicks, no search box, no filters, no modals, no add/edit/delete buttons exist on this screen. Rows are purely presentational.
- Tab switching is local UI state only (no fetch implied in the DSL; in the port each tab maps to its own dataset/query).

---

## 5. ROLE DIFFERENCES, EMPTY STATES, DYNAMIC STYLING

### Role differences
- Body is **identical** for `central` and `sysadmin`. The only "role difference" is access: non-HQ roles never reach `view==='masterData'` (gate via `showMasterData`). No conditional columns or buttons by role inside the screen.

### Empty states
- No explicit empty-state markup. If an array is empty, the `sc-for` simply renders zero rows (header row still shows). Port should add a graceful "No records" row for each table since real data may be empty (demo data always has rows).
- Per-field fallbacks already encode missing data: officers/BDM missing → `'—'`; missing mobile/email → empty string (renders blank).

### Dynamic styling
- **Active tab pill**: bg `#1A3A1A` / white vs transparent / `#757575`. Build with conditional classes; default tab is `stores`.
- **Row hover**: `hover:bg-[#FAFFF8]` (very pale green) on every body row in all three tables, 120ms transition.
- **Color-keyed badges using hex+alpha suffix**:
  - Store CODE badge bg = `{{ st.color }}18` (store color at ~9% alpha).
  - Employee STORE CODE badge bg = `{{ emp.storeColor }}15` (~8% alpha).
  - These are 8-digit hex (`#RRGGBBAA`). In React, either keep inline `style={{ background: color+'18' }}` or convert to rgba. Foreground text uses the full store color.
- **Employee ROLE pill** colors are derived from `empCode` (see §3), not from role text — three fixed palettes (blue/amber/purple).
- Store STATUS pill and Farmer SEGMENT pill are **statically green** (`#E8F5E9`/`#2E7D32`) regardless of value.

---

## 6. PORT NOTES (Next.js 14 / TS / Tailwind)

### Component split
- `MasterDataScreen` (route segment, e.g. `app/(app)/master-data/page.tsx` or a view switch). Server component fetches all three datasets; client wrapper holds the active-tab state.
  - `<MasterDataHeader />` — static title + subtitle.
  - `<MasterDataTabs active onChange />` — controlled pill bar; `active: 'stores'|'farmers'|'employees'`, default `'stores'`. Keep state in a small client component or URL search param (`?tab=`) so it survives refresh.
  - `<StoresTable rows={StoreRow[]} />`
  - `<FarmersTable rows={FarmerRow[]} />`
  - `<EmployeesTable rows={EmployeeRow[]} />`
  - A shared `<DataTable>` primitive (grid header + mapped rows + hover) parameterized by column template string + cell renderers reduces duplication; the three grids differ only in column spec/cells.

### Data hooks / queries
- Stores: `prisma.store.findMany({ include: { officers: true, bdm: true } })` → map to `mdStoreRows` shape (first/second officer split, BDM, `farmerCount` formatted with `toLocaleString()`, `_count` of farmers if `farmerCount` is computed rather than stored).
- Farmers: `prisma.farmer.findMany()` joined to store on `storeCode` to derive `storeName(shortName)`, `storeColor`, `aoName(store.officers[0].name)`. Provide 1-based index server-side or in render.
- Employees: derive by flattening `store.officers` + `store.bdm` across all stores (officers first, then BDM, per store). Preserve dedup behavior choice — current code lists a person once per store they serve (so a BDM covering 2 stores appears twice). Decide whether the real model wants distinct employees or per-store assignments; demo intentionally shows per-assignment rows.

### Role gating
- Protect the route: only `central` / `sysadmin` (use the app's role context / middleware). Mirror `showMasterData = role==='central' || role==='sysadmin'`.

### Tokens
- `#1A1C1A`→`ink`, `#757575`→`muted`, `#9E9E9E`→`muted-2`, `#424242`→`text-secondary`, `#1565C0`→`info/blue`, `#2E7D32`/`#E8F5E9`→`success`/`success-bg`, `#1A3A1A`→`brand-900`, surfaces `#F8F8F8`/`#F5F5F5`/`#FAFFF8`/`#F0F0F0`/`#EEEEEE`. Store/officer accent colors come from data (`store.color`), keep as inline style.

### Gotchas
1. **`sc-if value="{{ st.ao2Name }}"`**: `ao2Name` is set to the string `'—'` when there's no second officer, and `'—'` is **truthy** — so the conditional would render the second-officer block with a dash. To match intended behavior (only show when a real 2nd officer exists) test `store.officers.length > 1`, not the dash string. (Flag this; demo data happens to make it mostly fine because single-officer stores still pass the dash.)
2. **Hex+alpha colors** (`color+'18'`, `storeColor+'15'`): keep as inline `style` or precompute rgba; Tailwind arbitrary classes can't interpolate runtime hex cleanly.
3. **Index columns** (`idx`) are presentation indices (1-based over the rendered list), not DB ids.
4. `mdFarmerRows` also reflects `s.search`/`s.segFilter` filtering because it is built from `farmersWithEdits` → `filtered`? **No** — it maps `farmersWithEdits` directly (line 3784), NOT `filtered`. So the Farmers master table is **unfiltered** by the global search/segment filter even though `filtered` exists for other screens. Preserve: master data shows all farmers.
5. `issueLabel/issueBg/issueColor` are computed in `mdFarmerRows` but unused in this template slice — don't render them here.
6. Employee `email` and some officer `mobile`/`email` can be empty strings — render nothing, don't print `undefined`.
7. The header's right flex slot is empty; leave room for a future "Add"/"Export" action if needed but it is absent in the original.

---

## SUMMARY
Master Data Management (`view==='masterData'`, HQ-only: `central`/`sysadmin`) is a read-only registry with a three-pill sub-tab switch (`masterDataTab`, default `stores`) toggling between Stores, Farmers, and Employees tables. Data comes from two embedded arrays — `baseStores` (6 stores with `officers[]`/`bdm`, color, address, `farmerCount`) and `farmers` (12 records joined to stores on `storeCode`) — overlaid with `storeEdits`/`farmerEdits`. Row builders `mdStoreRows`/`mdFarmerRows`/`mdEmployeeRows` (renderVals 3774–3803) flatten officers+BDM into employee rows and derive store/officer lookups; the Employees role pill is colored by `empCode` (AGC=blue, CI=amber, else purple). The only interactions are the three tab handlers; there are no row clicks, filters, or edit affordances on this screen. Port as a tab-switched `DataTable` with role-gated route; key gotchas are the truthy `'—'` second-officer `sc-if`, runtime hex+alpha badge colors, and that the farmers table is intentionally unfiltered.
