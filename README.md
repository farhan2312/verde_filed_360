# Verde Field Intel — Verde Agrotech

Field data-capture & analytics platform for Verde Agrotech's field team (Agricultural Specialist
Sales Representatives). Sister deployment of the UA Agro Field 360 app — same codebase,
**separate database and Verde branding**. Built with **Next.js + TypeScript + Tailwind CSS**,
backed by **Azure PostgreSQL** via **Prisma**.

## Stack

- **Next.js 14** (App Router) — UI + server API
- **TypeScript** + **Tailwind CSS**
- **Prisma** ORM → **Azure Database for PostgreSQL** (`verde_field_360`)
- **react-leaflet** (OpenStreetMap) for the Map View
- Deploy target: **Vercel**

## Getting started

```bash
npm install

# 1. Configure env
#    Copy .env.example to .env and fill in DATABASE_URL / DIRECT_URL / AUTH_SECRET.

# 2. Create the schema in Postgres (tables only — no data)
npm run db:push

# 3. Seed the sysadmin login
npm run db:accounts

# 4. Run
npm run dev   # http://localhost:3000
```

Master data (stores, BDMs, users) came from the ERP CSV exports via `scripts/import-verde-masters.ts`
(see `docs/verde-data-mapping.md`). Farmers and sales come from the ERP sales API — see below.

## Environment variables

See `.env.example`. Required:

| Var            | Description                                                    |
| -------------- | ------------------------------------------------------------- |
| `DATABASE_URL` | Azure Postgres connection string (keep `?sslmode=require`)    |
| `DIRECT_URL`   | Non-pooled connection for Prisma migrate (same value ok)      |
| `AUTH_SECRET`  | Long random secret for signing session JWTs (required for login) |

| `SALES_API_TOKEN` | Bearer token for the Verde ERP sales API (company id 2)          |
| `CRON_SECRET`  | Bearer secret the scheduler sends to `/api/cron/sales-sync`     |

Optional (WhatsApp Cloud API integration): `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_WABA_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_VERSION`.

## Sales sync (ERP API)

Sales are pulled from the ERP, not uploaded. `lib/sales-api.ts` calls the API for a bill-date window
(one call covers all stores); `lib/sales-sync.ts` feeds the records through the shared importer
(`lib/sales-import.ts`) — farmers are created by mobile, products resolve by item name, segments
recompute, and re-runs replace bills by invoice number so nothing duplicates. Every run is a
`SalesImport` row (`kind = API`) that can be rolled back from the Sales Sync page.

- **Daily**: `vercel.json` schedules `GET /api/cron/sales-sync` at 20:30 UTC (02:00 IST). It fetches
  the previous `sync.lookbackDays` days (default 1 = yesterday). Pause / lookback are in Settings → Sales Sync.
- **On demand**: Settings → Sales Sync, or the Sales Sync page — pick a window, "Run sync now", watch progress.
- **CLI**: `npm run sales:sync -- --from 2023-04-01 --to 2026-09-12` (backfill, month by month) or
  `npm run sales:sync` for the scheduled window.
- **Analytics**: `/sales-sync` — runs / bills / new customers over 30 days, per-day activity, bill-date
  coverage (gaps to re-fetch), and the run log.

Bills whose customer mobile is a placeholder (e.g. `1234567890`) are counted as *skipped* — there is
no farmer to attach them to.

## Authentication

Real auth (middleware protects every route). **Login is by Employee Code**.

Seed the sysadmin account: `npm run db:accounts`

| Employee Code | Password   | Role                       |
| ------------- | ---------- | -------------------------- |
| `VERDE999`    | `verde999` | System Admin (super admin) |

- **Sign in** at `/login` with employee code + password; **register** at `/register`
  (enter your employee code + requested role → **Pending** on the **Users** page → admin approves & assigns a role).
- Only the admin sees the **"view as role"** switcher; everyone else has their assigned role + sign out.
- Accounts created with the shared **default password** are forced to set a new password on first login
  (`/change-password`); the seeded admin account is exempt.

Generate `AUTH_SECRET`: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

## Deploying to Vercel

1. Push this repo to GitHub (`farhan2312/verde_filed_360`).
2. In Vercel → New Project → import the repo (root directory = repo root).
3. Add `DATABASE_URL`, `DIRECT_URL` and `AUTH_SECRET` in Project Settings → Environment Variables.
4. Build command is `npm run build` (runs `prisma generate` first). Deploy.
5. Run `npm run db:push && npm run db:accounts` once against the Azure DB (locally is fine).
6. Add `SALES_API_TOKEN` and `CRON_SECRET`; Vercel Cron picks up `vercel.json` on deploy.

## Branding

- Logo: `public/logo.svg` (full wordmark, used on login) and `public/logo-mark.svg` (leaf mark,
  used in the sidebar and as favicon).
- Palette lives in `tailwind.config.ts` — lime-green `brand` scale from the logo (`#A4C954`),
  navy `brand-900/950` (`#262250`) for the sidebar, orange `gold` accent (`#EDA942`).

## Data model

Each row is tagged `source = REAL | DEMO`. `REAL` rows come from the master-data imports; `DEMO`
rows are the curated showcase records from `scripts/seed-demo.ts` (not seeded by default for Verde).

Training screenshots under `public/training/` are regenerated from the running app with
`scripts/capture-training.ts`; the Training Center shows a placeholder until they exist.

See `docs/spec/` for the per-screen specifications derived from the original design.
