# Task 7 report: measurement, mutation evidence, docs (Medium)

Hop: inline Claude (docs only, one file, judgment-heavy; a brief would cost more than the edit, per the CLAUDE.md inline rule). Review: one combined review. Codex `gpt-5.6-terra` unavailable (usage limit until 4:32 PM PDT, hit 13:05) → Claude Sonnet subagent (fallback logged).
Files: `packages/ui/DESIGN.md` ("Shared modules": new Plan 12a table; Plan 11 rows for `useCanvasView`, `CanvasZoomBar`, `OverlayToggleGroup`, `LegendBar`, `MapCanvasViewport` repointed to their real consumers; closing per-family sentence updated). No code or test change.

## Step 1: measurement (spec Goal 5)

Procedure: per family, concatenate wrapper then adapter with a `// FILE: <path>` line before each, into scratch `gba-map.tsx` / `gbc-map.tsx`; `measure.py <gba> <gbc> --all` from `packages/ui/src`, Windows paths.

| Pair | Code lines | Aligned | Runs |
|---|---|---|---|
| Baseline (`MapCanvas.tsx` vs `GbcMapCanvas.tsx`, Task 1) | 427 / 443 | 167 | 30 |
| Now (GBA `components/MapCanvas.tsx` + `gba/mapSurface.tsx` vs GBC `gbc/GbcMapCanvas.tsx` + `gbc/mapSurface.tsx`) | 143 / 180 | 3 | 1 |

Target (at most 30 aligned) met. The one run (GBA:83-85 / GBC:74-76) is the `import type { MapSurfaceAdapter ... }` declarations: ruled, import declarations are not duplicated behaviour. Matches Task 6.

Side-by-side read of the two adapters for renamed or reordered duplication (what `measure.py` cannot see):
- Grid legend span (`map-canvas__legend-item` + `--grid` swatch): identical one-line JSX in both. Events legend is already shared (`EventsLegendItems`).
- Hover status item: same `className` expression (`map-canvas__hover` / `--empty`) and the same "Hover the map…" placeholder; the readout text differs per engine.
- `finishBody`: shift line identical; rect line differs only by GBC's `tool.stamp` guard (GBC stamps are optional).
- `imageUrl`: same `/api/render/<name>.png?border=` prefix and `v=` suffix rule; GBC adds `&time=`.
- Live/static source selection: GBA picks `editSession.blocks` / `map` by field; GBC merges into a memoised payload. Different shapes (GBA's map is a separate object; GBC's events live in the payload).

Ruling: each is one or two lines with family-typed inputs; lifting them adds a shared helper per line for no behaviour gain. Left in place; candidates if Plan 12b adds a third consumer (`GridLegendItem` in `LegendBar`, a hover-item helper in `MapStatusStrip`).

## Step 2: mutation evidence (Tasks 1-6)

All by the coordinator with an anchor-replace script (one asserted anchor, narrowest vitest file, bytes restored). RED = at least one test failed. Counts are given where the task report recorded them; the file is the task's test file unless the report named another; Task 6's report did not name files, so its rows say "Task 6 focused set" (`gba/GbaMapSurface.test.tsx`, `components/MapCanvas.test.tsx`, `MapEditingWorkspace.test.tsx`, GBA context-edit tests).

| Task | Mutation | Result (failing test file) |
|---|---|---|
| 1 | floor off-by-one in cell math | RED, 5 (`canvas/cells.test.ts`) |
| 1 | clamp in `boundedCell` instead of `null` | RED, 2 (`cells.test.ts`) |
| 1 | rounding in continuous zoom | RED, 1 (`canvas/view.test.ts`) |
| 1 | pivot sign flipped | RED, 3 (`view.test.ts`) |
| 1 | band dropped in `fitView` | RED, 3 (`view.test.ts`) |
| 1 | finiteness guard removed | RED, 1 (`view.test.ts`) |
| 2 | stale-load guard dropped | RED (`canvas/useRasterComposite.test.tsx`) |
| 2 | cached readiness dropped | RED (same) |
| 2 | deps compared by identity | RED (same) |
| 2 | key removed from the signature | RED (same) |
| 2 | image error marks loaded | RED (same) |
| 2 | decorate dropped | RED (same) |
| 2 | render-phase ref publishing | RED (same) |
| 2 | render-phase snapshot write | RED (same) |
| 2 | unconditional canvas width assignment | RED (same) |
| 3 | release-ownership order | RED (`canvas/useStage.test.tsx`) |
| 3 | `onCancel` dropped | RED (same) |
| 3 | leave ignoring capture | RED (same) |
| 3 | auto-fit once-per-map guard removed | RED (same) |
| 3 | controlled view reported twice | RED (same) |
| 3 | `startPan` re-entry guard removed | SURVIVED; ruled defensive (pointerdown never starts a pan), spec reviewer agreed |
| 4 | same-cell skip removed | RED (`canvas/MapSurface.test.tsx`) |
| 4 | stroke error routed to a no-op | RED (same) |
| 4 | bounded (not raw) stroke end | RED (same) |
| 4 | cancel finishes with the last cell | RED (same) |
| 4 | `onStrokeChain` registration dropped | RED, 18 (same) |
| 4 | `useRasterComposite` URL guard dropped | RED (same) |
| 4 | hover effect without `[hoverId]` deps | RED (same) |
| 4 | `skipFirstBlocksChange` ignored | RED (same) |
| 4 | leave ignoring capture | RED (same) |
| 4 | outside pencil starts a stroke | RED (same) |
| 4 | sign pick with the raw cell | RED (same) |
| 4 | event drag commits on the same cell | RED (same) |
| 4 | cancel keeps the event drag | RED (same) |
| 4 | unmount timer clear removed | RED (same) |
| 4 | map-switch toggle reset removed (keyed guard and layout reset both) | RED (same) |
| 4 | map-switch hover reset removed (both) | RED (same) |
| 4 | drag preview removed | RED (same) |
| 4 | primary-button guard removed | RED (same) |
| 4 | policy reset on map switch removed | RED (same) |
| 4 | `settled()` resolving at once | RED (same) |
| 4 | render-time map keying of toggle/hover alone | SURVIVED; the layout reset covers it, ruled defence-in-depth |
| 5 | wrapper drops `onStrokeChain` | RED (`gbc/GbcMapSurface.test.tsx` b) |
| 5 | auto-fit keyed by `imageUrl` | RED (`GbcMapSurface.test.tsx` a, `gbc/GbcMapCanvas.test.tsx`) |
| 5 | `!chromeless` encounter gate re-added | RED (`MapSurface.test.tsx` chromeless no-remount test) |
| 5 | `endStroke` not awaited in `useStrokeChain` | RED (`GbcMapSurface.test.tsx` b) |
| 6 | wrapper drops `onStrokeChain` | RED (Task 6 focused set) |
| 6 | `skipFirstBlocksChange: false` for GBA | RED (Task 6 focused set) |
| 6 | collision overlay not forced | RED (Task 6 focused set) |
| 6 | workspace error route a no-op | RED (Task 6 focused set) |
| 6 | context-mode `onEditError` dropped at `gba/adapter.tsx:99` | RED (Task 6 focused set) |
| 6 | `v=` always appended | RED (Task 6 focused set) |
| 6 | same-cell skip removed | RED (Task 6 focused set) |
| 6 | URL guard removed | RED (Task 6 focused set) |
| 6 | marks not keyed by map | RED (`GbaMapSurface.test.tsx` mark-leak test) |
| 6 | reversed event scan order | RED (`canvas/events.test.ts`) |

56 mutations: 54 RED, 2 SURVIVED (both ruled).

## Step 3: family-branch check

`rg -n -i 'gba|gbc|family' packages/ui/src/canvas`: 8 matches, none a branch.
- `MapSurface.tsx:55`, `:138`, `:193`: comments (provenance "GbcMapCanvas"; "steps for GBC"; "family stamp").
- `MapSurface.tsx:71`: `encounter.family` passed through to `useMapEncounterSummaries` (declared engine fact, never compared).
- `events.ts:1`, `mapSurfaceAdapter.ts:17`, `:19`: doc comments. `mapSurfaceAdapter.ts:37`: the `family` field's type.

Indirect branching (read `MapSurface.tsx` in full): every adapter field is a declared engine fact or presentation value, read the same way for both families: `geometry` (cell sizes, origin), `skipFirstBlocksChange` (GBA true, GBC false; P12-8), `className` (GBC only; appended when set), `encounters.time` / `legendHint` (passed through), `overlays[].forced` (GBA collision only; ORed into `enabled`). Tool checks (`sign`, `dropper`, `pencil`, `collision`) test the shared tool-kind vocabulary, not the family; GBC never issues `collision`. No `family ===`, and no check on a field only one family sets other than these declared facts.

## Found in passing (for Task 9's whole-branch review)

- `shared/useCanvasView.ts` has no production consumer after Tasks 5-6 (only `test/canvas/useStage.test.tsx` imports it). DESIGN.md now says so. Delete or keep is Plan 12b's call (WorldSurface may adopt `useStage` directly).
- `MapSurface.tsx:55` comment ends with the provenance "(GbcMapCanvas)", now a 61-line wrapper. Harmless.

- `MapSurface.tsx:2-3` imports `ZOOM_LEVELS`/`MapView` (`components/mapView`) and `EncounterBorder` (`components/`): a canvas → components dependency, not a family branch (combined review observation). Plan 12b may move them under `canvas/` or `shared/`.

## Review

Combined review (Claude Sonnet fallback, `task-7-review.md`): Approved, 3 Minors. Fixed: `canvas/view.ts` row gains `canvas/MapSurface`; match count 7 → 8. Minor 2 informational (no change).

## Gate

Gate: 3,633 pass / 0 fail / 226 files (unchanged; docs only); typecheck and UI build pass.
