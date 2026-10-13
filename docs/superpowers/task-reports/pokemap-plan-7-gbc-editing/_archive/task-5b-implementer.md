# Task 5b implementer report: GBC in-context editing on World

**Status: READY_FOR_REVIEW_WITH_CONCERNS.** Implementer verification is complete; independent reviews, their combined fix round, coordinator live write verification, and the full gate remain pending. Continued on 2026-10-08 in `C:/Programming Projects/PokeMap`, branch `plan-7-gbc-editing`, using the current explicitly selected standard-equivalent Codex model as requested (Sonnet unavailable). No subagents dispatched.

## Scope and interruption recovery

Read `task-5b-spec.md` first, then Task 5's archived executed spec, implementer/coordinator records, binding `packages/ui/DESIGN.md`, the required GBA E4 spec/coordinator/spec-review/quality-review records, and RESUME's Phase E lessons. Read the actual Task 5b production files and new tests, Task 5's edit-session/map hooks, and the GBA `contextView`, `MapCanvas`, `MapEditingWorkspace`, `WorldCanvas` context/entry sections and `App` wiring. Loaded frontend-design, TDD and verification skills; the user's restrictions take precedence, including no full suite and preserving existing code.

Initial HEAD was `ede8df3`. Initial tracked status contained exactly one modified file: `packages/ui/test/gbc/GbcAppContext.test.tsx`, a 31-line additive alignment test. `.codex/` was already untracked and left untouched. The coordinator-owned untracked `codex-resumption.md` appeared during verification and was also left untouched.

The pending test was **intended regression coverage, not a leftover mutant**:
- Its diff only adds an integration test and temporary Canvas2D recording stub; no production source was modified.
- It independently derives world pan `(-330,-60)` for OlivinePort at placement `(10,0)`, size `10x10`, pointer `(150,100)`, scale `32`. The world map starts at `(-10,-60)`; a one-block border ring means composite draw origin `(-42,-92)`.
- The full app-context file passed 15/15 before committing.
- X7 made exactly this test fail: observed `[-10,-60]` instead of `[-42,-92]`. After in-memory byte restoration, it passed again.
- The test restores its original `getContext` method in `finally`.

No production fix or feature work was added during this continuation. Final `git diff --exit-code ede8df3 -- packages/ui/src` passed: **all production source remains byte-identical to the frozen implementation being quality-reviewed**. The only new changes are the inherited alignment test, a correction to the old DESIGN context-menu paragraph, and this report.

## Commits

Preserved original implementation range `9ce8b45..ede8df3`:

| Commit | Content |
|---|---|
| `d35e6d6` | Parameterize contextView native scale for GBC, default 16 for GBA; GBC math tests |
| `1cf5630` | Controlled GbcMapCanvas view and chromeless mode; view tests |
| `77be233` | GbcWorldCanvas Edit here, overlay, snap, exits and tile refresh; context tests |
| `a8be018` | GbcApp context wiring and shared GbcMapEditing canvas seam; app-context tests |
| `ede8df3` | GBC in-context DESIGN entry |

Continuation green steps, committed with explicit pathspecs:

| Commit | Paths and validation |
|---|---|
| `6c8ccd4` — test(ui): prove GBC context border-ring alignment | Only `packages/ui/test/gbc/GbcAppContext.test.tsx`; full file 15/15, X7 green/red/green, byte restoration verified |
| `6f71cea` — docs(ui): align GBC context menu design with Task 5b | Only `packages/ui/DESIGN.md`; correct the older claim that GBC Edit here is permanently disabled; world-context suite 36/36 |
| This report's pathspec commit | Only `docs/superpowers/task-reports/pokemap-plan-7-gbc-editing/task-5b-implementer.md`; typecheck/build and verification complete before commit |

No checkout, restore, stash, broad staging, source rewind, push, servers, external corpus writes, or independent fix rounds.

## Implementation and spec coverage

1. `contextView.ts` retains native 16 defaults and accepts native 32. GBC tests pin snap levels 32/64/128 -> 1/2/4, threshold cases, pointer-centered entry, literal forward/inverse conversions, and round trips across placements/pans/zooms. Existing GBA math tests are unchanged.
2. `GbcMapCanvas` uses the GBA controlled-view pattern: current view and callback refs, one update path, no auto-fit when controlled. Wheel/pan report changes; the supplied view drives the blit. Chromeless hides toolbar, legend and status. `GBC_COMPOSITE_ORIGIN = BORDER_RINGS * BLOCK_PX` derives the ring origin.
3. `GbcWorldCanvas` supplies enabled Edit here only when the host supports it. Plain body double-click enters, Shift opens Map view, warp markers retain preview precedence, and drag/Ctrl/Meta guards prevent context entry. The overlay fills the existing viewport and has dim layer, labeled bar, 1x/2x/4x and Done.
4. Entry records client coordinates and waits for origin/chrome readiness before reading the current canvas box. Snapped state gates the overlay canvas. View changes convert with native 32 in both directions. World context bounds reach 128; an exited high zoom does not jump down on wheel-in, matching the corrected GBA template.
5. Escape uses capture, checks modal/menu/defaultPrevented/text-field guards, and refocuses the world canvas on clean exit. Outside-map double-click requests exit; the bar and inside-map double-click do not.
6. World host/chrome maintain the same canvas DOM node and body slot. App tests count world fetches across entry; the component test also covers entry/exit. App's separate visibility and canvas world fetches remain the deliberate baseline behavior.
7. `GbcApp` keeps session at app level and context selection guarded. Dirty Done/Escape opens SaveDialog and stays; Cancel keeps context. Commit calls markClean, bumps only the saved map's version, and refetches its payload. Mode switches clear context without prompting and retain dirty session. Tree changes use the existing dirty guard; same-map tree clicks also exit.
8. `GbcMapEditing` assembles editing props once for Map and context through `renderCanvas`; conditional chrome preserves the world slot. Existing palette/inspector rail remains.
9. Tile version changes delete one cache entry and retain `&v=n` on future loads and time changes. Read-only verification of server wiring found `gbcEditRoutes` calling `hooks.onCommit()` in commit's `finally`, with `gbcRoutes` clearing renderCache/warpCache/coverageCache. No server test or live PNG write was performed here.

### Existing-test change audit

Compared to `9ce8b45`, **GBA test files changed: 0; GBA removed lines: 0**. The all-test removed-line count is 13, entirely inherited and named:

- `test/gbc/GbcApp.test.tsx`: 2 removed lines, replacing the legacy plain-double-click Map-view expectation with Shift+double-click; plain double-click now edits in place.
- `test/gbc/GbcWorldCanvas.test.tsx`: 11 removed lines, replacing disabled/hinted Edit here expectations with enabled callbacks and supplying `onEditHere` where the menu is expected to contain it.

Both changed legacy suites passed. The new GBC math file is additive; all other inherited Task 5b test files are new. The continuation adds 31 lines to the new app-context file and removes none.

## Tests and build

All test execution was serialized: **one file per Vitest invocation**, no concurrent test subprocesses. No directory-wide or full repository run. Commands used:

```text
node node_modules/vitest/vitest.mjs run <exact file>
node node_modules/vitest/vitest.mjs run <exact file> --reporter=json
node node_modules/vitest/vitest.mjs run <exact file> --reporter=json -t "<witness>"
npm run typecheck
npm run build -w @pokemap/ui
```

Full-file results (paths relative to `packages/ui/test/`):

| Suite | Passed | Failed |
|---|---:|---:|
| `gbc/GbcAppContext.test.tsx` | 15 | 0 |
| `world/contextView.test.ts` | 16 | 0 |
| `world/contextViewGbc.test.ts` | 14 | 0 |
| `gbc/GbcMapCanvasView.test.tsx` | 9 | 0 |
| `gbc/GbcWorldCanvasContext.test.tsx` | 36 | 0 |
| `gbc/GbcApp.test.tsx` | 33 | 0 |
| `gbc/GbcWorldCanvas.test.tsx` | 121 | 0 |
| `gbc/GbcMapCanvas.test.tsx` | 53 | 0 |
| `gbc/GbcMapCanvasEdit.test.tsx` | 21 | 0 |
| `gbc/GbcMapEditing.test.tsx` | 8 | 0 |
| `gbc/GbcAppEditing.test.tsx` | 7 | 0 |
| `gbc/GbcAppWorldGuard.test.tsx` | 7 | 0 |
| `gbc/useGbcEditSession.test.tsx` | 14 | 0 |
| `MapCanvas.test.tsx` | 62 | 0 |
| `WorldCanvasContext.test.tsx` | 37 | 0 |
| `AppContextEdit.test.tsx` | 12 | 0 |
| `MapEditingWorkspace.test.tsx` | 6 | 0 |
| `MapEditingWorkspaceActive.test.tsx` | 3 | 0 |
| `styles.test.ts` | 7 | 0 |
| `stylesContext.test.ts` | 5 | 0 |

**20 distinct focused suites, 486 tests passed, 0 failed.** The table counts each full-file run once; mutation-selected repetitions are additional and listed below. The 18-file serial regression runner accounted for 455 passes; app-context contributed 15 and the restored GBA math run 16.

- `npm run typecheck`: exit 0, core/base and UI TypeScript checks.
- `npm run build -w @pokemap/ui`: exit 0; Vite 8.2.2, 73 modules; generated UI dist output.
- `git diff --check` for scoped changes: exit 0.
- Initial full app-context run emitted jsdom's expected “HTMLCanvasElement's getContext() method” unsupported-canvas diagnostics in tests without Canvas2D stubs. All 15 tests passed. The alignment witness supplies its own recording stub and emitted no warnings. The 18-file regression runner reported no warning lines.

TDD provenance: this continuation introduced no production fixes. The inherited alignment test was verified against existing behavior and red-proved with X7 before commit. Original implementation red-first history could not be independently recovered from the unavailable Claude agent; no claim is made that every historical change was test-first. The mutation checks provide fresh, observed test teeth.

## Required mutation proof

No mutation harness file was written. A Node script passed through a PowerShell literal here-string executed one witness at a time with `spawnSync`. For each mutant it:
1. Ran the same witness unmutated and asserted exit 0, success, and a nonzero selected-test count.
2. Read original source bytes into a Buffer in memory and asserted UTF-8 round-trip identity.
3. Asserted **each literal anchor occurs exactly once**, preserving existing line endings.
4. Wrote the mutation, ran only its exact suite/witness, and retained exit status plus named assertion failures.
5. In `finally`, wrote the original Buffer back and compared the reread bytes with Buffer.equals.
6. Reran the witness after restoration and required green.
7. Cross-checked planned IDs against the spec's X table, reported IDs against each requested batch, then all eight reported IDs against X1–X8. Final SHA-256 checks matched every mutated source's pre-mutation bytes.

**Required: 8; reported: 8; killed: 8; survivors: 0; missing/duplicate IDs: 0.** Every mutant run exited 1 with an intended test failure; every before/after run exited 0.

| ID | Exact mutation | Witness and observed result | Before / mutant / restored |
|---|---|---|---|
| X1 | `contextView.ts`: unique `const NATIVE = 16;` -> `const NATIVE = 32;` | Entire unchanged GBA `world/contextView.test.ts`; 11 assertion failures, detailed below | 16 pass / 5 pass + 11 fail / 16 pass |
| X2 | `GbcWorldCanvas.tsx`: only the forward `mapViewFromWorld({ placement: validContextPlacement, worldPan: pan, worldZoom: zoom, originX: contextOrigin.x, originY: contextOrigin.y, native: BLOCK_PX })` invocation changed to `native: 16` | `gbc/GbcWorldCanvasContext.test.tsx -t "snaps the world once"`; observed `{zoom:2,pan:{x:-124,y:-124}}`, expected `{zoom:1,pan:{x:-92,y:-92}}` | 1 pass / 1 fail / 1 pass |
| X3 | `GbcApp.tsx`: unique `key="world"` -> `key={contextMap ?? "world"}`, remounting on entry | `gbc/GbcAppContext.test.tsx -t "double-clicking a map in World shows"`; captured world canvas and new canvas fail Object.is identity | 1 pass / 1 fail / 1 pass |
| X4 | `GbcWorldCanvas.tsx`: unique add/remove `window.*EventListener("keydown", onKeyDown, true)` anchors both changed to `false` | `gbc/GbcWorldCanvasContext.test.tsx -t "Escape is judged in the capture phase"`; exit spy called 1 time, expected no calls after document listener removed modal | 1 pass / 1 fail / 1 pass |
| X5 | `GbcApp.tsx`: unique `if (session.isDirty) setSaveOpen(true); else setContextMap(null);` block -> unconditional `setContextMap(null);` | `gbc/GbcAppContext.test.tsx -t "Done opens the SaveDialog"`; unable to find dialog named “Save changes” after dirty Done | 1 pass / 1 fail / 1 pass |
| X6 | `GbcWorldCanvas.tsx`: unique `imageCacheRef.current.delete(map);` -> `imageCacheRef.current.clear();` | `gbc/GbcWorldCanvasContext.test.tsx -t "a bumped version re-requests exactly that map"`; 4 image requests observed, expected 3 (all tiles refreshed instead of one) | 1 pass / 1 fail / 1 pass |
| X7 | `GbcMapCanvas.tsx`: unique `export const GBC_COMPOSITE_ORIGIN = BORDER_RINGS * BLOCK_PX;` -> `export const GBC_COMPOSITE_ORIGIN = 0;` | `gbc/GbcAppContext.test.tsx -t "the overlay composite lines up under the world tile"`; composite draw `[-10,-60]`, expected `[-42,-92]`; world draw expectation still passed | 1 pass / 1 fail / 1 pass |
| X8 | `GbcWorldCanvas.tsx`: unique Edit here item `({ label: "Edit here", onSelect: () => requestEditHere(map, menuPointRef.current) })` gained `disabled: true` | `gbc/GbcWorldCanvasContext.test.tsx -t "the context menu's Edit here is enabled"`; disabled observed true, expected false | 1 pass / 1 fail / 1 pass |

X2 mutates the real GBC caller, rather than just a pure helper test. X6 changes the real cache invalidation to refetch every visible tile, the observable behavior required by the spec. X7 uses the real App -> WorldCanvas -> controlled MapCanvas path, proving the exported border origin is actually wired into alignment.

### X1 exact failing cases

| Case in unchanged GBA math suite | Observed vs expected |
|---|---|
| Snap 23 px/tile | 1 vs 2 |
| Snap 45 px/tile | 1 vs 2 |
| Snap 46 px/tile | 2 vs 4 |
| Enter z=2, placement (10,20) 30x20, pointer (200,150) | zoom 64 vs 32; pan (-1400,-1770) vs (-600,-810) |
| Enter z=1, placement (3,4) 5x7, pointer (100,100) | zoom 32 vs 16; pan (-76,-140) vs (12,-20) |
| Enter z=4, placement (0,0) 3x3, pointer (50,60) | zoom 128 vs 64; pan (-142,-132) vs (-46,-36) |
| Round pan for pointer (100.5,100.5) | (-75,-139) vs (13,-19) |
| Forward p=(10,20), origin (32,32), worldZoom 32 | zoom 1 / pan (293,601) vs zoom 2 / pan (261,569) |
| Forward p=(0,0), origin (16,32), worldZoom 16 | zoom 0.5 / pan (92,34) vs zoom 1 / pan (84,18) |
| Forward p=(-3,2), origin (48,32), worldZoom 64 | zoom 2 / pan (-298,71) vs zoom 4 / pan (-394,7) |
| Inverse view {2,(261,569)}, p=(10,20), origin (32,32) | zoom 64 / pan (-315,-647) vs zoom 32 / pan (5,-7) |

The unchanged round-trip test survives X1 because mutually consistent wrong scales remain inverses; literal GBA fixtures catch the compatibility regression. No surviving required mutant follows from that algebraic equivalence.

### Byte-restoration evidence

Pre-mutation SHA-256 values, matched after all experiments:

| Production file | SHA-256 |
|---|---|
| `src/world/contextView.ts` | `c8e7c81ecd6530747304c990a03248ca1a6af8fe1a01796901bce5475628929f` |
| `src/gbc/GbcMapCanvas.tsx` | `5823ba0f56812be2f9a67d4a91029802746f21418d2961216576cee9a7e99766` |
| `src/gbc/GbcWorldCanvas.tsx` | `95ab2171e65e9d555c3e50ae9a8e9b15caf7b052dd3622cbe0e67a03849f6599` |
| `src/gbc/GbcApp.tsx` | `d61493c1328fcb540c39b914c3c1b3524900bbeac1eb58b596a6a758a30aef58` |

## Concerns and handoff

- No implementer live browser/server run or corpus writes. Coordinator reports scratch servers 5184/5183 working and a no-write live smoke; that is coordinator-owned evidence, not an implementer verification claim. Pixel alignment at a real flex layout, paint/save PNG freshness, reverse-paint exact restoration, PerfPlus clean state/no .pokemap, and the full gate still belong to the coordinator.
- The alignment fixture deliberately uses world placement 10x10 and a smaller 2x1 map payload. It proves the shared top-left translation and ring subtraction, not matching full map extents or actual browser pixels.
- The inherited app paint test starts with an already-dirty session and synthetic negative client coordinates. It proves edit-route wiring and begin-before-apply plus eventual end, but does not independently prove clean-to-dirty or pin the apply body/end ordering. Its “Discard first” comment does not correspond to a discard action. The existing 21-test canvas-edit suite separately passes the delayed-begin paint race checks. Independent reviewers/coordinator should retain their end-to-end paint checks.
- Required deferrals retained: cramped world toolbar at 1024px; Grid/Collision (and Events/Encounters) toggles unreachable in context; blank tile until its image loads. The existing image loader has no onerror recovery. No extra feature scope was added.
- No new production TDD fix cycle was needed. Historical Claude red-first logs are unavailable; fresh mutation outcomes are recorded above without inventing their history.
- **No further implementer test processes are running.** Mutation and single-file test checks finished before the coordinator starts the high-risk spec review. Typecheck and build also completed.
- Keep this report active until independent spec and quality reviews pass. The user requires any combined review fix round to continue on this same chat/handle; do not dispatch a replacement implementer. No independent fix round was performed. Per latest steering, any newly discovered surviving mutant is to be reported to the coordinator for combined feedback, not fixed in an independent round.
- `.codex/` and coordinator-owned `codex-resumption.md` remain untracked and untouched. Only allowed UI paths and this report were authored/committed.

