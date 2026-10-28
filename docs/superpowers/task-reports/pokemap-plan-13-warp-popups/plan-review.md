**Verdict: Needs rework.** Seven Important findings and one Minor finding. No Critical findings. No files changed or tests run.

1. **Important — Popup readiness does not identify the destination map.**  
   Task 4, lines 169–171, renders the workspace whenever `runtime.map.ready` is true. But [gba/adapter.tsx:129](</C:/Programming Projects/PokeMap/packages/ui/src/gba/adapter.tsx:129>) defines readiness as `Boolean(layout.data)`, then renders `mapName={selected} data={layout.data}` at line 134. Its own comment at line 65 states: “`useMapLayout keeps the previous map's data until its fetch lands`.”  
   Opening destination B can therefore display A’s workspace data under B’s name. Require map-name-matched readiness and a deferred destination-fetch test asserting Loading until B arrives.

2. **Important — Opening can bypass dirty protection during an unsettled stroke.**  
   Task 4, lines 155–158, waits for `strokeSettled()` only when closing. [FamilyApp.tsx:76](</C:/Programming Projects/PokeMap/packages/ui/src/shell/FamilyApp.tsx:76>) forwards opening directly through `guardedLeave`; [gba/adapter.tsx:61](</C:/Programming Projects/PokeMap/packages/ui/src/gba/adapter.tsx:61>) decides using `if (sameMap || !editSession.isDirty) go();`. GBC uses the same policy at [gbc/adapter.tsx:67](</C:/Programming Projects/PokeMap/packages/ui/src/gbc/adapter.tsx:67>): `if (sameMap || !session.isDirty) go();`.  
   An outstanding paint response can make the source dirty after selection has already changed. Opening also needs settlement followed by a fresh-render guard decision, with a deferred-stroke regression.

3. **Important — Self-warps can leave both editing workspaces active.**  
   Task 4 explicitly opens self-warps without changing selection, contradicting Review Focus 1’s assumption that the World host is inactive. [useContextEditing.ts:33](</C:/Programming Projects/PokeMap/packages/ui/src/shared/useContextEditing.ts:33>) only exits automatically when `selected !== contextMap`. [gba/adapter.tsx:110](</C:/Programming Projects/PokeMap/packages/ui/src/gba/adapter.tsx:110>) renders an active workspace whenever `contextLayout` exists; [gbc/adapter.tsx:87](</C:/Programming Projects/PokeMap/packages/ui/src/gbc/adapter.tsx:87>) computes `contextActive = s.contextMap !== null && ready !== null`.  
   Explicitly end or suspend context editing when opening a self-warp. Test self-warps **during context editing**, including single ownership of shortcuts and strokes.

4. **Important — Refreshing only the saved map leaves GBC incoming dungeon lines stale.**  
   Task 3, lines 121–131, requires retaining other maps’ caches and fetching only the saved map. However, [gbc/worldSurface.tsx:302](</C:/Programming Projects/PokeMap/packages/ui/src/gbc/worldSurface.tsx:302>) caches destination coordinates inside each source warp: `point: { x: warp.destEvent.x, y: warp.destEvent.y }`. Those coordinates were read from the destination file by [gbcRoutes.ts:275](</C:/Programming Projects/PokeMap/packages/server/src/gbcRoutes.ts:275>): `loadGbcMapEvents(proj.root, target).events.warps[event.destWarp - 1]`.  
   Saving a moved warp in B and refreshing B leaves cached A→B endpoints unchanged. Add a cache-based GBC destination resolver, analogous to GBA’s, and test an incoming line updating while A’s cache remains intact.

5. **Important — The focus plan does not trap Tab in the topmost dialog.**  
   Spec item 5 requires this, but Task 4 adds trapping only to `WarpPopup`. Save and switch dialogs are siblings at [FamilyApp.tsx:256](</C:/Programming Projects/PokeMap/packages/ui/src/shell/FamilyApp.tsx:256>) and line 268. Their keyboard handlers only implement Escape: [SaveDialog.tsx:142](</C:/Programming Projects/PokeMap/packages/ui/src/components/SaveDialog.tsx:142>) says `if (e.key === "Escape") onCancel();`; [SwitchPromptDialog.tsx:12](</C:/Programming Projects/PokeMap/packages/ui/src/shared/SwitchPromptDialog.tsx:12>) similarly handles only Escape.  
   Their Tab events cannot reach a popup-local trap. Add topmost-dialog focus ownership to the task, covering Save, switch and Indicator dialogs, with Tab/Shift+Tab and focus-return tests.

6. **Important — Warp eviction needs an explicit refetch and redraw trigger.**  
   Task 3 specifies deleting cache/request entries on `tileVersions` changes. The fetch effect at [WorldSurface.tsx:522](</C:/Programming Projects/PokeMap/packages/ui/src/canvas/WorldSurface.tsx:522>) depends on `[warpScope, view, warpsOn, linesOn, mapFilter, viewport.w, viewport.h]`; deleting refs changes none of these. Marker and line memos depend on `warpVersion` at lines 533 and 568.  
   Specify how invalidation triggers both fetching and redraw without making ordinary failures trigger retry loops. The test must save over a stationary view, delay the replacement response, and verify graphics update without panning or toggling.

7. **Important — Removing `warpError` leaves unresolved-marker errors without a valid state path.**  
   Task 3 replaces `warpError` with failed-fetch counts, while Task 5 requires unresolved-marker behavior unchanged. [WorldSurface.tsx:595](</C:/Programming Projects/PokeMap/packages/ui/src/canvas/WorldSurface.tsx:595>) currently uses `setWarpError(adapter.unresolvedWarpError)`. An unresolved destination can follow a **successful** fetch, so it cannot truthfully enter `failedWarps`.  
   Specify separate unresolved-error state and clearing rules. Preserve the existing unresolved-message assertion alongside the counted-fetch tests.

8. **Minor — The GBC server test does not verify query-parameter wiring.**  
   Task 1 tests `buildGbcWorldPayload` directly with options, but the real route at [gbcRoutes.ts:502](</C:/Programming Projects/PokeMap/packages/server/src/gbcRoutes.ts:502>) currently calls `buildGbcWorldPayload(proj, getWorld(), readSidecar(proj.root), getWarps())`. The helper test can pass while the route never forwards `scope`.  
   Add an HTTP regression comparing `/api/world` with `/api/world?scope=dungeon`, and mutate the route forwarding independently.