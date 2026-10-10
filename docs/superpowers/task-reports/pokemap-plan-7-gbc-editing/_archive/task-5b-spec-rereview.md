# Task 5b high-risk spec rereview — frozen 0d5ba4c

**Verdict: PASS (static scoped rereview). Open findings: 0 blocker, 0 important, 0 minor. I1–I4 and M1 are addressed in source and committed test design. Runtime acceptance, final mutation outcomes and live verification remain coordinator-owned.**

## Scope and evidence boundary

Reviewed the frozen `4db3723..0d5ba4c` production/test delta against the completed spec review preserved in `4db3723`, plus the combined fix spec at `0d5ba4c`. All implementation and test reads used `git show` or the equivalent frozen two-commit Git diff. Working source was not used as evidence; the implementer may be mutating it concurrently.

Independently read the three changed production files and affected test bodies, including the complete persistent editing host, isolated selection witness, deferred-operation matrix, App paint/event/keyboard/error witnesses, and the relevant unchanged conversion, canvas, fetch and freshness seams. This is a targeted rereview of the single fix round, not a new broad Task 5b audit or adoption of the implementer's narrative.

No tests, mutations, browser operations, servers, commits, subagents or corpus writes were performed. The sole write is this requested report. No reviewer test slot was acquired, and this reviewer has no mutation to restore. This report does not certify the concurrently changing working tree's cleanliness. The running reviewer is GPT-6 Codex; no claim of an independently selected Opus tier is made.

All source line references below identify `0d5ba4c`.

## Prior findings adjudication

### I1 — Context keyboard zoom and Fit all: addressed

`packages/ui/src/gbc/GbcWorldCanvas.tsx:1197–1204` handles all four zoom aliases before the continuous World path. While context exists it prevents default, advances or retreats through `ZOOM_LEVELS` using `setContextZoom`, clamps the index, and returns even when the payload/snap is pending. Consequently pending input cannot change scale by 1.2, and ready input produces the editing levels 1/2/4. The existing ordinary World path remains below this branch. Fit all is disabled by `inContext` at `:1263`, covering both pending and ready context.

The new App test enters through the keyboard context menu, waits for the actual overlay stage, verifies focus remains on the World canvas, and checks `+`→200%, `_`→100%, a wheel notch→200%, `=`→400%, and `-`→200%. A separate held-payload test checks unchanged scale for all four keys and disabled Fit all. This directly repairs the original P1 route rather than testing only the previous 4× clamp case. The unchanged canvas wheel listener derives its next level from the current zoom; it now receives valid stepped values through this route. Static assessment: sufficient regression intent; runtime pass not claimed.

### I2 — Hidden context payload error: addressed

`packages/ui/src/gbc/GbcApp.tsx:320–323` renders a pending status or guarded fetch error alert whenever context exists without a matching ready payload. These are sibling JSX slots before the existing `GbcMapEditing` element, not a conditional replacement of that element. The keyed World host and `key="world"` canvas remain stable. The failed payload leaves the context exit callback available and never creates an editing canvas from invalid data.

The App parameterized test independently injects rejection, HTTP 503 and malformed shape. It asserts the corresponding alert, the same World canvas and editing body, no overlay stage, Done or Escape recovery, disappearance of the error after exit, and successful context entry on another map. The existing `useGbcMap`/`useGuardedFetch` code still checks HTTP status and shape, catches failure, resets state on URL changes and cancels obsolete fetch responses; no second parsing pipeline was added. This resolves original P2. The test does not promise a same-map retry mechanism, which was not required.

### I3 — Revived picks and late local continuations: addressed

`packages/ui/src/gbc/GbcMapEditing.tsx:64–86` creates a visit object in state. A changed `mapName` schedules a new object and clears stamp/event/error/warnings during render; React retries that component before rendering children. The tool state is separate and retained. Returning A→B→A therefore creates a third visit identity even though its name again equals A. Name-tagged hidden state is now retired rather than preserved for resurrection.

The layout effect commits the visit identity to a ref and nulls it on cleanup. Deferred closures compare their captured object with that committed ref. Unlike a name comparison, an old A closure cannot match the later A visit. Render-time adjustment does not publish a speculative visit into the ref. After a committed switch, old success and rejection callbacks fail this identity check; unmount also retires them. This fixes the original local state boundary without claiming to cancel the underlying session request or changing session ownership.

Independently traced every local asynchronous continuation: move uses guarded `ok`/`fail`; delete checks the visit before clearing selection or assigning warnings; duplicate checks before selecting its appended event; discard, undo and redo use guarded success/failure handlers. Captured canvas `onEditError` now routes through guarded `fail`. Stamp/event setters and dismiss handlers also guard their issuing visit. An old delete cannot replace B's pick, an old duplicate cannot select an A event in B, and old success cannot clear B's newer error. ABA returns are equally excluded. Same-visit operation ordering and transport races are not newly certified by this local fix.

The new host tests keep the same component mounted with `rerender`, verify reset and tool/slot preservation, explicitly retire warp warnings, and hold six operation types across both A→B and A→B→A for success and rejection (24 combinations). Each later visit chooses a stamp/event and installs a current error before releasing the old operation; assertions preserve those current values and reject stale warnings. Captured canvas error callbacks have separate B/ABA cases. The real App test also exercises different-map tree visits and checks the same World canvas/body plus a retired stamp on return. The host tests deliberately stub the session to isolate local continuation safety; they do not prove server or hook response ownership. Static acceptance for original P3 and its independently traced local race: satisfied.

### I4 — App paint/event regression blind spots: addressed

The App fixture now agrees across World placement, map metadata, layout and block array: 10×10 with 100 blocks. Its edit mock starts clean, keeps begin clean and marks dirty only on apply. The old already-dirty negative offscreen paint test is removed and replaced by a clean positive visible witness. `overlayStage()` at `packages/ui/test/gbc/GbcAppContext.test.tsx:105–109` waits for the actual canvas before querying it and fixes its rect; palette readiness is no longer used as a substitute for snap readiness. This repairs the null-stage race that invalidated the previous stronger mutation evidence.

The paint test holds begin, releases it only after asserting that apply/end have not run and dirty is absent, then requires exactly begin/apply/end in order, the exact target/origin/stamp body, and the dirty transition. The event test injects a warp at step (9,7), drags through the real App overlay and requires `/event/move` with `{kind:"warp",index:0,x:10,y:8}`. It therefore exercises `GbcApp:259–260` prop forwarding, not just standalone canvas logic.

Independent arithmetic: placement p=(10,0), size=(10,10), pointer=(150,100), native block width 32 and z=1 imply world pan q=(-330,-60). The body starts at (-10,-60); a one-block border gives composite pan m=(-42,-92). Client (134,52) is native body offset (144,112), so paint target is (floor(144/32),floor(112/32))=(4,3), while event step is (144/16,112/16)=(9,7). Client (150,68) gives offset (160,128), hence step (10,8). These points are inside the 200×200 viewport and layout. The former 16px X paint mutant would target (9,3), so the exact apply assertion distinguishes it. Dropping `onMoveEvent` would prevent the event request assertion from succeeding. These are source-derived expectations, not executed mutation outcomes.

### M1 — Selected/context fallback coverage: addressed

`packages/ui/test/gbc/GbcAppContextSelection.test.tsx:8–32` mocks only the World-facing component/hook seam to enter A through `onEditHere` and select B through `onSelectMap`. It does not invoke a tree or mode exit handler. In frozen App source, `selectMapFromWorld` changes selection without clearing context itself (`:169–170`); the effect at `:220–222` supplies the fallback. The test waits for context to become `none` and checks selected B and World mode. Removing that effect would leave context A in this isolated witness. Its comments correctly distinguish callback invariant coverage from a real pointer interaction through the covering overlay. This resolves the requested missing witness without inventing a reachable production defect.

## Preserved math and lifecycle acceptance

The delta does not change shared `contextView.ts`, `GbcMapCanvas.tsx`, the edit session hook, DESIGN or GBA source/tests. Shared default native width remains 16. GBC entry and both conversions still explicitly supply `BLOCK_PX=32` (`GbcWorldCanvas:969–1009`), and the composite origin still comes from the derived ring constant. For W=32z and origin o=32, m=pW+q−oz; a block b draws at m+(o+32b)z=(p+b)W+q, while step s draws at m+(o+16s)z=(p+s/2)W+q. The inverse q=m+oz−p32z remains unchanged. The retained alignment witness and new exact request bodies cover complementary border and unit seams.

The fix preserves the World host, editing body and keyed canvas lifetime. Retiring local state uses state adjustment rather than a map-dependent key or host remount. Additional error/status siblings do not move the existing JSX child slot. Capture-phase Escape registration/removal remain `true` with modal/menu/text-field exclusions. Dirty exit still opens SaveDialog and keeps context; Cancel closes only the dialog. The combined round does not alter those acceptance paths.

Per-map `tileVersions` invalidation still deletes only a changed map cache entry, retains the version in subsequent render URLs, and leaves late image callbacks attached to their detached entry objects. No freshness code or server route changed in this round. The earlier static derivation remains applicable; actual PNG freshness and live box alignment remain coordinator checks.

## Mutant ledger and final verification limits

| ID | Prior executed evidence | Frozen fix assessment; no new run |
|---|---|---|
| X1–X8 | All killed in original reviewer run | Relevant seams retained; no fresh kill claim |
| R1-selection | Survived original committed App suite | New isolated callback test should distinguish removal of fallback |
| R2-event-props | Survived original committed App suite; stronger probe inconclusive on readiness | New stage-waited real App event request/body witness should distinguish missing callback |
| R3-paint-units | Survived original committed App suite; stronger probe reached intended failure but lacked restored green | New stage-waited positive exact-body paint witness should distinguish 16px X divisor |

Historical survivors remain recorded; static test inspection cannot convert them into executed kills. Coordinator/implementer must reconcile exact IDs, unique literal anchors, nonempty baseline/red/restored results and byte restoration from their authorized serial run. No runtime totals, typecheck/build outcome, final survivor list or working-tree restoration status are asserted here. Source inspection found no remaining scoped blocker/important/minor finding in `0d5ba4c`; final acceptance awaits the coordinator's gate and live checks.
