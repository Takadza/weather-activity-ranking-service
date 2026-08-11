# weather-activity-ranking-service

Rank the next 7 days for **skiing**, **surfing**, **outdoor sightseeing**, and **indoor sightseeing** using **Open-Meteo** forecast data.

**Stack:** TypeScript · Node.js · NestJS · GraphQL (Apollo) · PostgreSQL · Redis · Docker · GitHub Actions  
**Scope:** Backend only - no frontend.

![System context](docs/diagrams/01-context.svg)

Warm path reads **PostgreSQL** only. **Open-Meteo** is used for scheduled refresh and bounded cold-start. Architecture and sequence diagrams: [docs/02-system-design.md](docs/02-system-design.md#21-diagrams).

### Database model (ERD)

**`Location`** is the hub — one location has many forecast days and may be referenced as the best match from many geocode cache rows. **`RefreshMeta`** is a standalone worker heartbeat (no FK).

```
┌─────────────────┐       ┌──────────────────┐
│    Location     │───1:N─│   ForecastDay    │
└────────┬────────┘       └──────────────────┘
         │
         └────1:N──┌──────────────────┐
                   │  GeocodeCache    │
                   └──────────────────┘

┌──────────────────┐
│   RefreshMeta    │  ← singleton (id = 1), no FK
└──────────────────┘
```

Scores are **compute-on-read** (no score table). Full field list: [docs/contracts/prisma-schema.md](docs/contracts/prisma-schema.md) · [system design §2.1](docs/02-system-design.md#database-erd).

![PostgreSQL ERD](docs/diagrams/04-erd.svg)

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

### All tests

```bash
docker compose up -d db   # required for integration suite
npm run test:all
```

Runs unit, integration, and e2e suites in sequence.

### Full local stack (db + api + worker + redis)

```bash
docker compose up --build -d
curl -s http://localhost:3000/health/live
```

| Service | URL / notes |
|---|---|
| GraphQL | `http://localhost:3000/graphql` - header `X-API-Key: local-compose-api-key` |
| Health | `http://localhost:3000/health/live` |
| Worker metrics | `127.0.0.1:3001` (loopback) |
| Redis | Shared rate-limit store |

On start, `api` runs `prisma migrate deploy` then listens on port 3000.

Compose is a **local demo** (demo tokens + weak DB password) - not a production template. Stop with `docker compose down`.

---

## Sample GraphQL query

```bash
curl -s http://localhost:3000/graphql \
  -H 'content-type: application/json' \
  -H 'X-API-Key: local-compose-api-key' \
  -d '{"query":"query($location: LocationInput!){ activityRanking(location:$location){ location{name} stale rankings{activity overallScore rank} } }","variables":{"location":{"name":"Cape Town"}}}'
```

More operations: [docs/contracts/examples.graphql](docs/contracts/examples.graphql)

### Postman collection

Collection file (in this repo):

[`postman/weather-activity-ranking.postman_collection.json`](postman/weather-activity-ranking.postman_collection.json)

**Import**

1. Start the local stack (`docker compose up --build -d`) so the API is on `:3000`
2. Open Postman → **Import** → **Upload Files** (or drag the JSON onto Postman)
3. Select `postman/weather-activity-ranking.postman_collection.json`
4. Open the imported collection → **Variables** and confirm defaults (or set them):

| Variable | Default | Purpose |
|---|---|---|
| `baseUrl` | `http://localhost:3000` | API origin |
| `apiKey` | `local-compose-api-key` | Matches Compose `API_KEY` (`X-API-Key`) |
| `metricsToken` | `local-compose-metrics-token` | Matches Compose `METRICS_TOKEN` |

5. Run any request under the collection (auth, health, cities, coords, metrics)

Collection auth sends `X-API-Key: {{apiKey}}` by default. `/health/live` and negative-auth cases override that. `/metrics` uses `X-Metrics-Token` / Bearer with `{{metricsToken}}`.

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

Read in order - full index: [docs/README.md](docs/README.md)

1. [01 - Requirements & estimation](docs/01-requirements-and-estimation.md)
2. [02 - System design](docs/02-system-design.md) + [diagrams](docs/02-system-design.md#21-diagrams)
3. [03 - API & domain](docs/03-api-and-domain-design.md) · contract SoT: [docs/contracts/](docs/contracts/)
4. [04 - Operations & failure modes](docs/04-operations-and-failure-modes.md)
5. [05 - CI/CD & delivery](docs/05-cicd-and-delivery.md)
6. [06 - Implementation notes](docs/06-implementation-notes.md) - what shipped and where

---

## How I worked

- Requirements and system design first in `docs/01`–`05`, then code in small commits (store → Open-Meteo → GraphQL → worker → hardening).
- Used AI (Cursor) for scaffolding, tests, and doc drafts; architecture and failure-mode rules were reviewed manually.
- Architecture ADRs, rubric weights, and failure-mode rules (stale-over-empty, no forecast wipe on empty upsert, marine best-effort) were decided and checked manually.
- Verified with Jest, Docker Compose, and the Postman collection; deliberate cuts are listed below and in `docs/04`.

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

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `test:integration` / `test:all` fails | Postgres not running | `docker compose up -d db` and set `DATABASE_URL` |
| GraphQL `UNAUTHENTICATED` | Missing or wrong API key | Set `X-API-Key` (Compose default: `local-compose-api-key`) |
| `API_KEY is required when NODE_ENV=production` | Production env without key | Set `API_KEY` in `.env` or Compose |
| `PROVIDER_UNAVAILABLE` on a new city | Cold-start failed (Open-Meteo down/timeout) | Retry later, use lat/lon, or query a location with persisted data |
| Redis / throttler errors in production | `REDIS_URL` unset | Set `REDIS_URL` (Compose includes `redis`) |
| Empty rankings after Compose start | Worker has not refreshed yet | Query a city by name (cold-start) or wait for refresh cycle |
