# Screen Spec 26 — Audit Log

Source: `webapp/docs/original-design.dc.html`
Template slice: lines **2329–2394** (`<sc-if value="{{ isAudit }}">`)
Script refs: `isAudit` (2690), role gate `showAudit` (2700), nav `goToAudit` (3506), title map (2720), shared chrome header (143–158) / sidebar nav item (106–110).

---

## 1. PURPOSE & WHEN IT SHOWS

A read-only **system activity / data-change log** — a flat table of recent administrative and data events (creates, updates, deletes, config changes, exports) with timestamp, actor, action type, free-text detail, and source IP. It is the last item in the System Administration area, alongside User Management and System Settings.

**Visibility / gating**
- Renders only when `s.view === 'audit'`. In `renderVals`: `const isAudit = s.view === 'audit';` (line 2690), template `<sc-if value="{{ isAudit }}">` (2330).
- **Role-gated to System Admin only.** `const showAudit = R === 'sysadmin';` (line 2700). The sidebar nav entry that links here is itself wrapped in `<sc-if value="{{ showAudit }}">` (line 106). So for `regional`, `officer`, `central` personas the nav link is hidden and there is no in-app path to this view.
- Reached via:
  - Sidebar nav item "Audit Log" → `onClick="{{ goToAudit }}"` (line 107), and
  - A "View Audit Log" row on the Settings/admin screen → also `onClick="{{ goToAudit }}"` (line 309).
- `goToAudit` = `go('audit')` (line 3506). `go = v => () => this.setState({ view: v, step: 0, selectedFarmer: null })` (line 2652) → sets `view:'audit'`, resets wizard step and selected farmer.

**Header chrome** (shared, lines 143–146): title/subtitle come from the `titles` map (line 2720):
`audit: ['Audit Log', 'System activity & data changes']` → `viewTitle = "Audit Log"`, `viewSub = "System activity & data changes"`.
Because this is sysadmin-only, the header also shows the **"Admin Mode"** orange pill (`<sc-if value="{{ isAdmin }}">`, line 153; `isAdmin = R === 'sysadmin'`, line 2702) and the green "Online · Synced" pill (always).

---

## 2. LAYOUT TREE (top → bottom) with Tailwind translations

This screen content sits inside the global shell: fixed 256px dark sidebar (`ml-[256px]` on main area, line 141) + sticky 64px white header (line 143). Below the header is the scrollable content padding (defined by the global content wrapper, not this slice). The slice itself is:

```
<sc-if isAudit>
└─ div  (fade-in wrapper)            animation: fadeUp 0.4s ease-out
   └─ Card  (the whole table)         white, rounded, hairline border, soft shadow, overflow hidden
      ├─ Header row (column titles)    5-col grid, grey bg
      └─ 8 × Data row                  5-col grid, hairline bottom border (last row none)
```

### 2a. Fade wrapper (line 2331)
- `style="animation:fadeUp 0.4s ease-out;"`
- Tailwind: `animate-[fadeUp_0.4s_ease-out]` (define `fadeUp` keyframes globally: translateY(8px)+opacity:0 → 0/1). Apply on mount.

### 2b. Table Card (line 2332)
- `background:white` → `bg-white`
- `border-radius:14px` → `rounded-[14px]`
- `box-shadow:0 1px 3px rgba(0,0,0,0.04)` → `shadow-[0_1px_3px_rgba(0,0,0,0.04)]`
- `border:1px solid rgba(0,0,0,0.03)` → `border border-black/[0.03]`
- `overflow:hidden` → `overflow-hidden`

### 2c. Header row (lines 2333–2335)
- Container: `display:grid; grid-template-columns:0.8fr 0.7fr 0.6fr 1.5fr 0.5fr`
  → `grid grid-cols-[0.8fr_0.7fr_0.6fr_1.5fr_0.5fr]`
- `padding:14px 22px` → `px-[22px] py-[14px]`
- `background:#FAFAFA` → `bg-[#FAFAFA]`
- `border-bottom:1px solid #F0F0F0` → `border-b border-[#F0F0F0]`
- Text: `font-size:10.5px; font-weight:600; color:#9E9E9E; text-transform:uppercase; letter-spacing:0.5px`
  → `text-[10.5px] font-semibold text-[#9E9E9E] uppercase tracking-[0.5px]`
- 5 cells: `Timestamp`, `User`, `Action`, `Details`, `IP` (each a plain `<div>`).

### 2d. Data row (repeated 8×, lines 2336–2391)
Each row container:
- Same grid template as header: `grid grid-cols-[0.8fr_0.7fr_0.6fr_1.5fr_0.5fr]`
- `padding:13px 22px` → `px-[22px] py-[13px]`
- `border-bottom:1px solid #F8F8F8` → `border-b border-[#F8F8F8]` — **except the last row (8th, line 2385) which has NO border-bottom**
- `align-items:center` → `items-center`

Five cells per row:
1. **Timestamp** — `font-size:12px; color:#757575` → `text-xs text-[#757575]`
2. **User** — `font-size:12px; font-weight:600; color:#1A1C1A` → `text-xs font-semibold text-[#1A1C1A]`
3. **Action** — wrapper `<div>` containing a **pill badge**: `padding:2px 8px; border-radius:20px; font-size:10px; font-weight:600; display:inline-block` → `inline-block rounded-[20px] px-2 py-0.5 text-[10px] font-semibold`. Colors vary per action type (see §2e).
4. **Details** — `font-size:12px; color:#616161` → `text-xs text-[#616161]`
5. **IP** — `font-size:11px; color:#BDBDBD` → `text-[11px] text-[#BDBDBD]`

### 2e. Action pill color map (the only varying style — currently hard-coded per row)
| Action | bg | text | Tailwind |
|---|---|---|---|
| CREATE | `#E8F5E9` | `#2E7D32` | `bg-[#E8F5E9] text-[#2E7D32]` (green) |
| UPDATE | `#E3F2FD` | `#1565C0` | `bg-[#E3F2FD] text-[#1565C0]` (blue) |
| CONFIG | `#FFF3E0` | `#E65100` | `bg-[#FFF3E0] text-[#E65100]` (orange) |
| EXPORT | `#F3E5F5` | `#7B1FA2` | `bg-[#F3E5F5] text-[#7B1FA2]` (purple) |
| DELETE | `#FFEBEE` | `#C62828` | `bg-[#FFEBEE] text-[#C62828]` (red) |

These are the same semantic color families used elsewhere in the app (the segment/status color tokens at lines 2725–2726). Map them to a shared `auditActionStyles` lookup.

---

## 3. DATA

**Important:** Unlike most other screens, the Audit Log table is **100% static markup** — there is **no `sc-for` loop and no `{{ binding }}`** inside the table body. The only binding in the entire slice is the wrapping `<sc-if value="{{ isAudit }}">`. All eight rows are hand-written literal `<div>`s (lines 2336–2391). There is **no `auditLog` array** in `state` and none constructed in `renderVals` (confirmed via grep: the only `isAudit`/`audit` references are the view flag, the role gate, the nav handler, and the title entry).

The eight literal rows (the demo dataset to seed):

| # | Timestamp | User | Action | Details | IP |
|---|---|---|---|---|---|
| 1 | Jun 22, 10:42 | Raj Kumar | CREATE | New visit entry — Farmer: Sanjay Tiwari, Village: Achhnera | 192.168.1.45 |
| 2 | Jun 22, 09:15 | Rajesh Verma | UPDATE | Action project status changed: Kharif Pest Control → Active | 192.168.1.20 |
| 3 | Jun 22, 08:30 | Amit Yadav | CREATE | New farmer registered — Harish Rawat, Tundla, Firozabad | 10.0.0.88 |
| 4 | Jun 21, 18:45 | Vikash Mehta | CONFIG | System setting changed: GPS Mandatory → Enabled | 192.168.1.10 |
| 5 | Jun 21, 16:20 | Dr. Anita Sharma | EXPORT | Data export: All farmer records — Agra Region (CSV, 1,284 rows) | 10.0.0.12 |
| 6 | Jun 21, 14:10 | Vikram Singh | CREATE | New visit entry — Farmer: Mahesh Patel, Village: Sikandra | 10.0.0.55 |
| 7 | Jun 21, 11:00 | Vikash Mehta | DELETE | Removed inactive user: Ravi Sharma (Agri Officer, Hathras) | 192.168.1.10 |
| 8 | Jun 20, 17:30 | Deepak Verma | UPDATE | Lead status changed: Govind Pal → Converted | 10.0.0.88 |

**Mapping to the target data model (`AuditLog` entity).** Define a proper entity so the port is dynamic instead of hard-coded:

```prisma
model AuditLog {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())   // -> "Timestamp" (format "MMM d, HH:mm")
  user      User     @relation(...)    // -> "User" (display name)
  userId    String
  action    AuditAction                // enum CREATE|UPDATE|DELETE|CONFIG|EXPORT -> pill
  details   String                     // -> free-text "Details"
  ipAddress String                     // -> "IP"
}
enum AuditAction { CREATE UPDATE DELETE CONFIG EXPORT }
```

Cross-references for seeding realism (the actor names match real personas/users in the app):
- `Raj Kumar`, `Rajesh Verma`, `Dr. Anita Sharma`, `Vikash Mehta` are the four personas (lines 2662–2665).
- The detail strings reference real domain entities elsewhere in the demo: farmers (Mahesh Patel, Harish Rawat appear in `farmers`/project arrays), action projects ("Kharif Pest Control Drive — Agra", line 2618 → status `active`), lead conversion (Govind Pal, line 2622), and the GPS-mandatory config toggle (a System Settings option). Seed accordingly so the log feels consistent with the rest of the demo data.

---

## 4. INTERACTIONS

- **Inbound only.** The table itself has **no `onClick`, `onChange`, hover, or active handlers** — every row is purely presentational. There are no row clicks, no filters, no pagination, no sort controls, no export button in this slice.
- The only interaction associated with this screen lives **outside** the slice: the two entry points that navigate to it (`goToAudit`, lines 107 & 309) which run `setState({ view:'audit', step:0, selectedFarmer:null })`.
- Sidebar nav item dynamic styling (line 107) is the standard `nv('audit')` treatment (lines 3509 / 2706–2713): when active, `navBgAud` = `rgba(255,255,255,0.12)`, `navClAud` = `#ffffff`, `navWAud` = `600`; otherwise transparent / `rgba(255,255,255,0.6)` / `400`. Plus `style-hover="background:rgba(255,255,255,0.08)"` → `hover:bg-white/[0.08]`.

---

## 5. ROLE DIFFERENCES, EMPTY STATES, DYNAMIC STYLING

- **Role:** sysadmin-only. For all other roles the nav link is absent (`showAudit` false) and the view is unreachable through the UI. In the React port, also guard the route/page server-side so a non-admin can't deep-link to it.
- **Empty state:** none designed (the demo always has 8 rows). When porting to a real `AuditLog` table, add an empty state for zero rows, e.g. a centered muted message inside the card ("No audit events yet"). Suggested: `py-16 text-center text-sm text-[#9E9E9E]`.
- **Dynamic styling:** the only data-driven styling is the **action pill color** (§2e), which in the source is hard-coded per row but must become a lookup by `action` in the port. No hover/active states on rows.
- **Last-row border:** row 8 (line 2385) intentionally drops `border-bottom`. In a `.map()` port, apply the bottom border with `not-last:border-b` semantics, e.g. `[&:not(:last-child)]:border-b border-[#F8F8F8]` (or conditionally on index).

---

## 6. PORT NOTES

**Component split**
- `AuditLogPage` (App Router `app/(admin)/audit/page.tsx`) — server component; enforces `role === 'SYSADMIN'` (redirect/404 otherwise), fetches rows, renders the title chrome (shared layout already supplies sidebar + header; just feed `viewTitle="Audit Log"`, `viewSub="System activity & data changes"`).
- `AuditTable` — the white card: header row + maps over rows.
- `AuditRow` — one grid row (5 cells). Receives `{ timestamp, userName, action, details, ip, isLast }`.
- `AuditActionBadge` — the pill; takes `action: AuditAction`, looks up bg/text from `auditActionStyles` map.

**Data hook / source**
- Server-fetch from Prisma: `prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: N, include: { user: true } })`. The demo is sorted newest-first (Jun 22 → Jun 20) — preserve `orderBy createdAt desc`.
- Format timestamp to `"MMM d, HH:mm"` (e.g. `Jun 22, 10:42`) — note the demo shows **no year** and 24-hour time.
- No props from parent beyond the row list; this is a leaf, read-only screen.

**Gotchas**
1. There is **no source array / no loop / no bindings** in the original — do not go hunting for an `auditLog` state field; it doesn't exist. You are inventing the data layer here. Faithfully reproduce the 8 demo rows as seed data so the screen looks identical on first load.
2. Grid columns are fractional (`0.8 0.7 0.6 1.5fr 0.5`); keep the exact ratios via `grid-cols-[0.8fr_0.7fr_0.6fr_1.5fr_0.5fr]` so column widths match pixel-for-pixel. The Details column (1.5fr) is the widest.
3. Last row must omit the bottom border.
4. Action enum has **5** values (CREATE/UPDATE/DELETE/CONFIG/EXPORT) — CONFIG and EXPORT are extra beyond the usual CRUD trio; don't drop them.
5. Color tokens reuse the app-wide semantic families (green/blue/orange/purple/red) — centralize them so they stay consistent with status/segment chips elsewhere.
6. Enforce the sysadmin gate at the route level, not just by hiding the nav link.

---

### SUMMARY (3–5 lines)
The **Audit Log** is a sysadmin-only (`view==='audit'`, `showAudit = R==='sysadmin'`), read-only single-card table of recent system/data-change events with five columns: Timestamp, User, color-coded Action pill (CREATE/UPDATE/DELETE/CONFIG/EXPORT), free-text Details, and source IP. In the original DSL it is **entirely static markup** — eight hand-written rows, no `sc-for`, no `{{ bindings }}` beyond the wrapping `<sc-if isAudit>`, and **no underlying state array** — so the port must introduce a new `AuditLog` Prisma entity (createdAt, user, action enum, details, ipAddress) seeded with the eight demo rows and queried `orderBy createdAt desc`. It has zero in-table interactions (no clicks/filters/sort/pagination); the only handler is `goToAudit` navigation from the sidebar and the Settings screen. Pixel-faithful rebuild hinges on the fractional 5-col grid `0.8/0.7/0.6/1.5/0.5fr`, the per-action pill color map, and dropping the bottom border on the final row.
