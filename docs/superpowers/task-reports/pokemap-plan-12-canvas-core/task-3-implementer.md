# Task 3 implementer: stage hook

- Tier: High; shared canvas wheel/pan/capture and pointer termination behavior.
- Baseline: scratch worktree was clean before implementation; no commits or pushes.
- Routing: read `delegate`; implemented in this Codex session because the task brief explicitly prohibits sub-dispatch.

## Files touched

- Created `packages/ui/src/canvas/useStage.ts`.
- Created `packages/ui/test/canvas/useStage.test.tsx` (351 lines; no existing tests/fixtures edited).
- Modified `packages/ui/src/shared/useCanvasView.ts`.
- Modified `packages/ui/src/shared/MapCanvasViewport.tsx`.
- Created this report at the requested path; no other files touched.

## Plan Step 1: tests

- Added stepped pivot/rounding/both-clamp tests and continuous factor/fractional-pan/both-clamp tests, with independently derived pivot expectations in comments.
- Added StrictMode controlled-wheel notification counts and no-op identity checks.
- Added native non-passive wheel registration/preventDefault/cleanup and viewport resize measurement checks.
- Added client-delta pan, captured outside movement/release, missing/throwing/refused capture fallback tests.
- Added pointercancel/unexpected lostcapture cancellation once, wrong-pointer isolation, synchronous own-release suppression, normal pointerup, and map-switch/unmount cleanup tests.
- Added pointerdown then compatibility mousedown starts exactly one gesture, with no pointer-start/commit notification.
- Added once-per-map auto-fit (including reloads, rerenders, StrictMode, re-entry), controlled suppression, F/chromeless/modifier and context registration tests.
- Added legacy four-hook integration and optional viewport pointer/image-error forwarding/unchanged-markup tests.
- No waitFor probes, unbounded loops, new dependencies, or existing oracle changes.

## Plan Step 2: implementation

- `useStage` exposes owned/controlled view, updateView, measured viewport, canvas/container refs, policy wheel zoom, center/apply zoom, fit, pan start/move/end/leave, capture status/helpers and pointer cancellation handlers.
- Uses Task 1 `zoomAboutPivot`/`fitView` and existing `useViewportMeasure`, F shortcut and context-fit registration. Cell geometry remains in `cells.ts`; this hook has no cell lookup responsibility.
- Continuous policy multiplies by factor/inverse factor; stepped pan rounds, continuous pan remains fractional (SR-I8).
- Capture handlers never start/commit gestures. Native pointerup clears capture ownership without cancellation; mouseup remains responsible for committing/ending the gesture.
- Ownership clears before releasePointerCapture so synchronous lost events cannot double-cancel. Capture refusal preserves leave fallback; map switch/unmount drops pan and releases capture.
- Legacy exports retain their signatures and rationale comments, delegating to foundation hooks. Committed layout-effect refs keep stable controlled updates without speculative-render leakage.
- Viewport gains only optional pointerdown/cancel/lostcapture and image-error props; existing mouse handlers and element structure stay intact.

## Removed comment lines and destinations

- `// eslint-disable-next-line react-hooks/exhaustive-deps`: moved from the old auto-fit effect to `useStageAutoFit` immediately above the same readiness/map-name dependency list.
- No rationale comment lines were removed; controlled-update, non-passive-wheel, once-per-map and fit/band explanations remain in `shared/useCanvasView.ts` alongside their delegates.

## Verification and remaining coordinator work

- PASS: `node node_modules/typescript/bin/tsc -p packages/ui --noEmit` (exit 0).
- PASS: `git diff --check` (exit 0).
- `git diff --stat -- packages/ui/test`: empty because the new 351-line test is untracked; no tracked test changes.
- Runtime tests/red-before-green, auto-fit guard mutation, full gate (pass/fail/file counts), UI build and live UI checks: NOT RUN, per the brief's sandbox restriction; coordinator must run them. No runtime/gate/build/live success is claimed.
- Existing map-canvas/context wheel/Fit/auto-fit suites remain unmodified and need coordinator execution.
- No self-review dispatches or extra report folders. No spec deviations or unresolved design questions; verification remains pending.
