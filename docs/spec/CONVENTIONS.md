# PORT CONVENTIONS — read before porting any screen

You are porting ONE screen of the UA Field Intel app from the original design-composer DSL
into the real **Next.js 14 (App Router) + TypeScript + Tailwind** project. Follow these rules
exactly so all screens stay consistent and the project builds.

## Golden rules
1. **Stay in your lane.** Only create/edit the files assigned to you (your route `page.tsx`,
   files under `components/<your-screen>/`, and at most one server-actions file
   `app/actions/<your-screen>.ts`). **Never edit** shared files: anything in `lib/`, the shell
   (`components/shell/*`, `app/(app)/layout.tsx`), `components/ui.tsx`,
   `components/interactive.tsx`, `components/icons.tsx`, `tailwind.config.ts`,
   `prisma/schema.prisma`. If you need a shared helper that doesn't exist, make it local to your
   component folder.
2. **Pixel-faithful.** Match the design. Your screen spec (`docs/spec/<nn>-<name>.md`) has the
   exact layout + Tailwind classes; the original markup is in `docs/original-design.dc.html` at
   the line range named in the spec. Reproduce paddings, font sizes (use arbitrary values like
   `text-[13.5px]`), radii (`rounded-[14px]` for cards), and colors.
3. **Server component fetches data; client components do interactivity.** Your `page.tsx` is a
   server component: import `{ prisma } from "@/lib/prisma"`, query, and pass typed plain data
   to client subcomponents. Mark interactive subcomponents `"use client"`.
4. **Tolerate a missing/empty DB.** Wrap your prisma reads in `try/catch`; on error or empty
   result, render the real layout with empty arrays / an `<EmptyState>`. The app must not crash
   before the DB is seeded.

## Architecture
- Routes live in `app/(app)/<route>/page.tsx` and inherit the sidebar+header shell automatically
  — **do not** render a sidebar/header yourself.
- Current role: `import { getRole } from "@/lib/session"` (server) → `RoleKey`. Gate role-specific
  UI with it (e.g. the per-role dashboards). Pass role to client children as a prop.
- Navigation: `next/link`; routes are in `lib/nav.ts`
  (`/dashboard /visits /visits/new /visits/[id] /farmers /farmers/[id] /map /clusters
  /master-data /analytics /leads /actions /actions/[id] /users /settings /audit`).
- Mutations: create `app/actions/<your-screen>.ts` with `"use server"` functions using prisma,
  then `revalidatePath(...)`. Name actions clearly; do not put them in another screen's file.

## Data layer (Prisma models — see prisma/schema.prisma)
`Store, Employee, User, Farmer, Sale, Visit, Project, ProjectUpdate, Cluster, FieldOption,
AuditLog, Setting`. Notes:
- Every row has `source: "REAL" | "DEMO"`. The 12 enriched demo farmers have
  `crop/land/segment/leadStatus/lat/lng/concerns/issues`; the ~88k real farmers have these
  **null** — always null-guard.
- Enums: `Segment(HIGH_VALUE|MEDIUM_VALUE|NEW_LOW|DORMANT)`,
  `LeadStatus(NEW|CONTACTED|FOLLOWUP|CONVERTED|DORMANT)`,
  `ProjectStatus(PLANNED|ACTIVE|COMPLETED)`, `Role(ASR|STORE_MANAGER|REGIONAL|CENTRAL|SYSADMIN)`.
  Convert enum↔display label with the maps in `lib/segments.ts`
  (`SEGMENT_ENUM_TO_LABEL`, `LEAD_ENUM_TO_LABEL`, etc.).
- For large lists (Farmer 360, Master Data) **paginate server-side** (`take`/`skip`, default 25–50)
  and read `?page=`/`?q=`/`?segment=` from `searchParams`. Map pins use only farmers with
  `lat != null` (the demo set).
- Analytics/dashboard chart constants (funnel, crops, heatmap, regions, asrs, activity,
  insights, dataQuality, landSegments, KPI cards, per-role banner stats, period pills) are in
  `lib/demo-metrics.ts` — import them, don't hardcode. Editable KPI values live in
  `Setting` key `kpi.data` (JSON) — read it and fall back to `DEFAULT_KPI`.

## Reuse these (import, don't reinvent)
- `@/lib/cn` → `cn(...)` class merge.
- `@/lib/format` → `initials`, `inr`, `grouped`, `avatarColor`.
- `@/lib/segments` → segment/lead labels + colors + enum maps.
- `@/lib/status` → `statusColor`, `ROLE_META`, `USER_STATUS_META`, `AUDIT_ACTION_META`,
  `PROJECT_STATUS_META`, `empBadge`.
- `@/lib/visit-types` → `visitTypeColor`, `followupNeeded`, `recommendationsFor`.
- `@/lib/map-layers` → `MAP_LAYER_PILLS`, `LAYER_LABELS`, `layerColor`, `LEGEND_META`,
  `LAYER_FILTER_OPTS`.
- `@/lib/store-utils` → `shortStoreName`, `storeColor`.
- `@/lib/roles` → personas, `viewTitle`, RBAC.
- UI primitives `@/components/ui` → `Card, SectionCard, Badge, Pill, Avatar, ProgressBar,
  StatTile, Stepper, EmptyState, SyncBadge`.
- Interactive `@/components/interactive` → `Toggle, Modal, ModalHeader` (client).
- Icons `@/components/icons` → `NavIcons`, `CaretUpDown, ShieldIcon, PlusIcon, SearchIcon,
  ChevronRight, ChevronLeft, CloseIcon, CheckIcon`. If you need a screen-specific icon, add it as
  a local inline SVG in your component folder.

## Tailwind tokens (already configured)
`canvas`; `brand`(50,100,150,200,300,400,500,600,700,900,950 + DEFAULT=600);
`gold`(DEFAULT,dark,50,100,200,600); `seg.high|medium|low|dormant`;
`info`(DEFAULT,light,50,600,900); `purple`(DEFAULT,light,dark,50,100,300,500,900);
`orange`(DEFAULT,light,50); `magenta`, `teal`, `brown`(DEFAULT,light), `steel`;
`danger`(DEFAULT,50); `ink`(DEFAULT,soft,700,600,500,muted,400); `surface`(50–400); `line`(DEFAULT,warm).
Shadows `shadow-card|sidebar|modal`. Animations `animate-fadeUp|countUp`.
For data-driven colors (segment/status/visit-type/map-layer hexes, gradients, % widths, conic/
heatmap) use inline `style={{...}}`; for static styling use Tailwind utilities.

## Edit modals (screens that edit: master-data, users, dashboard KPI)
Use `Modal` + `ModalHeader` from `@/components/interactive`. Build the field form inside, wire a
`"use server"` save action in your `app/actions/<screen>.ts`. See spec `27-admin-edit-modal.md`
for the modal's look (orange "SYSTEM ADMIN · EDIT" eyebrow, two-column field grid).

## Map View only
`react-leaflet` + `leaflet` are installed and `leaflet/dist/leaflet.css` is imported globally.
Leaflet needs `window`, so put the map in a `"use client"` component and load it via
`next/dynamic` with `{ ssr: false }`. Plot farmers with non-null lat/lng + store pins; color by
the selected layer via `layerColor` from `@/lib/map-layers`. Tooltip/side panel per the spec.

## Output
Replace the placeholder `page.tsx` with the real implementation. Keep TypeScript strict-clean
(no `any` unless unavoidable). Return a concise summary: files created, data queried, and any
deviation from the spec.
