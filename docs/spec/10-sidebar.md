# Screen Spec 10 — Sidebar (Nav + Role Switcher) & Main Header

Source: `original-design.dc.html` template lines 25–169; logic in `renderVals()` (2650–3760)
and `state` (2585–2648).

---

## 1. PURPOSE & WHEN IT SHOWS

This is the **persistent app chrome**, not a `view`. It renders on **every** screen
(`dashboard`, `newVisit`, `farmers`, `analytics`, …) and frames all content. Two pieces:

- **Left sidebar** (`<nav>`): fixed 256 px column — logo, role-gated nav links, role-switcher footer.
- **Main header** (`<header>`): sticky 64 px top bar — view title/subtitle, sync badge,
  optional Admin-Mode pill, optional "+ New Visit" CTA. The page content (`<main>`) follows.

There is **no role gating on the chrome itself** — everyone sees the sidebar + header.
Gating happens **per nav item** and per header pill (see §5). The active role is held in
`state.role` (one of `regional | officer | central | sysadmin`, default `'regional'`).

---

## 2. LAYOUT TREE (top-to-bottom, with Tailwind)

Root app shell (the parent flex row that holds nav + main) lives outside this slice; assume
`flex min-h-screen`. Sidebar is `position:fixed`; main has `margin-left:256px`.

Define brand tokens (Tailwind config / CSS vars):
- `--sidebar-from:#1A3A1A`, `--sidebar-to:#0F2810` (gradient 180deg)
- `--green-600:#2E7D32` (primary), `--green-800:#1B5E20` (primary hover), `--green-900:#1A3A1A`
- `--ink:#1A1C1A`, `--muted:#9E9E9E`, `--border:#E6E8E4`

### 2.1 `<nav>` — sidebar (line 26)
```
fixed inset-y-0 left-0 z-20 w-64 flex flex-col text-white
bg-[linear-gradient(180deg,#1A3A1A_0%,#0F2810_100%)]
shadow-[2px_0_20px_rgba(0,0,0,0.15)]
```

**(a) Brand header** (line 27–33)
```
flex items-center gap-3.5 px-[22px] pt-6 pb-5
border-b border-white/[0.08]
```
- `<img src="assets/logo.png">` → `w-[46px] h-[46px] rounded-full bg-white p-0.5 box-border`
- Text block:
  - Title "UA Field Intel" → `font-bold text-[15px] tracking-[0.3px]`
  - Subtitle "KISAN SEWA KENDRA" → `text-[10px] opacity-50 tracking-[0.5px] mt-0.5`

**(b) Nav list** (line 34) — scroll region
```
flex-1 flex flex-col gap-0.5 px-3 py-4 overflow-y-auto
```
Each **nav item** is a clickable `<div>` (lines 35–111). Common item shape:
```
flex items-center gap-3 px-3.5 py-[11px] rounded-[10px] cursor-pointer
text-[13.5px] transition-all duration-150
hover:bg-white/[0.08]
```
Dynamic per item (driven by `nv(id)` — see §4): `font-weight`, `background`, `color`.
- 18×18 inline SVG icon at `opacity-85`, `fill="currentColor"` (some stroked) — keep the
  exact SVG paths from the source per item.
- Label text follows the icon.

Nav items in order (all share the shape above):
1. **Dashboard** (35–38) — always shown.
2. **New Visit** (39–44) — `sc-if showNewVisit`. Circle-plus icon.
3. **Visit Repo** (45–50) — `sc-if showVisitRepo` (always true). Stacked-bars icon.
4. **Farmer 360** (51–56) — `sc-if showFarmer360` (always true). Person icon.
5. **Map View** (57–62) — `sc-if showMapView` (always true). Map icon.
6. **Farmer Clusters** (63–68) — `sc-if showFarmerCluster` (always true). Linked-nodes icon.
7. **Master Data** (69–74) — `sc-if showMasterData`. List icon.
8. **Analytics** (75–80) — `sc-if showAnalytics` (always true). Bar-chart icon.
9. **Lead Pipeline** (81–86) — `sc-if showLeads`. Funnel icon.
10. **Action Planner** (87–92) — `sc-if showActions`. Tasks icon.

**Administration sub-group** (93–111), shown only when `showUsers` is true:
- Section label (94): `mt-3 px-3.5 pb-1.5 text-[9.5px] font-semibold uppercase tracking-[1px] text-white/25` → "Administration"
- **Users** (95–98) — `sc-if showUsers`.
- **Settings** (100–104) — `sc-if showSettings`.
- **Audit Log** (106–110) — `sc-if showAudit`.

**(c) Role-switcher footer** (114–137)
Container (114): `relative border-t border-white/[0.08]`.

- **Popover** (115–128) — `sc-if showRolePicker`. Absolutely positioned above trigger:
  ```
  absolute bottom-full left-3 right-3 mb-1 p-2 rounded-xl
  bg-[#1A3A1A] border border-white/[0.12]
  shadow-[0_-4px_20px_rgba(0,0,0,0.3)]
  ```
  - Header (117): "Switch Persona" → `px-2 pt-1.5 pb-2 text-[9.5px] font-semibold uppercase tracking-[1px] text-white/30`
  - `sc-for roleOptions as ro` (118) → one row per persona:
    ```
    flex items-center gap-2.5 px-2.5 py-2.5 mb-0.5 rounded-lg cursor-pointer
    hover:bg-white/[0.08]      bg:{{ ro.active }}
    ```
    - Avatar (120): `w-[30px] h-[30px] rounded-full flex items-center justify-center
      font-bold text-[11px] text-white shrink-0` with `background:{{ ro.color }}` (a gradient), text `{{ ro.init }}`.
    - Name (122): `text-[12px] font-semibold text-white` = `{{ ro.name }}`
    - Role (123): `text-[10px] text-white/45` = `{{ ro.role }}`

- **Trigger** (129–136) — current persona row, `onClick={toggleRolePicker}`:
  ```
  flex items-center gap-3 px-[18px] py-4 cursor-pointer hover:bg-white/[0.04]
  ```
  - Avatar (130): `w-9 h-9 rounded-full flex items-center justify-center font-bold
    text-[14px] text-white` with `background:{{ personaColor }}`, text `{{ personaInit }}`.
  - Name (132): `text-[13px] font-semibold` = `{{ personaName }}`
  - Role (133): `text-[10px] opacity-50` = `{{ personaRole }}`
  - Up/down caret SVG (135) `fill="rgba(255,255,255,0.4)" shrink-0`.

### 2.2 Main area (141)
```
flex-1 ml-64 flex flex-col min-h-screen
```

**Header** (143–165):
```
sticky top-0 z-10 h-16 px-8 bg-white border-b border-[#E6E8E4]
flex items-center justify-between
```
- Left block (144–147):
  - Title (145): `text-xl font-bold text-[#1A1C1A]` = `{{ viewTitle }}`
  - Subtitle (146): `text-[11.5px] text-[#9E9E9E] mt-px` = `{{ viewSub }}`
- Right cluster (148): `flex items-center gap-3`
  - **Online · Synced** pill (149–152): `flex items-center gap-1.5 px-3.5 py-1.5
    rounded-[20px] bg-[#E8F5E9] text-[11px] font-semibold text-[#2E7D32]` with a 7px
    `rounded-full bg-[#2E7D32]` dot. **Static text**, always shown.
  - **Admin Mode** pill (153–158) — `sc-if isAdmin`: `flex items-center gap-1.5 px-3.5 py-1.5
    rounded-[20px] bg-[#FFF3E0] border border-[#FFE0B2] text-[11px] font-semibold text-[#E65100]`
    + shield SVG (`fill="#E65100"`). Static text "Admin Mode".
  - **+ New Visit** button (159–163) — `sc-if showNewVisit`, `onClick={goToNewVisit}`:
    ```
    flex items-center gap-1.5 px-5 py-[9px] rounded-[10px]
    bg-[#2E7D32] text-white text-[13px] font-semibold tracking-[0.2px] cursor-pointer
    hover:bg-[#1B5E20] active:scale-[0.97]
    ```

**Content** (`<main>`, 168): `flex-1 px-8 py-7` — page bodies render here (other specs).

---

## 3. DATA — every displayed value → source

Chrome is driven entirely by `state.role` + `state.view` + `state.showRolePicker`. No DB
entities are read for the shell except the **User/persona** identity, which in the demo is
hardcoded per role (see `personas`, lines 2661–2666).

| Binding | Resolves to | Real-world entity/field |
|---|---|---|
| `personaName` | `personas[role].name` (e.g. "Rajesh Verma") | `User.name` of current user |
| `personaRole` | `personas[role].role` (e.g. "Regional Manager") | `User.role` label |
| `personaInit` | `personas[role].init` (e.g. "RV") | derived initials from `User.name` |
| `personaColor` | gradient per role | UI-only (deterministic from role) |
| `roleOptions` | `Object.entries(personas).map(...)` → 4 items `{key,name,role,init,color,active,onClick}` | demo persona-switcher; **remove in prod** or gate to impersonation feature |
| `viewTitle` / `viewSub` | `titles[view]` lookup (2717–2720) | derived from current view (+ role for dashboard sub; + counts for some) |
| `nav*` style trio | `nv(id)` (2706–2713) | derived from `view` (active state) |
| `show*` flags | role booleans (2693–2703, +3758) | RBAC policy |
| `isAdmin` | `role === 'sysadmin'` | RBAC |

**`personas` map (full):**
- `regional` → Rajesh Verma / Regional Manager / RV / `linear-gradient(135deg,#43A047,#F9A825)`
- `officer` → Raj Kumar / Agricultural Officer / RK / `linear-gradient(135deg,#1565C0,#42A5F5)`
- `central` → Dr. Anita Sharma / Central Admin / AS / `linear-gradient(135deg,#7B1FA2,#CE93D8)`
- `sysadmin` → Vikash Mehta / System Admin / VM / `linear-gradient(135deg,#E65100,#FF8F00)`

**`titles` map (`[viewTitle, viewSub]`, 2717–2720):**
- `dashboard` → `['Dashboard', dashSubs[role]]` where `dashSubs` =
  regional `'Agra Region · Sunday, June 22, 2026'`, officer `'My Territory · Sunday, June 22, 2026'`,
  central `'All Regions · Organization Overview'`, sysadmin `'System Administration'`.
- `analytics` → `['Analytics & Insights', central ? 'Cross-region performance analysis' : 'Deep-dive into field operations data']`
- `newVisit` → `['New Visit Entry', 'Step ' + (step+1) + ' of 5']`  (uses `state.step`)
- `farmers` → `['Farmer 360', '1,284 registered farmers · Segmented view']`
- `farmerDetail` → `['Farmer 360 — Profile', '']`
- `leads` → `['Lead Pipeline', 'Track farmer engagement funnel']`
- `actions` → `['Action Planner', projects.length + ' projects · ' + activeCount + ' active']` (counts from `state.projects`)
- `projectDetail` → `['Project Details', '']`
- `mapView` → `['Map View', 'Farmer locations · Agra District & surrounding']`
- `farmerCluster` → `['Farmer Clusters', 'Segmented farmer groups for targeted actions']`
- `visitRepo` → `['Visit Repository', 'Complete visit records across all officers & stores']`
- `visitDetail` → `['Visit Detail', '']`
- `users` → `['User Management', '4 active users · Role-based access']`
- `settings` → `['System Settings', 'Configuration & master data']`
- `audit` → `['Audit Log', 'System activity & data changes']`
- Fallback for unknown view → `['Dashboard', '']`.

**Loops/conditionals:**
- `sc-for list="roleOptions" as="ro"` (line 118) — iterates 4 personas in the switcher popover.
- `sc-if` flags on nav items / header pills: `showNewVisit, showVisitRepo, showFarmer360,
  showMapView, showFarmerCluster, showMasterData, showAnalytics, showLeads, showActions,
  showUsers, showSettings, showAudit, showRolePicker, isAdmin` (see §4/§5).

---

## 4. INTERACTIONS (onClick / onChange)

All `go(v)` = `() => this.setState({ view: v, step: 0, selectedFarmer: null })` (2652).
Nav clicks therefore also reset the wizard step and clear the selected farmer.

| Handler | Line(s) | Effect |
|---|---|---|
| `goToDashboard` | 35 | `go('dashboard')` |
| `goToNewVisit` | 40, 160 | `go('newVisit')` |
| `goToVisitRepo` | 46 | `setState({view:'visitRepo', selectedVisit:null})` (3529) |
| `goToFarmers` | 52 | `go('farmers')` |
| `goToMapView` | 58 | `go('mapView')` (3560) |
| `goToFarmerCluster` | 64 | `setState({view:'farmerCluster', selectedClusterDetail:null})` (3513) |
| `goToMasterData` | 70 | `setState({view:'masterData'})` (3759) |
| `goToAnalytics` | 76 | `go('analytics')` |
| `goToLeads` | 82 | `go('leads')` |
| `goToActions` | 88 | `setState({view:'actions', selectedProject:null, showNewProject:false})` (3606) |
| `goToUsers` | 95 | `go('users')` (3506) |
| `goToSettings` | 101 | `go('settings')` |
| `goToAudit` | 107 | `go('audit')` |
| `toggleRolePicker` | 129 | `setState(p => ({showRolePicker: !p.showRolePicker}))` (3504) |
| `ro.onClick` | 119 | `setState({role:key, view:'dashboard', showRolePicker:false, selectedFarmer:null, selectedProject:null})` (2671) — switches persona, returns to dashboard, closes popover |

**Active-state styling — `nv(id)` (2706–2713):** an item is "active" when
`view === id`, OR (`id==='farmers'` and `view==='farmerDetail'`), OR
(`id==='actions'` and `view==='projectDetail'`), OR (`id==='visitRepo'` and `view==='visitDetail'`).
(`users` active-clause is hardcoded `false`.) Active vs inactive:
- `bg`: `rgba(255,255,255,0.12)` vs `transparent`
- `cl` (text): `#ffffff` vs `rgba(255,255,255,0.6)`
- `w` (font-weight): `'600'` vs `'400'`

Returned per item as `navBg*/navCl*/navW*` (3607–3612, 3507–3509, 3514, 3531, 3561, 3760).

---

## 5. ROLE DIFFERENCES, EMPTY STATES, DYNAMIC STYLING

**Nav visibility by role** (2693–2703; `showMasterData` overridden at 3758):

| Item | regional | officer | central | sysadmin | Flag source |
|---|---|---|---|---|---|
| Dashboard | ✓ | ✓ | ✓ | ✓ | always |
| New Visit | ✓ | ✓ | — | ✓ | `R∈{regional,officer,sysadmin}` |
| Visit Repo | ✓ | ✓ | ✓ | ✓ | `true` |
| Farmer 360 | ✓ | ✓ | ✓ | ✓ | `true` |
| Map View | ✓ | ✓ | ✓ | ✓ | `true` |
| Farmer Clusters | ✓ | ✓ | ✓ | ✓ | `true` |
| Master Data | — | — | ✓ | ✓ | `R∈{central,sysadmin}` |
| Analytics | ✓ | ✓ | ✓ | ✓ | `true` |
| Lead Pipeline | ✓ | ✓ | — | ✓ | `R∈{regional,officer,sysadmin}` |
| Action Planner | ✓ | ✓ | ✓ | ✓ | `R∈{regional,central,officer,sysadmin}` |
| **Administration** label + Users | — | — | ✓ | ✓ | `showUsers = R∈{central,sysadmin}` |
| Settings | — | — | — | ✓ | `R==='sysadmin'` |
| Audit Log | — | — | — | ✓ | `R==='sysadmin'` |

Note: central role is the most "view-only" (no New Visit, no Lead Pipeline). The
Administration section header (94) is inside the same `sc-if showUsers`, so it appears with
Users; Settings/Audit have their own `sc-if` so only sysadmin sees those two rows.

**Header pills by role:**
- "Online · Synced" — always.
- "Admin Mode" — only `isAdmin` (sysadmin).
- "+ New Visit" — only `showNewVisit` (regional/officer/sysadmin), i.e. **not** central.

**Empty states:** none. Nav is a fixed link set; the popover always lists 4 personas; titles
have a fallback. There is no data fetch that can be empty in the shell.

**Dynamic styling:**
- Nav items: inline `font-weight`/`background`/`color` from `nv(id)` (active) + CSS hover
  `background:rgba(255,255,255,0.08)`. The active inline `background` (0.12 alpha) is darker
  than the hover (0.08) — when porting, the active state must win over hover (use
  `aria-current`/data-active + a class that overrides hover, or keep inline style precedence).
- Persona/role avatars: inline `background` is a **CSS gradient string** (not a flat color) —
  must be applied via `style`, not a Tailwind color class.
- Role-picker row: inline `background:{{ ro.active }}` (0.12 alpha for current role else
  transparent) under the same `hover:bg-white/[0.08]`.
- "+ New Visit" button: `hover:bg-[#1B5E20]` + `active:scale-[0.97]`.

---

## 6. PORT NOTES (React / Next App Router + Tailwind)

Component split:
- **`<AppShell>`** (layout) — renders `<Sidebar>`, `<Header>`, and `{children}` in the
  `flex-1 ml-64` column. Put it in `app/(app)/layout.tsx` so every route inherits it.
- **`<Sidebar>`** — brand header + `<NavList>` + `<RoleSwitcher>`.
- **`<NavItem>`** — props `{ href|onClick, icon, label, active }`. Use `usePathname()` and a
  route↔id map so `active` derives from the URL (replaces `nv(id)`/`view`). Keep the active-vs-
  hover precedence note from §5.
- **`<RoleSwitcher>`** — current-persona trigger + popover; local `open` state (was
  `showRolePicker`). In prod this is the **signed-in user menu**, not a persona impersonator —
  see gotcha below.
- **`<Header>`** — title/subtitle (derive from route, not a `titles` map literal; some subs
  need live counts so pass them as props / read from hooks), sync badge, Admin pill, New Visit CTA.

Data/hooks:
- `useSession()` (or equivalent) → current `User { name, role }`; compute initials + a
  deterministic avatar gradient from role. This replaces the entire `personas` map.
- A `useRole()` / RBAC helper exposing the `can*` booleans; drive both nav visibility and the
  Admin/New-Visit pills from a single permission map (mirror the table in §5).
- View titles: prefer per-route metadata or a `usePageHeader({title, subtitle})` context the
  page sets, since `newVisit` (step), `actions` (project counts), `users` ("4 active") need
  dynamic data. The hardcoded `'1,284 registered farmers'`, `'4 active users'` strings must be
  replaced with real counts.

Gotchas:
1. **Persona switcher is a demo affordance.** `roleOptions[].onClick` mutates `role` in
   client state. In the real app, role comes from auth; either drop the switcher entirely or
   reimplement as an admin "view as role" / impersonation feature behind a permission.
2. **`navView` reset semantics:** plain `go(v)` resets `step` and `selectedFarmer`; several
   nav items use bespoke handlers that also clear `selectedVisit` / `selectedClusterDetail` /
   `selectedProject` / `showNewProject`. With route-based nav these "selected" states become
   route params or per-page state, so the resets happen naturally on navigation — verify none
   are relied on cross-screen.
3. **`showMasterData` is defined twice:** `state.showMasterData=false` (2604) is shadowed by
   the `renderVals` return at 3758 (`R∈{central,sysadmin}`). The return value is what the
   template uses — port the role rule, ignore the state field.
4. **Fixed widths:** sidebar `w-64`(256px) + header `h-16`(64px) are load-bearing for the
   `ml-64` offset; keep them paired. Not responsive in the source (no mobile drawer) — add one
   if mobile is in scope, otherwise replicate the fixed desktop layout.
5. Inline **gradient backgrounds** (sidebar bg, avatars) must stay as `style={{background:...}}`;
   Tailwind arbitrary `bg-[linear-gradient(...)]` works for the static sidebar but avatar
   gradients are data-driven, so use inline style there.

---

## SUMMARY

The Sidebar + Header form the persistent app chrome shown on every screen, driven by
`state.role` (4 personas) and `state.view`. The 256px dark-green gradient sidebar lists up to
13 role-gated nav items (always-on: Dashboard/Visit Repo/Farmer 360/Map View/Clusters/
Analytics; gated: New Visit, Master Data, Lead Pipeline, Action Planner, and the
Administration group Users/Settings/Audit for central/sysadmin), with an active-route
highlight via `nv(id)` and a bottom persona switcher (`roleOptions`, demo-only). The 64px
sticky white header shows a route-derived title/subtitle (`titles` map), an always-on
"Online · Synced" badge, an Admin-Mode pill (sysadmin only), and a "+ New Visit" CTA
(non-central roles). Data dependencies: current User identity (name/role/initials), an RBAC
permission map for the `show*` flags, and live counts for a few subtitles — no other entities
are read by the shell. Port as `<AppShell>`/`<Sidebar>`/`<Header>` with `usePathname` for
active state and `useSession`/`useRole` replacing the hardcoded `personas`/role-switcher.
