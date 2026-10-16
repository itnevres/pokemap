# Task 4 spec-compliance review (base 31831c7, head a0cfb95)

Scope: `packages/ui/src/gbc/adapter.tsx` (new, 184 lines), `packages/ui/test/shell/adapter.test.ts` (+9). `GbcApp.tsx` untouched (diff stat: 2 files only). Suite not re-run (gate per controller: 2720/0/173, typecheck + build clean).

### Spec Compliance

- ✅ adapter.tsx:20 `useGbcRuntime({ selected, mode }: RuntimeArgs): FamilyRuntime`; adapter.tsx:179-184 `gbcAdapter` = gbc / "Crystal" / `GBC_CAPABILITIES` / `useGbcRuntime`. Matches brief "Produces" and shell/adapter.ts:90-98.
- ✅ Code matches the brief's Step 2 block; only deviation is adapter.tsx:32 `world ? new Map(...) : null`, which the brief sanctions. All `<copy ...>` placeholders filled with the verbatim GbcApp comments (checked: 22-25 = GbcApp 77-80, 36-43 = 93-100, 45-47 = 102-104, 53-58 = 113-118, 67-69 = 205-207, 86-88 = 217-219, 157-158 = 287-288).
- ✅ Spec "Behaviour that does NOT change": GBC switch = confirm, then `session.discard()`, then `go`; failed discard sets `switchError` and abandons the switch (adapter.tsx:60-64). `sameMap` skips prompt and discard (spec "disagree" bullet 1).
- ✅ Spec "Errors": switchError + reload-after-save failure in runtime `banners` (adapter.tsx:159-166), with Dismiss; defects banner Map view (140) and in-context only (117, gated on `contextActive`), non-dismissible.
- ✅ GBC per-visit editing state stays inside `GbcMapEditing` (adapter only passes the same props; nothing lifted).
- ✅ Manual placements stay GBC: `placed` is the pre-merge visibility (adapter.tsx:31-34) and `markManualPlacement` comes from slots; `hiddenMapTypes: GBC_HIDDEN_MAP_TYPES` (134).
- ✅ `onSelected` clears switchError + hover (131), `onEnterContext` clears both only when `name === selected` (132) — spec "disagree" bullets 2 and 3.
- ✅ `saveDialog.onCommitted` does only the reload with the exact GbcApp error text (172-174); spec "Save commit" says the shell calls it after `ctx.onCommitted()`.
- ✅ No new dependency (imports are all in-repo + react). No jest-dom matchers (test uses `toBe`).
- ✅ Test (adapter.test.ts +9) is exactly the brief's Step 1.
- ✅ TimeOfDay: GbcApp's `export type TimeOfDay` has no importer outside GbcApp (implementer grep); nothing for Task 6.

⚠️ Shell-owned behaviour leaving GbcApp that Task 5 (FamilyApp) must carry — the runtime no longer does these:
1. `useBeforeUnloadGuard(session.isDirty)` — GbcApp.tsx:111. Use `runtime.session.isDirty`.
2. `useContextEditing` `leave` arg is one-arg `leave(go)` (useContextEditing.ts:6, called at :54 only when `map !== selected`). FamilyApp must adapt: `leave: (go) => runtime.leave(go, { sameMap: false })`. Passed directly, it would destructure `undefined` (adapter.tsx:60 `{ sameMap }`) and throw on in-context entry to another map. Typecheck rejects the direct pass, so this is a wiring note, not a latent bug. GbcApp.tsx:125-130.
3. `ctx` `select` = clear switchError, setSelected, clear hover (GbcApp.tsx:127) → `setSelected(name); runtime.onSelected(name)`. `openSave` → `runtime.saveDialog.setOpen(true)` (GbcApp.tsx:128). `strokeSettled` from the registry (124, 129).
4. `selectMap` (GbcApp.tsx:150-160): go = clear switchError, `ctx.leaveContext()`, setSelected, setJumpTarget(name), bump selectVersion, clear hover; called directly when `name === selected` (→ `runtime.leave(go, { sameMap: name === selected })` + `runtime.onSelected(name)` inside go, including the same-map path, which in GbcApp also clears switchError/hover).
5. `selectMapFromWorld` (GbcApp.tsx:168-170): when `name === selected` GbcApp does NOTHING (no go, no switchError clear). If FamilyApp follows the spec text ("pass sameMap"), go would run and `onSelected` would clear switchError/hover on a same-map world click — a small behaviour change from GbcApp. Either keep the `if (name !== selected)` guard or accept and document. Also note GbcApp's go here clears switchError but NOT the hover id; `onSelected` clears both — spec-sanctioned (spec "select side effects" bullet), harmless.
6. `openMapFromWorld` (GbcApp.tsx:183-192): go = clear switchError, leaveContext, setSelected, clear hover, setMode("map"); direct go on same map.
7. `enterContext` (GbcApp.tsx:194-197): `runtime.onEnterContext(name)` BEFORE `ctx.enter(name)`.
8. `enterWorld` (175-180: no-op if already world; jumpTarget = selected; bump; mode world) and `switchMode` (199-202: leaveContext then setMode).
9. `requestExitContext = ctx.requestExit` (198) → slot.
10. Dungeon: `openDungeon` only in dungeon mode (132), cached `mapFilter` keyed on id + sorted members (133-143, `dungeonFilterCache`), `allMapNames` (144), `deleteDungeon` clears openId when it was the deleted one (145-148). `renderDungeon` takes a non-null `Set`, so the shell keeps the `openDungeon ? … : <p className="app__canvas-placeholder">Select or create a dungeon</p>` branch (316-318).
11. Manual-placement merge: `manual: placement.manual || manualPlacementMaps.has(name)` over `runtime.visibility.placed` (88-91); `markManualPlacement` dedupes (171).
12. Header (249-272): title, `<span className="gbc-app__family">Crystal</span>` (adapter.label), View group, THEN `headerExtras` (time group, gated on `timeOfDay`), then status `mode === "map" && selected` span, then `switcher`.
13. Sidebar (274-285): `Could not load map groups: {error}`; world error only when `mode === "world"`: `Could not load world visibility: {worldError}`; DungeonSidebar props; MapTree with `worldMode`, merged visibility, `hiddenMapTypes`; `Loading map groups…`.
14. `<main>` order (286-352): `runtime.banners` FIRST, then mode content, then SaveDialog.
15. Map-view placeholders (319-338), precedence matters: `!selected` → "Select a map"; `map.error` → `Could not load {selected}: {map.error}` (class `app__canvas-placeholder`, no role) checked BEFORE ready; ready → `runtime.renderMap(slots)`; else `Loading {selected}…`. (`renderMap` itself renders whenever `selected && ready`, so the error-first check must live in the shell.)
16. SaveDialog (342-351): rendered only when `saveOpen && selected`; `mapName={selected}`; onCommitted order = `ctx.onCommitted()`, `setOpen(false)`, then `runtime.saveDialog.onCommitted()`; onCancel → `setOpen(false)`.
17. Slot mapping for `renderWorld`: `jumpToken` = selectVersion, `onJumpToMap` = selectMap, `tileVersions`/`contextMap` from ctx, `onStrokeChain` from the registry.

### Drift check (GbcApp line -> adapter line)

| GbcApp | adapter | Result |
|---|---|---|
| 26-27 TIME_ORDER/LABEL | 14-15 | match (typed `GbcTimeOfDay`, same type) |
| 57 `time` state "day" | 21 | match |
| 81 hovered state | 26 | match |
| 84 `useGbcDungeons(mode === "dungeon")` | 27 | match |
| 86 `useGbcGroups()` | 28 | match (returned whole as `groups`) |
| 87 `useGbcWorld(mode === "world")` | 29 | match |
| 88-91 worldVisibility memo | 31-34 | intended: manual merge moved to shell (⚠️11); `null` vs `undefined` when no world, MapTree defaults to null — no effect |
| 92 `useGbcMap(selected)` | 35 | match |
| 101 `ready` guard (`map.data.map.name === selected`) | 44 | match |
| 105 `useGbcEditSession(selected, ready?.blocks, ready?.events)` | 48 | match |
| 106 saveOpen / 108 switchError | 49 / 51 | match |
| hook relative order 84→86→87→88→92→105→106→108 | 27→28→29→31→35→48→49→51 | match (time/hover state first; no effect inside them) |
| 111 useBeforeUnloadGuard | — | shell (⚠️1) |
| 119-123 leave: `!isDirty` → go; confirm text; `discard().then(go).catch(setSwitchError(msg ‖ "Could not discard the changes."))` | 60-64 | match; ordering preserved: setSelected only runs inside `go` after discard resolves; nothing set before discard; `.catch` also covers a throw in go, as before. `sameMap` short-circuit = GbcApp 159/191 direct `go()` |
| 124-131 stroke registry, useContextEditing | — | shell (⚠️2-3) |
| 127 select side effects | 131 onSelected | match (shell calls after setSelected) |
| 150-201 selectMap / selectMapFromWorld / enterWorld / openMapFromWorld / switchMode | — | shell (⚠️4-8) |
| 195 enterContext same-map clear | 132 onEnterContext | match |
| 204-215 defectsBanner | 66-77 | match (markup, classes, role, no dismiss) |
| 220 contextActive | 89 | match (`s.contextMap`) |
| 221-245 GbcWorldCanvas props (key world, time, jumpToMap, jumpToken, onSelectMap, onOpenMap, onEditHere, onJumpToMap, onPlacementSaved, tileVersions, context{map, origin, renderCanvas chromeless, onExitRequest}) | 90-114 | match, all via slots |
| 263-269 time-of-day group markup | 148-156 | match |
| 289-296 switchError banner + Dismiss | 159-166 | match (placement now shell ⚠️14) |
| 298-315 world host `.app__map-editing` key "world-host", contextActive defects, loading/error line, GbcMapEditing (onStrokeChain, active, mapName, data, time, session, hoveredMetatileId, onHoverMetatile, onOpenSave, renderCanvas) | 115-124 | match (props via `editingProps` spread; same values) |
| 317 dungeon GbcWorldCanvas (key dungeon, time, mapFilter, onOpenMap, onPlacementSaved) | 145-147 | match; placeholder branch shell (⚠️10) |
| 319-338 Map view branch / placeholders | 137-143 renderMap | canvas part match (`.app__map-editing`, defects, GbcMapEditing same props minus active/renderCanvas); placeholders shell (⚠️15) |
| 342-351 SaveDialog; 348 reload error text | 168-175 | reload + text match; dialog/ctx.onCommitted/setOpen(false) shell (⚠️16) |
| 281 hiddenMapTypes | 134 | match |

No unsanctioned drift found.

### Issues

**Critical:** none.

**Important:** none in this task's diff.

**Minor:**
- M1 (carry to Task 5, flagged ⚠️2): `FamilyRuntime.leave` takes a required `opts` while `useContextEditing` calls `leave(go)` with one arg. TS rejects passing it directly ("target signature provides too few arguments"), so typecheck will catch it, but FamilyApp needs the `{ sameMap: false }` wrapper. Not a Task 4 defect.
- M2 (carry, ⚠️5): same-map world click must stay a no-op to match GbcApp.tsx:169; spec wording ("pass sameMap and both policies skip") would otherwise make it clear switchError.
- M3 (pre-existing, Task 2): spec says `map: { name, error, loading }` and `RuntimeArgs` carrying callbacks; shell/adapter.ts uses `map: { error, ready }` and `ShellSlots`. The adapter follows the types, as it must. Spec text out of sync with Task 2's types, not this task's.
- M4 (quality reviewer's call): adapter.tsx:90 local `world` (render fn) shadows the `world` data at :29. Correct as written.
- Test coverage is identity-only, per brief; runtime behaviour is exercised only once FamilyApp consumes it (Task 1 characterisation tests + Task 5).

### Assessment

Spec-compliant. The GBC body moved faithfully: every hook, argument and relative order, the `ready` guard, edit-session args, discard-before-switch ordering (confirm → discard → go, catch → switchError), banners, world host, canvases and time group match GbcApp line for line. Everything not in the runtime is shell-owned per spec and listed under ⚠️ (17 items) for Task 5, with M1/M2 the two places where a naive wiring would change GBC behaviour.
