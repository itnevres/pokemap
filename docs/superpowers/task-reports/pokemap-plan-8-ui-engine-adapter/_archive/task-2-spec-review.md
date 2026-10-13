# Plan 8 Task 2: spec-compliance review (base dc33490, head 3b7051f)

**Verdict: Spec ✅** (Critical 0 / Important 0 / Minor 3, plus 2 ⚠️ for the coordinator)

Paths are relative to `packages/ui/`. Line numbers are at head.

## Critical
None.

## Important
None.

## Minor

**m1. Unused `contextView` binding in GBC.** `src/gbc/GbcWorldCanvas.tsx:948` has `const { inContext, contextView } = worldContext;`, but `contextView` is never read again: the key handler now calls `worldContext.stepZoom`, and the overlay gets `ctx`. Grep finds no other use. It is dead code and contradicts the report's "No dead code left in the canvases". Behaviour is unaffected (tsc does not flag unused locals here). Fix: destructure only `inContext`.

**m2. The merged hook comment drops GBA's setter detail.** `src/shared/useWorldContext.ts:45-50` says "one setView, never nested", which was GBC's wording. GBA's removed comment said "zoom and pan are separate, sequential setters, never nested". GBA still does exactly that (`src/components/WorldCanvas.tsx:1444`), so R7 holds, but the R11 merge now describes only one family. Scenario: someone later "simplifies" GBA's `setView` into a nested updater, and no comment says why not. Cosmetic.

**m3. Escape test coverage differs from the spec text (accepted deviation).** The spec says the Escape tests dispatch on `window`. The tests dispatch on `document.body` with `bubbles: true` (`test/shared/useWorldContext.test.tsx:53-57`). The report documents this, and it is needed so the `document` bubble flush listener runs. The flush test (`:155-165`) does kill a bubble-phase window listener: document bubble removes the modal before window bubble would judge it. Not covered: the listener is not shown to be removed when the hook goes from in-context to out of context. "Has no listener when not in context" (`:167-171`) only covers starting out of context. The cleanup is the standard effect return (`useWorldContext.ts:96`), so the risk is low.

## ⚠️ Not verifiable from the diff / for the coordinator's Step 6
- **Mutant "native default reintroduced" would not change behaviour as written.** Both callers pass `native` explicitly (`WorldCanvas.tsx:1441` `16`, `GbcWorldCanvas.tsx:939` `BLOCK_PX`). A `native = 16` default on the hook alone changes nothing at runtime, so no test can kill it. The guard against an omitted `native` is the required field in the type, enforced by typecheck. To have teeth, the Step 6 mutant must also drop GBC's `native:` argument. The per-family snap tests (`test/shared/useWorldContext.test.tsx:60-69`, native 32 at 32 → 1x) and the GBC family tests then catch it. Also note: `world/contextView.ts` still has its own `native = NATIVE` (16) defaults. The hook always passes `native`, so this is outside Task 2's scope, but those defaults are the only place a "default native" still exists.
- **Mutant "`indexOf` -1 left unclamped" no longer has a site.** `stepZoom` uses `find` (`useWorldContext.ts:113-121`). Step 6 has to put the old `indexOf` body into `stepZoom`. The GBC witness (`test/gbc/GbcWorldCanvasContextZoom.test.tsx`) and the shared tests at 3.2 (`:208-221`) would kill that.
- Step 7 (live check in both families: pixel alignment, Escape with SaveDialog open, Done) was not run, which is out of scope for this review. The gate numbers (156 files, 2,644 pass) and the oracle result are taken from the report and not re-run.

## Ruling checklist

| Ruling | Status | Evidence |
|---|---|---|
| R1 interface | ✅ | `src/shared/useWorldContext.ts:6-35`: every field and member present with the spec names. The ref types are widened to `RefObject<T \| null>` (React 19 typing); this is harmless. `WorldContextOverlay` (`src/shared/WorldContextOverlay.tsx`) is module-level, and its markup, class names, ARIA, `aria-pressed`, `disabled={!contextView}` and `{z}×` labels match the removed JSX byte for byte. `renderCanvas` is only called when `contextView` is non-null. |
| R2 Escape split | ✅ | `useWorldContext.ts:84-97`: a capture-phase window listener that lives only while `inContext`. It applies the shared checks (key, `defaultPrevented`, `aria-modal`, text-field `closest`) in the same order as before. `isBlocked` and `onExitRequest` are read through refs. Both families pass `() => contextMenu.menu !== null` (`WorldCanvas.tsx:1447`, `GbcWorldCanvas.tsx:945`), which matches the old `menuOpenRef`. |
| R3 maxWorldZoom GBC only | ✅ | `GbcWorldCanvas.tsx:952` uses `Math.max(worldContext.maxWorldZoom(GBC_MAX_ZOOM), current)`, which equals the old `inContext ? 128 : 32`. `GBC_CONTEXT_MAX_ZOOM` is removed. The wheel effect's `[inContext]` deps (`:967-968`) still hold, because the captured `maxWorldZoom` closes over the same `inContext`. GBA's wheel bound is not in the diff, so it is untouched. |
| R4 stepZoom (M6) | ✅ | `useWorldContext.ts:113-121`: `+1` picks the smallest level strictly greater, else 4; `-1` picks the largest level strictly less, else 1; the result goes through `setContextZoom`. On a level this equals the old index ±1, clamped. It is a no-op while `contextView` is null. The GBC handler (`GbcWorldCanvas.tsx:1125-1129`) still calls `preventDefault`, consumes the key while `contextView` is null, and returns. `onKeyDown` is a per-render function, so there is no stale closure. GBA gains no step UI. |
| R5 snap deps | ✅ | `useWorldContext.ts:76`: the deps are the primitives from the spec, and the eslint-disable comment is kept. Equivalence check: the old deps included `world`, and GBA's `sizeByMap` is derived synchronously from `world?.components`. Any size change therefore came with a `world` change before, so the primitive deps lose no trigger. Re-runs after a snap are still no-ops because of the ref guard. |
| R6 zero-size → null | ✅ | `WorldCanvas.tsx:1443` and `GbcWorldCanvas.tsx:936` (`validContextPlacement`, now `null`). The GBA double-click on a zero-size placement is now ignored, as the spec accepts. |
| R7 setView per family | ✅ | GBA (`:1444`): `setZoom` then `setPan`, sequential and not nested. GBC (`:942`): a single updater that keeps `fitted`. The old snap, `onContextViewChange` and `setContextZoom` paths all now route through `world.setView` with identical values. |
| R8 no remount | ✅ | `{context && <WorldContextOverlay …/>}` sits in the same JSX slot (`WorldCanvas.tsx:2076`, `GbcWorldCanvas.tsx:1359`), with the same siblings before and after. No `key`, wrapper, or canvas element is touched. The existing node-identity witnesses are unchanged: `test/AppContextEdit.test.tsx:132,156,265`, `test/gbc/GbcAppContext.test.tsx:226,289,495,507,593`, `test/gbc/GbcWorldCanvasContext.test.tsx:230`. |
| R9 focus on exit | ✅ | `useWorldContext.ts:54-58` keeps the same code. Tested at `test/shared/useWorldContext.test.tsx:236-247`: focus is called after a snap, and not when no snap happened. |
| R10 GBC-only UI GBC-side | ✅ | The `+ = - _` handler is in GBC, Fit all `disabled={inContext}` is unchanged (`GbcWorldCanvas.tsx:1187`), and `zoomBoundsFor` is GBC-only. GBA's wheel effect is not in the diff. |
| R11 comments | ✅ (see m2) | The snap-timing, capture-phase and StrictMode-guard comments are merged once in the hook. Each canvas keeps a one-line pointer (`WorldCanvas.tsx:1438`, `GbcWorldCanvas.tsx:934`). |

## Behaviour equivalence of the moved logic
- **Native per family.** The old GBA code called `snapContextZoom(zoom)`, `enterContextView`, `mapViewFromWorld` and `worldViewFromMapView` without `native`. Those use the default `NATIVE = 16` (`world/contextView.ts:3,9,21,39,52`). The new GBA code passes `native: 16` explicitly. GBC passed `BLOCK_PX` (32) before and still does. Both are equivalent.
- **Snap effect.** The guards, the pointer conversion with the box at snap time, the clearing of the pointer ref, the `snappedFor` gate, and the ref-guard and focus-on-exit branch are all identical. GBA's old extra `contextSize` checks are folded into the `placement` nullness check (R6).
- **`contextView` / `onContextViewChange` / `setContextZoom` math.** Identical apart from `native` (above). The pivot is the viewport centre in both.
- **Overlay double-click hit test.** Identical formula. GBA's `contextSize` is now inside `placement`, built as `{x, y, ...contextSize}`. That spread can carry extra Placement fields when `component !== -1`, but `x`, `y`, `width` and `height` are the same values, so the result is equal. It still calls `context.onExitRequest()` directly, as before.
- **`inContext`.** The old `context !== undefined` becomes `(context ?? null) !== null`, which is the same thing.

## Tests (spec Tests section)
| Spec case | Present and asserting | Where (`test/shared/useWorldContext.test.tsx` unless noted) |
|---|---|---|
| Snap per family, GBA 16/32/64 and GBC 32/64/128 → 1/2/4 | ✅ | `:60-69` |
| Enter centres on the recorded pointer, converted with the canvas box; pointer ref cleared | ✅ (asserts the exact `setView` value, `contextView`, and the null ref) | `:71-80` |
| Canvas centre when there is no pointer | ✅ | `:82-85` |
| No snap while origin is null; snaps once under StrictMode | ✅ (also placement null) | `:87-117` |
| Escape once; not when defaultPrevented, isBlocked, from input or contenteditable, with a modal, or with the flush listener; no listener out of context | ✅ (see m3) | `:120-172` |
| Double-click outside exits; inside or on the bar does not | ✅ | `:174-197` |
| stepZoom non-level: GBC 3.2 → 4/2, GBA 1.5 → 2/1; clamps at the ends | ✅ (GBA 1.5 at `-1` does not tell old from new, but GBC 3.2 at `-1` does) | `:199-235` |
| `maxWorldZoom(32)`: 128 in context, 32 outside | ✅ | `:229-233` |
| Focus on exit only after a snap | ✅ | `:236-247` |
| GBC family M6 witness (128 → wheel → 3.33; `+` gives 4×, `-` gives 2×) | ✅ (asserts the intermediate zoom of 10/3 before the key press) | `test/gbc/GbcWorldCanvasContextZoom.test.tsx:105-125` |

**RED evidence** (`task-2-red.log`): both GBC witness tests fail at the final `aria-pressed` assertion ("expected 'false' to be 'true'"), with the DOM showing 1× pressed and `data-view` zoom 1. The intermediate `toBeCloseTo(10/3)` therefore passed, so the failure is for the stated reason: pre-change `indexOf` returns -1 and the step goes to 1×. The hook suite's RED is an unresolved import, as expected.

**Test oracle:** the only test files in the diff are 2 new ones. No existing test file is modified (the oracle result is from the report and consistent with the diff stat).

## Missing / Extra / Misunderstood
- Missing: nothing required (the mutation teeth-proof in Step 6 and the live check in Step 7 belong to the coordinator; see ⚠️).
- Extra: none. No new dependencies, and no server, core or CLI files in the stat.
- Misunderstood: none. The report's self-declared deviation, reading `world.zoom` directly in the snap effect, matches the pre-change code and R5's eslint note.
