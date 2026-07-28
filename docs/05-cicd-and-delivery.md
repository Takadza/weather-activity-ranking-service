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
Dockerfile                 # multi-stage: deps → build → runtime
docker-compose.yml         # api (+ optional worker) + postgres
.env.example
package.json
prisma/
src/
docs/
```

Exact `src/` tree is decided in the TDD/implementation plan; keep modules aligned with `02` (`graphql`, `scoring`, `store`, `refresh`, `open-meteo`, `geocoding`).

---

## 3. GitHub Actions CI

**Trigger:** `push` and `pull_request` to `main` (and feature branches as needed).

**Job: `ci`**

| Step | Command / action |
|---|---|
| Checkout | `actions/checkout` |
| Node | `actions/setup-node` — LTS (e.g. 22.x), `cache: npm` |
| Install | `npm ci` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` → `tsc --noEmit` |
| Unit tests | `npm test` (scoring golden tests must run **without** DB) |
| Build | `npm run build` |

**Job: `integration` (when integration tests exist)**

- Service container: `postgres:16-alpine` with health check
- Env: `DATABASE_URL` pointing at the service
- `npx prisma migrate deploy` (or `migrate dev` equivalent in CI)
- `npm run test:integration`

v1 may start with unit-only CI and add integration once Prisma is wired—document the gap if so.

**Optional job: `docker`**

- `docker build` to prove the image builds on CI
- Use Buildx + GHA cache if time allows

### Example workflow skeleton (implement later)

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
| `db` | Postgres 16, volume for data, healthcheck |
| `api` | GraphQL + health; depends on healthy `db`; runs migrations on start |
| `worker` | Refresh loop; same image; depends on `db` |

Env from `.env` / Compose `environment`. Publish `api` on `4000` (or similar).

**v1 scale story:** Compose runs one `api`. Production scale = more API tasks behind a platform LB (see `02`)—Compose file need not define the LB.

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
| `REFRESH_INTERVAL_MS` | Worker schedule (ms); default `21600000` |
| `REFRESH_CONCURRENCY` | Worker pool |
| `STALE_AFTER_SECONDS` | Response `stale` flag |
| `LOG_LEVEL` | Structured logging |

Commit `.env.example` only. Use GitHub Actions secrets if CD is added later.

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
