# Plan 7 Task 5b: independent spec-compliance review (Claude)

Reviewed tree: the detached worktree `scratchpad/h` at HEAD `ef248a3`. Range: `9ce8b45..ef248a3`, covering the original 5b commits `d35e6d6 1cf5630 77be233 a8be018 ede8df3` and the follow-ups `6c8ccd4..ef248a3`.
Binding inputs: `task-5b-spec.md` and `packages/ui/DESIGN.md`. I treated the Codex-authored fix-spec and archive reports as unverified claims and did not rely on them.

## Verdict: PASS WITH FINDINGS

- 0 Critical, 0 Important, 6 Minor findings, plus 1 process incident caused by this reviewer (see "Incident" below).
- Every Design item 1-6 and every Tests item 1-5 is implemented as written.
- I re-derived the B1 ordering guarantees and found no interleaving that breaks them within one canvas instance. The only gap is across instances (F2).

## Findings

| ID | Sev | Where | Evidence | Concrete failure scenario |
|---|---|---|---|---|
| F1 | Minor | `packages/ui/test/gbc/GbcMapCanvasEdit.test.tsx:263-269` | B1 changed one sync assertion to `waitFor` (line 267). Since b0f448a, moves are queued on the `pendingPaintRef` chain and call `applyPaint` in a later microtask. That makes the synchronous `toHaveBeenCalledTimes(1)` at 265 and `toHaveBeenCalledTimes(2)` at 269 vacuous: a broken same-cell dedupe would queue an apply that has not been invoked yet when the assertion runs. | A dedupe regression would still pass this test. It would be caught by "serializes three independently held drag applies" (same file, `mock.calls` target list `[[0,0],[1,0],[2,0]]`), so overall coverage holds. Fix: `await act(async () => {})` before each sync count. |
| F2 | Minor | `packages/ui/src/gbc/GbcMapCanvas.tsx:300,660,712`; server `packages/server/src/gbcEditRoutes.ts:176-195` | `pendingPaintRef` is per `GbcMapCanvas` instance. The World overlay canvas and the Map-view canvas are different instances that use the same server session. Server `paint/begin` does `strokeStartBlocks ??=` and `paint/end` clears it. | (1) End a stroke on the context overlay while its begin/apply round trip is slow, so `end` is still queued. (2) Click Map. (3) Start a stroke at once. The new `begin` can reach the server before the old `end`. The old `end` then pushes an undo step that contains part of the new stroke, and the new stroke's later applies land outside any undo step. Rare (it needs a slow round trip plus a fast user). GBA `MapCanvas` has the same per-instance scope, so this is not a regression. |
| F3 | Minor (pre-existing, not a regression) | `GbcMapCanvas.tsx:728-756` | `onMouseUp` ends only when `activeTool && kind !== "dropper"`. `onMouseLeave` needs `activeTool`. | If the tool is cleared (activeTool → null) during a held drag, the stroke is never ended. The next stroke's `begin` then keeps the old snapshot (`??=`), and two strokes merge into one undo step. GBA `MapCanvas.tsx:886-905` behaves the same. Out of 5b scope; listed for completeness. |
| F4 | Minor (doc) | spec Teeth-proof X2 | X2 says test group 1 must go red. The pure `contextViewGbc` tests pass `native` explicitly, so they cannot see a call-site mutation. The kills come from group 3/4 instead (see the X2 row in the teeth table). | None in code. The teeth table misattributes the kill. |
| F5 | Minor (scope) | `packages/server/test/world.test.ts` (ef248a3) | This is outside the 5b spec. The commit message has no body naming the reason. On substance it is a **strengthening**: (a) it pins a scratch fixture sidecar (`dungeonAutoLayout: true`, manual `Route119`) instead of reading or writing the real decomp's `.pokemap/world.json`; (b) it adds 4 assertions (`on/off.sidecar.dungeonAutoLayout`, `after < flipped`, `?dungeons=1 == after` when the sidecar is off, which matches `resolve.ts:46` `(opts.dungeons ?? true) && sidecar.dungeonAutoLayout`); (c) it removes no assertion. Only comments and the sidecar path changed. | None functionally. It does break spec Tests 5's "outside any named reason" bookkeeping, because the reason exists only in the commit subject and code comments. |
| F6 | Minor (parity) | `GbcMapCanvas.tsx:300-319,650-725` vs `components/MapCanvas.tsx:681-855` | B1 makes GBC strictly stronger than GBA: serialized pencil trail, visit retirement, and end after every apply round trip. GBA still has parallel trail applies, `end` racing the last apply, and no retirement on map switch or unmount. This departs from the spec's "port it, don't reinvent". The departure is justified as a bug fix. | GBA keeps the same races. Track a GBA follow-up. Do not fix it in 5b. |
| F7 | Info (coordinator tooling) | `scratchpad/mut-results.json` (coordinator data; I did not run it) | X5 is recorded `killed:false` although the mutant run shows `failed: 3` (the three dirty-session GbcAppContext tests), with `"assertion": false`. | The mutation report understates teeth: X5 is in fact killed. The classifier needs checking. |

### Incident (reviewer-caused; please act on it)

- **What happened:** At about 00:23:50-00:24:15 PDT I extracted pristine copies of every tracked file from `h` into `scratchpad/m` with `tar` (`node_modules` and `.git` excluded). I mistook `m` for a fresh directory. It is the coordinator's mutation worktree, and `mut.mjs` was running there.
- **Content:** `h` and `m` are both clean at `ef248a3`, so the bytes written equal HEAD. Only a mutant that was applied at that moment could have been reverted.
- **Which mutant was exposed:** `mut-results.json` (written 00:24:16) records the mutant in flight then, `B1-begin-not-awaited`, as killed. A false result would have shown as a survivor, so none is visible. The next mutant (`GbcMapCanvas.tsx` modified at 00:24:32) was applied after my write.
- **Current state of `m`:** `git -C m status --porcelain` shows only that mutant's file.
- **Side effects:** `tar` may also have added ignored or untracked build files from `h` (for example `packages/*/dist`). My attempt to create a junction failed, so nothing was changed there.
- **Recommendation:** re-run `B1-begin-not-awaited` to be safe. I made no further writes to `m`.

## Per-item checklist

### Design

| # | Requirement | Status | Evidence |
|---|---|---|---|
| D1 | `native` parameter, default 16; GBA byte-identical; GBA tests unchanged; GBC cases incl. exact inverse | PASS | `world/contextView.ts:4,9,21,39,52` (default `NATIVE = 16`). `git diff --quiet 9ce8b45 ef248a3 -- packages/ui/test/world/contextView.test.ts` → unchanged. `test/world/contextViewGbc.test.ts` has snap 32/64/128→1/2/4, enter-centre and round-trip loops. I re-derived the arithmetic in every case. |
| D2 | `GbcMapCanvas` `view?`/`onViewChange?`/`chromeless?` mirroring GBA E1/E4; origin from `BORDER_RINGS` | PASS | Props `GbcMapCanvas.tsx:153-160,284` match `MapCanvas.tsx:125-131`. `updateView` reports through the ref and does not set state when controlled. No auto-fit when controlled (`:458`). Chrome is hidden behind `!chromeless` (`:763` onward). `GBC_COMPOSITE_ORIGIN = BORDER_RINGS * BLOCK_PX` (`:89`), used at `:376` and `GbcApp.tsx:258`. |
| D3 | `GbcWorldCanvas` `onEditHere`/`context`/`tileVersions`; overlay, dim, bar; snap; capture Escape; outside double-click exits; plain double-click enters and Shift opens; cap 32*4; no remount; Edit here enabled | PASS | Overlay `GbcWorldCanvas.tsx:1438-1461`, inside `.world-canvas__viewport`. Snap effect `:960-980` (client point converted with the box at snap time, `native: BLOCK_PX`). Capture listener `:996`. Guards: defaultPrevented, menu, `[aria-modal]`, text field. Outside double-click `:1017-1024`. Shift branch `:1140`, plain branch `:1159`. `GBC_CONTEXT_MAX_ZOOM = GBC_MAX_ZOOM * 4` (`:113`, used `:944`). `editItem` enabled with no hint (`:524`). |
| D4 | `tileVersions` refetch of exactly one tile with `&v=n` | PASS | `GbcWorldCanvas.tsx:690-717`: deletes only the changed map's cache entry; the URL carries `&v=${version}`. `GbcApp.tsx:368-371` bumps only when `contextMap === selected`. |
| D5 | `GbcApp` contextMap/enter guard/exit guard/SaveDialog Cancel stays/mode switch no prompt/tree click leaves/builder reuse/`active={false}` seam | PASS | `GbcApp.tsx:81` (state). `:197-206` enter goes through `leave()`. `:209-212` exit. `:215-218` switchMode. `:154` tree click. `:220-222` invariant effect. `:258-262` overlay canvas = `{...canvasProps} chromeless view onViewChange`, with props built once in `GbcMapEditing.tsx:131-147` (`GbcMapEditingCanvasProps`, `:20`). Persistent host: `GbcApp.tsx:318-334` (`key="world-host"`, `active={contextActive}`, `renderCanvas`). The seam mirrors `MapEditingWorkspace.tsx:36-43,72`. |
| D6 | GBA deferrals stay deferred and are noted | PASS | `DESIGN.md` new section "In-context editing (GBC, Plan 7 Task 5b)", last bullet. No code fixes them. |

### Tests

| # | Requirement | Status | Evidence |
|---|---|---|---|
| T1 | contextView GBC cases | PASS | `contextViewGbc.test.ts` (snap table, two enter cases, forward and inverse literals, 4×3×3 round trip both directions). |
| T2 | controlled view (wheel/pan report, no internal fit, chromeless), read-only default unchanged | PASS | `GbcMapCanvasView.test.tsx:143-196,262-280`. The only removed line in existing GbcMapCanvas tests is the F1 `waitFor` change. |
| T3 | Edit here enabled + calls; double-click enter / Shift → Map; overlay in viewport box with same DOM node and no `/api/world` refetch; capture-phase Escape with modal/menu exclusions and a document flush listener; outside double-click exits; one-tile version bump | PASS | `GbcWorldCanvasContext.test.tsx:103-192` (enter, Shift/Ctrl/Meta, drag, Dungeon, warp marker, menu). `:201-237` (overlay + identity + world fetch count). `:362-375` (document bubble flush). `:377-390` (menu). `:392-400` (fields). `:411-426` (outside double-click). `:501-527` (tileVersions). At app level: `GbcAppContext.test.tsx:211-237` (identity + fetch count). |
| T4 | GbcApp enter guard, dirty exit → SaveDialog/Cancel stays, commit bumps + markClean, mode switch no prompt, tree click leaves | PASS | `GbcAppContext.test.tsx:322-333,335-344,346-365,367-381,383-394,399-432,434-442`. |
| T5 | GBA tests unchanged except named reasons | PASS (with F5) | `git diff 9ce8b45 ef248a3 -- packages/ui/test/ \| grep -c '^-[^-]'` = **16**, all in GBC files: 11 for the disabled "Edit here" menu tests and the double-click-opens-map test (expected by spec; replacements at `GbcWorldCanvas.test.tsx:1832-1873`, `GbcApp.test.tsx:354` now Shift, plus the new Context tests), 2 import lines moved in `GbcMapEditing.test.tsx`, 1 F1 line. GBA production changes: only `contextView.ts` (default-preserving). GBA test files touched: only `packages/server/test/world.test.ts` (F5, strengthening). |

## Teeth-proof X1-X8 (judged by reading; `mut-results.json` is coordinator data, cited only as corroboration)

| ID | Test that goes red | Real? |
|---|---|---|
| X1 `NATIVE = 32` | `contextView.test.ts` snap table, e.g. `[23, 2]`: 23/32 gives log2 −0.47, so 1 ≠ 2. Also `contextViewGbc` "without native it is still the GBA scale". | Yes |
| X2 GBC passes 16 | **Not** group 1 (F4). At `enterContextView`/`mapViewFromWorld`: GbcWorldCanvasContext "snaps the world once…" (`zoom 100%` and view `{1,(-92,-92)}`) and GbcAppContext border-ring test. At `snapContextZoom` alone: re-entry at world zoom 32 snaps to 2 instead of 1, which fails GbcWorldCanvasContext:462-472 and GbcAppContext:166-209 (draw size 384). | Yes (I checked the partial call-site variant separately) |
| X3 remount | `GbcWorldCanvasContext.test.tsx:226-237` and app-level `GbcAppContext.test.tsx:226-227,289` (`toBe(canvas)`, same `.app__map-editing-body`). | Yes |
| X4 bubble Escape | `:362-375`: the document bubble listener removes the modal before a window bubble listener runs, so the exit fires. | Yes |
| X5 dirty exit with no dialog | `GbcAppContext.test.tsx:322-365` (3 tests). | Yes (see F7) |
| X6 bump every tile | `GbcWorldCanvasContext.test.tsx:517` (MapA requested exactly once). | Yes |
| X7 origin 0 | `GbcAppContext.test.tsx:239-276` (composite at (-42,-92) vs world (-10,-60)), plus `GbcMapCanvasView.test.tsx:134-137`. | Yes |
| X8 Edit here disabled | `GbcWorldCanvasContext.test.tsx:161-175`, `GbcWorldCanvas.test.tsx:1832-1849`, app `:312-319`. | Yes |

## B1 serialization: my re-derivation (`GbcMapCanvas.tsx`)

Every request in a stroke is a link appended to one per-instance promise chain (`pendingPaintRef`). Each link awaits its server round trip, and each link ends in `.catch`.

1. **Begin before the first apply.** The mousedown link `:660-667` awaits `beginStroke()`, sets `begun`, then returns `paintAt` (the apply promise), so the link settles after the apply round trip.
2. **Each apply round trip before the next.** A move link (`:683-685`) runs only after the previous link settled, and only if `ownsStroke && begun`.
3. **End after the last apply.** The `endActiveStroke` link (`:712-724`) is appended after every move link (moves stop once `strokeRef` is nulled at `:708`). For rect/shift it awaits the apply, then `endStroke`.
4. **Next begin after the previous end.** Same chain, appended later.
5. **Retirement.** The layout cleanup on `[mapName]` or unmount (`:307-318`) swaps the visit object and, if a stroke is open, appends `end` only when `begun`.
   - If begin is still in flight, the appended link runs after it, sees `begun = true`, and ends the stroke on the captured old session (`stroke.end`).
   - Queued moves and the rect/shift apply are skipped (`ownsStroke` false).
   - If retirement happens after mouseup, `strokeRef` is already null, so no double end. The end link then drops the apply and still ends.
   - A visit A→B→A gets a fresh object, so the stroke is still retired.
6. **No unhandled rejections; retired errors stay hidden.** Every link has a terminal `.catch` guarded by `ownsStroke` (the cleanup link uses `.catch(() => {})`). The apply inside the end link uses `strokeFail`.
7. **Begin failure.** `begun` stays false, so moves don't paint, and the owned end still posts `paint/end`. That is a server no-op without `strokeStartBlocks` (`gbcEditRoutes.ts:185-195`).

I found no breaking interleaving within one instance. The cross-instance limit is F2, and the pre-existing tool-cleared leak is F3. Compared with GBA, see F6.

## Cached image (`loadedImageUrl`) and `GbcMapEditing` visit identity

- **Cached image** (`GbcMapCanvas.tsx:330,388,429-433,470`):
  - The old `setImgLoaded(false)` on URL change could overwrite an early `onLoad` for a cached image and strand the composite. The context overlay mounts a new canvas whose image is often already cached, which is exactly that case.
  - Keying readiness by URL and seeding it from `complete && naturalWidth > 0` is correct. A broken image (`naturalWidth 0`) still waits for load.
  - Verdict: a required fix for D3/D5 to work live, so in scope.
- **Visit identity** (`GbcMapEditing.tsx:60-91,108-121`):
  - The world host keeps `GbcMapEditing` mounted across context entries. That makes A→B→A revisits routine, and `forMap` keying alone would bring back stale picks or errors.
  - The reset during render plus the `isCurrent()` guards on deferred callbacks are correct React and are covered by the ABA tests.
  - Verdict: a consequence of D5's persistent host, so in scope. Map-view behaviour changes only in that a stamp no longer survives A→B→A, which matches Task 5's intent.

## Scope creep (beyond the spec text)

- **Justified GBC adaptations:**
  - In context, the +/- keys step 1/2/4 (`GbcWorldCanvas.tsx` key handler) and "Fit all" is disabled (`:1263`). GBC has continuous keyboard zoom and Fit all, which GBA's world lacks. Either would push `worldZoom/32` off {1,2,4} and hand `GbcMapCanvas` an invalid `Zoom`.
  - The context payload loading/error placeholder and the defects banner in context (`GbcApp.tsx:319-323`).
- **B1 rework:** see F6.
- **`world.test.ts` isolation:** see F5.
- **Nothing else** in `packages/` falls outside 5b.

## What I ran (executed) vs. read

Executed in `h` (no edits there):
- `npx vitest run packages/ui/test/world/contextView.test.ts packages/ui/test/world/contextViewGbc.test.ts packages/ui/test/gbc/GbcMapCanvasView.test.tsx packages/ui/test/gbc/GbcMapCanvasEdit.test.tsx packages/ui/test/gbc/GbcWorldCanvasContext.test.tsx packages/ui/test/gbc/GbcAppContext.test.tsx packages/ui/test/gbc/GbcAppContextSelection.test.tsx packages/ui/test/gbc/GbcMapEditing.test.tsx packages/ui/test/gbc/GbcWorldCanvas.test.tsx packages/ui/test/gbc/GbcApp.test.tsx` → **10 files, 339 passed, 0 failed**.
- `npx vitest run packages/ui/test/gbc/GbcMapCanvasEdit.test.tsx packages/ui/test/gbc/GbcMapCanvasView.test.tsx` → **2 files, 59 passed**, no "Unhandled" lines in the output.
- `git diff --quiet 9ce8b45 ef248a3 -- packages/ui/test/world/contextView.test.ts` → unchanged.
- `git diff 9ce8b45 ef248a3 -- packages/ui/test/ | grep -c '^-[^-]'` → 16 (itemised under T5).

Read only, not executed:
- The server `world.test.ts` (needs the corpus; the coordinator reports the full suite at 2,574/0).
- All mutation verdicts above.
- The `mut-results.json` contents I observed.

I ran no mutations myself (see "Incident" above).
