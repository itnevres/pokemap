# Task 1 report — 12a carry-overs and the continuous wheel fix (High)

Conductor 5, 2026-10-26. Base `f1eec90` (code = `935d981` = 12a merge `58f7213`).

## Start-state findings
- GBA subject drifted from the plan's baseline: HEAD `26a2e3d1e` (was `718b89f73`; two user commits 2026-10-25 22:38, "tooling: wire the Claude config", "docs: harness commands take an absolute WSL path"), **9 porcelain lines** (was 8): the 6 data/include lines plus `M .claude/settings.json`, `M .claude/skills/delegating-work/SKILL.md`, `?? docs/human-tasks-notes.md`. All the user's own work; not touched. New baseline for Task 10 restore: HEAD `26a2e3d1e`, these 9 lines.
- PerfPlus `C:\Programming Projects\pokecrystal-PerfPlus`: HEAD `81ededbe3`, clean, no `.pokemap` (matches).

## Baseline measurement (Step 1)
- World pair `components/WorldCanvas.tsx` vs `gbc/GbcWorldCanvas.tsx` at HEAD: **1113 / 799, 189 aligned, 42 runs** (matches). After this task's edits: same (comment-only change in GBC).
- Map pair (wrapper + adapter concatenated, `// FILE:` headers): **143 / 180, 3 aligned, 1 run** (matches).

## Inventories (Step 1)
- `useCanvasView` / `useCanvasZoom` / `useCanvasFit` / `useCanvasAutoFit`: only `test/canvas/useStage.test.tsx:5,310-315`. No src consumer.
- `components/EncounterBorder`: src `canvas/MapSurface.tsx:3`, `canvas/mapSurfaceAdapter.ts:2`, `gbc/GbcWorldCanvas.tsx:8`, `components/WorldCanvas.tsx:6`; tests `test/encounters/EncounterBorder.test.tsx:11`, `test/canvas/MapSurface.test.tsx:24` (`vi.mock` path).
- `components/mapView`: src `canvas/MapSurface.tsx:2` (now `./view.js`), `shared/CanvasZoomBar.tsx:1`, `gbc/GbcMapCanvas.tsx:7,11`, `world/contextView.ts:1`, `components/MapCanvas.tsx:7`, `components/WorldCanvas.tsx:19`, `gbc/GbcWorldCanvas.tsx:21`, `shared/useWorldContext.ts`, `shared/WorldContextOverlay.tsx`; tests `test/canvas/view.test.ts:3`, `test/MapCanvas.test.tsx:5`, `test/WorldCanvasContext.test.tsx`, `test/gbc/GbcWorldCanvasContext.test.tsx`, `test/gbc/GbcWorldCanvasContextZoom.test.tsx`, `test/shared/useWorldContext.test.tsx` (spec review M1 completed this list). These keep importing the re-export until Task 8/9's inventory.
- `stage.captured` readers: only the four `useStage.test.tsx` lines. No src consumer.

## Changes
- Deleted `shared/useCanvasView.ts`. Its rationale moved to `canvas/useStage.ts` after spec review I1 / quality m4: the `onViewChange`-ref identity reason (on `useStageView`'s `latest` ref), the jsdom-does-not-enforce-passive warning (wheel effect), and the fit doc (`useStageFit` JSDoc). Fit-once and one-view/StrictMode comments were already there.
- `git mv components/EncounterBorder.tsx shared/EncounterBorder.tsx` (same depth, its own imports unchanged); 6 importers updated; no re-export left.
- `ZOOM_LEVELS`, `Zoom`, `MapView` (with doc comments) moved to `canvas/view.ts`; `components/mapView.ts` re-exports them and keeps its `zoomAboutPivot` wrapper; `canvas/MapSurface.tsx` imports from `./view.js`.
- `canvas/useStage.ts` M4: `captured` `useState` and both `setCaptured` calls removed, `captured` dropped from the return; `hasCapture()` is the reader.
- `canvas/useStage.ts` wheel (PR12b-I3): `applyZoom` now goes through `zoomBy(nextOf(view))`; the continuous branch computes `view.zoom * f` inside the updater. Stepped branch unchanged (render `zoom`, `levels.indexOf`). The controlled path (`useStageView`, `latest.current.view`) is unchanged: two batched wheel events on a controlled stage still both read the last committed prop (12a behaviour, as the plan says). Both world views are uncontrolled.
- `canvas/useRasterComposite.ts` M3: no logic change; the guard comment now says a fired load means decoded, so no size check. The pinning test already existed: `test/canvas/useRasterComposite.test.tsx` "ignores a deferred load callback from the previous URL" (retained old-URL handler after a URL change leaves `imgLoaded` false and no composite until the new URL's own load). No new M3 test needed.
- `gbc/GbcWorldCanvas.tsx` header bullet rewritten to today's facts (one view with `fitted`, continuous `zoomWorldAboutPivot` inside one updater, `zoomBoundsFor`/`maxWorldZoom`); the removed history lines (GbcMapCanvas first draft, nested setPan) are obsolete, not moved. Comment only.

## Tests (`git diff --stat -- packages/ui/test`: 3 files, +52/−13)
- Changed, carry-over (named in Global Constraints): `useStage.test.tsx:5` import; "retains the four legacy hooks…" calls `useStageView/useStageZoom(…, { kind: "stepped", levels: [1,2,4] })/useStageFit/useStageAutoFit`, assertions identical; `:161,:191,:211,:239` `stage.captured` → `stage.hasCapture()`, same booleans.
- Changed, import path only (move): `MapSurface.test.tsx:24` `vi.mock` path, `EncounterBorder.test.tsx:11` import.
- Same authorized test retitled "composes the four stage hooks with stepped fit/wheel behavior" (quality m3; hooks no longer legacy).
- New (`useStage.test.tsx`, "Plan 12b Task 1 carry-overs"): M4 render count unchanged across pointerdown and pointerup with `hasCapture()` true/false; two continuous wheel-ins in one `act` → zoom 1.44 and hand-derived pan (4.4, 8.8) (quality m1; mutation gives (2, 4)); wheel in then out in one `act` → 1.
- Quality m1 note: a release-only `setCaptured(false)` mutation would survive (state already false, no re-render); accepted, harmless.

## Mutations (each restored after)
| Mutation | Failing test |
|---|---|
| Restore `captured` state set on capture and release | M4: capture and release cause no re-render |
| Continuous step from the render-captured `zoom` | both batched-wheel tests |
| Drop the `onImgLoad` URL guard (stale handler unlocks) | useRasterComposite "ignores a deferred load callback from the previous URL" |

The plan's M3 mutation wording ("record the loaded URL from `img.src` at load time") — in `renderHook` the img has no `src`, so that variant would fail for an unrelated reason; the guard-drop mutation is the meaningful one and was used.

## Delegation log
- Codex `gpt-6.1-sol` failed: "You've hit your usage limit … try again at 5:29 PM" (no diff).
- Mechanical moves/imports/deletion, M3 comment, GBC comment: Anthropic direct — under ~10 min of tool calls (sed/git mv).
- `useStage.ts` + its tests: Aider Nemotron 3 Ultra (free). Hop 1 edited only `useStage.ts` (on target); retry on the test file applied B1-B4. Its M4 test omitted `onPointerDown` on the canvas (test bug, failed for the wrong reason); conductor fixed that one line.

## Reviews (Codex at limit → Claude Opus `high-risk-reviewer`, logged)
- Spec: Approved with fixes, 1 Important / 2 Minor (`task-1-spec-review.md`): I1 dropped comments, M1 inventory, M2 empty gate section. All fixed.
- Quality: Approved with fixes, 0 Important / 4 Minor (`task-1-quality-review.md`): m1 pan assertion added, m2 wheel comment scoped to uncontrolled, m3 title, m4 comment. All fixed. Controlled-mode wheel unchanged (reviewer derived by hand).

## Gate
- Before review fixes: 3,637 pass / 0 fail / 226 files; subjects unchanged.
- After review fixes: Gate at working tree on f1eec90: 3,637 pass / 0 fail / 226 files; typecheck pass, UI build pass; subjects unchanged.
- Typecheck pass; UI build pass (after fixes).
