# Plan 8 Task 1 implementer report

Status: DONE. BASE f05ff8b. Commits: 7ffae94 (hook + tests), e9bbfd9 (GBC wiring + GbcMapCanvasStroke tests), 94c2f03 (GBA wiring + MapCanvasStroke tests).

## Files
- new: packages/ui/src/shared/useStrokeChain.ts, test/shared/useStrokeChain.test.tsx (21 cases), test/gbc/GbcMapCanvasStroke.test.tsx (2), test/MapCanvasStroke.test.tsx (19)
- modified: src/gbc/GbcMapCanvas.tsx, src/components/MapCanvas.tsx

## Rulings applied
R1 MapCanvas passes a no-op onError (no new prop/UI). R2 GBA move handler queues only while chain.isOpen(); the chain's queue() is a no-op with no open stroke. R3 copied from GBC: begin reject leaves begun=false, queued applies drop, reported once, finish still ends unless retired and not begun; apply reject reported, later links still run. R4 start() calls finish(null) first when open. R5 GBA/GBC capture the rect/shift start cell at mousedown in a canvas ref; canvas builds the last body; chain applies it only if owned and begun. R6 retirement via useLayoutEffect([visitKey]) inside the hook incl. unmount. R7 every append ends .catch(report).catch(noop).then(noop). R8 dedupe stays in GbcMapCanvas (lastCellRef); GBA has none (test uses 4 applies for 3 moves). R9 settled() = tail.then(noop).

## Incidental GBA behaviour changes (beyond R2)
- mouseup/mouseleave with no open stroke (e.g. off-map mousedown, or a second mouseup) no longer sends endStroke (before: endActiveStroke always sent end). Matches GBC. No existing test depended on it.
- A rect/shift mousedown no longer sets the start cell inside begin's .then; it is captured at mousedown (R5).

## Red before green
- useStrokeChain.test.tsx: failed to load (module missing) before implementation.
- MapCanvasStroke.test.tsx on pre-change MapCanvas: 15 failed | 4 passed (19), e.g. "queues a held-begin pencil move..." expected apply not called, called 1 times; "a lost mouseup" got [begin, apply 0, begin, ...] vs [begin, apply 0, end]; retirement cases applyPaint called 2 vs 0; off-map held move called apply 1 times; plus 2 unhandled errors. After GBA wiring (one test adjusted to 4 applies per R8) 19 passed.
- GbcMapCanvasStroke.test.tsx on the base GbcMapCanvas: 2 failed (lost mouseup: got [begin, apply 0, begin, ..]; M3: got [begin] only); green after wiring.
- Note: first shared-test run also exposed two of my own test bugs (apply not yet invoked before releasing; rerender B then A inside one act batches to no change), fixed in the test.

## Gate
- npm test (task-1-gate.log): Test Files 153 passed (153); Tests 2616 passed (2616). No flake hit.
- npm run typecheck: clean. npm run build -w @pokemap/ui: built.
- Oracle: git diff f05ff8b -- ':(glob)packages/*/test/**' | grep -E '^-[^-]' prints nothing.

## Unsure / notes
- GBC passes the whole editSession object as the StrokeSession (methods are stable useCallbacks); retired strokes end on the captured object.
- GBC ownership of end now binds to the session object captured at mousedown (was the same captured endStroke).
- Run vitest from the repo root: environmentMatchGlobs is root-relative, so running inside packages/ui gives "document is not defined".

## Fix round 1
1. M3 finish path: `report` in useStrokeChain.ts now wraps the onError call in try/catch. New tests: shared "a throwing onError on the last apply still lets end go out, reported once" and GbcMapCanvasStroke rect final-apply case. Red with the old report (cmd: `npx vitest run packages/ui/test/shared packages/ui/test/gbc/GbcMapCanvasStroke.test.tsx`): `expected [ 'begin', 'apply:5' ] to deeply equal [ 'begin', 'apply:5', 'end' ]` and `expected [ 'begin', 'apply' ] to deeply equal [ 'begin', 'apply', 'end' ]` (2 failed | 24 passed); green after.
2. useEditSession `call`: `currentMapRef` updated each render; `applyResponse` runs only if it still equals the issuing mapName (comment names Plan 8 Task 1; seq/seed left to Task 5). New file test/useEditSessionGuard.test.tsx (2 cases). Red before guard: `expected [ { metatileId: 99 ...} ] to deeply equal [ { metatileId: 2 ...} ]` (1 failed | 1 passed); 2 passed after.
3. Added: shared "retired before the begin link runs" (no begin, no end), observable queue/finish no-op after a finished stroke; GBA end-phase retirement for map/ABA/unmount (late end rejection silent, nothing on next session).
4. `await act(async () => {})` added before the negative assertions in MapCanvasStroke (held-begin move, immediate-mouseup apply, drag loop).
Covering run (root): shared, MapCanvasStroke, GbcMapCanvasStroke, GbcMapCanvasEdit, MapCanvas, useEditSession*: 7 files, 172 passed.
Gate: `npm test > task-1-gate-r1.log` 154 files / 2624 tests passed (log gitignored); typecheck clean; UI build ok; oracle diff prints nothing.
