# Plan 6b Task 3: implementer report

Executed against `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/task-3-spec.md`, on branch `plan-6b-gbc-app-layer`, working directly in the repo (no worktree). Read the plan (`docs/superpowers/plans/2026-09-25-pokemap-plan-6b-gbc-app-layer.md`, Q2/Q3 and the Task 3 row), `packages/ui/DESIGN.md`, RESUME's UI lessons, and `_archive/task-1b-implementer.md` for the `/api/groups` contract before writing any code. `frontend-design`/`ui-ux-pro-max` are not installed in this environment; the shell was built directly against `DESIGN.md`'s tokens, type ramp and layout shape, as the spec and plan both require, and recorded here per that instruction.

## What was built

- **`packages/ui/src/gbc/guards.ts`** -- `isProjectInfo(x): x is ProjectInfo` (imports `ProjectInfo` from `@pokemap/core/src/family.js`; `family` checked against the exact literals `"gba"`/`"gbc"`, `root` checked `typeof === "string"`) and `isMapGroupsData(x): x is MapGroupsData` (`groupOrder` a real `string[]`, `groups` a plain object whose values are all `string[]`, and every `groupOrder` entry present as an own key of `groups`). Both are pure, no side effects, ready for Task 4+ to add `isGbcMapPayload` etc. to the same file.
- **`packages/ui/src/hooks/useProjectInfo.ts`** -- fetches `/api/project` once, following `useMapGroups.ts`'s exact shape (`cancelled` guard, `data`/`error` state). A non-OK status, a thrown fetch, or a shape that fails `isProjectInfo` all become a real `error` string; a bad shape's message names the received value (`JSON.stringify`, truncated to 200 characters), never a silent `.catch`.
- **`packages/ui/src/gbc/useGbcGroups.ts`** -- the same pattern against `/api/groups`, guarded with `isMapGroupsData`.
- **`packages/ui/src/Root.tsx`** -- calls `useProjectInfo()` and renders: loading -> `<p className="app__canvas-placeholder">Loading project…</p>` inside a minimal `.app` wrapper; error -> `role="alert"` text `Could not open project: <error>`; `gba` -> `<App/>` unchanged; `gbc` -> `<GbcApp root={data.root} />`.
- **`packages/ui/src/main.tsx`** -- now mounts `<Root/>` instead of `<App/>`. This is the only change to an existing file besides `styles.css`; `App.tsx` itself is untouched (verified below).
- **`packages/ui/src/gbc/GbcApp.tsx`** -- the GBC shell:
  - Header (`app__toolbar`): `PokeMap` title, a `Crystal` family tag (`gbc-app__family`, `--font-data`, `--text-secondary`); a `Map`/`World` group (`role="group" aria-label="View"`, `map-canvas__btn`, `aria-pressed`, reusing `App.tsx`'s own pattern exactly); a `Morn`/`Day`/`Nite` group (`role="group" aria-label="Time of day"`, same button convention, default `"day"`); the selected map name (`app__status`), shown only in Map view when a map is selected.
  - Sidebar: `MapTree` fed by `useGbcGroups`, with loading/error text mirroring `App.tsx:447`/`:474` verbatim (`Could not load map groups: <error>` / `Loading map groups…`).
  - Main area (`app__canvas`): Map view with no selection -> `Select a map`; Map view with a selection -> `<p className="app__canvas-placeholder" data-testid="gbc-map-placeholder">{selected} · {time}</p>`; World view -> `<p className="app__canvas-placeholder" data-testid="gbc-world-placeholder">World view (Task 5)</p>`.
  - State owned here: `mode`, `time`, `selected`, and `selectVersion` (bumped on every tree click, unused by this task's own placeholders -- kept for Task 5's `jumpToken`, mirroring `App.tsx`'s own `selectVersion`).
  - Mounts none of `Toolbar`/`SaveDialog`/`EventInspector`/`DungeonSidebar`/`SignComposer`/`CollisionPalette`/`MetatilePalette`, and no `beforeunload` handler.
- **`packages/ui/src/styles.css`** -- one small additive block after `.app__mode`: `.gbc-app__family` (data font, `--text-secondary`) and `.gbc-app__time` (extra `margin-left: var(--space-3)` for the gap between the View and Time-of-day groups; the Time group also carries `.app__mode` for its base flex/gap/button styling, reused directly as the spec asks).

Every new class name is either an exact reuse (`app`, `app__toolbar`, `app__title`, `app__body`, `app__sidebar`, `app__canvas`, `app__canvas-placeholder`, `app__status`, `app__mode`, `map-canvas__btn`, `map-tree__empty`) or a new `gbc-app__*`-prefixed one (`gbc-app__family`, `gbc-app__time`). No `.btn` class anywhere. Every CSS custom property used (`--font-data`, `--text-secondary`, `--space-3`) is a real token from `styles.css`'s `:root`; no known-wrong name (`--border-default`, `--bg-panel-elevated`, `--accent-primary`, `--warning`, `--radius-sm`) appears anywhere in the new code.

## `App.tsx` and existing files

`git diff --stat` after the whole task touches only `packages/ui/src/main.tsx` (2 lines) and `packages/ui/src/styles.css` (16 lines added); every other change is a new file under `packages/ui/src/gbc/`, `packages/ui/src/hooks/useProjectInfo.ts`, `packages/ui/src/Root.tsx`, and `packages/ui/test/gbc/`. `App.tsx` and every existing component/test file are byte-identical to `HEAD` before this task, and the full GBA UI test suite (`App.test.tsx`, `MapCanvas.test.tsx`, `WorldCanvas.test.tsx`, `MapTree.test.tsx`, etc.) passes unchanged.

## Commit SHAs

- `297d76d` -- `feat(ui): family bootstrap (Root) and GBC shell (GbcApp)` (the full implementation: guards, hooks, Root, GbcApp, styles, and the first 39 tests)
- `f3900a4` -- `test(ui): isolate isMapGroupsData's string-array check from its key-exists check` (one additional guard test discovered during the mutation pass, see below)

## Test counts

- Baseline (measured fresh at session start, before any of this task's changes): **1374 passed**, the same 6 known failures as `baseline-fails.txt`.
- After this task: **1414 passed**, same 6 known failures. Net **+40**: `guards.test.ts` (15), `useProjectInfo.test.ts` (5), `useGbcGroups.test.ts` (4), `GbcApp.test.tsx` (10), `Root.test.tsx` (6).
- `packages/ui` alone: 26 test files, 295 passed (was 255 before this task's 40 new tests minus... actually 255+40=295, all green, including every existing `App.test.tsx`/`MapCanvas.test.tsx`/etc. file unchanged).

## Gate result

```
npm test 2>&1 | tee /tmp/.../t3-test-2.log
grep -E "^ FAIL " t3-test-2.log | sort -u | diff - baseline-fails.txt
```
`diff` is empty -- exactly the same 6 pre-existing failures:
```
 FAIL  packages/core/test/config/engine.test.ts > engineProfile > parses pokefirered's real porymap.project.cfg
 FAIL  packages/core/test/config/engine.test.ts > engineProfile > parses the subject repo's real porymap.project.cfg
 FAIL  packages/core/test/load/blocks.test.ts > parseBlocks > encodeBlocks is the exact inverse of parseBlocks, every layout, both files
 FAIL  packages/core/test/load/blocks.test.ts > parseBlocks > the three fields are independent -- a wrong shift moves them together
 FAIL  packages/core/test/render/layout.test.ts > renderLayout > supportsLayoutVersion survives a Porymap save that deletes layout_version keys
 FAIL  packages/server/test/world.test.ts > world api > manual is true iff the map name is a key in sidecar.manualPlacements, for every placement (Feature A)
```
`Tests 6 failed | 1414 passed (1420)` -- 1374 + 40 = 1414. ✓

`npm run typecheck` (`tsc --noEmit` on both `tsconfig.base.json` and `packages/ui/tsconfig.json`): clean, no output.

## Mutation table

Mutated the real source (`packages/ui/src/gbc/guards.ts`), confirmed red against `packages/ui/test/gbc/guards.test.ts` (and, for the two spec-named mutations, the full `packages/ui/test/gbc` directory), then restored from a golden copy saved via `git show HEAD:packages/ui/src/gbc/guards.ts`; `git diff packages/ui/src/gbc/guards.ts` was empty after every restore, confirmed explicitly each time.

| # | Mutation | Verdict | Killed by |
|---|---|---|---|
| 1 | `isProjectInfo`: widen `family === "gba" \|\| family === "gbc"` to `typeof family === "string"` | KILLED | "rejects a family that isn't exactly gba or gbc" |
| 2 | `isProjectInfo`: drop the `root` string check entirely | KILLED | "rejects a non-string root" |
| 3 | `isMapGroupsData`: weaken `groupOrder` check from `isStringArray` to plain `Array.isArray` | KILLED (after one test fix -- see below) | new test: a non-string `groupOrder` entry that numerically coerces to a real key |
| 4 | `isMapGroupsData`: drop the `Array.isArray(groups)` exclusion (`typeof "object"` alone) | KILLED | "rejects a non-plain-object groups" |
| 5 | `isMapGroupsData`: weaken each `groups[key]` check from `isStringArray` to plain `Array.isArray` | KILLED | "rejects a groups value that isn't string[]" |
| 6 | `isMapGroupsData`: drop the "every `groupOrder` entry is a key of `groups`" loop entirely (the spec's named mutation) | KILLED | "rejects a groupOrder entry that is not a key of groups" |

**Mutation 3 initially survived** with the test suite as first written: my original test for a non-string `groupOrder` entry was `["OLIVINE", 5]` against `groups: { OLIVINE: [] }` -- with the `isStringArray` check removed, `5` still failed the *separate* "is `groupOrder[i]` a key of `groups`" check (`groups` has no key `"5"`), so that mutation was caught by the wrong clause, not the one it targeted. I added a case designed to isolate the two clauses from each other: `{ groupOrder: [5], groups: { "5": ["x"] } }` -- since JS object keys are always strings, `Object.prototype.hasOwnProperty.call(g, 5)` coerces `5` to `"5"` and would pass if the string-array check on `groupOrder` were missing, so a payload with a *bare number* that happens to match a real (string) key in `groups` can only be caught by the `groupOrder`-is-`string[]` check itself. With that test added, mutation 3 died. This is a genuine, honestly-reported test gap I found and fixed while mutation-testing, not a pre-existing hole I left open -- both the original test file and this fix are in commits `297d76d`/`f3900a4`.

Every clause of both guards is independently killed. No mutation survives.

## Live-verify narrative

Confirmed ports 5173/5174 free before starting (a Node `net.createServer().listen()` probe on both, since `ss` isn't installed). Started the GBC server (`npx tsx packages/server/src/serve.ts --gbc`, reads `pokemap.config.json`'s `gbc.projectPath`, `/root/pokemap-corpus/pokecrystal-PerfPlus`) and Vite (`npm run dev --workspace=@pokemap/ui`) in the background, waited for both to report ready, then drove a real Chromium via Playwright (`import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs"`, viewport 1280×800) from a script in the scratchpad.

**GBC run:**
- `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/screens/task-3-gbc-shell.png` -- the loaded shell. I opened this and looked at it: dark theme (`--bg-app`/`--bg-panel`), `PokeMap` title with a small monospace `Crystal` tag beside it, the View group (`Map` pressed, `World` not) and the Time-of-day group (`Day` pressed, `Morn`/`Nite` not) both rendered as the same bordered pill buttons `App.tsx`'s own Map/World/Dungeon switch uses. The sidebar shows real Crystal group names in `newgroup` order -- `OLIVINE` (14 maps: `OlivinePokecenter1F`, `OlivineGym`, ..., `OlivineCity`), `MAHOGANY` (7 maps), `DUNGEONS` (91 maps) partially visible below -- matching the `/api/groups` contract Task 1b's report pinned. The canvas shows the `Select a map` placeholder, centered, in the data font.
- `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/screens/task-3-gbc-nite-selected.png` -- after clicking `Nite` then `OlivinePokecenter1F` in the tree. I looked at this too: `Nite` is now the pressed button (accent-selected background/border), the header status span reads `OlivinePokecenter1F`, the sidebar row for `OlivinePokecenter1F` is highlighted with the selected-row treatment (`--bg-selected`/bold text), and the canvas placeholder reads exactly `OlivinePokecenter1F · nite` -- proving both `time` and `selected` reach the view together, as Task 3's placeholder is meant to pin ahead of Task 4's real canvas.

**GBA run:** killed the GBC server, restarted with no flag (`serve.ts` fell back to `pokemap.config.json`'s plain `projectPath`, `/home/user/pokemon-three-region`, confirmed via the server's own startup log and a `curl /api/project` returning `{"family":"gba",...}`), Vite left running.
- `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/screens/task-3-gba-shell.png` -- today's unchanged GBA app: `PokeMap` title (no family tag -- `App.tsx` never had one), the real `Map`/`World`/`Dungeon` three-way switch, the `TownsAndRoutes` group (38 maps: `NewBarkTown`, `CherrygroveCity`, ..., `Route46`+), `Select a map` placeholder. No `Crystal` tag, no Time-of-day group -- exactly `App.tsx`'s own markup, since `Root` mounted `<App/>` unchanged.
- `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/screens/task-3-gba-map-open.png` -- after clicking `NewBarkTown`: the full GBA editing chrome is present and untouched -- the `Toolbar` (`Pencil`/`Rect`/`Bucket`/`Dropper`/`Shift`/`Collision`, `Undo`/`Redo`, `Add Sign`, `Save`/`Discard Changes`), zoom controls (`1×`/`2×`/`4×`/`Fit`) and overlay toggles (`Grid`/`Collision`/`Elevation`/`Events`), the rendered map itself (houses, trees, water, NPC sprites), the `EventInspector` panel (`No event selected.` / `Add Event`), and the status strip (`layout_version hns · split metatiles 640 · tiles 640 · pals 7`). This is the real, unmodified GBA app rendering a real map, proving `Root` routing an `App` mount all the way through is indistinguishable from mounting `App` directly.

Killed both server and Vite processes afterward (`vite`'s own child process needed a direct `kill` on its PID after the pattern-match `pkill` missed the `sh -c vite` wrapper's child). Re-probed both ports with the same Node `net.createServer()` check: **5173 FREE, 5174 FREE**, confirmed after the kill.

## Deviations from the spec

1. **Hook file locations follow this task's own §2/§4 paths literally, not the plan's higher-level file-structure table.** The plan's own file-structure table (`docs/superpowers/plans/2026-09-25-...md`) lists `packages/ui/src/gbc/hooks/{useProjectInfo,...}.ts`, but `task-3-spec.md` §2 explicitly places `useProjectInfo.ts` at `packages/ui/src/hooks/useProjectInfo.ts` (the existing top-level hooks directory, alongside `useMapGroups.ts`/`useMapLayout.ts`), and §4 places `useGbcGroups.ts` directly at `packages/ui/src/gbc/useGbcGroups.ts` (not under a `gbc/hooks/` subdirectory). Per "Re-granularise each task against the real code right before executing it" and the binding-spec framing of this task's own brief, I followed the executed spec's literal paths, not the plan's earlier, less-granular sketch. Both hooks are trivially reachable regardless of which directory holds them; nothing about their behaviour or tests depends on the choice.
2. **`GbcApp`'s `root` prop is accepted but not yet read.** The spec's Task 3 deliverable list never has the shell render anything from `root` (Tasks 4/5 need it for `GbcMapCanvas`/`GbcWorldCanvas`), so it's threaded through from `Root` and held on the props (named `_root` in the destructure to make the "intentionally unused for now" explicit) rather than invented a use for it. `noUnusedParameters`/`noUnusedLocals` are not set in either `tsconfig.base.json` or `packages/ui/tsconfig.json`, so this compiles cleanly either way.
3. **One extra guard test added beyond the spec's two named mutations**, found while mutation-testing clause 3 (`isStringArray(o.groupOrder)`) in isolation -- see the mutation table's note above. This is a strengthening of the test suite, not a scope change; both the original 39 tests and this one extra test are committed.

No other part of the spec's routing table, state shape, class-reuse list, or test-pinning instructions was found to conflict with the real code once checked directly against `App.tsx`, `MapTree.tsx`, `useMapGroups.ts`, `useMapLayout.ts`, and `styles.css`.
