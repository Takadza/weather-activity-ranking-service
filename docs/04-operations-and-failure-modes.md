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

See rendered sequence in [`02` §2.1](02-system-design.md#scheduled-refresh) ([SVG](diagrams/seq-refresh.svg) · [`.puml`](diagrams/seq-refresh.puml)).

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

### 4.1 Health probes

| Endpoint | Role |
|---|---|
| `GET /health/live` | Liveness (no DB) |
| `GET /health/ready` | Readiness; **503** when `status: "degraded"` or DB unavailable (`status: "unavailable"`) |
| `GET /health` | Compatibility probe: same JSON as `/health/ready` for ok/degraded with HTTP 200; may **500** if DB/probe throws — prefer `/health/live` and `/health/ready` |
| GraphQL `health` | Same payload as HTTP health (counts toward GraphQL throttle) |
| Worker `GET /health/live` | Liveness on `WORKER_METRICS_PORT` (default 3001) |

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

- `status: "degraded"` if tracked locations exist and last success is older than `STALE_AFTER_SECONDS` (or never succeeded)
- Partial refresh failures may set `lastError` while still advancing `lastSuccessAt`; that alone does **not** force degraded

### 4.2 Logs (structured JSON)

- Production uses JSON Nest logger; `LOG_LEVEL` controls verbosity
- Each request gets `x-request-id` (incoming or generated); JSON logs include `requestId` when in request scope
- Refresh cycle start/end, per-location success/fail
- Open-Meteo errors and circuit transitions
- Cold-start events (bounded by `COLD_START_MAX_CONCURRENT`)

### 4.3 Metrics (process-local Prometheus text)

Counters are **in-process** (no shared store):

| Process | Endpoint | Metrics |
|---|---|---|
| API | `GET /metrics` (port 3000) | `cold_starts_total`, `cold_start_rejects_total`, `provider_errors_total` |
| Worker | `GET /metrics` (port `WORKER_METRICS_PORT`, default 3001) | `refresh_cycles_total`, `refresh_location_failures_total` |

When `METRICS_TOKEN` is set, scrapers must send `Authorization: Bearer <token>` or `X-Metrics-Token: <token>`. **Required when `NODE_ENV=production`.** `/health` and `/health/ready` omit `lastError` unless the same metrics token is presented. Rotate `API_KEY` / `METRICS_TOKEN` periodically; prefer scraping worker metrics on loopback or a private network (TLS at the edge/mesh — the worker HTTP server itself is cleartext by design).

Scrape both processes in production.

### 4.4 Client rate limiting

- Global Nest throttler (defaults: `THROTTLE_LIMIT=60` per `THROTTLE_TTL_MS=60000`)
- Applies to GraphQL and HTTP; `/health/live` and `/metrics` are skipped (GraphQL `health` still counts; `/health` and `/health/ready` are throttled)
- On GraphQL, over-limit requests surface as a GraphQL error (`Too Many Requests`) rather than a bare HTTP 429
- When `REDIS_URL` is set, limits are shared across API replicas; **required in production**
- Behind a reverse proxy/LB, set `TRUST_PROXY=1` (or hop count) so client IP for throttling is taken from `X-Forwarded-For` correctly — leave unset for direct Compose/port exposure

---

## 5. Security (exercise-scoped)

- No PII collection
- Validate `LocationInput` (name length cap, finite lat/lon ranges)
- Parameterised queries only (Prisma) — never use `$queryRawUnsafe` / `$executeRawUnsafe`
- Shared `API_KEY` for GraphQL/HTTP (except `/health/live` and `/metrics`)
- Helmet security headers on the API; CORS only when `ALLOWED_ORIGINS` is non-empty
- Client rate limiting (see §4.4); `METRICS_TOKEN` for scrape endpoints and detailed health
- Tracked locations: named geocode primary only, capped by `MAX_TRACKED_LOCATIONS` (coords never auto-track)
- Secrets only via env (see `05`); never commit `.env` / `.env.production` (gitignore covers `.env.*` except `.env.example`)
- Manual verification: Postman collection at [`../postman/weather-activity-ranking.postman_collection.json`](../postman/weather-activity-ranking.postman_collection.json) (API key + multi-city/coords/negative cases)

---

## 6. Deliberate cuts

Documented for reviewers—focused submission beats exhaustive (`01` + brief).

| Cut | Why |
|---|---|
| No multi-tenant / OAuth | Out of brief; shared API key is enough for v1 |
| No forecast history | No FR; storage explosion |
| No microservices | ADR-001 |
| No serverless | ADR-002 |
| No CDN / multi-region / WAF | Backend GraphQL; YAGNI |
| No message queue in v1 | One worker + concurrency config |
| No admin UI for locations | Out of brief |
| No “is there a ski resort?” | Q4 weather-only scope |
| Cloud LB not provisioned | Design for it; ship one replica |
| Full CD to production cloud | Optional; CI is mandatory shape in `05` |
| App-level HTTPS for worker metrics | Terminate TLS at edge/mesh; bind loopback by default |

---

## 7. Success checks (ops view)

- [x] Refresh is idempotent under forced retry
- [x] Killing Open-Meteo (mock) still serves warm locations with `stale: true`
- [x] Health reflects last refresh success/age
- [x] Cold-start respects timeout and does not hang the event loop for other requests

---

## 8. Next

→ [`05-cicd-and-delivery.md`](05-cicd-and-delivery.md) — GitHub Actions, Docker, delivery posture.

Doc index: [`README.md`](README.md).
