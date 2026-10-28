# Task 8 implementation notes

Task 8 is High risk because it replaces the GBA world canvas and moves asynchronous GET reconciliation and ledger ownership.
The input BASE is a09fbcf8a001fd69fc9f575c85ac8107430645f4. Initial git status was clean.
I read the delegate skill and worked as the conductor's already-dispatched Codex implementer in this scratch worktree.
No additional implementer or reviewer was dispatched. The conductor retains separate High-risk spec and quality reviews.
No commit was made. No subject repository, launch file, package configuration, existing test, or plan/spec status was changed.

Files touched are packages/ui/src/gba/worldSurface.tsx, packages/ui/src/components/WorldCanvas.tsx,
packages/ui/src/canvas/worldColours.ts, the import line only in packages/ui/src/canvas/WorldSurface.tsx,
packages/ui/test/WorldCanvasSurface.test.tsx, and this report.

The wrapper keeps WorldCanvas, WorldCanvasProps and WorldCanvasContext exported with the same call signatures.
Its memoised adapter contains all engine facts; all existing host callbacks and context pass through as surface props.
The onEditHere prop comment now describes the P12-4c fallback. Other public prop comments remain next to their fields.
computeFit already lives in canvas/worldView.ts but requires bounds, so the compatibility export remains a two-argument-capable
GBA default-bounds wrapper around it, as the plan's M-d requires. Its default is now 16/2048..16 px/tile (P12-4j).
The three visual helper exports re-export from worldColours.ts. WorldSurface imports those helpers directly, breaking the cycle.
The helper algorithms are unchanged; the binary search declaration was split to meet the one-statement-per-line rule.

## Adapter fields and baseline origins

All old locations below refer to BASE's components/WorldCanvas.tsx. The brief's earlier line numbers predate Tasks 1-2;
for example its snapshot/keep region near535-539 is BASE492-499. I name actual BASE lines so the comparison is reproducible.

nativePx is TILE_PX16, from old36-39. The imageUrl is the identical encoded /api/render/map.png URL and truthy ?v suffix
from old935-936. cacheKey0 is constant: the old image cache had no whole-family invalidation key.
useWorld is the new exported useGbaWorld, moving old490-527 and the reload counter from old394-401.
Its raw placement Map stays in state; the adapter resolves component:-1 sizes from singleton bounds before exposing the world.
Old211-227 explains those wire orphans; old563-576 explains why the size table depends on components rather than drag frames.
move preserves every existing placement field and changes x/y, as old1598-1616 and1633-1640 did for drag frames;
a missing placement is fabricated with singleton size and component:-1, as old1791-1808 did for a fresh rail drop.
The already-placed-map drop distinction remains a contract gap described below.

postPlacement moves old1429-1463's fetch body and HTTP status rejection. It sends one {map,x,y}, not the whole selection.
The surface supplies ledger.moved/resolve, per-member catches, one reload after settlement, and the successful-names callback.
postDungeons moves old537-560's POST {enabled} and HTTP status rejection. It does not require a JSON success body,
preserving GBA's existing response handling. The surface owns optimistic toggle generation and reload settlement.
saveErrorPolicy is explicitly dismissible, from old370-378 and1947-1963; later successes do not dismiss an unread error.
wrapToasts returns the same div.world-canvas__toasts from old1945-1971, in the viewport after context-menu nodes.
draggingMapClass is world-canvas__stage--dragging-map from old1811.

drawnByDefault is the same isDrawnByDefault(p.mapType ?? "", p.manual ?? false) from old233-246.
warpOffset1 preserves old1184-1185's (placement+warp) tile projection, unlike half-block event coordinates.
fetchWarps moves old992-1016's request into fetchGuarded with a guard for consumed fields. A malformed or failed response now
reaches the shared alert and retry lifecycle (P12-4d/s). GBA does not require the optional payload.mapName identity field.
Its resolveDestination closure moves old1220-1249's exact Number(destWarpId) array lookup against the destination cache.
An unresolved destination, missing destination entry or out-of-filter destination still draws no connection, never a guessed centre.
renderWarpPopup is the unchanged WarpDestinationModal mapName/onClose call from old2004.
The old fetch-every-visible-map comment at985-991 (brief1032-1036) is rewritten directly above fetchWarps:
P12-4r now requests visible maps only with Warps on at/above LOD, plus every filter member when lines are on.
The shared surface, rather than a second GBA cache, owns that scope and failed-entry eviction.

drawExtraLayers moves old1324-1336 and drawTriangle at2010-2024. It reads --link-dive/--link-emerge with the same fallbacks,
uses rectOf for the shared projection, and badges the source bottom-left corner at the same BADGE_SIZE offset.
The real drawing context's canvas dimensions supply the old viewport cull; older test contexts omit canvas, so optional access
leaves their right/bottom bound unbounded rather than throwing. The new test contexts include canvas and exercise the real geometry.
The old direct lookup of vertical-link source placements is preserved, including its documented out-of-filter badge possibility.
conflictTooltip moves old1363's exact GBA wording; the surface still supplies the accepted prefix, badge position and hit target.
fetchEncounters moves old958-967's guarded request and summariseGba. It computes the old1113-1127 method tint once on arrival,
with the same water_mons > fishing_mons > rock_smash_mons precedence. The shared cache discloses failures and retains summaries.
border is BORDER_BAND.gba from old1034 and1881. borderNeighbours is omitted, retaining the drawn-only default from old1019-1036.
useCoverage wraps the existing useCoverage and preserves empty names and levelByMap from old476,1063-1070 and1111.
The level-colour helper and its percentile rationale live together in worldColours.ts; the surface supplies the coverage-keyed memo.
lensLegend is empty, preserving the default GBA wording and methods in old1839.

statusItems moves old1980-2000 exactly: placed/hidden/unplaced/conflicts/accepted remain WORLD-wide even with a filter;
hover gives the map plus component size or "manual placement (unknown component)", then "Shift+drag to move";
the empty item is "Hover the world..." with the original Unicode ellipsis in the source. The DOM classes and strong elements stay.
legendExtras contains Dive then Emerge from old1845-1850, after the shared conflict legend.
toolbarExtras and toolbarAfterEncounter are undefined because the surface already reproduces old1816-1837's GBA order:
Dungeon auto-layout, Warps, optional Connection lines, the new ruled warp alert, EncounterFetchAlert, grow group with
SpeciesSpotlight then lenses, trailing group with zoom readout then Fit. fitFirst is omitted (false), and canvasLabel is omitted.
connectionColors is omitted because the default tokens and fallbacks exactly match old56-68 and1251-1252.
pruneSelectionOnFilter, dropSize, modifiedDoubleClick, unresolvedWarpError, shiftClickSelects and overlayOrder are all omitted.
These keep GBA defaults: retained selection, unguarded singleton-size drop, ignored modified double-clicks, silent unresolved preview,
ignored stationary Shift-click, and selection/jump/warps/connections/marquee/lens/spotlight order.
Group-drag membership remains unguarded, as old1496-1500: the surface reads all retained selected placements without a filter check.

## Reconciliation, line by line

The relevant old GET body is BASE490-527, corresponding to the brief's WorldCanvas509-567 region.
Old490: useGbaWorld opens the same useEffect, now depending on the supplied stable ledger as well as refetchGen.
Old491: The cancelled local starts false, unchanged.
Old492: ledger.snapshot() is still taken at GET issue, before fetch and before any state updater; only .current is removed.
Old493: The same fetchGuarded("/api/world", isWorldPayload) call is retained.
Old494: The same response continuation begins.
Old495: The cancelled response returns before changing any state or ledger.
Old496: The ownership comment remains directly above keep.
Old497: The keep Set is evaluated over ledger.versionedMaps() outside setRaw.
Old498: The exact !serverShows OR (absent AND !dropAbsent) rule is unchanged and remains outside the updater.
Old499: setWorld(previous) becomes setRaw(previous); no mutable ledger access is inside it.
Old500: A new Map starts from Object.entries(d.placements), unchanged.
Old501: The same for-of iterates keep.
Old502: The local placement is read from the updater argument previous, not a stale response closure.
Old503: A local placement is retained only when it exists, unchanged.
Old504: The keep loop closes, unchanged.
Old505: The next raw world object is returned.
Old506: placements is retained verbatim.
Old507: components is d.components, unchanged.
Old508: conflicts is d.conflicts, unchanged.
Old509: verticalLinks is d.verticalLinks, unchanged.
Old510: sidecarDungeonAutoLayout is renamed dungeonAutoLayout to satisfy the shared contract; source remains d.sidecar.dungeonAutoLayout.
Old511: The returned object closes.
Old512: The state updater closes.
Old513: The redundant compositeVersion increment is removed: changed world state itself triggers the surface draw effect.
Old514: setLoadError(null) becomes setError(null), still outside the updater after a successful response.
Old515: The successful-toggle generation comment now precedes setLoadedGen.
Old516: The comparison moves to WorldSurface455-460, using the returned loadedGen.
Old517: WorldSurface clears its own toggleReloadGeneration only once the corresponding GET generation has landed.
Old518: WorldSurface clears its own dungeonsPending in that same guarded effect.
Old519: The old inline toggle guard closes there; the adapter instead publishes refetchGen with setLoadedGen.
Old520: The successful response continuation closes.
Old521: The catch still receives unknown, renamed cause.
Old522: The same cancelled guard and Error/string conversion set the hook load error.
Old523: The catch closes.
Old524: The effect returns its cancellation cleanup, unchanged.
Old525: cancelled becomes true on cleanup, unchanged.
Old526: The cleanup closes.
Old527: The dependency list adds the stable ledger identity to refetchGen; the GET lifecycle is otherwise unchanged.

The landed raw world is separately projected into a sized SurfaceWorld; that memo never changes ledger ownership.
Loaded generations are React state, paired in the same batch as the world result, so the surface cannot clear a pending toggle
from an earlier GET. The issued snapshot and landing keep set are immutable closure inputs to every updater replay.

## New tests and negative-control expectations

WorldCanvasSurface.test.tsx contains 13 new cases through the real WorldCanvas. It imports no helpers from existing test modules.
Fixture and request-routing shapes are copied locally from WorldCanvas.test.tsx. World and warp responses are deferred promises
resolved explicitly by the test. Twelve bounded act/microtask passes flush each transition. There are no waitFor probes.
There are no new once-per-reload claims, so no GET count is used as a proxy for a hook invocation.
Expected geometry is literal and derived in adjacent comments; no production helper supplies an expected value.

P12-4c checks the missing no-handler callback at a point inside A under both old and fitted views.
P12-4d rejects a real pending warp request and expects its named alert; old GBA discarded that error.
P12-4e checks cluster fit at zoom5/pan0, B rect150,50,50,50 and31%, with Near visible only to the forbidden pre-fit view.
The second P12-4e case loads the world before any measured viewport, requests no image, then measures and expects the fitted view.
P12-4m (after the 2026-10-27 amendment) derives B's full-fill jump: z10, pan (-250,-100), rect 50,0,100,100, 63%. It matches old GBA, so it passes on the old source; mutation M5 (fraction 0.6) turns it red.
P12-4n covers Enter, all four zoom aliases, centre-pivot geometry, and a separate context1x/2x/1x stepped-key case.
P12-4o first ensures old GBA can show its marker too, then clicks the real marker; old GBA selected the body through it.
P12-4p checks a fresh node AND the full delayed re-jump lifetime. Old GBA already used key=jumpToken, so identity alone
would be a preservation test. Its old string state did not restart the timer; the new test checks past the old expiry.
P12-4r checks a line to offscreen shelved Far, destWarpId1 rather than0, and literal endpoint10,15,5020,5025.
The separate scope case checks no fetch with Warps off, no fetch below LOD, visible fetching above LOD, no new marker fetch
after switching Warps off and jumping, and all filter-member requests with lines on below LOD.
P12-4s checks a rejected A request stays at one across error renders, then becomes two after a1px pan; old GBA cached failure.
P12-4j checks context16*1.2=19.2 px/tile (120%), with A drawn at4,-46,192,192; old GBA capped wheel-in at16.
Every feature case is intended to fail against old WorldCanvas for the named missing behavior. These runs were not executed.

## Existing tests expected to fail or need inventory

No existing test was edited. git diff --stat -- packages/ui/test is empty; the new test file is untracked and therefore omitted
from that command. The conductor must first run every existing GBA test against this wrapper and rule each actual failure.
This is a static prediction list, not an executed failure inventory or authorization to remove any behavioral assertion.

P12-4e known plan list in WorldCanvas.test.tsx:357 culling;401-420 low LOD;487 pan;515 wheel pivot;574-601 placement
coordinates;1299 marquee;1664 warp projection;2264 border-side fixture;2282 low-zoom badge/sprites;2301 visible encounter fetch.
Keep every behavioral assertion, derive coordinates from the fitted view, and preserve offscreen/hidden/hit-target fixture roles.
Other static candidates in that file are423 LOD wheel count,610 pan-over-map,653 stationary Shift-click,674 leave-commit,
696 failed placement,1003-1109 conflict hit coordinates,1161 orphan draw rect,1230-1401 selection/marquee/group inputs,
1618 hidden-map jump,1700 marker zoom counts,2453-2488 select inputs and2513-2747 context-menu/keyboard point inputs.
Some fixtures already yield the old view after fitting; the conductor must distinguish those from actual failures.
P12-4e in WorldCanvasContext.test.tsx:112-119 plain-double-click targets and464-481 delayed-layout snap inputs are the
plan's known cases. Static additional candidates are122 modified-double-click targets,171/184 pointer/menu snaps,
242 recorded double-click,484/497 shifted-box menu inputs, and395/411 tile-version visibility expectations.
The viewport is still measured through the shared hook, and context entry itself still snaps once at the nearest map zoom.

P12-4j WorldCanvas.test.tsx:466-477 has a pure default-minimum expectation of1/64; the new default is1/128.
Keep its explicit-bounds tests and all other assertions. The context64 cap cases should remain unchanged;
new19.2 wheel behavior is pinned separately.
P12-4m WorldCanvas.test.tsx:1458 expects the full100x100 jump rect; derive20,20,60,60 instead for its10x10 target
in a100x100 viewport. The1488 same-map re-jump identity guarantee stays unchanged, with any rect rebased if needed.
P12-4c WorldCanvas.test.tsx:1728 and2617 plus WorldCanvasContext.test.tsx:144 are the plan's fallback list.
The context144 test only asserts no dialog/no throw today and may pass despite its obsolete title; do not invent a failure.
The2617 combined Ctrl/plain case must keep Ctrl suppressed and expect Map view only for plain double-click.

App*, AppContext*, placementResync.test.tsx, world/* and shell/worldParity remain unchanged and require conductor execution.
A failure outside named rulings is a finding; the static list does not silently authorize a changed expectation.
Each eventual rebase needs its own recorded mutation failure. No test count, rebase mutation, or passing gate is claimed here.

## Surface contract gaps left for the conductor

GBA old1791-1808 replaced even an already-placed map on HTML drop with a fresh component:-1 placement, singleton dimensions,
and no mapType/manual fields. The shared onDrop atWorldSurface650-667 calls the same move operation as drag/cancel frames,
passing only positions. useGbaWorld therefore cannot distinguish an existing hidden tree-drop from an ordinary position update.
It preserves existing metadata for drag correctness. A hidden existing placement can remain hidden until the POST/reload lands,
and its optimistic status may keep the old component. Proposed adapter fact: dropPlacement(map, at, world) returning the host's
fresh placement, with a corresponding typed world-hook apply operation; alternatively pass a drop origin to the hook move call.
Do not fix this by marking every optimistic move component:-1 or by exposing a family flag on WorldSurface props.

GBA old1281-1290 emitted selection outlines only for visible placements. WorldSurface391-395's outline helper falls back to
screenRect for every sized in-scope placement, regardless of culling or the visibility predicate. A selected map hidden after
filter clearing can retain an outline, and a culled selected map still has a DOM outline. Proposed adapter fact:
selectionOutlineScope:"visible" for GBA, with the current scoped behavior as the other default.
The shared hitTest also uses drawn rather than visible atWorldSurface432; ordinary inside-viewport input is equivalent,
but synthetic or captured outside input could target a map old GBA had culled. Review alongside the outline policy.

GBA old1343-1366 drew conflict badges by direct world placement lookup, with no mapFilter guard; old871-878 explicitly
flagged that as a future edge case and said it was unreachable on the measured corpus. WorldSurface288 now skips conflicts
outside the filter. Proposed adapter fact: conflictBadgeScope:"world" for GBA versus the current "scoped" rule.
Vertical-link drawing remains adapter-owned and keeps the old unscoped behavior. None of these gaps was silently unified.
Only WorldSurface's import line changed; no canvas contract or behavior was edited to resolve these findings.

## Removed comments and their destinations

Every full comment block removed from BASE is inventoried below by its exact inclusive BASE line range.
Public props comments at285-336 remain in the wrapper beside their fields, with the322 long line wrapped and313's fallback
updated under P12-4c. Inline orphan comments at279 and853 are preserved by the adapter's size-normalisation rationale.
No implementation rationale is parked above the thin WorldCanvas wrapper.
Old36-38: Moved with TILE_PX to gba/worldSurface.tsx.
Old41-44: Shared worldView range/LOD comments and wrapper default-bounds comment carry the native-unit rule.
Old49-51: Shared worldView range/LOD comments and wrapper default-bounds comment carry the native-unit rule.
Old53-53: Shared worldView range/LOD comments and wrapper default-bounds comment carry the native-unit rule.
Old56-61: WorldSurface connection palette supplies the same live-token/fallback rule; adapter defaults comment records reuse.
Old70-90: Shortened over GbaWorldPlacement, preserving optional fields and immediate rail visibility.
Old135-140: WorldSurface encounter-cache placeholder/failure comment plus adapter fetchEncounters arrival-summary comment.
Old144-144: WorldSurface encounter-cache placeholder/failure comment plus adapter fetchEncounters arrival-summary comment.
Old148-148: WireWarpEvent and adapter fetchWarps demand/cache comments; the shared warp cache owns placeholders.
Old153-155: WireWarpEvent and adapter fetchWarps demand/cache comments; the shared warp cache owns placeholders.
Old161-163: worldView WARP_HIT_RADIUS comment and WorldSurface marker/connection memo rationale; radius changes under P12-4i.
Old166-169: worldView WARP_HIT_RADIUS comment and WorldSurface marker/connection memo rationale; radius changes under P12-4i.
Old177-179: worldView WARP_HIT_RADIUS comment and WorldSurface marker/connection memo rationale; radius changes under P12-4i.
Old191-194: useWorldDrag start/no-op/commit comments retain gesture start positions.
Old211-223: Adapter size-normalisation and drawnByDefault comments retain orphan sizing and optional-field rules.
Old233-243: Adapter size-normalisation and drawnByDefault comments retain orphan sizing and optional-field rules.
Old248-250: Shared worldView hit/cull and useWorldDrag direction-sensitive marquee comments.
Old255-258: Shared worldView hit/cull and useWorldDrag direction-sensitive marquee comments.
Old263-264: Wrapper computeFit default-bounds comment, updated under P12-4j.
Old285-285: Retained beside the corresponding public wrapper prop or context field.
Old287-289: Retained beside the corresponding public wrapper prop or context field.
Old291-294: Retained beside the corresponding public wrapper prop or context field.
Old296-300: Retained beside the corresponding public wrapper prop or context field.
Old302-304: Retained beside the corresponding public wrapper prop or context field.
Old306-308: Retained beside the corresponding public wrapper prop or context field.
Old310-310: Retained beside the corresponding public wrapper prop or context field.
Old312-313: Retained beside the corresponding public wrapper prop or context field.
Old315-317: Retained beside the corresponding public wrapper prop or context field.
Old319-320: Retained beside the corresponding public wrapper prop or context field.
Old322-322: Retained beside the corresponding public wrapper prop or context field.
Old324-324: Retained beside the corresponding public wrapper prop or context field.
Old330-331: Retained beside the corresponding public wrapper prop or context field.
Old333-333: Retained beside the corresponding public wrapper prop or context field.
Old335-336: Retained beside the corresponding public wrapper prop or context field.
Old340-346: The obsolete monolithic-canvas introduction is replaced by adapter native/size/layer facts and the existing shared surface.
Old356-362: useWorldDrag trailing-click suppression rationale stays above its actual guard.
Old366-367: WorldSurface useConflictAcceptanceMenu and useWorldContext comments retain the client snap point.
Old370-377: Adapter saveErrorPolicy/postDungeons comments and WorldSurface dismissible-error/toggle-generation comments.
Old379-390: Adapter saveErrorPolicy/postDungeons comments and WorldSurface dismissible-error/toggle-generation comments.
Old406-408: Adapter fetchEncounters failure disclosure and WorldSurface counted loaded-empty cache comment.
Old411-412: WorldSurface independent warpsOn/linesOn/popup state and adapter fetchWarps/renderWarpPopup comments.
Old414-419: WorldSurface independent warpsOn/linesOn/popup state and adapter fetchWarps/renderWarpPopup comments.
Old421-423: WorldSurface independent warpsOn/linesOn/popup state and adapter fetchWarps/renderWarpPopup comments.
Old429-432: SpeciesSpotlight keeps its own null/empty/hit contract; WorldSurface spotlight state consumes it unchanged.
Old436-439: useWorldDrag selection rules and WorldSurface selected-set state/handlers own the same mechanism.
Old443-449: WorldSurface session-local revealed Set and scoped jump rationale; drawnByDefault remains adapter-owned.
Old452-454: WorldSurface jump token/fade comments above its actual effects.
Old459-475: Adapter useCoverage and WorldSurface coverage-error JSX comments, separate from world/save failures.
Old478-478: useViewportMeasure redraw/resize postmortem and WorldSurface draw dependency comment.
Old481-489: useGbaWorld GET and ownership comments immediately above snapshot/keep.
Old496-496: useGbaWorld GET and ownership comments immediately above snapshot/keep.
Old515-515: useGbaWorld setLoadedGen comment and shared toggle generation-clear effect.
Old529-536: Adapter postDungeons/saveErrorPolicy comments and WorldSurface guarded toggle rollback/reload rationale.
Old552-553: Adapter postDungeons/saveErrorPolicy comments and WorldSurface guarded toggle rollback/reload rationale.
Old555-558: Adapter postDungeons/saveErrorPolicy comments and WorldSurface guarded toggle rollback/reload rationale.
Old563-575: Adapter sizes memo and orphan-size projection comments.
Old578-596: WorldSurface unplacedNames derives singleton keys absent from placements; the old key-set micro-optimisation is not preserved.
Old607-626: Shared worldView fitClusters retains shelf-vs-landmass rationale; obsolete no-initial-fit claim superseded by P12-4e.
Old631-660: Shared worldView fitFilter anchored/fallback rationale keeps the shelved-map explanation.
Old681-703: WorldSurface scoped jump/pending-fit comments and token guard; old ESLint suppression retires with the effect.
Old713-720: WorldSurface scoped jump/pending-fit comments and token guard; old ESLint suppression retires with the effect.
Old728-731: WorldSurface scoped jump/pending-fit comments and token guard; old ESLint suppression retires with the effect.
Old734-754: WorldSurface independent fade effect and token-object comment; same-map lifetime changes under P12-4p.
Old761-802: WorldSurface fittedFilter Set stamp/reset rationale; old ESLint suppression retires with the old effect.
Old810-816: WorldSurface fittedFilter Set stamp/reset rationale; old ESLint suppression retires with the old effect.
Old819-825: WorldSurface drawn/visible memos and initial-fit culling explanation; filter iteration order changes under P12-4t.
Old829-848: WorldSurface drawn/visible memos and initial-fit culling explanation; filter iteration order changes under P12-4t.
Old855-878: Adapter drawnByDefault and vertical-layer direct-lookup comments; shared conflict-filter gap recorded above.
Old896-906: WorldSurface hiddenCount retains the global non-empty placement predicate; adapter statusItems states world-wide counts.
Old918-925: useWorldTiles cache/URL/version/previous-image comments; P12-7 retains the old decoded tile during refresh.
Old945-957: Adapter fetchEncounters plus shared WorldSurface counted-empty/placeholder comments.
Old972-977: Adapter fetchEncounters plus shared WorldSurface counted-empty/placeholder comments.
Old985-991: Rewritten directly above adapter fetchWarps for P12-4r demand scope and P12-4d/s visible failure/retry.
Old1008-1012: Rewritten directly above adapter fetchWarps for P12-4r demand scope and P12-4d/s visible failure/retry.
Old1019-1027: WorldSurface sideByMap drawn-neighbour and quadratic-cost comments; adapter default records GBA policy.
Old1038-1041: WorldSurface one-projection rectByMap/borderEntries comments; DOM overlays remain DOM.
Old1055-1061: WorldSurface one-projection rectByMap/borderEntries comments; DOM overlays remain DOM.
Old1063-1066: Adapter useGbaSurfaceCoverage name-set comment.
Old1072-1110: Moved beside themedLevelColorMap in worldColours.ts, retaining percentile/corpus/theme rationale.
Old1113-1119: Adapter fetchEncounters methodTint precedence comment; reuses the same fetched rows.
Old1135-1139: WorldSurface best-percent spotlightByMap comment.
Old1163-1173: Shared worldView LOD and WorldSurface marker/cache-version comments; demand scope uses the same threshold.
Old1190-1194: Shared worldView LOD and WorldSurface marker/cache-version comments; demand scope uses the same threshold.
Old1197-1209: Adapter resolveDestination exact-index/both-cache rationale and WorldSurface connection source sorting/projection comments.
Old1212-1215: Adapter resolveDestination exact-index/both-cache rationale and WorldSurface connection source sorting/projection comments.
Old1225-1229: Adapter resolveDestination exact-index/both-cache rationale and WorldSurface connection source sorting/projection comments.
Old1232-1241: Adapter resolveDestination exact-index/both-cache rationale and WorldSurface connection source sorting/projection comments.
Old1253-1271: WorldSurface resolved-subset colour-shift comment; retry behavior updates under P12-4s rather than loaded-failure permanence.
Old1277-1278: WorldSurface resolved-subset colour-shift comment; retry behavior updates under P12-4s rather than loaded-failure permanence.
Old1292-1297: WorldSurface draw-effect current view/viewport dependencies and useWorldTiles decoded-arrival version rationale.
Old1324-1326: Adapter drawExtraLayers vertical-link corner/cull comment.
Old1338-1340: WorldSurface shared conflict badge always-drawn/geometry comment; adapter conflictTooltip keeps host wording.
Old1371-1371: Shared useWorldContext owns the mode and retains its own snap/controlled-view rationale.
Old1391-1400: useStageZoom native non-passive wheel comment; listener ownership moves to the stage.
Old1408-1409: worldView worldZoomBounds and WorldSurface cap-ref comments; cap increases under P12-4j.
Old1428-1428: Adapter postPlacement/saveErrorPolicy and WorldSurface commit ledger/settlement/failed-save comments.
Old1438-1441: Adapter postPlacement/saveErrorPolicy and WorldSurface commit ledger/settlement/failed-save comments.
Old1448-1452: Adapter postPlacement/saveErrorPolicy and WorldSurface commit ledger/settlement/failed-save comments.
Old1458-1458: Adapter postPlacement/saveErrorPolicy and WorldSurface commit ledger/settlement/failed-save comments.
Old1465-1475: useWorldDrag pan-vs-Shift dispatch comments; adapter statusItems retains the discoverability hint.
Old1517-1535: useWorldDrag trailing-click/double-click guard rationale and WorldSurface dirty-session selection comment.
Old1542-1543: useWorldDrag trailing-click/double-click guard rationale and WorldSurface dirty-session selection comment.
Old1547-1556: useWorldDrag trailing-click/double-click guard rationale and WorldSurface dirty-session selection comment.
Old1558-1559: WorldSurface Shift/Edit-here/marker-priority double-click comment, with P12-4c fallback.
Old1570-1570: WorldSurface Shift/Edit-here/marker-priority double-click comment, with P12-4c fallback.
Old1586-1587: useWorldDrag movement/no-op comments and WorldSurface hover/tooltip handler.
Old1618-1623: useWorldDrag movement/no-op comments and WorldSurface hover/tooltip handler.
Old1642-1642: useWorldDrag movement/no-op comments and WorldSurface hover/tooltip handler.
Old1657-1659: useWorldDrag shared termination/no-op/ledger settlement comments.
Old1664-1667: useWorldDrag shared termination/no-op/ledger settlement comments.
Old1712-1734: useStage capture/fallback and useWorldDrag leave/cancel comments preserve pointer-boundary rationale.
Old1746-1752: useStage capture/fallback and useWorldDrag leave/cancel comments preserve pointer-boundary rationale.
Old1758-1759: useStage capture/fallback and useWorldDrag leave/cancel comments preserve pointer-boundary rationale.
Old1774-1774: WorldSurface onKeyDown scoped menu-centre projection comment.
Old1819-1821: Adapter fetchEncounters disclosure and shared coverage-error toolbar JSX comment.
Old1825-1831: Adapter fetchEncounters disclosure and shared coverage-error toolbar JSX comment.
Old1898-1906: WorldSurface jump-highlight token-key rationale directly above the highlight node.
Old1945-1945: Adapter wrapToasts and WorldSurface toast-stack comment.
Old1980-1988: Adapter statusItems comment states counts and rail membership remain WORLD-wide.
Old2026-2029: Moved with the visual helper implementation and its associated rationale into canvas/worldColours.ts.
Old2041-2045: Moved with the visual helper implementation and its associated rationale into canvas/worldColours.ts.
Old2051-2055: Moved with the visual helper implementation and its associated rationale into canvas/worldColours.ts.
Old2064-2080: Moved with the visual helper implementation and its associated rationale into canvas/worldColours.ts.
Old2081-2082: Moved with the visual helper implementation and its associated rationale into canvas/worldColours.ts.
Old2096-2097: Moved with the visual helper implementation and its associated rationale into canvas/worldColours.ts.

## Verification limits and next conductor steps

Per the explicit brief, no vitest, npm, vite, typecheck, UI build, full gate, live check, old-source negative control,
or mutation run was executed. No passing count or file count is claimed. Runtime acceptance and review remain pending.
The conductor should first run the unchanged GBA tests and record every actual failure before authorising any rebase.
Then run the13 new cases on current and old source, and mutate snapshot-inside-updater, dropped vertical layer and ignored
visibility predicate. Existing vertical-link and population tests remain untouched and should detect the latter two mutations.
The reconciliation mutation still needs experimental proof; static equivalence is not a killed-mutation result.
Finally run the full gate with both worker bounds, typecheck, UI build and live acceptance under the project's protocol.

Static git diff --check exited0. The tracked existing-test diff is empty. All touched source/test files use UTF-8 without BOM,
CRLF endings and lines at most140 characters. The only WorldSurface difference is its helper import path.
No key=url or key-based image remount was introduced; the intentional token-keyed highlight remains surface-owned.
No family branch was added to canvas; worldColours has historical family names only in moved comments.
The report remains unarchived because conductor verification, contract findings and independent reviews are still open.

## Pass 2 rebase inventory

Tier: High — hand-derived viewport, jump, and snap fixtures can pass with wrong numeric oracles.

Statically rebased all 96 inventory cases. Runtime confirmation remains with the conductor.

| File:line | Ruling | Rebase | Hand derivation |
| --- | --- | --- | --- |
| `test/App.test.tsx:1110` | P12-4e | App literals | 30x10 -> 21%; 21x10 -> 60% |
| `test/App.test.tsx:1181` | P12-4e | App literals | 30x10 -> 21%; 21x10 -> 60% |
| `test/AppContextEdit.test.tsx:179` | P12-4e | Route1 hits | 21x10 -> z10,pan(95,0); Route1 255,50 |
| `test/AppContextEdit.test.tsx:194` | P12-4e | Route1 hits | 21x10 -> z10,pan(95,0); Route1 255,50 |
| `test/AppContextEdit.test.tsx:261` | P12-4e | Route1 hits | 21x10 -> z10,pan(95,0); Route1 255,50 |
| `test/AppContextEdit.test.tsx:288` | P12-4e | Route1 hits | 21x10 -> z10,pan(95,0); Route1 255,50 |
| `test/AppContextEdit.test.tsx:276` | P12-4e | Route1 hits | 21x10 -> z10,pan(95,0); Route1 255,50 |
| `test/AppContextEdit.test.tsx:128` | P12-4e | Route1 hits | 21x10 -> z10,pan(95,0); Route1 255,50 |
| `test/AppContextEdit.test.tsx:155` | P12-4e | Route1 hits | 21x10 -> z10,pan(95,0); Route1 255,50 |
| `test/AppContextEdit.test.tsx:214` | P12-4e | Route1 hits | 21x10 -> z10,pan(95,0); Route1 255,50 |
| `test/AppContextEdit.test.tsx:390` | P12-4e | Route1 hits | 21x10 -> z10,pan(95,0); Route1 255,50 |
| `test/AppContextEdit.test.tsx:340` | P12-4e | Route1 hits | 21x10 -> z10,pan(95,0); Route1 255,50 |
| `test/AppContextEdit.test.tsx:378` | P12-4e | Route1 hits | 21x10 -> z10,pan(95,0); Route1 255,50 |
| `test/AppContextEdit.test.tsx:413` | P12-4e | Route1 hits | 21x10 -> z10,pan(95,0); Route1 255,50 |
| `test/AppContextStroke.test.tsx:130` | P12-4e | Route1 hits | 21x10 -> z10,pan(95,0); Route1 255,50 |
| `test/AppContextStroke.test.tsx:164` | P12-4e | Route1 hits | 21x10 -> z10,pan(95,0); Route1 255,50 |
| `test/AppContextVisit.test.tsx:119` | P12-4e | Route1 hits | 21x10 -> z10,pan(95,0); Route1 255,50 |
| `test/WorldCanvas.test.tsx:632` | P12-4e | pan fixture | Anchor extends bounds to 100x100 |
| `test/WorldCanvas.test.tsx:419` | P12-4e | Solo fixture | Solo 100x100 -> z1,pan0 |
| `test/WorldCanvas.test.tsx:477` | P12-4j | min bound | 16/2048=1/128 px/tile |
| `test/WorldCanvas.test.tsx:376` | P12-4e | cluster fixture | A/B/C 100x100 -> z1,pan0 |
| `test/WorldCanvas.test.tsx:590` | P12-4e | Frame fixture | Frame 100x100 fixes reload fit |
| `test/WorldCanvas.test.tsx:1021` | P12-4e | badge literal | Solo z10 -> badge 90,10 |
| `test/WorldCanvas.test.tsx:1045` | P12-4e | badge fixture | Anchor gives z1,pan0 |
| `test/WorldCanvas.test.tsx:1123` | P12-4e | edge fixture | 95x100 -> z1,pan(2.5,0) |
| `test/WorldCanvas.test.tsx:783` | P12-4e | Placed fixture | Placed 100x100 -> z1,pan0 |
| `test/WorldCanvas.test.tsx:1264` | P12-4e | multi fixture | B x100,C y100 -> z1,pan0 |
| `test/WorldCanvas.test.tsx:1343` | P12-4e | multi fixture | B x100,C y100 -> z1,pan0 |
| `test/WorldCanvas.test.tsx:1323` | P12-4e | multi fixture | B x100,C y100 -> z1,pan0 |
| `test/WorldCanvas.test.tsx:1376` | P12-4e | multi fixture | B x100,C y100 -> z1,pan0 |
| `test/WorldCanvas.test.tsx:1398` | P12-4e | multi fixture | B x100,C y100 -> z1,pan0 |
| `test/WorldCanvas.test.tsx:1178` | P12-4e | hover literal | Ghost 8x6 -> z12.5; hit 50,50 |
| `test/WorldCanvas.test.tsx:1100` | P12-4e | badge fixture | Anchor gives z1,pan0 |
| `test/WorldCanvas.test.tsx:688` | P12-4e | Solo fixture | Solo 100x100 -> z1,pan0 |
| `test/WorldCanvas.test.tsx:1076` | P12-4e | badge fixture | Anchor gives z1,pan0 |
| `test/WorldCanvas.test.tsx:1764` | P12-4e | warp fixture | cluster 100x100 -> z1,pan0 |
| `test/WorldCanvas.test.tsx:1690` | P12-4e | warp fixture | cluster 100x100 -> z1,pan0 |
| `test/WorldCanvas.test.tsx:1713` | P12-4e | warp fixture | cluster 100x100 -> z1,pan0 |
| `test/WorldCanvas.test.tsx:2527` | P12-4e | menu fixture | 100x100 fit -> z1,pan0 |
| `test/WorldCanvas.test.tsx:2638` | P12-4e | menu fixture | 100x100 fit -> z1,pan0 |
| `test/WorldCanvas.test.tsx:2583` | P12-4e | menu fixture | 100x100 fit -> z1,pan0 |
| `test/WorldCanvas.test.tsx:2612` | P12-4e | menu fixture | 100x100 fit -> z1,pan0 |
| `test/WorldCanvas.test.tsx:2628` | P12-4e | menu fixture | 100x100 fit -> z1,pan0 |
| `test/WorldCanvas.test.tsx:2723` | P12-4e | menu fixture | 100x100 fit -> z1,pan0 |
| `test/WorldCanvas.test.tsx:2692` | P12-4e | menu fixture | 100x100 fit -> z1,pan0 |
| `test/WorldCanvas.test.tsx:2540` | P12-4e | menu fixture | 100x100 fit -> z1,pan0 |
| `test/WorldCanvas.test.tsx:2517` | P12-4e | menu fixture | 100x100 fit -> z1,pan0 |
| `test/WorldCanvas.test.tsx:2561` | P12-4e | menu fixture | 100x100 fit -> z1,pan0 |
| `test/WorldCanvas.test.tsx:2621` | P12-4e | menu fixture | 100x100 fit -> z1,pan0 |
| `test/WorldCanvas.test.tsx:2740` | P12-4e | menu fixture | 100x100 fit -> z1,pan0 |
| `test/WorldCanvas.test.tsx:2677` | P12-4e | menu fixture | 100x100 fit -> z1,pan0 |
| `test/WorldCanvas.test.tsx:2721` | P12-4e | menu fixture | 100x100 fit -> z1,pan0 |
| `test/WorldCanvas.test.tsx:2304` | P12-4e | border fixture | hidden Anchor cluster -> z1,pan0 |
| `test/WorldCanvas.test.tsx:2269` | P12-4e | border fixture | hidden Anchor cluster -> z1,pan0 |
| `test/WorldCanvas.test.tsx:2286` | P12-4e | border fixture | hidden Anchor cluster -> z1,pan0 |
| `test/WorldCanvas.test.tsx:2457` | P12-4e | select fixture | A y100,B x100 -> z1,pan0 |
| `test/WorldCanvasContext.test.tsx:517` | P12-4e | snap literals | 23x10 -> z100/23,pan(0,650/23) |
| `test/WorldCanvasContext.test.tsx:504` | P12-4e | snap literals | 23x10 -> z100/23,pan(0,650/23) |
| `test/WorldCanvasContext.test.tsx:490` | P12-4e | snap literals | 23x10 -> z100/23,pan(0,650/23) |
| `test/WorldCanvasContext.test.tsx:470` | P12-4e | snap literals | 23x10 -> z100/23,pan(0,650/23) |
| `test/WorldCanvasContext.test.tsx:249` | P12-4e | snap literals | 23x10 -> z100/23,pan(0,650/23) |
| `test/WorldCanvasContext.test.tsx:130` | P12-4e | snap literals | 23x10 -> z100/23,pan(0,650/23) |
| `test/WorldCanvasContext.test.tsx:118` | P12-4e | snap literals | 23x10 -> z100/23,pan(0,650/23) |
| `test/WorldCanvasContext.test.tsx:190` | P12-4e | snap literals | 23x10 -> z100/23,pan(0,650/23) |
| `test/WorldCanvasContext.test.tsx:176` | P12-4e | snap literals | 23x10 -> z100/23,pan(0,650/23) |
| `test/WorldCanvasContext.test.tsx:156` | P12-4e | snap literals | 23x10 -> z100/23,pan(0,650/23) |
| `test/WorldCanvasSurface.test.tsx:240` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/canvas/WorldSurface.test.tsx:230` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/canvas/WorldSurface.test.tsx:247` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/canvas/WorldSurface.test.tsx:268` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/canvas/WorldSurface.test.tsx:281` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/canvas/worldView.test.ts:158` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/canvas/worldView.test.ts:18` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/gbc/GbcApp.test.tsx:832` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/gbc/GbcApp.test.tsx:798` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/gbc/GbcApp.test.tsx:823` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/gbc/GbcAppContext.test.tsx:395` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/gbc/GbcAppContext.test.tsx:158` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/gbc/GbcAppContext.test.tsx:477` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/gbc/GbcAppContext.test.tsx:500` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/gbc/GbcAppContext.test.tsx:578` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/gbc/GbcAppContext.test.tsx:319` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/gbc/GbcAppContext.test.tsx:332` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/gbc/GbcAppContext.test.tsx:343` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/gbc/GbcAppContext.test.tsx:364` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/gbc/GbcAppContext.test.tsx:379` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/gbc/GbcWorldCanvas.test.tsx:1217` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/gbc/GbcWorldCanvas.test.tsx:1225` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/gbc/GbcWorldCanvas.test.tsx:377` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/gbc/GbcWorldCanvas.test.tsx:396` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/gbc/GbcWorldCanvasSurface.test.tsx:393` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |
| `test/gbc/GbcWorldCanvasSurface.test.tsx:378` | P12-4m amended | full fill | z=clamp(min(vw/w,vh/h)); centre pan |

### Tests not rebased

None in the supplied inventory. A conductor run may reveal later assertions.

### Production bug candidates

None established from the supplied diagnostic.

### Verification limit

No Vitest, npm, Vite, typecheck, UI build, or live check ran in this sandbox pass. No pass count is claimed.
