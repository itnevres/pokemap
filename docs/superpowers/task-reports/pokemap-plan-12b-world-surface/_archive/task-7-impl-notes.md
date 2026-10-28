# Task 7 implementation notes

Status is stopped on a surface-contract gap, with an unverified draft implementation preserved for the conductor.
This task is High risk because it migrates a world canvas, async placement ownership and external guarded I/O,
and adds independently derived geometry tests. The delegate skill was read. This is the already-dispatched Codex
implementer working only in wt-t7, so no replacement implementer or reviewer was dispatched.
The baseline is d4a95fe9c2aa6485409af398b1f520ff7335d745. Initial status contained only the conductor's untracked
task-7-brief.md in this report directory; that file was left unchanged.
No commit was made. No subject repository, GBA file, canvas file, package script or launch configuration was edited.

## Stop condition: border neighbours cannot preserve GBC behaviour

Original GbcWorldCanvas.tsx:729-745 deliberately computes border sides over EVERY sized, in-scope placement,
including indoor/gate maps that visible excludes at :578. Its rationale says offscreen neighbours must block a side.
WorldSurface.tsx:318-324 instead computes sideByMap over drawn. Its drawn set applies adapter.drawnByDefault
and reveal state before this calculation. worldSurfaceAdapter.ts has no border-neighbour policy or callback.
The new GBC predicate faithfully preserves indoor/gate visibility, so it cannot also make those placements participate
in the surface's border neighbour set. Returning true for hidden maps would incorrectly request and draw their tiles.

A hand-derived counterexample is a visible town at (10,10), size 10x10, and a hidden indoor placement at (8,10),
size 2x10, with no other neighbours. The GBC band is 2 blocks. The town's left band is (8,10), size 2x10,
which overlaps the hidden map by 20 square blocks. Old GBC therefore chooses top, which has no overlap.
The shared surface omits the hidden neighbour and chooses left. The resulting encounter-border DOM geometry differs.
Neither P12-4m nor the reveal ruling changes the neighbour policy. This is an unnamed observable change.

Per the brief's explicit instruction to stop if the surface lacks something GBC needs, no canvas widening or adapter
workaround was attempted. The conductor must decide how the shared contract preserves the block-based neighbour set
before this draft can be called complete. A suitable focused regression would pin this hidden-neighbour border side
through the real wrapper. It has not been added because the gap was the stop point.

## Files touched and adapter provenance

packages/ui/src/gbc/worldSurface.tsx is new. It contains the adapter, guarded response validators, the world/coverage
hook bridges, and the compatibility helper exports that existing tests import through GbcWorldCanvas.
packages/ui/src/gbc/GbcWorldCanvas.tsx now retains the same GbcWorldCanvas export, GbcWorldCanvasProps and
GbcWorldCanvasContext shapes. It memoises the time-dependent adapter and forwards callbacks/context/view inputs.
packages/ui/test/gbc/GbcWorldCanvasSurface.test.tsx is new, with nine cases through the real wrapper.
packages/ui/test/gbc/GbcWorldCanvas.test.tsx changes only the three explicitly permitted P12-4m tests.
This report is new. The incoming task-7-brief.md is not an implementer change.
All old GBC line references below are against the baseline, not the wrapper's new line numbers.

nativePx=32 comes from :114-116. imageUrl comes from :667-668, retaining the optional nonzero version suffix.
cacheKey=time comes from the whole-cache invalidation at :633-641; the memory rationale stays over cacheKey.
useWorld wraps useGbcWorld from :423-426. Its generation snapshots, reconciliation and optimistic positions move
from :444-473 into useGbcSurfaceWorld, converting the placement record to a Map and exposing dungeonAutoLayout.
The issued snapshot remains captured by the hook's onIssue callback. The keep set is still captured before any
state updater, using the unchanged serverShows/dropAbsent predicate. Singleton rail drops still create manual
component=-1 placements with their component's size. move merges supplied positions into the local override record.
postPlacement comes from :918-934 and retains one guarded POST body { map, x, y } and isPlacementSaved at :407-409.
postDungeons comes from :935-954 and retains { enabled } and isLayoutSaved at :411-413.
The shared surface now owns settlement, reload and callbacks, with one reload after the group's outcomes.
saveErrorPolicy=per-map comes from :915-934. pruneSelectionOnFilter=true comes from :507-511.
dropSize comes from :1229-1240, rejecting out-of-filter names and preferring existing placement size to singleton size.
drawnByDefault comes from :578: manual maps draw, otherwise INDOOR/GATE maps stay hidden outside filters.
warpOffset=1/2 comes from :149-152. fetchWarps comes from :591-600 and :604-630, retaining the wrong-map guard
and exact destEvent endpoints. The destination stays in raw event steps and the surface applies the same half-block
factor to source and destination. No destination cache lookup or guessed corner is needed for GBC.
renderWarpPopup comes from :1299 and captures time for GbcWarpDestinationModal.
unresolvedWarpError comes from :1046. modifiedDoubleClick=true preserves :1033-1055.
No resolveWarp, connectionColors override or drawExtraLayers is needed: the existing shared palette matches
:146-147, and GBC has no extra canvas layer.
conflictTooltip uses conflictTooltipText from :232-245, retaining the CLI wording and sign convention.
fetchEncounters comes from :671-710, retaining fetchGuarded, isGbcEncountersPayload and summariseGbc.
methodTint retains the existing water/fish/headbutt/rock precedence from :254-282. The summaries stay independent
of time. border.band is BORDER_BAND.gbc from :741-743/:1249; border.time retains :1249 time dimming.
useCoverage wraps :427, :776-787, retaining coverage/error/levelByMap and memoised empty map names.
lensLegend uses the exact module-scope method key and copy at :284-307 and the original props at :1195-1202.
statusItems comes from :1285-1297, preserving component/map/zoom/conflict/accepted text, hover classes,
component size and block dimensions, and the empty hover text. No new hidden/unplaced status text is introduced.
canvasLabel comes from :1221. fitFirst=true preserves the leading Fit group at :1153-1159 with no zoom readout.
toolbarExtras and toolbarAfterEncounter are empty: GBC has no extra family-owned group beyond those Task 6
already moved into the surface. postDungeons supplies the switch, saveErrorPolicy supplies the dungeon/save/reload
error groups, and the shared grow group keeps SpeciesSpotlight followed by WorldLensControl (:1160-1192).
Thus save/reload groups follow the encounter alert, as before. No wrapToasts or draggingMapClass is supplied.
overlayOrder preserves :1250-1281: warps, connections, lens, spotlight, selection, jump, then the new marquee.
No legendExtras is supplied, matching :1204-1206. No engine fact is passed as a surface prop.

Compatibility exports keep projectGbcWarpPoint, GBC_LOD_ZOOM_THRESHOLD, GbcWorldView, zoomWorldAboutPivot,
initialFitBounds, fitAllBounds, conflictTooltipText, shouldUseLod, jumpFit and methodTint available from the old module.
initialFitBounds and fitAllBounds retain their old pure helper semantics for existing direct tests; the live surface
uses fitClusters/fitFilter. Their comments now identify them as compatibility exports.

## P12-4m fit deltas and changed existing tests

First, fitClusters unions live member placements, following a manually moved cluster member rather than the old
component.bounds union. Second, fitFilter includes anchored members only when any member resolves to a real
component; old GBC fitted every scoped placement, including distant shelved members.
I inspected the placement literals and mutations in both GbcWorldCanvas.test.tsx and GbcWorldCanvasContext.test.tsx.
No current real-wrapper first-fit fixture moves a cluster member away from its component bounds or combines
anchored and shelved members in a filter. The dungeon scopedWorld has components=[], so its filter has no anchored
member and still falls back to every scoped placement. The BurnedTower endpoint fixture also has components=[].
The old hidden-map drop fixture at :1021-1058 changes a singleton Interior after mount, rather than a member
of the fitted cluster. The direct initialFitBounds/fitAllBounds helper tests continue testing the compatibility exports.
No additional existing-test rebase was identified by static inspection. Runtime failures remain for the conductor.

Only three existing tests were changed, all under P12-4m and within the explicitly allowed locations.
The old :685 Fit-all test now expects the multi-map cluster and excludes the far singleton.
The old :1323 StrictMode Fit-all test still perturbs the view and pins exact single-application pan, now by selecting
MapB in the fitted cluster rather than the excluded Interior. MapB's literal rect origin is (100,50).
The old :2001-2009 F-shortcut fit expectations now follow the same cluster fit and leave Interior unfetched.
For all three, cluster bounds=(0,0)-(20,10), viewport 200x200, zoom=min(200/20,200/10)=10, pan=(0,50),
percentage=round(10/32*100)=31. These values were hand-derived in adjacent comments, not obtained from production.
The rebases are justified by code/fixture inspection; no failing test run was possible or claimed.
The test names/behavioral assertions for first fit, pre-fit culling, zoom bounds, warp retry, 60% jump and time
re-dimming were otherwise left unchanged. GbcWorldCanvasContext.test.tsx was left unchanged.

## New tests and independent numeric derivations

The new test file copies FakeImage, FakeResizeObserver, fake canvas context, WORLD, EMPTY_COVERAGE and
mockFetchAll helpers/fixtures from GbcWorldCanvas.test.tsx, rather than importing that test module.
The only mock of useGbcWorld delegates to the real hook and wraps reload with useCallback and a vi.fn counter.
It does not count GETs. Placement requests return deferred promises that each test explicitly resolves.
Microtasks are flushed in bounded act loops; no waitFor callback mutates DOM, and no timers or sleeps are used.

Ctrl and Cmd toggle cases select MapA then MapB, assert two exact outlines, then toggle B off again.
The marquee crosses from empty (201,151) to (-1,49), covering the two projected maps completely.
The group test moves screen(50,100)->(70,110) at zoom10, giving native delta(2,1), so one POST is
{ map: MapA, x: 2, y: 1 } and the other is { map: MapB, x: 12, y: 1 }.
Neither reload nor onPlacementsSaved may happen while the first or second deferred outcome remains pending.
After both settle, exactly one hook reload and one successful-name callback are expected.
The capture test proves setPointerCapture(1) is called with the pointerdown canvas as this. The captured move goes
outside the 200x200 viewport to (250,210); leave does not post. Pointerup/mouseup commits A at (20,11) once,
from screen delta(200,110)/zoom10. Repeated termination never posts again.
Capture loss without pointerup restores A to screen(0,50), with no POST and no hook reload.
The warp preservation test projects raw event(10,10) to block(5,5), then screen(50,100), and checks radius8
suppresses selection at (58,100), while radius9 at (59,100) selects MapA.
Both INDOOR and GATE reveal cases jump to the placed Interior while unfiltered, assert the time-qualified tile
request and explicitly fire its image load, then assert a real stage draw at (40,40,120,120).
The jump derives zoom=.6*min(200/5,200/5)=24; pan=100-1002.5*24=-23960, and size5*24=120.
All expected geometry is literal and explained beside the relevant assertion.

Old-source feature negative controls and mutations were not executed. Expected old-source failures are absence
of two toggle outlines, absence of marquee, only one moved map/body and early reload, absent pointer capture
(and commit-on-leave), and absence of hidden-map drawing after jump. The radius8 preservation test should pass
on the old source and fail under a radius6 mutation. Posting the whole selection should fail the group body
assertion. Ignoring time in cacheKey should fail the unchanged existing time-switch cache tests.

## Deferred M6 answer

Yes. GbcWorldCanvasContext.test.tsx:290 and :314 exercise the surface cap through the real wrapper after migration.
The file imports GbcWorldCanvas directly, mounts it with a renderCanvas probe, and dispatches native wheel/key
inputs on its real stage. It does not mock WorldSurface or useStage.
The wheel case checks 32*1.2=38.4 px/block (120%), cap128 px/block (400%) and 128/1.2 (333%).
The key case checks plus at 128 stays 400%. The earlier buttons test drives the overlay probe as well.
Therefore no duplicate M6 cap test was added to the new file. Their runtime pass remains unverified.

## Removed and relocated comments

The following original line ranges enumerate removed comment blocks, including block comments. Props/context
contract comments at :365-403 stay immediately above their existing fields in the wrapper. They are not parked
implementation rationale. Helper comments move with their implementation into worldSurface.tsx.

Original :41-112's large mechanical history is shortened into the responsible shared code's existing rationale:
WorldSurface initial fit (atomic fitted gate and308-vs80 requests), draw effect (viewport dependency), projection,
warp/jump effects and badge loop; useStageZoom (native non-passive wheel and one updater); useWorldTiles (cache
placeholders, small tiles, stale URL exclusion); useWorldDrag (trailing-click guard). Its fixed-URL guard rationale
remains in useGbcWorld. The obsolete no-multiselect/no-dungeon-toggle paragraph is removed under P12-3/current
behavior. The screenshot-after-images instruction is recorded here: screenshots must wait for image load and
instrument drawImage before dismissing a blank canvas. It describes verification, not a wrapper mechanism.
Original :114-115, :133-134, :137-142, :149, :170-171, :190-201, :232-240, :247-249, :254-274,
:284-290, :298-302 and :309-310 remain over the moved constants and compatibility helpers in worldSurface.tsx.
Original :120-123 is shortened over GBC_ZOOM_BOUNDS; :158-163 is shortened over GbcWorldView without a stale header reference.
Original :126-130 is represented by shared worldView WHEEL_FACTOR and useStageZoom's continuous policy.
Original :154-155 and :519-521 are represented by WorldSurface JUMP_HIGHLIGHT_MS, jump state and fade effect.
Original :182-185 belongs to shared worldView hit/cull geometry; the obsolete copy-vs-import rationale is removed.
Original :215-216 moves over fitAllBounds, now explicitly labelled as the pre-P12-4m compatibility rule.
Original :326-335, :339-340 and :671-688 shorten into the time-independent fetchEncounters comment and the
shared WorldSurface encounter-cache placeholder/failure explanation. :703-710's failure distinction is retained
there as the F4 visible-failure rationale rather than claiming failures are indistinguishable empty maps.
Original :415-420's stitched-world introduction is replaced by this adapter's native unit/visibility facts and the shared
surface. It is not parked over the thin wrapper.
Original :423-424, :445, :449, :451, :457 and :465 move over their corresponding generation, reconciliation,
size and absent-placement logic in useGbcSurfaceWorld.
Original :436-439 moves to the existing detailed trailing-click rationale in useWorldDrag.
Original :485-488 and :764-766 correspond to WorldSurface's encounterVersion cache-bust explanation.
Original :490-494 and JSX :1168-1172 correspond to adapter.fetchEncounters F4 comments and the shared
EncounterFetchAlert/cache-failure path. :502-503 corresponds to WorldSurface's useConflictAcceptanceMenu wiring.
Original :512-516 corresponds to WorldSurface's lens/spotlight state; SpeciesSpotlight retains its hits contract.
Original :523-524 and :811-813 correspond to WorldSurface's draw-effect viewport dependency postmortem.
Original :526-537 corresponds to WorldSurface's initial-fit effect comment, retaining measured 308-vs80 rationale.
Original :564-569 corresponds to the shared drawn/visible first-fit gate and viewport cull.
Original :633-638 is shortened over adapter.cacheKey, retaining the 153MB-per-time memory rationale.
Original :643-653 corresponds to useWorldTiles' cache-key, tile-version retention and superseded-URL rationale.
Original :717-723 corresponds to WorldSurface's one-projection rectByMap comment.
Original :729-738 is the stop finding above. Its every-placement/hidden-neighbour rationale is NOT preserved by
the current surface: this gap is explicitly left unresolved rather than silently discarded.
Original :747-753 corresponds to WorldSurface's borderEntries memo and undefined-vs-empty summary comment.
Original :768-772 corresponds to adapter.fetchEncounters methodTint and WorldSurface's cached methodTintFor reader.
Original :776-782 and :784-786 correspond to adapter.useCoverage and the shared coverage-keyed levelColorByMap memo.
Original :788-790 corresponds to WorldSurface's useLensOverlayEntries with the adapter-owned tint and level inputs.
Original :793-796 corresponds to WorldSurface's best-percent spotlightByMap comment.
Original :836-840 corresponds to WorldSurface's conflict badges comment and adapter.conflictTooltip.
Original :863-864 corresponds to WorldSurface's useWorldContext and WorldContextOverlayMount wiring.
Original :884-886 corresponds to worldView.worldZoomBounds and the surface's commit-published cap ref comment.
Original :888-889 corresponds to useStageZoom's native non-passive listener rationale. :902's local eslint
suppression is removed with the old listener; the shared listener owns its dependencies.
Original :915-916 is shortened directly over adapter.saveErrorPolicy; :951 remains in WorldSurface.toggleDungeons.
Original :1035 and :1053 correspond to WorldSurface's Shift bypass/Edit-here comment and modifiedDoubleClick fact.
Original :1066-1077 and :1079 correspond to WorldSurface's keyboard handlers and scoped menu-centre projection.
Original :1108-1113 and :1124-1140 correspond to the shared jump effect's scoped token, 60% fit and independently
scoped fade. JSX :1265-1269 corresponds to the shared highlight's token key rationale.
Original :1180 corresponds to WorldSurface's comment over the per-map reload group explaining separate truncation.
JSX :1186-1188 corresponds to the shared grow toolbar group, whose position is explained at the adapter's empty slots.

## Verification and remaining work

No vitest, npm, vite, typecheck, UI build, full gate, live-app check, old-source run or mutation was executed.
There is no passing count or file count to report for any runtime gate. All checks belong to the conductor by brief.
The report is intentionally not archived: a contract finding remains open and no independent review has passed.
The conductor still needs to resolve the border-neighbour policy, run the new/old GBC tests, prove old-source
feature failures and preservation mutations, run focused/full gates, typecheck/build, live verification and reviews.
Task 9's cross-family measurement has not been attempted; the GBA migration is outside this task.

Static inspection: git diff --check exited 0, and git diff --stat -- packages/ui/test reported the one tracked
existing test file changed, 51 lines total: 22 insertions and 29 deletions. That command omits the new untracked
GbcWorldCanvasSurface.test.tsx; its new cases are additional, not replacements. All five output paths were
normalised to CRLF and UTF-8 without BOM. Canvas/GBA paths have no diff. No commit was made.
