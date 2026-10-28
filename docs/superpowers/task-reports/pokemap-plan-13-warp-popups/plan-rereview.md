**Verdict: Needs rework.** The revision addresses most original findings, but cache invalidation, redraw, and focus ownership remain incomplete. Six open or new findings follow.

1. **Important — Incoming-warp invalidation misses requests already in flight.**  
   Plan lines 126–130 scan cached warps for references to saved map B. However, [WorldSurface.tsx:504](</C:/Programming Projects/PokeMap/packages/ui/src/canvas/WorldSurface.tsx:504>) represents a pending request as `warpCache.current.set(name, null)`. An outstanding A→B request therefore has no discoverable B dependency. Its untouched token later passes line 511’s check and caches stale destination coordinates. GBC embeds those coordinates in the source entry at [gbc/worldSurface.tsx:304](</C:/Programming Projects/PokeMap/packages/ui/src/gbc/worldSurface.tsx:304>): `point: { x: warp.destEvent.x, y: warp.destEvent.y }`.  
   Add a deferred incoming-request test: request A, save B, then resolve A with old B coordinates. Use dependency-aware request generations or resolve destination endpoints from the destination cache.

2. **Important — The popup itself disables its editing shortcuts.**  
   Task 4 requires `aria-modal="true"` and working tool shortcuts, but [shortcutGuard.ts:7](</C:/Programming Projects/PokeMap/packages/ui/src/shared/shortcutGuard.ts:7>) blocks whenever `document.querySelector('[aria-modal="true"]') !== null`. [Toolbar.tsx:71](</C:/Programming Projects/PokeMap/packages/ui/src/components/Toolbar.tsx:71>) applies this guard to tool and undo/redo shortcuts; [useFitShortcut.ts:16](</C:/Programming Projects/PokeMap/packages/ui/src/shared/useFitShortcut.ts:16>) applies it to Fit.  
   The plan needs explicit shortcut ownership for the popup workspace, with background handlers suppressed and nested dialogs taking precedence. Cover tools, undo/redo, and Fit.

3. **Important — A pending open can survive a mode change and create two active workspaces.**  
   Plan lines 170–173 introduce an asynchronous opening interval but only suppress additional popup opens. During that interval, [FamilyApp.tsx:127](</C:/Programming Projects/PokeMap/packages/ui/src/shell/FamilyApp.tsx:127>) still allows `switchMode`, which calls `ctx.leaveContext(); setMode(next);`. The normal Map branch renders `runtime.renderMap(slots)` at line 247.  
   Switching to Map while opening waits for a stroke can therefore leave the queued popup opening over an already active Map workspace. Capture and validate the originating selection/mode, cancel pending intent on competing navigation, and recheck `blocked()` after settlement. Add a deferred-stroke plus mode-change test.

4. **Important — `warpEpoch` still does not invalidate the graphics memos.**  
   Plan lines 128–130 add the epoch to the fetch effect and claim this causes redraw. But the marker memo at [WorldSurface.tsx:533](</C:/Programming Projects/PokeMap/packages/ui/src/canvas/WorldSurface.tsx:533>) depends on `warpVersion`, and the connection-line memo at line 568 does likewise; neither includes `warpEpoch`.  
   Evicted markers and lines can remain visible while replacement requests are pending—and indefinitely if replacement fails. Explicitly invalidate both memos during eviction. Extend the stationary-view test to inspect graphics **before** the replacement succeeds and after replacement failure.

5. **Important — The focus fix omits the nested sign editor.**  
   Plan lines 193–194 add traps to Save, switch, and Indicator dialogs. [SignEditor.tsx:83](</C:/Programming Projects/PokeMap/packages/ui/src/shared/SignEditor.tsx:83>) is another modal: `role="dialog" aria-modal="true"`, with an `onKeyDown` that only handles Escape. It renders inside both workspaces, including [MapEditingWorkspace.tsx:178](</C:/Programming Projects/PokeMap/packages/ui/src/components/MapEditingWorkspace.tsx:178>).  
   The outer popup trap contains focus within the entire workspace, allowing Tab to leave the sign editor. Add sign-editor containment and ensure the outer trap defers to the nested dialog. Test Tab and Shift+Tab there.

6. **Minor — The revised cache strategy contradicts the unchanged spec.**  
   Plan lines 126–127 now evict incoming source entries, while [the spec:65](</C:/Programming Projects/PokeMap/docs/superpowers/specs/2026-10-28-pokemap-plan-13-warp-popups-design.md:65>) explicitly requires: “Other maps’ warp entries stay.” The underlying mismatch is real: GBC caches destination coordinates, whereas [gba/worldSurface.tsx:201](</C:/Programming Projects/PokeMap/packages/ui/src/gba/worldSurface.tsx:201>) resolves them through `cache.get(warp.destMapName)`.  
   Either retain the spec’s contract through cache-based GBC resolution or update the spec to authorize dependency-based eviction and define its boundaries.

No files changed or tests run.