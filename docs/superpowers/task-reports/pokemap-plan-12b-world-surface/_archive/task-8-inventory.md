# Task 8 failure inventory (conductor run, wt-t8 after JUMP_FILL_FRACTION = 1; packages/ui: 96 failed / 1895 passed / 123 files)

## All failing tests

- test/App.test.tsx > App -- world click selects the map in the tree (Plan 6c C2) > a canvas click on a map highlights its tree row and scrolls it into view, without jumping the view (GBA mirror of GbcApp's F1 test)
- test/App.test.tsx > App -- world click selects the map in the tree (Plan 6c C2) > entering World after only a world click on B (no tree click ever) jumps to B
- test/AppContextEdit.test.tsx > App -- in-context editing (Plan 6c E4) > Done on a clean session removes the chrome and the overlay; World stays
- test/AppContextEdit.test.tsx > App -- in-context editing (Plan 6c E4) > Escape on a clean session leaves context too
- test/AppContextEdit.test.tsx > App -- in-context editing (Plan 6c E4) > a mode switch leaves context without a prompt; coming back to World starts without it
- test/AppContextEdit.test.tsx > App -- in-context editing (Plan 6c E4) > a tree click on another map leaves context (no remount of the chrome, no overlay) and selects that map
- test/AppContextEdit.test.tsx > App -- in-context editing (Plan 6c E4) > a tree click on the map being edited also leaves context (the jump it requests would move the world under the overlay)
- test/AppContextEdit.test.tsx > App -- in-context editing (Plan 6c E4) > double-clicking a map in World shows the editing chrome around the SAME world canvas, with no /api/world refetch
- test/AppContextEdit.test.tsx > App -- in-context editing (Plan 6c E4) > in context, GBA editing gets the rail (palette + inspector) around the SAME world canvas, with no /api/world refetch (Plan 9 D4)
- test/AppContextEdit.test.tsx > App -- in-context editing (Plan 6c E4) > with a dirty session > Done opens the SaveDialog and stays in context
- test/AppContextEdit.test.tsx > App -- in-context editing (Plan 6c E4) > with a dirty session > Escape opens the SaveDialog and stays in context; Escape inside the dialog cancels only the dialog
- test/AppContextEdit.test.tsx > App -- in-context editing (Plan 6c E4) > with a dirty session > a committed save refreshes exactly that map's world tile, as ?v=1
- test/AppContextEdit.test.tsx > App -- in-context editing, fix round (Plan 6c E4) > Fit is disabled while the context map loads (Plan 9 R5; mirrors GbcAppContext's pending-context test)
- test/AppContextEdit.test.tsx > App -- in-context editing, fix round (Plan 6c E4) > a pencil click on a cell of the overlay canvas goes through the edit session: paint/begin, paint/apply (pencil), paint/end, in order
- test/AppContextEdit.test.tsx > App -- in-context editing, fix round (Plan 6c E4) > a selection change that nothing else clears leaves context (defence in depth: the overlay normally covers the canvas)
- test/AppContextEdit.test.tsx > App -- in-context editing, fix round (Plan 6c E4) > in-context Fit and F fit the map being edited, as Map view's Fit does (Plan 9 R5)
- test/AppContextStroke.test.tsx > M5: Done waits for held paint/apply before deciding the dirty exit
- test/AppContextStroke.test.tsx > dirty Map and Dungeon mode switches leave context without prompting and preserve the session
- test/AppContextVisit.test.tsx > App -- in-context visits (Plan 8 Task 6) > different-map tree visits retire a context stamp across A to B to A while preserving tool and host
- test/WorldCanvas.test.tsx > WorldCanvas > a plain drag (no Shift) starting over a placed map pans the view instead of moving it, and never posts
- test/WorldCanvas.test.tsx > WorldCanvas > below the LOD zoom threshold, draws the cached downscaled buffer, not the full-resolution image
- test/WorldCanvas.test.tsx > WorldCanvas > computeFit's zoomBounds parameter overrides the default MIN_ZOOM/MAX_ZOOM clamp, and is left out by every existing call
- test/WorldCanvas.test.tsx > WorldCanvas > culls: fetches images only for placements intersecting the viewport, not every placement
- test/WorldCanvas.test.tsx > WorldCanvas > dragging a placed map posts its new position, and it survives a reload
- test/WorldCanvas.test.tsx > WorldCanvas > draws a marker for every conflict and shows a tooltip naming both disagreeing paths
- test/WorldCanvas.test.tsx > WorldCanvas > independently acknowledges two same-map badges by right-click, keeps placement, and survives remount
- test/WorldCanvas.test.tsx > WorldCanvas > keeps a near-edge badge action inside the viewport
- test/WorldCanvas.test.tsx > WorldCanvas > lists singleton maps absent from placements in the side rail, and lets one be dragged onto the canvas
- test/WorldCanvas.test.tsx > WorldCanvas > multi-select > Ctrl+click toggles a map in and out of the selection without starting a drag
- test/WorldCanvas.test.tsx > WorldCanvas > multi-select > Ctrl+drag left selects every map the marquee touches at all
- test/WorldCanvas.test.tsx > WorldCanvas > multi-select > Ctrl+drag right selects only maps fully enclosed by the marquee
- test/WorldCanvas.test.tsx > WorldCanvas > multi-select > Shift+drag on a selected map moves every selected map together, preserving offsets
- test/WorldCanvas.test.tsx > WorldCanvas > multi-select > Shift+drag on an unselected map moves only that one map, even with a selection active
- test/WorldCanvas.test.tsx > WorldCanvas > recovers a component:-1 placement's real size from its singleton component instead of treating it as 0x0
- test/WorldCanvas.test.tsx > WorldCanvas > redraws and updates hit actions when the accepted key changes but the count stays one
- test/WorldCanvas.test.tsx > WorldCanvas > releasing a Shift+drag by leaving the canvas (not mouseup) still posts the new position
- test/WorldCanvas.test.tsx > WorldCanvas > shows a malformed accept response without acknowledging the GBA badge
- test/WorldCanvas.test.tsx > WorldCanvas > warp toggle and markers (Feature B) > double-clicking a warp marker opens the destination popup; the × closes it without disturbing the canvas
- test/WorldCanvas.test.tsx > WorldCanvas > warp toggle and markers (Feature B) > draws a marker only for a warp on a currently-visible map, not the whole corpus, at the position the screen-space formula predicts
- test/WorldCanvas.test.tsx > WorldCanvas > warp toggle and markers (Feature B) > markers are hidden until the toggle is switched on, and hidden again once it's switched back off
- test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > Edit here is enabled and calls onEditHere when the prop is supplied, and is absent without it
- test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > Escape closes the menu and returns focus to the canvas
- test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > Shift+F10 opens the menu at the centre of the one selected map, with the map items only
- test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > Shift+double-click on a map opens it in Map view without ever POSTing a placement
- test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > a canvas mousedown (pan start) closes an open menu
- test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > a late successful save closes only the menu that issued it
- test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > a real right-click after a keyboard open is not swallowed: any canvas pointerdown re-arms it
- test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > right-click on a badge shows the map items plus the conflict item, in order
- test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > right-click on a map body offers Open in Map view, which opens that map
- test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > right-click on empty space shows no menu and closes an open one
- test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > the ContextMenu key opens the menu at the centre of the one selected map, with the map items only
- test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > the conflict error toast can be dismissed
- test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > the native contextmenu that follows a keyboard open, at empty space, leaves the menu as it was
- test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > the native contextmenu that follows a keyboard open, over another map, leaves the menu as it was
- test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > the native contextmenu that follows a keyboard open, with button -1 (keyboard origin), leaves the menu as it was
- test/WorldCanvas.test.tsx > WorldCanvas: encounter border (Plan 6c B3) > fetches /api/encounters/:map once per visible map and does not refetch on zoom
- test/WorldCanvas.test.tsx > WorldCanvas: encounter border (Plan 6c B3) > puts the border on the side pickBorderSide gives: Target's left is blocked by an off-screen neighbour -> top; Free stays left
- test/WorldCanvas.test.tsx > WorldCanvas: encounter border (Plan 6c B3) > wheeling in from zoom 1: a badge below the LOD threshold (4), sprites from 4 (not only from 8)
- test/WorldCanvas.test.tsx > WorldCanvas: onSelectMap (Plan 6c C2) > a plain click on a map calls onSelectMap once with its name
- test/WorldCanvasContext.test.tsx > WorldCanvas: in-context fix round (Plan 6c E4) > snap uses the canvas box as it is when the layout (and so the chrome) arrives > a later entry does not reuse an earlier pointer: with none recorded the canvas centre is used
- test/WorldCanvasContext.test.tsx > WorldCanvas: in-context fix round (Plan 6c E4) > snap uses the canvas box as it is when the layout (and so the chrome) arrives > the ContextMenu key's open point (the selected map's centre) is recorded in client px too
- test/WorldCanvasContext.test.tsx > WorldCanvas: in-context fix round (Plan 6c E4) > snap uses the canvas box as it is when the layout (and so the chrome) arrives > the right-click menu's open point is recorded in client px too
- test/WorldCanvasContext.test.tsx > WorldCanvas: in-context fix round (Plan 6c E4) > snap uses the canvas box as it is when the layout (and so the chrome) arrives > waits for context.origin, then converts the recorded client pointer with the shifted box
- test/WorldCanvasContext.test.tsx > WorldCanvas: in-context overlay (Plan 6c E4) > snaps at the recorded double-click pointer
- test/WorldCanvasContext.test.tsx > WorldCanvas: onEditHere double-click (Plan 6c E4) > Ctrl, Meta and Shift double-clicks do not call it (Shift opens the map instead)
- test/WorldCanvasContext.test.tsx > WorldCanvas: onEditHere double-click (Plan 6c E4) > a plain double-click on a map body calls onEditHere with that map; empty space does not
- test/WorldCanvasContext.test.tsx > WorldCanvas: onEditHere double-click (Plan 6c E4) > the ContextMenu key's Edit here snaps at the selected map's screen centre
- test/WorldCanvasContext.test.tsx > WorldCanvas: onEditHere double-click (Plan 6c E4) > the context menu's Edit here (right-click) calls onEditHere and snaps at the menu's open position
- test/WorldCanvasContext.test.tsx > WorldCanvas: onEditHere double-click (Plan 6c E4) > with warps on, a double-click on a warp marker opens the preview and does NOT call onEditHere; elsewhere on the map body it does
- test/WorldCanvasSurface.test.tsx > P12-4m: jump fills sixty percent of the limiting viewport dimension
- test/canvas/WorldSurface.test.tsx > fits manually, fits anchored filter members and waits to jump outside the filter
- test/canvas/WorldSurface.test.tsx > jump-fits at 60% with exact zoom and pan
- test/canvas/WorldSurface.test.tsx > lands an initial jump on a hidden map at its own fit, not the cluster fit
- test/canvas/WorldSurface.test.tsx > projects the jump outline onto the drawImage rect after a wheel zoom and after a re-jump's pan
- test/canvas/worldView.test.ts > bounds and fits (P12-4m) > jumpFit fills 60% of the viewport, scaling before clamping
- test/canvas/worldView.test.ts > worldView constants > pins the shared factors
- test/gbc/GbcApp.test.tsx > GbcApp -- entering World centres on the selection (Plan 6c C2 fix round) > pressing World while already in World does not re-jump (no new highlight, view kept)
- test/gbc/GbcApp.test.tsx > GbcApp -- entering World centres on the selection (Plan 6c C2 fix round) > tree-click A, world-click B, Map, World: the view centres on B, not on the stale tree target A
- test/gbc/GbcApp.test.tsx > GbcApp -- entering World centres on the selection (Plan 6c C2 fix round) > world-click B only (no tree click ever), Map, World: jumps to B
- test/gbc/GbcAppContext.test.tsx > GbcApp -- in-context editing (Plan 7 Task 5b) > a double-click on another map with a dirty session and a cancelled switch prompt does not enter context
- test/gbc/GbcAppContext.test.tsx > GbcApp -- in-context editing (Plan 7 Task 5b) > choosing Discard enters context on the other map, discarding the server session first
- test/gbc/GbcAppContext.test.tsx > GbcApp -- in-context editing (Plan 7 Task 5b) > context payload http is visible without remount, and exit permits recovery
- test/gbc/GbcAppContext.test.tsx > GbcApp -- in-context editing (Plan 7 Task 5b) > context payload rejection is visible without remount, and exit permits recovery
- test/gbc/GbcAppContext.test.tsx > GbcApp -- in-context editing (Plan 7 Task 5b) > context payload shape is visible without remount, and exit permits recovery
- test/gbc/GbcAppContext.test.tsx > GbcApp -- in-context editing (Plan 7 Task 5b) > different-map tree visits retire a context stamp across A to B to A while preserving tool and host
- test/gbc/GbcAppContext.test.tsx > GbcApp -- in-context editing (Plan 7 Task 5b) > with a dirty session > Done opens the SaveDialog and stays in context; Cancel keeps editing
- test/gbc/GbcAppContext.test.tsx > GbcApp -- in-context editing (Plan 7 Task 5b) > with a dirty session > Escape opens the SaveDialog and stays in context; Escape inside the dialog cancels only the dialog
- test/gbc/GbcAppContext.test.tsx > GbcApp -- in-context editing (Plan 7 Task 5b) > with a dirty session > a committed save refreshes exactly that map's world tile, as &v=1, marks the session clean, re-reads the payload
- test/gbc/GbcAppContext.test.tsx > GbcApp -- in-context editing (Plan 7 Task 5b) > with a dirty session > a mode switch leaves context without a prompt; the session persists (still dirty back in Map view)
- test/gbc/GbcAppContext.test.tsx > GbcApp -- in-context editing (Plan 7 Task 5b) > with a dirty session > a tree click on another map leaves context only after the dirty guard (cancel keeps editing)
- test/gbc/GbcWorldCanvas.test.tsx > GbcWorldCanvas > jump: centres jumpToMap at ~60% of the viewport and flashes an outline that fades after 2s
- test/gbc/GbcWorldCanvas.test.tsx > GbcWorldCanvas > jumping to a DIFFERENT map on a later token re-jumps (not stuck on the first jumpToMap)
- test/gbc/GbcWorldCanvas.test.tsx > jumpFit (pure) > fills about 60% of the viewport (not the full 100% computeFit alone would give)
- test/gbc/GbcWorldCanvas.test.tsx > jumpFit (pure) > scales BEFORE clamping to zoomBounds.max, not after (fix round, F2): a real, non-square map still fills ~60% even when its full fit exceeds the cap
- test/gbc/GbcWorldCanvasSurface.test.tsx > P12-4q: an unfiltered jump reveals and draws a hidden GATE placement
- test/gbc/GbcWorldCanvasSurface.test.tsx > P12-4q: an unfiltered jump reveals and draws a hidden INDOOR placement

## First error and location (where vitest printed one per test; grouped failures share the next block's error)

test/App.test.tsx > App -- world click selects the map in the tree (Plan 6c C2) > a canvas click on a map highlights its tree row and scrolls it into view, without jumping the view (GBA mirror of GbcApp's F1 test)
    error: AssertionError: expected undefined to be 'Route1' // Object.is equality
    at: test/App.test.tsx:1110
test/App.test.tsx > App -- world click selects the map in the tree (Plan 6c C2) > entering World after only a world click on B (no tree click ever) jumps to B
    error: AssertionError: expected 'Route1' to be 'Route2' // Object.is equality
    at: test/App.test.tsx:1181
test/AppContextEdit.test.tsx > App -- in-context editing (Plan 6c E4) > double-clicking a map in World shows the editing chrome around the SAME world canvas, with no /api/world refetch
    error: AssertionError: expected null not to be null
    at: test/AppContextEdit.test.tsx:128
test/AppContextEdit.test.tsx > App -- in-context editing (Plan 6c E4) > in context, GBA editing gets the rail (palette + inspector) around the SAME world canvas, with no /api/world refetch (Plan 9 D4)
    error: AssertionError: expected null not to be null
    at: test/AppContextEdit.test.tsx:155
test/AppContextEdit.test.tsx > App -- in-context editing (Plan 6c E4) > Done on a clean session removes the chrome and the overlay; World stays
    error: AssertionError: expected null not to be null
    at: test/AppContextEdit.test.tsx:179
test/AppContextEdit.test.tsx > App -- in-context editing (Plan 6c E4) > Escape on a clean session leaves context too
    error: AssertionError: expected null not to be null
    at: test/AppContextEdit.test.tsx:194
test/AppContextEdit.test.tsx > App -- in-context editing (Plan 6c E4) > with a dirty session > Escape opens the SaveDialog and stays in context; Escape inside the dialog cancels only the dialog
    error: TestingLibraryElementError: Unable to find role="button" and name "Add Event"
    at: test/AppContextEdit.test.tsx:214
test/AppContextEdit.test.tsx > App -- in-context editing (Plan 6c E4) > with a dirty session > Done opens the SaveDialog and stays in context
    error: TestingLibraryElementError: Unable to find role="button" and name "Add Event"
    at: test/AppContextEdit.test.tsx:214
test/AppContextEdit.test.tsx > App -- in-context editing (Plan 6c E4) > with a dirty session > a committed save refreshes exactly that map's world tile, as ?v=1
    error: TestingLibraryElementError: Unable to find role="button" and name "Add Event"
    at: test/AppContextEdit.test.tsx:214
test/AppContextEdit.test.tsx > App -- in-context editing (Plan 6c E4) > a mode switch leaves context without a prompt; coming back to World starts without it
    error: AssertionError: expected null not to be null
    at: test/AppContextEdit.test.tsx:261
test/AppContextEdit.test.tsx > App -- in-context editing (Plan 6c E4) > a tree click on the map being edited also leaves context (the jump it requests would move the world under the overlay)
    error: AssertionError: expected null not to be null
    at: test/AppContextEdit.test.tsx:276
test/AppContextEdit.test.tsx > App -- in-context editing (Plan 6c E4) > a tree click on another map leaves context (no remount of the chrome, no overlay) and selects that map
    error: AssertionError: expected null not to be null
    at: test/AppContextEdit.test.tsx:288
test/AppContextEdit.test.tsx > App -- in-context editing, fix round (Plan 6c E4) > a pencil click on a cell of the overlay canvas goes through the edit session: paint/begin, paint/apply (pencil), paint/end, in order
    error: TypeError: Cannot read properties of null (reading 'querySelector')
    at: test/AppContextEdit.test.tsx:340
test/AppContextEdit.test.tsx > App -- in-context editing, fix round (Plan 6c E4) > a selection change that nothing else clears leaves context (defence in depth: the overlay normally covers the canvas)
    error: AssertionError: expected <div class="world-canvas__context">…(3)</div> to be null
    at: test/AppContextEdit.test.tsx:378
test/AppContextEdit.test.tsx > App -- in-context editing, fix round (Plan 6c E4) > Fit is disabled while the context map loads (Plan 9 R5; mirrors GbcAppContext's pending-context test)
    error: TestingLibraryElementError: Unable to find role="button" and name "Done editing Route1"
    at: test/AppContextEdit.test.tsx:390
test/AppContextEdit.test.tsx > App -- in-context editing, fix round (Plan 6c E4) > in-context Fit and F fit the map being edited, as Map view's Fit does (Plan 9 R5)
    error: AssertionError: expected undefined to be truthy
    at: test/AppContextEdit.test.tsx:413
test/AppContextStroke.test.tsx > M5: Done waits for held paint/apply before deciding the dirty exit
    error: AssertionError: expected undefined to be truthy
    at: test/AppContextStroke.test.tsx:130
test/AppContextStroke.test.tsx > dirty Map and Dungeon mode switches leave context without prompting and preserve the session
    error: AssertionError: expected undefined to be truthy
    at: test/AppContextStroke.test.tsx:164
test/AppContextVisit.test.tsx > App -- in-context visits (Plan 8 Task 6) > different-map tree visits retire a context stamp across A to B to A while preserving tool and host
    error: TypeError: Cannot read properties of null (reading 'querySelector')
    at: test/AppContextVisit.test.tsx:119
test/WorldCanvas.test.tsx > WorldCanvas > culls: fetches images only for placements intersecting the viewport, not every placement
    error: AssertionError: expected 12 to be 3 // Object.is equality
    at: test/WorldCanvas.test.tsx:376
test/WorldCanvas.test.tsx > WorldCanvas > below the LOD zoom threshold, draws the cached downscaled buffer, not the full-resolution image
    error: AssertionError: expected FakeImage{ …(3) } to be <canvas width="40" height="40"></canvas> // Object.is equality
    at: test/WorldCanvas.test.tsx:419
test/WorldCanvas.test.tsx > WorldCanvas > computeFit's zoomBounds parameter overrides the default MIN_ZOOM/MAX_ZOOM clamp, and is left out by every existing call
    error: AssertionError: expected 0.0078125 to be close to 0.015625, received difference is 0.0078125, but expected 5e-11
    at: test/WorldCanvas.test.tsx:477
test/WorldCanvas.test.tsx > WorldCanvas > dragging a placed map posts its new position, and it survives a reload
    error: AssertionError: expected { map: 'Solo', x: 2, y: 2 } to deeply equal { map: 'Solo', x: 15, y: 15 }
    at: test/WorldCanvas.test.tsx:590
test/WorldCanvas.test.tsx > WorldCanvas > a plain drag (no Shift) starting over a placed map pans the view instead of moving it, and never posts
    error: AssertionError: expected false to be true // Object.is equality
    at: test/WorldCanvas.test.tsx:632
test/WorldCanvas.test.tsx > WorldCanvas > releasing a Shift+drag by leaving the canvas (not mouseup) still posts the new position
    error: AssertionError: expected { map: 'Solo', x: 2, y: 2 } to deeply equal { map: 'Solo', x: 15, y: 15 }
    at: test/WorldCanvas.test.tsx:688
test/WorldCanvas.test.tsx > WorldCanvas > lists singleton maps absent from placements in the side rail, and lets one be dragged onto the canvas
    error: AssertionError: expected { map: 'Hidden', x: 2, y: 3 } to deeply equal { map: 'Hidden', x: 51, y: 52 }
    at: test/WorldCanvas.test.tsx:783
test/WorldCanvas.test.tsx > WorldCanvas > draws a marker for every conflict and shows a tooltip naming both disagreeing paths
    error: TestingLibraryElementError: Unable to find role="tooltip"
    at: test/WorldCanvas.test.tsx:1021
test/WorldCanvas.test.tsx > WorldCanvas > independently acknowledges two same-map badges by right-click, keeps placement, and survives remount
    error: TestingLibraryElementError: Unable to find an accessible element with the role "menuitem" and name "Accept conflict"
    at: test/WorldCanvas.test.tsx:1045
test/WorldCanvas.test.tsx > WorldCanvas > shows a malformed accept response without acknowledging the GBA badge
    error: TestingLibraryElementError: Unable to find an accessible element with the role "menuitem" and name "Accept conflict"
    at: test/WorldCanvas.test.tsx:1076
test/WorldCanvas.test.tsx > WorldCanvas > redraws and updates hit actions when the accepted key changes but the count stays one
    error: TestingLibraryElementError: Unable to find an accessible element with the role "menuitem" and name "Un-accept conflict"
    at: test/WorldCanvas.test.tsx:1100
test/WorldCanvas.test.tsx > WorldCanvas > keeps a near-edge badge action inside the viewport
    error: TypeError: Cannot read properties of null (reading 'style')
    at: test/WorldCanvas.test.tsx:1123
test/WorldCanvas.test.tsx > WorldCanvas > recovers a component:-1 placement's real size from its singleton component instead of treating it as 0x0
    error: TestingLibraryElementError: Unable to find an element with the text: /Ghost/. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your 
    at: test/WorldCanvas.test.tsx:1178
test/WorldCanvas.test.tsx > WorldCanvas > multi-select > Ctrl+click toggles a map in and out of the selection without starting a drag
    error: AssertionError: expected +0 to be 2 // Object.is equality
    at: test/WorldCanvas.test.tsx:1264
test/WorldCanvas.test.tsx > WorldCanvas > multi-select > Ctrl+drag right selects only maps fully enclosed by the marquee
    error: AssertionError: expected +0 to be 1 // Object.is equality
    at: test/WorldCanvas.test.tsx:1323
test/WorldCanvas.test.tsx > WorldCanvas > multi-select > Ctrl+drag left selects every map the marquee touches at all
    error: AssertionError: expected 1 to be 2 // Object.is equality
    at: test/WorldCanvas.test.tsx:1343
test/WorldCanvas.test.tsx > WorldCanvas > multi-select > Shift+drag on a selected map moves every selected map together, preserving offsets
    error: AssertionError: expected [ { map: 'A', x: 2, y: 2 } ] to deeply equal ArrayContaining{…}
    at: test/WorldCanvas.test.tsx:1376
test/WorldCanvas.test.tsx > WorldCanvas > multi-select > Shift+drag on an unselected map moves only that one map, even with a selection active
    error: AssertionError: expected [ { map: 'A', x: 2, y: 2 } ] to deeply equal [ ObjectContaining {"map": "B"} ]
    at: test/WorldCanvas.test.tsx:1398
test/WorldCanvas.test.tsx > WorldCanvas > warp toggle and markers (Feature B) > draws a marker only for a warp on a currently-visible map, not the whole corpus, at the position the screen-space formula predicts
    error: AssertionError: expected +0 to be 1 // Object.is equality
    at: test/WorldCanvas.test.tsx:1690
test/WorldCanvas.test.tsx > WorldCanvas > warp toggle and markers (Feature B) > markers are hidden until the toggle is switched on, and hidden again once it's switched back off
    error: AssertionError: expected +0 to be 1 // Object.is equality
    at: test/WorldCanvas.test.tsx:1713
test/WorldCanvas.test.tsx > WorldCanvas > warp toggle and markers (Feature B) > double-clicking a warp marker opens the destination popup; the × closes it without disturbing the canvas
    error: AssertionError: expected +0 to be 1 // Object.is equality
    at: test/WorldCanvas.test.tsx:1764
test/WorldCanvas.test.tsx > WorldCanvas: encounter border (Plan 6c B3) > puts the border on the side pickBorderSide gives: Target's left is blocked by an off-screen neighbour -> top; Free stays left
    error: AssertionError: expected 3 to be 2 // Object.is equality
    at: test/WorldCanvas.test.tsx:2269
test/WorldCanvas.test.tsx > WorldCanvas: encounter border (Plan 6c B3) > wheeling in from zoom 1: a badge below the LOD threshold (4), sprites from 4 (not only from 8)
    error: AssertionError: expected 3 to be 2 // Object.is equality
    at: test/WorldCanvas.test.tsx:2286
test/WorldCanvas.test.tsx > WorldCanvas: encounter border (Plan 6c B3) > fetches /api/encounters/:map once per visible map and does not refetch on zoom
    error: AssertionError: expected 3 to be 2 // Object.is equality
    at: test/WorldCanvas.test.tsx:2304
test/WorldCanvas.test.tsx > WorldCanvas: onSelectMap (Plan 6c C2) > a plain click on a map calls onSelectMap once with its name
    error: AssertionError: expected "spy" to be called 1 times, but got 0 times
    at: test/WorldCanvas.test.tsx:2457
test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > right-click on a map body offers Open in Map view, which opens that map
    error: TestingLibraryElementError: Unable to find an accessible element with the role "menuitem"
    at: test/WorldCanvas.test.tsx:2517
test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > Edit here is enabled and calls onEditHere when the prop is supplied, and is absent without it
    error: TestingLibraryElementError: Unable to find an accessible element with the role "menuitem" and name "Edit here"
    at: test/WorldCanvas.test.tsx:2527
test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > right-click on a badge shows the map items plus the conflict item, in order
    error: TestingLibraryElementError: Unable to find an accessible element with the role "menuitem"
    at: test/WorldCanvas.test.tsx:2540
test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > right-click on empty space shows no menu and closes an open one
    error: TestingLibraryElementError: Unable to find an accessible element with the role "menu"
    at: test/WorldCanvas.test.tsx:2561
test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > Shift+F10 opens the menu at the centre of the one selected map, with the map items only
    error: AssertionError: expected true to be false // Object.is equality
    at: test/WorldCanvas.test.tsx:2583
test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > Shift+double-click on a map opens it in Map view without ever POSTing a placement
    error: AssertionError: expected "spy" to be called 1 times, but got 0 times
    at: test/WorldCanvas.test.tsx:2612
test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > a canvas mousedown (pan start) closes an open menu
    error: TestingLibraryElementError: Unable to find an accessible element with the role "menu"
    at: test/WorldCanvas.test.tsx:2628
test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > Escape closes the menu and returns focus to the canvas
    error: TestingLibraryElementError: Unable to find an accessible element with the role "menuitem" and name "Open in Map view"
    at: test/WorldCanvas.test.tsx:2638
test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > the native contextmenu that follows a keyboard open, at empty space, leaves the menu as it was
    error: TestingLibraryElementError: Unable to find an accessible element with the role "menu"
    at: test/WorldCanvas.test.tsx:2677
test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > the native contextmenu that follows a keyboard open, with button -1 (keyboard origin), leaves the menu as it was
    error: TestingLibraryElementError: Unable to find an accessible element with the role "menu"
    at: test/WorldCanvas.test.tsx:2677
test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > a real right-click after a keyboard open is not swallowed: any canvas pointerdown re-arms it
    error: TestingLibraryElementError: Unable to find an accessible element with the role "menu"
    at: test/WorldCanvas.test.tsx:2692
test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > a late successful save closes only the menu that issued it
    error: TestingLibraryElementError: Unable to find an accessible element with the role "menuitem" and name "Accept conflict"
    at: test/WorldCanvas.test.tsx:2723
test/WorldCanvas.test.tsx > WorldCanvas: context menu (Plan 6c E3) > the conflict error toast can be dismissed
    error: TestingLibraryElementError: Unable to find an accessible element with the role "menuitem" and name "Accept conflict"
    at: test/WorldCanvas.test.tsx:2740
test/WorldCanvasContext.test.tsx > WorldCanvas: onEditHere double-click (Plan 6c E4) > a plain double-click on a map body calls onEditHere with that map; empty space does not
    error: AssertionError: expected "spy" to be called 1 times, but got 0 times
    at: test/WorldCanvasContext.test.tsx:118
test/WorldCanvasContext.test.tsx > WorldCanvas: onEditHere double-click (Plan 6c E4) > Ctrl, Meta and Shift double-clicks do not call it (Shift opens the map instead)
    error: AssertionError: expected "spy" to be called 1 times, but got 0 times
    at: test/WorldCanvasContext.test.tsx:130
test/WorldCanvasContext.test.tsx > WorldCanvas: onEditHere double-click (Plan 6c E4) > with warps on, a double-click on a warp marker opens the preview and does NOT call onEditHere; elsewhere on the map body it does
    error: AssertionError: expected +0 to be 1 // Object.is equality
    at: test/WorldCanvasContext.test.tsx:156
test/WorldCanvasContext.test.tsx > WorldCanvas: onEditHere double-click (Plan 6c E4) > the context menu's Edit here (right-click) calls onEditHere and snaps at the menu's open position
    error: TestingLibraryElementError: Unable to find an accessible element with the role "menuitem" and name "Edit here"
    at: test/WorldCanvasContext.test.tsx:176
test/WorldCanvasContext.test.tsx > WorldCanvas: onEditHere double-click (Plan 6c E4) > the ContextMenu key's Edit here snaps at the selected map's screen centre
    error: TestingLibraryElementError: Unable to find an accessible element with the role "menuitem" and name "Edit here"
    at: test/WorldCanvasContext.test.tsx:190
test/WorldCanvasContext.test.tsx > WorldCanvas: in-context overlay (Plan 6c E4) > snaps at the recorded double-click pointer
    error: AssertionError: expected { zoom: 1, pan: { x: 10, y: 10 } } to deeply equal { zoom: 1, pan: { x: -19, y: -39 } }
    at: test/WorldCanvasContext.test.tsx:249
test/WorldCanvasContext.test.tsx > WorldCanvas: in-context fix round (Plan 6c E4) > snap uses the canvas box as it is when the layout (and so the chrome) arrives > waits for context.origin, then converts the recorded client pointer with the shifted box
    error: AssertionError: expected "spy" to be called with arguments: [ 'B' ]
    at: test/WorldCanvasContext.test.tsx:470
test/WorldCanvasContext.test.tsx > WorldCanvas: in-context fix round (Plan 6c E4) > snap uses the canvas box as it is when the layout (and so the chrome) arrives > the right-click menu's open point is recorded in client px too
    error: TestingLibraryElementError: Unable to find an accessible element with the role "menuitem" and name "Edit here"
    at: test/WorldCanvasContext.test.tsx:490
test/WorldCanvasContext.test.tsx > WorldCanvas: in-context fix round (Plan 6c E4) > snap uses the canvas box as it is when the layout (and so the chrome) arrives > the ContextMenu key's open point (the selected map's centre) is recorded in client px too
    error: TestingLibraryElementError: Unable to find an accessible element with the role "menuitem" and name "Edit here"
    at: test/WorldCanvasContext.test.tsx:504
test/WorldCanvasContext.test.tsx > WorldCanvas: in-context fix round (Plan 6c E4) > snap uses the canvas box as it is when the layout (and so the chrome) arrives > a later entry does not reuse an earlier pointer: with none recorded the canvas centre is used
    error: AssertionError: expected { zoom: 1, pan: { x: 10, y: 10 } } to deeply equal { zoom: 1, pan: { x: -19, y: -39 } }
    at: test/WorldCanvasContext.test.tsx:517
test/WorldCanvasSurface.test.tsx > P12-4m: jump fills sixty percent of the limiting viewport dimension
    error: AssertionError: expected [ 50, +0, 100, 100 ] to deeply equal [ 70, 20, 60, 60 ]
    at: test/WorldCanvasSurface.test.tsx:240
test/canvas/WorldSurface.test.tsx > fits manually, fits anchored filter members and waits to jump outside the filter
    error: AssertionError: expected [ '50px', '0px', '100px', '100px' ] to deeply equal [ '70px', '20px', '60px', '60px' ]
    at: test/canvas/WorldSurface.test.tsx:230
test/canvas/WorldSurface.test.tsx > jump-fits at 60% with exact zoom and pan
    error: AssertionError: expected '63%' to be '38%' // Object.is equality
    at: test/canvas/WorldSurface.test.tsx:247
test/canvas/WorldSurface.test.tsx > lands an initial jump on a hidden map at its own fit, not the cluster fit
    error: AssertionError: expected [ 60, 10, 80, 80 ] to deeply equal [ 70, 20, 60, 60 ]
    at: test/canvas/WorldSurface.test.tsx:268
test/canvas/WorldSurface.test.tsx > projects the jump outline onto the drawImage rect after a wheel zoom and after a re-jump's pan
    error: AssertionError: expected 40 to be close to 64, received difference is 24, but expected 5e-10
    at: test/canvas/WorldSurface.test.tsx:281
test/canvas/worldView.test.ts > worldView constants > pins the shared factors
    error: AssertionError: expected 1 to be 0.6 // Object.is equality
    at: test/canvas/worldView.test.ts:18
test/canvas/worldView.test.ts > bounds and fits (P12-4m) > jumpFit fills 60% of the viewport, scaling before clamping
    error: AssertionError: expected 32 to be close to 22.26666666666667, received difference is 9.73333333333333, but expected 5e-7
    at: test/canvas/worldView.test.ts:158
test/gbc/GbcApp.test.tsx > GbcApp -- entering World centres on the selection (Plan 6c C2 fix round) > tree-click A, world-click B, Map, World: the view centres on B, not on the stale tree target A
    error: AssertionError: expected '2 components · 2 maps · zoom 31% · 0 …' to contain 'zoom 19%'
    at: test/gbc/GbcApp.test.tsx:798
test/gbc/GbcApp.test.tsx > GbcApp -- entering World centres on the selection (Plan 6c C2 fix round) > world-click B only (no tree click ever), Map, World: jumps to B
    error: AssertionError: expected '2 components · 2 maps · zoom 31% · 0 …' to contain 'zoom 19%'
    at: test/gbc/GbcApp.test.tsx:823
test/gbc/GbcApp.test.tsx > GbcApp -- entering World centres on the selection (Plan 6c C2 fix round) > pressing World while already in World does not re-jump (no new highlight, view kept)
    error: AssertionError: expected '2 components · 2 maps · zoom 31% · 0 …' to contain 'zoom 19%'
    at: test/gbc/GbcApp.test.tsx:832
test/gbc/GbcAppContext.test.tsx > GbcApp -- in-context editing (Plan 7 Task 5b) > choosing Discard enters context on the other map, discarding the server session first
    error: AssertionError: expected '1 components · 2 maps · zoom 63% · 0 …' to match /1 components · 2 maps · zoom 38%/
    at: test/gbc/GbcAppContext.test.tsx:158
test/gbc/GbcAppContext.test.tsx > GbcApp -- in-context editing (Plan 7 Task 5b) > context payload shape is visible without remount, and exit permits recovery
    error: AssertionError: expected '1 components · 2 maps · zoom 63% · 0 …' to contain 'zoom 38%'
    at: test/gbc/GbcAppContext.test.tsx:500
test/gbc/GbcAppContext.test.tsx > GbcApp -- in-context editing (Plan 7 Task 5b) > different-map tree visits retire a context stamp across A to B to A while preserving tool and host
    error: AssertionError: expected '1 components · 2 maps · zoom 63% · 0 …' to contain 'zoom 38%'
    at: test/gbc/GbcAppContext.test.tsx:578
test/gbc/GbcWorldCanvas.test.tsx > jumpFit (pure) > fills about 60% of the viewport (not the full 100% computeFit alone would give)
    error: AssertionError: expected 10 to be close to 6, received difference is 4, but expected 5e-11
    at: test/gbc/GbcWorldCanvas.test.tsx:377
test/gbc/GbcWorldCanvas.test.tsx > jumpFit (pure) > scales BEFORE clamping to zoomBounds.max, not after (fix round, F2): a real, non-square map still fills ~60% even when its full fit exceeds the cap
    error: AssertionError: expected 32 to be close to 22.2666666, received difference is 9.7333334, but expected 0.0005
    at: test/gbc/GbcWorldCanvas.test.tsx:396
test/gbc/GbcWorldCanvas.test.tsx > GbcWorldCanvas > jump: centres jumpToMap at ~60% of the viewport and flashes an outline that fades after 2s
    error: TestingLibraryElementError: Unable to find an element with the text: /zoom 38%/. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make yo
    at: test/gbc/GbcWorldCanvas.test.tsx:1217
test/gbc/GbcWorldCanvas.test.tsx > GbcWorldCanvas > jumping to a DIFFERENT map on a later token re-jumps (not stuck on the first jumpToMap)
    error: TestingLibraryElementError: Unable to find an element with the text: /zoom 38%/. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make yo
    at: test/gbc/GbcWorldCanvas.test.tsx:1225
test/gbc/GbcWorldCanvasSurface.test.tsx > P12-4q: an unfiltered jump reveals and draws a hidden GATE placement
    error: AssertionError: expected [ 20, 20, 160, 160 ] to deeply equal [ 40, 40, 120, 120 ]
    at: test/gbc/GbcWorldCanvasSurface.test.tsx:393
