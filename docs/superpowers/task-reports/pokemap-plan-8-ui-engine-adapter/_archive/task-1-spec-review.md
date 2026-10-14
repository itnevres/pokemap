# Plan 8 Task 1 spec-compliance review (shared stroke chain)

Range f05ff8b..cfa6bdd. Reviewer: Opus, independent re-derivation from the code.

**Verdict: Spec ❌** (1 Important against named fix M3; 1 Important GBA behaviour change outside the rulings; 4 Minor).

Checked and passing:
- Test oracle: `git diff f05ff8b..cfa6bdd -- ':(glob)packages/*/test/**' | grep -cE '^-[^-]'` = 0. Only 3 new test files.
- No server/core/CLI/package.json/lockfile change (empty `--stat`).
- Focused run from root: useStrokeChain (21), MapCanvasStroke (19), GbcMapCanvasStroke (2), GbcMapCanvasEdit (45). 87/87 pass.
- Interface block matches the binding signatures exactly (`useStrokeChain.ts:3-19,32`).
- R1: GBA passes a no-op `onError`, with no new prop or UI (`MapCanvas.tsx` `useStrokeChain<PaintApplyBody>(mapName, () => {})`).
- R2: the GBA move handler checks `chain.isOpen()` and `queue()` returns early with no stroke (`useStrokeChain.ts:93-94`).
- R3: begin rejection leaves `begun=false` (`:86-87`), queued applies drop (`:96`), the error is reported once by `append`'s catch, and `finish` still ends unless retired and not begun (`:71`). An apply rejection is reported and later links run.
- R4: `start` calls `finish(null)` first (`:81`).
- R5: both canvases capture the start cell at mousedown. `last` is applied only when the stroke is owned and begun (`:72`).
- R6: `useLayoutEffect([visitKey])` with cleanup on change and unmount (`:39-51`). The cleanup ends a begun stroke on its captured session and swallows errors.
- R8: GBC dedupe stays in `GbcMapCanvas` (`lastCellRef`). GBA has no dedupe.
- R9: `settled()` is `tail.then(noop)`, and the tail never rejects.

Retirement trace. Map change, A→B→A and unmount all go through the same cleanup. A→B→A gets a new visit object each time, so the original A visit's stroke is never owned again.
- Retire before the begin link runs: `:85` returns, so no begin and no end. Correct, but untested (see Minor 3).
- Retire with begin in flight: begin settles and `begun=true`. `:88` skips `first`, and the cleanup link ends the stroke.
- Retire with an apply in flight: the remaining queue links drop (`:96`), the cleanup ends the stroke, and the rejection is not reported (`:56`).
- Retire after `finish` (stroke already detached): the finish link ends a begun stroke (`:71,76`), and `last` is skipped because the stroke is not owned.
- Retire with end in flight: the error is not reported.

## Findings

### Important 1: M3 is incomplete. A throwing `onError` inside the finish link skips `endStroke` and reports twice
- `packages/ui/src/shared/useStrokeChain.ts:73`: `await stroke.session.applyPaint(last).catch((e) => report(stroke, e));`
- Scenario (GBC; GBA's `onError` is a no-op, so GBA cannot throw here):
  1. A rect or shift stroke is owned and begun, and its final apply rejects.
  2. `report` calls `onEditError`, which throws.
  3. The inner `.catch` handler rejects, so the `await` throws and `await stroke.session.endStroke()` (`:76`) never runs.
  4. The outer `append` catch (`:62`) calls `onError` a second time with the thrown handler's message ("ui broke"), which throws again and is swallowed by `:63`.
- Result: the server-side stroke stays open, so the next stroke's begin is ignored server-side and two edits merge into one undo step. This is exactly the hazard F3/M4 and M3 are meant to close. The chain itself does keep moving.
- Evidence: I replicated the `append` and `finish` link logic verbatim in `node -e`. Output: `["apply","onError:rect rejected","onError:ui broke"]`. No `end`.
- Pre-existing: yes. The old GBC code had the same `.catch(strokeFail)` before `await editSession.endStroke()`. But the plan rule says "A throwing onError can no longer poison the chain", and R7 says the report must be guarded on every path.
- Test gap: both M3 tests (`useStrokeChain.test.tsx:207`, `GbcMapCanvasStroke.test.tsx:84`) only cover the begin-rejection path.
- Fix:
  - Make the inner handler non-throwing: `.catch((e) => { try { report(stroke, e); } catch {} })`, or have `report` itself swallow.
  - Add a shared test: rect `last` apply rejects, `onError` throws, then expect `[..., "apply:N", "end"]` and `onError` called exactly once.

### Important 2: GBA now sends a retired visit's `endStroke` to the old map after a switch, and `useEditSession` applies that response to the new map's view (unruled GBA behaviour change)
- Code: `packages/ui/src/shared/useStrokeChain.ts:46-47` and `:76` (end on the captured session), combined with `packages/ui/src/hooks/useEditSession.ts:243-260`. `call` runs `applyResponse` unconditionally, with no "still the same map" guard. GBC's `post` has that guard: `latest.current.mapName === mapName` (`useGbcEditSession.ts:121`).
- Scenario:
  1. A GBA stroke on map A is begun, with an apply in flight.
  2. The map switches to B (keyboard or programmatic switch while the button is held).
  3. Under the chain, `POST /api/edit/A/paint/end` goes out after the in-flight link settles. This request is new: before, the mouseup end went to B's session.
  4. Its response runs `setBlocks(A blocks)`, `setIsDirty`, `setCanUndo` and so on, on the one `useEditSession` instance App now uses for B.
  5. If the response lands after `useEditSession`'s corrective reset for B's `initialBlocks` (`useEditSession.ts:233-241`), the B canvas (`MapCanvas.tsx:216` `blocks = editSession.blocks`) draws A's blocks, A's dirty and undo flags show for B, and this lasts until the next B edit.
- Context: an in-flight A apply already had this clobber risk before the change. What is new is a deterministic old-map request issued after the switch, and it may sit behind a long held apply. Low likelihood, but user-visible. Review Focus 3 ("no error is shown for the retired visit") does not cover state clobbering.
- Ruling needed:
  - (a) accept and record it; or
  - (b) add a same-map guard to GBA `useEditSession.call`, as GBC has. That is outside Task 1's file list, so it needs a recorded reason.
- Other GBA request-level changes (for completeness; all intended or ruled):
  - `POST /api/edit/B/paint/end` at mouseup after a mid-stroke switch is no longer sent (F6).
  - The begin-less drag-in apply is gone (R2).
  - Applies now wait for begin and for each other, and end waits for the last apply (F6).
  - A lost mouseup now ends the stroke before the next begin (F3/M4).

### Minor 1: GBA no longer sends `endStroke` on a mouseup with no open stroke (unruled)
- `MapCanvas.tsx` `endActiveStroke`: `if (!editSession || !chain.isOpen()) return;`. Before (f05ff8b `:827-857`, `onMouseUp :884-886`), any non-dropper mouseup with a session and tool sent `endStroke`, for example after an off-map mousedown or a stroke already ended by mouseleave.
- The implementer reported this. It matches GBC and the old code's own comment that a spurious end is unwanted, and no existing test depends on it. It is still not in R1-R9, so the coordinator should record a ruling. The new test `MapCanvasStroke.test.tsx:237-247` asserts the new behaviour.

### Minor 2: GBC's owned-stroke applies and end now use the session captured at mousedown, not the session at mouseup or move time
- Old: `endActiveStroke` used the mouseup render's `editSession`, and moves used each render's `paintAt`. New: `stroke.session` (`useStrokeChain.ts:73,76,96`).
- GBC `post` depends on `[mapName, initialBlocks]` (`useGbcEditSession.ts:126`). If `initialBlocks` changes identity mid-stroke on the same map (a payload refetch), the rest of the stroke's responses fail the seed check and are not applied to the view. Before, the end response was applied.
- GBA `call` depends on `[mapName]` only, so GBA is not affected. This is a narrow edge case. Accept or record it.

### Minor 3: test gaps against the Step 1 and Step 5 lists
- Retirement before the begin link has run is not tested. That covers the `useStrokeChain.ts:85` guard, for example when begin is queued behind a held previous end and the map switches. Every retirement test retires after begin was issued (`useStrokeChain.test.tsx:104-168`, `MapCanvasStroke.test.tsx:167-206`). Deleting `:85` would issue a begin on a retired visit, and I found no test that would fail. Step 7's "retired visit still paints" mutant should include this line.
- `useStrokeChain.test.tsx:89-94` ("queue without an open stroke is a no-op") cannot fail: there is no session to observe. It asserts only `isOpen()`.
- GBA end-phase retirement is tested for map change only (`MapCanvasStroke.test.tsx:191`). ABA and unmount at end are covered only in the shared suite.

### Minor 4: some negative assertions are not preceded by `await act(async () => {})` (brief Step 1 rule)
- `MapCanvasStroke.test.tsx:95-96`: synchronously after `fireEvent.mouseUp`.
- `:110`: after `waitFor` only.
- `:130-131`: the first loop iteration, directly after `fireEvent.mouseUp`.
- They are still meaningful here, because begin and apply are held, but they do not meet the stated convention.

## ⚠️ Cannot verify from the diff
- The live request order (Step 8) and the mutation kills (Step 7) are coordinator steps and were not run here.
- Whether a mid-stroke map switch is actually reachable in the GBA UI (Important 2's likelihood) depends on App keyboard and warp-follow paths I did not trace end to end.
