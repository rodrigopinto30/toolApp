# ToolApp

An online store for work tools, with an admin panel. Spanish and English, prices in Argentine pesos or US dollars, light and dark theme. Everything runs in Docker.

## Features

- **Catalog:** categories, search, filters with counts, products with variants, prices in ARS or USD (base price in USD plus an exchange rate set by the admin).
- **Purchase:** a guest cart that merges at login, home shipping priced by zone or store pickup, coupons, billing details, and a simulated card payment.
- **Orders:** status tracking, cancellation with refund, payment retry and emails. Unpaid orders expire after 30 minutes.
- **Account:** profile, addresses, billing profiles, favorites and reviews.
- **Admin panel** (`/admin`): products, variants and images, categories, brands, attributes, coupons, exchange rate, shipping zones, pickup points, orders, review moderation, users and an audit log.

## Tech stack

| Layer | Technologies |
| --- | --- |
| Frontend | Next.js 16 (App Router, React 19, React Compiler), TypeScript, Tailwind CSS 4, shadcn/ui on Radix, TanStack Query, next-intl, nuqs, React Hook Form with Zod, Zustand, openapi-fetch with types generated from the API |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 (async) and Alembic, Pydantic 2, structlog, Pillow |
| Data | MySQL 8.4, Redis 8 |
| Edge | nginx: TLS, rate limits, uploaded images |
| Testing | pytest, Jest with Testing Library and MSW, Playwright with axe, Lighthouse, k6 |
| CI | GitHub Actions, Dependabot |

## Architecture

- nginx serves everything from one origin: `/api/` goes to FastAPI, the rest to Next.js.
- The browser calls the API directly for user data. The session lives in HTTP-only cookies (short-lived JWT with refresh rotation) with CSRF protection.
- Next.js server components fetch only public data, cached by tag. The backend asks the frontend to revalidate when the catalog, prices or shipping change.
- Redis holds the API cache, the rate limits and the sessions. A worker expires unpaid orders.
- Pages get a strict Content Security Policy with a nonce per request.

## Getting started

You only need Docker with Compose v2. Nothing else is installed on the host.

```bash
./start.sh         # development: hot reload, Mailpit and phpMyAdmin
./start.sh prod    # production build
./stop.sh          # stop; --clean also deletes the database, Redis and uploaded images
```

The first run creates `.env` from `.env.example` with random secrets, a local certificate authority for HTTPS, the database schema and a demo catalog. Import `nginx/ca/dev-ca.crt` into your browser once to trust HTTPS.

| Service | Address |
| --- | --- |
| Store | https://localhost:8443 |
| API docs (dev) | https://localhost:8443/api/docs |
| Mailpit (dev) | http://localhost:8025 |
| phpMyAdmin (dev) | http://localhost:8081 |

The admin account is `ADMIN_EMAIL` with `ADMIN_PASSWORD`, both in `.env`. Payments are simulated: `4242 4242 4242 4242` is approved, `4000 0000 0000 0002` is rejected and `4000 0000 0009 0003` stays pending.

## Scripts

| Script | What it does |
| --- | --- |
| `./test.sh` | Backend tests (pytest) and `pip-audit` |
| `./test-front.sh` | ESLint, TypeScript, Jest and `npm audit` |
| `./e2e.sh [spec]` | Playwright end-to-end tests against the running stack, accessibility checks included |
| `./budgets.sh` | JavaScript size budgets per route group |
| `./lighthouse.sh` | Lighthouse on the production build |
| `./load.sh` | k6 load tests |
| `./front.sh <command>` | Runs a command in the frontend container, for example `npm install` |

CI runs the frontend checks and budgets, then the backend tests and the end-to-end suite on the production build, on every pull request.

## Project structure

```
backend/    FastAPI app, Alembic migrations, seed and tests
frontend/   Next.js app (src/), translations (messages/) and end-to-end tests (e2e/)
nginx/      Proxy configuration and local certificates
mysql/      Database configuration and initial users
redis/      Redis configuration
load/       k6 scenarios
```
