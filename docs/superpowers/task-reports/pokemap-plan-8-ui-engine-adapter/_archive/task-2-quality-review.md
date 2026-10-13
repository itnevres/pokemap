# Task 2 code-quality review (useWorldContext + WorldContextOverlay), dc33490..3b7051f

**Verdict: Approved** (0 Critical / 0 Important / 4 Minor)

## Checked, no problem
- Hook closures: Escape listener reads `onExitRequest` and `isBlocked` through refs, so it sees the latest values. Deps `[inContext]` are right. The listener is capture-phase, and the family supplies only `isBlocked`.
- Snap effect: deps are the R5 primitives. The `snappedForRef` guard survives the StrictMode double run, because cleanup does not reset it. The StrictMode test covers this. The eslint-disable comment is kept.
- Render-phase ref writes (`useWorldContext.ts` ~L83-86) are the pre-existing pattern, moved verbatim. They are idempotent and benign.
- Callback identity churn: `onContextViewChange`, `setContextZoom` and `stepZoom` are new each render, exactly as before (previously inline). No family effect depends on them. GBC's wheel effect is `[inContext]`; `zoomBoundsFor` captures `maxWorldZoom`, which depends only on `inContext`, so there is no stale capture.
- `contextView` is recomputed each render, but it is a cheap pure call and unchanged from before.
- Overlay: module-level component, minimal props `{map, ctx, renderCanvas, onDone}`. Both canvases render `{context && <WorldContextOverlay/>}` at the same JSX position as the old inline div, so the world canvas node identity is kept.
- Comments: moved once into the hook, merged. The canvases keep a one-line pointer (R11). No duplicate logic remains in either canvas: the removed blocks are fully gone, and the `GBC_CONTEXT_MAX_ZOOM` constant is removed.
- Tests: deterministic, with no timers (the GBC zoom test uses event-driven `waitFor`). The Escape-modal test (document bubble listener removes the modal) really proves capture ordering. The negative Escape cases have a positive control in the first test.
- Gate log: all stderr is the pre-existing jsdom "Not implemented: HTMLCanvasElement.getContext" noise from untouched App/GbcApp suites. There are no React warnings and no act() warnings, and none from the new files.
- Sizes: the hook is ~150 lines and the overlay ~45. Both are one-responsibility.

## Minor
1. `packages/ui/src/gbc/GbcWorldCanvas.tsx:948`: `const { inContext, contextView } = worldContext;` destructures `contextView`, which is never used in this file (grep confirms only `inContext` is used). It is a dead binding and will trip `no-unused-vars` if lint is enabled. Fix: `const { inContext } = worldContext;`.
2. `packages/ui/src/shared/useWorldContext.ts` (stepZoom, ~L128-133): the `-1` branch allocates `[...ZOOM_LEVELS].reverse()` per keypress, and the `!` non-null assertion is applied on one branch (`ZOOM_LEVELS[length-1]!`) but not the other (`ZOOM_LEVELS[0]`). It is correct and trivial, but inconsistent. A `findLast` or a simple loop would be tidier. This does not block.
3. `packages/ui/test/shared/useWorldContext.test.tsx:~40`: the `wrapper: ({children}) => <>{children}</>` in `setup` is a no-op fragment. Remove it. The test titled "calls onExitRequest once, from a capture-phase window listener" does not itself prove capture; the modal-removal test does. Rename it or ignore.
4. `packages/ui/test/shared/useWorldContext.test.tsx` overlay double-click: `overlayRef.current` is assigned through a cast onto a detached div. That is acceptable for a hook-level unit test, and the real-DOM path is pinned by the family tests. The GBA zero-size R6 exit-ignored case has no direct test (hook-level `placement: null` is covered only for the snap). Optional: add a one-line double-click with `placement: null` that asserts no exit.
