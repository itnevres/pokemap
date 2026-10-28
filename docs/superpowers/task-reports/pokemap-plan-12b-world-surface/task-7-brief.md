# Plan 12b Task 7 brief: GBC world canvas onto `WorldSurface` (High)

You are the implementer. Work only in this worktree. Do not run vitest, npm, or vite: the sandbox cannot (esbuild "Access is denied"). The conductor runs every check. Do not commit.

## Read first (in this order)

1. `docs/superpowers/plans/2026-10-26-pokemap-plan-12b-world-surface.md`: Global Constraints, Review Focus, and **Task 7** (your spec). Task 6's paragraph explains the surface you plug into.
2. `docs/superpowers/specs/2026-10-24-pokemap-plan-12-shared-canvas-core-design.md`: rulings P12-3, P12-4a, e, i, j, m, q, t, u, P12-5, P12-6, P12-7, and "What stays per family".
3. `docs/superpowers/task-reports/pokemap-plan-12b-world-surface/_archive/task-6-impl-notes.md`: every adapter field Task 6 added, the family differences kept as adapter facts (GBC is "the block-based canvas": `saveErrorPolicy: "per-map"`, `pruneSelectionOnFilter: true`, guarded `dropSize`, `modifiedDoubleClick`, `overlayOrder` warps/connections/lens/spotlight/selection/jump/marquee, `toolbarAfterEncounter`, no `wrapToasts`, no `draggingMapClass`, `unresolvedWarpError` where GBC had one).
4. `packages/ui/src/canvas/WorldSurface.tsx`, `canvas/worldSurfaceAdapter.ts` (the contract), and `test/canvas/WorldSurface*.test.tsx` (fake adapters showing how fields are used).
5. `packages/ui/src/gbc/GbcWorldCanvas.tsx` (the code you move) and `gbc/mapSurface.tsx` (12a's GBC map adapter: the style to copy for a GBC adapter file).

## Scope

- Create `packages/ui/src/gbc/worldSurface.tsx`: the GBC `WorldSurfaceAdapter` (32 px block `nativePx`, `?time=` image URLs, `cacheKey = time`, `useWorld` wrapping `useGbcWorld`, one-map placement POST, dungeon POST, indoor/gate `drawnByDefault`, `warpOffset` 1/2 (GBC `w.x / 2` blocks), `fetchWarps` with the `payload.mapName` check and `destEvent` endpoints, no `drawExtraLayers`, GBC conflict tooltip, encounter fetch with `summariseGbc` and time dimming via `border.time`, coverage, lens legend, block-dimension status items exactly as today's text, toolbar extras and `toolbarAfterEncounter` groups exactly as today's DOM).
- Rewrite `packages/ui/src/gbc/GbcWorldCanvas.tsx` as a thin wrapper: **same export name, same props type**, renders `WorldSurface` with the adapter. Anything props-dependent (time, callbacks) is built in the wrapper with `useMemo` or passed through surface props; adapter fields must not live on the surface props (put engine facts on the adapter).
- Create `packages/ui/test/gbc/GbcWorldCanvasSurface.test.tsx` with new tests through the real `GbcWorldCanvas` wrapper (copy fetch-stubbing helpers/fixtures from `test/gbc/GbcWorldCanvas.test.tsx` into the new file rather than importing from it):
  - P12-3: Ctrl/Cmd-click toggles a second map into the selection (two outlines); marquee selects the maps it covers; a Shift-drag group move of a multi-map selection posts once per map (one POST body per map, each `{ map, x, y }` hand-derived) and reloads the world once after all deferred POSTs settle (count `reload` through a `vi.mock` wrapper of `useGbcWorld`, never by GET counts).
  - P12-4a: a map drag captures the pointer (`setPointerCapture` called on the pointerdown target); release outside the canvas commits once; capture loss without pointerup cancels with no POST.
  - P12-4i: a click 8 screen px from a visible warp marker selects nothing; 9 px selects the map (preservation test, GBC already has radius 8).
  - P12-4q: jumping to a placed map that `drawnByDefault` hides (indoor/gate) while unfiltered requests its tile and draws it (reveal, new for GBC).
  - These feature tests must fail on the old `GbcWorldCanvas.tsx` for the right reason (missing multi-select, missing capture, missing reveal) — the conductor checks that.
- Existing tests: do NOT edit any existing test file except these, and only if the new wrapper makes them fail for a P12-4m reason: `GbcWorldCanvas.test.tsx:685`, `:1323` (Fit-all), `:2001-2009` (F shortcut fit). If one needs a change, re-derive the expected value by hand (derivation in a comment; production code never supplies the expected value) and name it in your notes with ruling P12-4m. `GbcWorldCanvas.test.tsx:251-258` (zoom bounds), `:673`, `:756` (first fit, no pre-fit load), `:85` (warp alert/retry), `:1211` (60% jump) and the time re-dim cases must pass unchanged. Any other existing test that you believe must change: stop and explain in your notes instead.

## P12-4m first-fit deltas to name in your notes

`fitClusters`/`fitFilter` (Task 2, `canvas/worldView.ts`) differ from old GBC in two ways: (1) the fit unions member placements, so it follows a manually moved cluster member (old GBC unioned `component.bounds`); (2) a filter fit uses the anchored rule (old GBC fitted every scoped member). Look for any GBC test whose fixture moves a cluster member or mixes shelved members into a filter and list it.

## Deferred M6 check

Read `test/gbc/GbcWorldCanvasContext.test.tsx:290` and `:314`. State in your notes whether they exercise the surface-level in-context zoom cap through the real wrapper after your change. If they do not, add a test for the cap in your new test file.

## Rules

- No `gba|gbc|family` branch in `packages/ui/src/canvas/`. Do not edit `canvas/` files at all; if the surface lacks something GBC needs, stop and describe it in your notes rather than widening the surface (the conductor decides).
- Do not touch `components/WorldCanvas.tsx` (GBA, Task 8) or GBA files.
- Moved code keeps its rationale comments, shortened if needed, placed above the code they explain (never parked above a short wrapper). List removed comment lines and where each went.
- Every expected number in a new test is a hand-derived literal with its derivation in an adjacent comment.
- Async tests use deferred promises resolved by hand and bounded `act` loops; never a DOM-mutating probe inside `waitFor`.
- Style: one statement per line, JSX one element per line, lines ≤ 140 chars, no crammed `a; b; c` lines, UTF-8 no BOM, CRLF line endings. Match the surrounding comment density.
- Never add `key={url}` or any key-based remount.
- Keep DOM unchanged: class names, `role`, `aria-*`, `data-testid`, text and element order (except where P12-3 adds selection outlines/marquee).

## Deliverable

Code plus tests, and `docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-7-impl-notes.md`: files touched; each adapter field and the old GBC line it came from; family facts chosen; the two P12-4m deltas and any affected test; any changed existing test with its ruling; the M6 answer; removed comments and where they went; anything you could not do. Plain sentences.
