# apple-health-mcp

A remote [MCP](https://modelcontextprotocol.io) server that exposes your **Apple Watch / Apple Health** data to **every Claude surface** — claude.ai web, Claude Desktop, the Claude mobile app, and Claude Code — with near-fresh data.

Built in public. MIT licensed. Your health data and secrets never live in this repo — only code does.

## How it works

```
Apple Watch → iPhone HealthKit
   → Health Auto Export (iOS app) POSTs to /api/ingest every ~hour
   → Neon Postgres
   → /api/mcp (remote MCP server, this repo)
   → Claude (web · desktop · mobile · Claude Code)
```

HealthKit is iOS-only, so the data is pushed from your iPhone by the
[Health Auto Export](https://apps.apple.com/app/health-auto-export/id1115567069) app.
Local MCP servers can't reach claude.ai web/mobile, so this one is remote.

## Tools

| Tool | What it does |
|---|---|
| `list_metrics` | Discover available metrics (units, counts, date ranges) |
| `query_metric` | Query a metric over a range (raw / hourly / daily / avg / sum / min / max) |
| `list_workouts` | Workouts in a range, optionally by type |
| `query_events` | ECG, State of Mind, symptoms, medications, cycle tracking, HR notifications |
| `latest_snapshot` | Most recent value for every metric |
| `health_sql` | Read-only `SELECT` over `metric_samples`, `workouts`, `health_events` |

## Self-host

1. **Database** — provision Neon (Vercel Marketplace → Neon) and copy the connection string.
2. **Deploy** — deploy this repo to Vercel. Set env vars (see `.env.example`):
   - `DATABASE_URL` — your Neon string
   - `MCP_SECRET`, `INGEST_SECRET`, `COACH_WEB_SECRET` — `openssl rand -hex 32` each
   - `HEVY_API_KEY`, `CRON_SECRET` — for the daily HEVY sync (optional)
3. **Migrate** — `DATABASE_URL=... npm run db:migrate`.
4. **iOS push** — in Health Auto Export: **Automations → REST API**
   - URL: `https://<your-app>.vercel.app/api/ingest`
   - Header: `Authorization: Bearer <INGEST_SECRET>`
   - Format: JSON, all data types, schedule hourly.
5. **Connect Claude** — same URL everywhere: `https://<your-app>.vercel.app/api/mcp`
   - **Web / mobile / desktop (claude.ai):** add a Custom Connector with that URL.
     claude.ai requires OAuth, which this server implements: when prompted to sign
     in, an **Authorize** page opens — enter your `MCP_SECRET` as the access secret.
     That issues a 90-day token; no per-request URL secret.
   - **Claude Code:**
     `claude mcp add --transport http apple-health https://<your-app>.vercel.app/api/mcp --header "Authorization: Bearer <MCP_SECRET>"`

## Auth model

One secret per trust boundary, so a leak in one place does not open the others:

| Secret | Used by | Where it lives |
|---|---|---|
| `MCP_SECRET` | Claude Code bearer for `/api/mcp`; password on the OAuth `/authorize` page | Claude Code config, Routine env, your password manager |
| `INGEST_SECRET` | Bearer that Health Auto Export sends to `/api/ingest` | the HAE app |
| `COACH_WEB_SECRET` | Browser login at `/login`; HMAC key of the `coach_session` cookie | your password manager |
| `HEVY_API_KEY` | Server-side HEVY sync (read-only) | Vercel env only |
| `CRON_SECRET` | Bearer Vercel Cron sends to `/api/hevy/sync` | Vercel env only |

- Secrets are accepted **only** as `Authorization: Bearer <secret>`. The former
  `?key=` query parameter is gone: it put the secret into browser history, Vercel
  logs and screenshots.
- **Transition rule:** while `INGEST_SECRET` is unset, `/api/ingest` accepts
  `MCP_SECRET`, so an existing Health Auto Export setup keeps working. As soon as
  `INGEST_SECRET` is set, only it is accepted for ingest, and it is never accepted
  on `/api/mcp`. Same rule for `CRON_SECRET` on the sync route (`MCP_SECRET` stays
  valid there as a manual trigger).
- **claude.ai web/mobile/desktop** require OAuth, so the server ships a minimal,
  stateless OAuth 2.1 layer (discovery, dynamic client registration, PKCE). The
  `/authorize` step is gated by `MCP_SECRET` (entered as a password), so only the
  secret-holder can mint a token. Codes and tokens are HMAC-signed — no DB, no deps.
- **Browser** sessions are a separate HMAC token (`{t:"web"}`, key
  `COACH_WEB_SECRET`) in an HttpOnly cookie. An MCP access token never counts as a
  browser session and vice versa.
- `COACH_ENABLED=true` is required to register the coach write tools; without the
  flag the MCP endpoint exposes only the read tools.

## HEVY sync (optional)

`GET /api/hevy/sync` mirrors your HEVY workouts, sets, exercise templates and body
measurements into Postgres (`hevy_*` tables), read-only, so the coach never has to
transcribe sets by hand. It is stateless and idempotent: an empty table triggers a
backfill from 2026-01-01, later runs read `/workouts/events` since
`max(updated_at) - 1 day` and apply updates and deletions.

- Env: `HEVY_API_KEY` (HEVY app → Settings → Developer) and `CRON_SECRET`.
- `vercel.json` schedules it daily at 03:00 UTC; Vercel sends `Authorization: Bearer <CRON_SECRET>`.
- Manual run: `curl -H "Authorization: Bearer <MCP_SECRET>" https://<your-app>.vercel.app/api/hevy/sync`
- The server never writes to HEVY.

## Security notes

- Treat every secret like a password. Rotate `MCP_SECRET` together with the 90-day
  OAuth token TTL; rotating it re-prompts the claude.ai connector for the secret.
- For extra `health_sql` safety, point `DATABASE_URL` at a Postgres role granted
  only `SELECT`, or keep a separate read-only role for production.
- Custom Connectors require a paid Claude plan (Pro/Max/Team/Enterprise).

## Limitations

- iOS background limits make sync periodic (≈ hourly), not real-time.
- Data is a push from the phone; if the phone is offline, ingestion pauses.

## Develop

```bash
npm install
npm test          # Vitest (uses in-memory PGlite, no DB needed)
npm run dev
```
