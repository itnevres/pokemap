# Task 5 spec-compliance review (base a0cfb95, head 98aa5ea)

Scope: `packages/ui/src/shell/FamilyApp.tsx` (new, 237), `App.tsx` / `gbc/GbcApp.tsx` (bodies -> wrappers), `Root.tsx` (+3 imports, one-line mount, doc comment), `test/gbc/Root.test.tsx` (+23, one test). Diff stat: 5 files, only Root.test.tsx under `test/`. Old shells read from `git show a0cfb95:...` (line numbers below are the OLD files). Suite not re-run (gate per controller: 2721/0/173; the 13 shell files + Root pass unedited; typecheck + build clean).

### Spec Compliance

- ✅ FamilyApp.tsx:11-16, 24: `FamilyAppProps { adapter; switcher? }`, `export function FamilyApp`. Matches brief "Produces".
- ✅ Code = brief Step 2 except: `<copy>` placeholders filled verbatim (28-30 = App 32-34; 32-43 = GbcApp 59-70; 119-130 = App 156-167; 133-141 = App 170-178; 185-194 = App 252-261; 217-224 = App 323-330), JSX for DungeonSidebar/MapTree/content ternary/SaveDialog compressed (same props, same branch order, checked prop by prop), ellipses fixed by orchestrator. No other drift.
- ✅ Wrappers: App.tsx and GbcApp.tsx byte-match brief Step 3 (GbcApp keeps `TimeOfDay`, `root` prop).
- ✅ Root.tsx:3-5 imports; :60 `<FamilyApp key={key} adapter={family === "gbc" ? gbcAdapter : gbaAdapter} switcher={switcher} />`, key = `family:root:gen` (:57); doc comment :13-14 updated. Spec "Files" row for Root met.
- ✅ Root test = brief Step 1 verbatim (Root.test.tsx +23). Review Focus 4 pinned (absence of Time-of-day group + "Crystal", single View group).
- ✅ Spec "FamilyApp owns" list (spec 109-113): mode, selected, selectVersion, jumpTarget, openDungeonId (26-45), stroke registry (60), useContextEditing (61-65), useBeforeUnloadGuard (51), enterWorld (104-109), switchMode (97-100), selectMap (68-74), selectMapFromWorld (78-80), openMapFromWorld (84-91), deleteDungeon (131-143), allMapNames (114-117), mapFilter via `useDungeonFilter(openDungeon, caps.dungeonFilterCache)` (112), header (165-182), sidebar (184-209), SaveDialog (225-231). All present.
- ✅ Spec "disagree" bullets: tree `sameMap: name === selected` (74); `onEnterContext` before `ctx.enter` (94-95); `onSelected` after `setSelected` (57-58); `saveDialog.onCommitted()` after `ctx.onCommitted()` (229).
- ✅ Plan decision "sameMap only matters for the tree": `leave` wrapper fixes `sameMap: false` (54); world click guarded `if (name !== selected)` (79); Open-in-Map on same map calls `go` directly (90). Spec 120-121's "pass sameMap" wording is superseded by the decision; behaviour equals both old shells.
- ✅ Plan decision "onSelected on every selection change": `setSelected` appears only inside `select` (56-59), and every path (tree 70, world click 79, open-in-map 86, ctx enter via `select` arg 62) goes through it. Review Focus 5 choke point holds.
- ✅ Plan decision "World-visibility error placement follows GBC": 196-198, outside the ternary, after the groups error. Same text as both old shells.
- ✅ Plan decision "Capability flags": `manualPlacements` gates the merge (150); `timeOfDay` gates `headerExtras` (179); `dungeonFilterCache` feeds `useDungeonFilter` (112).
- ✅ Reconciliation: `<main>` children are always 4 slots (211 banners, 212-216 content, 225 SaveDialog, 232 modals). GBA `renderWorld` returns `MapEditingWorkspace key="world-host"` in both branches (gba/adapter.tsx:95-99); GBC returns `div.app__map-editing key="world-host"` (gbc/adapter.tsx:115). World host keeps slot and key across in-context toggles.
- ✅ Hook order is fixed per mount: 6x useState (26-46) -> `adapter.useRuntime` (48) -> useBeforeUnloadGuard (51) -> useStrokeChainRegistry (60) -> useContextEditing (61) -> useDungeonFilter (112) -> useMemo x2 (114, 148). No hook is conditional. Relative order of effectful hooks vs old shells preserved (data hooks inside runtime in old order -> beforeunload -> context editing).
- ⚠️ Spec 248-249 says "`FamilyApp` reads the adapter once". FamilyApp reads `props.adapter` on every render (25, 48, 167); nothing inside FamilyApp pins it (e.g. `useState(() => adapter)`). The guarantee holds only because Root keys on family and the wrappers pass module constants. This is exactly the brief's code, and the Root test pins the keyed path, so not a defect; noting the wording gap (Minor m1).
- ⚠️ Spec 97-98 says GBA `onSelected` clears its hovered metatile (R2). GBA `onSelected` is still a no-op (gba/adapter.tsx:106); that is Task 10's work, not Task 5's. FamilyApp already calls it on every path, so Task 10 only fills the runtime.

### Task 4 carry-over (17 items)

| # | Item | Verdict | FamilyApp line |
|---|---|---|---|
| 1 | `useBeforeUnloadGuard(runtime.session.isDirty)` | MET | 51 |
| 2 | ctx `leave` adapted to one-arg: `(go) => runtime.leave(go, { sameMap: false })` | MET | 54, 62 |
| 3 | ctx `select` = setSelected + `onSelected`; `openSave` -> `saveDialog.setOpen(true)`; `strokeSettled` from registry | MET | 56-59, 62-64, 60 |
| 4 | `selectMap`: go = select (onSelected clears switchError/hover), leaveContext, jumpTarget, bump; `sameMap: name === selected` (GBC same-map runs go directly, incl. clears) | MET | 68-74 |
| 5 | Same-map world click stays a no-op (M2) | MET (guard kept) | 79 |
| 6 | `openMapFromWorld`: go = select, leaveContext, setMode("map"); direct on same map | MET | 84-91 |
| 7 | `onEnterContext(name)` BEFORE `ctx.enter(name)` | MET | 93-96 |
| 8 | `enterWorld` (no-op in world; jumpTarget = selected; bump; mode) and `switchMode` (leaveContext then setMode) | MET | 104-109, 97-100 |
| 9 | `requestExitContext = ctx.requestExit` into slots | MET | 158 |
| 10 | openDungeon only in dungeon mode; cached mapFilter; allMapNames; deleteDungeon functional clear; placeholder branch kept in shell | MET | 111, 112, 114-117, 131-143, 213 |
| 11 | Manual-placement merge `manual || manualPlacementMaps.has(name)` over `placed`; `markManualPlacement` dedupes | MET | 147-154, 145-146 |
| 12 | Header order: title, label span, View, headerExtras, status, switcher | MET | 166-181 |
| 13 | Sidebar: groups error; world error only in world mode; DungeonSidebar props; MapTree worldMode/visibility/hiddenMapTypes; Loading text | MET | 195-208 |
| 14 | `<main>`: banners first, then content, then SaveDialog | MET | 211, 212-216, 225 |
| 15 | Map-view precedence: !selected -> map.error -> ready -> Loading | MET | 214-216 |
| 16 | SaveDialog only when `open && selected`; `mapName={selected}`; onCommitted order ctx.onCommitted, setOpen(false), runtime onCommitted; onCancel setOpen(false) | MET | 225-230 |
| 17 | Slot mapping: jumpToken = selectVersion, onJumpToMap = selectMap (runtime side), tileVersions/contextMap from ctx, onStrokeChain from registry | MET | 156-160 |

17/17 MET.

### Parity table

| Behaviour | Old GBA (App.tsx) | Old GBC (GbcApp.tsx) | FamilyApp | Verdict |
|---|---|---|---|---|
| State: mode/selected/selectVersion/jumpTarget/openDungeonId | 30-41 | 56-83 | 26-45 | same |
| manualPlacementMaps state | n/a | 82 | 46 (merged only if cap) | same |
| beforeunload guard | 73 | 111 | 51 | same |
| ctx args (selected, session, leave, select, openSave, strokeSettled) | 84-88 | 125-130 | 61-65 | same (GBA select + no-op onSelected; GBC select = clear switchError/hover via onSelected) |
| Tree click (selectMap) | 90-102 (guard, then select, leaveContext, jump, bump) | 150-160 (same-map direct go) | 68-74 | same; GBA prompts on same map (runtime ignores sameMap), GBC skips |
| World click (selectMapFromWorld) | 107-109 | 168-170 | 78-80 | same, except GBC now also clears hover id: plan decision |
| Open in Map view | 113-118 (same map: no select call) | 183-192 | 84-91 | same (extra `select` on same map is a no-op setSelected + onSelected; GBC already cleared there) |
| enterContext | 120 | 194-197 | 93-96 | same |
| requestExitContext | 121 | 198 | 158 | same |
| switchMode | 122-125 | 199-202 | 97-100 | same |
| enterWorld | 129-134 | 175-180 | 104-109 | same |
| openDungeon | 148 | 132 | 111 | same |
| mapFilter | 149 (fresh Set) | 133-143 (cached) | 112 via useDungeonFilter(cache flag) | same (useDungeonFilter.ts:14 / :15-21) |
| allMapNames | 151-154 | 144 | 114-117 | same |
| deleteDungeon (await + functional clear) | 168-180 | 145-148 | 131-143 | same |
| Tree visibility | 285 (raw) | 88-91 (merged) | 147-154 | same; GBC merge identity triggers on world/manual change as before |
| hiddenMapTypes | default (= HIDDEN_MAP_TYPES, MapTree.tsx:24) | 281 GBC_HIDDEN_MAP_TYPES | 205 runtime.hiddenMapTypes | same |
| Header title / label | 220 / none | 250 / 251 "Crystal" | 166 / 167 | same (label null renders nothing) |
| View group | 221-246 | 252-262 | 168-178 | same markup |
| headerExtras (time group) | none | 263-269 | 179 | same |
| Status + switcher | 247-248 | 270-271 | 180-181 | same |
| Groups error | 262 | 275 | 195 | same |
| World-visibility error | 277-279 (only when groups loaded, inside fragment) | 276 | 196-198 | GBC placement: plan decision; GBA DOM order when loaded unchanged (error p precedes MapTree) |
| DungeonSidebar vs MapTree vs Loading | 263-290 | 277-284 | 199-208 | same |
| `<main>` banners | none | 289-296 | 211 | same (GBA banners null) |
| World content / world-host key | 293-307 | 297-315 | 212 renderWorld | same (key preserved in runtimes) |
| Dungeon content / placeholder | 308-313 | 316-318 | 212-213 (`openDungeon && mapFilter`) | same (mapFilter non-null whenever openDungeon is) |
| Map-view placeholders/precedence | 314-322 | 319-338 | 214-216 | same |
| SaveDialog onCommitted order | 338-341 | 345-349 | 229 | same (GBA runtime onCommitted no-op; GBC reload) |
| SaveDialog onCancel | 342 | 350 | 230 | same |
| SignComposer (modals) | 349-359 | none | 232 runtime.modals | same (gba/adapter.tsx:124-135) |
| Root mount | App/GbcApp keyed | same | Root.tsx:60 FamilyApp keyed family:root:gen | same |

No GBA or GBC behaviour lost, duplicated or altered beyond the plan's two listed decisions (GBC world-click hover clear; world-visibility error placement).

### Issues

**Critical:** none.

**Important:** none.

**Minor:**
- m1: Spec 248-249 "FamilyApp reads the adapter once" is met by Root's key and the wrappers' constants, not by FamilyApp itself (25, 48, 167 read `props.adapter` each render). Matches the brief; a future caller that passes a changing adapter without a key would break hook order silently. A one-line `const [adapter] = useState(() => props.adapter)` or a doc note on Task 6's removal of the wrappers would close it. Not blocking.
- m2: No test pins the GBA side of the "world-visibility error follows GBC" decision (error shown when groups failed/loading in World). Behaviour is correct by reading; coverage only.
- m3: Old App.tsx:136-147's comment on openDungeon identity (rename re-mints mapFilter and refits) is not carried into FamilyApp; its substance survives in useDungeonFilter.ts:6-8. Fine.
- m4 (process): the implementer (Codex) could not run Vitest; the orchestrator ran it and caught mojibake ellipses no test pins. Already fixed in 98aa5ea (FamilyApp 207, 216 read "…").

### Assessment

Spec-compliant. FamilyApp is the brief's code with comments filled and JSX compressed; every shell-owned behaviour of both old shells maps line for line, the 17 Task 4 carry-over items are all met, the four-slot `<main>` keeps the world host stable, `onSelected` is the single selection choke point, and Root mounts a keyed FamilyApp with the family's adapter. The only behaviour changes are the two the plan lists as decisions.
