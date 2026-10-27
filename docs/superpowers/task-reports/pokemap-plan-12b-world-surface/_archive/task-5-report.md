# Plan 12b Task 5 report: `WorldSurface` render, view and data contract (High)

## Files

- New: `packages/ui/src/canvas/WorldSurface.tsx` (460 lines), `packages/ui/src/canvas/worldSurfaceAdapter.ts` (117), `packages/ui/test/canvas/WorldSurface.test.tsx` (332, 16 tests).
- Modified: `packages/ui/src/canvas/useStage.ts` (+9 / -2: optional continuous `boundsFor(zoom)`, published to a ref at commit and applied to the updater's own view; wheel deps unchanged).
- Modified: spec `2026-10-24-pokemap-plan-12-shared-canvas-core-design.md` (+2: user rulings P12-4t world draw/hit order, P12-4u jump outside the active filter waits; 2026-10-27).

`git diff --stat -- packages/ui/test`: empty (no tracked test changed). One new untracked test file, `test/canvas/WorldSurface.test.tsx`. No existing test changed; the test count rises 3,722 → 3,738.

## Removed comments

`git diff -U0 -- packages/ui/src/canvas/useStage.ts | grep '^-\s*//'`: none. The new files port behaviour from `WorldCanvas.tsx` / `GbcWorldCanvas.tsx` without editing them (Tasks 7-8 delete the originals). Rationale comments carried over are listed in `task-5-fix1-report.md`; the three the quality review (M5) found missing (badges never behind a toggle; coverage-error lens comment; `encounterVersion` cache-bust dependency) were restored in the review-fix round.

## Hop log (delegate chain)

1. Codex `gpt-6.1-sol` (scratch worktree wt-t5): partial implementation (184-line surface, 5 of 9 required tests), then hit its usage limit (reset 2:18 PM 2026-10-27). `gpt-6-sol` shares the quota, skipped. Notes: `task-5-impl-notes.md`; its unofficial self-reviews `task-5-codex-selfreview-{spec,quality}.md`.
2. Anthropic floor: Opus general-purpose subagent finished the code (style, rationale comments, failed-encounter fix, viewport guard on the jump, missing tests, mutation table): `task-5-fix1-brief.md`, `task-5-fix1-report.md`.
3. Reviews: Opus `high-risk-reviewer` fallback (Codex astra at the same limit). Spec `task-5-spec-review.md` PASS, 5 Minor. Quality `task-5-quality-review.md` Approved with fixes, 1 Important + 7 Minor.
4. Review fixes: conductor inline (conductor 8). Reason logged: about 40 scattered lines across three files, each fully specified by the reviews, the files already in the conductor's context, so a brief would exceed the edit; Codex was still limited when the round started (13:52).
5. Scoped re-review: Codex `gpt-6-astra` (back after 14:18): `task-5-rereview.md` PASS, 1 Minor (the component and props lacked the `W` default) — fixed (type-only).

Incident during this task (2026-10-27): `git worktree remove --force` on wt-t5 followed npm-workspace junctions and deleted 462 tracked files in `packages/` and all of `node_modules`; restored with the user's approval (`git checkout -- packages`, `npm ci`). Rule since: delete junctions as links first (memory `worktree-junction-removal.md`).

## Review fixes (this round)

| Finding | Fix |
|---|---|
| Quality I1 | Third generic `W extends SurfaceWorld<P, C> = SurfaceWorld<P, C>` on `WorldData`, `WorldStatus`, `WorldSurfaceAdapter` (`useWorld`, `drawExtraLayers`, `statusItems`) and `WorldSurface`/props. GBA's adapter (Task 8) declares `verticalLinks` on its `W`. |
| Quality M1 | `fitRef` published in the same `useLayoutEffect` as `maxZoomRef`. |
| Quality M2 / Spec Minor 2 | `initialFitDone` is stamped when a fit lands (in `fitWorld` on non-null bounds, and in the jump effect), not on the first attempt. New test: "fits the clusters once a filter with nothing to fit clears". |
| Quality M3 | Badge colours resolved once per draw. |
| Quality M4 | `hiddenCount` memoised; `spotlightEntries` is `[]` when the spotlight has no hits. |
| Quality M5 | Three comments restored. |
| Quality M6 | Deferred: GBC context tests `GbcWorldCanvasContext.test.tsx:290`, `:314` exercise the surface's in-context cap once Task 7 routes GBC through it. Task 7 must confirm. |
| Quality M7 | Lazy ledger (`useState(createPlacementLedger)`); `setRevealed` keeps identity on a re-reveal; exported `EncounterEntry`; projection test renamed. |
| Spec Minor 1 | Retention test forces a redraw after the version bump and asserts the old image is drawn in it. |
| Spec Minors 3-5 | Carry-forwards written into `task-6-brief.md` (GBA toasts wrapper, GBC toolbar error order and GBA `--dragging-map`, filtered-jump reveal per brief rule 8). |

## Evidence

- Gate (tree before the type-only `W` default): **3,738 pass / 0 fail / 230 files**. Typecheck pass. UI build pass. Subjects unchanged (GBA HEAD `26a2e3d1e`, 9 porcelain lines; PerfPlus clean).
- After the `W` default (type-only, no runtime effect): typecheck pass, UI build pass, focused WorldSurface + useStage 40/40.
- `rg -i 'gba|gbc|family'` in the new canvas files: no hits.

## Mutations

The nine from the finisher are in `task-5-fix1-report.md` (draw before fit; fit every placement; jump fraction 1.0; outline without pan; badges before tiles; error placeholder shows loading; viewport guard on the jump; failed-encounter store; `key={token}`), each red. Review-fix round, run by the conductor, each red and the file restored:

| Mutation | Failing test |
|---|---|
| `initialFitDone` stamped on the first fit attempt (old behaviour) | fits the clusters once a filter with nothing to fit clears |
| `useWorldTiles` clears `entry.tile` on a URL change | reveals a hidden jump, shares projection, and retains the previous image until replacement loads |
