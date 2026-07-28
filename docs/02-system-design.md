# 02 — System Design (HLD, Scale, Technology ADRs)

**Stage 2 of 5: Clarify → Design → TDD → Code → Review**

High-level architecture, how components talk (PlantUML), horizontal scale posture, and locked technology decisions. API consumer contract and scoring rubric: [`03-api-and-domain-design.md`](03-api-and-domain-design.md). Ops: [`04-operations-and-failure-modes.md`](04-operations-and-failure-modes.md). CI/CD: [`05-cicd-and-delivery.md`](05-cicd-and-delivery.md).

Depends on: [`01-requirements-and-estimation.md`](01-requirements-and-estimation.md).

---

## 1. Design goals

- Satisfy FR/NFR from `01` with production judgement, not platform theatre
- Stay **stateless on the read path** so unknown traffic can be absorbed by **horizontal API replicas**
- Keep Open-Meteo off the hot path (except bounded cold-start)
- Show decisions and rejected alternatives clearly for interview review

---

## 2. High-level architecture

**Style: modular monolith** — one TypeScript codebase, one Docker image, clear internal modules. Optional second process entrypoint for the refresh worker (same image, different command).

```
Client → [LB*] → API (GraphQL) → Store (Postgres)
                      ↓
                   Scorer (pure)
Refresh worker → Open-Meteo → Store (idempotent upserts)
```

\* Load balancer is a **scale add-on**, not part of the v1 take-home provisioned stack.

### 2.1 Diagrams (PlantUML sources)

| Diagram | File | Purpose |
|---|---|---|
| Context | [`diagrams/01-context.puml`](diagrams/01-context.puml) | External actors and trust boundaries |
| Deployment | [`diagrams/02-deployment.puml`](diagrams/02-deployment.puml) | Replicas, LB posture, worker |
| Modules | [`diagrams/03-modules.puml`](diagrams/03-modules.puml) | Internal module boundaries |
| Happy-path query | [`diagrams/seq-happy-path.puml`](diagrams/seq-happy-path.puml) | Warm read path |
| Cold-start | [`diagrams/seq-cold-start.puml`](diagrams/seq-cold-start.puml) | FR-U4 |
| Scheduled refresh | [`diagrams/seq-refresh.puml`](diagrams/seq-refresh.puml) | FR-O1 / FR-S3 |
| Provider down | [`diagrams/seq-provider-down.puml`](diagrams/seq-provider-down.puml) | Last-known-good |
| Ambiguous geocode | [`diagrams/seq-ambiguous-geocode.puml`](diagrams/seq-ambiguous-geocode.puml) | FR-U3 |

Render with any PlantUML runner (IDE plugin, `plantuml.jar`, or [plantuml.com](https://www.plantuml.com/plantuml)). Sources are the source of truth—do not invent architecture that contradicts them.

### 2.2 Module responsibilities

| Module | Responsibility | Depends on |
|---|---|---|
| `graphql` | Schema, resolvers, input validation, response shaping | `store`, `scoring`, `geocoding` |
| `scoring` | Pure, versioned activity scores from weather features | none (no I/O) |
| `store` | Postgres access, upserts, geocode cache, refresh metadata | Prisma / Postgres |
| `refresh` | Scheduled fetch loop, concurrency limits, outcome logging | `store`, `open-meteo`, `scoring` |
| `open-meteo` | HTTP client, retry/backoff, circuit breaker | Open-Meteo |
| `geocoding` | Name → candidates; cache via `store` | `store`, `open-meteo` |

---

## 3. Request vs write paths

| Path | Trigger | Touches Open-Meteo? | Latency SLO |
|---|---|---|---|
| **Warm GraphQL read** | Client query | No | < 300ms p95 |
| **Cold-start read** | First seen location / empty forecast | Yes (bounded) | < 3s with timeout |
| **Background refresh** | Timer (`REFRESH_INTERVAL_MS`, default `21600000` = 6h) | Yes | None user-facing |

Reads and writes are causally independent (`01` §6): user QPS does not drive Open-Meteo load; a slow refresh does not block warm reads.

---

## 4. Horizontal scaling & edge posture

Traffic is **unknown**. We design for scale without building unused infra.

### 4.1 Scale ladder

| Signal | Action | Build in take-home? |
|---|---|---|
| API p95 / QPS rising | Add **stateless API replicas** behind an LB | Design yes; ship 1 replica |
| DB connections / CPU | Connection pooling → PgBouncer → read replica | Document only |
| Refresh lag / rate limits | Lower worker concurrency or interval; later queue (BullMQ/SQS) | Config knobs yes; queue later |
| Multi-worker double-refresh | Postgres advisory lock or single leader | Document trigger |
| Cache miss storms across replicas | Shared Redis | In-memory v1 only |
| Multi-region / WAF / API gateway | Platform concern if product needs it | Out of scope |

### 4.2 Load balancer

- **In design:** Client → LB → API replicas (see deployment diagram)
- **In v1:** omitted; one API process is enough for the exercise
- **App constraint:** no sticky sessions, no local disk as source of truth, cache is best-effort TTL only

Any L4/L7 LB works (cloud LB, nginx, Traefik)—we do not lock a vendor.

### 4.3 CDN

**Not needed.** Backend-only GraphQL, small JSON payloads (~2 KB), typically `POST /graphql` (poor CDN fit). Freshness is owned by refresh interval + response fields (`lastUpdated`, `dataAgeSeconds`, `stale`), not edge caches.

### 4.4 What we ship vs what we design for

| Concern | Design | Implement in submission |
|---|---|---|
| Stateless API | Yes | Yes |
| Single Postgres primary | Yes | Yes (Compose) |
| LB + N replicas | Yes (diagram + ladder) | No (one API container) |
| CDN | Explicitly N/A | No |
| Redis | Scale trigger | No (in-process TTL cache OK) |
| Microservices | Rejected | No |

---

## 5. Technology ADRs

### ADR-001 — Modular monolith (not microservices)

- **Decision:** One deployable service with internal modules; optional `api` / `worker` process split via entrypoint.
- **Why:** Unknown/low traffic; team-of-one take-home; network boundaries would add latency and ops without scale win. Module seams preserve the option to extract the worker later.
- **Rejected:** Microservices per activity or separate geocode/forecast services—premature.
- **Scale trigger:** Split worker deploy when refresh cadence or resource profile diverges from API.

### ADR-002 — Containers, not serverless

- **Decision:** Multi-stage Docker image + Compose for local; container-ready for Fly/Render/ECS-style hosts.
- **Why:** Long-running GraphQL process + scheduled refresh with concurrency control fit containers. Serverless max duration, cold starts, and cron/worker patterns fight this workload.
- **Rejected:** AWS Lambda / Cloud Functions as primary runtime.
- **Cut:** No Terraform/CloudFormation in v1 unless spare time after a working service.

### ADR-003 — PostgreSQL + Prisma

- **Decision:** PostgreSQL as system of record; Prisma for schema migrations and typed access.
- **Why:** Idempotent upserts on `(location_id, forecast_date)`; multi-replica API needs a real server DB (SQLite single-writer fights horizontal scale); schema clarity for reviewers; volume from `01` is tiny—Postgres is chosen for **integrity and scale headroom**, not size.
- **Rejected:** SQLite as primary; DynamoDB/NoSQL (weaker fit for relational forecast rows + upserts in this exercise).
- **Scale trigger:** PgBouncer / read replicas when DB—not the app—is the bottleneck.

### ADR-004 — Apollo Server (GraphQL) on TypeScript/Node

- **Decision:** TypeScript (brief mandate) + Apollo Server standalone for `POST /graphql`.
- **Why:** Matches stack constraint; mature TS typing story; playground useful for README demos.
- **Rejected:** REST wrapper “plus GraphQL later”; gRPC (out of brief).

### ADR-005 — In-process cache now; Redis later

- **Decision:** Short-TTL in-memory cache for hot locations on each API instance.
- **Why:** Hot set ~500 KB (`01`); 6h data change rate; single/few replicas make shared cache optional.
- **Rejected:** Redis in v1 (ops cost without proven need).
- **Scale trigger:** Shared Redis when replica count causes stampede or uneven hit rates.

### ADR-006 — Refresh scheduling in-worker

- **Decision:** `node-cron` / interval inside the worker process; `REFRESH_INTERVAL_MS` env config in milliseconds (FR-O2). Default `21600000` (6 hours).
- **Why:** Simplest decoupled refresh; one worker avoids double-fetch.
- **Rejected:** External cron hitting an HTTP “refresh all” endpoint as the only mechanism (harder to bound concurrency).
- **Scale trigger:** Advisory lock or queue if multiple workers are required.

---

## 6. Locked stack summary

| Layer | Choice |
|---|---|
| Language | TypeScript on Node.js |
| API | Apollo Server + GraphQL |
| Persistence | PostgreSQL + Prisma |
| Weather | Open-Meteo (forecast + geocoding) |
| Runtime shape | Modular monolith, Docker |
| Cache (v1) | In-process TTL |
| CI | GitHub Actions (see `05`) |

---

## 7. Mapping to requirements

| Requirement | Design answer |
|---|---|
| FR-S1 / warm path | Store is source of truth; diagrams `seq-happy-path` |
| FR-U4 cold-start | Bounded Open-Meteo on miss; `seq-cold-start` |
| FR-O1 refresh | Worker process; `seq-refresh` |
| FR-S3 idempotent writes | Upsert key `(location_id, forecast_date)` |
| Availability NFR | Last-known-good + `stale`; `seq-provider-down` |
| Scalability NFR | Stateless API + scale ladder |
| Testability NFR | Pure `scoring` module |

---

## 8. Next

→ [`03-api-and-domain-design.md`](03-api-and-domain-design.md) — consumer GraphQL contract, data model, scoring rubric.

Doc index: [`README.md`](README.md).
