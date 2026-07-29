# 03 — API Contract & Domain Design

**Stage 2 of 5 (Design) — consumer contract, data model, scoring rubric**

Freeze interfaces before implementation. Clients consume the GraphQL contract in §1–3; implementers use the data model (§4) and rubric (§5).

**Machine-oriented source of truth:** [`contracts/`](contracts/) — [`schema.graphql`](contracts/schema.graphql), [`examples.graphql`](contracts/examples.graphql), [`prisma-schema.md`](contracts/prisma-schema.md), [`contracts/README.md`](contracts/README.md). Prefer those files over copying SDL from this doc.

Depends on: [`01-requirements-and-estimation.md`](01-requirements-and-estimation.md), [`02-system-design.md`](02-system-design.md).

---

## 1. How to consume this service

See [`contracts/README.md`](contracts/README.md) for the canonical consumer guide.

| Endpoint | Method | Purpose |
|---|---|---|
| `/graphql` | `POST` | Activity ranking queries (GraphQL) |
| `/health/live` | `GET` | Public liveness (no DB) |
| `/health` / `/health/ready` | `GET` | Authenticated probes; readiness 503 when degraded |

- **Content-Type:** `application/json` with GraphQL body `{ "query": "...", "variables": { ... } }`
- **Auth (v1):** shared `API_KEY` via `X-API-Key` or `Authorization: Bearer`. Required when `NODE_ENV=production`. `/health/live` stays public; `/metrics` uses `METRICS_TOKEN` separately.
- **Playground:** disabled; use Postman or curl for demos
- **Postman:** [`../postman/weather-activity-ranking.postman_collection.json`](../postman/weather-activity-ranking.postman_collection.json) — cities, coords, auth/negative cases, health, metrics (Compose defaults: `local-compose-api-key` / `local-compose-metrics-token`)

Consumers **must** handle freshness fields on every successful ranking payload: `lastUpdated`, `dataAgeSeconds`, `stale`.

---

## 2. GraphQL schema (SDL)

**Canonical file:** [`contracts/schema.graphql`](contracts/schema.graphql). Do not diverge from it in code without updating that file first.

---

## 3. Example operations & consumer rules

**Canonical examples:** [`contracts/examples.graphql`](contracts/examples.graphql).

### 3.1 Consumer rules

| Situation | Behaviour |
|---|---|
| Missing / wrong API key | HTTP 401 or GraphQL `UNAUTHENTICATED` |
| Valid warm location | `200` + payload; `stale: false` if within threshold |
| Ambiguous name | `200` + `location` = best match + `alternatives` populated |
| Empty / invalid input | GraphQL error (`BAD_USER_INPUT`) — e.g. missing both name and coordinates; name too long |
| Cold-start success | `200` + payload; may be slower (< 3s) |
| Cold-start failure (no data, provider down) | GraphQL error (`PROVIDER_UNAVAILABLE` or similar) |
| Warm location, provider down | `200` + last-known-good; `stale: true` |
| Activity N/A (e.g. surfing inland) | `available: false`, `score: null`, reason code e.g. `NO_MARINE_DATA` — do not fail the query |

---

## 4. Data model

**Canonical Prisma design:** [`contracts/prisma-schema.md`](contracts/prisma-schema.md).

**v1 storage policy:** keep **current 7-day window only** per location (`01` §5.4). No historical retention.

**Scores:** **compute-on-read** from `ForecastDay` via pure scorer (no `ActivityScoreDay` table in v1).

### 4.2 Tracked locations

A location becomes **tracked** when first successfully resolved by **name** (under `MAX_TRACKED_LOCATIONS`). Coordinate-only lookups do not auto-track. The refresh worker iterates tracked locations only.

---

## 5. Scoring rubric (`rubricVersion: "2026-07-28.1"`)

Deterministic pure functions: same weather features → same scores. Unit-test with golden fixtures.

**Exact algorithm SoT:** [`src/scoring/`](../src/scoring/) with `rubricVersion: "2026-07-28.1"`. This section is product guidance; if narrative and code disagree, **code wins**.

**Output per activity per day:** `score` ∈ [0, 100] or unavailable; `reasonCodes` explain major drivers (for tests and debugging—not user essays).

### 5.1 Shared helpers

- Clamp score to `[0, 100]`
- Missing required field for an activity → `available: false` (do not invent data)

### 5.2 Skiing (weather suitability — not resort existence)

| Signal | Guidance |
|---|---|
| Prefer | `snowfall_cm` > 0; `temp_max_c` roughly −15…5°C |
| Penalise | Rain (`precip_mm` high with `temp_max_c` > 2); strong wind |
| Soft boost | Colder temps with snow |

Example shape (see Task 2 for exact numbers used in tests):

- Warm-range boost when `temp_max_c` ∈ [−15, 5]
- Boost from snowfall; penalise warm rain and high wind
- Else low score with `TOO_WARM` / `NO_SNOW` reason codes

**Limitation (Q4):** score means “weather resembles ski-friendly conditions,” not “a ski resort exists here.”

### 5.3 Surfing

| Signal | Guidance |
|---|---|
| Require | `wave_height_m` present; else `available: false`, `NO_MARINE_DATA` |
| Prefer | Wave height ~0.5–2.5 m; moderate wind; not extreme precip |
| Penalise | Flat water; huge waves; storm wind |

### 5.4 Outdoor sightseeing

| Signal | Guidance |
|---|---|
| Prefer | Mild temp (~10–28°C), low precip, low precip probability, calm wind, clear-ish `weather_code` |
| Penalise | Heavy rain, extreme heat/cold, high wind |

Indoor is the complement, not a copy.

### 5.5 Indoor sightseeing

| Signal | Guidance |
|---|---|
| Prefer | Poor outdoor conditions (rain, extreme temp, high wind) → higher indoor score |
| Penalise | Ideal outdoor weather (indoor is “less necessary”) |

Indoor remains available even in good weather (museums on sunny days)—score reflects relative suitability, still in 0–100.

### 5.6 Overall ranking

- `overallScore` = mean of available daily scores (ignore unavailable days in the mean denominator)
- If all days unavailable → `overallScore: null`; rank among activities that have scores first; nulls last
- Tie-break: higher `overallScore`, then `ActivityType` enum order

### 5.7 Extensibility

New activity = new pure function + enum value + tests. No Open-Meteo refresh schema change if fields already persisted (`01` Extensibility NFR).

---

## 6. Open-Meteo field mapping (implementation note)

Request daily (and marine when needed) variables sufficient for §5: temperature max/min, precipitation sum/probability, wind speed max, snowfall sum, weather code, wave height. Exact query params locked in code with a short comment pointing here.

Geocoding: Open-Meteo geocoding API; persist normalised query → candidates (FR-S5).

---

## 7. Next

→ [`04-operations-and-failure-modes.md`](04-operations-and-failure-modes.md) — refresh ops, failure modes, observability, deliberate cuts.

Doc index: [`README.md`](README.md).
