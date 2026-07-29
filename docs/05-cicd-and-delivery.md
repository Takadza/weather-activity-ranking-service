# 05 — CI/CD & Delivery

**Stage 2 of 5 (Design) — how we build, test, and run the service**

Pipeline shape is fixed here; YAML/Docker files are implemented in the Code stage.

Depends on: [`02-system-design.md`](02-system-design.md).

---

## 1. Goals

- Every push/PR proves **TypeScript compiles**, **lint** (when configured), and **tests** pass
- Local run matches container shape (Compose + Postgres)
- No secrets in git; public repo safe for interview review
- CD to a cloud host is **optional**; CI is **required** for a senior-looking submission

---

## 2. Repository layout (target)

```
.github/workflows/ci.yml
Dockerfile
docker-compose.yml
.env.example
package.json
nest-cli.json
prisma/
src/          # NestJS modules (see TDD plan)
docs/
```

Exact Nest module tree is in the TDD plan; keep modules aligned with `02` (`Graphql`, `Scoring`, `Store`, `Refresh`, `OpenMeteo`, `Geocoding`, `Health`).

---

## 3. GitHub Actions CI (phased)

Implement CI **early in Code**, not only at the end (see TDD plan Tasks **2b** and **3**).

**Phase A — Task 2b (unit gate, no DB):**

| Step | Command / action |
|---|---|
| Checkout | `actions/checkout` |
| Node | `actions/setup-node` — LTS 22.x, `cache: npm` |
| Install | `npm ci` |
| Audit | `npm audit --omit=dev --audit-level=high` (`ws` pinned via `overrides` to clear Nest GraphQL transitive advisory) |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Unit tests | `npm test` (must run **without** Postgres) |
| Build | `npm run build` |

**Phase B — Task 3 (integration job):**

- Service container: `postgres:16-alpine` with health check
- `npx prisma migrate deploy`
- `npm run test:integration`

**Phase C — Task 9 (optional):**

- `docker build` for the Nest API image
- Compose services `api` + `worker` for local full stack (Compose `db` already from Task 3)

### Example workflow skeleton (Phase A — add in Task 2b)

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

---

## 4. Docker & Compose

### 4.1 Multi-stage Dockerfile

1. **deps** — `npm ci`
2. **build** — `prisma generate`, `tsc` / build
3. **runtime** — production `node`, non-root user, `node dist/main.js` (API)  

Worker: same image, command override e.g. `node dist/worker.js`.

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

## 7. README obligations (Code/Review stage)

- How to run: `docker compose up` (or npm + local Postgres)
- One copy-paste GraphQL query (from `03`)
- Assumptions + link to `docs/01`–`05`
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

**TDD plan (done):** [`superpowers/plans/2026-07-28-weather-activity-ranking.md`](superpowers/plans/2026-07-28-weather-activity-ranking.md)

**Next stage:** Code — execute the TDD plan (scorer → store → refresh → GraphQL → Docker/GHA) → Review.

Doc index: [`README.md`](README.md) · Root: [`../README.md`](../README.md).
