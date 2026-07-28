# 04 — Operations & Failure Modes

**Stage 2 of 5 (Design) — refresh, resilience, observability, deliberate cuts**

Depends on: [`01-requirements-and-estimation.md`](01-requirements-and-estimation.md), [`02-system-design.md`](02-system-design.md), [`03-api-and-domain-design.md`](03-api-and-domain-design.md).

---

## 1. Refresh job

| Setting | Default | Notes |
|---|---|---|
| `REFRESH_INTERVAL_MS` | `21600000` (6h) | FR-O2 — milliseconds; config, not a hardcoded constant |
| `REFRESH_CONCURRENCY` | `5` | Bound parallel Open-Meteo calls |
| `OPEN_METEO_TIMEOUT_MS` | `5000` | Per-request timeout |
| `COLD_START_TIMEOUT_MS` | `3000` | Aligns with < 3s cold-start NFR |
| `STALE_AFTER_SECONDS` | same as refresh interval | Drives `stale` flag on responses |

**Behaviour:**

1. On interval, list tracked locations
2. For each (pool size = concurrency): fetch forecast → upsert `(location_id, forecast_date)` → update `fetched_at`
3. On partial failure: log, continue other locations; **never delete** existing forecast rows on failure
4. Update `RefreshMeta` last attempt / success / error

Idempotency (FR-S3): retries and overlapping runs are safe because upserts replace the same natural key.

See PlantUML: [`diagrams/seq-refresh.puml`](diagrams/seq-refresh.puml).

---

## 2. Open-Meteo boundary

| Control | Spec |
|---|---|
| Retry | Transient 5xx / network errors — exponential backoff with jitter; capped attempts (e.g. 3) |
| Circuit breaker | Open after consecutive failures threshold; fail fast; half-open probe after cool-down |
| Rate citizenship | Concurrency + interval; no thundering herd on cold-start bursts (queue or limit concurrent cold-starts) |
| Logging | Structured: `locationId`, latency, status, attempt, circuit state (FR-O5) |

Hot-path rule: **do not** call Open-Meteo when forecast rows exist—even if stale. Stale flagged data beats an outage (`01` Availability).

---

## 3. Failure modes

| Failure | User-visible behaviour | System behaviour |
|---|---|---|
| Open-Meteo down, warm location | Rankings with `stale: true` | Serve Postgres last-known-good |
| Open-Meteo down, cold-start | GraphQL error | No rows to serve; circuit may be open |
| Open-Meteo slow | Warm: unaffected; cold-start: timeout error | Worker retries with backoff |
| Partial refresh | Prior days/locations remain | Per-location upsert; failures isolated |
| Ambiguous name | Best match + `alternatives` | No silent wrong-only guess |
| Missing marine data inland | Surfing `available: false` | Other activities still ranked |
| Invalid input | GraphQL validation error | No provider call |
| DB unavailable | 5xx / error | API unhealthy; no fake data |

---

## 4. Health & observability

### 4.1 `GET /health`

JSON roughly:

```json
{
  "status": "ok",
  "refresh": {
    "lastSuccessAt": "2026-07-28T12:00:00.000Z",
    "lastAttemptAt": "2026-07-28T12:00:00.000Z",
    "lastError": null,
    "trackedLocationCount": 42
  }
}
```

- `status: "degraded"` if last success older than `STALE_AFTER_SECONDS` *and* locations are tracked (or last error recent)
- Orchestrators may use liveness separately from “refresh freshness” if needed; v1 can keep one endpoint with clear fields

### 4.2 Logs (structured JSON)

- Refresh cycle start/end, per-location success/fail
- Open-Meteo errors and circuit transitions
- Cold-start events (count carefully—cost/rate)

### 4.3 Metrics (minimal set)

| Metric | Why |
|---|---|
| `refresh_success_total` / `refresh_fail_total` | FR-O4/O5 |
| `open_meteo_latency_ms` | Provider risk |
| `open_meteo_errors_total` | Circuit / rate issues |
| `graphql_request_duration_ms` | Read SLO |
| `cache_hit_ratio` or hits/misses | `01` cache NFR |
| `forecast_data_age_seconds` (histogram/gauge) | Freshness |

Expose via Prometheus-style endpoint or log-based metrics in v1—pick one in implementation and document in README. Prefer a simple `/metrics` if time allows; otherwise structured logs alone with a README note (deliberate cut).

---

## 5. Security (exercise-scoped)

- No PII collection
- Validate `LocationInput` (name length cap, finite lat/lon ranges)
- Parameterised queries only (Prisma)
- No auth in v1; leave a single middleware hook point on the HTTP server
- Secrets only via env (see `05`); never commit `.env`

---

## 6. Deliberate cuts

Documented for reviewers—focused submission beats exhaustive (`01` + brief).

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
| No “is there a ski resort?” | Q4 weather-only scope |
| Cloud LB not provisioned | Design for it; ship one replica |
| Full CD to production cloud | Optional; CI is mandatory shape in `05` |

---

## 7. Success checks (ops view)

- [ ] Refresh is idempotent under forced retry
- [ ] Killing Open-Meteo (mock) still serves warm locations with `stale: true`
- [ ] Health reflects last refresh success/age
- [ ] Cold-start respects timeout and does not hang the event loop for other requests

---

## 8. Next

→ [`05-cicd-and-delivery.md`](05-cicd-and-delivery.md) — GitHub Actions, Docker, delivery posture.

Doc index: [`README.md`](README.md).
