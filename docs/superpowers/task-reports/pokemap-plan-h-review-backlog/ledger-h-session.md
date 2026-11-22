# Plan H ledger: stream A h-session (Q1, Q6, Q7, C1, C2)

Branch `claude/plan-h-session-8a4cd6`, base `29ee130`.

| Task | Tier | Reason |
|---|---|---|
| Q1 | High | save/discard ownership + async ordering (a reply can race a mutation reply) |
| Q6 | High | shared render caches |
| Q7 | High | async ordering |
| C1 | High | async ordering, discard/save ownership |
| C2 | High | live check, report only |

## Hops
