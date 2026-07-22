# Pryro Pharmacy — Backend API

NestJS REST + WebSocket backend for the Pryro Pharmacy management platform. Handles all business logic, data access, scheduled jobs, AI chat, and real-time events. The Next.js frontend proxies every `/api/*` request here (except 8 session/auth cookie handlers that must stay in Next.js).

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 (Express adapter) |
| Language | TypeScript 5 |
| ORM | Prisma 6 (PostgreSQL via Supabase pooler) |
| Analytics | ClickHouse (optional — Postgres fallback) |
| Queue / Jobs | BullMQ + Redis |
| Scheduler | `@nestjs/schedule` (cron) |
| WebSocket | Socket.io via `@nestjs/websockets` |
| Email | Nodemailer (SMTP) |
| AI | OpenAI-compatible (NVIDIA NIM or OpenAI) |
| Auth | HttpOnly JWT cookie (`pryrox_session`) signed with `AUTH_SECRET` |
| Billing | Polar.sh SDK |
| API Docs | Swagger / OpenAPI 3 |

---

## Prerequisites

- Node 20+
- PostgreSQL database (Supabase recommended — use the **transaction pooler** port 6543)
- Redis (required for BullMQ queues and rate limiting; use `pryrox-redis` Docker container locally)
- ClickHouse (optional — Docker container `pryrox-clickhouse` locally)

---

## Quick start

```bash
cd backend
cp .env.example .env        # fill in your values
npm install                 # also runs prisma generate via postinstall
npm run start:dev           # watch mode on http://localhost:4000
```

---

## Environment variables

Copy `.env.example` to `.env` and fill in values. Required fields:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Supabase transaction pooler URL (port 6543, `pgbouncer=true`) |
| `DIRECT_URL` | ✅ | Supabase direct URL (port 5432, for migrations) |
| `AUTH_SECRET` | ✅ | Min 32-char secret — **must match frontend** |
| `PORT` | — | Default `4000` |
| `NODE_ENV` | — | `development` or `production` |
| `APP_URL` | — | Frontend origin used in email links (default `http://localhost:3000`) |
| `CORS_ORIGINS` | — | Comma-separated allowed origins (default `http://localhost:3000`) |
| `SMTP_HOST` | — | SMTP server for transactional emails |
| `SMTP_PORT` | — | Default `587` |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | — | From address e.g. `"Pryro" <no-reply@pryro.com>` |
| `SMTP_SECURE` | — | `true` for port 465 (implicit TLS) |
| `REDIS_URL` | — | Redis connection URL — enables BullMQ queues |
| `REDIS_HOST` | — | Alternative to `REDIS_URL` |
| `REDIS_PORT` | — | Default `6379` |
| `REDIS_PASSWORD` | — | Redis password if set |
| `GOOGLE_CLIENT_ID` | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth client secret |
| `NVIDIA_API_KEY` | — | NVIDIA NIM API key for AI features |
| `NVIDIA_BASE_URL` | — | NVIDIA inference endpoint |
| `NVIDIA_MODEL` | — | Model name e.g. `nvidia/llama-3.1-nemotron-70b-instruct` |
| `CLICKHOUSE_URL` | — | ClickHouse HTTP URL e.g. `http://localhost:8123` |
| `CLICKHOUSE_USER` | — | ClickHouse user |
| `CLICKHOUSE_PASSWORD` | — | ClickHouse password |
| `CLICKHOUSE_DATABASE` | — | ClickHouse database name |
| `CRON_SECRET` | — | Bearer token required by external cron callers |
| `PENDING_PAYMENT_EXPIRE_DAYS` | — | Days before pending payments auto-cancel (default `7`) |
| `NATIVE_AUTH_ENABLED` | — | Enable email/password auth (default `true`) |

---

## NPM scripts

| Script | Description |
|---|---|
| `npm run start:dev` | Development server with hot reload |
| `npm run start:debug` | Debug mode with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start:prod` | Run compiled production build |
| `npm run prisma:generate` | Regenerate Prisma client |

---

## API documentation

With the server running:

- **Swagger UI** — `http://localhost:4000/api/docs`
- **OpenAPI JSON** — `http://localhost:4000/api/docs-json`
- **OpenAPI YAML** — `http://localhost:4000/api/docs-yaml`

Swagger documents authentication (HttpOnly cookie), all request/response schemas, and error codes.

---

## Project structure

```
backend/
├── prisma/
│   ├── schema.prisma          # Single source of truth for DB schema
│   └── migrations/            # Prisma migration history
├── clickhouse/
│   └── init/                  # ClickHouse schema SQL files
├── src/
│   ├── main.ts                # Bootstrap, Swagger, cookie parser, CORS
│   ├── app.module.ts          # Root module wiring
│   │
│   ├── config/                # Zod-validated env schema (AppConfigModule)
│   ├── prisma/                # PrismaService singleton
│   ├── clickhouse/            # ClickHouseService with Postgres fallback
│   ├── auth/                  # JWT cookie verification, session guard
│   ├── tenant/                # Pharmacy/branch context extraction
│   ├── audit/                 # Audit log writes
│   ├── mail/                  # Nodemailer email sending
│   ├── health/                # GET /api/health, /api/health/ready, /api/health/clickhouse
│   │
│   ├── me/                    # Current user profile, context, preferences
│   ├── admin/                 # Platform admin — pharmacies, users, settings
│   ├── pharmacy/              # Pharmacy settings, dashboard stats, sales chart
│   ├── branches/              # Branch CRUD and usage
│   ├── staff/                 # Staff management, branch access control
│   ├── categories/            # Medication categories
│   ├── inventory/             # Stock management, batch tracking, FEFO
│   ├── customers/             # Patient/customer registry
│   ├── sales/                 # Sales history and records
│   ├── pos/                   # POS transaction processing, shift management
│   ├── prescriptions/         # Prescription tracking
│   ├── insurance/             # Insurance providers, coverage, claims
│   ├── reports/               # Sales, inventory, and analytics reports
│   ├── analytics/             # Dashboard analytics (ClickHouse + Postgres)
│   ├── accounting/            # Accounting summaries
│   ├── alerts/                # Low stock, expiry, and system alerts
│   ├── notifications/         # In-app notification stream (SSE)
│   ├── integrations/          # Webhooks, real-time gateway (Socket.io)
│   ├── billing/               # SaaS subscriptions, plans, invoices (Polar.sh)
│   ├── plans/                 # Subscription plan catalog
│   ├── entitlements/          # Feature gate checks per plan
│   ├── onboarding/            # New pharmacy onboarding flow
│   ├── ai/                    # AI chat, drug safety analysis, tool calls
│   ├── search/                # Global search across inventory and customers
│   ├── settings/              # Pharmacy and platform settings
│   ├── branding/              # Pharmacy branding (logo, colors)
│   ├── pharmacist/            # Pharmacist-specific views
│   ├── maintenance/           # Maintenance mode management
│   ├── cron/                  # Scheduled jobs (billing, alerts, notifications)
│   ├── exports/               # Data export generation
│   ├── files/                 # File upload handling
│   ├── storage/               # Cloud storage integration
│   ├── invoices/              # Invoice template management
│   ├── validation/            # Shared validation utilities
│   └── common/                # Shared DTOs, decorators, pipes
```

---

## Domain module conventions

Every domain follows this pattern:

```
src/<domain>/
  <domain>.module.ts       # imports, providers, exports — no logic
  <domain>.controller.ts   # route handlers, Swagger decorators
  <domain>.service.ts      # all business logic, DB access
  dto/                     # request/response DTOs with class-validator
```

---

## Database

Prisma schema is at `prisma/schema.prisma`. To run migrations:

```bash
# Apply pending migrations (uses DIRECT_URL)
npx prisma migrate deploy

# Create a new migration
npx prisma migrate dev --name your_migration_name

# Regenerate Prisma client after schema changes
npx prisma generate

# Open Prisma Studio (DB browser)
npx prisma studio
```

---

## ClickHouse (analytics)

ClickHouse is optional. When `CLICKHOUSE_URL` is not set all analytics queries fall back to Postgres.

To start ClickHouse locally with Docker:

```bash
docker run -d \
  --name pryrox-clickhouse \
  -p 8123:8123 -p 9000:9000 \
  -e CLICKHOUSE_USER=pryrox \
  -e CLICKHOUSE_PASSWORD=pryrox_dev \
  -e CLICKHOUSE_DEFAULT_DATABASE=pryrox_analytics \
  clickhouse/clickhouse-server:latest
```

Then run the init SQL from `clickhouse/init/` to create the schema.

Check ClickHouse status: `GET /api/health/clickhouse`

---

## Redis

Required for BullMQ maintenance notification queues. Start locally:

```bash
docker run -d --name pryrox-redis -p 6379:6379 redis:7-alpine
```

---

## Cron jobs

Scheduled jobs run automatically when the server starts:

| Job | Schedule | Description |
|---|---|---|
| Subscription renewal reminders | Daily 09:00 | Sends reminders at 14/7/3/1 days before expiry |
| Inventory alerts | Daily 08:00 | Detects low stock and expiring items |
| Notification dispatch | Every 5 min | Flushes `notification_outbox` to SSE |
| Transaction limit reset | Monthly | Resets branch monthly transaction counters |

External schedulers can trigger cron endpoints via `Authorization: Bearer <CRON_SECRET>`.

---

## Authentication

Authentication uses HttpOnly cookies (`pryrox_session` — a signed JWT). The frontend Next.js handles sign-in/sign-up/OAuth flows and writes the cookie. The backend verifies it on every protected request via `SessionGuard`.

`AUTH_SECRET` **must be identical** in both backend and frontend `.env` files.

---

## Deployment notes

- Set `NODE_ENV=production`
- Set `DATABASE_URL` to the Supabase **transaction pooler** (port 6543)
- Set `DIRECT_URL` to the Supabase **direct connection** (port 5432) for migrations
- Run `npx prisma migrate deploy` before starting the server
- Run `npm run build` then `npm run start:prod`
- Ensure `CORS_ORIGINS` includes your production frontend domain
- Redis is required in production for queues
