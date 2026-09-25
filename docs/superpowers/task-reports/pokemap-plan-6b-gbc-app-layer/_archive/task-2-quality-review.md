# Plan 6b Task 2: code-quality review

Reviewed `git diff 0227b76..e7142f4` (commits `c5b386d`, `e7142f4`) --
`packages/core/src/gbc/analyse/atlas.ts`, `packages/core/src/gbc/wire.ts`,
`packages/cli/src/gbcCommands.ts`, `packages/server/src/gbcRoutes.ts`, and
both test files -- against `task-2-spec.md` / `task-2-implementer.md`, and
against the two prior quality reviews' recommendations
(`_archive/task-1a-quality-review.md`, `_archive/task-1b-quality-review.md`).
Read-only review; nothing in the repo was changed except this report.

## Verdict: **approve-with-fixes**

The five new routes match `gbcRoutes.ts`'s established thin-dispatch-plus-
exported-builder shape exactly (`buildGbcWorldPayload`, `buildGbcEncountersPayload`
alongside the existing `buildGbcGroupsPayload`/`buildGbcMapPayload`,
`parseTimeParam`/`decodeMapName` reused, not reimplemented), the
`normalizeSpecies` move is clean, and every comment claim I checked against
the real code (including several against `index.ts` and `gbc/world/connections.ts`)
held up, with one exception on measurement precision. Test quality is high:
pinned literals cross-checked against raw `.asm` text and a probability
table, discriminating fixtures, no test that fails to exercise the route it
sits under. Nothing here blocks the task. The one Important finding is worth
fixing before Task 3+ locks in a runtime-type-guard pattern for the wire
types.

## Findings

### 1. [Important] `GbcEncountersPayload` is the only wire.ts envelope type missing the `family` discriminant, on a route that collides with GBA's own same-URL, different-shape route

`packages/core/src/gbc/wire.ts:86-90` (new `GbcEncountersPayload`) vs
`wire.ts:47` (`GbcMapPayload.family: "gbc"`) and the new `GbcWorldPayload`
just above it, both of which carry `family: "gbc"`.

`/api/encounters/:map` is not a GBC-only path -- GBA's `index.ts:383-419`
serves the identical URL pattern (`/^\/api\/encounters\/(.+)$/`) with a
structurally different response, `{ mapName, mapId, methods }`, vs GBC's
`{ mapName, sources, defects }`. That is exactly the same "same URL, two
shapes" situation `/api/map/:name` and `/api/world` are in, and both of
those got a `family: "gbc"` tag for it. `GbcEncountersPayload` didn't, even
though it is otherwise a bespoke wire.ts envelope type built the same way
(not a bare array or a core type reused verbatim, unlike `/api/where`,
`/api/coverage` and `/api/species`, which legitimately have no `family` field
since a JSON array/bare-object response can't carry one anyway).

This traces back to the spec's own literal type snippet (task-2-spec.md
lines 42-47 give `GbcEncountersPayload` with no `family` field, right next to
`GbcWorldPayload` which has one), so it's not an implementer deviation --
but it's worth catching now rather than after Task 3+ writes a shared
"check `body.family === 'gbc'`" runtime guard for every Gbc*Payload and
discovers this one response shape can't use it.

**Fix:** add `family: "gbc";` to `GbcEncountersPayload` (`wire.ts:86-90`) and
to `buildGbcEncountersPayload`'s return object (`gbcRoutes.ts:220-226`,
`mapName: name` line), then add the one new test assertion
(`body.family === "gbc"`) alongside the existing `/api/encounters` tests. A
purely additive field; doesn't disturb any pinned test that uses `toEqual`
against `gbcEncounterSources`/`proj.wild().defects` output directly (those
compare sub-fields, not the whole payload, except the one `buildGbcEncountersPayload`
unit test at `gbcRoutes.test.ts` "buildGbcEncountersPayload directly", which
would need one more field in its expectation).

### 2. [Minor] Cache-timing comment states a single "~2ms" the implementer's own re-measurement doesn't support

`packages/server/src/gbcRoutes.ts:248-249`:
```
// buildGbcWorld walks all 391 maps' connections -- measured ~2ms against
// the real corpus (cheap, unlike GBA's ~4s buildWorld over 1,209 maps), ...
```
`task-2-implementer.md`'s own "Measured numbers" section reports
`buildGbcWorld`: **~1-7ms** across three warm runs, not a single ~2ms value
-- the "~2ms" here is the *plan review's* original estimate, restated as if
it were this task's own re-measurement. Every other timing claim in this
file's comments (`gbcCoverage`'s "~100-150ms") correctly reports what was
actually re-measured, including flagging a discrepancy from the estimate;
this one line is the one spot that quietly reverts to the estimate instead.

**Fix:** change the comment to the measured range, e.g. "measured ~1-7ms
across warm runs against the real corpus", so a future reader doesn't treat
"~2ms" as a number this task actually confirmed to that precision.

### 3. [Minor] Implementer report's before/after test counts for `gbcRoutes.test.ts` don't match the file's real history

`task-2-implementer.md`, "Test counts": "`gbcRoutes.test.ts` went from 49 to
67 `it`s (+18)". Counting `it(` occurrences directly: `git show
0227b76:packages/server/test/gbcRoutes.test.ts` has **41**, the current file
has **59** -- not 49/67. The **+18** delta (and the file's own new
`describe("GET /api/world"...)` block onward, independently counted at 18
`it(`s) is correct, and the aggregate repo-wide "1347 -> 1369 (+22)" figure
doesn't depend on this per-file breakdown being right. This is a report
typo, not a code defect, but worth a one-line fix in the report since a
future task will cite these baseline numbers the way this one cited 1b's.

**Fix:** correct "49 to 67" to "41 to 59" in `task-2-implementer.md`.

### 4. [Nit] One `/api/where` test adds only marginal coverage over its neighbors

`packages/server/test/gbcRoutes.test.ts`, `describe("GET /api/where/:species"...)`,
the test `"matches gbcWhereSpecies(proj, 'CHIKORITA') directly"`. The
DUNSPARCE test just above it already proves normalization (three casings/
prefix forms agree) and a real multi-hit result; the unknown-species test
below it already proves the empty-array path. This third test re-derives a
different species' hits from the core function and checks route/core
equality for it, which the DUNSPARCE test's `expect(lower).toEqual(upper)`
already establishes the *shape* of (route output equals core output) just
as well. Not wrong, not slow, just low marginal value.

**Fix (optional, not required):** drop it, or fold its one assertion into
the DUNSPARCE test's own file-level comment as documentation instead of a
separate `it`.

### 5. [Nit] The GBC block-size constant (`32`) has three independent sources of truth

`packages/core/src/gbc/wire.ts:78` (`blockPx: 32` in the type, per the
spec's own literal), `packages/server/src/gbcRoutes.ts:201` (`blockPx: 32,`
in `buildGbcWorldPayload`), and the pre-existing, unexported `const BLOCK_PX
= 32` in `packages/core/src/gbc/render/world.ts:9`. Harmless in practice --
this is a GBC hardware constant that will never change -- but if
`render/world.ts` exported `BLOCK_PX`, `gbcRoutes.ts` could import and use
it instead of re-typing the literal a second time (the wire.ts *type*
necessarily stays a literal `32`, since TS literal types can't reference a
runtime `const` directly without `typeof BLOCK_PX` gymnastics that would be
overkill here). Not worth doing on its own; mention only because it's the
same "one source of truth" instinct the rest of this file follows elsewhere.

### 6. [Nit] `gbcCommands.test.ts`'s in-comment references to `normalizeSpecies` are now stale

`packages/cli/test/gbcCommands.test.ts:412,422` still say "a dropped
`normalizeSpecies`" and "`normalizeSpecies` strips it before the lookup" --
the function of that name no longer exists in this file (or anywhere);
it's `normalizeGbcSpecies` in `core/gbc/analyse/atlas.ts` now. The spec's
own ground rule ("Its existing CLI tests must stay green without edits")
correctly kept the assertions untouched, but the prose inside two comments
is a separate matter and is now inaccurate about where the behavior lives.
Not urgent -- this is an unedited file per the spec, and the assertions
themselves are still correct -- but worth a one-line touch-up next time this
file is opened for any other reason.

### 7. Navigability of `gbcRoutes.ts` at ~10 routes (452 lines) -- answering the review question directly

Still one file, and still the right call. The structure Task 1b's fix round
established (helpers, then exported builders, then `createGbcServer`'s
cache declarations, then a flat dispatch list) scales cleanly to five more
routes: the two new routes with real wire shapes (`/api/world`,
`/api/encounters`) get named builders exactly like `/api/groups`/`/api/map`
did, and the three that return a core type or bare array unchanged
(`/api/where`, `/api/coverage`, `/api/species`) correctly have *no* builder
function, since there's nothing to name -- a one-line
`gbcWhereSpecies(proj, normalizeGbcSpecies(species))` inside the dispatch
`if` doesn't need extracting just to match a pattern that exists for
testability, not for its own sake. The dispatch list itself is still a
readable sequence of `if (match) return send(...)` lines with no route body
longer than the PNG routes' own pre-existing border/time validation. Only
worth splitting builders into a separate `gbcPayloads.ts` once Plan 7's
`/api/edit/*` lands and roughly doubles the file again (the file's own
header comment already anticipates that task) -- not now.

## Checked and found correct (no action needed)

- **Import paths.** `gbc/world/connections.ts` really does re-export
  `Placement`/`Component`/`Conflict` from the GBA `../../world/connections.js`
  (confirmed by reading the file's own `export type { ... }` line) --
  `wire.ts`'s new import is accurate, matching the spec's own instruction to
  verify this rather than assume it.
- **Comment accuracy, GBA cross-references.** "GBA's own `/api/world` reads
  `?dungeons=`" (`index.ts:482`) -- confirmed. "GBA's own `buildWorld` ~4s
  over 1,209 maps" (`index.ts:88`) -- confirmed verbatim match.
  "`whereSpecies` is NOT cached... there is nothing shaped like 'the one
  answer' to memoize" (`index.ts:112-116`) -- confirmed verbatim reasoning
  match with `gbcRoutes.ts`'s equivalent comment for `gbcWhereSpecies`.
  "There is no dungeons-on/off toggle" (`gbc/world/connections.ts:29-34`) --
  confirmed, matches `gbcRoutes.ts`'s `/api/world` comment claim exactly.
- **`SpeciesSpotlight`'s consumption shape.** `packages/ui/src/components/SpeciesSpotlight.tsx:106,188`
  do `r.json() as Promise<string[]>` and `r.json() as Promise<SpeciesHit[]>`
  respectively -- both bare arrays, no envelope -- confirming the
  implementer's comment that GBC's `/api/where` and `/api/species` returning
  bare arrays matches the shape a future `GbcSpeciesSpotlight`-equivalent
  would need. `gbcWhereSpecies` also sorts by `percent` descending
  (`atlas.ts:497`), matching `SpeciesSpotlight`'s own doc comment about the
  GBA contract it expects.
- **The PIDGEY 45%/Lv2-7 pin.** Independently re-derived from
  `probabilities.asm`'s `GrassMonProbTable` (slot 0 = 25%, slot 2 = 20%) and
  `johto_grass.asm`'s real `ROUTE_29` morn block (`db 2, PIDGEY` at slot 0,
  `db 3, PIDGEY` at slot 2) -- `mergeSlots` correctly combines the two
  same-species slots into one 45% chance with `minLevel: 2`,
  `maxLevel: 3 + GRASS_WATER_LEVEL_BUFF_MAX (4) = 7`. The test's pinned
  values are correct, not just self-consistent with the core function.
- **`family`-tagged routes' actual family isolation.** `/api/species` exact-match
  vs `GBA_ONLY_ROUTE_RE`'s `species/[^/]+/icon\.png$` alternative -- confirmed
  no collision, and the mutation table's #8 entry (shadow-by-prefix-match)
  is a real, correctly-killed mutation.
- **`buildGbcWorldPayload`'s dropped `proj` parameter** (implementer's
  deviation #1) -- correct call: nothing in the function body reads `proj`,
  and the exported signature matches every call site in the diff.
- **Cache non-mutation.** `getWorld()`/`getCoverage()`/`getSpecies()` all
  return direct references to cached objects/arrays that are only ever
  `JSON.stringify`'d by `send()`, never mutated; `buildGbcWorldPayload`'s
  `Object.fromEntries(world.placements)` builds a fresh object per call
  without touching the cached `Map`. No aliasing bug.
- **Mutation table.** Spot-checked #3 (raw `Map` serializing to `{}`) and #5
  (wrong-map lookup via `.toLowerCase()`) against the real code paths --
  both really would be killed the way the report claims.
- **Test structure.** Task 2's block sits after Task 1b's tests, in its own
  `describe`s, inside the same `describe.skipIf(...)` with no new
  `beforeAll`/`afterAll` -- correct per spec and per Plan 0 §7.

## Not investigated further

Runtime behavior beyond what the implementer's own live-`curl` transcript in
`task-2-implementer.md` shows (server not started, per the read-only
constraint) -- that transcript is consistent with the code as read.
