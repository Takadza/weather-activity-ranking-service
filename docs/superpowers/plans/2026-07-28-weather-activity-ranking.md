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

## Testing & CI/CD timing (do not defer everything to the end)

Test as we develop. Split “early gate” from “full delivery”:

| When | Deliverable | Purpose |
|---|---|---|
| **Task 2** | Unit tests (Jest) for scoring | No DB/Docker required |
| **Task 2b (new)** | Minimal GitHub Actions CI | Every push: lint → typecheck → unit tests → build |
| **Task 3** | `docker-compose.yml` with **Postgres only** + integration tests | Real DB for store upserts locally and (soon) in CI |
| **Task 3 (same)** | Extend CI with optional `integration` job + Postgres service | Integration tests gated on `DATABASE_URL` / `npm run test:integration` |
| **Tasks 4–8** | More unit + integration tests | CI keeps running; Compose `db` stays up for local work |
| **Task 9** | Multi-stage **Dockerfile**, Compose `api` + `worker`, README runbook | Full local prod-like stack; CI may `docker build` |

**Rules:**

- Unit tests **never** require Docker or Postgres (especially `ScoringService`)
- Integration tests **require** Postgres via Compose (local) or GHA service container (CI)
- Do **not** wait until Task 9 to have CI or a database — that blocks early feedback

**Day-to-day local commands:**

```bash
npm test                          # unit (always)
docker compose up -d db           # from Task 3 onward
npm run test:integration          # store / GraphQL integration
npm run start:dev                 # API when GraphQL exists
```

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
- Test: `src/scoring/rubric.spec.ts`, `src/scoring/rank.spec.ts` (Jest colocated `*.spec.ts`; Nest scaffold default — also allowed under `tests/unit/**/*.spec.ts` after Task 2b)

**Interfaces:**
- Produces: `ScoringService.scoreDay(...)`, `ScoringService.scoreAll(...)`, `RUBRIC_VERSION` — pure logic, no Nest/Prisma inside the algorithms
- Import in tests from `scoring.service.ts` (or extracted pure functions) **without** creating a Nest testing module for Task 2

- [ ] **Step 1: Write failing skiing / surfing tests**

```ts
// src/scoring/rubric.spec.ts
import { scoreDay } from "./scoring.service";

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

Run: `npm test -- rubric.spec.ts`  
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

export type ReasonCode =
  | "MISSING_TEMP"
  | "TOO_WARM"
  | "TOO_COLD"
  | "NO_SNOW"
  | "HIGH_WIND"
  | "NO_MARINE_DATA"
  | "FLAT"
  | "TOO_BIG"
  | "TOO_HOT"
  | "HEAVY_RAIN"
  | "BAD_WEATHER";

export type DayScore = {
  date: string;
  score: number | null;
  available: boolean;
  reasonCodes: ReasonCode[];
};

export const RUBRIC_VERSION = "2026-07-28.1";

export function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
```

- [ ] **Step 4: Run skiing/surfing tests — expect PASS**

Run: `npm test -- rubric.spec.ts`  
Expected: PASS for skiing/surfing cases (add outdoor/indoor next)

- [ ] **Step 5: Write outdoor/indoor + rank tests**

```ts
// src/scoring/rank.spec.ts
import { scoreAll } from "./scoring.service";

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

Run: `npm test -- scoring`  
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add src/scoring
git commit -m "$(cat <<'EOF'
feat: add deterministic activity scoring rubric with unit tests

EOF
)"
```

---

### Task 2b: Early CI (unit gate) + test script split

**Why now:** Catch regressions on every push before Prisma/Docker complexity. Full app image stays Task 9.

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json` (ensure `test` = unit only; add `test:integration` placeholder or script that runs `test/integration` / `tests/integration` with a clear pattern)
- Modify: Jest config so unit specs live under `src/**/*.spec.ts` and/or `tests/unit/**/*.spec.ts`; integration under `tests/integration/**/*.spec.ts` and are **excluded** from default `npm test`

**Interfaces:**
- Produces: green CI on PR/push for lint + typecheck + unit tests + build
- Produces: `npm run test:integration` (may no-op or skip until Task 3 adds tests)

- [ ] **Step 1: Split unit vs integration in package.json / Jest**

```json
"test": "jest --testPathIgnorePatterns=integration",
"test:integration": "jest --config ./test/jest-integration.json --runInBand"
```

(Or equivalent: `testRegex` / project config. Unit must not need `DATABASE_URL`.)

- [ ] **Step 2: Add `.github/workflows/ci.yml`**

```yaml
name: ci
on:
  push:
    branches: [main, develop]
  pull_request:
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- [ ] **Step 3: Push and confirm the workflow runs**

Expected: CI green with Task 2 scoring tests (once Task 2 is merged).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml package.json test/
git commit -m "$(cat <<'EOF'
ci: add early GitHub Actions unit gate

EOF
)"
```

---

### Task 3: Postgres Compose + Prisma schema + store upserts

**Files:**
- Create: `docker-compose.yml` (**`db` service only** for now)
- Create: `prisma/schema.prisma` (from `docs/contracts/prisma-schema.md`)
- Create: Nest store module — `src/store/store.module.ts`, `prisma.service.ts`, repositories (`locations`, `forecasts`, `geocode-cache`, `refresh-meta`)
- Create: `test/jest-integration.json` (if not in 2b)
- Test: `tests/integration/store.forecasts.spec.ts`
- Modify: `.github/workflows/ci.yml` — add `integration` job with Postgres service

**Interfaces:**
- Produces:
  - `upsertForecastDays(locationId: string, days: ...): Promise<void>` — idempotent on `(locationId, forecastDate)`
  - `getForecastDays(locationId: string): Promise<WeatherDay[]>`
  - `findOrCreateLocation(...)`, `upsertGeocodeCache(...)`, `getRefreshMeta()`, `recordRefreshSuccess()`, `recordRefreshFailure(error: string)`
  - Local: `docker compose up -d db`

- [ ] **Step 1: Add Compose Postgres**

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: wars
      POSTGRES_PASSWORD: wars
      POSTGRES_DB: wars
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U wars -d wars"]
      interval: 5s
      timeout: 5s
      retries: 10
    volumes:
      - wars_pg:/var/lib/postgresql/data

volumes:
  wars_pg:
```

```bash
docker compose up -d db
# wait until healthy
export DATABASE_URL=postgresql://wars:wars@localhost:5432/wars?schema=public
```

- [ ] **Step 2: Copy Prisma schema and migrate**

Copy exact models from `docs/contracts/prisma-schema.md` into `prisma/schema.prisma`.

```bash
npx prisma migrate dev --name init
npx prisma generate
```

- [ ] **Step 3: Write failing upsert idempotency integration test**

```ts
// tests/integration/store.forecasts.spec.ts
import { describe, expect, it, beforeAll, afterAll } from "@jest/globals";
// Use Nest TestingModule or PrismaService directly — same behaviour as plan:
// upsert twice same location+date → one row; second write wins on tempMaxC
```

(Keep the behavioural assertions from the previous Task 3 draft: one row after two upserts, `tempMaxC === 11`.)

- [ ] **Step 4: Implement store module; integration test PASS locally**

```bash
docker compose up -d db
DATABASE_URL=postgresql://wars:wars@localhost:5432/wars?schema=public npm run test:integration
```

- [ ] **Step 5: Extend CI with integration job**

```yaml
  integration:
    runs-on: ubuntu-latest
    needs: unit
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: wars
          POSTGRES_PASSWORD: wars
          POSTGRES_DB: wars
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U wars -d wars"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://wars:wars@localhost:5432/wars?schema=public
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npm run test:integration
```

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml prisma src/store tests/integration .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
feat: add Postgres Compose, Prisma store upserts, and integration CI

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

### Task 9: App Docker image + Compose api/worker + README

**Prerequisite:** Task 2b CI and Task 3 `db` Compose already exist — do **not** recreate them from scratch.

**Files:**
- Create: `Dockerfile` (multi-stage Nest build)
- Modify: `docker-compose.yml` — add `api` + `worker` services (keep `db`)
- Modify: `.github/workflows/ci.yml` — optional `docker build` job
- Modify: `README.md` — run instructions, sample GraphQL curl from `docs/contracts`

**Interfaces:**
- Produces: `docker compose up --build` runs db + api + worker
- Dockerfile `CMD` → `node dist/main.js`; worker command → `node dist/worker.js`

- [ ] **Step 1: Multi-stage Dockerfile**

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/docs/contracts/schema.graphql ./docs/contracts/schema.graphql
USER node
CMD ["node", "dist/main.js"]
```

- [ ] **Step 2: Extend Compose with `api` and `worker`** (depend on healthy `db`; pass `DATABASE_URL`)

- [ ] **Step 3: Optional CI job `docker build .`**

- [ ] **Step 4: README — how to run unit tests, integration tests, Compose stack, sample query**

- [ ] **Step 5: Verify**

```bash
npm test
docker compose up -d db && npm run test:integration
docker compose up --build -d
curl -s http://localhost:3000/health
```

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml .github/workflows/ci.yml README.md
git commit -m "$(cat <<'EOF'
chore: add Nest app/worker images and full local run docs

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
| FR-O5 structured logs | 4, 7 |
| Availability / stale | 6, 8 |
| Performance budgets | 6 (timeouts in config) |
| Testability scoring | 2 |
| Early unit CI | **2b** |
| Postgres Compose + integration CI | **3** |
| Full app Docker + README runbook | **9** |
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
- CI unit job never requires Postgres; integration job does

---

## Execution handoff

Plan updated for early CI/Compose. Path: `docs/superpowers/plans/2026-07-28-weather-activity-ranking.md`.

**Current Code progress:** Task 1 done → next **Task 2 (scoring)**, then **Task 2b (early CI)**, then **Task 3 (db Compose + Prisma + integration CI)**.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task
2. **Inline Execution** — execute tasks in this session

Which approach?
