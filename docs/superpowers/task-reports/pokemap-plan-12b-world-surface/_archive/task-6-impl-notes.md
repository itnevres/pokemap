# Task 6 implementation notes

This is High risk because it wires canvas gestures, placement-version ownership, asynchronous settlement, and adapter-owned I/O.
The input baseline was 3d6ff3f4cc0a89277d37fd401471442ac78d43b4. The worktree was clean at the initial status read.
I read the delegate skill and implemented as the already-dispatched Codex implementer in this worktree.
No further implementer was dispatched.
The conductor owns separate spec and quality reviews, tests, mutation runs, typecheck, UI build, and the full gate.

Files touched are packages/ui/src/canvas/WorldSurface.tsx, packages/ui/src/canvas/worldSurfaceAdapter.ts,
the new packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx, and this report.
No existing test, wrapper canvas, subject repository, package script, or launch configuration was edited. No commit was made.

The new interaction fields are optional so the Task 5 fixture and existing test file can remain unchanged.
Real wrapper adapters must supply the request fields when they migrate in Tasks 7 and 8.
All world-bearing callbacks use W extends SurfaceWorld<P, C>; no world cast or family dispatch was added.

postPlacement receives one map position and the typed world, and must reject any failed request or invalid save response.
postDungeons receives the desired toggle value and typed world with the same rejection contract.
WorldData.move is used for drag frames, cancellation rollback, and rail drops.
Every rail drop begins its version before optimistic movement; useWorldDrag supplies that ordering for drags.
Each placement outcome is caught individually and resolves its own ledger version. One Promise.all joins those caught outcomes.
Only after that join does reload run once and onPlacementsSaved receive the successful names, in gesture order.
An empty successful-name list keeps the existing no-callback behaviour.
The hook remains responsible for taking GET snapshots before state updaters and reconciling through the supplied ledger.

warpOffset is the adapter's native-unit multiplier. fetchWarps owns requesting and validating the wire payload, including map identity.
SurfaceWarp carries the source point, optional preview map, and optional resolved endpoint.
Its optional resolveDestination closure can retain an engine warp ID and look up the exact destination in the normalised cache later.
The optional adapter resolveWarp callback additionally receives W when endpoint resolution needs world metadata.
Neither path invents a missing destination warp or substitutes a map centre.
renderWarpPopup supplies adapter-owned preview content and its close callback; unresolvedWarpError preserves unresolved-preview policy.
connectionColors supplies palette tokens and fallbacks when needed; the default eight colours match the current sources.
Sources sort by map name, then keep warp order; as before, palette positions can shift while endpoints arrive and settle afterwards.
Request placeholders prevent duplicate in-flight requests. Failed entries are deleted and the latest error is displayed.
Retry dependencies are view, viewport, toggles, filter, and the semantic scope of requested names.
Adapter object identity and cache-version/error renders are deliberately excluded, preventing error-render retry loops.
Unmount invalidates pending request identities; queued requests and late results cannot land after cleanup.

WorldStatus.hover now carries map name, typed placement, component, width, and height. Each adapter keeps its own status copy and units.

The save-error differences are preserved by saveErrorPolicy.
The dismissible policy keeps one error through later successful posts and shares that slot with dungeon failures.
The per-map policy clears a placement error only after success for that same map and keeps a separate dungeon error.
Request guarding remains adapter-owned rather than being duplicated in the surface.
Reload errors retain their own dismiss handler and do not replace the loaded canvas with a loading placeholder.

The filter differences are preserved by pruneSelectionOnFilter and dropSize.
The default selection policy retains the set across filtering while outlines and keyboard targets remain scoped.
The pruning policy removes out-of-filter names on a filter change.
The default drop policy uses singleton sizes and does not reject out-of-filter names, matching the original tile-based canvas.
The other adapter can reject out-of-filter names and use an existing placement before singleton size lookup.
That matches the block-based canvas.
No shared filter rule was silently substituted for either source.

The four carry-forward decisions are as follows.
wrapToasts supplies the tile-based canvas's div.world-canvas__toasts wrapper around conflict, save, and reload toasts.
Without wrapToasts those nodes remain direct viewport children, preserving the other canvas's absent wrapper.
toolbarAfterEncounter permits host groups after EncounterFetchAlert; per-map save and reload error groups also render there before lenses.
draggingMapClass supplies world-canvas__stage--dragging-map only to the host that previously used it.
Filtered jumps still reveal only when unfiltered; the Task 5 jump effect was not changed.

Additional source differences stay adapter facts.
modifiedDoubleClick preserves the block-based canvas's Ctrl/Cmd preview and Map-view-open paths while Edit-here remains guarded.
Its default preserves the other canvas's suppression of modified double-clicks.
unresolvedWarpError preserves an unresolved-preview alert where the source had one, and a silent unresolved preview where it did not.
Shift-double-click bypasses the preview and opens Map view as in both sources.
overlayOrder preserves overlay DOM order: the default is selection, jump, warps, connections, marquee, lens, spotlight.
The block-based adapter can supply warps, connections, lens, spotlight, selection, jump, marquee, preserving its old nodes' order.
Keyed React fragments reorder the existing nodes without adding DOM wrappers or remounting images.

EncounterBorder itself is unchanged to honour this task's file scope.
A viewport-local MutationObserver measures newly rendered encounter tooltips, constrains their width to the viewport,
and translates left/right overflow back inside it. It observes content, not attributes, so its own style writes cannot loop.
This also handles keyboard focus. Resize rebinds the clamp with the current viewport width.
The border still receives rects projected through worldView; this adjustment only clamps its measured screen box.
The marquee is already a canvas-local screen rectangle from useWorldDrag, not an independently projected world overlay.

## Step 1 test mapping

Selection, Ctrl/Cmd toggling, marquee replacement, Escape, and hover map to
"selects one map, toggles Ctrl/Cmd, replaces by marquee, clears Escape and reports hover".
Trailing click/double-click suppression maps to "suppresses trailing click and double-click after pan or map movement".
Three posts and one reload after the final outcome map to
"posts three group members and reloads once only after the last deferred outcome".
Early rejection, successful-name callback, and failed-map GET reconciliation map to
"waits after an early rejected member, reports successes once and reconciles the failed map on GET".
Version ownership maps to "an older POST and its reload never roll back a newer drag of the same map".
Cancelled placement and later reload map to
"cancels a captured map drag without POST and accepts the server on a later reload".
Capture release outside and uncaptured leave map to
"holds a captured drag outside, commits once on release, and retains the uncaptured leave fallback".
Returned drags and lost capture map to
"returning a map drag to its start settles without POST; unexpected capture loss cancels once".
Rail drop and version-before-move map to
"rail drop begins before movement, posts once, then reloads and reports the saved map".
Marker click suppression, nine-pixel miss, and popup map to
"marker clicks within eight screen pixels select nothing; nine pixels selects the map and double-click previews".
Half-unit offsets and projected markers/lines after view changes map to
"projects half-unit warp coordinates and resolved connection endpoints through the same view after pan/zoom".
Overlay ordering maps to "keeps overlay DOM order as an adapter fact".
Failure alert, bounded rerenders without retry, and one retry after pan map to
"warp fetch rejection alerts, never loops on alert renders, and retries exactly once after a pan".
Malformed wrong-map payload maps to
"an adapter rejects malformed warp map identity and the surface shows its alert".
Offscreen filter scope and exact cache-dependent endpoints map to
"fetches offscreen filter members for lines and draws the exact adapter-resolved endpoint".
On-demand LOD scope maps to
"does not fetch markers below LOD and fetches visible maps when zoom reaches the threshold".
Edit-here precedence and fallback map to
"double-click edits here when supplied, otherwise opens Map view; Shift always opens Map view".
Keyboard Enter, aliases for plus/minus, scoped targets, Escape, and menu centre map to
"Enter opens a single in-scope map, keys zoom about centre, Escape clears and menu keys use its rect centre".
Pointer context menu and the client snap point map to
"right-click opens the menu at the pointer and gives Edit-here its client snap point".
Delayed same-map re-jump and reveal map to
"re-jump restarts the full two-second highlight and reveals a hidden map only outside a filter".
Filtered reveal exclusion maps to
"a filtered jump does not permanently reveal the hidden placement after the filter clears".
Context rail and context zoom stepping, including pending context, map to
"hides the rail only in context and steps context zoom; pending context never falls into continuous zoom".
Dungeon POST/reload/callback/generation ordering maps to
"dungeon toggle posts optimistically, reloads, calls layout changed and ignores older outcomes".
Dungeon failure policies map to both cases of "dungeon failure uses the %s error policy and reloads".
Additional double-click differences map to
"adapter facts preserve modified double-click and unresolved warp preview behaviour".
Dismissible errors, toast wrapper, and cursor class map to
"keeps dismissible save errors across success, stacks toasts, and applies the dragging cursor only through its slot".
Per-map success clearing and post-alert toolbar ordering map to
"per-map success clears only its own error and toolbar errors follow the encounter alert".
Filter selection and guarded drop map to "keeps filter selection and drop guards as adapter facts".
Unguarded singleton drop maps to "the singleton-size drop policy permits a rail map outside the current filter".
Left and right encounter clamps map to the two cases of
"clamps the encounter sprite tooltip at the %s edge of the viewport" (hover on the left, keyboard focus on the right).

All reload counts use a vi.fn spy called only by the fake world hook's reload, never network GET counts.
The fake hook performs real ledger snapshot/reconciliation checks and tests drive each POST's deferred outcome explicitly.
Numeric geometry expectations are literals derived in adjacent comments, never supplied by production math.

## Mutation matrix for conductor execution

P12-3: reload per POST should fail the three-member settlement test.
P12-3: allow a rejected member to escape the individual catch and reload on first rejection should fail the early-rejection test.
P12-4o: remove marker click suppression should fail the marker click test.
P12-4c: remove no-handler double-click fallback should fail the double-click precedence test.
P12-4d: omit warpError on rejected fetch should fail the rejected-fetch and malformed-map tests.
P12-4s: retain failed cache entries should fail the pan retry assertion.
P12-4s: add adapter identity or an unmemoised visible list to request-effect dependencies should fail the bounded-rerender assertion.
P12-4r: restrict line fetching to visible placements should fail the offscreen-filter endpoint test.
P12-4n: ignore Enter should fail the keyboard test.
P12-4p: key highlight state by map name rather than token should fail the delayed re-jump expiry test.
P12-4q: remove reveal insertion should fail the hidden-jump image-request assertion.
P12-7: always show rail should fail the context rail test.
P12-7: remove tooltip clamp should fail both edge cases.
These are proposed negative controls, not executed mutation results.

## Static inspection and remaining verification

No vitest, npm, vite, typecheck, UI build, full gate, live app check, or mutation run was executed, per the implementer brief.
There is no claimed passing test count. Runtime correctness and all project completion gates remain for the conductor.
The new test file contains 30 test declarations, with two parameterised declarations expanding to two cases each (32 cases in total).
Existing-test git diff --stat -- packages/ui/test is empty because the only test change is a new untracked file.
The final status lists only the two authorised source modifications, the new interaction test, and this report.
Static git diff --check found no whitespace errors after CRLF normalisation. Source and test lines are at most 140 characters.
All four touched files use CRLF and UTF-8 without a BOM.
No new non-comment gba/gbc/family matches were introduced in canvas.

Removed comment lines are the two Task 6 placeholder comments and the WorldStatus hover placeholder.
The former conflict-tooltip placeholder is replaced by a comment over the badge records explaining both tooltip and menu use.
The handler marker is replaced by the settlement/ledger rationale immediately over commit.
The hover placeholder is replaced by the typed hover contract comment.
Existing fit, jump, culling, raster, encounter, and projection rationale comments were retained in place.
Ported rationale is placed above settlement, save-failure reporting, generation-guarded reload, source sorting,
exact endpoint projection, dirty-session selection, Shift preview bypass, pending-context zoom, rail version begin,
reload-dismiss DOM, and toast stacking. Long source postmortems that remain in useWorldDrag were not duplicated around wrappers.

Task 5 WorldSurface.test.tsx was neither edited nor executed. It still requires conductor verification unchanged.
The two source canvases were read only. Their migration, actual endpoint validation tests, and real popup integration remain Tasks 7 and 8.


## Fix round 1

Classification remains High: this repair requires independent numeric-fixture derivation and event-boundary reasoning.
I re-read the delegate and systematic-debugging skills and continued as the existing dispatched Codex implementer.
The patch is tiny (one test file, fewer than 20 executable changed lines); an extra implementer brief would cost
more than the edit. This section records the inline-edit reason in the task ledger/report.
Only WorldSurfaceInteraction.test.tsx and this report changed during this round. Production files were left as received.
The conductor's supplied evidence is clean typecheck and 223/226 canvas tests passing, with these three failures.

### 1. Rail drop begins before movement

Verdict: the test event construction is wrong; production geometry and expected literal (25,15) are correct.
The drop helper passed clientX/clientY in fireEvent.drop's init. Testing Library's events.js selects
window.DragEvent || window.Event; in this jsdom environment the Event constructor ignores these coordinate fields.
Testing Library explicitly installs dataTransfer, so the name survives while coordinates do not. WorldSurface.onDrop
reads e.clientX/e.clientY, subtracts the bounding rect, and passes the result through screenToWorld. Undefined
coordinates cause NaN before sizing or rounding. singletonSizes does contain Unplaced: component 4 has only that
map and bounds width=10,height=10. No missing-size fallback or production numeric guard is the repair here.
The shared drop helper now dispatches a bubbling, cancelable Event with clientX, clientY and dataTransfer explicitly
defined, following the existing GbcWorldCanvas test pattern. It retains the coordinates through React's drag event.
Hand derivation: the multi-map cluster spans (10,10)-(50,30), size 40x20, in a 200x100 viewport.
Zoom=min(200/40,100/20)=5, pan=(-50,-50). At client(100,50), jsdom's rect origin is (0,0), so
world=((100+50)/5,(50+50)/5)=(30,20). Subtract half of the 10x10 singleton size: (25,15), already integers.
The existing adjacent expectation comment records this derivation; neither expected literal changed.

### 2. Offscreen filter connection endpoint

Verdict: the test fixture and its hand-derived fit assumption are wrong; production projection is correct.
Originally Far.component=2 resolves to a real component, so fitFilter includes A, B AND Far as anchored members.
Their union is (10,10)-(1010,1010), size 1000x1000. Zoom=min(200/1000,100/1000)=0.1
(within the native16 range 16/2048..16). Centered pan=(-10*.1+(200-1000*.1)/2,
-10*.1+(100-1000*.1)/2)=(49,-1). A's exact world warp is (10+2,10+3)=(12,13),
projecting to (50.2,0.3); Far's exact world warp is (1000+4,1000+5)=(1004,1005), projecting to
(149.4,99.5). The reported 0.30000000000000004 is binary floating point. Far is visible under that fit,
so replacing the literals with those outputs would abandon the intended offscreen-fetch regression.
Instead this test alone copies the placements Map and assigns Far the existing shelved component index 99
(outside the six real components). The shared fixture and its other tests remain unchanged. This models a shelved
filter member excluded from an anchored fit but still required for connection resolution.
Independent corrected derivation: A/B union (10,10)-(30,20), size 20x10, zoom=min(200/20,100/10)=10,
centered pan=(-100,-100). A+(2,3)=(12,13) projects to (20,30). Far+(4,5)=(1004,1005)
projects to (9940,9950). Far's whole map rect starts at (9900,9900), outside 200x100.
The adjacent comments now explain the full fit derivation. The endpoint literals remain (20,30,9940,9950).
A new assertion checks that no Far tile image was requested, alongside the existing assertion that its warp data
was fetched. This makes the offscreen premise observable rather than merely implied by the test name.

### 3. Singleton-size drop outside the filter

Verdict: the same test event helper is wrong; production geometry and expected literal (20,10) are correct.
The B-only filter anchors bounds (20,10)-(30,20), size 10x10. Zoom=min(200/10,100/10)=10.
Centered pan=(-20*10+(200-10*10)/2,-10*10+(100-10*10)/2)=(-150,-100).
Client(100,50) becomes world((100+150)/10,(50+100)/10)=(25,15).
Unplaced still has singleton size 10x10 outside the filter; subtract (5,5) and round to (20,10).
The helper repair above fixes the missing event coordinates for this case too. Its adjacent derivation and
expected literal are unchanged. The adapter-owned drop guard test also uses the repaired helper.

### Verification and limits

No vitest, npm, vite, typecheck, UI build, live app, mutation, or full gate was run, as explicitly instructed.
The regression evidence remains the conductor's supplied three failures; rerunning the 226 canvas tests should
produce 226 passes if these repairs are correct, including finite drop posts and offscreen warp fetching.
Runtime verification is pending conductor execution; no passing-test or completion-gate claim is made.
Static whitespace, line-length, CRLF/BOM and scope inspection results are recorded below after inspection.
No commit was made. No expected numeric literal was changed, and no production code was changed this round.
Static results: git diff --check exited 0. A separate byte/line inspection of both round-edited files passed:
CRLF only, UTF-8 without BOM, no trailing whitespace, and every line at most 140 characters.
Scope inspection shows the same four Task 6 paths as the incoming status; this round edited only the test and report.


## Fix round 2

Classification remains High: concurrent render publication, late requests and placement-version ownership are involved.
I read both task-6-spec-review.md and task-6-quality-review.md and continued this existing implementer fix round.
The delegate and receiving-code-review skills were read. No replacement implementer or additional review was dispatched.
The user supplied the exact fixes and retained conductor ownership of runtime checks; no new design decision was needed.
This round changes WorldSurface.tsx, useWorldDrag.ts, WorldSurfaceInteraction.test.tsx and these notes only.
worldSurfaceAdapter.ts retains its incoming Task 6 changes; no adapter API change is required by this round.

### 1. Retained selection defines group membership

Removed the inScope guard from the placement lookup supplied to useWorldDrag. The gesture still hits only drawn,
in-scope maps, while a group collects positions for all retained selected names. No family branch was introduced.
The surface already implements adapter.pruneSelectionOnFilter: on filter changes it removes names outside the filter.
That preserves the relevant GBC policy: GbcWorldCanvas.tsx:508-511 clears its single selected map only when excluded,
rather than unconditionally clearing every selection. The shared policy likewise leaves no out-of-filter selected name.
The default fake adapter retains selection, matching GBA; real wrapper wiring remains Tasks 7 and 8.

Regression: "moves every retained selected map when a filter leaves only the grabbed group member visible".
Select A and B, filter to B, then Shift-drag B. Both optimistic positions and both POST payloads are asserted,
followed by no early reload and exactly one reload and saved callback after both deferred successes.
Hand derivation: B bounds (20,10)-(30,20) give zoom10 and pan(-150,-100). B centre is screen(100,50).
Dragging to (120,60) adds native delta(2,1): A(12,11), B(22,11). Hidden A has no selection outline.
Mutation target: restore the inScope guard (or discard retained names at group start); A's move and POST assertions fail.

### 2. Marquee ARIA parity

Removed aria-hidden from the marquee div only. The existing selection/marquee interaction test now asserts that
its live marquee has no aria-hidden attribute. Other overlay attributes remain unchanged.
Mutation target: restore aria-hidden="true" on the marquee; the attribute-presence assertion fails.

### 3. Publish cancellation only at commit

useWorldDrag now assigns cancelRef.current in a dependency-free useLayoutEffect. The existing passive unmount
cleanup still invokes that ref, so it observes the latest committed options rather than an abandoned render.
Regression: "unmount cancels with committed drag options after a later render suspends".
It begins an optimistic drag, starts a transition with a different move callback, and suspends below WorldSurface
in the toolbar. The attempted-render spy confirms that render reached the descendant; the fallback stays hidden.
Unmount must settle the begun ledger version without invoking the uncommitted move callback or posting.
Hand derivation: the fixture zoom5 turns a 10px horizontal move into 2 native units, A(10,10)->(12,10).
Mutation targets: restore the render-time ref assignment (uncommitted move is called), or remove unmount cleanup
(the version remains pending). Existing useWorldDrag.test.tsx is untouched and was not run.

### 4a. Warp lifecycle and StrictMode

Added parameterised resolution/rejection-after-unmount cases. Each waits for exactly one A request, unmounts,
then explicitly settles its deferred promise. Neither path may invoke a state setter, render an alert, or log errors/warnings.
A test-local React useState wrapper records setter invocations only while the late promise is being settled.
It preserves setter stability with useCallback and remains inactive during ordinary renders and cleanup.
This is necessary because React silently ignores state updates after unmount; DOM/console assertions alone miss them.

Regression: "StrictMode fetches warps once per map and discards the previous mount's pending result".
Both mounts use reactStrictMode:true. Enabling Warps requests A once; adapter-only rerenders do not duplicate it.
After remount, the old response cannot write state or display a marker; only the new deferred response populates
one marker and its B popup. Exactly two fetches across two mounts, no alert and no console error are asserted.
Hand derivation: A-only bounds10x10 give zoom10, pan(-50,-100). A+(5,5)=(15,15) projects to (100,50).
The stale warp offset(1,1) would instead project to (60,10) and identify popup Stale.
Mutation targets: remove warp request cleanup or result/rejection identity guards; late setter assertions detect
publication. Remove placeholder deduplication or add adapter identity as a retry trigger; fetch-count checks detect duplicates.
The existing request lifecycle code needed no production change for these added cases.

### 4b. Older rejected placement POST

Regression: "an older rejected POST and its reload preserve the newer pending drag of the same map".
Two drags of A create two pending versions. Reject the older POST, land its reload while the newer POST is pending,
and assert A remains at (14,10) with its newer version still pending. Then settle the newer success and assert
one successful-name callback and two gesture reloads in total.
Hand derivation: zoom5 makes each 10px gesture add 2 units: A(10,10)->(12,10)->(14,10).
Mutation target: reject/resolve the latest ledger version instead of the version captured by the older POST;
the older reload can then restore the stale server coordinate, violating position and pending-version assertions.

### 4c. Every group member fails

Regression: "waits for every failed group member and reloads once without reporting any saved names".
Reject A and B first: no reload or saved callback. Reject C last: exactly one reload, no onPlacementsSaved call.
Land that reload and check all failed optimistic positions reconcile to the unchanged server coordinates:
A(10,10), B(20,10), C(30,20), the fixture's literal starting positions before the (2,1) drag delta.
Mutation targets: reload per settlement, reload on the first failed member, or call onPlacementsSaved with an empty
list; the early/final reload counts and no-callback assertions catch these changes.

### Verification and limits

No vitest, npm, tsc, vite, UI build, full gate, live-app check or mutation execution was run, as requested.
All mutation targets above are reasoned predictions, not executed outcomes. Runtime verification remains with the conductor.
No commit was made. WorldSurface.test.tsx and useWorldDrag.test.tsx remain unchanged.

Static checks: git diff --check exited 0; both protected existing test files have an empty git diff.
All four round-edited files are UTF-8 without BOM, use CRLF only, and have no trailing whitespace.
New/changed lines are at most 140 characters. useWorldDrag's pre-existing DragState declarations at lines 40-41
are 148/173 characters in HEAD as well; they were left unchanged because only the cancellation fix is in scope there.
