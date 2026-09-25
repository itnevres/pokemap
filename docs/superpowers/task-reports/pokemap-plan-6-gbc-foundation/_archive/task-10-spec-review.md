# Plan 6 Task 10: GBC CLI read commands — spec-compliance review

Reviewer: Claude (spec-compliance reviewer, read-mostly; all mutations applied
during this review were reverted). Commit reviewed: `9192a69` ("feat(cli):
GBC family branch, render and query commands"), branch
`plan-6-gbc-foundation`. Spec: `task-10-spec.md`. Implementer report:
`task-10-implementer.md`.

## Verification run

- `git show 9192a69 --stat`: 6 files touched (`args.ts`, `context.ts`,
  `gbcCommands.ts` [new], `index.ts`, `test/context.test.ts`,
  `test/gbcCommands.test.ts` [new]). Matches the implementer's file list.
- `npx vitest run packages/cli/test/gbcCommands.test.ts packages/cli/test/context.test.ts packages/core/test/gbc`
  → **15 files, 479 tests, all green, 0 skipped.**
- `npm run typecheck` → clean.
- `npx vitest run` (full suite) → **17 failed test files, 1 failed test, 925
  passed, 136 skipped.** All 17 file failures are `C:/Programming
  Projects/Pokemon Game/game does not look like a decomp project root:
  missing .../fieldmap.h` (missing local GBA decomp), and the 1 failed test
  is `write/corpus.test.ts`'s "has every reference engine available" (same
  cause). Confirmed environmental, matches the task's stated baseline
  exactly — no new failures introduced by this commit.
- Live CLI runs, from repo root, against `/home/user/pokecrystal-PerfPlus`:
  - `render NewBarkTown -o <tmp>` twice → `cmp` **identical**, stdout
    `<out> 320x288 outOfRange=0 unmapped=0`, exit 0. Viewed the PNG: New Bark
    Town daytime — dirt path, tree ring, four green-roofed houses, blue pond,
    pink flowers. Matches the real town.
  - `render NewBarkTown --time dusk` → refused: `error: option '--time
    <time>' argument 'dusk' is invalid. --time must be one of morn, day,
    nite, got "dusk"`, exit 1.
  - `render NewBarkTown --border 4` → refused:
    `pokemap: renderGbcMap: NewBarkTown: border 4 out of range -- must be an
    integer 0-3`, exit 1 (GBC's own cap from `renderGbcMap`, as the spec
    anticipated).
  - `render NewBarkTown --border 3 --time nite` → `512x480`
    (`(10+6)*32`/`(9+6)*32`), exit 0. Viewed the PNG: correct blue/purple
    night palette and a visible 3-ring tree/grass border around the town.
  - `render ElmsLab` → `160x192`, exit 0. Viewed the PNG: desk/monitor,
    bookshelves, PC, incubator machine, red door mat — reads as Elm's Lab.
  - `query NewBarkTown --connections` → exit 0, exactly `{ connections: [...]
    }` with west→Route29 and east→Route27, offset 0 each.
  - `query NoSuchMap` → exit 1, `pokemap: unknown map NoSuchMap; not listed
    in /home/user/pokecrystal-PerfPlus/data/maps/attributes.asm`.
  - `paint NewBarkTown --tool pencil --x 0 --y 0 --metatile 1` → exit 1,
    `pokemap: paint is not supported for gbc (pokecrystal-family) projects
    yet`.
  - `--project /tmp render ...` → exit 1, `pokemap: /tmp does not look like a
    gba or gbc decomp project root. Probed: /tmp/include/fieldmap.h (gba);
    /tmp/data/maps/attributes.asm and /tmp/constants/map_constants.asm
    (gbc).` — clear, names every probed path.
- Measured pins, read directly from the subject:
  - `data/maps/maps.asm:497`: `map NewBarkTown, TILESET_JOHTO, TOWN,
    LANDMARK_NEW_BARK_TOWN, MUSIC_NEW_BARK_TOWN, FALSE, PALETTE_AUTO,
    FISHGROUP_OCEAN` — tileset/environment/palette/fishGroup confirmed.
  - `data/maps/attributes.asm:100`: `map_attributes NewBarkTown,
    NEW_BARK_TOWN, $05, WEST | EAST` — border 5, 2 connections, confirmed.
  - `constants/map_constants.asm:459`: `newgroup NEW_BARK ; 24` — group 24
    confirmed.
  - `maps/NewBarkTown.blk` is exactly 90 bytes = 10×9, `writable: true`;
    `maps/CeruleanCave2F.blk` is 400 bytes vs. declared 9×15=135 — confirmed
    the defect text.
  - `maps/NewBarkTown.asm`: 4 `warp_event` lines (286–289), 2 `coord_event`
    lines (292–293), 4 `bg_event` lines (296–299), 3 `object_event` lines
    (302–304) — 4/2/4/3, confirmed.
  - All of the above match the spec's pinned values and the implementer's
    report exactly.
- `git diff -- packages/` at the end of this review: **empty** (all
  mutations applied during review were reverted; verified with `git diff
  --quiet -- packages/`). `pokemap.config.json`'s pre-existing local diff was
  not touched by this review.

## Per-deliverable table

| # | Deliverable | Status | Evidence |
|---|---|---|---|
| 1 | `resolveRoot` factored out of `resolveProject`, byte-identical GBA messages | ✅ | `diff` of `context.ts` old vs. new (`git show 9192a69^:...` vs. working tree) shows every thrown message string unchanged; only comments and the wrapper shape changed. `resolveProject` is exactly `openProject(resolveRoot(explicit))`. |
| 2 | GBC has no config fallback (`--project` required) | ✅ | `resolveRoot` reads only the top-level `projectPath` key; `cfg.gbc.projectPath` is never referenced anywhere in `context.ts`/`gbcCommands.ts`/`index.ts`. |
| 3 | One shared family-branch helper, not hand-copied 11 times | ✅ | `resolveRootAndFamily` (resolve + probe) and `runGbaOnly` (the one refusal wrapper) in `index.ts`; each of the 10 GBA-only commands calls `runGbaOnly(root, family, "<name>", ...)` explicitly — traced all 10 call sites in the diff. |
| 4 | Every GBA-only command refuses on a GBC root BEFORE any GBA loader runs | ✅ | Traced each handler: `render-world`, `validate`, `encounters`, `where`, `coverage`, `sign suggest`, `sign add`, `sign list`, `paint`, `diff` all wrap their body in `runGbaOnly(...)`, whose `if (family === "gbc") throw ...` executes before the callback (which is where `resolveProject`/`openProject` lives) ever runs. `detectEngineFamily` itself (`packages/core/src/family.ts`, pre-existing) is a pure `existsSync` probe, not a loader. Confirmed live: `paint` on the real GBC root exits 1 with the named refusal, never reaching a GBA-loader error. |
| 5 | `runGbcRender`: stdout format, stderr `warning:` lines, `--time` validation, `--border` | ✅ | Live + test-verified: exact stdout `<out> <w>x<h> outOfRange=<n> unmapped=<n>`; `CeruleanCave2F` emits exactly one pinned `warning: maps/CeruleanCave2F.blk: actual size 400 bytes, declared 9x15=135 -- loaded first 135 bytes, not writable` line, `NewBarkTown` stderr empty; `--time dusk` refused by `parseTime` at the option boundary; `--border` reuses `parseBorder` (GBA's 0–1000 cap) and the GBC ceiling is enforced inside `renderGbcMap` itself (`--border 4` → GBC's own message naming its actual cap 0-3). Two renders of the same map are byte-identical (`cmp`, confirmed independently). |
| 6 | `runGbcQuery`: flag semantics mirror GBA, header fields + layout, connections, events, defect warnings | ✅ | No-flag = all three sections; `--header`/`--connections`/`--events` each select exactly one section (verified live and in tests: `Object.keys` is exactly `["header"]`/`["connections"]`/`["events"]`). Header = `GbcMap` fields minus `connections`, plus nested `layout: {blkPath, width, height, writable}`. Values match the measured pins exactly. A defect from a loader not selected by the current flags never leaks into stderr (verified: `--header` on `CeruleanCave2F` surfaces the layout defect; `--connections`/`--events` alone do not). |
| 7 | GBA paths behaviourally unchanged | ✅ | Every GBA command's body is the pre-existing code, re-indented one level inside `runGbaOnly`'s/`if (family==="gbc")...else` callback, with no logic changes — confirmed by reading each diff hunk in `index.ts`. The only observable GBA-side behaviour change is the bogus-root message (now `detectEngineFamily`'s combined message instead of `openProject`'s fieldmap.h-specific one), which the spec explicitly calls out as acceptable; confirmed 0 hits grepping `packages/cli/test`/`packages/server/test` for the old text. |
| 8 | Tests: unit, corpus, spawned e2e | ✅ | 13 tests in `gbcCommands.test.ts` (8 corpus-gated unit + 3 spawned, one of the three spawning 10 sub-cases for full refusal coverage), 3 new `resolveRoot` unit tests in `context.test.ts`. All green, 0 skipped. |
| 9 | Mutation-check (spec's 6) | ✅ | All 6 independently reproduced and confirmed red — see table below. |
| 10 | Gates (vitest subset, typecheck, full-suite baseline) | ✅ | All confirmed independently, exact same counts as the implementer's report. |

## Mutation table

Spec's 6 mutations, independently reproduced (applied, ran the suite, confirmed red, reverted, confirmed `git diff` clean):

| # | Mutation | Result |
|---|---|---|
| 1 | `warningLines` returns `""` unconditionally | ❌ caught — 3 tests red (`CeruleanCave2F: stderr carries exactly one warning...`, the pinned-message test, `--header` layout-defect test) |
| 2 | Swap family branch in `render` (`if (family === "gba")` instead of `"gbc"`) | ❌ caught — `render NewBarkTown against the real subject exits 0...` fails (spawns into the GBA path against a GBC root) |
| 3 | Remove `paint`'s `runGbaOnly` wrapper (calls `resolveProject`/`runPaint` directly) | ❌ caught — `every GBA-only command refuses...` fails specifically on `paint`, with the GBA loader's fieldmap.h error instead of the refusal |
| 4 | `--header` also sets `out.events` (`if (all \|\| opts.events \|\| opts.header)`) | ❌ caught — `--header includes no connections or events key...` fails |
| 5 | Default time flipped to `"nite"` (`opts.time ?? "nite"`) | ❌ caught — `omitting --time defaults to day, not nite` fails |
| 6 | Render writes a non-deterministic field | not independently re-injected (no timestamp/random source exists anywhere in `png.ts`/`gbcCommands.ts` to mutate into); the existing determinism test (`cmp` of two runs) was independently reproduced live and passed |

My own additional mutations:

| # | Mutation | Result |
|---|---|---|
| 7 | `--connections` also emits `out.header` (with its own `proj.layout` call and defects) | ❌ caught — `--connections only includes connections` fails (`Object.keys` gains `"header"`) |
| 8 | `runGbaOnly` writes the refusal to stderr directly and returns, instead of throwing (drops `exitCode`/process exit) | ❌ caught — the "every GBA-only command refuses..." spawn test fails on `render-world` (`expected exit 1, got 0`) |
| 9 | Query layout drops `writable` | ❌ caught — the "exact header fields" test fails, `layout` object missing the key |
| 10 | **`resolveRoot` checks `pokemap.config.json` first, falling back to `explicit` only if the config file is absent** (instead of `explicit` always winning) | ⚠️ **survives** — see Issue 1 below |
| 11 | **`index.ts`'s render-wiring line writes `stderr` to `process.stdout` instead of `process.stderr`** (`gbcCommands.ts` itself untouched) | ⚠️ **survives** — see Issue 2 below |

## Issues

**❌ Issue 1 — `resolveRoot`'s "explicit beats config" precedence is not tested when a config file exists.** The shipped code is correct (`if (explicit) return explicit;` unconditionally, before ever touching the config file), but every existing `resolveRoot` test that passes an explicit path first `chdir`s into a **fresh directory with no `pokemap.config.json` at all**, so the precedence itself is never exercised. I mutated `resolveRoot` to check the config file first and only fall back to `explicit` when the file is absent — every existing `context.test.ts` test (including the "explicit path verbatim" one) still passed, and a manual repro (chdir into a dir *with* a `pokemap.config.json`, then call `resolveRoot("/explicit/path")`) returned `/from/config` instead of `/explicit/path`. This is exactly the mutation the task asked me to check for ("resolveRoot preferring config over an explicit --project"), and it survives. Recommend adding one test: create a `pokemap.config.json` in the fresh cwd *and* pass an explicit path, asserting the explicit path wins.

**❌ Issue 2 — the `index.ts` stdout/stderr wiring for `render`/`query` (not `gbcCommands.ts`, which is correctly unit-tested) is never spawned against a map that actually produces non-empty stderr.** I mutated the render action's `if (stderr) process.stderr.write(stderr)` to `process.stdout.write(stderr)` — the full `packages/cli` test suite still passed. The only spawned e2e case for `render` uses `NewBarkTown`, whose stderr is always empty, so the pass-through of a real `stderr` string from `runGbcRender`'s result to the actual OS stream is untested end-to-end (the unit-level `runGbcRender`/`runGbcQuery` return values are correctly checked, but the one-line write in `index.ts` itself is not). The same gap exists for `query`'s wiring. The shipped code is correct by inspection; this is a coverage gap, not a functional bug. Recommend one more spawned test: `render CeruleanCave2F` (or `query CeruleanCave2F --header`) via `spawnCli`, asserting the warning text lands on `stderr` and not `stdout`.

Both issues are test-coverage gaps in code that is, on inspection and on every other test I ran, correct. No production-code defect was found.

## Minors

- The implementer's e2e test count ("3 tests only") is honored by the letter (3 `it()` blocks) but one of them spawns 10 subprocesses internally to cover every GBA-only refusal. This is a reasonable, well-justified deviation (documented in both the implementer report and the test file's own comment) and I verified it does close the `paint`-refusal gap the mutation-check exists to catch; noting it only because a stricter reading of "3 tests" might expect 3 total spawns, not 3 `it()` blocks with more than 3 total spawns underneath.
- `runGbcRender`'s `time?.: TimeOfDay` defaulting inside the handler (`opts.time ?? "day"`) duplicates commander's own `("day")` default on the `--time` option. Both are correct today and the duplication is deliberately documented (keeps the thin handler correct when called directly from a test), so this is not a defect — just a small redundancy worth knowing about if the two default values are ever changed independently.

## Verdict

**❌ ISSUES (2)**

Both issues found are test-coverage gaps (mutations that survive due to missing test cases), not defects in the shipped production code — every deliverable, GBA-behavior-neutrality check, live CLI run, measured pin, and gate I independently verified was correct. Recommend the implementer add the two tests named above (explicit-path-wins-over-existing-config; stderr-through-`index.ts`-wiring for a defect-bearing map) before closing out Task 10, since the task's own mutation-testing directive treats a surviving mutation as an issue regardless of cause.
