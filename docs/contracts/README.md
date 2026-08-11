# Consumer API contract (GraphQL)

This folder is the **machine-oriented source of truth** for how to consume the Weather Activity Ranking Service.

Implemented by a **NestJS** GraphQL API (Apollo driver), schema-first from `schema.graphql`.

The brief requires **GraphQL** (not REST). There is no OpenAPI/Swagger spec.

## Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/graphql` | `POST` | Activity ranking and optional health query |
| `/health/live` | `GET` | Public liveness (no DB) |
| `/health` / `/health/ready` | `GET` | Authenticated probes (API key); `lastError` only with metrics token |

**Auth (v1):** shared `API_KEY` via `Authorization: Bearer <key>` or `X-API-Key`. Required when `NODE_ENV=production`. Leave unset only for local non-production DX. `/health/live` is the public liveness probe; `/health` and `/health/ready` require the API key.

## Files

| File | Purpose |
|---|---|
| [schema.graphql](schema.graphql) | Full GraphQL SDL |
| [examples.graphql](examples.graphql) | Copy-paste operations + variable examples |
| [prisma-schema.md](prisma-schema.md) | Database design (Prisma models) · ERD: [../diagrams/04-erd.svg](../diagrams/04-erd.svg) |
| [../../postman/weather-activity-ranking.postman_collection.json](../../postman/weather-activity-ranking.postman_collection.json) | Postman collection (API key auth, many cities/coords, negative cases) |

Narrative design, scoring rubric, and consumer rules: [../03-api-and-domain-design.md](../03-api-and-domain-design.md).

### Postman - get & import

**File in repo:** [`../../postman/weather-activity-ranking.postman_collection.json`](../../postman/weather-activity-ranking.postman_collection.json)

1. Clone/open this repo (or download that JSON from GitHub)
2. Start Compose so the API is up: `docker compose up --build -d`
3. In Postman: **Import** → **Upload Files** → choose the JSON (or drag it in)
4. Check collection **Variables** (defaults match Compose):

| Variable | Default |
|---|---|
| `baseUrl` | `http://localhost:3000` |
| `apiKey` | `local-compose-api-key` |
| `metricsToken` | `local-compose-metrics-token` |

Folders cover auth failures, health/ready, rank-by-name (multiple cities), rank-by-coordinates, validation errors, and metrics (API + worker). See also the root [README Postman section](../../README.md#postman-collection).

## Freshness (required for clients)

Every successful `activityRanking` payload includes:

- `lastUpdated`
- `dataAgeSeconds`
- `stale`

Treat `stale: true` as usable last-known-good data, not a hard failure.

## Example request

```bash
curl -s http://localhost:3000/graphql \
  -H 'content-type: application/json' \
  -H 'X-API-Key: local-compose-api-key' \
  -d '{"query":"query($location: LocationInput!){ activityRanking(location:$location){ location{name} stale rankings{activity overallScore rank} } }","variables":{"location":{"name":"Cape Town"}}}'
```

## Example success response (shape)

```json
{
  "data": {
    "activityRanking": {
      "location": { "name": "Cape Town" },
      "stale": false,
      "rubricVersion": "2026-07-28.1",
      "lastUpdated": "2026-07-28T12:00:00.000Z",
      "dataAgeSeconds": 120,
      "rankings": [
        {
          "activity": "OUTDOOR_SIGHTSEEING",
          "overallScore": 78,
          "rank": 1
        },
        {
          "activity": "SURFING",
          "overallScore": 65,
          "rank": 2
        },
        {
          "activity": "INDOOR_SIGHTSEEING",
          "overallScore": 40,
          "rank": 3
        },
        {
          "activity": "SKIING",
          "overallScore": null,
          "rank": 4
        }
      ]
    }
  }
}
```

Scores and ranks are illustrative; real values depend on persisted forecast data and the rubric in `src/scoring/`.
