# Screen Spec: Leads Pipeline

Source: `webapp/docs/original-design.dc.html`
- Template slice: lines **1978–2006** (inside `<x-dc>`).
- Script: state lines ~2585–2648, `renderVals()` lines ~2650–3808.
- Relevant data/logic: `leadCols` 3043–3048, `farmers` array 2727–2776, `stColors` 2778, view flags 2674–2704, titles 2717, nav item 81–86.

---

## 1. PURPOSE & WHEN IT SHOWS

A **Kanban-style funnel board** showing the farmer lead/engagement pipeline as columns by lead `status` (New → Contacted → Follow-up → Converted). Each column lists farmer "lead cards" with name, village, crop, land size, and last-visit date. It is a **read-only** board in this design — cards are NOT clickable and there is no drag-and-drop, no add button, no filter controls.

- **Rendered when** `state.view === 'leads'` → `isLeads = (s.view === 'leads')` (line 2679). The whole template slice is wrapped in `<sc-if value="{{ isLeads }}">`.
- **Page header** (rendered by the shared shell, not this slice): title `Lead Pipeline`, subtitle `Track farmer engagement funnel` (line 2717, `titles.leads`).
- **Role gating (nav visibility):** `showLeads = R === 'regional' || R === 'officer' || R === 'sysadmin'` (line 2696). The "Lead Pipeline" sidebar nav item (lines 81–86) only renders for those three roles; **Central Admin (`central`) has no nav entry** to reach this screen. The screen body itself is not role-filtered — if a `central` user somehow set `view='leads'`, the same board would render (data is identical for all roles; no per-role filtering of `leadCols`).

---

## 2. LAYOUT TREE (top → bottom) with Tailwind translation

The design uses a fixed light theme. Color tokens below map raw hex → suggested Tailwind/token names (define these in `tailwind.config` / CSS vars; values are exact from the DSL).

Color map used here:
- `#1A1C1A` → `text-ink` (near-black primary text)
- `#9E9E9E` → `text-muted` (neutral-400-ish)
- `#BDBDBD` → `text-faint` (neutral-350-ish)
- `#F0F0F0` → `bg-chip` (count pill background)
- `#2E7D32` green / `#1565C0` blue / `#E65100` orange / `#7B1FA2` purple → column status dots (see §3)
- Card surface: `white`, border `rgba(0,0,0,0.03)`, shadow `0 1px 3px rgba(0,0,0,0.04)`.

```
<sc-if isLeads>
 └─ div  [page wrapper]
    style: animation: fadeUp 0.4s ease-out
    → Tailwind: className="animate-fade-up"   (define @keyframes fadeUp: translateY+opacity)

    └─ div  [BOARD GRID — 5 columns]
       style: display:grid; grid-template-columns:repeat(5,1fr); gap:14px
       → className="grid grid-cols-5 gap-3.5"
       NOTE: 5 columns declared but only 4 data columns exist → 5th cell is empty (see §5).

       └─ sc-for col in leadCols  (4 iterations: New, Contacted, Follow-up, Converted)
          └─ div  [COLUMN]   (no explicit width; grid track gives equal width)

             ├─ div  [COLUMN HEADER]
             │  style: display:flex; align-items:center; gap:8px; margin-bottom:14px
             │  → className="flex items-center gap-2 mb-3.5"
             │
             │  ├─ div  [status dot]
             │  │  style: width:10px; height:10px; border-radius:50%; background:{{col.color}}
             │  │  → className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }}
             │  │
             │  ├─ div  [column title]
             │  │  style: font-size:13px; font-weight:700; color:#1A1C1A
             │  │  → className="text-[13px] font-bold text-ink"
             │  │  text: {{ col.title }}
             │  │
             │  └─ div  [count pill]
             │     style: font-size:11px; font-weight:600; color:#9E9E9E; background:#F0F0F0; padding:2px 8px; border-radius:10px
             │     → className="text-[11px] font-semibold text-muted bg-chip px-2 py-0.5 rounded-[10px]"
             │     text: {{ col.count }}
             │
             └─ div  [CARD STACK]
                style: display:flex; flex-direction:column; gap:10px
                → className="flex flex-col gap-2.5"

                └─ sc-for li in col.items  (one card per farmer in that status)
                   └─ div  [LEAD CARD]
                      style: background:white; border-radius:12px; padding:16px;
                             box-shadow:0 1px 3px rgba(0,0,0,0.04);
                             border:1px solid rgba(0,0,0,0.03)
                      → className="bg-white rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]
                                   border border-black/[0.03]"

                      ├─ div  [farmer name]
                      │  style: font-size:13px; font-weight:600; color:#1A1C1A; margin-bottom:4px
                      │  → className="text-[13px] font-semibold text-ink mb-1"
                      │  text: {{ li.name }}
                      │
                      ├─ div  [village · crop]
                      │  style: font-size:11px; color:#9E9E9E; margin-bottom:8px
                      │  → className="text-[11px] text-muted mb-2"
                      │  text: {{ li.village }} · {{ li.crop }}
                      │
                      └─ div  [card footer row]
                         style: display:flex; justify-content:space-between; align-items:center
                         → className="flex justify-between items-center"
                         ├─ div  [land]
                         │  style: font-size:10.5px; color:#BDBDBD
                         │  → className="text-[10.5px] text-faint"
                         │  text: {{ li.land }} acres
                         └─ div  [last visit]
                            style: font-size:10px; color:#9E9E9E
                            → className="text-[10px] text-muted"
                            text: {{ li.lastVisit }}
```

Pixel notes: `gap:14px` = `gap-3.5`; `gap:8px` = `gap-2`; `gap:10px` = `gap-2.5`; `mb:14px` = `mb-3.5`; `mb:4px` = `mb-1`; `mb:8px` = `mb-2`; padding `16px` = `p-4`; pill padding `2px 8px` = `py-0.5 px-2`; radii `12px`=`rounded-xl`, `10px` pill=`rounded-[10px]`, dot=`rounded-full`. Use arbitrary font-size utilities (`text-[13px]`, `text-[11px]`, `text-[10.5px]`, `text-[10px]`) — these are sub-Tailwind-scale.

---

## 3. DATA

### Iterables / loops
- **Outer `sc-for list="{{ leadCols }}" as="col"`** → array `leadCols` (lines 3043–3048). Exactly **4** entries, each shape `{ title, color, items, count }`:

  | title | color (status dot) | filter | count expr |
  |-------|--------------------|--------|------------|
  | `New` | `#2E7D32` (green) | `farmers.filter(f => f.status === 'New')` | same `.length` |
  | `Contacted` | `#1565C0` (blue) | `f.status === 'Contacted'` | `.length` |
  | `Follow-up` | `#E65100` (orange) | `f.status === 'Follow-up'` | `.length` |
  | `Converted` | `#7B1FA2` (purple) | `f.status === 'Converted'` | `.length` |

  **IMPORTANT:** `leadCols` filters the **raw `farmers`** array (NOT `farmersWithEdits`), so sysadmin inline edits in `s.farmerEdits` do **not** affect this board. When porting against a DB, decide intentionally whether to honor edits — recommend filtering the same source the rest of the app treats as canonical.

- **Inner `sc-for list="{{ col.items }}" as="li"`** → iterates the filtered farmer objects for that status.

### Source entity — `Farmer` (array `farmers`, lines 2727–2776; 12 demo rows)
Each farmer field used by a lead card (`li`):

| Binding | Field | Entity | Notes |
|---------|-------|--------|-------|
| `li.name` | `farmer.name` | Farmer | e.g. "A K Shukla" |
| `li.village` | `farmer.village` | Farmer | e.g. "Pipari" |
| `li.crop` | `farmer.crop` | Farmer | e.g. "Wheat" |
| `li.land` | `farmer.land` | Farmer | integer acres (rendered `{{li.land}} acres`) |
| `li.lastVisit` | `farmer.lastVisit` | Farmer | **NOT present on the base `farmers` rows** → resolves to `undefined` → renders **empty** in this demo. (A `lastVisit` field exists on farmer objects elsewhere in the app — e.g. map-view derivations referencing `f.lastVisit` lines 3192/3199/3336 — but the inline `farmers` array here never sets it.) See §5/§6. |

Column header bindings: `col.color` (dot bg), `col.title` (header text), `col.count` (pill number).

### Column membership in demo data (status distribution)
The 12 farmers' `status` values: `Contacted, High Value, Follow-up, New, High Value, Dormant, Contacted, Follow-up, Contacted, High Value, Follow-up, New`. Resulting board:

- **New (2):** Aadarsh Dwivedi (id 4, Rai Pur · Mustard · 6 acres), Aaminudeen (id 12, Tajpur · Wheat · 5 acres).
- **Contacted (3):** A K Shukla (id 1, Pipari · Wheat · 8), Aadesh Kumar (id 7, Pipri · Rice · 7), Adil Khan (id 9, Hajrata Pur · Wheat · 9).
- **Follow-up (3):** A P Singh (id 3, Bashant Pur · Rice · 10), Adesh Kumar Srivastav (id 8, Daulat Kheda · Sugarcane · 11), Aadarsh Verma (id 11, Sariya · Rice · 8).
- **Converted (0):** **empty column** in demo (no farmer has `status === 'Converted'`).

> Note the data model mixes **lead-status values** (`New/Contacted/Follow-up/Converted`) and **segment values** (`High Value`, `Dormant`) into the single `status` field. Farmers whose `status` is `High Value` (ids 2,5,10) or `Dormant` (id 6) appear in **NO column** and are silently dropped from the board. There is also a separate `leadStatus` field on each farmer (e.g. id 5 `leadStatus:'Converted'`) and a `segment` field — the board ignores both and keys solely off `status`. (See §6 for the port recommendation to key off a clean enum, likely `leadStatus`.)

---

## 4. INTERACTIONS

This slice has **no interactive elements** — there are **zero `onClick`/`onChange` handlers** in lines 1978–2006. Lead cards are static (unlike Recent-visit cards elsewhere which carry an `onClick` to `visitDetail`). No filters, no period pills, no "new lead" CTA, no column-collapse.

The only way to *reach* the screen:
- **Sidebar nav item** (lines 81–86): `onClick="{{ goToLeads }}"` → `goToLeads: go('leads')` (line 3605). `go = v => () => this.setState({ view:v, step:0, selectedFarmer:null })` (line 2652) → sets `view:'leads'`, resets `step` and `selectedFarmer`.
- Active-state styling of that nav item: `nv('leads')` (lines 2706–2713) → when active, `bg:rgba(255,255,255,0.12)`, `cl:#ffffff`, font-weight `600`; exposed as `navBgLead / navClLead / navWLead` (line 3611).

---

## 5. ROLE DIFFERENCES, EMPTY STATES, DYNAMIC STYLING

- **Role differences:** none in the board body — all roles see identical content. The only role effect is **reachability** via the nav item (`regional`, `officer`, `sysadmin` only; `central` cannot navigate here). No officer-scoped filtering (unlike Recent visits / Visit Repo which filter by `persona.name`).
- **Empty states:**
  - **Empty column** (e.g. `Converted` in demo): the column header (dot + title + `0` pill) still renders; the card stack `<div>` renders with no children. There is **no placeholder/"No leads" message** — just an empty space under the header. Port should keep this (optionally add a subtle empty hint).
  - **Empty `lastVisit`:** renders as an empty `<div>` (no fallback text) because the demo farmers lack the field.
- **Dynamic styling:**
  - **Status dot color** is data-driven: `background:{{ col.color }}` (inline interpolation, the only dynamic style on this screen). Map to `style={{ background: col.color }}` or a status→Tailwind class lookup.
  - **No `style-hover` / `style-active`** anywhere in this slice — cards have no hover affordance. (The nav item that opens the screen does have `style-hover="background:rgba(255,255,255,0.08)"`, but that's part of the shared sidebar, not this screen.)
  - **Entry animation:** wrapper `animation: fadeUp 0.4s ease-out` — port as an `animate-fade-up` keyframe (opacity 0→1, translateY ~8px→0).
- **5-vs-4 column quirk:** grid is `repeat(5,1fr)` but only 4 columns render → the 4 columns occupy 4 of 5 equal tracks, leaving a blank 5th track on the right (each column is narrower than if `grid-cols-4`). To be pixel-faithful keep `grid-cols-5`; if porting cleanly and the 5th status (e.g. `Lost`/`Recommendation`, both present in `stColors` line 2778) is intended, add a 5th column.

---

## 6. PORT NOTES (Next.js 14 + TS + Tailwind)

**Component split**
- `LeadsPipelineScreen` (server or client wrapper) — fetches/derives `leadCols`, renders the grid.
- `LeadColumn` (`{ title, color, count, items }`) — renders header (dot + title + count pill) and the card stack.
- `LeadCard` (`{ name, village, crop, land, lastVisit }`) — pure presentational.

**Data hook / derivation**
- Replace the inline filters with a server query or a `useLeads()` hook that groups farmers by lead status:
  ```ts
  const STATUSES = [
    { key: 'New',       title: 'New',       color: '#2E7D32' },
    { key: 'Contacted', title: 'Contacted', color: '#1565C0' },
    { key: 'Follow-up', title: 'Follow-up', color: '#E65100' },
    { key: 'Converted', title: 'Converted', color: '#7B1FA2' },
  ] as const;
  // leadCols = STATUSES.map(s => { const items = farmers.filter(f => f.leadStatus === s.key);
  //                                return { ...s, items, count: items.length }; });
  ```
- **Decide the source field.** The DSL keys off `farmer.status` which is overloaded (mixes lead status + segment). Prisma should model **`Farmer.leadStatus`** as a clean enum (`New | Contacted | FollowUp | Converted | Lost`) distinct from **`Farmer.segment`** (`HighValue | MediumValue | NewLow | Dormant`). Recommend the board group by `leadStatus`. (If you must reproduce the exact demo board, group by the legacy `status` field instead — that's what produces the 2/3/3/0 layout above.)
- **`lastVisit`** should be a real derived value in the port: `MAX(visit.date)` per farmer (from the `Visit` table / `visitLog`). The demo leaves it blank; the port should populate "Jun 18" style relative/short dates. Format as the design's short month-day strings (e.g. "Jun 18").

**Props/types**
```ts
type LeadCardData = { id: string; name: string; village: string; crop: string;
                      land: number; lastVisit: string | null };
type LeadColumnData = { key: string; title: string; color: string;
                        count: number; items: LeadCardData[] };
```

**Gotchas**
1. **Filters off raw `farmers`, not `farmersWithEdits`** — sysadmin edits don't reflect here in the original. Make this intentional in the port (recommend honoring canonical data).
2. **Overloaded `status` field drops `High Value`/`Dormant` farmers** from the board. Don't replicate that bug — key off `leadStatus`.
3. **`Converted` column empties** with current demo data — ensure empty columns render header + zero pill without crashing; consider an empty-state hint.
4. **5-track grid with 4 columns** — `grid-cols-5` is deliberate-looking but yields a blank right track. Match exactly for pixel fidelity, or switch to `grid-cols-4`/add 5th status; document the choice.
5. **No interactivity in original** — but this is the natural place to add card→`farmerDetail` navigation and (future) drag-to-restage. If adding click, mirror the Recent-visits pattern: `onClick={() => router.push('/farmers/' + li.id)}` and add `cursor-pointer` + a hover shadow.
6. Sub-scale font sizes (`13/11/10.5/10px`) and `10.5px` need arbitrary-value Tailwind utilities.
7. Header/title (`Lead Pipeline` / `Track farmer engagement funnel`) come from the **shared shell** (`titles.leads`), not this slice — wire via the layout, not the screen component.

---

## SUMMARY (3–5 lines)
Leads Pipeline is a static, read-only Kanban board (rendered when `view==='leads'`; nav-gated to regional/officer/sysadmin, not central) that groups farmers into 4 status columns — New, Contacted, Follow-up, Converted (color-dotted, with count pills) — inside a `grid-cols-5 gap-3.5` board. Each column lists lead cards showing `name`, `village · crop`, `land acres`, and `lastVisit`, derived by filtering the raw `farmers` array on `f.status` (lines 3043–3048). Data depends solely on the **Farmer** entity (`name, village, crop, land, status/leadStatus`) plus a derived `lastVisit` (max visit date) that is blank in the demo. There are **no handlers, filters, hover/active styles, or role-specific content** in the slice — the only dynamic style is the status-dot `background:{{col.color}}`; key porting risks are the overloaded `status` field (drops High-Value/Dormant farmers), the empty `Converted` column, the blank 5th grid track, and the unpopulated `lastVisit`.
