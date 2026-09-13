# Screen Spec — Action Planner

Source: `original-design.dc.html`, template lines **1749–1911**; script `state` 2585–2648, `renderVals` 2650–3808.
Target: Next.js 14 App Router + TypeScript + Tailwind. This doc is the port contract for one engineer to rebuild the screen pixel-faithfully.

---

## 1. PURPOSE & WHEN IT SHOWS

The Action Planner is the **project/campaign board**: a Kanban-of-cards list of field-action "projects" (e.g. *Kharif Pest Control Drive — Agra*) grouped into three lifecycle lanes — **Active**, **Planned**, **Completed**. It is the entry point for creating a new project and for drilling into a project (→ Project Detail). It also receives a hand-off from the Farmer Clusters screen (a cluster can be turned into an action).

- **Visibility flag:** rendered when `view === 'actions'`. In `renderVals`, `isActions = s.view === 'actions'` (line 2680); the whole screen is wrapped in `<sc-if value="{{ isActions }}">` (line 1750).
- **Role gating (nav entry):** the sidebar "Action Planner" item is gated by `showActions = R === 'regional' || R === 'central' || R === 'officer' || R === 'sysadmin'` (line 2697) — i.e. **all four roles** (regional, central, officer, sysadmin) can navigate here. There is no role-difference inside the screen body itself; the same content renders for every role.
- **How you get here:**
  - Sidebar nav `goToActions` → `setState({ view:'actions', selectedProject:null, showNewProject:false })` (line 3606).
  - From Farmer Clusters: `goToActionFromCluster` → `setState({ view:'actions', clusterSource: selectedCluster || null, showNewProject:false })` (line 3392) — this is what populates the cluster source banner.
- **Header title (rendered by the app shell, not this slice):** `actions: ['Action Planner', s.projects.length + ' projects · ' + activeCount + ' active']` (line 2717).
- **Nav active state:** `nv('actions')` treats `view==='actions'` OR `view==='projectDetail'` as active (line 2707), so the sidebar item stays highlighted when on Project Detail.

---

## 2. LAYOUT TREE (top → bottom, with Tailwind translations)

Root wrapper (line 1751): `<div style="animation:fadeUp 0.4s ease-out;">`
→ Tailwind: a `div` with a fade-up entrance animation. Define a keyframe util (e.g. `animate-[fadeUp_0.4s_ease-out]` with a project `fadeUp` keyframe: translateY(8px)+opacity 0 → 0/1). Reuse the shared screen-enter animation already used across screens.

### 2a. Cluster Source Banner — conditional `<sc-if value="{{ hasClusterSource }}">` (1754–1765)
Only shown when `clusterSource` is set. Outer banner:
- `flex items-center gap-[14px] px-5 py-[14px] rounded-xl mb-[18px]`
- background `#E8F5E9` (token `green-50` / `--accent-soft`), border `1.5px solid #A5D6A7` (`green-200`). Use `bg-green-50 border-[1.5px] border-green-200`.

Children:
1. **Icon chip** (1756): `w-[38px] h-[38px] rounded-[10px] bg-[#2E7D32] flex items-center justify-center shrink-0`. Inner: a 16×16 white-stroke SVG "share/cluster" glyph (3 connected circles). bg `#2E7D32` = brand green (`--brand` / `green-800`).
2. **Text block** (1759, `flex-1`):
   - Line 1 (1760): `text-[13px] font-bold text-[#1B5E20]` — `"Planning action for cluster: "` + `<span class="text-[#2E7D32]">{{ clusterSourceName }}</span>`. Colors: `#1B5E20` = green-900, `#2E7D32` = brand green.
   - Line 2 (1761): `text-[11.5px] text-[#388E3C] mt-[2px]` — `{{ clusterSourceCount }} farmers pre-selected · Fill in the form below to record the action`. `#388E3C` = green-600.
3. **Dismiss button** (1763): `text-[11px] text-[#757575] cursor-pointer px-[10px] py-[5px] rounded-[7px] bg-white font-semibold`; **hover** `bg:#F5F5F5` (`hover:bg-neutral-100`). `onClick = clearClusterSource`.

### 2b. Header row (1768–1784) `flex justify-between items-center mb-[22px]`
- **Left legend cluster** (1769, `flex gap-4 items-center`): three legend pills, each `flex items-center gap-[6px]` with a 8×8 rounded-full color dot + label:
  - **Active** — `text-[14px] font-bold text-[#2E7D32]`, dot `bg-[#2E7D32]` (green-800).
  - **Planned** — `text-[14px] font-semibold text-[#F57F17]`, dot `bg-[#F57F17]` (amber-800 / `--warn`).
  - **Completed** — `text-[14px] font-semibold text-[#7B1FA2]`, dot `bg-[#7B1FA2]` (purple-700).
- **"+ New Action" button** (1783, right): `bg-[#2E7D32] text-white px-[22px] py-[9px] rounded-[10px] text-[13px] font-semibold cursor-pointer`; **hover** `bg:#1B5E20` (`hover:bg-green-900`); **active** `transform:scale(0.97)` (`active:scale-[0.97]`). `onClick = toggleNewProject`.

### 2c. New Project Form — conditional `<sc-if value="{{ showNewProject }}">` (1787–1817)
Card (1788): `bg-white rounded-[14px] p-6 mb-5`, shadow `0 1px 3px rgba(0,0,0,0.04)` (`shadow-sm`), **border `2px dashed #2E7D32`** (`border-2 border-dashed border-green-800`) — distinctive dashed-green "create" affordance.
- Heading (1789): `text-[15px] font-bold text-[#1A1C1A] mb-4` — "Create New Project / Action". `#1A1C1A` = near-black ink (`--ink`).
- **2-col grid** (1790): `grid grid-cols-2 gap-[14px] mb-[14px]`. Each cell has a label + control. Label style: `text-[11px] font-semibold text-[#757575] mb-[5px]` (`text-neutral-500`).
  - **Project Title \*** (1791–1794): `<input type=text>` placeholder `"e.g. Kharif Spray Drive — Mathura"`, `value={npTitle}`, `onChange=setNpTitle`.
  - **Action Owner \*** (1795–1798): `<input type=text>` placeholder `"e.g. Raj Kumar"`, `value={npOwner}`, `onChange=setNpOwner`.
  - **Due Date** (1799–1802): `<input type=date>`, `value={npDue}`, `onChange=setNpDue`.
  - **Farmer Cluster** (1803–1810): `<select value={npGroup} onChange=setNpGroup>` populated by `clusterDropdownOpts` (sc-for, see Data).
  - Shared input/select styling: `w-full px-[14px] py-[10px] border-[1.5px] border-[#E0E0E0] rounded-[10px] text-[13px] font-[inherit] box-border outline-none`; **focus** `border-color:#2E7D32` (`focus:border-green-800`). The select adds `bg-white`. `#E0E0E0` = `--border` / `neutral-300`.
- **Button row** (1812, `flex gap-[10px] justify-end`):
  - **Cancel** (1813): `px-5 py-[9px] rounded-[10px] border-[1.5px] border-[#E0E0E0] text-[12px] font-semibold text-[#757575]`; **hover** `border-color:#C62828; color:#C62828` (red — `hover:border-red-700 hover:text-red-700`). `onClick = toggleNewProject`.
  - **Create Project** (1814): `px-6 py-[9px] rounded-[10px] bg-[#2E7D32] text-white text-[12px] font-semibold`; **hover** `bg:#1B5E20`. `onClick = createProject`.

### 2d. Three project lanes (Active / Planned / Completed)
Each lane = a section with a small uppercase header then a vertical stack of cards.

Section header style (1821 / 1854 / 1883): `text-[12px] font-bold text-[#9E9E9E] uppercase tracking-[0.8px] mb-3`. Labels: "Active Projects", "Planned", "Completed".
Section wrappers: Active `mb-6`, Planned `mb-6`, Completed (no bottom margin, last block). Card stack container: `flex flex-col gap-3`.

**Project card (Active variant, 1824–1847)** — repeated via `sc-for over activeProjects`:
- Outer (1824): `bg-white rounded-[14px] px-6 py-5 cursor-pointer flex items-center gap-5`, `shadow-sm` (`0 1px 3px rgba(0,0,0,0.04)`), border `1px solid rgba(0,0,0,0.03)`, **`border-left:4px solid #2E7D32`** (left accent = lane color); **hover** `box-shadow:0 2px 8px rgba(0,0,0,0.08)` (`hover:shadow-md`). `onClick = proj.onClick`.
- **Left text block** (1825, `flex-1 min-w-0`):
  - Title (1826): `text-[15px] font-bold text-[#1A1C1A] mb-1` = `{{ proj.title }}`.
  - Group (1827): `text-[12px] text-[#9E9E9E]` = `{{ proj.group }}`.
- **Right metrics row** (1829, `flex gap-5 items-center shrink-0`), each metric is a centered stack `text-center` with a big number + tiny label (`text-[10px] text-[#BDBDBD]`):
  - **Farmers** (1830): number `text-[18px] font-bold text-[#2E7D32]` = `{{ proj.farmerCount }}`.
  - **Updates** (1834): number `text-[18px] font-bold text-[#424242]` = `{{ proj.updateCount }}`.
  - **Owner** (1838, `min-w-[70px]`): value `text-[12px] font-semibold text-[#424242]` = `{{ proj.owner }}`.
  - **Due** (1842, `min-w-[70px]`): value `text-[12px] font-semibold text-[#E65100]` = `{{ proj.due }}`.

**Planned card (1857–1876)** — same shape, differences:
- `border-left:4px solid #F57F17` (amber).
- Farmers number color `#F57F17`.
- **Omits the "Updates" metric** — only Farmers, Owner, Due are shown.

**Completed card (1886–1905)** — same shape, differences:
- `border-left:4px solid #7B1FA2` (purple).
- Card has `opacity-80`; **hover** `opacity:1` + `shadow-md` (`opacity-80 hover:opacity-100 hover:shadow-md`).
- Farmers number color `#7B1FA2`.
- Shows Farmers + Updates + Owner. **Omits the "Due" metric.**

---

## 3. DATA

Backing entity: **Project** (state array `s.projects`, lines 2613–2631). Each project object:
`{ id, title, status:'active'|'planned'|'completed', owner, due (ISO 'YYYY-MM-DD' string), group (cluster/segment name string), farmerIds:number[], farmers:string[] (names), updates: {text,by,date}[] }`.

Lane arrays are derived in `renderVals` (3689–3706) by filtering on `status` and decorating each item:
```
activeProjects    = projects.filter(status==='active').map(p => ({...p,
                      statusBg:'#E8F5E9', statusColor:'#2E7D32', statusLabel:'Active',
                      farmerCount: p.farmers.length,
                      updateCount: p.updates.length,
                      onClick: () => setState({ view:'projectDetail', selectedProject:p }) }))
plannedProjects   = ...filter('planned')   ...statusBg '#FFF8E1' statusColor '#F57F17' label 'Planned'
completedProjects = ...filter('completed') ...statusBg '#F3E5F5' statusColor '#7B1FA2' label 'Completed'
```
(Note: `statusBg/statusColor/statusLabel` are computed but **not used** in this slice — they belong to Project Detail; replicate only if you reuse the same DTO.)

Per-card field → source:
| UI field | Binding | Source |
|---|---|---|
| Title | `proj.title` | `Project.title` |
| Group/subtitle | `proj.group` | `Project.group` (a cluster or segment label string, not a FK) |
| Farmers count | `proj.farmerCount` | derived `Project.farmers.length` |
| Updates count | `proj.updateCount` | derived `Project.updates.length` |
| Owner | `proj.owner` | `Project.owner` (a User name string, not a FK) |
| Due | `proj.due` | `Project.due` — **rendered raw ISO string** (e.g. `2026-07-15`); no formatter in the DSL |

**sc-for loops:** three loops, each over a derived array — `activeProjects` (1823), `plannedProjects` (1856), `completedProjects` (1885). `as="proj"`.

**sc-if conditionals:**
- `hasClusterSource` (1754) = `!!s.clusterSource` (3397) — gates the cluster banner.
- `showNewProject` (1787) = `s.showNewProject` (3707) — gates the create form.

**Cluster banner data (3395–3398):**
- `clusterSourceName` = `s.clusterSource?.name ?? ''`.
- `clusterSourceCount` = `s.clusterSource?.farmerCount ?? 0`.
- `s.clusterSource` is a **FarmerCluster** object handed in from the Clusters screen (`{ name, farmerCount, criteria{...}, createdDate, ... }`).

**New-project form data:**
- `npTitle/npOwner/npDue/npGroup` = `s.newProject.{title,owner,due,group}` (3709).
- `clusterDropdownOpts` (3159–3162): `[{value:'', label:'— Select Farmer Cluster —'}, ...s.farmerClusters.map(cl => ({value: cl.name, label: `${cl.name} (${cl.farmerCount} farmers)`}))]`. Source entity: **FarmerCluster** (`s.farmerClusters`). Each option `cdo.value`→`<option value>`, `cdo.label`→option text.
- `npGroupIsCluster` (3163) — computed (`farmerClusters.some(name===newProject.group)`) but not consumed in this slice; ignore for the port unless wiring Project Detail.

---

## 4. INTERACTIONS

| Trigger (line) | Handler | Effect |
|---|---|---|
| Cluster banner "Dismiss" (1763) | `clearClusterSource` (3398) | `setState({ clusterSource:null })` → hides banner. No project change. |
| "+ New Action" (1783) | `toggleNewProject` (3708) | `setState(p => ({ showNewProject: !p.showNewProject }))` → toggles the create form open/closed. |
| Title input change (1793) | `setNpTitle` (3710) | `setState(p => ({ newProject:{...p.newProject, title:e.target.value} }))`. |
| Owner input change (1797) | `setNpOwner` (3711) | updates `newProject.owner`. |
| Due input change (1801) | `setNpDue` (3712) | updates `newProject.due`. |
| Cluster select change (1805) | `setNpGroup` (3713) | updates `newProject.group`. |
| Cancel (1813) | `toggleNewProject` | same toggle — closes the form (note: does **not** clear the draft fields). |
| Create Project (1814) | `createProject` (3714–3721) | Guard: if `!np.title` → no-op (silent). Else append a new project `{ id:Date.now(), title, status:'planned', owner, due, group, farmerIds:[], farmers:[], updates:[] }` to `projects`, then reset `newProject` to empty and set `showNewProject:false`. **New projects always land in the Planned lane** with 0 farmers/updates. |
| Any project card click (1824/1857/1886) | `proj.onClick` (3693/3699/3705) | `setState({ view:'projectDetail', selectedProject:p })` → navigates to Project Detail for that project. |

Notes:
- "Create Project" does **not** consume `clusterSource` — it ignores the pre-selected cluster entirely (the banner is informational in this demo; the form's `group` is the only cluster link, chosen via the select).
- Cancel leaves the draft intact (only `toggleNewProject`, no reset), so reopening shows prior input — preserve this behavior or intentionally improve it (call out in PR).
- The validation is title-only and silent (no error UI).

---

## 5. ROLE DIFFERENCES, EMPTY STATES, DYNAMIC STYLING

- **Roles:** body is identical for all roles; only the *nav entry* is gated (`showActions`, all four roles true). No per-role filtering of `s.projects` — every role sees the same global project list.
- **Empty states:** there is **no explicit empty state**. If a lane's filtered array is empty, the lane header still renders with an empty card stack (just the uppercase label, no cards). Port should keep the header visible; consider adding a subtle "No projects" placeholder (flag as enhancement, not in original).
- **Dynamic / hover / active styling:**
  - "+ New Action": `hover:bg-green-900`, `active:scale-[0.97]`.
  - Cluster banner Dismiss: `hover:bg-neutral-100`.
  - Form inputs/select: `focus:border-green-800`.
  - Cancel button: `hover:border-red-700 hover:text-red-700`.
  - Create button: `hover:bg-green-900`.
  - Active/Planned cards: `hover:shadow-md`.
  - Completed cards: `opacity-80 hover:opacity-100 hover:shadow-md`.
  - Lane accent is encoded only in the **left border color** + the **Farmers-number color** (green / amber / purple). Drive both from a single lane-config map.

---

## 6. PORT NOTES (React/Next + Tailwind)

**Component split:**
- `ActionPlannerScreen` (server-fetches projects + clusters, or a client screen reading from a store/hook). Renders banner + header + form + three lanes.
- `ClusterSourceBanner` — props `{ name: string; farmerCount: number; onDismiss: () => void }`. Render nothing when no source.
- `NewProjectForm` — controlled; props `{ open, draft, clusterOptions, onChange(field,value), onCancel, onCreate }`. Keep the dashed-green card styling.
- `ProjectLane` — props `{ label, projects, accent: 'green'|'amber'|'purple', showUpdates: boolean, showDue: boolean, dimmed?: boolean, onOpen(project) }`. This single component covers all three lanes (Planned hides Updates; Completed hides Due and is dimmed).
- `ProjectCard` — props `{ project, accent, showUpdates, showDue, onClick }`. The metric row is a small `MetricStat` ({ value, label, valueClassName }).

**Lane config** (single source of truth):
```ts
const LANES = [
  { status:'active',    label:'Active Projects', accent:'border-l-green-800',  numClass:'text-green-800',  dot:'bg-green-800',  showUpdates:true,  showDue:true,  dim:false },
  { status:'planned',   label:'Planned',         accent:'border-l-amber-700',  numClass:'text-amber-700',  dot:'bg-amber-700',  showUpdates:false, showDue:true,  dim:false },
  { status:'completed', label:'Completed',       accent:'border-l-purple-700', numClass:'text-purple-700', dot:'bg-purple-700', showUpdates:true,  showDue:false, dim:true  },
];
```
Match exact hex to tokens: `#2E7D32` green-800/brand, `#1B5E20` green-900, `#F57F17` amber-800 (warn), `#7B1FA2` purple-700, `#E65100` orange-800 (due color), `#1A1C1A` ink, `#757575` neutral-500, `#9E9E9E` neutral-400, `#BDBDBD` neutral-350, `#E0E0E0` border, `#424242` neutral-700.

**Data hooks / props:**
- Needs `projects: Project[]` (filtered client-side into 3 lanes by `status`) and `clusters: FieldCluster[]` (for the select). In the real app these come from Prisma (`Project` table with `status` enum, `dueDate DateTime?`, `ownerName`/`ownerId`, `group`/`clusterId`, plus relations to a join of farmers and an `updates`/`ProjectUpdate` table). `farmerCount` = count of related farmers; `updateCount` = count of related updates — compute server-side or via `_count`.
- `createProject` should be a server action (`POST /projects`) inserting status `planned`; optimistic update optional. Preserve the title-required guard.
- Card click routes to `/actions/[projectId]` (Project Detail). Keep sidebar "Action Planner" highlighted on that route (the original treats `projectDetail` as the actions nav being active).

**Gotchas:**
- `proj.due` is shown raw ISO. Decide whether to keep raw or format (`dd MMM`); if you change it, do it consistently and note it — original is unformatted.
- New project always enters **Planned**, never Active — don't let the form pick status.
- Banner `clusterSource` is currently decorative for creation (not wired into `createProject`); when porting you may legitimately wire the pre-selected cluster into the new project's `group`/`clusterId` and farmer set — flag as a deliberate improvement.
- Cancel doesn't reset the draft (original quirk).
- `s.projects` has a duplicate `id:2` and `id:3` across entries (data is demo-grade) — use a stable unique key (DB id) in the port, not the seed ids.
