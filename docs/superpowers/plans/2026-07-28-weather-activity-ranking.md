# Weather Activity Ranking Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript/Node GraphQL backend that ranks the next 7 days for skiing, surfing, outdoor sightseeing, and indoor sightseeing from persisted Open-Meteo data, with a decoupled refresh worker, Docker Compose, and GitHub Actions CI.

**Architecture:** NestJS modular monolith — pure `ScoringModule`, Prisma `StoreModule`, `OpenMeteoModule` (retry + circuit breaker), `GeocodingModule`, GraphQL via Nest Apollo driver (schema-first SDL), and a schedule-driven `RefreshModule` on a separate worker entrypoint. Warm path reads Postgres only; cold-start is the bounded Open-Meteo exception. Scores are compute-on-read. Nest chosen to match Collinson’s BE stack; scale still via stateless replicas + Postgres ladder (~10M req/day envelope).

**Tech Stack:** TypeScript, Node.js 22, NestJS 10+, `@nestjs/graphql` + `@nestjs/apollo`, Prisma, PostgreSQL 16, Vitest (or Jest), Docker Compose, GitHub Actions.

## Global Constraints

- Language: TypeScript on Node.js (assessment requirement)
- Framework: **NestJS** modular monolith (company BE alignment)
- API: GraphQL only via Nest Apollo driver; consumer SDL: `docs/contracts/schema.graphql` (schema-first)
- Weather: Open-Meteo; persist forecasts; warm path must not call Open-Meteo
- Storage: PostgreSQL + Prisma per `docs/contracts/prisma-schema.md`
- Scoring: pure/deterministic; `rubricVersion: "2026-07-28.1"`; unit-testable without DB/HTTP / Nest context where possible
- Backend only: no frontend
- Focused submission: cuts in `docs/04-operations-and-failure-modes.md`
- Design docs: `docs/01`–`docs/05` and `docs/diagrams/*.puml` are normative
- Scale posture: design for ~10M req/day via horizontal API replicas; do not introduce microservices in v1

## File structure (target)

```
package.json
tsconfig.json
nest-cli.json
vitest.config.ts   # or jest config if using Nest default Jest
.env.example
prisma/schema.prisma
src/
  main.ts                 # API Nest bootstrap
  worker.ts               # Worker Nest bootstrap (RefreshModule only / AppWorkerModule)
  app.module.ts           # API root module
  app.worker.module.ts    # Worker root module
  config/
    config.module.ts
    configuration.ts
  scoring/
    scoring.module.ts
    scoring.service.ts      # pure rubric + rank (no Prisma)
    types.ts
  store/
    store.module.ts
    prisma.service.ts
    locations.repository.ts
    forecasts.repository.ts
    geocode-cache.repository.ts
    refresh-meta.repository.ts
  open-meteo/
    open-meteo.module.ts
    open-meteo.client.ts
    circuit-breaker.ts
  geocoding/
    geocoding.module.ts
    geocoding.service.ts
  graphql/
    graphql.module.ts       # GraphQLModule.forRoot schema-first
    activity-ranking.resolver.ts
    health.resolver.ts      # optional GraphQL health
  refresh/
    refresh.module.ts
    refresh.service.ts
    refresh.scheduler.ts
  health/
    health.controller.ts    # GET /health
docs/contracts/
.github/workflows/ci.yml
Dockerfile
docker-compose.yml
tests/
  unit/scoring/
  unit/open-meteo/
  unit/geocoding/
  unit/refresh/
  integration/
```

**Nest note:** Keep scoring logic framework-agnostic inside `ScoringService` methods so unit tests can `new ScoringService()` or test the pure functions without a full Nest testing module. Use `@nestjs/testing` for resolvers/integration.
---

### Task 1: NestJS project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `nest-cli.json`, `vitest.config.ts` (or Jest), `.env.example`, `.gitignore`
- Create: `src/main.ts`, `src/app.module.ts`, `src/config/configuration.ts`

**Interfaces:**
- Produces: npm scripts `start:dev`, `start:worker:dev`, `build`, `start`, `start:worker`, `typecheck`, `lint`, `test`

- [ ] **Step 1: Scaffold Nest app**

Prefer:

```bash
npx @nestjs/cli@latest new weather-activity-ranking-service --package-manager npm --skip-git
```

Or manually create Nest layout. Ensure project lives at repo root (move files up if CLI creates a subfolder).

- [ ] **Step 2: Add GraphQL + Prisma + config deps**

```bash
npm install @nestjs/graphql @nestjs/apollo @apollo/server graphql @nestjs/config @prisma/client
npm install -D prisma
```

- [ ] **Step 3: Wire `ConfigModule` + `.env.example`**

Env keys (unchanged): `DATABASE_URL`, `PORT`, `REFRESH_INTERVAL_MS`, `REFRESH_CONCURRENCY`, `OPEN_METEO_TIMEOUT_MS`, `COLD_START_TIMEOUT_MS`, `STALE_AFTER_SECONDS`, `LOG_LEVEL`.

- [ ] **Step 4: Empty `AppModule` boots**

```bash
npm run start:dev
```

Expected: Nest listens (GraphQL can be added in Task 6).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json nest-cli.json src .env.example .gitignore
git commit -m "$(cat <<'EOF'
chore: scaffold NestJS app with config module

EOF
)"
```

---

### Task 2: Scoring module (TDD)

**Files:**
- Create: `src/scoring/types.ts`, `src/scoring/scoring.service.ts`, `src/scoring/scoring.module.ts`
- Test: `tests/unit/scoring/rubric.test.ts`, `tests/unit/scoring/rank.test.ts`

**Interfaces:**
- Produces: `ScoringService.scoreDay(...)`, `ScoringService.scoreAll(...)`, `RUBRIC_VERSION` — pure logic, no Nest/Prisma inside the algorithms
- Import in tests from `scoring.service.ts` (or extracted pure functions) **without** creating a Nest testing module for Task 2

- [ ] **Step 1: Write failing skiing / surfing tests**

```ts
// tests/unit/scoring/rubric.test.ts
import { describe, expect, it } from "vitest";
import { scoreDay } from "../../../src/scoring/index.js";

const base = {
  date: "2026-07-28",
  tempMaxC: 0,
  tempMinC: -5,
  precipMm: 0,
  precipProbPct: 10,
  windMaxKmh: 10,
  snowfallCm: 8,
  waveHeightM: null as number | null,
  weatherCode: 71,
};

describe("scoreDay skiing", () => {
  it("scores ski-friendly snow day highly", () => {
    const r = scoreDay("SKIING", base);
    expect(r.available).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(70);
  });

  it("marks warm rainy day as poor ski weather", () => {
    const r = scoreDay("SKIING", {
      ...base,
      tempMaxC: 18,
      snowfallCm: 0,
      precipMm: 20,
      weatherCode: 63,
    });
    expect(r.available).toBe(true);
    expect(r.score).toBeLessThan(40);
    expect(r.reasonCodes.length).toBeGreaterThan(0);
  });
});

describe("scoreDay surfing", () => {
  it("returns NO_MARINE_DATA when wave height missing", () => {
    const r = scoreDay("SURFING", { ...base, waveHeightM: null });
    expect(r.available).toBe(false);
    expect(r.score).toBeNull();
    expect(r.reasonCodes).toContain("NO_MARINE_DATA");
  });

  it("scores moderate waves well", () => {
    const r = scoreDay("SURFING", {
      ...base,
      tempMaxC: 22,
      waveHeightM: 1.5,
      windMaxKmh: 20,
      precipMm: 0,
    });
    expect(r.available).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/scoring/rubric.test.ts`  
Expected: FAIL (module not found / scoreDay not defined)

- [ ] **Step 3: Implement types + skiing/surfing scorers**

Implement per `docs/03` §5. Exact algorithms:

**Skiing** (`clamp` to 0–100):
- Start `score = 20`, reasons `[]`
- If `tempMaxC` in `[-15, 5]`: `score += 20` else push `TOO_WARM` or `TOO_COLD`
- `score += min(40, (snowfallCm ?? 0) * 4)`; if snowfall ≤ 0 push `NO_SNOW`
- If `tempMaxC > 2` and `(precipMm ?? 0) > 5`: `score -= min(30, precipMm)`
- If `(windMaxKmh ?? 0) > 40`: `score -= 15`, push `HIGH_WIND`
- Always `available: true` for skiing when temp fields present; if `tempMaxC === null` → unavailable `MISSING_TEMP`

**Surfing:**
- If `waveHeightM === null` → `{ available: false, score: null, reasonCodes: ["NO_MARINE_DATA"] }`
- Ideal height 0.5–2.5: base 70; below 0.5 penalize toward 20 (`FLAT`); above 2.5 penalize (`TOO_BIG`)
- Wind > 45: −20 `HIGH_WIND`; precip > 15: −10

```ts
// src/scoring/types.ts
export type ActivityType =
  | "SKIING"
  | "SURFING"
  | "OUTDOOR_SIGHTSEEING"
  | "INDOOR_SIGHTSEEING";

export type WeatherDay = {
  date: string;
  tempMaxC: number | null;
  tempMinC: number | null;
  precipMm: number | null;
  precipProbPct: number | null;
  windMaxKmh: number | null;
  snowfallCm: number | null;
  waveHeightM: number | null;
  weatherCode: number | null;
};

export type DayScore = {
  date: string;
  score: number | null;
  available: boolean;
  reasonCodes: string[];
};

export const RUBRIC_VERSION = "2026-07-28.1";

export function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
```

- [ ] **Step 4: Run skiing/surfing tests — expect PASS**

Run: `npm test -- tests/unit/scoring/rubric.test.ts`  
Expected: PASS for skiing/surfing cases (add outdoor/indoor next)

- [ ] **Step 5: Write outdoor/indoor + rank tests**

```ts
// tests/unit/scoring/rank.test.ts
import { describe, expect, it } from "vitest";
import { scoreAll } from "../../../src/scoring/index.js";

describe("scoreAll ranking", () => {
  it("ranks outdoor above indoor on a mild clear day", () => {
    const days = [
      {
        date: "2026-07-28",
        tempMaxC: 22,
        tempMinC: 14,
        precipMm: 0,
        precipProbPct: 5,
        windMaxKmh: 10,
        snowfallCm: 0,
        waveHeightM: null,
        weatherCode: 1,
      },
    ];
    const rankings = scoreAll(days);
    const outdoor = rankings.find((r) => r.activity === "OUTDOOR_SIGHTSEEING")!;
    const indoor = rankings.find((r) => r.activity === "INDOOR_SIGHTSEEING")!;
    expect(outdoor.overallScore!).toBeGreaterThan(indoor.overallScore!);
    expect(outdoor.rank).toBeLessThan(indoor.rank);
  });

  it("leaves surfing overallScore null when all days lack marine data", () => {
    const rankings = scoreAll([
      {
        date: "2026-07-28",
        tempMaxC: 20,
        tempMinC: 12,
        precipMm: 0,
        precipProbPct: 0,
        windMaxKmh: 5,
        snowfallCm: 0,
        waveHeightM: null,
        weatherCode: 0,
      },
    ]);
    const surf = rankings.find((r) => r.activity === "SURFING")!;
    expect(surf.overallScore).toBeNull();
  });
});
```

**Outdoor:** prefer temp 10–28, low precip/prob, low wind, weatherCode &lt; 60 → high score.  
**Indoor:** invert outdoor comfort (bad outdoor → high indoor); still always available if temp present.

**`scoreAll`:** for each activity, map `scoreDay` over days; `overallScore` = mean of available scores (null if none); sort by overallScore desc (nulls last), tie-break ActivityType enum order; assign `rank` 1..n.

- [ ] **Step 6: Implement outdoor/indoor + `scoreAll`; all scoring tests PASS**

Run: `npm test -- tests/unit/scoring`  
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add src/scoring tests/unit/scoring
git commit -m "$(cat <<'EOF'
feat: add deterministic activity scoring rubric with unit tests

EOF
)"
```

---

### Task 3: Prisma schema + store upserts

**Files:**
- Create: `prisma/schema.prisma` (from `docs/contracts/prisma-schema.md`)
- Create: `src/store/prisma.ts`, `src/store/locations.ts`, `src/store/forecasts.ts`, `src/store/geocode-cache.ts`, `src/store/refresh-meta.ts`
- Test: `tests/integration/store.forecasts.test.ts`

**Interfaces:**
- Produces:
  - `upsertForecastDays(locationId: string, days: Omit<ForecastDayCreate, "id">[]): Promise<void>` — idempotent on `(locationId, forecastDate)`
  - `getForecastDays(locationId: string): Promise<WeatherDay[]>` mapped from DB
  - `findOrCreateLocation(...)`, `upsertGeocodeCache(...)`, `getRefreshMeta()`, `recordRefreshSuccess()`, `recordRefreshFailure(error: string)`

- [ ] **Step 1: Copy Prisma schema and migrate**

Copy exact models from `docs/contracts/prisma-schema.md` into `prisma/schema.prisma`.

Run (Postgres via Compose or local):

```bash
docker run -d --name wars-pg -e POSTGRES_USER=wars -e POSTGRES_PASSWORD=wars -e POSTGRES_DB=wars -p 5432:5432 postgres:16-alpine
export DATABASE_URL=postgresql://wars:wars@localhost:5432/wars?schema=public
npx prisma migrate dev --name init
```

- [ ] **Step 2: Write failing upsert idempotency test**

```ts
// tests/integration/store.forecasts.test.ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/store/prisma.js";
import { findOrCreateLocation, upsertForecastDays, getForecastDays } from "../../src/store/forecasts.js";

describe("forecast upserts", () => {
  beforeAll(async () => {
    await prisma.forecastDay.deleteMany();
    await prisma.location.deleteMany();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("upserts same location+date twice without duplicating", async () => {
    const loc = await findOrCreateLocation({
      name: "Testville",
      country: "ZZ",
      admin1: null,
      latitude: 1.23,
      longitude: 4.56,
    });
    const day = {
      forecastDate: new Date("2026-07-28"),
      tempMaxC: 10,
      tempMinC: 2,
      precipMm: 0,
      precipProbPct: 0,
      windMaxKmh: 5,
      snowfallCm: 0,
      waveHeightM: null,
      weatherCode: 0,
      rawJson: null,
      fetchedAt: new Date(),
    };
    await upsertForecastDays(loc.id, [day]);
    await upsertForecastDays(loc.id, [{ ...day, tempMaxC: 11 }]);
    const rows = await prisma.forecastDay.findMany({ where: { locationId: loc.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tempMaxC).toBe(11);
    const weather = await getForecastDays(loc.id);
    expect(weather[0].tempMaxC).toBe(11);
  });
});
```

Put `findOrCreateLocation` / `upsertForecastDays` / `getForecastDays` in `src/store/forecasts.ts` and `src/store/locations.ts` as needed — keep exports stable as listed in Interfaces.

- [ ] **Step 3: Run test — expect FAIL**

Run: `npm test -- tests/integration/store.forecasts.test.ts`  
Expected: FAIL until store implemented

- [ ] **Step 4: Implement Prisma client + upsert with `upsert` / `createMany`+update**

```ts
// src/store/prisma.ts
import { PrismaClient } from "@prisma/client";
export const prisma = new PrismaClient();
```

Use `prisma.forecastDay.upsert({ where: { locationId_forecastDate: { locationId, forecastDate } }, create: {...}, update: {...} })`.

- [ ] **Step 5: Run integration test — PASS**

- [ ] **Step 6: Commit**

```bash
git add prisma src/store tests/integration
git commit -m "$(cat <<'EOF'
feat: add Prisma models and idempotent forecast upserts

EOF
)"
```

---

### Task 4: Open-Meteo client (retry + circuit breaker)

**Files:**
- Create: `src/open-meteo/types.ts`, `src/open-meteo/circuit-breaker.ts`, `src/open-meteo/client.ts`
- Test: `tests/unit/open-meteo/circuit-breaker.test.ts`, `tests/unit/open-meteo/client.test.ts`

**Interfaces:**
- Produces:
  - `fetchForecast(lat: number, lon: number, opts?: { signal?: AbortSignal }): Promise<WeatherDay[]>`
  - `geocode(name: string): Promise<{ name: string; country: string | null; admin1: string | null; latitude: number; longitude: number }[]>`
  - Circuit opens after 3 consecutive failures; cool-down 30s

- [ ] **Step 1: Write circuit breaker failing test**

```ts
// tests/unit/open-meteo/circuit-breaker.test.ts
import { describe, expect, it, vi } from "vitest";
import { CircuitBreaker } from "../../../src/open-meteo/circuit-breaker.js";

describe("CircuitBreaker", () => {
  it("opens after threshold failures and rejects fast", async () => {
    const b = new CircuitBreaker({ failureThreshold: 3, coolDownMs: 60_000 });
    const fail = async () => {
      throw new Error("boom");
    };
    for (let i = 0; i < 3; i++) {
      await expect(b.exec(fail)).rejects.toThrow("boom");
    }
    await expect(b.exec(async () => "ok")).rejects.toThrow(/circuit/i);
  });
});
```

- [ ] **Step 2: Implement circuit breaker; test PASS**

- [ ] **Step 3: Write client mapping test with mocked `fetch`**

Mock Open-Meteo daily JSON → `WeatherDay[]`. Include marine `wave_height_max` when present. Retry transient 500 up to 3 times with backoff (use `vi.useFakeTimers` or inject `sleep`).

Map:
- `temperature_2m_max` → `tempMaxC`
- `temperature_2m_min` → `tempMinC`
- `precipitation_sum` → `precipMm`
- `precipitation_probability_max` → `precipProbPct`
- `wind_speed_10m_max` → `windMaxKmh` (convert m/s→km/h if API returns m/s — document choice; Open-Meteo default m/s × 3.6)
- `snowfall_sum` → `snowfallCm`
- `weathercode` / `weather_code` → `weatherCode`
- marine daily wave height → `waveHeightM`

- [ ] **Step 4: Implement client; unit tests PASS**

- [ ] **Step 5: Commit**

```bash
git add src/open-meteo tests/unit/open-meteo
git commit -m "$(cat <<'EOF'
feat: add Open-Meteo client with retry and circuit breaker

EOF
)"
```

---

### Task 5: Geocoding resolve + cache

**Files:**
- Create: `src/geocoding/resolve.ts`
- Test: `tests/unit/geocoding/resolve.test.ts`

**Interfaces:**
- Consumes: `geocode` from open-meteo, `upsertGeocodeCache` / cache lookup from store
- Produces: `resolveLocationInput(input: { name?: string | null; latitude?: number | null; longitude?: number | null }): Promise<{ location: LocationRow; alternatives: LocationRow[] }>`

Rules:
- If lat/lon provided → findOrCreate by coordinates; `alternatives = []`
- If name → normalize trim/lowercase; cache hit returns stored candidates; miss calls Open-Meteo geocode, persists cache, best = first candidate, alternatives = rest
- Invalid (no name and no coords) → throw `BadUserInputError`
- Name length &gt; 100 → `BadUserInputError`

- [ ] **Step 1: Write failing tests with mocked geocode + in-memory cache doubles**

- [ ] **Step 2: Implement `resolve.ts`; tests PASS**

- [ ] **Step 3: Commit**

```bash
git add src/geocoding tests/unit/geocoding
git commit -m "$(cat <<'EOF'
feat: add geocoding resolve with cache and alternatives

EOF
)"
```

---

### Task 6: Nest GraphQL API (warm path + cold-start)

**Files:**
- Create: `src/graphql/graphql.module.ts`, `src/graphql/activity-ranking.resolver.ts`
- Load schema-first from `docs/contracts/schema.graphql` via `GraphQLModule.forRoot({ typePaths: [...], driver: ApolloDriver })`
- Modify: `src/app.module.ts`
- Test: `tests/integration/graphql.activityRanking.test.ts` (Nest testing module or HTTP against bootstrapped app)

**Interfaces:**
- Consumes: GeocodingService, ForecastsRepository, OpenMeteoClient, ScoringService, ConfigService
- Produces: Nest GraphQL on `POST /graphql`

Flow (`activityRanking` resolver) — unchanged from design:
1. Validate input
2. Resolve location
3. Load forecast days — if empty, cold-start fetch + upsert within timeout
4. If still empty → GraphQL error `PROVIDER_UNAVAILABLE`
5. `scoreAll` → payload with freshness fields

- [ ] **Step 1: Write integration test for warm path (Open-Meteo must not be called)**

- [ ] **Step 2: Implement GraphQL module + resolver; warm path PASS**

- [ ] **Step 3: Cold-start test PASS**

- [ ] **Step 4: Commit**

```bash
git add src/graphql src/app.module.ts tests/integration/graphql.activityRanking.test.ts
git commit -m "$(cat <<'EOF'
feat: add Nest GraphQL activityRanking warm and cold-start paths

EOF
)"
```

---

### Task 7: Refresh worker (Nest worker entrypoint)

**Files:**
- Create: `src/refresh/refresh.module.ts`, `src/refresh/refresh.service.ts`, `src/refresh/refresh.scheduler.ts`
- Create: `src/app.worker.module.ts`, `src/worker.ts` (NestFactory.createApplicationContext)
- Test: `tests/unit/refresh/refresh.service.test.ts`

**Interfaces:**
- Produces: `RefreshService.runCycle()` — list locations, concurrency pool, fetch+upsert, update RefreshMeta
- Worker process schedules via `@Interval` / `@Cron` from `REFRESH_INTERVAL_MS` (or manual setInterval in bootstrap)

- [ ] **Step 1: Write failing cycle test (mock OpenMeteo + repositories)**

- [ ] **Step 2: Implement; PASS**

- [ ] **Step 3: Commit**

```bash
git add src/refresh src/worker.ts src/app.worker.module.ts tests/unit/refresh
git commit -m "$(cat <<'EOF'
feat: add Nest refresh worker with bounded concurrency

EOF
)"
```

---

### Task 8: Health + staleness

**Files:**
- Create: `src/health/health.controller.ts` (`GET /health`)
- Modify: resolver freshness fields if not already done in Task 6
- Test: health + stale unit/integration tests

- [ ] **Step 1: Write failing tests**

- [ ] **Step 2: Implement; PASS**

- [ ] **Step 3: Commit**

```bash
git add src/health src/graphql tests
git commit -m "$(cat <<'EOF'
feat: add health endpoint and response staleness flags

EOF
)"
```

---

### Task 9: Docker Compose + GitHub Actions + README

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`
- Modify: `README.md`

Dockerfile `CMD` → `node dist/main.js`; worker service command → `node dist/worker.js`.

- [ ] **Step 1–6:** Same as before (Compose `db` + `api` + `worker`, GHA lint/typecheck/test/build, README run + sample query from contracts)

```bash
git commit -m "$(cat <<'EOF'
chore: add Docker Compose, GitHub Actions CI, and run docs

EOF
)"
```
---

## Spec coverage matrix (self-review)

| Requirement | Task |
|---|---|
| FR-U1 rankings for 4 activities | 2, 6 |
| FR-U2 freshness fields | 6, 8 |
| FR-U3 alternatives | 5, 6 |
| FR-U4 cold-start | 6 |
| FR-S1 persist / warm storage-only | 3, 6 |
| FR-S2 score from stored data | 2, 6 |
| FR-S3 idempotent upsert | 3, 7 |
| FR-S4 deterministic scoring | 2 |
| FR-S5 geocode cache | 5 |
| FR-O1 background refresh | 7 |
| FR-O2 configurable interval | 1 (`config`), 7 |
| FR-O3 retry + circuit breaker | 4 |
| FR-O4 health | 8 |
| FR-O5 structured logs | 4, 7 (add `console` JSON or pino in those tasks) |
| Availability / stale | 6, 8 |
| Performance budgets | 6 (timeouts in config) |
| Testability scoring | 2 |
| Horizontal scale / Docker | 9 |
| CI | 9 |
| GraphQL contract | `docs/contracts` + 6 |
| DB design | `docs/contracts/prisma-schema.md` + 3 |
| seq-happy-path | 6 |
| seq-cold-start | 6 |
| seq-refresh | 7 |
| seq-provider-down | 6, 8 |
| seq-ambiguous-geocode | 5, 6 |

## Placeholder / consistency check

- Rubric version string consistent: `2026-07-28.1`
- Upsert key: `(locationId, forecastDate)` only
- No OpenAPI/Swagger
- No `ActivityScoreDay` table in v1
- Scoring unit tests never import Prisma

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-28-weather-activity-ranking.md`.

**Two execution options for the Code stage:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks (`superpowers:subagent-driven-development`)
2. **Inline Execution** — execute tasks in this session (`superpowers:executing-plans`)

Which approach?
