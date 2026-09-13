# Screen Spec 23 — User Management (Users + Store Management)

Source: `original-design.dc.html` template lines **2008–2144**; script: state `2585–2648`, renderVals `2650–3808` (key spots: `2683`, `2698`, `2702`, `3276–3293`, `3405–3443`, `3552–3559`).

---

## 1. PURPOSE & WHEN IT SHOWS

A single admin screen with **two internal sub-tabs**:
- **Users** — manage user accounts, roles, territory assignments, activity.
- **Store Management** — master data for store locations, assigned Agricultural Officers, and mapped farmers.

**Visibility (which `view`):** the whole screen is wrapped in `<sc-if value="{{ isUsers }}">`.
- `isUsers = s.view === 'users'` (line 2683).

**Role-gating (who can navigate here):** the sidebar nav item "Users" is wrapped in `<sc-if value="{{ showUsers }}">` (template line 93).
- `showUsers = R === 'central' || R === 'sysadmin'` (line 2698) — so **Central Admin** and **System Admin** can reach this view. (It is also linked from the System-Admin dashboard "Manage Users" tile at template line 307 → `goToUsers`.)
- The view title bar (set in `titles`, line 2720) reads: title `"User Management"`, subtitle `"4 active users · Role-based access"`.
- Note: `nv('users')` is hard-coded to never be "active" in the sidebar (`(id === 'users' && false)`, line 2707), so the Users nav item never gets the active highlight even when on this view.

**Edit affordances are gated further by `isAdmin`:**
- `isAdmin = R === 'sysadmin'` (line 2702). Only **System Admin** sees the per-row "Edit" buttons (both tables). Central Admin sees the read-only tables.

`go(v)` (line 2652) = `() => this.setState({ view:v, step:0, selectedFarmer:null })`.

---

## 2. LAYOUT TREE (top → bottom)

Root wrapper (`<sc-if isUsers>` → `<div>`): `animation: fadeUp 0.4s ease-out` → Tailwind `animate-[fadeUp_0.4s_ease-out]`.

### 2.1 Sub-tab switcher (always shown)
Container: `flex gap-0 mb-[22px] bg-white rounded-xl p-[5px] shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[#F0F0F0] w-fit`.

Two pill tabs (each): `px-[22px] py-2 rounded-lg text-[13px] font-semibold cursor-pointer transition-all duration-150`.
- Tab 1 "👤 Users": `onClick=goToUsersTab`; bg=`{{ usersTabBg }}`, color=`{{ usersTabColor }}`.
- Tab 2 "🏪 Store Management": `onClick=goToStoresTab`; bg=`{{ storesTabBg }}`, color=`{{ storesTabColor }}`.
- Active pill: bg `#1A3A1A` (dark green), text `white`. Inactive: bg `transparent`, text `#757575`. (lines 3556–3559)

---

### 2.2 USERS sub-tab — `<sc-if value="{{ isUsersSubTab }}">`
(`isUsersSubTab = adminSubTab === 'users'`, line 3552; `adminSubTab` defaults to `'users'`.)

**(a) Header row** — `flex justify-between items-center mb-5`.
- Left caption: `text-[13px] text-[#757575]` → "Manage user accounts, roles, and territory assignments".
- Right button "+ Add User": `px-[22px] py-[9px] rounded-[10px] bg-[#2E7D32] text-white text-[13px] font-semibold cursor-pointer`; `style-hover` → bg `#1B5E20`. **No onClick handler — static/non-functional in the DSL.**

**(b) Users table card** — `bg-white rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] overflow-hidden`.

Header row: CSS grid `grid-template-columns: 1.4fr 1fr 1fr 0.8fr 0.6fr 0.5fr 80px`, `px-[22px] py-[14px] bg-[#FAFAFA] border-b border-[#F0F0F0] text-[10.5px] font-semibold text-[#9E9E9E] uppercase tracking-[0.5px]`. Columns: **User | Role | Territory | Last Active | Visits MTD | Status | (blank)**.

Body: `<sc-for list="{{ userRows }}" as="ur">` (7 placeholder rows). Each row uses the SAME 7-col grid, `px-[22px] py-[14px] border-b border-[#F8F8F8] items-center`, `opacity: {{ ur.opacity }}`.
- Col **User**: `flex items-center gap-[10px]` →
  - Avatar: `w-[34px] h-[34px] rounded-full` with `background: {{ ur.grad }}` (linear-gradient), `flex items-center justify-center font-bold text-[12px] text-white flex-none`, contains `{{ ur.init }}`.
  - Name block: name `text-[13px] font-semibold text-[#1A1C1A]` = `{{ ur.name }}`; email `text-[10.5px] text-[#BDBDBD]` = `{{ ur.email }}`.
- Col **Role**: pill `inline-block px-[10px] py-[3px] rounded-[20px] text-[10.5px] font-semibold` with bg `{{ ur.roleBg }}`, color `{{ ur.roleColor }}`, text `{{ ur.role }}`.
- Col **Territory**: `text-[12px] text-[#616161] pr-2` = `{{ ur.territory }}`.
- Col **Last Active**: `text-[12px]`, color `{{ ur.lastActiveColor }}` = `{{ ur.lastActive }}`.
- Col **Visits MTD**: `text-[13px] font-bold`, color `{{ ur.visitsColor }}` = `{{ ur.visitsMtd }}`.
- Col **Status**: pill `inline-block px-[10px] py-[3px] rounded-[20px] text-[10px] font-semibold` with bg `{{ ur.statusBg }}`, color `{{ ur.statusColor }}`, text `{{ ur.status }}`.
- Col **(actions)**: `<sc-if value="{{ isAdmin }}">` → Edit button `onClick={{ ur.onEdit }}`: `inline-flex items-center gap-1 px-[10px] py-[5px] rounded-lg bg-[#F5F7F5] text-[11px] font-semibold text-[#2E7D32] cursor-pointer`; `style-hover` bg `#E8F5E9`; contains an 11×11 pencil SVG (stroke=currentColor, width 2) + "Edit".

**(c) Role Permissions Summary** — grid `grid-cols-4 gap-[14px] mt-5` (`repeat(4,1fr)`). Four **static** cards (not data-driven). Each: `bg-white rounded-xl p-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]` plus a colored `border-t-[3px]`:
| Card | Top border / title color | Title (text-[12px] font-bold mb-2) | Body (text-[11px] text-[#616161] leading-[1.7]) |
|---|---|---|---|
| 1 | `#2E7D32` | Regional Manager | All views, analytics, farmer data, action planner, lead management |
| 2 | `#1565C0` | Agricultural Officer | Personal dashboard, new visits, assigned farmers, lead pipeline |
| 3 | `#7B1FA2` | Central Admin | Cross-region analytics, all farmers, action planner, user management |
| 4 | `#E65100` | System Admin | User management, system settings, master data, audit logs |

---

### 2.3 STORE MANAGEMENT sub-tab — `<sc-if value="{{ isStoresSubTab }}">`
(`isStoresSubTab = adminSubTab === 'stores'`, line 3553.)

**(a) Header row** — `flex justify-between items-center mb-5`.
- Caption `text-[13px] text-[#757575]`: "Master data for store locations, assigned Agricultural Officers & mapped farmers".
- Button "+ Add Store": same styling as +Add User (`bg-[#2E7D32]…`, hover `#1B5E20`). **No onClick — static.**

**(b) KPI strip** — grid `grid-cols-3 gap-[14px] mb-5`. Three **static** cards, each `bg-white rounded-xl px-[22px] py-[18px] shadow-[…0.04] border border-black/[0.03] flex items-center gap-[14px]`:
- Icon tile `w-[42px] h-[42px] rounded-[10px] flex items-center justify-center text-[20px]`; value `text-[22px] font-bold text-[#1A1C1A]`; label `text-[11px] text-[#9E9E9E]`.
| Icon bg | Emoji | Value | Label |
|---|---|---|---|
| `#E8F5E9` | 🏪 | **6** | Total Stores |
| `#E3F2FD` | 👨‍🌾 | **12** | Farmers Mapped |
| `#FFF8E1` | 👷 | **4** | Agri Officers Deployed |

> These three numbers are **hard-coded literals** in the template, NOT bound to `storeRows`. (The real store array has 6 entries, 12 mapped farmer IDs — values happen to match — but they are not live counts. Port note: compute them.)

**(c) Store table card** — `bg-white rounded-[14px] shadow-[…0.04] border border-black/[0.03] overflow-hidden`.
- Header grid `grid-template-columns: 36px 1.8fr 1fr 1.1fr 1.1fr 0.5fr 80px`, same FAFAFA header styling. Columns: **(swatch) | Store | District | Agri Officer 1 | Agri Officer 2 | Farmers | (blank)**.
- Body `<sc-for list="{{ storeRows }}" as="sr">` (6 rows). Each row: same 7-col grid, `px-[22px] py-[14px] border-b border-[#F8F8F8] items-center`.
  - Col swatch: `w-[26px] h-[26px] rounded-md flex-none` with `background:{{ sr.color }}`.
  - Col Store: name `text-[13px] font-bold text-[#1A1C1A]` = `{{ sr.name }}`; address `text-[11px] text-[#9E9E9E] mt-[2px]` = `{{ sr.address }}`.
  - Col District: `text-[12.5px] text-[#616161]` = `{{ sr.district }}`.
  - Col Agri Officer 1: `flex items-center gap-[6px]` → mini-avatar `w-6 h-6 rounded-full bg-[#E3F2FD] text-[9px] font-bold text-[#1565C0] flex-none` showing `{{ sr.ao1 }}` (the avatar prints the full name, not initials), + name `text-[12px] text-[#1A1C1A] font-medium` = `{{ sr.ao1 }}`.
  - Col Agri Officer 2: same but `bg-[#E8F5E9]`, text `#2E7D32`, value `{{ sr.ao2 }}`.
  - Col Farmers: `text-[14px] font-bold text-[#1A1C1A]` = `{{ sr.farmerCount }}`.
  - Col actions: `<sc-if isAdmin>` → Edit button `onClick={{ sr.onEdit }}` (identical style/SVG to user Edit).

**(d) Farmer–Store mapping cards** — `mt-5 grid grid-cols-3 gap-[14px]`, second `<sc-for list="{{ storeRows }}" as="sr">` (6 cards). Each card `bg-white rounded-xl border border-black/[0.05] shadow-[…0.04] overflow-hidden`:
- Header band: `px-4 py-3 flex items-center gap-[10px]` with `background:{{ sr.color }}`; a 16×16 white storefront SVG (its inner rect fill uses `{{ sr.color }}`) + store name `text-[12.5px] font-bold text-white` = `{{ sr.name }}`.
- Body `px-4 py-3`:
  - Label "Officers" `text-[10px] font-bold text-[#9E9E9E] uppercase tracking-[0.6px] mb-[6px]`.
  - Officer chips row `flex gap-[6px] mb-[10px] flex-wrap`: chip1 `px-[10px] py-[3px] rounded-[20px] bg-[#E3F2FD] text-[11px] font-semibold text-[#1565C0]` = `{{ sr.ao1 }}`; chip2 `bg-[#E8F5E9] text-[#2E7D32]` = `{{ sr.ao2 }}`.
  - Label "Mapped Farmers" (same label style).
  - Farmer names `text-[12px] text-[#616161] leading-[1.6]` = `{{ sr.farmerNames }}` (comma-joined string).

---

## 3. DATA

### `userRows` (lines 3425–3443) — over `baseUsers` (3406–3414), merged with `s.userEdits[id]`
`User` entity (no Prisma equivalent yet in demo — back with a `User` table). Source array `baseUsers`:

| id | init | name | email | role | territory | lastActive | visitsMtd | status | gradA→gradB |
|---|---|---|---|---|---|---|---|---|---|
| 1 | RV | Rajesh Verma | rajesh@uaagro.com | Regional Manager | Agra Region | 2 min ago | 284 | Active | #43A047→#F9A825 |
| 2 | RK | Raj Kumar | raj.kumar@uaagro.com | Agri Officer | Agra — Chandpur, Khandauli | 15 min ago | 94 | Active | #1565C0→#42A5F5 |
| 3 | AY | Amit Yadav | amit.yadav@uaagro.com | Agri Officer | Firozabad — Barauli, Tundla | 1 hr ago | 87 | Active | #2E7D32→#66BB6A |
| 4 | VS | Vikram Singh | vikram.singh@uaagro.com | Agri Officer | Mainpuri — Sikandra, Jaitpur | 3 hrs ago | 82 | Active | #43A047→#81C784 |
| 5 | DV | Deepak Verma | deepak.verma@uaagro.com | Agri Officer | Etah — Kasganj | Today | 76 | Active | #4527A0→#9575CD |
| 6 | VM | Vikash Mehta | vikash@uaagro.com | System Admin | All Regions | Yesterday | — | Active | #E65100→#FF8F00 |
| 7 | SG | Sunil Gupta | sunil.gupta@uaagro.com | Agri Officer | Mathura | 5 days ago | 71 | Inactive | #9E9E9E→#BDBDBD |

Derived per row:
- `grad` = `linear-gradient(135deg, {gradA}, {gradB})`.
- `roleBg`/`roleColor` from `roleMeta[m.role]` (3415–3420): Regional Manager `#E8F5E9`/`#2E7D32`; Agri Officer `#E3F2FD`/`#1565C0`; Central Admin `#F3E5F5`/`#7B1FA2`; System Admin `#FFF3E0`/`#E65100`. Fallback `#F5F5F5`/`#757575`.
- `statusBg`/`statusColor` from `statusMeta2[m.status]` (3421–3424): Active `#E8F5E9`/`#2E7D32`; Inactive `#FFF3E0`/`#E65100`.
- `opacity` = `'0.5'` if status `Inactive` else `'1'` (entire row dimmed).
- `visitsColor` = `#9E9E9E` if Inactive else `#1A1C1A`.
- `lastActiveColor` = `#E65100` if `lastActive` contains the substring `"day"` (matches "5 days ago", "Yesterday", "Today") else `#757575`. (Bug-ish heuristic — see Port Notes.)
- `onEdit` = opens the user Edit modal (see §4).
- `m` = base user spread with `s.userEdits[id]` overlay; editable fields stored in `userEdits[id]`: `{ name, role, territory, status }` (3484).

### `storeRows` (lines 3277–3290) — over `storesWithEdits` (= `baseStores` 2790–2845 merged with `s.storeEdits[id]`)
`Store` entity. Base store fields used here: `id, code, name, shortName, zone, district, address, color, status, farmerIds[], farmerCount, officers[]` (each officer `{name, role, mobile, email, empCode}`).

Six stores: **Ram Nagar (Barabanki)** `#1565C0`, **Haidergarh (Barabanki)** `#2E7D32`, **Tiloi (Amethi)** `#E65100`, **Shivgarh (Raebareli)** `#7B1FA2`, **Sanda Farm (Lakhimpur Kheri)** `#F57F17`, **Aliganj (Lakhimpur Kheri)** `#C62828`.

Derived per row:
- `ao1` = `officers[0]?.name || ''`; `ao2` = `officers[1]?.name || ''` (3281). **Both columns show the officer's full NAME, including inside the small round avatar** (no initials transform). Stores with only 1 officer (e.g. Haidergarh has a single officer) render `ao2` as empty string → empty chip/avatar.
- `farmerCount` = `farmerIds.length` (3282) — **note: this is the count of mapped farmer IDs (2 each), NOT the large `st.farmerCount` field** (6582, etc.). The big numbers are intentionally bypassed here.
- `farmerNames` = farmer names looked up via `farmersWithEdits` by `farmerIds`, joined with `", "` (3279, 3283). Mapped names per store (from `farmers` 2727–2776):
  - Ram Nagar [1,2]: "A K Shukla, A K Singh"
  - Haidergarh [3,4]: "A P Singh, Aadarsh Dwivedi"
  - Tiloi [5,6]: "A B Singh, Aadam Sher"
  - Shivgarh [7,8]: "Aadesh Kumar, Adesh Kumar Srivastav"
  - Sanda Farm [9,10]: "Adil Khan, Ashutosh Verma"
  - Aliganj [11,12]: "Aadarsh Verma, Aaminudeen"
- `onEdit` = opens the store Edit modal (see §4).

### sc-if conditionals
- `isUsers` (whole screen) ← `view==='users'`.
- `isUsersSubTab` / `isStoresSubTab` ← `adminSubTab`.
- `isAdmin` (per-row Edit buttons, both tables) ← `role==='sysadmin'`.

### sc-for loops
- Users table body: over `userRows` (7 rows).
- Store table body: over `storeRows` (6 rows).
- Mapping cards: over `storeRows` again (6 cards).

---

## 4. INTERACTIONS

| Trigger | Handler | Effect |
|---|---|---|
| Tab "👤 Users" | `goToUsersTab` = `setAdminTab('users')` (3554/3293) | `setState({ adminSubTab:'users' })` → show Users sub-tab, repaint pills. |
| Tab "🏪 Store Management" | `goToStoresTab` = `setAdminTab('stores')` (3555) | `setState({ adminSubTab:'stores' })` → show Stores sub-tab. |
| User row "Edit" (sysadmin) | `ur.onEdit` (3438–3441) | `setState({ editModal:{ type:'user', entityId:uid, title:'Edit User — '+name, sub:email }, editDraft:{ userName, userRole, userTerritory, userStatus } })` → opens the shared **Edit Modal** (rendered elsewhere, template ~2400+, `showEditModal`). |
| Store row "Edit" (sysadmin) | `sr.onEdit` (3284–3288) | `setState({ editModal:{ type:'store', entityId:st.id, title:'Edit Store — '+name, sub:address }, editDraft:{ storeName, storeAddress, storeDistrict, storeAO1, storeAO2 } })` → opens Edit Modal. |
| "+ Add User" / "+ Add Store" | — | **No handler.** Visual only (hover bg darken). Port should wire to a create flow. |

**Edit Modal save path** (shared, lines 3473–3496):
- `saveEditModal()` for `type:'user'` → writes `userEdits[entityId] = { name, role, territory, status }` from draft, closes modal. The row re-renders with overlaid values (and re-derives opacity/colors).
- For `type:'store'` → writes `storeEdits[entityId] = { name, address, district, officers: st.officers||[] }` (note: officers are NOT actually updated from the AO draft fields — known limitation; `st` here is closure-stale). Closes modal.
- `closeEditModal()` → `setState({ editModal:null, editDraft:{} })`.
- `mSet(key)` (3454) is the generic `onChange` setter for modal inputs: `e => setState(p => ({ editDraft:{ ...p.editDraft, [key]: e.target.value } }))`.

(The Edit Modal markup itself is outside this slice — spec it on the modal screen; here only the openers live.)

---

## 5. ROLE DIFFERENCES / EMPTY STATES / DYNAMIC STYLING

- **Reachable by:** Central Admin + System Admin (`showUsers`). Regional Manager and Agri Officer have no nav entry.
- **Edit buttons:** only System Admin (`isAdmin`). Central Admin gets read-only tables (the actions column renders empty).
- **Empty states:** none implemented — arrays are non-empty demo data. `ao2` empty string for single-officer stores yields an empty avatar circle + empty chip (handle gracefully in port: hide AO2 chip/avatar when absent).
- **Dynamic styling:**
  - Sub-tab pills: active `#1A3A1A`/white vs transparent/`#757575`.
  - Inactive user row: whole row `opacity:0.5`, visits text greyed `#9E9E9E`.
  - `lastActiveColor` orange `#E65100` when the string contains "day".
  - Role/status pills colored from `roleMeta`/`statusMeta2`.
  - Avatar gradient `135deg, gradA→gradB` per user.
  - Store swatch + card header band + mapping-card SVG inner-fill all use `sr.color`.
  - `style-hover` on: both "+Add" buttons (→ `#1B5E20`) and both Edit buttons (→ `#E8F5E9`). Port as Tailwind `hover:` variants.

---

## 6. PORT NOTES (Next.js + TS + Tailwind)

**Component split**
- `UserManagementScreen` (route gate: only render for role `central`/`sysadmin`; else redirect). Holds `adminSubTab` state (or read from URL `?tab=users|stores`).
- `<SubTabSwitcher value tab onChange>` — two-pill toggle.
- `<UsersTab>`:
  - `<UsersTable rows={userRows} canEdit={isSysadmin} onEdit={openUserEdit} />` (row sub-component `<UserRow>`).
  - `<RolePermissionsSummary>` — static, can be a constant array of 4 `{ accent, title, body }`.
- `<StoresTab>`:
  - `<StoreKpiStrip totals={{stores, farmersMapped, officers}} />` — **compute** these instead of hard-coding 6/12/4: `stores.length`, sum of `farmerIds.length`, distinct officer count.
  - `<StoresTable rows={storeRows} canEdit={isSysadmin} onEdit={openStoreEdit} />`.
  - `<StoreMappingCards rows={storeRows} />`.
- Shared `<EditModal>` driven by `editModal`/`editDraft` (port from the modal slice) — reuse for user/store/farmer/kpi types.

**Props / data hooks**
- `useUsers()` → `User[]` (fields: id, name, email, role enum, territory, lastActive, visitsMtd, status enum, avatar gradient pair). Apply optimistic `userEdits` overlay or just refetch after save.
- `useStores()` → `Store[]` with relation `officers: StoreOfficer[]` and `farmers: Farmer[]` (or `farmerIds`). Derive `ao1/ao2`, `farmerCount=farmers.length`, `farmerNames`.
- Color/meta maps (`roleMeta`, `statusMeta2`, store `color`) → move to a shared tokens module; map raw hex to design tokens (greens `#2E7D32`/`#1B5E20`/`#1A3A1A`, blue `#1565C0`, purple `#7B1FA2`, orange `#E65100`).

**Gotchas**
- KPI strip numbers are literals, not live — compute them.
- `storeRows.farmerCount` uses `farmerIds.length` (=2), NOT the store's large `farmerCount` field; replicate the small-count semantics or decide which is correct for production.
- Officer "avatars" print full names, not initials — either keep verbatim or convert to initials (recommend initials + name label).
- Store save (`type:'store'`) does not persist AO1/AO2 edits (`officers` passed stale); fix in port by mapping draft AO fields back into officers.
- `lastActiveColor` "contains 'day'" heuristic is fragile (matches Today/Yesterday/Nday ago). For port, color by an actual "stale" boolean (e.g. lastActive older than N days).
- "+ Add User"/"+ Add Store" are non-functional in the design — wire to real create forms/modals.
- Users nav item is forced non-active in sidebar highlight (`id==='users' && false`) — decide whether to keep (likely keep highlight for parity with other items).

---

### SUMMARY
User Management is the System/Central-Admin screen (`view==='users'`, gated by `showUsers = central||sysadmin`) with two sub-tabs controlled by `adminSubTab`. The **Users** tab renders a 7-column table from `userRows` (over `baseUsers` + `userEdits`) with avatar gradients, role/status pills, dimmed inactive rows, and (sysadmin-only) Edit buttons that open a shared Edit modal; below it sits a static 4-card role-permissions legend. The **Store Management** tab shows a hard-coded 3-KPI strip, a 7-column store table and a 3-up farmer–store mapping card grid, both from `storeRows` (over `baseStores`/`storesWithEdits`, deriving `ao1/ao2`, `farmerCount=farmerIds.length`, comma-joined `farmerNames`). Data deps: User, Store (+StoreOfficer, +Farmer for mapped names); edits flow through `editModal`/`editDraft` → `userEdits`/`storeEdits`.
