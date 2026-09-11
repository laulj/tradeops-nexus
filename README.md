# TradeOps Nexus

[![CI](https://github.com/laulj/tradeops-nexus/actions/workflows/ci.yml/badge.svg)](https://github.com/laulj/tradeops-nexus/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> TradeOps Nexus consolidates spot, perpetual-futures, and funding-rate PnL from nine venues and every wallet you run — then turns it into live charts, spread tables, and totals you can act on.

**Live demo:** <https://tradeops-nexus.onrender.com/>

> [!NOTE]
> The live demo runs on Render, serving the API and the compiled SPA from a single
> service. No databases are committed, so it starts empty — register an account with
> **Populate with demo data** to fill the dashboard.

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

Open <http://localhost:5173> and sign in as **`admin` / `demo123`** — that account is created automatically on first use.

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

## Configuration

Copy `frontend/.env.example` to `frontend/.env.local` to override the frontend values.

| Variable | Used by | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | backend | `8080` | HTTP port |
| `TX_DB_PATH` | backend | `./db/tx.db` | Spot database (also holds `users`) |
| `SPOT_FUTURE_DB_PATH` | backend | `./db/spotFuture.db` | Perp-futures database |
| `FUNDING_RATE_DB_PATH` | backend | `./db/fRate.db` | Funding-rate database |
| `DEMO_WINDOW_DAYS` | backend | `1095` | Length of the history seeded for a demo account (3 years) |
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

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests, in two parallel jobs: **frontend** (lint -> typecheck + build -> test) and **backend** (build -> test). Both use Node 22 and pnpm 11.24.0 with frozen lockfiles. Run everything locally with:

```bash
pnpm --dir frontend test && pnpm --dir backend test
```

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

To host the SPA separately (for example a Render static site), build `frontend/` with
`VITE_API_BASE_URL` set to the API's public origin; CORS is already enabled server-side.
