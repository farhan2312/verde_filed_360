# Enable connection pooling (PgBouncer) for Verde Field Intel

**Why:** the app runs on serverless (Vercel), and `DATABASE_URL` currently connects
**directly** to Azure Postgres on port **5432** with no pooling. Every request opens fresh
SSL connections; under load Azure's connection cap is exhausted and pages (e.g. the Visit
Repo) hang for a long time. Routing the app through Azure's built-in **PgBouncer** pooler
(port **6432**) makes serverless functions reuse a small pool instead — this is the single
biggest speed win left.

**Good news:** no code change is needed. `prisma/schema.prisma` already declares both
`url = env("DATABASE_URL")` and `directUrl = env("DIRECT_URL")`, which is exactly the
pooled-app + direct-migrations setup. You only change two env vars and one Azure setting.

Current values (for reference):
- Host: `cosmosdb1.postgres.database.azure.com`
- Database: `verde_field_360`
- `DATABASE_URL` and `DIRECT_URL` both point at port **5432** today.

> The same `cosmosdb1` server also hosts UA Agro's `ua_agro_field_360` database. Turning
> `pgbouncer.enabled` on is a **server-level** parameter, so step 1 affects both databases
> and the brief restart hits both apps. The env-var changes in step 2 are per-app, so Verde
> and UA Agro can move onto the pooler independently once the parameter is on.

---

## Step 1 — Turn on PgBouncer in Azure (2 min)

1. Azure Portal → your **Azure Database for PostgreSQL flexible server** (`cosmosdb1`).
2. Left menu → **Settings → Server parameters**.
3. Search **`pgbouncer.enabled`** → set to **`true`** (ON).
4. (Recommended, while you're here) search **`pgbouncer.pool_mode`** → confirm it is
   **`TRANSACTION`** (the default; required for the serverless pooling pattern below).
5. Click **Save**. Applying this parameter may restart the server (a short blip) — do it in
   a low-traffic window, and note the daily sales sync runs at **20:30 UTC** (02:00 IST).
   PgBouncer then listens on port **6432** on the same hostname.

> If you don't see `pgbouncer.*` parameters: PgBouncer is only on the **Flexible Server**
> tier (not Single Server) and not on the Burstable compute tier. If it's missing, use the
> **fallback** in the appendix instead.

---

## Step 2 — Update the environment variables

Edit `.env` at the repo root (and set the **same** values in **Vercel → Project → Settings →
Environment Variables** for Production, since that's what the deployed app reads).

**`DATABASE_URL`** — point the APP at the pooler (port **6432**, add `pgbouncer=true` and a
small `connection_limit`):

```
DATABASE_URL="postgresql://<user>:<password>@cosmosdb1.postgres.database.azure.com:6432/verde_field_360?sslmode=require&pgbouncer=true&connection_limit=1"
```

**`DIRECT_URL`** — keep migrations on the DIRECT port **5432** (no pgbouncer flag):

```
DIRECT_URL="postgresql://<user>:<password>@cosmosdb1.postgres.database.azure.com:5432/verde_field_360?sslmode=require"
```

Keep the existing `<user>` and `<password>` exactly as they are now — only the **port** and
the **query parameters** change on `DATABASE_URL`. (If `DIRECT_URL` is currently identical to
`DATABASE_URL`, this split is the whole point: app → 6432 pooled, migrations → 5432 direct.)

If the password contains a reserved character it must stay **percent-encoded** in both URLs,
exactly as it is today — e.g. `!` is written `%21`. Copying the raw password in breaks the
connection string.

Why these flags:
- **`pgbouncer=true`** — tells Prisma it's talking to PgBouncer in transaction mode, so it
  disables prepared statements (which don't survive transaction pooling). Without it you'll
  get "prepared statement already exists" errors.
- **`connection_limit=1`** — on serverless, each function instance should hold at most one
  connection to the pooler; the pooler fans many instances onto a few real DB connections.
  (If you run on a long-lived server instead of serverless, `5–10` is fine.)

---

## Step 3 — Redeploy and verify

1. Redeploy the app (Vercel: push to `main` or **Redeploy** the latest; or restart your
   host) so it picks up the new `DATABASE_URL`.
2. Open **`/api/health`** — it reports whether each env var actually resolved. A var that is
   present in the Vercel dashboard but arrives as an empty string has bitten this project
   before, and it looks exactly like a database outage.
3. Open the **Visit Repo** — it should now load in about a second instead of hanging.
4. Confirm migrations still work (they use `DIRECT_URL` on 5432):
   ```bash
   npx prisma db push
   ```
   It should connect and report "in sync" with no errors.
5. Check the **sales sync** still runs: Settings → run it on demand once, or wait for the
   20:30 UTC cron and confirm the run card reports a completed window. The sync writes in
   long transactions, which is the workload most sensitive to transaction pooling.
6. (Optional) In Azure → **Monitoring → Metrics**, watch **Active Connections** — it should
   stay low and flat under load instead of spiking to the cap.

---

## Rollback

If anything misbehaves, set `DATABASE_URL` back to the original port **5432** value (drop
`&pgbouncer=true&connection_limit=1`) and redeploy. You can leave `pgbouncer.enabled = true`
on the server; it does nothing unless the app connects on 6432.

---

## Appendix — fallback if PgBouncer isn't available

If your tier doesn't offer `pgbouncer.*` (e.g. Burstable compute), a partial mitigation is to
bound how many direct connections each serverless instance opens, so they can't exhaust
Azure's cap. Keep port **5432** but add:

```
DATABASE_URL="postgresql://<user>:<password>@cosmosdb1.postgres.database.azure.com:5432/verde_field_360?sslmode=require&connection_limit=5&pool_timeout=20"
```

This is weaker than PgBouncer (connections still have per-request SSL/handshake overhead and
aren't shared across instances), but it prevents the hard "too many connections" stalls. The
real fix remains PgBouncer on 6432, ideally after moving off Burstable compute if needed.
