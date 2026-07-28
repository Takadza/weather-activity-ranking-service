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
| **4. Code** | In progress | Tasks 1–3 done (scaffold, scoring, Postgres/Prisma store); continue TDD plan |
| **5. Review** | Not started | README runbook + deliberate cuts (after Code) |

**Current stage:** Code in progress (through Task 3).

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

## TDD plan (stage 3)

Bite-sized red → green implementation plan:

**[docs/superpowers/plans/2026-07-28-weather-activity-ranking.md](docs/superpowers/plans/2026-07-28-weather-activity-ranking.md)**

Order: scaffold → scoring → **early CI** → **Postgres Compose + Prisma + integration CI** → Open-Meteo → geocoding → GraphQL → worker → health → full Docker/README.

See the plan’s **Testing & CI/CD timing** section.

---

## How to consume the API (after Code)

| Endpoint | Method | Purpose |
|---|---|---|
| `/graphql` | `POST` | Activity rankings |
| `/health` | `GET` | Liveness + refresh status |

Details and copy-paste queries: [docs/contracts/README.md](docs/contracts/README.md)

---

## Assumptions (short)

- “How good” = versioned deterministic weather rubric (`2026-07-28.1`), not ML  
- Skiing = weather suitability, not “ski resort exists”  
- Default refresh every 6 hours; responses expose `lastUpdated` / `dataAgeSeconds` / `stale`  
- Warm path reads Postgres only; cold-start may call Open-Meteo within a timeout  

More: [docs/01](docs/01-requirements-and-estimation.md) §2 and [docs/04](docs/04-operations-and-failure-modes.md) deliberate cuts.
