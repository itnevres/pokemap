# Task B4 implementer report

**Status: DONE** (one deviation, below). Base `8805d12`, branch `plan-6c-hub-encounters-world`.

## Commits
| sha | what |
|---|---|
| cb29a03 | EncounterBorder `enabled?` controlled mode + 4 tests |
| ce19eeb | `encounters/useMapEncounterSummaries.ts` + 10 tests |
| 16e2865 | MapCanvas (GBA): toggle, hook, side, border mount, band-aware `fit()` + 12 tests |
| 7392263 | GbcMapCanvas: same + `time` dimming + GBC legend text + 12 tests |
| 3845056 | DESIGN.md: map views host the border (controlled mode) |
| 1d41aa1 | MapCanvas: `connections ?? []` (see Deviations) |
| (this report) | |

## Counts
Baseline 1,880 -> **1,918** (+38: 4 + 10 + 12 + 12). 117 files, all green, no flakes hit.
Gate: `npm test` 1918/1918; `npm run typecheck` clean; `npx vite build packages/ui` ok.

## Implementation notes
- EncounterBorder: `enabled: controlled`; `enabled = controlled ?? ownEnabled`; control block (toggle+legend) only when `controlled === undefined`; layout-effect deps use the effective value.
- Hook: per-instance `useRef(Map)`; `cache.set(map, undefined)` placeholder synchronously before `fetchGuarded`; version-counter rerender; error cached (no retry); returns the CURRENT map's entry.
- Both canvases: `Toggles.encounters` (resets per map via NO_TOGGLES); last button in Overlays; legend row shows on `anyOverlay || encounters`, item = text or `role="alert"` error; `side` via `useMemo` on `connections` (GBA: `gbaDirToCompass` + filter; GBC: direction directly); `borderEntries` `useMemo`ed so the tooltip-clear effect fires only on movement; mounted after the stage canvas in `.map-canvas__viewport`, `zoom * 16|32`, `lodZoom 0`, band `BORDER_BAND.gba|gbc`, rect = drawn image incl. border ring.
- `fit()`: `bandNative = encounters ? band*UNIT : 0`; extraW/extraH by side; candidates `(pw+extraW)*lvl`; pan = centred content + `bandNative*z` for left (x) / top (y). Plain `setZoom`+`setPan` (GBA) / `setView` (GBC). Deps gain `toggles.encounters, side`. First-fit effect and `applyZoom`/paint chain untouched.
- No CSS change needed (reuses `encounter-border*`, `map-canvas__legend-item`).

## Hand-derived exact-rect tests (both families, 2 cases each)
GBA (img 64x64, band 64 native): vp 400 left -> z2, draw (200,136,128,128), strip (72,136,128,128); vp 200 top -> z1, draw (68,100,64,64), strip (68,36,64,64).
GBC (img 128x96, band 64 native): vp 400 left -> z2, draw (136,104,256,192), strip (8,104,128,192); vp 200 top -> z1, draw (36,84,128,96), strip (36,20,128,64). Derivations are in test comments.

## Mutations run (all red; restored from in-memory bytes, tree clean after each)
| mutant | killed by |
|---|---|
| EB: control block always rendered | 2 controlled-mode tests |
| EB: layout-effect deps `ownEnabled` | "tooltip not resurrected on re-enable" (note: "true->false clears" alone does NOT catch it, the render guard hides the tooltip; the resurrect test is the one that does) |
| hook ignores `enabled` | hook "no fetch while disabled" |
| hook placeholder removed | hook in-flight re-toggle test |
| hook cache check removed (`has`) | (placeholder test, same) |
| GBA side always left | GBA right-fixture + top-fit case |
| GBA `gbaDirToCompass` bypassed | GBA right-fixture + top-fit case |
| GBA fit ignores band | both fit cases |
| GBA band offset not `* z` | left fit case (z2) |
| GBA `encounters` in recomposite `anyOverlay` | "does not recomposite" |
| GBA hook eager | "fetches only after the click" (+ an existing no-fetch test, "mouse-down still pans exactly as before") |
| GBC side always left | right-fixture + top-fit case |
| GBC fit ignores band | both fit cases |
| GBC `anyOverlay` joins encounters | "does not recomposite" |
| GBC hook eager | "fetches only after the click" |
| GBC `time` not passed | "time switch..." + dimming tests |

## Existing tests touched
**None.** `git diff 8805d12 --stat -- packages/ui/test`: 4 files, +504/-0 (MapCanvas.test.tsx +169, EncounterBorder.test.tsx +37, useMapEncounterSummaries.test.tsx new +124, gbc/GbcMapCanvas.test.tsx +174).

## Deviations / notes
1. **`connections ?? []` in MapCanvas (GBA) only.** Two existing fixtures (`WarpDestinationModal.test.tsx` "shows a loading state...", `WorldCanvas.test.tsx` warp popup "double-clicking a warp marker...") hand `MapCanvas` a `map` with no `connections` field (real `MapData` always has it), so `connections.map` threw. Rather than edit those tests, the code tolerates it, with a comment. Reviewer: say if you would rather fix the fixtures. GBC fixtures all carry `connections`; no guard added there.
2. The Encounters toggle changes `toggles`, which is in the base-composite effect's deps, so that effect re-runs (clear + drawImage of base, no `putImageData`). Spec's check is "no recomposite" = `putImageData` count, which holds. Avoiding the base redraw would mean keeping `encounters` out of `toggles`, contradicting the spec's `Toggles` design; left.
3. Toggling the legend row on shrinks the viewport (existing behaviour for every overlay); Fit afterwards uses the new viewport.
4. Tests were written after the controlled-mode and hook code (steps 1-2) rather than red-first; steps 3-4 were red-first (12 failing before implementation each). All mutations above confirm the tests bite.
5. Stray `packages/ui/.scratch-vite5183.mjs` (a vitest/vite artifact) appeared untracked during the run; deleted, never committed.
