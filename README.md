# Touchline

[![CI](https://github.com/jedi-knights/touchline/actions/workflows/ci.yml/badge.svg)](https://github.com/jedi-knights/touchline/actions/workflows/ci.yml)

Touch-driven, sport-agnostic live tracker for match events. The first sport is soccer; the domain model, schema, and UI are designed so adding a new sport is data (seed rows), not code.

## Status

**v1 complete.** All eight build phases are done. The definition of done is verified by a Playwright happy-path that walks the entire flow: sign up → create team + roster → set up a match with a starting lineup → kickoff → goal with player picker → substitution → half time → second half → full time → summary with the correct score, full event timeline, and accurate minutes played.

```
sign up → /teams/new → +12 players → /matches/new → Kickoff → Goal(#1) →
Sub(#11 off, #12 on) → Half Time → Second Half → Full Time → /matches/[id]
                                                              ↑
                                                Final score · timeline · minutes
```

| Phase | Scope                                                                                  | Status |
| ----- | -------------------------------------------------------------------------------------- | :----: |
| 0     | Scaffold, tooling, Dockerfile + compose, `/api/health`                                 |   ✓    |
| 1     | Drizzle schema, idempotent soccer seed, pure clock/minutes/scoring + 31 unit tests     |   ✓    |
| 2     | Auth.js v5 (credentials, JWT sessions), tenant scoping helpers                         |   ✓    |
| 3     | Team & player CRUD, ConfirmForm for destructive actions                                |   ✓    |
| 4     | Match setup + tap-to-select starting lineup                                            |   ✓    |
| 5     | Live tracking: ticking clock, data-driven event grid, goal-with-player, US/THEM toggle |   ✓    |
| 6     | Substitution sheet with atomic stint updates                                           |   ✓    |
| 7     | Match summary: chronological timeline + minutes-played table                           |   ✓    |
| 8     | Dashboard polish + Playwright happy-path                                               |   ✓    |

## Core principles

1. **Data-driven, not hardcoded.** Event types, scoring rules, and period structure live in the database. The UI renders buttons from `event_type` rows. Adding hockey means inserting rows.
2. **Zero typing during a live match.** Every in-match interaction is a tap. Keyboard input is only allowed in setup/admin screens.
3. **The game clock is derived.** Match-clock time is computed from immutable clock-control events (`start` / `stop`). A page refresh in the 73rd minute still shows the correct 73:xx.
4. **Multi-tenant from day one.** Every read and write is scoped to the authenticated user. There is no path to another user's data.
5. **Every event is persisted.** Each tap that records something writes an immutable row with wall-clock time, derived match-clock seconds, period, and any player references.

## Architecture

Touchline runs five long-running services behind a single host port:

```
browser → gateway:8080 (host :3000, rate-limited)
              → app:3000 (Next.js, internal)
                  ├→ identity-service:8081 (credential validation, internal)
                  ├→ match-engine:8082 (event state machine, internal)
                  └→ postgres:5432 (touchline + identity_service DBs, internal)
```

Two Go services from [identity-platform-go][platform] are **vendored** under `services/`:

- **identity-service** (`services/identity/`) — owns user records and bcrypt password hashes; the Next.js Auth.js Credentials provider calls it on sign-in / sign-up.
- **api-gateway** (`services/gateway/`) — front-door reverse proxy. Today it enforces **rate limiting** (token bucket, 100 rps / burst 200, keyed by source IP). Auth, CORS, compression, retry, cache, and circuit-break are all off on purpose — see `init/gateway/gateway.yaml` for the rationale per setting.

A third Go service is **authored here** under `services/`:

- **match-engine** (`services/match-engine/`) — the match event state machine. Touchline's Server Actions delegate `recordEventAction` and `recordSubstitutionAction` to it; the service derives the match clock, transitions setup → live → finished, opens/closes player stints, and applies score deltas (including the OWN_GOAL flip rule). Tenant scoping (`assertOwnsMatch`) stays in Next.js — the engine trusts its caller, the same way a domain layer trusts its host.

[platform]: https://github.com/jedi-knights/identity-platform-go

## Tech stack

- **Next.js 15** (App Router) + **TypeScript** (`strict`, `noUncheckedIndexedAccess`)
- **PostgreSQL 16** + **Drizzle ORM** / `drizzle-kit`
- **Auth.js v5** in front of an **identity-service** for credentials (see [auth notes](#auth-sessions))
- **api-gateway** for rate limiting + future cross-cutting policies
- **Tailwind CSS** (touch-first; 48px minimum tap targets)
- **Zod** for shared client/server validation
- **Vitest** for domain unit tests; **Playwright** for one happy-path E2E
- **Docker** (multi-stage, Next standalone) + **docker compose**

## Requirements

For local non-Docker dev:

- Node.js ≥ 20
- npm (or pnpm — adjust commands accordingly)
- PostgreSQL 14+ reachable via `DATABASE_URL`

For containerized dev:

- Docker Engine ≥ 24 with Compose v2

## Quick start (Docker)

```bash
cp .env.example .env
# Edit AUTH_SECRET: openssl rand -base64 32

docker compose up --build
# App:        http://localhost:3000
# Healthcheck: http://localhost:3000/api/health
```

### Demo data

To stand up a populated account for demos, set `SEED_DEMO=true` in `.env` before `docker compose up`. The app entrypoint will, after migrations, create a fixed account and a known fixture:

| Email                  | Password   |
| ---------------------- | ---------- |
| `demo@touchline.local` | `demo1234` |

The fixture is **6 teams** (16–22 players each) and **10 finished matches** with full event timelines (kickoff → half time → second half → full time, with goals, cards, and 1–3 substitutions) plus the matching `player_stints`. Open any match under `/matches/[id]` to see the timeline and minutes-played table render against real data, with zero in-app tap-tap.

The seed is **idempotent**: it skips when the demo user already owns teams, so re-running compose is safe.

To get back to a clean stack, `docker compose down -v` (drops the volume), then start again.

Adminer (DB inspector) is opt-in:

```bash
docker compose --profile tools up
# Adminer at http://localhost:8080  (System: PostgreSQL, Server: postgres)
```

Stop everything and wipe the database volume:

```bash
docker compose down -v
```

## Quick start (local dev)

```bash
cp .env.example .env
npm install
npm run dev
# http://localhost:3000
```

The local dev server expects a Postgres reachable at `DATABASE_URL`. Run migrations and seed once before signing in:

```bash
npm run db:generate   # produce SQL migrations from schema changes (only when schema/* changes)
npm run db:migrate    # apply migrations
npm run db:seed       # idempotent soccer seed (1 sport, 16 event types)
```

## End-to-end test

Playwright drives the full happy-path through a real browser. Bring the stack up first:

```bash
docker compose up -d --build
npx playwright install chromium   # first run only
npm run test:e2e
```

The test signs up a unique user per run, so it's safe to re-run against the same stack without resetting the database. The full flow finishes in ~4 seconds.

## Scripts

| Command                                          | What it does                           |
| ------------------------------------------------ | -------------------------------------- |
| `npm run dev`                                    | Next dev server with HMR               |
| `npm run build`                                  | Production build (standalone output)   |
| `npm run start`                                  | Run a built app                        |
| `npm run lint`                                   | ESLint (Next config)                   |
| `npm run typecheck`                              | `tsc --noEmit`                         |
| `npm run format` / `format:check`                | Prettier                               |
| `npm test` / `test:watch`                        | Vitest (domain unit tests)             |
| `npm run test:e2e`                               | Playwright happy-path                  |
| `npm run db:generate` / `db:migrate` / `db:seed` | Drizzle migrations and seed (Phase 1+) |

## Project layout

```
src/
├── app/                   # Next.js App Router (routes, layouts, API)
│   └── api/health/        # liveness probe used by Docker healthcheck
├── domain/                # Pure, framework-independent logic
│   ├── clock.ts           # derived elapsed seconds from clock-control events
│   ├── minutes.ts         # minutes-played from player_stint rows
│   └── scoring.ts         # event_type → score change
├── db/                    # Drizzle schema, client, migrations, seed
├── server/                # Auth, server actions, queries, ownership guards
├── lib/                   # Shared Zod schemas, utilities
└── components/            # UI primitives + live-tracking components
tests/e2e/                 # Playwright
scripts/                   # docker-entrypoint, dev helpers
```

The boundary that matters: **`src/domain/` does not import from `src/db`, `src/server`, or any framework code.** Clock and minutes logic are pure functions over plain inputs, unit-tested in isolation, and portable to a future sport.

## Configuration

All settings come from environment variables. See [`.env.example`](./.env.example) for the full list.

| Variable       | Purpose                                                | Default                                                   |
| -------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| `DATABASE_URL` | Postgres connection string used by the app and Drizzle | `postgres://touchline:touchline@localhost:5432/touchline` |
| `AUTH_SECRET`  | Auth.js session signing key                            | _required in production_                                  |
| `AUTH_URL`     | Public app URL Auth.js redirects against               | `http://localhost:3000`                                   |
| `APP_PORT`     | Host port for the app in compose                       | `3000`                                                    |
| `POSTGRES_*`   | Compose-provisioned Postgres credentials               | `touchline` / `touchline` / `touchline`                   |
| `ADMINER_PORT` | Adminer host port (opt-in profile)                     | `8080`                                                    |

## Development notes

### Clock derivation

A **period** is a closed interval between a `clock_control = start` event and the next `clock_control = stop` event. Elapsed match-clock seconds at any moment equal the sum of completed-period durations plus, if a period is currently running, the time since its start event.

When recording an event, the server computes `match_clock_seconds` from the event log at the moment of the tap and stamps it on the row. The displayed clock reconstructs the same value from authoritative timestamps and ticks locally, so a refresh or reconnect does not drift.

### Minutes from stints

A starting-lineup player gets an open `player_stint` (`on_at_seconds = 0`) when the match starts. A substitution closes the outgoing players' open stints and opens new stints for incoming players in a single transaction (together with the substitution event row). Match End closes any still-open stints at the final clock. Total minutes played for a player is the sum of `off_at_seconds − on_at_seconds` across their stints for that match.

These rules live in `src/domain/clock.ts` and `src/domain/minutes.ts` as pure functions with their own tests.

### Sport-agnostic engine

Soccer is implemented entirely as **data**: one `sports` row (`slug='soccer'`, `config={periodCount:2, periodLengthSeconds:2700}`) and the 16 `event_types` rows seeded at container start. Adding a new sport — hockey, basketball, lacrosse — means inserting rows, not editing components:

| What you change      | Where it lives                                                       |
| -------------------- | -------------------------------------------------------------------- |
| Period count/length  | `sports.config` JSONB                                                |
| Event button catalog | `event_types` rows (`code`, `label`, `color`, `sort_order`)          |
| Clock behavior       | `event_types.clock_control` (`start`/`stop`/`none`)                  |
| Scoring rules        | `event_types.affects_score` (Goal +1; Own Goal flip handled in code) |
| Substitution         | Any `event_types` row with `is_substitution = true`                  |
| Per-event metadata   | `match_events.metadata` JSONB                                        |

The live tracker UI renders dynamic buttons from these rows. The substitution flow finds its event_type by **flag**, not by code, so a hockey "Line Change" just works.

### <a id="auth-sessions"></a>Auth: Auth.js cookies in front of identity-service

The Auth.js v5 **Credentials provider** in `src/server/auth.ts` calls into the vendored **identity-service** for credential validation (`POST /auth/login`), then wraps the returned `user_id` in a JWT session cookie. Sign-up does the same against `POST /auth/register`. The local `users` table is a thin mirror — `id, email, name, created_at`, no password column. Source of truth for the bcrypt hash lives in `identity_service.users`.

Why JWT sessions and not DB sessions: in Auth.js v5 the Credentials provider deliberately short-circuits the OAuth `createUser → linkAccount → createSession` lifecycle the adapter expects, so DB sessions with credentials need an unsupported workaround. JWT keeps the session-cookie layer working today; when an OAuth provider is added later, OAuth flows can run with database sessions while credentials stay on JWT.

### <a id="gateway"></a>Front door: api-gateway

The `gateway` service (vendored under `services/gateway/`) is the only host-exposed port. All browser traffic lands on it; everything behind (`app`, `identity-service`, `postgres`) lives on the docker bridge with no external listener. The default `init/gateway/gateway.yaml` is touchline-tuned:

- **Rate limiting on** — token bucket, 100 rps / burst 200, keyed by source IP. This is the headline feature; it closes the OWASP A06 rate-limiting gap on `/sign-in`, `/sign-up`, and `/api/auth/*`.
- **Auth off** — Auth.js cookies handle session validation inside the app.
- **CORS off** — browser, gateway, and app share an origin.
- **Compression off** — Next.js already gzips its own responses with the correct `Content-Encoding` header. Enabling at the gateway double-compresses and breaks browsers; tracked as a known issue in `init/gateway/gateway.yaml`.
- **Cache off** — user-scoped responses must not be shared across users.
- **Single catch-all route** `/` → `http://app:3000`. The gateway's own `/health`, `/ready`, `/metrics`, `/swagger` are reserved before the proxy chain.

Behind a real reverse proxy (Cloudflare, AWS ALB) in production, set `rate_limit.key_source: x-forwarded-for` so each user gets their own bucket rather than sharing the LB's IP.

### Security posture

OWASP-aware throughout:

- **A01 Broken Access Control** — middleware is default-deny against an explicit allow-list (`/sign-in`, `/sign-up`, `/api/auth/*`, `/api/health`). Every read filters by `userId`; every write uses compound `WHERE id = ? AND user_id = ?` so cross-tenant writes silently affect zero rows. Cross-tenant reads return 404 (not 403) via `notFound()` to avoid existence disclosure.
- **A05 Injection** — every server-action input goes through Zod before reaching the DB; Drizzle parameterizes all queries.
- **A06 Identification & Authentication Failures** — the api-gateway enforces a token-bucket rate limit (100 rps / burst 200) on all paths, including `/sign-in`, `/sign-up`, and `/api/auth/*`. See [Front door: api-gateway](#gateway).
- **A07 Auth Failures** — bcrypt password hashes live in identity-service (not in the Next.js app); sign-in/sign-up responses use a single generic message so users can't be enumerated; session token rotates on login and clears on sign-out.
- **A10 Mishandling of Exceptional Conditions** — every multi-row side effect (match start, substitution, match finish) runs inside `db.transaction` so a partial application (event without stints, or stints without event) is impossible.

## Contributing

Single-developer project right now; PR discipline is "one Conventional Commit subject = one PR". Open an issue first for anything larger than a small fix.

## License

MIT — see [`LICENSE`](./LICENSE).
