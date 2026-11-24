# Plan H task I2a: code-quality / correctness review (Opus, adversarial)

Scope: `7a8bfef` on `claude/plan-h-server-9-i` vs master (`f96e7df`). I read `sessionStore.ts`, `editSessions.ts`, `gbcEditSessions.ts`, every store consumer (`index.ts` 214-219 and 1423-1427, `gbcEditRoutes.ts` 97/101/218/413/558-559, `gbcRoutes.ts` 629-633, `blockEditOwnership.ts` 74/123-137, `blockEditRoutes.ts` 214/312, `addEventRoutes.ts` 30-31/42-84/183-198, `hub.ts` 311-330), the three new tests, and `core/src/project.ts` (`openProject` return shape). I did not run vitest or typecheck (gate running), so mutation claims below come from reading the code, not from running it. The diff range also holds `34828ee` (the sidecarRoutes method fall-through test, H-b review m1). That commit is not I2a work. I only checked it for being test-only.

## Verdict
PASS. No Critical or Important findings. The refactor matches master's behaviour on every axis in the brief. Four Minor findings, all about tests or comments.

## Behaviour drift vs master (re-derived)
- **Insert timing with a throwing opener.** Master GBA did `sessions.set` after the sign-baseline loop. Master GBC did `set` after building the entry and the loop. Now `open` calls `openEntry` first and runs `sessions.set` only if it returns (`sessionStore.ts:38-42`). So a throw anywhere in the opener (unknown map, `parseBlocks`, `findGbaSign`/`findGbcSign` on malformed text) still stores nothing. Same as master.
- **Re-entrancy.** `openEntry` gets no store handle; both openers close over only `project`/`proj`, so they cannot call back into the store. If an opener did call `open(sameName)`, it would recurse without end, exactly as in master. If it called `close`/`closeAll`, `set` would still run afterwards, also as in master. No drift.
- **Cache check.** Master GBA used `if (entry) return entry`; the new code uses `if (!entry)`. Entries are always objects, so these are the same.
- **`entries()`.** Returns a fresh array copy, `[...sessions.entries()]`, as both masters did. Each pair is a new array, and the entry objects are the live ones, as before. The consumers that iterate it while the store changes (`stageTilesetPlan` closes on refusal after `requireTilesetOwnership` has already copied it) behave the same.
- **`dirty()`.** Filters on `isDirty` and then calls the default `.sort()` (UTF-16 code-unit order), the same as both masters. `[...sessions]` and `[...sessions.entries()]` give the same result.
- **`root`.** Master read `project.paths.root` / `proj.root` once, when the store was built. The new code passes the same expression into `createSessionStore` at construction. Same, and `paths.root` never changes after open.
- **Trap 24.** `openGbaEntry` still calls `project.map(mapName)` on every open (`editSessions.ts:31`). The spread project in `index.ts:214-216` is unchanged by this diff.

## Types
- `SessionStore<E extends { session: { isDirty: boolean } }>`: both `SessionEntry` and `GbcSessionEntry` satisfy it, and no `any` was added. The interface has exactly the members of master's inferred object type (`open, close, has, dirty, closeAll, entries, root`), with the same parameter and return types. So every `ReturnType<typeof createXStore>` consumer, including the union `BlockEditStore` (`blockEditOwnership.ts:74`), resolves to an equivalent type. Calls on the union (`has`, `open`, `close`, `entries`) still type-check, because each member has one signature of the same shape.
- `root: string` is mutable in the interface. Master's inferred type was mutable too, so this is not drift. It could be `readonly` (see m4).

## Findings

### Minor

**m1. The family-neutral unit test does not pin "close/has touch only the named key". The corpus-gated tests are what catch it.** `packages/server/test/sessionStore.test.ts:27-35, 18-25`.
Every `close` and `has` assertion in this file runs with at most one open entry, or right after `closeAll`. So these two mutants survive this file:
- `close: () => sessions.clear()`
- `has: () => sessions.size > 0`

In production, either one breaks save/discard ownership. Under the `close` mutant, a refused stage in map B (`blockEditOwnership.ts:130`, `store.close(mapB)`) would silently drop map A's unsaved session. `dirtyMaps()` would then report nothing, and the hub's 409 guard would let a project swap discard A's edits.

Today these mutants are killed only by corpus-gated tests:
- `blockEditOwnership.test.ts:465-475` kills the `close` mutant, because A's ownership must survive B's refusal.
- `blockEditOwnership.test.ts:374-379` kills the `has` mutant, because `has(mapB)` must be false while A is open.

Both tests are skipped on a machine without the corpus. Fix: open "A" and "B", `close("A")`, then assert `has("B")`, `open("B")` is the same entry, and `entries()` is `[["B", b]]`.

**m2. Opening the project in the describe body may make a corpus-less run fail instead of skip.** `packages/server/test/editSessionsReopenMap.test.ts:32` and `packages/server/test/gbcEditSessions.test.ts:7`.
`const project = openProject(SUBJECT_ROOT)` and `openGbcProject(GBC_SUBJECT_ROOT)` run in the `describe.skipIf(...)` callback. As far as I know, vitest still runs a skipped suite's factory to collect its tests. With no corpus, `GBC_SUBJECT_ROOT` is `""`, and `openProject` throws when `fieldmapH` is missing (`project.ts:109-111`). So the file would error at collection rather than skip. `editSessions.test.ts:7` already uses this pattern, so this is inherited, not new. I did not confirm it by running. The first describe in the reopen file already does it the safe way, opening the project inside `it`. Use the same for the two new describes, or a lazy `beforeAll`.

**m3. A doc comment lost its invariant reference.** `packages/server/src/sessionStore.ts:1-12`.
Master's GBA doc said `close()` "is what actually enforces I6 in spirit" (an open session is not a write). The new shared doc keeps the reasoning but drops the I6 tag, which is what a later reader would grep for. The master GBA comment about Task 9 ("nothing calls close() yet") was stale, and dropping it is correct. Everything else of substance moved verbatim: the `originalMap` aliasing rationale and the `dirty`/`closeAll` hub notes, now on the interface.

**m4. `root` could be `readonly`.** `packages/server/src/sessionStore.ts:28`.
Nothing assigns to it. `addEventRoutes.ts` resolves every path against `store.root`, so marking it `readonly` costs nothing and documents that it is fixed at construction. This is cosmetic and not drift.

## Test quality checks
- The corpus names exist in the configured subjects. I checked them directly:
  - GBA `data/maps/NewBarkTown/scripts.inc:40` `NewBarkTown_EventScript_LabSign::`, and `data/maps/NewBarkTown_Lab/map.json` exists.
  - GBC `maps/NewBarkTown.asm:128,134` has `NewBarkTownSign` and `NewBarkTownElmsLabSign`.
- `editSessionsReopenMap.test.ts:11-28`: `calls` counts only the store's own `project.map` calls. `layoutForMap` closes over the base project's `getMap` (`project.ts:209`), not the spread's `map`, so "once per open" is exact. The `toBe(calls[n])` identity assertions kill a cached-map or cloned-map mutant (M8). The spread `{...base}` freezes the `tilesetGeneration` getter value (`project.ts:218`), but the opener never reads it. That is harmless, and `index.ts` does the same in production.
- `sessionStore.test.ts:44-51`: "Zed" is opened before "Alpha", so dropping the sort is caught (M4). The `entries` copy test (`list.length = 0`) catches a shared or cached array.
- No test edits a subject repo. Every new corpus test only reads.

## Mutation evidence
I accept the 11 reported mutants as plausible from reading the code. The two gaps not covered by the corpus-free unit file are in m1. Neither is a gap in the gated suite.

## Left undone
Nothing within budget. I did not run vitest or typecheck, per the brief.
