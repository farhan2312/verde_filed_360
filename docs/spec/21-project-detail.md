# Screen Spec — Project Detail (Action Planner › Project)

Source: `webapp/docs/original-design.dc.html`
- Template slice: lines **1912–1977** (inside `<x-dc>`, gated by `<sc-if value="{{ isProjectDetail }}">`).
- Script bindings: `state` lines 2613–2648, `renderVals()` lines 3688–3754, helpers `avColors` (2779), role `R` (2653).

---

## 1. PURPOSE & WHEN IT SHOWS

The drill-in detail for a single **Project** (a field "action plan" / campaign in the Action Planner). It shows project metadata, the assigned farmer roster, and an activity/updates timeline you can post to, plus quick status-change actions.

- **Render gate:** `isProjectDetail = (s.view === 'projectDetail')` (line 2681). Shown only when `view === 'projectDetail'`.
- **How you get here:** From the **Action Planner** (`view === 'actions'`) by clicking a project card. Each project card's `onClick` runs `this.setState({ view:'projectDetail', selectedProject:p })` (lines 3693/3699/3705). So `selectedProject` is the full project object and is the sole data source for this screen.
- **Role-gating:** There is no explicit role check inside this screen. Reachability is inherited from the Action Planner, which is gated by `showActions = R === 'regional' || R === 'central' || R === 'officer' || R === 'sysadmin'` (line 2697). The `mobile` role has no Actions nav, so cannot reach this view through normal nav. All defensive bindings null-guard `selectedProject` (`(s.selectedProject||{})`), so a direct visit with no selection renders an empty shell.
- **Defensive note:** If `view==='projectDetail'` but `selectedProject` is null, all text fields resolve to `''`, status pill resolves to neutral grey (`#F5F5F5`/`#757575`, empty label), and both `sc-for` lists are empty. Handlers `addUpdate`/`markActive`/`markCompleted` early-return when `!s.selectedProject`.

---

## 2. LAYOUT TREE (top → bottom) with Tailwind

Root animates in: `style="animation:fadeUp 0.4s ease-out;"` → apply a `fade-up` entrance (keyframe: translateY + opacity; reuse the shared `animate-[fadeUp_0.4s_ease-out]` utility used across screens).

```
<div animate-[fadeUp_0.4s_ease-out]>                         ← screen root
├── Back link (onClick goBackToActions)
│     inline-flex items-center gap-1.5 text-[13px] text-[#757575]
│     cursor-pointer mb-5   hover:text-[#2E7D32]
│     content: "← Back to Action Planner"
│
└── Two-column grid
      grid grid-cols-[1fr_1.4fr] gap-[18px]
      (NOTE: fixed 2-col ratio, NOT responsive in the DSL. For our build make it
       `grid-cols-1 lg:grid-cols-[1fr_1.4fr]` so it stacks on mobile.)
      │
      ├── LEFT COLUMN  (flex flex-col gap-4)
      │     │
      │     ├── (A) Header card
      │     │     bg-white rounded-[14px] p-6
      │     │     shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]
      │     │     ├── Title row: flex justify-between items-start mb-4
      │     │     │     ├── Title: flex-1 pr-3 text-[18px] font-bold text-[#1A1C1A] leading-[1.3]
      │     │     │     │         → {{ selProjTitle }}
      │     │     │     └── Status pill: flex-none px-3 py-1 rounded-[20px]
      │     │     │           text-[11px] font-semibold
      │     │     │           bg=[{{selProjStatusBg}}] text=[{{selProjStatusColor}}]
      │     │     │           → {{ selProjStatusLabel }}
      │     │     ├── Meta list: flex flex-col gap-3
      │     │     │     each row: flex justify-between text-[13px]
      │     │     │       label span: text-[#9E9E9E]
      │     │     │       value span: font-semibold
      │     │     │     • "Owner"          value text-[#1A1C1A]   → {{ selProjOwner }}
      │     │     │     • "Due Date"       value text-[#E65100]   → {{ selProjDue }}
      │     │     │     • "Farmer Cluster" value text-[#1A1C1A]
      │     │     │            text-right max-w-[200px]            → {{ selProjGroup }}
      │     │     └── Action button row:
      │     │           flex gap-2 mt-4 pt-3.5 border-t border-[#F0F0F0]
      │     │           ├── "Set Active" (onClick markActive)
      │     │           │     flex-1 text-center px-4 py-[7px] rounded-lg
      │     │           │     text-[11px] font-semibold cursor-pointer
      │     │           │     bg-[#E8F5E9] text-[#2E7D32]  hover:bg-[#C8E6C9]
      │     │           └── "Complete" (onClick markCompleted)
      │     │                 flex-1 text-center px-4 py-[7px] rounded-lg
      │     │                 text-[11px] font-semibold cursor-pointer
      │     │                 bg-[#F3E5F5] text-[#7B1FA2]  hover:bg-[#E1BEE7]
      │     │
      │     └── (B) Assigned Farmers card
      │           bg-white rounded-[14px] p-6 shadow-[...] border border-black/[0.03]
      │           ├── Heading: text-[14px] font-bold text-[#1A1C1A] mb-3.5
      │           │       "Assigned Farmers"
      │           └── sc-for selProjFarmers as pf:
      │                 row: flex items-center gap-2.5 py-2.5
      │                      border-b border-[#F5F5F5]
      │                 ├── avatar: w-8 h-8 rounded-full flex items-center
      │                 │     justify-center font-bold text-[11px] text-white
      │                 │     flex-none  bg=[{{pf.bg}}]    → {{ pf.init }}
      │                 └── name: text-[13px] font-semibold text-[#1A1C1A]
      │                            → {{ pf.name }}
      │
      └── RIGHT COLUMN  (C) Activity Log card
            bg-white rounded-[14px] p-6 shadow-[...] border border-black/[0.03]
            ├── Heading: text-[14px] font-bold text-[#1A1C1A] mb-4  "Activity Log"
            ├── Add-update row: flex gap-2.5 mb-5
            │     ├── <input type=text> flex-1 px-3.5 py-2.5
            │     │     border-[1.5px] border-[#E0E0E0] rounded-[10px]
            │     │     text-[13px] outline-none box-border
            │     │     placeholder "Write an update..."
            │     │     value={{newUpdate}} onChange={{setNewUpdate}}
            │     │     focus:border-[#2E7D32]   (style-focus)
            │     └── "Post" button (onClick addUpdate)
            │           flex-none flex items-center px-5 py-2.5 rounded-[10px]
            │           bg-[#2E7D32] text-white text-[13px] font-semibold
            │           cursor-pointer  hover:bg-[#1B5E20]
            └── Timeline: sc-for selProjUpdates as upd:
                  row: flex gap-3.5 py-4 border-b border-[#F5F5F5]
                  ├── rail (flex-none, flex flex-col items-center):
                  │     dot:  w-2.5 h-2.5 rounded-full bg-[#2E7D32] flex-none
                  │     line: w-0.5 flex-1 bg-[#E0E0E0] mt-1
                  └── body (flex-1):
                        text: text-[13px] text-[#1A1C1A] leading-[1.6] mb-2
                               → {{ upd.text }}
                        meta: flex gap-3 text-[11px] text-[#BDBDBD]
                          ├── by:   font-semibold text-[#757575] → {{ upd.by }}
                          └── date: → {{ upd.date }}
```

### Style-token translation reference (inline → our tokens)
| Inline hex | Meaning | Tailwind / token |
|---|---|---|
| `#2E7D32` | brand green (primary) | `green-700` / `--brand` `#2E7D32` |
| `#1B5E20` | green hover (darker) | `green-800` |
| `#E8F5E9` / `#C8E6C9` | green-50 chip / hover | `green-50` / `green-100` |
| `#7B1FA2` | purple (completed) | `purple-700` |
| `#F3E5F5` / `#E1BEE7` | purple chip / hover | `purple-50` / `purple-100` |
| `#FFF8E1` / `#F57F17` | amber chip bg / planned text | `amber-50` / `amber-700` |
| `#1A1C1A` | primary ink | `--ink` (near-black) |
| `#757575` / `#9E9E9E` / `#BDBDBD` | muted text greys | `gray-500` / `gray-400` / `gray-350` |
| `#E65100` | due-date orange | `orange-800` |
| `#E0E0E0` / `#F0F0F0` / `#F5F5F5` | borders / dividers | `gray-200` / `gray-150` / `gray-100` |
| `#F5F5F5` (status fallback) | neutral pill bg | `gray-100` |
| shadow `0 1px 3px rgba(0,0,0,.04)` | card shadow | `shadow-[0_1px_3px_rgba(0,0,0,0.04)]` |
| border `rgba(0,0,0,.03)` | card hairline | `border-black/[0.03]` |
| radius 14px / 20px / 10px / 8px | cards / pill / input&Post / chips | `rounded-[14px]` / `rounded-[20px]` / `rounded-[10px]` / `rounded-lg` |

Card spec is identical to other detail cards in the app (Farmer Detail etc.) — extract a shared `<Card>` wrapper.

---

## 3. DATA

Single source: **`state.selectedProject`** — a `Project` object. All `selProj*` bindings null-guard it.

### Project entity (from `state.projects[]`, lines 2613–2631)
```ts
type Project = {
  id: number;                 // NOTE: demo ids are NOT unique (two id:2 rows). Real schema must use a real PK/cuid.
  title: string;              // e.g. "Kharif Pest Control Drive — Agra"
  status: 'active'|'planned'|'completed';
  owner: string;             // person name, e.g. "Raj Kumar"
  due: string;               // ISO-ish date string "2026-07-15" (rendered verbatim — see gotcha)
  group: string;             // farmer-cluster label, e.g. "Pest-affected wheat farmers (Agra)"
  farmerIds: number[];       // FK list into Farmer (carried but NOT rendered here)
  farmers: string[];         // denormalized farmer display names (rendered)
  updates: { text:string; by:string; date:string }[];  // activity log, newest-first
};
```

### Binding → data map
| Binding (line) | Resolves to | Notes |
|---|---|---|
| `isProjectDetail` (2681) | `view==='projectDetail'` | render gate |
| `selProjTitle` (3724) | `selectedProject.title` | |
| `selProjStatusLabel` (3729) | map `{active:'Active',planned:'Planned',completed:'Completed'}[status]` else `''` | |
| `selProjStatusBg` (3730) | map `{active:'#E8F5E9',planned:'#FFF8E1',completed:'#F3E5F5'}[status]` else `'#F5F5F5'` | dynamic pill bg |
| `selProjStatusColor` (3731) | map `{active:'#2E7D32',planned:'#F57F17',completed:'#7B1FA2'}[status]` else `'#757575'` | dynamic pill text |
| `selProjOwner` (3725) | `selectedProject.owner` | |
| `selProjDue` (3726) | `selectedProject.due` | raw string, no formatting |
| `selProjGroup` (3727) | `selectedProject.group` | farmer cluster label |
| `selProjFarmers` (3732) | `(selectedProject.farmers||[]).map((name,i)=>({ name, init, bg }))` | see derivation |
| `selProjUpdates` (3733) | `(selectedProject.updates||[]).map(u=>({...u}))` | array as stored (newest-first) |
| `newUpdate` (3734) | `state.newUpdate` (string, init `''` @2635) | controlled input value |

**`selProjFarmers` derivation (line 3732):**
- `name` = the raw display name string.
- `init` = `name.split(' ').map(n=>n[0]).join('')` → initials of every word (e.g. "Ramesh Kumar" → "RK"; single word → 1 letter; can be 3+ letters for 3-word names).
- `bg` = `avColors[i % avColors.length]` where `avColors = ['#2E7D32','#1565C0','#E65100','#7B1FA2','#F57F17','#C62828','#00695C','#4527A0']` (line 2779) — index by **position in this project's farmer list**, cycling the 8-color palette.

**`sc-for` loops:**
- `selProjFarmers` (template 1940) — `hint-placeholder-count="3"` (skeleton hint only).
- `selProjUpdates` (template 1958) — `hint-placeholder-count="2"`.

**`sc-if`:** only one, the screen gate `isProjectDetail` (1913). No inner conditionals.

**Note:** `farmerIds` and the project↔Farmer FK relationship exist in data but are NOT used on this screen — only the denormalized `farmers` string array is displayed. In the real schema, render farmers via the relation and compute initials/colors client-side.

---

## 4. INTERACTIONS

| Element | Event | Handler (line) | Behavior |
|---|---|---|---|
| Back link | onClick | `goBackToActions` (3754) | `setState({ view:'actions', selectedProject:null })` → navigates to Action Planner and clears selection. |
| "Set Active" chip | onClick | `markActive` (3742) | If no `selectedProject`, no-op. Else immutably map `projects` setting this project's `status:'active'`, re-find the updated project, `setState({ projects:updated, selectedProject:sp })`. Status pill + colors update reactively. |
| "Complete" chip | onClick | `markCompleted` (3748) | Same as above but `status:'completed'`. |
| Update text input | onChange | `setNewUpdate` (3735) | `setState({ newUpdate: e.target.value })` — controlled field. |
| "Post" button | onClick | `addUpdate` (3736) | Guard: if `!newUpdate.trim()` or no `selectedProject`, no-op. Else prepend a new update `{ text:newUpdate, by:'Rajesh Verma', date:'Jun 22' }` to this project's `updates` (newest-first), immutably update `projects`, re-find updated project, `setState({ projects:updated, selectedProject:sp, newUpdate:'' })` (clears the input). |

Behavioral details / gotchas:
- **Author + date are HARD-CODED** in `addUpdate`: `by:'Rajesh Verma'`, `date:'Jun 22'`. In the real app, `by` must be the current user's name and `date` the real timestamp.
- **Status change is unconditional** — both chips are always visible and active regardless of current status (you can "Complete" an already-completed project, "Set Active" an active one). No disabled/active visual state for the current status. Port should keep parity but consider disabling the chip matching the current status.
- All mutations are local-state only in the demo. In the target app these become server mutations: `PATCH /projects/:id` (status) and `POST /projects/:id/updates`, then revalidate.
- The new-update insert is **prepend** (newest at top); the timeline renders in array order, so newest appears first.

---

## 5. ROLE DIFFERENCES, EMPTY STATES, DYNAMIC STYLING

**Role differences:** None inside the screen — content is identical for every role that can reach it (`regional`, `central`, `officer`, `sysadmin`). Reachability is the only gate (Action Planner access). `mobile` role cannot reach it via nav. There is no view-only vs edit distinction in the DSL; all roles see the editable input and status chips. (Port decision: consider whether `central` should be read-only; not enforced in the original.)

**Empty states:**
- **No farmers assigned** (`farmers:[]`, e.g. demo project id:3 has 2, but `newProject` created via Action Planner starts with `farmers:[]` — line 3718): the Assigned Farmers card shows only its heading with no rows. There is **no explicit empty-state message** — port should add one (e.g. "No farmers assigned yet").
- **No updates** (`updates:[]`, e.g. demo "Potato Cold Storage Awareness"): timeline area is empty (only the input row shows). No empty message in the original — add one (e.g. "No activity yet").
- **No selectedProject:** entire screen renders as an empty shell (blank title, neutral grey pill with empty label, no rows). Defensive guards prevent crashes.

**Dynamic styling:**
- Status pill `background` / `color` are interpolated from status via lookup maps (see §3). The neutral fallback `#F5F5F5`/`#757575` handles unknown/empty status.
- Avatar `bg` is per-farmer from the cycling `avColors` palette by list index.
- **hover (`style-hover`):** back link → text `#2E7D32`; "Set Active" → bg `#C8E6C9`; "Complete" → bg `#E1BEE7`; "Post" → bg `#1B5E20`.
- **focus (`style-focus`):** update input border → `#2E7D32`.
- The timeline connector line (`width:2px; flex:1; background:#E0E0E0`) draws under every dot including the last row, so visually the line continues past the final entry (no "last item has no line" logic). Replicate as-is, or optionally suppress on the last item in the port.

---

## 6. PORT NOTES (Next.js 14 / TS / Tailwind)

**Component split:**
- `ProjectDetailScreen` (route segment, e.g. `app/(app)/actions/[projectId]/page.tsx` or a client view switched by app state) — orchestrates layout grid + back link, fetches the project.
- `ProjectHeaderCard` — title, `StatusPill`, meta rows, status-action chips. Props: `{ project, onSetActive, onComplete }`.
- `StatusPill` — shared component; takes `status: 'active'|'planned'|'completed'`; owns the bg/text/label maps (reuse on Action Planner cards too).
- `AssignedFarmersCard` — props `{ farmers: {name,init,bg}[] }` (or `{ farmers: Farmer[] }` and compute inside). Reuse the avatar-initials + `avColors` helper shared across screens (extract `getAvatarColor(index)` / `getInitials(name)` utils).
- `ActivityLogCard` — props `{ updates, onPost(text) }`; owns local `newUpdate` input state OR lifts it up. Renders `UpdateTimeline`.
- `UpdateTimeline` / `TimelineItem` — dot+line rail + body. Consider suppressing the connector on the last item.

**Data hooks / props:**
- Server: load `Project` by id with its `updates` (ordered desc by createdAt) and related `farmers` (via `farmerIds`/relation). A `useProject(projectId)` hook (React Query / RSC fetch) is the single data dependency.
- Mutations: `updateProjectStatus(projectId, status)` and `addProjectUpdate(projectId, text)`; on success revalidate the project query. Both should set `by` = current user and `date` = `now` (replace the hard-coded `'Rajesh Verma'` / `'Jun 22'`).
- The current user comes from session/role context (already used elsewhere for nav gating).

**Schema mapping (Prisma):**
- `Project { id, title, status (enum: active|planned|completed), owner (or ownerId FK→User), due (DateTime), group/clusterId (FK→Cluster or string label), farmers (relation via ProjectFarmer or m2m to Farmer), updates ProjectUpdate[] }`.
- `ProjectUpdate { id, projectId FK, text, authorId FK→User (renders as name), createdAt }`.
- `due` is rendered as a raw string today (`"2026-07-15"`). Decide on display formatting in the port (the demo shows it unformatted in orange) — keep ISO or format consistently; spec parity = raw string.
- `group` should likely become a FK to `Cluster` (the "Farmer Cluster" concept) rather than a free-text label.

**Gotchas:**
1. Demo `Project.id` values are **not unique** (two rows share `id:2`). Do not rely on the demo ids; use real PKs. The status-change handlers match by `id`, so duplicate ids would mutate the wrong/multiple rows — non-issue with a real PK.
2. Status chips are always enabled and don't reflect the current status — preserve parity but consider disabling the matching chip.
3. Author/date on new updates are hard-coded — must be replaced with real user + timestamp.
4. Empty states for farmers and updates are unstyled (heading only) — add friendly empty messages.
5. Grid is fixed `1fr 1.4fr`, not responsive — make it stack (`grid-cols-1 lg:grid-cols-[1fr_1.4fr]`) for mobile.
6. Initials logic joins first letters of ALL words — can produce 3+ char initials; keep avatar text small (`text-[11px]`) or truncate.
7. All state is in-memory demo mutation; replace with server mutations + revalidation, and clear the input on success only.
