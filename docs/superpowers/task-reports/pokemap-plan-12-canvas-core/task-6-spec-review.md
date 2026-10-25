# Task 6 spec review (Claude Opus subagent; Codex usage limit, fallback logged)

# Plan 12a Task 6: spec-compliance review (GBA map canvas onto MapSurface)

Scope: the uncommitted diff plus untracked files in worktree `p12wt`, checked against HEAD `components/MapCanvas.tsx` (867 lines, the behaviour source), committed `canvas/MapSurface.tsx`, `canvas/mapSurfaceAdapter.ts`, the GBC precedent (`gbc/GbcMapCanvas.tsx`, `gbc/mapSurface.tsx`), plan Task 6 and the spec (engine-facts table, P12-4a/b/f/g/h/k/l, P12-8, PR-I1, PR-I3, PR-M2, anti-goals). Read-only review; vitest was not run (coordinator: 18 files / 321 tests pass, mutations RED as listed).

## Critical
None.

## Important
None.

## Minor

1. **Stale event marks can leak across a map switch** (`packages/ui/src/gba/mapSurface.tsx:109`, `:160`, `:170`). At HEAD, the map-switch toggle reset re-ran the composite effect with events off, and that run set `marksRef.current = []` (HEAD :468). Now `marks.current` is only written inside the events layer's `draw`, and `hoverAt` gates it on `enabled.events`. Repro: events on for map A; switch to B (toggles reset); turn Events on for B before B's image loads; hover. The hover readout can show A's `kind: label` at matching cells until B composites. The window is narrow (before the image loads), but it is a GBA readout difference that no ruling names. Fix: key the ref by map (`marks.current = { map, list }`, and use it only when `marks.current.map === map`), or clear it when the map/layout identity changes.
2. **Behaviour differences are not listed in the implementer report.** `task-6-implementer.md` inventories moved comments well, but it does not list the behaviour differences with their rulings. The brief requires that list. The list below fills the gap; copy it into the report (or the Task 7 report) so the final review can cite it.
3. **Plan path drift.** The plan names `packages/ui/src/gba/mapSurface.ts`. The file is `gba/mapSurface.tsx`, which it has to be because the legends are JSX, and that matches `gbc/mapSurface.tsx`. Use the `.tsx` path in Task 7's DESIGN.md "Shared modules" table and in the plan STATUS.
4. **Cosmetic.** `gba/mapSurface.tsx:74-75` has a double blank line. `canvas/useRasterComposite.ts:93-95` now carries two adjacent comments that both say overlay blending is destructive (the merged one and the existing one). Fold them into one.
5. **Pre-existing, not Task 6 (noted for the final review only).** `MapSurface.tsx:98` (committed in Task 4) skips the debounce bump when there is no session. HEAD bumped on any same-map `blocks` change but showed `v` only with a session. The skip is consumed before the session check in both versions, so the trigger and the P12-8 oracle are unchanged. The only effect is that `v` no longer counts read-only `blocks` changes. That is harmless, and it follows the P12-8 "sampled on blocks changes" note. Name it under P12-8 in the review record.

## Behaviour-difference ledger (HEAD MapCanvas to wrapper, adapter and MapSurface)

| Behaviour | HEAD | Now | Ruling |
|---|---|---|---|
| Stroke error report | no-op (:257) | `onEditError` to `setEventOpError` (workspace Pick :21, canvasProps :91); context mode inherits via `gba/adapter.tsx:99` spread | P12-4f, PR-M2 |
| URL `v=` | `&v=${paintVersion}` whenever a session exists (:401) | only when version > 0 (`mapSurface.tsx:147`) | P12-4h, PR-I1 |
| Image readiness | `imgLoaded` boolean reset by effect (:283, :425-439) | `loadedUrl === imageUrl`, cached-complete readiness, error never loads | P12-4g |
| Pencil/collision trail | queues every move (:707-711) | same-cell skip, including the start cell; reset at stroke end | P12-4b |
| Leave / capture | leave ends stroke and drags | capture held: leave clears hover only; fallback: leave abandons (jsdom path unchanged); cancel finishes with null | P12-4a |
| Status strip | inline spans (:848-864) | `MapStatusStrip`, same classes, text and order | P12-4k |
| Hover callback | id-change effect | same policy (shared) | P12-4l (GBA unchanged) |
| Mark leak on switch | cleared by switch composite | see Minor 1 | none (fix) |

Checked and unchanged from HEAD:
- 16 px paint and event cells, `compositeOrigin` (re-exported from the wrapper for `gba/adapter.tsx:5`), `BORDER_RINGS` composite size, `?border=1` URL.
- Overlay order grid, collision, elevation, events, then the Encounters toggle last. Labels unchanged. Drawers are the same core functions. Deps declare layout, blocks and (for events) map.
- Collision is forced on with the Collision tool through `forced`, and `aria-pressed` stays manual.
- Legend text and markup: `data-testid="collision-overlay" data-visible="true"`, "Elevation (low → high)", `EventsLegendItems`, encounters hint.
- Hover readout: bounds, `behavior ?? 0` fallback, mark gated on events, `·` separators, "Hover the map…" empty state.
- `PaintApplyBody`: pencil, bucket (null without a metatileId), collision as a 1x1 pencil without a metatileId, rect and shift at release from the raw end cell.
- Dropper: whole block, no stroke, session required. Sign pick: bounded cell and the same anchor math via `cellRect`.
- Event select before paint with no tool; raw-cell deselect; a miss falls through to pan; drag preview is local; commit happens once on release only when the cell changed; the selection ring prefers the drag preview, with the `--overlay-selection` token and its fallback.
- `skipFirstBlocksChange: true` with the timer cleared on map switch and unmount. Version never reset.
- Encounter side from planar connections (`?? []`), `BORDER_BAND.gba`, unit 16, Fit band.
- Chromeless, controlled view, auto-fit once per map, per-map reset of toggles, encounters and hover.
- `onStrokeChain` register and unregister.

Existing-test changes:
- `MapCanvas.test.tsx:421-447`: three `"0"` expectations become `toBeNull()`. The 300 ms delayed no-bump assertion is kept, and so are the later exact bumps. Cites P12-4h, P12-8 and PR-I1.
- `MapEditingWorkspace.test.tsx:82,91`: the key list adds `onEditError`, plus an identity assertion against `setEventOpError`. This strengthens the test. Cites P12-4f.

Neither change weakens a guarantee, and no tests were deleted.

New tests (`test/gba/GbaMapSurface.test.tsx`):
- P12-4b: pencil and collision, with exact bodies.
- P12-4f: Map view and context mode through the real `useGbaRuntime().renderWorld`, asserting the chromeless class, banner text and Dismiss.
- P12-4g: an old-URL handler is ignored, and a cached image loads under StrictMode and on a URL change.
- P12-4h/P12-8: no `v` on session start or the delayed reseed, then `v=1` after paint.
- PR-I3: registry settlement waits on both a deferred apply and a deferred end.

Every brief item is covered. Async waiting uses bounded act flushes, with no DOM-mutating `waitFor`.

Comments: the moved rationale sits beside the code it explains. The wrapper keeps the public prop contracts and has a single one-line role comment. The canvas edits are comment-only and nothing is parked. No DOM change outside P12-4k. No family branch was added to `canvas/` in this diff. No new dependency.

Spec compliance: PASS
