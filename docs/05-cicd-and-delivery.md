# 05 — CI/CD & Delivery

**Stage 2 of 5 (Design) — how we build, test, and run the service**

Pipeline and Docker files are implemented; see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), [`Dockerfile`](../Dockerfile), and [`docker-compose.yml`](../docker-compose.yml).

Depends on: [`02-system-design.md`](02-system-design.md).

---

## 1. Goals

- Every push/PR proves **TypeScript compiles**, **lint**, and **tests** pass
- Local run matches container shape (Compose + Postgres + Redis)
- No secrets in git; safe for a public repository
- CD to a cloud host is **optional**; CI is **required**

---

## 2. Repository layout

```
.github/workflows/ci.yml
Dockerfile
docker-compose.yml
.env.example
package.json
nest-cli.json
prisma/
src/          # NestJS modules (see 06-implementation-notes.md)
docs/
```

Nest modules align with `02` (`Graphql`, `Scoring`, `Store`, `Refresh`, `OpenMeteo`, `Geocoding`, `Health`).

---

## 3. GitHub Actions CI (implemented)

Workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — triggers on push to `main`/`develop` and pull requests.

**Job `unit`:**

| Step | Command / action |
|---|---|
| Checkout | `actions/checkout@v5` |
| Node | `actions/setup-node@v5` — Node 22, `cache: npm` |
| Install | `npm ci` |
| Audit | `npm audit --omit=dev --audit-level=high` (`ws` pinned via `overrides`) |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Unit tests | `npm test` (no Postgres) |
| Build | `npm run build` |

**Job `integration` (needs `unit`):**

- Service container: `postgres:16-alpine` with health check
- `npx prisma migrate deploy`
- Schema drift check via `prisma migrate diff --exit-code`
- `npm run test:integration`
- `npm run test:e2e`

**Job `docker` (needs `unit`):**

- `docker build .` for the Nest image

---

## 4. Docker & Compose

### 4.1 Multi-stage Dockerfile

1. **deps** — `npm ci`
2. **build** — `prisma generate`, Nest build
3. **runtime** — production `node`, non-root user, `node dist/main` (API)

Worker: same image, command override e.g. `node dist/worker`.

### 4.2 `docker-compose.yml` (local / demo)

| Service | Role |
|---|---|
| `db` | Postgres 16, volume for data, healthcheck (loopback publish) |
| `redis` | Shared throttler storage |
| `api` | GraphQL + health; depends on healthy `db` + `redis`; runs migrations on start |
| `worker` | Refresh loop; same image; worker metrics published on `127.0.0.1:3001` |

**Not a production template.** Compose ships demo `API_KEY` / `METRICS_TOKEN` and weak DB password for local use only. Prefer a secret store and digest-pinned base images (`node@sha256:…`, `postgres@sha256:…`) in real deploys. Prefer running `prisma migrate deploy` as a one-shot Job rather than on every process start (ops follow-up).

Env from Compose `environment`. Publish `api` on `3000`.

**v1 scale story:** Compose runs one `api`. Production scale = more API tasks behind a platform LB with shared `REDIS_URL` (see `02`).

---

## 5. CD posture (optional)

| Level | What | Take-home? |
|---|---|---|
| CI only | Gates on PR | **Yes — do this** |
| Build image on `main` | Push to GHCR | Nice if time |
| Deploy | Fly/Render/ECS | Optional; README “how you would” is enough |

Do **not** block the submission on live cloud deploy. Reviewers care about runnable Compose + clear README.

---

## 6. Secrets & config

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection |
| `PORT` | API port |
| `API_KEY` | Consumer GraphQL/HTTP auth (required in production) |
| `METRICS_TOKEN` | Metrics + detailed health (required in production) |
| `REDIS_URL` | Shared throttler (required in production) |
| `MAX_TRACKED_LOCATIONS` | Cap on auto-tracked locations (default 100) |
| `WORKER_BIND_HOST` | Worker metrics bind (default `127.0.0.1`) |
| `REFRESH_INTERVAL_MS` | Worker schedule (ms); default `21600000` |
| `REFRESH_CONCURRENCY` | Worker pool |
| `STALE_AFTER_SECONDS` | Response `stale` flag |
| `LOG_LEVEL` | Structured logging |
| `INTROSPECTION` | GraphQL introspection override (`true`/`false`) |

Commit `.env.example` only (`.gitignore` ignores `.env.*` except `.env.example`). Use GitHub Actions secrets if CD is added later. Rotate `API_KEY` / `METRICS_TOKEN` on a defined schedule.

---

## 7. README obligations

- How to run: `docker compose up` (or npm + local Postgres)
- One copy-paste GraphQL query
- Assumptions + link to `docs/01`–`06`
- Deliberate cuts (from `04`)
- Note: TypeScript, GraphQL, persisted Open-Meteo data

---

## 8. Design stage complete → next

Design packet:

1. [`01-requirements-and-estimation.md`](01-requirements-and-estimation.md)
2. [`02-system-design.md`](02-system-design.md) + [`diagrams/`](diagrams/)
3. [`03-api-and-domain-design.md`](03-api-and-domain-design.md) + [`contracts/`](contracts/)
4. [`04-operations-and-failure-modes.md`](04-operations-and-failure-modes.md)
5. This document

**Implementation notes (done):** [`06-implementation-notes.md`](06-implementation-notes.md)

**Next:** none — Code and Review complete.

Doc index: [`README.md`](README.md) · Root: [`../README.md`](../README.md).
