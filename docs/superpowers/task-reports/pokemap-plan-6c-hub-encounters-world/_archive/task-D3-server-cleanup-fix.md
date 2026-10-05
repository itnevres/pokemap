# D3 server cleanup fix

Status: complete. Scope: `packages/server/test/gbcRoutes.test.ts` only; production routes and GBA files unchanged.

## Finding resolved

The server quality review found two failure paths that could leave PerfPlus `.pokemap/dungeons.json` changed: the roundtrip test conditioned cleanup on a captured written buffer, and the invalid-body test had no `finally`. Both tests now share a snapshot helper. Each HTTP operation observes the sidecar in its own `finally`, even if the request rejects. Each test restores in an outer `finally`. Restoration compares bytes first, recreates a missing directory when a preexisting file needs restoration, removes only the created dungeons file when the file was initially absent, and removes a newly created `.pokemap` directory only if empty. If the file changes after the last request's observation, cleanup leaves that later write alone.

The roundtrip test's existing assertions still pin CRUD persistence and exact initial bytes/directory state. The invalid-body test now also pins original directory state. These are the only two existing tests changed, because both can issue corpus-writing requests and must clean up on failed assertions.

## Red proof

Temporary mutations were made from an in-memory copy of `packages/server/src/gbcRoutes.ts`, then restored byte-for-byte in PowerShell `finally`:

1. First dungeon POST returned 500 after writing instead of 200. `roundtrips explicit and seeded dungeons` failed at `expected 500 to be 200` (`MUTATION_EXIT=1`), and the sidecar was removed by its `finally`.
2. The POST name guard was bypassed (`if (false)`), so `{}` wrote an invalid dungeon and returned 200. `rejects invalid create and patch bodies without writing` failed at `expected 200 to be 400` (`MUTATION_EXIT=1`), and its new `finally` removed the sidecar. The source byte comparison after this mutation was exact.

After both mutations, PerfPlus Git status was clean and both `.pokemap` and `dungeons.json` were absent. No other test file was run concurrently in this task.

## Green verification

- `npx vitest run packages/server/test/gbcRoutes.test.ts`: 85 passed, 0 failed.
- `npx tsc --noEmit -p tsconfig.base.json`: exit 0.

No full suite was run.
