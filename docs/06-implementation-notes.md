# 06 - Implementation notes

Short map of what shipped. Prefer the root [README](../README.md) for run instructions and [contracts/](contracts/) for the consumer API.

---

## Stack shipped

| Layer | Choice |
|---|---|
| Runtime | Node.js 22, TypeScript |
| Framework | NestJS 11 (modular monolith) |
| API | GraphQL, Apollo driver, schema-first SDL |
| DB | PostgreSQL 16 + Prisma 7 |
| Rate limits | Nest throttler + Redis (`REDIS_URL` required in production) |
| Tests | Jest (unit, integration, e2e) |
| Delivery | Multi-stage Dockerfile, Docker Compose, GitHub Actions CI |

---

## Delivered areas

| Area | Where to look |
|---|---|
| Scoring rubric (`2026-07-28.1`) | [`src/scoring/`](../src/scoring/) |
| Persistence / repositories | [`src/store/`](../src/store/), [`prisma/schema.prisma`](../prisma/schema.prisma) |
| Geocoding + cache | [`src/geocoding/`](../src/geocoding/) |
| Open-Meteo client + circuit breaker | [`src/open-meteo/`](../src/open-meteo/) |
| GraphQL `activityRanking` | [`src/graphql/`](../src/graphql/), [`src/activity-ranking/`](../src/activity-ranking/) |
| Refresh worker | [`src/refresh/`](../src/refresh/), [`src/worker.ts`](../src/worker.ts) |
| Health / metrics / auth | [`src/health/`](../src/health/), [`src/metrics/`](../src/metrics/), [`src/common/`](../src/common/) |
| CI / Compose | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), [`docker-compose.yml`](../docker-compose.yml), [`docs/05`](05-cicd-and-delivery.md) |

Warm path reads Postgres only. Cold-start may call Open-Meteo within a timeout. Scores are compute-on-read from persisted forecast days.

---

## Sources of truth

| Concern | Canonical |
|---|---|
| GraphQL SDL / examples | [contracts/](contracts/) |
| Scoring algorithm | `src/scoring/` (rubric version `2026-07-28.1`) |
| DB models | [`prisma/schema.prisma`](../prisma/schema.prisma) (narrative copy in [contracts/prisma-schema.md](contracts/prisma-schema.md)) |
| Ops / cuts | [04-operations-and-failure-modes.md](04-operations-and-failure-modes.md) |
| How to run | [../README.md](../README.md) |

---

## Previous

Design packet: [`01`](01-requirements-and-estimation.md) → [`05`](05-cicd-and-delivery.md). Doc index: [`README.md`](README.md).
