# Task 6 report: GBA map canvas onto MapSurface, with P12-4f/g/h (High)

Hops: Codex `gpt-6.1-sol` implementer (thread `01a174a0-8d49-71a2-bfdd-b5c7a7560546`), first try. Reviews: Codex `gpt-6-astra` both failed at start (usage limit, "try again at 4:32 PM") → Claude Opus subagents (fallback logged). Fix round: Codex unavailable → Claude Sonnet subagent (fallback logged; report `scratchpad t6-fix1-report.md`, summary below). Re-review: Claude Opus subagent.
Files: `components/MapCanvas.tsx` (wrapper; same exports; gains `onEditError`), `components/MapEditingWorkspace.tsx` (`onEditError` in the canvas-props `Pick` and `canvasProps`, routed to `setEventOpError`; `gba/adapter.tsx:99` spreads it into the in-context canvas, no edit needed), new `gba/mapSurface.tsx` (adapter; `.tsx` because legends are JSX, like GBC), new `canvas/events.ts` (shared event lookup, used by both adapters), new tests `test/gba/GbaMapSurface.test.tsx` (9) and `test/canvas/events.test.ts` (2, coordinator inline: pins scan order, which no test covered). Comment-only edits in `canvas/MapSurface.tsx`, `useRasterComposite.ts`, `useStage.ts`, `gbc/mapSurface.tsx`, `gbc/GbcWorldCanvas.tsx` (repointed references to deleted `MapCanvas.tsx` rationale).
Changed existing tests (`git diff --stat -- packages/ui/test`: 2 files, +9/-8): `MapCanvas.test.tsx` v= test: three `"0"` → `toBeNull()`, delayed no-bump and later exact bumps kept (P12-4h, P12-8, PR-I1). `MapEditingWorkspace.test.tsx` canvas-props key list adds `onEditError` plus identity with `setEventOpError` (P12-4f; strengthens).
Removed comments: 235 `//` lines plus block comments from HEAD `MapCanvas.tsx`, each moved beside its code in the adapter, `MapSurface`, `useRasterComposite` or `useStage` (inventory in `task-6-implementer.md`); review found none parked; the fix round merged duplicates and repointed dangling references.
Mutations (coordinator, all RED): wrapper drops `onStrokeChain`; `skipFirstBlocksChange: false`; collision not forced; workspace error route no-op; context-mode `onEditError` dropped at `gba/adapter.tsx:99`; `v=` always; same-cell skip removed; URL guard removed; marks not keyed by map; reversed event scan order.
Measurement (`measure.py --all`, GBA `components/MapCanvas.tsx` + `gba/mapSurface.tsx` vs GBC `gbc/GbcMapCanvas.tsx` + `gbc/mapSurface.tsx`): 143 / 180 code lines, 3 aligned, 1 run (GBA:83-85 / GBC:74-76: type imports of `MapSurfaceAdapter` and friends; ruled: import declarations). Was 167 aligned / 30 runs at baseline.
Reviews: spec PASS (5 Minor); quality Changes requested (2 Important comment issues, 7 Minor). Fixed: dangling references, stacked comments, marks leak across a map switch (spec Minor 1, new test), shared event lookup (quality Minor 1), stale wording, `METATILE_PX`, `Pick` param, P12-4b test name, formatting. Skipped: quality Minor 7 (shared test fixtures; optional). Spec Minors 2/3/5 go to the docs (ledger below; plan path `.tsx` in Task 7; Minor 5 recorded under P12-8 in the review record at Task 9).

## Behaviour-difference ledger (HEAD MapCanvas → wrapper + adapter + MapSurface; from the spec review)

| Behaviour | HEAD | Now | Ruling |
|---|---|---|---|
| Stroke error report | no-op (:257) | `onEditError` to `setEventOpError` (workspace Pick :21, canvasProps :91); context mode inherits via `gba/adapter.tsx:99` spread | P12-4f, PR-M2 |
| URL `v=` | `&v=${paintVersion}` whenever a session exists (:401) | only when version > 0 (`mapSurface.tsx:147`) | P12-4h, PR-I1 |
| Image readiness | `imgLoaded` boolean reset by effect (:283, :425-439) | `loadedUrl === imageUrl`, cached-complete readiness, error never loads | P12-4g |
| Pencil/collision trail | queues every move (:707-711) | same-cell skip, including the start cell; reset at stroke end | P12-4b |
| Leave / capture | leave ends stroke and drags | capture held: leave clears hover only; fallback: leave abandons (jsdom path unchanged); cancel finishes with null | P12-4a |
| Status strip | inline spans (:848-864) | `MapStatusStrip`, same classes, text and order | P12-4k |
| Hover callback | id-change effect | same policy (shared) | P12-4l (GBA unchanged) |
| Mark leak on switch | cleared by switch composite | keyed by map (fixed in the fix round) | none: restores HEAD |

Pre-existing (Task 4, noted for Task 9's review record under P12-8): MapSurface skips the debounce bump when there is no session; HEAD bumped on any same-map blocks change but showed v only with a session. Trigger and P12-8 oracle unchanged.

Gate: 3,633 pass / 0 fail / 226 files; typecheck and UI build pass (a one-line comment move after the gate; typecheck re-run).
Deferrals: quality Minor 7 (shared GBA test fixtures).
