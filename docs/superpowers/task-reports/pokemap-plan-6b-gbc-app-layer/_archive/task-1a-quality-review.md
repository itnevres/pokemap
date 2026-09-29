# Plan 6b Task 1a: code-quality review

Reviewed `git diff 32928b2..b9aff64` (commits `d6532ac`, `b9aff64`), against
`task-1a-spec.md` and `task-1a-implementer.md`. Read-only review; nothing in
the repo was changed.

## Verdict: **approve-with-fixes**

The implementation matches the spec closely: signatures, error-message
wording conventions (I7/G4), the `PokemapServer` union, `ProjectInfo`
placement, the `wire.ts` split, and the import-cycle avoidance are all done
correctly and match the plan review's own findings where cited. Test quality
is high -- pinned values, discriminating fixtures, correct
`describe.skipIf` placement. Two things should be fixed before Task 1b
builds more on top of this: one inaccurate doc comment, and a duplicated
`GbcProject` test stub that's now been extended a third time instead of
factored. Neither blocks Task 1b functionally.

## Findings

### 1. Important -- inaccurate comment citation in `parseMapGroupNames`'s doc comment

`packages/core/src/gbc/load/map.ts:55-56`:

```ts
 * Refuses (throws, naming `source`) a `newgroup` with no argument -- G4,
 * matching `parseMapAttributes`'s own "never guess a group's name" posture.
```

`parseMapAttributes` (same file, line 95) has nothing to do with group
names -- it parses `map_attributes`/`connection` lines (border, connection
flags/targets) and only throws on an unknown connection direction or a
connection appearing before any `map_attributes`. It never reads or
validates a group name. Grepping the repo, `"never guess a group's name"`
appears nowhere else either -- there is no existing function this citation
actually matches. `parseMapConstants`, the file's other `newgroup` reader,
doesn't validate an empty group name either (it only checks `matchCall`
truthiness, never inspects the captured name). So the "matching X's posture"
half of the sentence is fabricated, not just imprecise -- this is exactly
the "comments that cite findings/sections must be accurate" case the review
brief calls out.

**Fix:** either drop the "matching parseMapAttributes's..." clause entirely
(the "G4" citation alone already justifies the refusal), or replace it with
an accurate cross-reference, e.g. "the same refuse-rather-than-guess posture
`loadGbcMaps`'s join-miss checks use below (G4)."

### 2. Important -- three separate `GbcProject` test stubs where the repo's own convention says to share one

`packages/core/test/gbc/analyse/atlas.test.ts:302-324`,
`packages/core/test/gbc/render/map.test.ts:222-238`,
`packages/core/test/gbc/world/connections.test.ts:39-59`.

Each file defines its own `stubProject`/`stubGbcProject` builder with the
same shape (an `unused(fn)` thrower plus one field per `GbcProject` method).
This diff had to add the same two lines (`groupNames: unused(...)`,
`collisionInfo: unused(...)`) to all three, independently.

The GBA side of this exact codebase already hit this and solved it:
`packages/core/test/helpers/stubProject.ts`'s own header comment says it was
"originally `write/guards.test.ts`'s own copy ... extracted here so the
`write/*.test.ts` and `edit/*.test.ts` files still to come don't each retype
it." That is precisely the situation on the GBC side now -- 3 files, one
shared shape, and Task 1b/2 are about to add more `GbcProject` methods
(`GbcMapPayload`-adjacent helpers, encounters, etc.) that will need this
same 3-way edit again.

**Fix:** factor a `stubGbcProject(overrides)` helper into
`packages/core/test/gbc/helpers/` (there's already a `helpers/corpus.ts`
sibling there) and have all three files import it, keeping only the
per-test differences (`atlas.test.ts`'s constructor-arg style, `render/
map.test.ts`'s `overrides` param, `connections.test.ts`'s `maps`-driven
`map`/`maps`) as call-site overrides. Not urgent enough to block this task,
but doing it before Task 1b/2 add the next round of methods avoids a 4th and
5th copy.

### 3. Minor -- `serve.ts`: `--gbc` combined with a positional path silently ignores the positional path

`packages/server/src/serve.ts:14-43`. If both `--gbc` and a positional root
are given (`serve.ts --gbc /some/path` or `serve.ts /some/path --gbc`), the
`if (process.argv.includes("--gbc"))` branch wins unconditionally and the
positional path is never looked at -- not read, not warned about. This
matches the spec's literal wording ("If `--gbc` is present, use
`cfg.gbc.projectPath`"), so it's not a spec deviation, but it's an
easy-to-hit footgun for anyone testing both flags together by hand (e.g.
copy-pasting a positional-path invocation and prepending `--gbc` without
removing the old argument), and the code has no comment acknowledging the
combination is possible.

**Fix:** a one-line comment above the `if` noting that a positional root is
ignored when `--gbc` is present (mirrors the `else` branch's own comment
style, which already explains why `argv[2]` isn't used unconditionally).
Not worth changing the behavior itself.

### 4. Nit -- small duplicated boilerplate beyond the spec-sanctioned `send` copy

`packages/server/src/gbcRoutes.ts:59-63` vs `packages/server/src/
index.ts:1010-1015`. The spec explicitly sanctions copying the 4-line `send`
closure ("since it's a closure"), but the `http.listen(...)` /
`http.address()` / port-resolution / `close()` block just below it (5 more
lines) is duplicated too, and isn't a closure over anything that would
prevent factoring it into a shared `startHttpServer(handler, port)` helper
in a new `packages/server/src/http.ts` (which the plan review's own finding
8 suggested as an alternative). Low priority: it's small, it won't grow
(there are only two `createServer`-shaped functions and no third family is
imminent), and factoring it now would touch the "keep the GBA body exactly
as-is" file the spec explicitly protects. Worth revisiting only if a third
server variant shows up.

## Checked and found correct (no action needed)

- **Type design.** `ProjectInfo` in `family.ts` (not `wire.ts`), `wire.ts`
  kept types-only, `GbcCollisionInfoEntry` declared once and reused as
  `loadGbcCollisionInfo`'s return value type -- all match the plan review's
  findings 7/10 and the spec.
- **Import cycle.** `index.ts` imports `createGbcServer` (runtime) from
  `gbcRoutes.ts`; `gbcRoutes.ts` imports `type { PokemapServer }` (type-only)
  from `index.ts`. Confirmed via grep -- no runtime cycle. `readBody` stays
  unexported.
- **Error messages.** `loadGbcCollisionInfo`'s two throws name the file, the
  colliding names, and the value / low nybble with the land/water/wall bits
  spelled out; `parseMapGroupNames`'s throw names `source`. All match I7/G4.
- **Duplication (collision tables).** `loadCollisionTables` is a clean,
  non-exported internal factor shared by `loadGbcWaterCollisionValues` (now
  a two-line function) and `loadGbcCollisionInfo`; `loadGbcWaterCollisionValues`'s
  signature and behavior are untouched, confirmed by diff.
- **`gbcRoutes.ts` vs `index.ts` route-handling skeleton.** Same
  try/catch/500 shape, deliberately duplicated per spec; header comment
  correctly identifies this file as `gbcCommands.ts`'s server counterpart
  and lists what Task 1b/2/Plan 7 add.
- **`renderGbcMapMetatile`.** Doc comment's claim ("mirroring GBA's own
  layout-keyed metatile route") checked against `index.ts`'s
  `/api/metatile/:layout/:id.png` route -- accurate, that route really is
  layout-keyed via `layoutByName`. No block-0 substitution, roof swap
  applied via the same `roofSwappedTiles` call signature `renderGbcMap`
  uses.
- **Test quality.** All new test files pin exact values (byte equality,
  exact message strings, exact counts), use discriminating fixtures (the
  `MACRO newgroup...ENDM` fixture's body contains a real `newgroup BOGUS`
  line so a broken macro-skip actually changes the result; the roof test
  uses VioletCity specifically because NewBarkTown's swap is a measured
  no-op), and correctly put `beforeAll`/`afterAll` inside
  `describe.skipIf(...)` in `gbcRoutes.test.ts`, matching `api.test.ts`'s
  own documented reasoning. No redundant tests found.
- **`serve.ts` `main()` wrapper.** The documented reason (a bare top-level
  `return` is a `SyntaxError` in an ESM module) is correct; `await main()`
  at the bottom preserves the same observable behavior (stderr line,
  `exitCode = 1`, no stack trace) as a literal top-level `return` would have
  had if it were legal.
- **Mutation table.** Spot-checked several entries against the actual code
  (e.g. #7's `>=`/`>` boundary in `outOfBoundsEventDefects`, #5's
  land/water/wall bit comparison in `loadGbcCollisionInfo`) -- each named
  mutation really would be caught by the named test.

## Task 1b impact

Nothing found that will make Task 1b (`/api/groups`, `/api/map/:name`,
`/api/render/:name.png`, `/api/metatile/:map/:id.png`) harder. Specifically:

- `groupNames()`, `collisionInfo()`, `outOfBoundsEventDefects`,
  `renderGbcMapMetatile`, and `GbcMapPayload`/`GbcCollisionInfoEntry` all
  have exactly the signatures Task 1b's spec assumes.
- `outOfBoundsEventDefects(map, events)` takes `Pick<GbcMap, "name" | "width"
  | "height">`, which `proj.map(name)`'s full `GbcMap` satisfies directly --
  no adapter needed when Task 1b assembles `defects`.
- The only friction is finding 2 above: Task 1b (and Task 2 after it) will
  likely need to touch these same three stub files again for whatever new
  `GbcProject` methods it adds, so the unfactored duplication compounds a bit
  more each task if left alone. Worth a five-minute fix now or at the start
  of Task 1b, not a blocker.
