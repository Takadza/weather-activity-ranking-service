# Documentation index

Start at the root [README.md](../README.md) for run instructions. Read design docs in order below.

## Reading order

| # | Doc | What you get |
|---|---|---|
| 1 | [01-requirements-and-estimation.md](01-requirements-and-estimation.md) | Constraints, FR/NFR, estimation, risks |
| 2 | [02-system-design.md](02-system-design.md) | HLD, ADRs, scale |
| — | [diagrams/](diagrams/) · [02 §2.1](02-system-design.md#21-diagrams) | Architecture + sequence **SVGs** (render on GitHub) |
| 3 | [03-api-and-domain-design.md](03-api-and-domain-design.md) | Rubric narrative, consumer rules |
| — | [contracts/](contracts/) | **SoT:** GraphQL SDL, examples, Prisma schema |
| 4 | [04-operations-and-failure-modes.md](04-operations-and-failure-modes.md) | Refresh, failures, observability, cuts |
| 5 | [05-cicd-and-delivery.md](05-cicd-and-delivery.md) | CI/CD and Docker posture |
| 6 | [06-implementation-notes.md](06-implementation-notes.md) | What shipped and where in `src/` |

## Sources of truth (do not diverge)

| Concern | Canonical file |
|---|---|
| GraphQL API | [contracts/schema.graphql](contracts/schema.graphql) |
| Example queries | [contracts/examples.graphql](contracts/examples.graphql) |
| Database models | [contracts/prisma-schema.md](contracts/prisma-schema.md) · live: [`prisma/schema.prisma`](../prisma/schema.prisma) |
| Manual API testing | [../postman/weather-activity-ranking.postman_collection.json](../postman/weather-activity-ranking.postman_collection.json) |
| Auth | `API_KEY` (`X-API-Key` / Bearer); `METRICS_TOKEN` for `/metrics` + health detail |
| Framework | NestJS (GraphQL Apollo driver) — [02 ADR-004](02-system-design.md) |
| Refresh interval env | `REFRESH_INTERVAL_MS` (milliseconds), default `21600000` (6h) |
