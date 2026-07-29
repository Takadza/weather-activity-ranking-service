# weather-activity-ranking-service

Rank the next 7 days for **skiing**, **surfing**, **outdoor sightseeing**, and **indoor sightseeing** using **Open-Meteo** forecast data.

**Stack:** TypeScript · Node.js · NestJS · GraphQL (Apollo) · PostgreSQL · Redis · Docker · GitHub Actions  
**Scope:** Backend only — no frontend.

![System context](docs/diagrams/01-context.svg)

Warm path reads **PostgreSQL** only. **Open-Meteo** is used for scheduled refresh and bounded cold-start. Architecture and sequence diagrams: [docs/02-system-design.md](docs/02-system-design.md#21-diagrams).

---

## How to run

### Prerequisites

- Node.js 22+
- Docker / Docker Compose
- Copy `.env.example` → `.env` for local non-Compose runs

### Unit tests

```bash
npm ci
npm test
```

### Integration tests (Postgres via Compose)

```bash
docker compose up -d db
npm run test:integration
```

Requires `DATABASE_URL` (from `.env` after copying `.env.example`, or export the value from `.env.example`).

### Full local stack (db + api + worker + redis)

```bash
docker compose up --build -d
curl -s http://localhost:3000/health/live
```

| Service | URL / notes |
|---|---|
| GraphQL | `http://localhost:3000/graphql` — header `X-API-Key: local-compose-api-key` |
| Health | `http://localhost:3000/health/live` |
| Worker metrics | `127.0.0.1:3001` (loopback) |
| Redis | Shared rate-limit store |

On start, `api` runs `prisma migrate deploy` then listens on port 3000.

Compose is a **local demo** (demo tokens + weak DB password) — not a production template. Stop with `docker compose down`.

---

## Sample GraphQL query

```bash
curl -s http://localhost:3000/graphql \
  -H 'content-type: application/json' \
  -H 'X-API-Key: local-compose-api-key' \
  -d '{"query":"query($location: LocationInput!){ activityRanking(location:$location){ location{name} stale rankings{activity overallScore rank} } }","variables":{"location":{"name":"Cape Town"}}}'
```

More operations: [docs/contracts/examples.graphql](docs/contracts/examples.graphql) · Postman: [postman/weather-activity-ranking.postman_collection.json](postman/weather-activity-ranking.postman_collection.json)

| Endpoint | Method | Purpose |
|---|---|---|
| `/graphql` | `POST` | Activity rankings (API key + rate-limited) |
| `/health/live` | `GET` | Liveness (no DB, public) |
| `/health/ready` | `GET` | Readiness (API key; 503 when degraded or DB down) |
| `/health` | `GET` | Compatibility probe (API key) |
| `/metrics` | `GET` | API Prometheus counters (`METRICS_TOKEN`) |
| worker `:3001/health/live` | `GET` | Worker liveness |
| worker `:3001/metrics` | `GET` | Worker Prometheus counters (`METRICS_TOKEN`) |

Ops env (see `.env.example`): `API_KEY`, `METRICS_TOKEN`, `REDIS_URL` (required in production), `ALLOWED_ORIGINS`, `THROTTLE_*`, `TRUST_PROXY`, `MAX_TRACKED_LOCATIONS`. Requests accept/generate `x-request-id`.

---

## Documentation

Read in order — full index: [docs/README.md](docs/README.md)

1. [01 — Requirements & estimation](docs/01-requirements-and-estimation.md)
2. [02 — System design](docs/02-system-design.md) + [diagrams](docs/02-system-design.md#21-diagrams)
3. [03 — API & domain](docs/03-api-and-domain-design.md) · contract SoT: [docs/contracts/](docs/contracts/)
4. [04 — Operations & failure modes](docs/04-operations-and-failure-modes.md)
5. [05 — CI/CD & delivery](docs/05-cicd-and-delivery.md)
6. [06 — Implementation notes](docs/06-implementation-notes.md) — what shipped and where

---

## Assumptions

- “How good” = versioned deterministic weather rubric (`2026-07-28.1`), not ML
- Skiing = weather suitability, not “ski resort exists”
- Default refresh every 6 hours; responses expose `lastUpdated` / `dataAgeSeconds` / `stale`
- Warm path reads Postgres only; cold-start may call Open-Meteo within a timeout

Details: [docs/01](docs/01-requirements-and-estimation.md) §2 and [docs/04](docs/04-operations-and-failure-modes.md).

---

## Deliberate cuts

Focused scope over exhaustive features ([docs/04 §6](docs/04-operations-and-failure-modes.md)):

| Cut | Why |
|---|---|
| No multi-tenant / OAuth | Shared API key for v1 |
| No forecast history | No FR; storage explosion |
| No microservices | ADR-001 |
| No serverless | ADR-002 |
| No CDN / multi-region / WAF | Backend GraphQL; YAGNI |
| No message queue in v1 | One worker + concurrency config |
| No admin UI for locations | Out of brief |
| No “is there a ski resort?” | Weather-only scope |
| Cloud LB not provisioned | Design for it; ship one replica |
| Full CD to production cloud | Optional; CI is the mandatory shape |
