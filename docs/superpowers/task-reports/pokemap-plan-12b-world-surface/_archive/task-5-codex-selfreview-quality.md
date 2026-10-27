# Task 5 independent quality review

Verdict: NEEDS CHANGES. Two important ordering findings; no code changed.

Reviewed the actual WorldSurface.tsx, worldSurfaceAdapter.ts, WorldSurface.test.tsx and useStage.ts diff against aaa8ae96, plus the called stage/view/tile/viewport/context/encounter/conflict contracts and relevant existing canvas code. This is the high-risk independent quality review; the spec review is separate. Delegate routing was read; this dispatch uses the parent-selected capable review model, with no further delegation.

## Findings

### Q1 — Important: an initial jump consumes its token before the viewport is measured

Location: packages/ui/src/canvas/WorldSurface.tsx:84-90, interacting with :67-70 and useViewportMeasure.ts.

Mount with a non-null adapter world and a jump token. The stage initially exposes viewport `{w:0,h:0}`. Its measurement passive effect queues a state change, but the remaining effects in that same commit still see the zero viewport. Initial/filter fitting correctly wait; the jump does not. It stamps the token and calls jumpFit with zero dimensions, which returns zoom 1/pan 0, then marks that fallback view fitted. On the measured render, initial fit replaces this with the cluster fit and the stamped token prevents the intended jump from running again. The highlight/reveal still happen, disguising the wrong final view. The intermediate fitted fallback can also trigger image/encounter requests against the wrong view before the real fit commits.

The existing Hidden mount test encounters precisely this path but asserts only reveal, projection agreement, and image retention; those can all pass with the wrong camera. This is an in-scope shared-surface correctness issue even though the predecessor jump effect has a similar missing guard.

Requested fix: wait for a positive measured viewport before stamping/applying a valid jump. Add a regression mounting an already-loaded world with an initial jump, asserting exact final rectangle and request scope; exercise delayed zero-to-positive measurement too. With the existing Hidden fixture, viewport 200x100, Hidden (10,10,5,5), raw fit min(40,20)=20, jump zoom=12, pan=(100-12.5*12,50-12.5*12)=(-50,-100), outline=(70,20,60,60). Cluster zoom 5 is not acceptable. Confirm no request/draw comes from the fallback zero-viewport view. Run under StrictMode as well.

### Q2 — Important: render-time zoom-bounds publication leaks speculative state to committed events

Location: packages/ui/src/canvas/useStage.ts:35-38; related WorldSurface.tsx maxZoomRef assignment.

The added boundsFor ref is assigned during render. React shares that ref between the current and work-in-progress trees. If a render changes the callback then suspends or is abandoned, the wheel listener on the still-committed canvas immediately uses that uncommitted callback. It can permit/clamp zoom using a policy the user never received. This contradicts the committed-prop discipline already documented and implemented by useStageView's layout-effect publication. Keeping the callback out of wheel-effect dependencies is correct, but publication must occur at commit, not render. The surface's latest maxWorldZoom bridge has the analogous issue: its stable callback reads a ref assigned by an uncommitted context render.

Requested fix: publish the current bounds callback and current surface cap through layout effects while retaining stable listener dependencies. Add a focused Suspense/transition regression: commit a cap that blocks wheel-in, attempt a render with a larger cap that suspends, then wheel on the still-committed canvas and assert the old cap holds. After committing the larger cap, wheel-in should use it. Also assert a callback-only update does not rebind the listener.

## Independent checks and observations

- Re-derived the existing numeric fixtures: cluster extent (10,10)-(50,30), zoom 5 and pan (-50,-50), A screen rectangle (0,0,50,50); anchored A-only filter zoom 10 and pan (-50,-100); B jump zoom 6 and pan (-50,-40), rectangle (70,20,60,60); A/B manual filter fit zoom 10. Those expectations are sound and do not derive from production helpers.
- Normal measured first fit uses a value update and a ref guard, avoiding nested updater pan duplication in StrictMode. Filter identity/reset and outside-filter jump deferral are coherent. Highlight token keys and the separate two-second fade effect preserve re-jump and resize semantics.
- Drawn placements retain world iteration order; visibility uses strict AABB overlap and the fitted gate. Draw order is tiles, adapter extras, badges. The one rect projection feeds the requested overlays. Badge placement/accepted colors/text match the existing shared helpers and predecessor loop.
- Encounter placeholders are written synchronously, so effect replay does not duplicate per-map fetches. Rejection increments failure count and keeps the map cached, preventing retry storms. No abort/unmount guard exists, but late results touch only the abandoned instance's cache/state; this is not reported as cross-instance corruption. Computing method tint once is equivalent: both predecessor functions inspect fetched method/source rows only and return CSS variable strings.
- Adapter prop types are usable and types-only; coverage/border/legend reuse real component contracts. Task 6 interaction state remains intentionally unwired.
- Current tests do not directly assert rejection alert/count/cache persistence, timer expiry after resize/re-jump, or nativePx=32 behavior. These are coverage observations; Q1/Q2 regressions above are the required quality fixes.

## Verification limits

No vitest, full suite, npm test, code edits, or mutation runs performed, as instructed. Findings are based on independent source/control-flow review, not a claimed test failure. Parent reports typecheck exit 0 and focused Vitest startup denied by esbuild permissions (zero tests executed); neither supplies runtime evidence for this review. The final gate, UI build, live UI check and mutation evidence remain the orchestrator's responsibility.
