# Documentation index

Reading order for this take-home. Prefer starting at the root [README.md](../README.md).

## Stage flow

```text
Clarify (01) → Design (02→05 + contracts + diagrams) → TDD plan → Code → Review
```

| # | Doc | Stage | What you get |
|---|---|---|---|
| 1 | [01-requirements-and-estimation.md](01-requirements-and-estimation.md) | Clarify | Constraints, FR/NFR, estimation, risks |
| 2 | [02-system-design.md](02-system-design.md) | Design | HLD, ADRs, scale, links to PlantUML |
| — | [diagrams/](diagrams/) | Design | Context, deployment, modules, sequences |
| 3 | [03-api-and-domain-design.md](03-api-and-domain-design.md) | Design | Rubric narrative, consumer rules |
| — | [contracts/](contracts/) | Design | **SoT:** GraphQL SDL, examples, Prisma schema |
| 4 | [04-operations-and-failure-modes.md](04-operations-and-failure-modes.md) | Design | Refresh, failures, observability, cuts |
| 5 | [05-cicd-and-delivery.md](05-cicd-and-delivery.md) | Design | CI/CD and Docker posture |
| 6 | [superpowers/plans/2026-07-28-weather-activity-ranking.md](superpowers/plans/2026-07-28-weather-activity-ranking.md) | TDD plan | Task-by-task implementation (Code next) |

## Sources of truth (do not diverge)

| Concern | Canonical file |
|---|---|
| GraphQL API | [contracts/schema.graphql](contracts/schema.graphql) |
| Example queries | [contracts/examples.graphql](contracts/examples.graphql) |
| Database models | [contracts/prisma-schema.md](contracts/prisma-schema.md) |
| Framework | NestJS (GraphQL Apollo driver) | [02 ADR-004](02-system-design.md) |
| Refresh interval env | `REFRESH_INTERVAL_MS` (milliseconds), default `21600000` (6h) |

## Previous / Next

- From root README → this index → `01`  
- After `05` → [TDD plan](superpowers/plans/2026-07-28-weather-activity-ranking.md)  
- After TDD plan → implement Code (not started)
