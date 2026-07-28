# weather-activity-ranking-service

Backend take-home (Collinson Senior / Lead): rank the next 7 days for **skiing**, **surfing**, **outdoor sightseeing**, and **indoor sightseeing** using **Open-Meteo** data.

**Stack:** TypeScript · Node.js · **NestJS** · GraphQL (Apollo driver) · PostgreSQL · Docker · GitHub Actions  
**Scope:** Backend only — no frontend. Focused submission over exhaustive features.

---

## How to read this submission

Follow the stages in order. Each step links to the next.

| Stage | Status | Start here |
|------:|:------:|---|
| **1. Clarify** | Done | [docs/01-requirements-and-estimation.md](docs/01-requirements-and-estimation.md) |
| **2. Design** | Done | [docs/02-system-design.md](docs/02-system-design.md) → see Design packet below |
| **3. TDD plan** | Done | [docs/superpowers/plans/2026-07-28-weather-activity-ranking.md](docs/superpowers/plans/2026-07-28-weather-activity-ranking.md) |
| **4. Code** | Done | TDD plan Tasks 1–9 complete (app, worker, Compose, CI) |
| **5. Review** | Next | Deliberate-cuts polish / submission readiness |

**Current stage:** Code complete → Review.

Full doc index (same flow): [docs/README.md](docs/README.md)

---

## Design packet (stage 2)

Read in this order:

1. **[01 — Requirements & estimation](docs/01-requirements-and-estimation.md)** — constraints, FR/NFR, back-of-envelope  
2. **[02 — System design](docs/02-system-design.md)** — HLD, scale ladder, ADRs + [PlantUML diagrams](docs/diagrams/)  
3. **[03 — API & domain](docs/03-api-and-domain-design.md)** — scoring rubric narrative  
   - **Consumer contract (source of truth):** [docs/contracts/](docs/contracts/) — GraphQL SDL, examples, Prisma DB design *(GraphQL, not OpenAPI/Swagger)*  
4. **[04 — Operations & failure modes](docs/04-operations-and-failure-modes.md)** — refresh, staleness, cuts  
5. **[05 — CI/CD & delivery](docs/05-cicd-and-delivery.md)** — GitHub Actions, Docker Compose  

---

## How to run

### Prerequisites

- Node.js 22+
- Docker / Docker Compose
- Copy `.env.example` → `.env` for local non-Compose runs

### Unit tests (no Docker / Postgres)

```bash
npm ci
npm test
```

### Integration tests (Postgres via Compose)

```bash
docker compose up -d db
npm run test:integration
```

### Full local stack (db + api + worker)

```bash
docker compose up --build -d
curl -s http://localhost:3000/health
```

- **API:** GraphQL at `http://localhost:3000/graphql`, health at `http://localhost:3000/health`
- **Worker:** same image; refresh loop against Postgres
- On start, `api` runs `prisma migrate deploy` then listens on port 3000

Stop with `docker compose down`.

---

## Sample GraphQL query

```bash
curl -s http://localhost:3000/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"query($location: LocationInput!){ activityRanking(location:$location){ location{name} stale rankings{activity overallScore rank} } }","variables":{"location":{"name":"Cape Town"}}}'
```

More operations: [docs/contracts/examples.graphql](docs/contracts/examples.graphql) · contract overview: [docs/contracts/README.md](docs/contracts/README.md)

| Endpoint | Method | Purpose |
|---|---|---|
| `/graphql` | `POST` | Activity rankings |
| `/health` | `GET` | Liveness + refresh status |

---

## Assumptions (short)

- “How good” = versioned deterministic weather rubric (`2026-07-28.1`), not ML  
- Skiing = weather suitability, not “ski resort exists”  
- Default refresh every 6 hours; responses expose `lastUpdated` / `dataAgeSeconds` / `stale`  
- Warm path reads Postgres only; cold-start may call Open-Meteo within a timeout  

More: [docs/01](docs/01-requirements-and-estimation.md) §2 and [docs/04](docs/04-operations-and-failure-modes.md).

---

## Deliberate cuts

From [docs/04 §6](docs/04-operations-and-failure-modes.md) — focused submission beats exhaustive:

| Cut | Why |
|---|---|
| No auth / multi-tenant | Out of brief |
| No forecast history | No FR; storage explosion |
| No microservices | ADR-001 |
| No serverless | ADR-002 |
| No CDN / multi-region / WAF | Backend GraphQL; YAGNI |
| No Redis in v1 | In-process cache sufficient initially |
| No message queue in v1 | One worker + concurrency config |
| No admin UI for locations | Out of brief |
| No “is there a ski resort?” | Weather-only scope |
| Cloud LB not provisioned | Design for it; ship one replica |
| Full CD to production cloud | Optional; CI is the mandatory shape |

---

## TDD plan (stage 3)

**[docs/superpowers/plans/2026-07-28-weather-activity-ranking.md](docs/superpowers/plans/2026-07-28-weather-activity-ranking.md)** — Code stage (Tasks 1–9) complete. Next: Review.
