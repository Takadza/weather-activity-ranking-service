# Open API contract (GraphQL)

This folder is the **machine-oriented source of truth** for how to consume the Weather Activity Ranking Service.

The brief requires **GraphQL** (not REST). There is no OpenAPI/Swagger spec.

## Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/graphql` | `POST` | Activity ranking and optional health query |
| `/health` | `GET` | Liveness + last refresh success/age (primary probe) |

**Auth (v1):** none. API key / rate-limit middleware can wrap the HTTP server later.

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
curl -s http://localhost:4000/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"query($location: LocationInput!){ activityRanking(location:$location){ location{name} stale rankings{activity overallScore rank} } }","variables":{"location":{"name":"Cape Town"}}}'
```
