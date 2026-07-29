# Weather Activity Ranking Service — Requirements & Estimation

**Stage 1 of 5: Clarify → Design → Implementation notes → Code → Review**

Constraints, clarifying assumptions, functional & non-functional requirements, and back-of-the-envelope calculations. Architecture, API contracts, ops, and CI/CD are covered in `02`–`05` (Design stage).

---

## 1. Constraints

**From the brief**

- **Language/runtime:** Node.js with **TypeScript** (assessment requirement)
- **API:** GraphQL (not REST / gRPC)
- **Weather source:** Open-Meteo (free public API; rate limits; no SLA)
- **Persistence is mandatory:** serve weather from storage, not from Open-Meteo on every request
- **Backend only:** no front end
- **AI-assisted development is expected** — document decisions inline as they are made
- **Storage technology unconstrained** — chosen in System Design (`02`) once workload shape is known
- **Submission:** public GitHub repo; show reasoning (docs/commits), not a polished write-up alone

**Inferred**

- Deliverable is a public repo + README for engineer review (run instructions and deliberate cuts matter)
- “Production judgement” without over-building: graceful degradation, idempotency, observability — sized to this workload
- Time-boxed: interesting trade-offs beat exhaustive feature coverage
- Design for horizontal scale of a stateless API; ship a focused single-instance stack that stays compatible with replicas behind a load balancer

**Out of scope:** user accounts/auth, historical/past-date weather, push notifications, admin UI for tracked locations

---

## 2. Clarifying Questions & Assumptions

| # | Question | Assumption | Why (one line) |
|---|---|---|---|
| Q1 | What does “how good” mean per activity? | Define an explicit, versioned scoring rubric (thresholds on temp, precip, wind, snowfall, waves, etc.) | Untestable heuristics are the biggest review risk; rubric lives in `03`, not inline conditionals |
| Q2 | Ambiguous / unresolvable location names? | Best geocoding match **plus** alternative candidates | Surfacing ambiguity beats a silent wrong guess; client can disambiguate later |
| Q3 | How fresh must data be? | Default **6-hour** refresh; expose `lastUpdated` / `dataAgeSeconds` on every response | 7-day forecasts don’t move faster; freshness observability matters more than the exact interval |
| Q4 | Can weather alone decide skiing suitability? | Scope = **weather suitability for skiing conditions**, not “has a ski resort” | Resort existence needs a geo-features dataset outside this stack; document the limitation in the README |

---

## 3. Functional Requirements

### 3.1 User-facing

- **FR-U1:** Given city/town name or lat/lon, return a 7-day forecast-based ranking for skiing, surfing, outdoor sightseeing, and indoor sightseeing
- **FR-U2:** Every response includes freshness (`lastUpdated` / `dataAgeSeconds` / `stale`)
- **FR-U3:** Ambiguous location → best match + alternatives (Q2)
- **FR-U4:** Cold-start location still returns a usable result (not a hard failure)

### 3.2 System

- **FR-S1:** Persist raw Open-Meteo forecasts; hot path reads storage only (cold-start FR-U4 is the bounded exception)
- **FR-S2:** Persist derived activity scores (or compute cheaply from stored raw data) — no re-fetch to score
- **FR-S3:** Refresh writes are idempotent upserts keyed by `(location, forecast_date)`
- **FR-S4:** Scoring per activity is deterministic and explicit (Q1)
- **FR-S5:** Persist/cache geocoding (name → coordinates)

### 3.3 Operational

- **FR-O1:** Scheduled background refresh, fully decoupled from the request path
- **FR-O2:** Refresh interval is configuration, not a hardcoded constant
- **FR-O3:** Open-Meteo calls use retry-with-backoff and a circuit breaker
- **FR-O4:** Health/status reports last refresh success and age
- **FR-O5:** Structured logs for refresh outcomes and Open-Meteo failures

---

## 4. Non-Functional Requirements

| Area | Target |
|---|---|
| **Availability** | **99.9%** API; on Open-Meteo failure serve last-known-good data with staleness flag (do not couple our uptime to theirs) |
| **Consistency** | **Eventual** — source is a changing forecast; no transactional user actions; lag OK if observable (FR-U2) |
| **Performance** | Persisted read path **< 300ms p95**; cold-start **< 3s** with timeout; refresh job has no user-facing latency SLO |
| **Reliability** | Idempotent upserts (FR-S3); retry/backoff (FR-O3); degraded mode = stale-but-flagged |
| **Scalability** | Stateless read path → horizontal app scaling is a config change; refresh scales with location count, not user QPS |
| **Extensibility** | New activity = new scoring function on existing persisted fields (no refresh/schema redesign) |
| **Maintainability** | Scoring, refresh, and GraphQL resolvers are separable concerns |
| **Testability** | Scoring is pure/deterministic — unit-testable without DB or HTTP (hard requirement for the scoring module) |
| **Cost** | Workload fits a small app + DB instance; main “cost” is Open-Meteo rate-limit citizenship |
| **Observability** | Structured logs; metrics for refresh success/fail, Open-Meteo latency/errors, cache/DB hit ratio |
| **Security** | No PII collected; validate location input (length, parameterised queries); shared `API_KEY` on GraphQL/HTTP (except `/health/live`); `METRICS_TOKEN` for scrape/detail; Redis rate limits in production |

---

## 5. Back-of-the-Envelope Calculations

**Framing:** take-home traffic is ~zero. Numbers below use a **hypothetical** small-to-mid consumer profile so architecture reasoning is real, not trivially empty. Every input is an assumption.

### 5.1 Traffic assumptions

| Input | Value |
|---|---|
| MAU | 500,000 |
| DAU | 50,000 (10% of MAU) |
| Avg requests/user/day | 2 |
| Peak multiplier | 4× |

### 5.2 Traffic

| Metric | Value |
|---|---|
| Requests/day | 50,000 × 2 = **100,000** |
| Avg QPS | ≈ **1.2** |
| Peak QPS | ≈ **4.6** |

**Conclusion:** request throughput is trivial. Design effort belongs on persistence/refresh and the Open-Meteo boundary.

### 5.3 Locations & refresh

| Input | Value |
|---|---|
| Distinct tracked locations | **5,000** |
| Refresh interval | **6 hours** (4×/day) |
| Open-Meteo calls/day | 5,000 × 4 = **20,000** ≈ 0.23/sec avg |

**Conclusion:** within free-tier rate limits in steady state; retry/backoff and bounded worker concurrency still matter (cold-start bursts).

### 5.4 Storage

- ~**1 KB** per location per day-record (7-day forecast fields + derived scores)
- Steady-state current forecast: 5,000 × 7 ≈ **~35 MB**
- **v1 decision:** keep **current forecast only** (matches FR-U1). Full history would be ~140 MB/day / ~51 GB/year — deliberately cut; no FR requires it.
- Single DB instance is enough; **tech choice locked in `02`** (Postgres — volume alone doesn’t force it; multi-replica API and upserts do).

### 5.5 Bandwidth

- In: 20,000 × ~15 KB ≈ **~300 MB/day**
- Out: 100,000 × ~2 KB ≈ **~200 MB/day**

Not a design constraint.

### 5.6 Cache

- Hot set: top **500** locations (Zipfian) ≈ **~500 KB**
- Target hit ratio **>90%** (data changes every 6 hours)

Value is read-latency shaping and lower DB load, not capacity.

### 5.7 Servers

- **App:** one stateless instance (scale horizontally later if traffic assumptions are wrong)
- **DB:** one instance — tens of MB, write rate ≪ 1/sec
- **Refresh worker:** one scheduled process; queue/worker-pool deferred unless locations or frequency grow ~100×

---

## 6. Read vs Write & Architectural Implications

| Metric | Value |
|---|---|
| Reads/day (GraphQL) | 100,000 |
| Writes/day (refresh upserts) | 20,000 |
| Read : write | ~5 : 1 |
| Peak read RPS | ~4.6 |
| Peak write rate | Bounded by worker concurrency, not user traffic |

Reads and writes are **causally independent**: writes follow tracked-location count on a schedule; reads follow users. A read spike does not increase write load; a slow refresh does not block reads (last-known-good + staleness).

**Implications for System Design (`02`):**

1. Stateless request handling — cheap to keep now, expensive to retrofit
2. All Open-Meteo I/O in background refresh (except bounded cold-start FR-U4)
3. Prefer read-optimised persistence over write-optimised
4. Asynchronous, idempotent refresh (FR-S3) — retries/overlaps must be safe by construction
5. Separate ingestion, scoring, and GraphQL read API — they are independent workloads
6. External provider dominates latency/reliability risk — invest at that boundary, not in internal perf tuning

---

## 7. Risks & Success Criteria

### Risks

| Risk | Mitigation |
|---|---|
| Open-Meteo down/slow | Serve last-known-good + staleness; circuit breaker on provider client (cold-start/refresh) |
| Open-Meteo rate limits | Configurable interval + concurrency (FR-O2); backoff (FR-O3) |
| Partial / failed refresh | Idempotent upserts `(location, date)` (FR-S3) |
| Ambiguous place names | Best match + alternatives (FR-U3) |
| Missing fields (e.g. no marine inland) | Score N/A for that activity; don’t fail the whole query |
| Contested scoring rubric | Isolated, versioned, unit-testable function (FR-S4) |

### Success criteria

- [x] Persisted reads **< 300ms p95** (warm path is Postgres-only; design target)
- [x] Refresh completes on schedule and is idempotent under retry
- [x] Rankings match documented rubric (unit tests with known inputs)
- [x] Queries still succeed with staleness flag when Open-Meteo is unavailable
- [x] New activity = new scoring function only (no refresh/schema change)

---

## 8. What We Learned → Next

- Peak ~5 QPS is not the hard problem — **decoupled schedule-driven writes** and the **Open-Meteo boundary** are
- Storage stays small; no sharding or specialised TSDB for v1
- Caching + background refresh are where reliability and latency wins live
- DB tech can be chosen for schema fit and ops simplicity, not raw scale

**Next (Design stage):**

1. [`02-system-design.md`](02-system-design.md) — HLD, PlantUML diagrams, scale ladder, technology ADRs
2. [`03-api-and-domain-design.md`](03-api-and-domain-design.md) — GraphQL consumer contract, data model, scoring rubric
3. [`04-operations-and-failure-modes.md`](04-operations-and-failure-modes.md) — refresh, failure modes, observability, cuts
4. [`05-cicd-and-delivery.md`](05-cicd-and-delivery.md) — GitHub Actions CI/CD, Docker Compose
5. [Implementation notes](06-implementation-notes.md) — Code + Review complete

Doc index: [`README.md`](README.md).
