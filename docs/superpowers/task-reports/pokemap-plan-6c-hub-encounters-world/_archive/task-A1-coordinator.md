# Task A1 coordinator verification (2026-09-29, final fix commit c481082)

## Surviving-mutation re-run

Harness: literal anchor, count asserted == 1 (no ANCHOR-MISS), narrowest test file(s), restore from the
in-memory on-disk bytes, byte-compare after restore, `git status --porcelain` clean at the end.

| Mutation (spec-review id) | Result on c481082 |
|---|---|
| M8 `dirty()` ignores `isDirty` | RED (2 failed) |
| M11 sort removed | RED |
| M11b default `.sort()` | RED |
| M17 `pushRecent` stores raw path | RED |
| M19 GBC disposed guard off | RED |
| M25 open on a file passes the dir check | RED |
| QR-F1 `safeNorm("/")` → `""` | RED |
| F4 `parentOf` without root check | RED (2 failed) |
| F4 browse without `resolve()` | RED |
| F9 Origin check off | RED |
| F9 Host check off | RED |
| F9 guard never called | RED (2 failed) |

12/12 red. Not re-run, by decision: M21 (pretty-print) and M23 (bind host) were declined as test targets
in the fix-round brief; M12b is equivalent (`renameSync` overwrites).

## Gate

- `npm test`: 1,715 pass / 0 fail, 109 files.
- `npm run typecheck`: clean. `npx vite build packages/ui`: passes.
- `git diff c2dbb62 -- packages/server/test/{api,dungeons,editSessions,eventRoutes,gbcRoutes,paintRoutes,saveRoutes,signRoutes,world}.test.ts`: empty.
- GBA subject porcelain: still 7 lines (6 M + 1 ??). `~/.pokemap/` still absent (no test touched it).

## Deferred follow-ups

- SR-F3: a POST whose body is read after a swap still runs against the disposed handler (comment at the
  disposed guard in `index.ts`). Fix: re-check `disposed` after `readBody`.
- QR-F4: symlinked directories are not listed by browse.
