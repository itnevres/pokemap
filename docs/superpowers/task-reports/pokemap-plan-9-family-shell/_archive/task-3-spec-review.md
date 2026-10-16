# Task 3 spec-compliance review (base 4dbf18d, head 31831c7)

### Spec Compliance
- ✅ Files: only gba/adapter.tsx (new) and test/shell/adapter.test.ts (+9) changed; App.tsx untouched; no new dependency (diff --stat).
- ✅ Exports `useGbaRuntime(args: RuntimeArgs): FamilyRuntime` (adapter.tsx:17) and `gbaAdapter: EngineAdapter` (140-145: family gba, label null, GBA_CAPABILITIES by identity, useRuntime).
- ✅ Test matches brief verbatim; import merged into existing import block.
- ✅ useMapEditing at runtime level (adapter.tsx:46), called every render regardless of mode, so it survives mode switches.
- ✅ Switch policy (50-53): window.confirm only when dirty, then go(); no server discard; sameMap ignored (runtime `leave: (go) => leave(go)`, line 105).
- ✅ SignComposer only in GBA runtime `modals` (124-135); canvases untouched (imported components only).
- ✅ Five copied comments verbatim (see below). No jest-dom use.
- ✅ HIDDEN_MAP_TYPES is MapTree's own default (MapTree.tsx:24), so passing it is behaviour-identical.
- ⚠️ Cannot verify: shell must call ctx.onCommitted() on save (runtime `saveDialog.onCommitted` is a no-op, adapter.tsx:136) and own useBeforeUnloadGuard(session.isDirty); that is Task 5 (FamilyApp not in this diff).

### Drift check
- App.tsx:42 useMapGroups() -> 18 match (result exposed as `groups`; data/error shape fits).
- App.tsx:43 useMapLayout(selected) -> 19 match.
- App.tsx:49 useWorldVisibility(mode === "world") -> 25 match (renamed placed/visibilityError).
- App.tsx:50 useDungeons(mode === "dungeon") -> 26 match.
- App.tsx:65 useEditSession(selected, layout.data?.blocks, layout.data?.map) -> 41 match. Hook order identical to App (groups, layout, visibility, dungeons, session, editing).
- App.tsx:70 useMapEditing({editSession, layoutData: layout.data, mapName: selected}) -> 46 match.
- App.tsx:76-79 leave + exact string -> 14 GUARD_TEXT ("You have unsaved changes on this map. Discard them and switch maps?") and 50-53: match, text exact.
- App.tsx:183 contextLayout -> 56-57 match (parameterised on s.contextMap).
- App.tsx:184-215 WorldCanvas props (key world, jumpToMap, jumpToken, onJumpToMap=selectMap, onSelectMap=selectMapFromWorld, onOpenMap=openMapFromWorld, onEditHere=enterContext, tileVersions, context{map,origin,renderCanvas with MapCanvas chromeless,onExitRequest=requestExitContext}) -> 71-91 match.
- App.tsx:296-307 MapEditingWorkspace world-host: contextLayout branch (mapName=contextLayout.map.name, data=contextLayout, no active) and inactive branch (active={false}, mapName=selected, data=layout.data), both key "world-host", onStrokeChain, editSession, editing, renderCanvas -> 95-99 match.
- App.tsx:310 WorldCanvas key="dungeon" mapFilter onOpenMap=openMapFromWorld -> 117 match (openDungeon-null placeholder is shell-owned).
- App.tsx:319 Map MapEditingWorkspace(onStrokeChain, mapName, data, editSession, editing) -> 112-115 match; selected/layout.error/loading branches -> `map.{error,ready}` + null (shell renders placeholders).
- App.tsx:349-359 SignComposer props/handlers -> 124-135 match (renders `null` when closed).
- App.tsx:331-343 SaveDialog -> saveDialog {open, setOpen} 136; SaveDialog render and ctx.onCommitted shell-owned.
- Comments verbatim (whitespace/comment-marker only): Known limitation (20-24 vs 44-48), Task 13 (28-40 vs 52-64), Plan 6c E2 (43-45 vs 67-69), key="world"/"dungeon" (62-70 vs 185-193), Task 17 (120-123 vs 345-348). The "The context map's layout..." and "World view is hosted..." comments also match.
- Dropped by runtime, all shell-owned: useBeforeUnloadGuard, select/changeSelection/selectMap/selectMapFromWorld/openMapFromWorld, ctx, stroke registry, switchMode/enterWorld, openDungeon/mapFilter/handleDeleteDungeon/allMapNames, header, sidebar, placeholders, SaveDialog. No GBA-only behaviour dropped.

### Issues
- Critical: none.
- Important: none.
- Minor: (1) Task 13 comment's "mirroring `layout` just above" still reads fine (layout is line 19). (2) Adapter comment cites App.tsx line numbers, which go stale once Task 5/6 edits App.tsx; cosmetic. (3) `leave: (go) => leave(go)` wrapper is redundant (could pass `leave` directly); harmless.

### Assessment
Spec-compliant. Move is faithful: hook order, args, GUARD_TEXT, render branches, props, keys and comments all match App.tsx. Only open item is Task 5 wiring (onCommitted, beforeunload), outside this diff.
