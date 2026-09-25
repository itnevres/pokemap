# Plan 6 Task 12 — quality review: the GBC encounter atlas

Reviewed commit `7d095b2` on `plan-6-gbc-foundation` against
`task-12-spec.md` and the implementer report. Read-only review; no files in
the repo or the subject were modified.

## Verification performed

- `npx vitest run packages/core/test/gbc packages/cli/test/gbcCommands.test.ts packages/cli/test/context.test.ts` →
  **16 files / 524 tests, all passing**, matching the implementer's claim.
- `npx vitest run` (full repo) → 17 files fail, all with `does not look like a
  decomp project root: missing .../include/fieldmap.h` (a hardcoded Windows
  path to a local GBA checkout that doesn't exist in this environment) plus
  one `has every reference engine available` corpus-count assertion — all
  pre-existing/environmental, none touch GBC or CLI code.
- `npm run typecheck` → clean.
- Spot-verified several of the file:line engine citations directly against
  `/home/user/pokecrystal-PerfPlus`: `wildmons.asm`'s `ChooseWildEncounter`
  level-buff thresholds (35/65/85/95 percent, shared grass/water code path),
  `fish.asm`'s bite check, rod-record `cp [hl]; jr z/jr c` selection, and
  `.TimeEncounter`'s day/nite split, and `treemons.asm`'s `RockMonEncounter`
  40% gate and `SelectTreeMon`. All matched the doc comments and implementer
  report exactly.
- Ran the real CLI (`coverage --json`) against the subject and confirmed
  `sourcesByMethod: { grass: 288, water: 62, fish: 340, headbutt: 106, rock: 4 }`
  and the other "measured corpus values" in the implementer report are
  accurate, not just claimed.

## Strengths

- Engine-rule derivation is genuinely rigorous, not just asserted: every rule
  is cited file:line and I independently re-verified several against the raw
  `.asm` — level buff, fishing bite/rod/time_group, and rock's flat 40% all
  check out exactly (`packages/core/src/gbc/analyse/atlas.ts:61-137, 285-299`).
- Clean separation of engine-probability math from data joining: one small
  builder function per method (`buildGrassSources`, `buildWaterSource`,
  `buildFishSources`, `buildHeadbuttSources`, `buildRockSources`,
  `atlas.ts:181-299`), each independently unit-tested, with the shared
  "merge duplicate species, sum percent, min/max level" idiom factored into
  `mergeSlots`/`mergeTreemonRecords`/`resolveFishChances` rather than
  repeated per method.
- `tileset.ts`'s new global-collision-category lookup
  (`parseCollisionCategoryBits`/`parseTileCollisionCategoryTable`/
  `loadGbcWaterCollisionValues`, `packages/core/src/gbc/load/tileset.ts:249-329`)
  is properly scoped as a separate concern from the existing per-tileset
  `parseCollisionConstants`/`parseCollision`, with a doc comment explicitly
  marking the boundary. No duplication with the existing collision parsing.
- Types are precise: `GbcEncounterSource`/`GbcSpeciesHit`'s optional fields
  (`time`/`rod`/`list`/`conditional`/`encounterRate`/`biteChance`) are only
  ever populated for the methods where they're meaningful — no stringly-typed
  or boolean-flag stand-ins, literal unions throughout.
- Test fixtures (`packages/core/test/gbc/analyse/atlas.test.ts`) are readable
  and carry derivation comments (e.g. lines 98-118's grass-slot comment
  explaining why every merged level lands on exactly 7), and the corpus tests
  cross-check real Crystal game knowledge (Route29, Route32's Qwilfish swarm,
  CianwoodCity's Shuckle, DUNSPARCE's Dark Cave swarm, HOUNDOUR's night-only
  routes) — a real sanity check beyond "the math is internally consistent."
- The 9-item mutation-check table in the implementer report is concrete
  (which mutation, which tests went red) rather than a bare "we did mutation
  testing" claim.
- CLI handlers (`runGbcEncounters`/`runGbcWhere`/`runGbcCoverage`,
  `packages/cli/src/gbcCommands.ts:116-200`) follow Task 10's established
  thin-handler-returns-`{stdout,stderr}` shape exactly, keeping them testable
  without spawning a process, and are kept in one clearly-labeled block below
  the Task 10 handlers.

## Issues

### Important

**1. `gbcCoverage` computes `gbcMapHasWaterTile` twice per map, doubling an
un-cached filesystem read across (up to) 386 of 391 maps.**
`packages/core/src/gbc/analyse/atlas.ts:519-544`. `gbcCoverage`'s loop calls
`gbcEncounterSources(proj, map.name)` (which itself calls
`gbcMapHasWaterTile` once, unconditionally, at `atlas.ts:348`), then calls
`gbcMapHasWaterTile` a *second* time directly at `atlas.ts:541` to compute
`fishGroupWithoutWater`. `gbcMapHasWaterTile` calls `proj.layout(map)`
(`atlas.ts:314`), and `GbcProject.layout` is deliberately **not** cached
(`packages/core/src/gbc/project.ts:29-32`'s own doc comment: "a layout's
`.blk` is read once per render call in the common case"). `gbcCoverage` is
exactly the case that breaks that assumption — it now performs ~386
redundant `.blk` reads plus a full collision-quadrant scan, every time
`coverage` runs, for a value it already computed one line up the call stack.
The implementer flagged this explicitly and judged it "cheap" (both
per-call costs are small), which is true in isolation, but it's also a
one-line-fix waste that directly contradicts `project.ts`'s stated caching
rationale. *Fix*: compute `const hasWater = gbcMapHasWaterTile(proj, map)`
once per map in `gbcCoverage`'s loop and derive `fishGroupWithoutWater` from
it directly, threading the value into a variant of the fishing-source
builder (e.g. an optional third parameter on `gbcEncounterSources` that
defaults to computing it, so the public two-argument signature the spec
names is unaffected).

### Minor

**2. Headbutt's engine-semantics doc comment omits `GetTreeMon`'s own
attempt-rate gate.** `atlas.ts:247-262`'s doc comment says tree score governs
only *which list* (common/rare) is read. Reading
`/home/user/pokecrystal-PerfPlus/engine/events/treemons.asm:125-165`
(`GetTreeMon`) shows tree score *also* gates a distinct 10%/50%/80%
(bad/good/rare) attempt roll before `SelectTreeMon` is ever reached at all —
a real third axis this file doesn't mention, model, or explain as
out-of-scope. The numeric omission itself is defensible (the spec's
"Out of scope" section explicitly excludes tree-score runtime-state
resolution, and there's no single flat rate to report the way rock has one),
but the doc comment's "never assume" citation promise is incomplete here: a
reader has no way to know this axis exists at all, unlike rock/grass/water
where the omitted-but-present rate is always surfaced as `encounterRate`.
*Fix*: extend the existing doc comment with one sentence noting
`GetTreeMon`'s own bad/good/rare attempt gate is real but, like the list
choice itself, tied to unknowable tree score and out of scope, so headbutt
sources never carry an `encounterRate` field the way rock does.

**3. `mergeSlots`'s `slotPercents[i] ?? 0` silently drops probability mass on
a length mismatch instead of refusing.** `atlas.ts:212-215`. Every other GBC
loader in this codebase (`tileset.ts`'s `parseCollision`/`parsePaletteMap`/
`parseTileCollisionCategoryTable`, `parseConstDefs`, etc.) refuses loudly,
naming the file, on any shape it doesn't expect, per this codebase's own
stated convention. If `GbcWildProbabilities.grass`/`.water` ever had fewer
entries than a `slots` array (a future format change, a corpus edit), this
would silently produce chances summing to under 100% rather than throwing.
Currently dormant (grass is always 7 slots, water always 3), but it's a
latent inconsistency with the file's own house style. *Fix*: throw a named
error (`mergeSlots: N slots but M probabilities`) instead of defaulting to 0.

**4. CLI row-formatting is duplicated verbatim between the GBA and GBC
`encounters`/`where` handlers.** The per-chance row format string
`` `  ${pct.toFixed(1).padStart(5)}%  Lv ${min}-${max}  ${species}` `` appears
both at `packages/cli/src/index.ts:224` (GBA `encounters`) and
`packages/cli/src/gbcCommands.ts:137` (GBC `runGbcEncounters`), and the
`where` row format (`padEnd(32)` map name + the same percent/level shape)
appears at `index.ts:246` and `gbcCommands.ts:173`. Not a bug — the two
paths currently produce identical output — but a future format tweak to one
risks silently drifting from the other. *Fix*: not urgent; if a third format
consumer appears, factor the row formatter into a small shared helper (e.g.
`packages/cli/src/format.ts`) both files import.

**5. `GbcEncounterSource` and `GbcSpeciesHit` duplicate their five tag
fields.** `atlas.ts:45-59` and `atlas.ts:359-370` both independently declare
`method`/`time?`/`rod?`/`list?`/`conditional?` with identical types. They
must be kept in sync by hand as the method set grows; a shared
`GbcSourceTags` interface (or `Pick`) would make that structural, not just
conventional. Low priority — the fields are small and stable — but worth
doing before a Task 13+ adds a sixth field to one and not the other.

**6. `levelByMap`'s doc comment overstates its similarity to the GBA
sibling.** `atlas.ts:475-484`: "This mirrors the GBA analyser's ... choice
one level up." Reading `packages/core/src/analyse/coverage.ts:79-118`, GBA's
`coverage()` does not average per table at all — it pools every chance from
every method/rod/table for a map into a **single** percent-weighted sum
(`perMap`'s accumulator is keyed only by `e.map`, folded across every
method/rod/entry). GBC's `gbcCoverage`, by contrast, takes a percent-weighted
average *within* each source, then an *unweighted* arithmetic mean *across*
sources (spec-mandated: "weighted equally per source", task-12-spec.md line
51, correctly followed). These are two materially different statistics, not
the same idea "one level up." The choice itself is fine and spec-compliant;
the comment claiming equivalence to GBA's actual algorithm is not accurate
and could mislead a future maintainer comparing the two. *Fix*: reword to
something like "unlike GBA's `coverage()`, which pools every chance from
every table into one flat percent-weighted average per map, this averages
per source first, then averages those source-level averages equally — see
the spec's explicit choice, task-12-spec.md line 51."

**7. The implementer report's exact `sourcesByMethod` corpus numbers aren't
regression-pinned.** The corpus `gbcCoverage` test
(`atlas.test.ts:589-598`) pins `mapsWithEncounters`, `fishGroupWithoutWater`,
`unusedSpecies`, and `defects`, but not `sourcesByMethod` against the real
subject (only the hand-built stub fixture pins exact method counts, at
`atlas.test.ts:473`). I confirmed the report's real-corpus numbers
(`{ grass: 288, water: 62, fish: 340, headbutt: 106, rock: 4 }`) are accurate
today by running the CLI directly, but a future regression in the
method-counting logic that happens to still pass the stub fixture wouldn't
be caught against the real corpus. Low priority given the stub fixture
already exercises the counting logic thoroughly.

## Doc-layout / merge note (Task 11)

Per the review brief: Task 11 (a parallel worktree, per
`task-12-spec.md`'s "Out of scope" framing and `task-11-implementer.md`)
adds a `runGbcRenderWorld` handler to `gbcCommands.ts` and rewires
`render-world`'s action in `index.ts`. This commit left `render-world`'s
action body in `index.ts` completely untouched (confirmed by diff), so no
line-level conflict is expected there. `gbcCommands.ts`, however, is
different: this commit appends its whole "Task 12" block
(`gbcCommands.ts:95-200`) immediately after `runGbcQuery`, the same
insertion point Task 11's `runGbcRenderWorld` (also appended right after the
Task 10 handlers, per its own report's file list) will most likely target.
Both branches also touch the single `import { runGbcRender, runGbcQuery,
... }` line in `index.ts` and `gbcCommands.test.ts`. None of this is a real
design flaw — the implementer already did the right thing by clearly
labeling the block boundary and its own commit message calls the eventual
merge "mechanical" — but expect an ordinary textual git conflict at that one
insertion point in `gbcCommands.ts` (and on the shared import lines) that
will need a trivial manual "keep both blocks" resolution, not a semantic one.

## Assessment

**Approved.** No correctness bugs found; every engine-rule citation I
spot-checked against the real subject source matched exactly, the full
GBC+CLI suite passes (524/524), and `typecheck` is clean. The one Important
finding (the doubled `gbcMapHasWaterTile` call in `gbcCoverage`) is a
performance-only, already-acknowledged trade-off with a small, well-scoped
fix — worth doing in a quick follow-up but not a reason to block this
commit. The Minor findings are documentation-precision and DRY nits, none of
which affect behavior.
