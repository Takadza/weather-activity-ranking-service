# Weather Activity Ranking Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript/Node GraphQL backend that ranks the next 7 days for skiing, surfing, outdoor sightseeing, and indoor sightseeing from persisted Open-Meteo data, with a decoupled refresh worker, Docker Compose, and GitHub Actions CI.

**Architecture:** Modular monolith — pure `scoring`, Prisma `store`, `open-meteo` client (retry + circuit breaker), `geocoding`, Apollo GraphQL API, and a schedule-driven `refresh` worker. Warm path reads Postgres only; cold-start is the bounded Open-Meteo exception. Scores are compute-on-read.

**Tech Stack:** TypeScript, Node.js 22, Apollo Server 4, Prisma, PostgreSQL 16, Vitest, Docker Compose, GitHub Actions.

## Global Constraints

- Language: TypeScript on Node.js (assessment requirement)
- API: GraphQL only (Apollo); consumer SDL: `docs/contracts/schema.graphql`
- Weather: Open-Meteo; persist forecasts; warm path must not call Open-Meteo
- Storage: PostgreSQL + Prisma per `docs/contracts/prisma-schema.md`
- Scoring: pure/deterministic; `rubricVersion: "2026-07-28.1"`; unit-testable without DB/HTTP
- Backend only: no frontend
- Focused submission: cuts in `docs/04-operations-and-failure-modes.md`
- Design docs: `docs/01`–`docs/05` and `docs/diagrams/*.puml` are normative

## File structure (target)

```
package.json
tsconfig.json
vitest.config.ts
.env.example
prisma/schema.prisma
src/
  config.ts
  api.ts
  worker.ts
  scoring/
    types.ts
    rubric.ts
    rank.ts
    index.ts
  store/
    prisma.ts
    locations.ts
    forecasts.ts
    geocode-cache.ts
    refresh-meta.ts
  open-meteo/
    client.ts
    circuit-breaker.ts
    types.ts
  geocoding/
    resolve.ts
  graphql/
    schema.ts
    resolvers.ts
    server.ts
  refresh/
    job.ts
  health/
    handler.ts
tests/
  unit/scoring/
  unit/open-meteo/
  unit/geocoding/
  unit/refresh/
  integration/
docs/contracts/   # already frozen — do not diverge
.github/workflows/ci.yml
Dockerfile
docker-compose.yml
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `.gitignore`
- Create: `src/config.ts`, `src/scoring/.gitkeep` (placeholder dirs via real files in later tasks)

**Interfaces:**
- Produces: npm scripts `lint`, `typecheck`, `test`, `build`, `dev`, `worker`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "weather-activity-ranking-service",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "tsx watch src/api.ts",
    "worker": "tsx watch src/worker.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/api.js",
    "start:worker": "node dist/worker.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev"
  }
}
```

- [ ] **Step 2: Add TypeScript + Vitest + ESLint deps**

Run:

```bash
npm install @apollo/server graphql @prisma/client dotenv
npm install -D typescript tsx vitest @types/node prisma eslint typescript-eslint @eslint/js
```

- [ ] **Step 3: Create `tsconfig.json` and `vitest.config.ts`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```

Note: for Vitest to import from `src/`, either set `"rootDir"` loosely or add a separate `tsconfig` — prefer adding path alias or including tests with:

```json
"include": ["src/**/*"],
```

and import via relative paths from `tests/` into `../src/...`. Add a second `tsconfig.build.json` for `outDir` if needed later.

- [ ] **Step 4: Create `.env.example` and `.gitignore`**

```env
DATABASE_URL=postgresql://wars:wars@localhost:5432/wars?schema=public
PORT=4000
REFRESH_INTERVAL_MS=21600000
REFRESH_CONCURRENCY=5
OPEN_METEO_TIMEOUT_MS=5000
COLD_START_TIMEOUT_MS=3000
STALE_AFTER_SECONDS=21600
LOG_LEVEL=info
```

```gitignore
node_modules/
dist/
.env
coverage/
*.log
```

- [ ] **Step 5: Create `src/config.ts`**

```ts
import "dotenv/config";

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid ${name}`);
  return n;
}

export const config = {
  port: intEnv("PORT", 4000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  refreshIntervalMs: intEnv("REFRESH_INTERVAL_MS", 6 * 60 * 60 * 1000),
  refreshConcurrency: intEnv("REFRESH_CONCURRENCY", 5),
  openMeteoTimeoutMs: intEnv("OPEN_METEO_TIMEOUT_MS", 5000),
  coldStartTimeoutMs: intEnv("COLD_START_TIMEOUT_MS", 3000),
  staleAfterSeconds: intEnv("STALE_AFTER_SECONDS", 6 * 60 * 60),
  logLevel: process.env.LOG_LEVEL ?? "info",
  rubricVersion: "2026-07-28.1" as const,
};
```

- [ ] **Step 6: Verify typecheck passes on empty/config-only project**

Run: `npx tsc -p tsconfig.json --noEmit`  
Expected: PASS (or only missing entry — ensure `src/config.ts` is included)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .env.example .gitignore src/config.ts
git commit -m "$(cat <<'EOF'
chore: scaffold TypeScript project with Vitest and config

EOF
)"
```

---

### Task 2: Scoring module (TDD)

**Files:**
- Create: `src/scoring/types.ts`, `src/scoring/rubric.ts`, `src/scoring/rank.ts`, `src/scoring/index.ts`
- Test: `tests/unit/scoring/rubric.test.ts`, `tests/unit/scoring/rank.test.ts`

**Interfaces:**
- Produces:
  - `export type ActivityType = "SKIING" | "SURFING" | "OUTDOOR_SIGHTSEEING" | "INDOOR_SIGHTSEEING"`
  - `export type WeatherDay = { date: string; tempMaxC: number | null; tempMinC: number | null; precipMm: number | null; precipProbPct: number | null; windMaxKmh: number | null; snowfallCm: number | null; waveHeightM: number | null; weatherCode: number | null }`
  - `export type DayScore = { date: string; score: number | null; available: boolean; reasonCodes: string[] }`
  - `export function scoreDay(activity: ActivityType, day: WeatherDay): DayScore`
  - `export function scoreAll(days: WeatherDay[]): { activity: ActivityType; overallScore: number | null; rank: number; days: DayScore[] }[]`
  - `export const RUBRIC_VERSION = "2026-07-28.1"`

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

### Task 6: GraphQL API (warm path + cold-start)

**Files:**
- Create: `src/graphql/schema.ts`, `src/graphql/resolvers.ts`, `src/graphql/server.ts`, `src/api.ts`
- Copy or read: schema from `docs/contracts/schema.graphql` (load via `fs.readFileSync` at startup)
- Test: `tests/integration/graphql.activityRanking.test.ts`

**Interfaces:**
- Consumes: resolve, getForecastDays, upsertForecastDays, fetchForecast, scoreAll, config
- Produces: Apollo Server on `POST /graphql`

Flow (`activityRanking`):
1. Validate input
2. `resolveLocationInput`
3. `getForecastDays` — if empty, cold-start: `fetchForecast` with `AbortSignal.timeout(coldStartTimeoutMs)`, upsert, then reload
4. If still empty → GraphQL error `PROVIDER_UNAVAILABLE`
5. `scoreAll` → shape payload with `rubricVersion`, `lastUpdated` = max `fetchedAt`, `dataAgeSeconds`, `stale`

- [ ] **Step 1: Write integration test for warm path with seeded DB + mocked Open-Meteo (must not be called)**

- [ ] **Step 2: Implement schema load + resolvers + `api.ts`; warm path PASS**

- [ ] **Step 3: Write cold-start test — empty DB, mock fetch returns 7 days, assert upsert + rankings**

- [ ] **Step 4: Cold-start PASS; commit**

```bash
git add src/graphql src/api.ts tests/integration/graphql.activityRanking.test.ts
git commit -m "$(cat <<'EOF'
feat: add GraphQL activityRanking warm and cold-start paths

EOF
)"
```

---

### Task 7: Refresh worker

**Files:**
- Create: `src/refresh/job.ts`, `src/worker.ts`
- Test: `tests/unit/refresh/job.test.ts`

**Interfaces:**
- Produces: `runRefreshCycle(deps): Promise<void>` — list locations, concurrency pool, fetch+upsert, update RefreshMeta; never delete on failure
- `worker.ts` sets interval from `config.refreshIntervalMs`

- [ ] **Step 1: Write test — two locations, one fetch fails, other succeeds; assert success upsert + meta records attempt; failed location retains prior days**

- [ ] **Step 2: Implement job + worker entry; tests PASS**

- [ ] **Step 3: Commit**

```bash
git add src/refresh src/worker.ts tests/unit/refresh
git commit -m "$(cat <<'EOF'
feat: add scheduled refresh worker with bounded concurrency

EOF
)"
```

---

### Task 8: Health + staleness

**Files:**
- Create: `src/health/handler.ts`
- Modify: `src/api.ts` (mount `GET /health`), resolvers freshness fields
- Test: `tests/integration/health.test.ts`, unit test for `stale` computation

**Interfaces:**
- `stale = dataAgeSeconds > config.staleAfterSeconds`
- Health JSON: `{ status: "ok" | "degraded", refresh: RefreshStatus }`
- `degraded` when tracked locations &gt; 0 and last success older than stale threshold

- [ ] **Step 1: Write failing tests for stale flag and health degraded**

- [ ] **Step 2: Implement; PASS**

- [ ] **Step 3: Commit**

```bash
git add src/health src/api.ts src/graphql tests/integration/health.test.ts
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
CMD ["node", "dist/api.js"]
```

- [ ] **Step 2: `docker-compose.yml` with `db`, `api`, `worker`**

- [ ] **Step 3: `.github/workflows/ci.yml`**

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
jobs:
  ci:
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

Integration tests that need Postgres: add a second job with `services.postgres` when those tests are gated behind `TEST_DATABASE_URL` — unit scoring tests must always run without DB.

- [ ] **Step 4: Update README — run instructions, assumptions, link to docs, sample curl from `docs/contracts/README.md`, deliberate cuts**

- [ ] **Step 5: Verify locally**

```bash
docker compose up --build -d
curl -s http://localhost:4000/health
# GraphQL query from docs/contracts/examples.graphql
npm test
```

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml .github/workflows/ci.yml README.md
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
