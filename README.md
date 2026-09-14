# TradeOps Nexus

[![CI](https://github.com/laulj/tradeops-nexus/actions/workflows/ci.yml/badge.svg)](https://github.com/laulj/tradeops-nexus/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> TradeOps Nexus consolidates spot, perpetual-futures, and funding-rate PnL from nine venues and every wallet you run — then turns it into live charts, spread tables, and totals you can act on.

**Live demo:** <https://tradeops-nexus.onrender.com/>

> [!NOTE]
> The live demo runs on Render, serving the API and the compiled SPA from a single
> service. No databases are committed, so it starts empty. Two ways to see a full
> dashboard: sign in with the shared sample account **`userDemo` / `demo123`** (its
> three-year history is generated the first time it signs in), or register your own
> account with **Populate with demo data**.

## What it does

- **Per-venue PnL, live** — spot and perpetual positions stream into one running total per address and symbol: balance, open PnL and realized profit, without tab-hopping.
- **Funding-rate spread desk** — compares the funding your position pays or earns across CEX and DEX perp venues, so rate shifts read as opportunities rather than surprises.
- **Aggregated profit analytics** — rolls intraday tick data up to daily, weekly and monthly totals; slice by exchange, symbol or wallet, and export the table as CSV.

Venues modelled out of the box: `bybit`, `gate`, `binance`, `osm`, `inj`, `dydx`, `hl`, `bolt`, `suil`.

Screens: marketing landing page, Dashboard, Funding-Rate comparison, Positions, Profit (aggregated + intraday), Balance, Admin > Users, and Status/Up-time.

## Tech stack

**Frontend** — React 19, TypeScript, Vite, Tailwind CSS 4, Ant Design 6 (`@ant-design/charts`, `@ant-design/plots`), TanStack Query, GSAP/ScrollTrigger, Vitest + Testing Library.

**Backend** — Node.js 22, Express 4, SQLite (`sqlite` + `sqlite3`), JWT auth (`jsonwebtoken`), Node `cluster` worker pool.

## Getting started

Requires **Node 22+** and **pnpm 11.24.0** (`corepack enable`, then `corepack prepare pnpm@11.24.0 --activate`).

```bash
git clone https://github.com/laulj/tradeops-nexus.git
cd tradeops-nexus
pnpm --dir backend install && pnpm --dir frontend install
```

Run the API and the SPA in two terminals:

```bash
# terminal 1 — API on http://localhost:8080
pnpm --dir backend dev

# terminal 2 — SPA on http://localhost:5173
pnpm --dir frontend dev
```

Open <http://localhost:5173> and sign in as **`admin` / `demo123`** — that is the development default, and the account is created automatically on first use. Set `ADMIN_PASSWORD` (see [Configuration](#configuration)) to choose your own; a production deployment requires it.

> [!IMPORTANT]
> The dev server proxies every API prefix (`/login`, `/register`, `/logout`, `/status`, `/users`, `/data`)
> to `VITE_BACKEND_TARGET`, which defaults to `http://localhost:8080`. If your API runs elsewhere, copy
> `frontend/.env.example` to `frontend/.env.local` (git-ignored) and set it there.

To run the **production build** from a single origin — the same path Render runs:

```bash
pnpm --dir frontend build && pnpm --dir backend build && pnpm --dir backend start
# then open http://localhost:8080
```

### Get a dashboard full of data

The quickest look around is the shared sample account: **`userDemo` / `demo123`**. Nothing about it is committed — its history is generated the first time it signs in — and it can only ever see the rows generated for it.

Prefer no account at all? Tick **Explore with sample data in a temporary session** on the register form: the server generates an account, seeds the same kind of history, and deletes it when the session expires (or when you sign out). **Keep this account** converts it into a permanent one by giving it a password.

To work from your own account instead:

1. Choose **Create an account**.
2. Tick **Populate with demo data**.
3. Sign in — the dashboard, spread tables and position views are already populated with about three years of plausible spot, perp-futures and funding-rate history for that account: roughly 600 arbitrage round-trips, weekly balance snapshots and closed positions at a monthly cadence.

Demo symbols: `USDC`, `ETH`, `BTC`, `SOL`, `ARB`, `WIF`, `TIA`, `TSLA`, `NVDA`. The generated data is synthetic — **no exchange API keys and no live credentials are involved.**

## Where is the data? (no `.db` files in this repository)

The SQLite databases are deliberately not committed — every clone builds its own:

- The first HTTP request runs `initMiddleware` (`backend/src/middleware.ts`), which opens `backend/db/{tx,spotFuture,fRate}.db` and, if a file is missing, creates it together with its full schema (`initDatabase` -> `createTables` / `createSpotFutureTables` / `createFRTables`).
- `ensureUsersTable` runs on every open: it creates the `users` table and seeds the `admin` bootstrap account, so signing in always works on a clean checkout.
- Passwords are keccak-256 hashed in the browser before they are sent; the server stores only the hash.
- Each data table carries a `username` column, so every row is scoped to its owner.
- The ingestion workers that fill these tables from live venues in production are not part of this public snapshot.

> [!TIP]
> The `backend/db/` folder is kept in the repository with a `.gitkeep` placeholder (see `backend/.gitignore`),
> because SQLite cannot create a database file inside a directory that does not exist. If you delete the
> folder, recreate it before starting the API.

Schema changes are applied automatically; **data** migrations are never run on boot. They are a manual, admin-only CLI:

```bash
pnpm --dir backend migrate:latest              # dry run
pnpm --dir backend migrate:latest -- --apply   # writes, with safety copies
```

## Data flow & deploys

Code lives in git; state lives on the disk. They never mix:

| Concern | Where it lives |
| --- | --- |
| Schema | this repository, applied automatically when a database is opened |
| Data | `TX_DB_PATH` / `SPOT_FUTURE_DB_PATH` / `FUNDING_RATE_DB_PATH` — on Render, a persistent disk mounted at `/data` |
| Snapshots | the admin **Export** button (all three files), plus `backups/` beside the databases after a restore |
| Restore | the admin **Restore database** panel in Settings: verify, stage, restart |

A staged restore is deliberately two-step. The upload is streamed to `<db>.pending`, checked with SQLite's own `PRAGMA integrity_check`, and swapped in when the service next starts — replacing a file the process holds open is how SQLite databases get corrupted, and the disk already restarts the service on every deploy. The file being replaced is snapshotted into `backups/` first, so a restore is undone by restoring that snapshot.

For bulk work without the UI, Render's SSH + `scp` (or `magic-wormhole`) moves files in and out of `/data`. Never copy a live database: `VACUUM INTO '/data/backups/x.db'` produces a consistent single file with no `-wal`/`-shm` sidecars to keep in step.

## API

The HTTP surface is described in [`docs/openapi.json`](docs/openapi.json) — an OpenAPI 3.1
document covering authentication, the account endpoints, the admin endpoints and every
`/data` read the dashboard makes. GitHub renders it, as do
[Swagger Editor](https://editor.swagger.io) and Redoc (`npx @redocly/cli preview-docs docs/openapi.json`).

It is hand-written, and kept honest by `backend/src/__tests__/openapi.test.ts`: the test
re-derives the route table from the source that registers it and fails when the two
disagree in either direction — a documented route that no longer exists, a new route that
isn't documented, or an entry excused under `x-internal-paths` whose route is gone. Adding
an endpoint therefore means editing the document, and the failure message says so.

Three things the document makes explicit:

- **Everything under `/data` needs a bearer token** and returns only the caller's rows.
- **`POST /playground/session` is the only way to get a populated account without
  credentials** — it returns a temporary one that deletes itself.
- **The ingestion writes (`POST /data/**/update`) are not modelled.** They are listed under
  `x-internal-paths` because their payloads belong to the worker that is not in this
  repository.

### Talking to it with curl

Passwords never travel as plain text: the browser keccak-hashes them and sends the 32 bytes
as an object keyed by byte index — that is the `KeccakPassword` schema. By hand that is
tedious, so hash once (from `backend/`, so the dependency resolves), then reuse it:

```bash
HASH=$(node -e 'const { keccak256 } = require("ethereum-cryptography/keccak"); const { utf8ToBytes } = require("ethereum-cryptography/utils"); process.stdout.write(JSON.stringify({ ...Array.from(keccak256(utf8ToBytes(process.argv[1]))) }))' demo123)

# The bootstrap admin, or any account you registered (the demo password is public).
TOKEN=$(curl -s http://localhost:8080/login -H 'content-type: application/json' \
    -d "{\"username\":\"admin\",\"password\":$HASH}" | sed -E 's/.*"accessToken":"([^"]+)".*/\1/')

curl -s http://localhost:8080/data/symbols -H "authorization: Bearer $TOKEN"

# Queries are POSTed bodies: pairs, paging and an optional window.
curl -s http://localhost:8080/data/profits-details/pairing/batch \
    -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
    -d '{"pairings":[{"baseSymbol":"ETH","quoteSymbol":"USDC"}],"page":1,"limit":5}'
```

No account at all is a one-liner — this is what the landing page's *Try the demo* button does:

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/playground/session | sed -E 's/.*"accessToken":"([^"]+)".*/\1/')
```

Admin-only routes answer `403` to everyone else (see `POST /admin/restore/{target}` for the
two-step restore, and `GET /usage` for the bandwidth budget behind the admin banner):

```bash
curl -s http://localhost:8080/usage -H "authorization: Bearer $TOKEN"
curl -s -X POST http://localhost:8080/admin/restore/tx -H "authorization: Bearer $TOKEN" \
    -H 'content-type: application/octet-stream' --data-binary @db/tx.db
```

The SPA talks to these same routes through `frontend/src/api/backend.ts`; those clients are
the typed reference for response shapes, which the document deliberately leaves loose.

## Configuration

Copy `frontend/.env.example` to `frontend/.env.local` to override the frontend values.

| Variable | Used by | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | backend | `8080` | HTTP port |
| `TX_DB_PATH` | backend | `./db/tx.db` | Spot database (also holds `users`) |
| `SPOT_FUTURE_DB_PATH` | backend | `./db/spotFuture.db` | Perp-futures database |
| `FUNDING_RATE_DB_PATH` | backend | `./db/fRate.db` | Funding-rate database |
| `DEMO_WINDOW_DAYS` | backend | `1095` | Length of the history seeded for a demo account (3 years) |
| `ADMIN_PASSWORD` | backend | `demo123` (development only) | Password for the bootstrap `admin` account. **Required when `NODE_ENV=production`**, because that account can list/delete users and download the raw databases |
| `JWT_SECRET` | backend | generated (`backend/secret.key`) | Signing key for session tokens. Set it in production: the generated file sits outside the persistent disk, so every deploy would invalidate all sessions |
| `DEMO_PASSWORD` | backend | `demo123` | Password for the shared `userDemo` sample account — intentionally public |
| `PLAYGROUND_ENABLED` | backend | _on_ | Set to `0` to switch the playground off |
| `PLAYGROUND_TTL_MS` | backend | `600000` | Lifetime of a playground session (10 minutes; extended while in use) |
| `PLAYGROUND_WINDOW_DAYS` | backend | `365` | History generated for a playground session |
| `MAX_PLAYGROUND_ACCOUNTS` | backend | `20` | Concurrent playground sessions before it reports itself full |
| `MAX_ACCOUNTS` | backend | `200` | Registered accounts, playground sessions included |
| `MAX_SESSIONS_PER_USER` | backend | `5` | Session tokens kept per account (newest first) |
| `MAX_DB_MB` / `MAX_DB_MB_AUX` | backend | `256` / `128` | Size ceiling per database file; past it SQLite refuses writes and the API answers 503 |
| `BODY_LIMIT` / `DATA_BODY_LIMIT` | backend | `256kb` / `50mb` | Request-body limits; the large one applies to `/data` only |
| `MAX_RESTORE_MB` / `RESTORE_RATE_MAX` | backend | `320` / `2` | Restore upload ceiling and hourly allowance |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_AUTH_MAX` / `RATE_LIMIT_PLAYGROUND_MAX` | backend | `300` / `30` / `10` | Requests per minute per client (API, auth, playground) |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_DISABLED` | backend | `60000` / _off_ | Window length; `1` disables limiting (the test suite uses this) |
| `EGRESS_INCLUDED_GB` / `EGRESS_WARN_GB` / `EGRESS_DEGRADE_GB` / `EGRESS_HARD_CEILING_GB` | backend | `5` / `3.5` / `5` / `10` | Outbound-bandwidth tiers: warn, degrade, floor |
| `EGRESS_BURST_GB_PER_HOUR` | backend | `2` | Bytes in a rolling hour that jump straight to degrade |
| `EGRESS_OVERHEAD_FACTOR` | backend | `1.1` | Calibrates our payload count against the host's billing |
| `EGRESS_ENABLED` / `EGRESS_FLUSH_MS` | backend | _on_ / `30000` | Meter kill switch and how often the total is persisted |
| `ALERT_WEBHOOK_URL` | backend | _unset_ | Slack/Discord/ntfy webhook for budget alerts |
| `ALERT_EMAIL_API_KEY` / `ALERT_EMAIL_FROM` / `ALERT_EMAIL_TO` | backend | _unset_ | Email alerts (Resend by default; no mailer dependency) |
| `ALERT_EMAIL_PROVIDER` | backend | `resend` | Or `postmark` |
| `ALERT_EMAIL_TEST_ON_BOOT` / `ALERT_MAX_PER_RUN` | backend | `once` / `20` | Channel smoke test, and the cap that stops a bug mailing in a loop |
| `VITE_BACKEND_TARGET` | frontend (dev/preview) | `http://localhost:8080` | Proxy target for API calls |
| `VITE_API_BASE_URL` | frontend (build) | same origin | API origin — only needed when the SPA is hosted separately (see Deployment) |
| `VITE_ENABLE_QUERY_DEVTOOLS` | frontend (dev) | _off_ | Mount React Query Devtools locally |

Database paths resolve relative to the backend's working directory (`backend/`), so the defaults land in `backend/db/`. Use absolute paths when the process runs from elsewhere, for example on a hosting platform.

## Project structure

```
.
|-- backend/                     Express + SQLite API
|   |-- src/
|   |   |-- index.ts             app, routes, auth, JWT
|   |   |-- server.ts            cluster bootstrap (pnpm dev / start)
|   |   |-- database.ts          schema creation, users, initDatabase
|   |   |-- dbMigrations.ts      multi-user data migrations
|   |   |-- demoData.ts          synthetic demo dataset
|   |   |-- middleware.ts        init + authenticate middleware
|   |   `-- *DatabaseRouter.ts   /data endpoints per database
|   |-- scripts/                 migrate-latest-dbs.ts (admin CLI)
|   |-- db/                      runtime SQLite files (git-ignored, .gitkeep only)
|   `-- dist/                    compiled API (git-ignored, built by pnpm build)
|-- frontend/                    React + Vite SPA
|   |-- src/app/                 shell, theme, providers, routing
|   |-- src/pages/               landing, login, dashboard, positions, profit, balance, admin
|   |-- src/components/          UI kit and icons
|   |-- src/api/                 typed backend clients
|   `-- dist/                    built SPA (git-ignored) — served by the API
`-- .github/workflows/ci.yml     lint · typecheck · build · test
`-- docs/openapi.json            HTTP surface, kept in step with the routes by a test
```

## Scripts

| Command | Description |
| --- | --- |
| `pnpm --dir backend dev` | API with nodemon and hot reload |
| `pnpm --dir backend build` / `start` | Compile to `backend/dist` / run it (build first) |
| `pnpm --dir backend test` | Backend suite (Vitest + supertest) |
| `pnpm --dir backend migrate:latest [-- --apply]` | Multi-user database migration CLI |
| `pnpm --dir frontend dev` | Vite dev server |
| `pnpm --dir frontend build` / `preview` | Typecheck + production bundle / serve it |
| `pnpm --dir frontend lint` | ESLint |
| `pnpm --dir frontend test` | Frontend suite (Vitest + Testing Library, jsdom) |

## Testing and CI

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests, in three parallel jobs: **frontend** (lint -> typecheck + build -> bundle budget -> test), **backend** (build -> test) and **repo guard** (fails if a database, a key or an env file ever becomes tracked, or if a committed file looks like a credential). All use Node 22 and pnpm 11.24.0 with frozen lockfiles. Run everything locally with:

```bash
pnpm --dir frontend test && pnpm --dir backend test
```

The backend suite includes `src/__tests__/openapi.test.ts`, which re-derives the Express
route table from the source that registers it. It fails if `docs/openapi.json` describes a
route that no longer exists, if a new route is neither documented nor excused, or if
anything but `/login`, `/register` and `/playground/session` becomes reachable without a
token.

## Deployment

The live demo runs on **Render** as a single web service built from this repository: Express
serves both the JSON API and the compiled SPA from one origin, so the frontend needs no API
base URL.

| Render setting | Value |
| --- | --- |
| Build command | `pnpm --dir frontend install && pnpm --dir frontend build && pnpm --dir backend install && pnpm --dir backend build` |
| Start command | `pnpm --dir backend start` |
| Health check path | `/` |

The backend serves the SPA out of `frontend/dist` and hands browser navigations
(`Accept: text/html`) to `index.html`, so a refresh or deep link on `/login` renders the app
rather than the API's 401 JSON.

Add a persistent disk for `backend/db/` — or set `TX_DB_PATH`, `SPOT_FUTURE_DB_PATH` and
`FUNDING_RATE_DB_PATH` to a persistent volume — otherwise the databases are recreated empty
on every deploy.

**Checklist for that shape:**

- **One instance, no autoscaling** — a disk-backed service cannot scale out, and the session list, the rate-limit counters and the bandwidth meter are all per-process.
- **Single-service previews only**: full-stack preview environments create a service per pull request.
- **A persistent disk mounted at `/data`**, with the three `*_DB_PATH` variables pointing into it (`/data/tx.db`, …), plus a billing alert in the workspace.
- **`ADMIN_PASSWORD` set** — production refuses to start without it. Set `JWT_SECRET` too if sessions should survive a restart; otherwise a fresh secret is generated per boot and everyone is signed out.
- **One alert channel** (`ALERT_WEBHOOK_URL` or the `ALERT_EMAIL_*` trio): the first request after startup sends a smoke test, so a bad key surfaces immediately.
- Render's own **disk-usage notification** (free, at 80%) is a useful second signal for the storage ceiling.

**Costs:** the instance is a flat fee, but outbound bandwidth is metered — 5 GB included on Hobby, then billed per GB, with no hard cap. That is what the tiers, the burst guard and the meter in `backend/src/egress.ts` exist to bound, and why the SPA is served compressed, immutably cached and without source maps.

To host the SPA separately (for example a Render static site), build `frontend/` with
`VITE_API_BASE_URL` set to the API's public origin; CORS is already enabled server-side.
