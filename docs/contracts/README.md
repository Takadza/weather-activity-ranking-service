# Open API contract (GraphQL)

This folder is the **machine-oriented source of truth** for how to consume the Weather Activity Ranking Service.

Implemented by a **NestJS** GraphQL API (Apollo driver), schema-first from `schema.graphql`.

The brief requires **GraphQL** (not REST). There is no OpenAPI/Swagger spec.

## Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/graphql` | `POST` | Activity ranking and optional health query |
| `/health/live` | `GET` | Public liveness (no DB) |
| `/health` / `/ready` | `GET` | Authenticated probes (API key); `lastError` only with metrics token |

**Auth (v1):** shared `API_KEY` via `Authorization: Bearer <key>` or `X-API-Key`. Required when `NODE_ENV=production`. Leave unset only for local non-production DX. `/health/live` is the public liveness probe; `/health` and `/ready` require the API key.

## Files

| File | Purpose |
|---|---|
| [schema.graphql](schema.graphql) | Full GraphQL SDL |
| [examples.graphql](examples.graphql) | Copy-paste operations + variable examples |
| [prisma-schema.md](prisma-schema.md) | Database design (Prisma models) |

Narrative design, scoring rubric, and consumer rules: [../03-api-and-domain-design.md](../03-api-and-domain-design.md).

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
