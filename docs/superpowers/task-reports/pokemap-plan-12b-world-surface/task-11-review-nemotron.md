Approved with fixes

### 1. Correctness bugs in shared core

**packages/ui/src/canvas/useWorldTiles.ts:54-64** — Cache-key change drops entries but `tileVersions` refetch isn't gated by the new key.  
Scenario: GBC time switch (`cacheKey` "day"→"nite") fires, `mapRef` cleared, but an in-flight `tileVersions` bump for map "A" from before the switch still triggers `setVersion` and a new request for the *old* key's URL. The load lands on a mapRef that no longer has that entry (it was cleared), so the load is silently ignored — correct. But the `setVersion(v=>v+1)` still fires, causing a spurious version bump that triggers a draw loop with no new tile.  
Evidence: `cacheKeyRef` updated before the loop, but `tileVersions` check runs after (`visible, cacheKey, tileVersions` deps). A `tileVersions` change during a key switch still bumps version.

**packages/ui/src/canvas/useWorldDrag.ts:172-183** — `onMouseLeave` commits on uncaptured leave, but `onMouseUp` also commits.  
Scenario: Captured drag → release outside canvas. Browser fires `pointerup` on canvas (capture held) then `mouseleave` (after release). Both `onMouseUp` and `onMouseLeave` run `commit`, doubling POSTs.  
Evidence: `onMouseLeave` calls `onMouseUp` when no capture (`if (!o.stage.hasCapture()) onMouseUp()`), but with capture held, `hasCapture()` is true so `onMouseLeave` does nothing — **correct**. But `pointerup` fires *before* `lostpointercapture`; `onPointerCancel` is not wired to cancel the drag (only `stage.onPointerCancel` is). The drag state stays live until `mouseup`/`mouseleave`, so no double-commit. **OK.**

**packages/ui/src/canvas/WorldSurface.tsx:370-385** — `warpInputs` ref updated in `useLayoutEffect`, but `warpScope` effect reads it in `useEffect`.  
Scenario: Rapid view change + `warpsOn` toggle. Layout effect runs before paint, effect after. If `warpScope` changes between layout and effect, the effect reads stale `warpInputs` (previous render's adapter/world).  
Evidence: `warpInputs.current = { adapter, world }` in `useLayoutEffect`, `useEffect` deps include `warpScope, view, warpsOn, linesOn, mapFilter, viewport.w, viewport.h`. A `viewport` resize between layout and effect reads old `world` (placements before culling). **Fix:** move `warpInputs` update into the effect or use a single `useEffect` with `useLayoutEffect` for the whole fetch.

**packages/ui/src/canvas/WorldSurface.tsx:430-445** — `encounterCache` never cleared on `cacheKey` change (GBC time switch).  
Scenario: GBC time "day"→"nite". `cacheKey` changes, tiles cleared, but `encounterCache` retains entries keyed by map. Encounter summaries for "day" shown under "nite" border dimming.  
Evidence: `useWorldTiles` clears on `cacheKey` change (line 44-46), but `encounterCache` in `WorldSurface` has no `cacheKey` dependency. Spec P12-7 says "a time switch drops the old time's tiles instead of keeping them on screen" — encounters should also refetch or at least not show stale dimming. **Fix:** add `cacheKey` to encounter effect deps and clear cache.

**packages/ui/src/canvas/useStage.ts:54-67** — Continuous wheel reads `boundsFor` from ref published at commit, but `zoomBy` calls `boundsFor.current?.(view.zoom)` inside updater.  
Scenario: In-context cap changes (e.g., context overlay mounts). `maxZoomRef` updated in `useLayoutEffect` (WorldSurface line 58-60), but wheel listener bound once reads `boundsFor` from policy ref. If cap shrinks *during* a batched wheel, the second event uses new cap — correct. If cap *grows*, second event uses new higher cap — correct. **OK.**

**packages/ui/src/canvas/useStage.ts:139-151** — `releaseCapture` clears `capture.current` *before* calling `releasePointerCapture`.  
Scenario: `releasePointerCapture` throws (some environments). `capture.current` already null, so `hasCapture()` returns false, but browser still has capture. Subsequent `lostpointercapture` fires, `cancelCapture` runs, drag cancelled. **OK** — the try/catch swallows the throw, capture already cleared.

---

### 2. Behaviour drift from rulings

**packages/ui/src/canvas/worldView.ts:98** — `JUMP_FILL_FRACTION = 1` (full fill), but `jumpFit` scales *before* clamp (line 118-121).  
Ruling P12-4m amended: "both families jump with GBA's old full fill". GBA's old jump was `computeFit` (100% fill, clamped). `jumpFit` at fraction=1 equals `computeFit` — **correct**.

**packages/ui/src/gbc/worldSurface.tsx:288** — `jumpFit` wrapper passes `JUMP_FILL_FRACTION` (0.6) as default, but calls `worldJumpFit` (fraction=1).  
Ruling P12-4m amended: GBC should use full fill (1). The wrapper's default parameter is 0.6 but it's not used — `worldJumpFit` ignores the fourth argument. **Drift:** GBC jump uses 1 (correct), but the wrapper's signature still advertises 0.6. Test `GbcWorldCanvas.test.tsx:1211` expects 60% — **test not rebased**. Evidence: `GbcWorldCanvasSurface.test.tsx:145` expects 63% (full fill 20/32=63%), but `GbcWorldCanvas.test.tsx:1211` still expects 38% (60% of 10=6 → 38%). **Test must be updated.**

**packages/ui/src/canvas/WorldSurface.tsx:205-215** — Jump highlight keyed by `jumpToken` (P12-4p), but `pendingJumpFit` uses `hasSize(p)` check.  
Scenario: Jump to map with placement but zero size (orphan). `hasSize` false → `pendingJumpFit` null → no fit, no highlight. But `jumpHighlight` still set (line 208). Highlight shows at wrong rect (outline uses `outline(map)` which returns `rectOf` on 0×0 placement → 0×0 rect).  
Evidence: `hasSize` requires `width>0 && height>0`. Orphan placements have 0 size until `sizeByMap` recovers. **Fix:** wait for size recovery or use `sizeOf` in jump effect.

**packages/ui/src/canvas/WorldSurface.tsx:260-275** — `drawn` includes `revealed` maps, but `visible` culls to viewport.  
Ruling P12-4q: "jumping to a placed map the visibility predicate hides reveals it for the session". `revealed` added in jump effect (line 209). But `drawn` filter: `inScope(p.map) && (mapFilter !== null || adapter.drawnByDefault(p) || revealed.has(p.map))`. If `mapFilter` is set (dungeon mode), `mapFilter !== null` true → revealed ignored. **Drift:** In dungeon mode, a jump to a hidden (non-drawnByDefault) map in the filter does *not* reveal it — the filter gate overrides. Spec says "in both families" — should reveal regardless of filter. **Fix:** `revealed.has(p.map)` should bypass `drawnByDefault` even under filter.

**packages/ui/src/gba/worldSurface.tsx:180-185** — `fetchWarps` validation skips `mapName` check (comment: "GBA does not validate the optional `mapName`, as before").  
Ruling P12-4r/s: "payload validation (including map identity)" and "failed fetch drops cache entry, retries on view change". GBA adapter omits `mapName` validation. **Drift:** GBC validates (`payload.mapName !== name` throws), GBA does not. Spec: "the adapter owns the request, payload validation (GBC checks `payload.mapName`)". GBA should validate too. **Fix:** add `mapName` check in GBA `fetchWarps`.

**packages/ui/src/canvas/WorldSurface.tsx:400-410** — Warp fetch scope: `warpsOn && !smallTilesAt` for visible, `mapFilter && linesOn` for filter.  
Ruling P12-4r: "visible maps at zoom ≥ LOD while Warps is on, plus every filter map while lines are on". Code matches. But `smallTilesAt` uses `LOD_SCALE=0.25` (native×0.25). GBA native 16 → 4 px/tile; GBC native 32 → 8 px/block. **Correct.**

**packages/ui/src/canvas/WorldSurface.tsx:415-435** — Failed warp fetch: `warpCache.delete(name)`, `setWarpError`, but no `warpVersion` bump.  
Ruling P12-4s: "failed fetch drops its cache entry, so the next view change retries it". Deleting cache entry is correct. But `warpVersion` not bumped → `warpMarkerEntries`/`connectionLines` memos don't re-run → UI doesn't show retry until something else bumps `warpVersion`. **Fix:** `setWarpVersion(v=>v+1)` in catch.

**packages/ui/src/canvas/WorldSurface.tsx:158-165** — `initialFitDone` ref prevents re-fit, but `fitWorld` called in `useEffect` with `[world, viewport, fitWorld]`.  
Ruling P12-4e: "no tile is requested and nothing is drawn before the fit lands". `visible` returns `[]` until `view.fitted` (line 178-183). `useWorldTiles` runs with `visible=[]` → no requests. **Correct.** But StrictMode double-invokes effect: first mount runs fit, sets `initialFitDone=true`, second mount sees `initialFitDone` true and skips — **correct** (ref survives double-invoke).

**packages/ui/src/canvas/WorldSurface.tsx:185-195** — Filter fit: `fittedFilter` ref stamps `mapFilter` instance.  
Ruling P12-4m: "dungeon filter fits the filter's maps (GBA's rule)". GBA's rule: anchored members only, fallback to all. `fitFilter` implements this. But `fittedFilter` compares by reference (`===`), so a new `Set` with same contents re-fits. **Correct** — App.tsx mints fresh Set per dungeon open.

---

### 3. Save/discard ownership

**packages/ui/src/gba/worldSurface.tsx:45-65** — `useGbaWorld` reconciliation: `keep` set captured before `setRaw` updater (line 52-55).  
Ruling: "ledger snapshot captured before any React state updater". Code: `const snap = ledger.snapshot()` before `fetchGuarded`, then `keep` computed inside `.then()` before `setRaw`. **Correct.**

**packages/ui/src/gba/worldSurface.tsx:80-85** — `move` updates placements optimistically, but `version` not passed to `movePlacements`.  
Ruling P12-3: "one placement POST per moved map... reload once after all posts settle". `WorldSurface.commit` calls `ledger.moved(map, version)` then `postPlacement`, then `ledger.resolve`, then `reload`. GBA adapter's `postPlacement` doesn't receive version — but `commit` in `WorldSurface` passes `version` from drag dispatcher. **Correct.**

**packages/ui/src/gbc/worldSurface.tsx:120-135** — `useGbcSurfaceWorld` uses `overrides` for optimistic moves, reconciliation in `useEffect` with `[data, loadedGen, ledger]`.  
`keep` set computed before `setOverrides` updater (line 130-134). **Correct.**

**packages/ui/src/canvas/WorldSurface.tsx:330-350** — `commit` uses `Promise.all` on `moves.map(async ...)`. Each POST awaited, `ledger.resolve` per map, then single `reload()` after all settle.  
Ruling P12-3: "one reload after a group move... once per batch of POSTs". **Correct.** Early rejection: `Promise.all` rejects on first rejection → `reload()` and `onPlacementsSaved` never called. But spec says "fulfilled or rejected" — reload should happen even if some fail. **Bug:** `Promise.all` rejects immediately, skipping remaining awaits. Other POSTs still in flight but `reload()` called on first rejection. Evidence: line 342 `void Promise.all(...).then(...)`. If any rejects, `.then` not run, `.catch` not attached — unhandled rejection. **Fix:** use `Promise.allSettled` or attach `.catch` per promise.

---

### 4. Hub pre-warm

**packages/server/src/warmUp.ts:22-42** — `warmEach` yields via `setImmediate` before each map.  
Ruling P12-4w: "one map at a time with a yield between maps, so a client request queued meanwhile is answered after at most one map's render". **Correct.**

**packages/server/src/index.ts:1341-1380** — GBA `warmUp`: computes list via `resolveWorldPlacements` + sidecar, filters by `HIDDEN` (INDOOR, NONE) and manual.  
Ruling: "cache keys match the render route's keys (GBA `name:0`, GBC `name:0:day`)". GBA `cachedRender` key: `${name}:${border}` (border=0). Warm-up uses same key (`${name}:0`). **Correct.**

**packages/server/src/gbcRoutes.ts:300-335** — GBC `warmUp`: uses `buildGbcWorldPayload`, filters `p.manual || (p.mapType !== "INDOOR" && p.mapType !== "GATE")`. Key: `${name}:0:day`. Matches render route. **Correct.**

**packages/server/src/warmUp.ts:30** — `warmEach` catches per-map errors, logs, continues. Never rejects. **Correct.**

**packages/server/src/index.ts:1365** — GBA warm-up skips if `editSessions.has(name)`. GBC: `edit.openBlocks(name)`. Both check live edit sessions. **Correct.**

**packages/server/test/warmUp.test.ts** — Tests cover (a) cache hit after warm, (b) yield between maps, (c) skip edit session, (d) dispose stops, (e) synchronous render+cache, (f) unknown map failed, (g) no disk writes. **Comprehensive.**

---

### 5. Tests asserting too little

**packages/ui/test/WorldCanvasSurface.test.tsx:85-95** — P12-4c test: double-click without Edit-here opens Map view. Asserts `open` called with "A". But doesn't verify *no* Edit-here call (since `onEditHere` not passed). **Weak:** should also assert `onEditHere` not called if passed but no handler.

**packages/ui/test/WorldCanvasSurface.test.tsx:115-125** — P12-4e test: checks `imageFor("Near")` undefined (culled by fit), but doesn't assert *no request was made for Near at mount-default view*. The test relies on `FakeImage.instances` length — but `Near` would be fetched at mount zoom 1, then culled by fit. Test only checks final state. **Fix:** spy on fetch or `Image` constructor to assert Near never requested.

**packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx:200-220** — Group move test: asserts `posts` map/x/y, then `reloadSpy` called once after last resolve. But doesn't assert *order*: that `reload` called *after* both POSTs resolve, not after first. The `await settle()` between resolves hides ordering. **Fix:** use `vi.fn` on `reload` and assert `mock.invocationCallOrder[0] > posts[0].outcome.resolve.callOrder` etc.

**packages/ui/test/gbc/GbcWorldCanvasSurface.test.tsx:180-200** — P12-4a capture test: asserts `setPointerCapture` called with pointerId 1, but doesn't verify `hasPointerCapture` true during drag, or that `releasePointerCapture` called on `pointerup`. **Weak.**

**packages/ui/test/canvas/useWorldDrag.test.tsx:380-400** — Uncaptured leave test: asserts commit called once, but doesn't verify *which* commit (map vs group vs marquee). The test uses single-map drag, so OK, but should assert `commit` received correct `moves` array.

**packages/ui/test/canvas/worldView.test.ts:180-195** — `jumpFit` test with fraction=0.6 (old GBC value). P12-4m amended to 1. Test still uses 0.6 — **test not updated for ruling**. Should either test fraction=1 or be removed.

---

### Summary of required fixes

| File | Line | Issue | Severity |
|------|------|-------|----------|
| `useWorldTiles.ts` | 54-64 | Spurious version bump on cacheKey+tileVersions race | Important |
| `WorldSurface.tsx` | 370-385 | Stale `warpInputs` in warp fetch effect | Important |
| `WorldSurface.tsx` | 430-445 | Encounter cache not cleared on cacheKey change | Important |
| `gbc/worldSurface.tsx` | 288 | `jumpFit` wrapper default 0.6 unused but misleading | Minor |
| `GbcWorldCanvas.test.tsx` | 1211 | Test expects 60% jump, ruling amended to 100% | Important |
| `WorldSurface.tsx` | 260-275 | Revealed maps not drawn in dungeon mode (filter gate) | Important |
| `gba/worldSurface.tsx` | 180-185 | Missing `mapName` validation in fetchWarps | Important |
| `WorldSurface.tsx` | 415-435 | Failed warp fetch doesn't bump warpVersion | Important |
| `WorldSurface.tsx` | 330-350 | `Promise.all` rejects on first failure, skips reload for others | Critical |
| `WorldCanvasSurface.test.tsx` | 115-125 | Doesn't assert no pre-fit tile request | Minor |
| `WorldCanvasSurface.test.tsx` | 85-95 | Doesn't assert Edit-here not called | Minor |
| `worldView.test.ts` | 180-195 | Tests old 0.6 fraction | Minor |

**Verdict:** Approved with fixes (12 findings: 2 Critical/Important, 10 Important/Minor). All are localized, evidenced, and fixable without architectural changes.
