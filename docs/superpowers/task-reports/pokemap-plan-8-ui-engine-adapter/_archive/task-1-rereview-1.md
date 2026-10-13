# Task 1 re-review 1 (fix range cfa6bdd..e3d66b9)

Focused run from root: useEditSessionGuard (2), useStrokeChain (23), MapCanvasStroke (22), GbcMapCanvasStroke (3) = 50/50 pass.

- Important 1: ADDRESSED. `useStrokeChain.ts:56-57` `report` now wraps `onErrorRef.current` in try/catch, so the inner `.catch` at the finish link cannot reject and `endStroke` runs; onError is called once. Tests `useStrokeChain.test.tsx` "throwing onError on the last apply..." and `GbcMapCanvasStroke.test.tsx` rect variant expect `[..., "apply", "end"]` and one onError call. Without the try/catch the await at the finish link throws, end is skipped, and the log lacks "end", so both fail.
- Important 2: ADDRESSED (map-only guard). `useEditSession.ts:254-255,263` `currentMapRef` is set each render, and `call` applies the response only if `currentMapRef.current === mapName`. New file `useEditSessionGuard.test.tsx`: A response landing after rerender to B leaves blocks=B, isDirty=false, canUndo=false. Without the guard `applyResponse` sets blocks to [99] and the test fails. The same-map test pins that it is not over-dropping.
- Minor 3: ADDRESSED, all three bullets.
  - Retire before the begin link runs: `useStrokeChain.test.tsx` "retired before the begin link runs" (held previous end, start, map switch, expect no begin/end). It fails if the `:86` `!owns` guard is removed, because a second "begin" would be logged.
  - No-op test: now has an observable log. A stroke is finished first, then queue/finish are expected to add nothing.
  - GBA end-phase retirement: `MapCanvasStroke.test.tsx` it.each map / ABA / unmount on a held end (late end rejection silent, nothing reaches the next session).
- Minor 4: ADDRESSED. `await act(async () => {})` added before the negative assertions at the three sites (queued held-begin move, first-apply wait, per-iteration in the four-apply loop).

## New Critical/Important breakage from the fix diff: 0
Guard checks:
- StrictMode: the ref is assigned during render, which is idempotent. Fine.
- mapName null to X: `call` returns early when mapName is null, so there is nothing to drop. After the switch `call` is recreated with the new mapName and the ref matches.
- Same-map consecutive calls: the ref equals mapName, so the response applies.
- A to B to A: a late A response applies, because the hook is on A again. This matches the map-only ruling; the response is for the current map.
- A call in flight when mapName goes to null is dropped. That is correct.
- `report` swallowing changes nothing else. A non-owned stroke still returns early, and the outer catch at `append` still gets rejections from links.

## Deferred (out of scope)
- A to B to A drops nothing, so a stale A response can apply to the re-opened A (seq/seed guard is Task 5).
- Minor 2 (seed-change mid-stroke in GBC) stays accepted per the ledger.
