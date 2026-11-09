# Plan 14.1 Task 6 implementer report

Status: implementation and test migrations written; conductor verification and reviews pending. No git commands, commits, Vitest, build, live browser, or mutation runs were performed, per the task's sandbox instructions.

## Tier and routing

High: shared canvas input and placement ownership across map visits, tools, Save/Discard and stacked workspaces. Used the delegate, ponytail, executing-plans, TDD and verification-before-completion instructions. This is the conductor's already-dispatched Codex implementation task; no further agents or offload calls were started. No additional Anthropic usage. Tests were authored before the implementation; the conductor must establish red/green because Vitest execution is explicitly reserved to it. No new product rulings or scope changes.

## Implementation

- Shared AddEventBar: exact four accessible names/tooltips, four distinct new SVGs, pressed state, native disabled controls with reason titles, one compact row.
- Shared useEventPlacement (in the same allowed module): placing and pick { kind, x, y, anchor }; render-time retirement on map/tool/active changes; same-button toggle; Escape; explicit clear used by toolbar Save/Discard in both families. A layout-effect Escape listener precedes World context's passive capture listener. The bar ref keeps an underlying workspace from consuming Escape owned by a warp popup. Other modal dialogs retain Escape ownership.
- MapSurface: one generalized Sign/placement branch; bounds, event-cell size, origin and anchor use existing adapter geometry/cell helpers. Placement wins over every tool. Crosshair and hint appear even in chromeless World editing; placement mouse gestures do not initiate paint requests.
- Both workspace canvas-prop types intersect the shared EventPlacementProps. Existing MapCanvas/GbcMapCanvas wrappers already forward their rest props to MapSurface, including World consumers; no out-of-scope wrapper edits were needed.
- GBC capacity comes entirely from live session.events.objects.length and session.events.sceneScripts.length. No new fetch or options cache was introduced. The fixed GBC cap is 15 as specified. Project-derived GBA capacity and general request-in-flight/read-only reasons belong to the all-condition wiring required in Task 8, not the two capacity cases required in Task 6.
- Removed the GBA inspector's old empty-state Add Event button, its onAdd prop and handler, and useMapEditing.onAddEvent. Existing low-level addEvent session methods and Duplicate paths remain unchanged.
- pick is retained in the shared placement hook for Task 8's dialog; no create dialog or create request is part of Task 6.

## Files changed

Sources (all allowed Task 6 files):
- packages/ui/src/shared/AddEventBar.tsx (new)
- packages/ui/src/components/toolIcons.tsx
- packages/ui/src/canvas/MapSurface.tsx
- packages/ui/src/components/MapEditingWorkspace.tsx
- packages/ui/src/gbc/GbcMapEditing.tsx
- packages/ui/src/components/EventInspector.tsx
- packages/ui/src/hooks/useMapEditing.ts
- packages/ui/src/styles.css

New tests:
- packages/ui/test/shared/AddEventBar.test.tsx: 6 authored cases
- packages/ui/test/canvas/placement.test.tsx: 22 authored cases

Existing UI test migrations:
- packages/ui/test/App.test.tsx
- packages/ui/test/AppContextEdit.test.tsx
- packages/ui/test/AppEditingWiring.test.tsx
- packages/ui/test/AppVisitGuard.test.tsx
- packages/ui/test/AppWorldContextMenu.test.tsx
- packages/ui/test/EventInspector.test.tsx
- packages/ui/test/MapEditingWorkspace.test.tsx
- packages/ui/test/MapEditingWorkspaceActive.test.tsx
- packages/ui/test/PokemonIndicatorDialog.test.tsx
- packages/ui/test/shell/switchPrompt.test.tsx
- packages/ui/test/shell/warpPopup.test.tsx

This report is the only additional documentation file. Existing source/test newline styles are preserved (CRLF); new TSX files and this report use LF. No BOM is added.

## Complete old assertion/action migration ledger

Paths below are relative to packages/ui/test. Left-hand lines refer to the input version; right-hand lines refer to this implementation. No test was deleted. The original behavior assertions remain except the explicitly replaced retired-control assertions below.

| Original pin / action | Replacement | Coverage preserved |
|---|---|---|
| EventInspector.test.tsx:28, old Add Event presence | EventInspector.test.tsx:28 and :29; shared/AddEventBar.test.tsx:14 | Empty state present; old control absent; four replacement controls have exact names, tooltips and icons. Original no-X assertion remains. |
| EventInspector.test.tsx:102, onAdd called once | EventInspector.test.tsx:95 | Existing Duplicate called once. |
| EventInspector.test.tsx:103, Add disabled during request | EventInspector.test.tsx:96 | Duplicate disabled during request. |
| EventInspector.test.tsx:107, second Add click does not call again | EventInspector.test.tsx:100 | Second Duplicate click does not call again. |
| EventInspector.test.tsx:110, Add reenabled after response | EventInspector.test.tsx:103 | Duplicate reenabled after response. |
| AppEditingWiring.test.tsx:70, Add readiness | AppEditingWiring.test.tsx:71, Pencil readiness | Loaded editing workspace. |
| AppEditingWiring.test.tsx:75, old addEventAndWaitDirty helper | AppEditingWiring.test.tsx:75, moveEventAndWaitDirty | Select an existing object, edit/blur X, await dirty indicator and Delete. Save-vs-Indicator dialogs, cancelled-switch selection/stamp preservation, and delete-clears-selection assertions remain. Fixture has a real existing object; move route replaces add route. |
| AppVisitGuard.test.tsx:34, Add readiness | AppVisitGuard.test.tsx:35, Pencil readiness | Loaded workspace. |
| AppVisitGuard.test.tsx:47, deferred add success | AppVisitGuard.test.tsx:49, existing-object drag/move | A-B-A success cannot restore selection, Delete or X/Y fields. |
| AppVisitGuard.test.tsx:59, deferred add failure | AppVisitGuard.test.tsx:63, existing-object drag/move | A-B-A failure cannot show old error. |
| AppVisitGuard.test.tsx:68, failed add before switch | AppVisitGuard.test.tsx:74, existing-object drag/move | Current-visit failure is visible, then retires on switch. |
| App.test.tsx:956, failed Add before successful discard | App.test.tsx:957, readiness then drag at :960 | Existing event move fails; Collision stroke dirties; successful Discard clears stale event error. All original assertions retained. |
| AppWorldContextMenu.test.tsx:112 and :113, Add readiness/click | AppWorldContextMenu.test.tsx:112 and :118, Collision readiness/stroke | Dirty cancelled switch keeps World mode and selection. |
| AppContextEdit.test.tsx:214 and :215, dirtyRoute1 Add readiness/click | AppContextEdit.test.tsx:214 and :221, Collision readiness/stroke | All dirty context Escape/Save/Done flows remain. Projection explicitly derives a real map cell from this fixture's 10x10 World placement and 2x2 map. |
| AppContextEdit.test.tsx:301 and :302, PalletTown Add readiness/click | AppContextEdit.test.tsx:309 and :315, Collision readiness/stroke | Dirty double-click plus cancelled switch never mounts a context overlay. |
| shell/switchPrompt.test.tsx:90, GBA dirty helper via Add | shell/switchPrompt.test.tsx:91, existing Pencil/palette/stroke path for both families | All dirty-switch Save/Discard/Cancel, refusal, failure and ordering assertions remain. |
| shell/warpPopup.test.tsx:194, popup GBA dirty via Add | shell/warpPopup.test.tsx:194, existing paint(popup()) helper | Popup Save/Discard/Close and ordering pins remain. |
| shell/warpPopup.test.tsx:237, context GBA dirty via Add | shell/warpPopup.test.tsx:236, existing h.paint helper | Dirty context prompt and focus behavior. |
| shell/warpPopup.test.tsx:277, context GBA dirty via Add | shell/warpPopup.test.tsx:275, existing h.paint(host) | Dirty open cancellation retains source without popup. |
| shell/warpPopup.test.tsx:369, self-warp dirty via Add | shell/warpPopup.test.tsx:367, existing h.paint helper | Dirty self-warp skips prompt and ends context. |
| MapEditingWorkspace.test.tsx:81, exact canvas prop keys | MapEditingWorkspace.test.tsx:80 | Exact key assertion retained and extended with placing/onEventPick, without dropping any existing key. |

API-only fixture cleanups (no assertions removed): MapEditingWorkspace.test.tsx:48 removes onAddEvent stub; MapEditingWorkspaceActive.test.tsx:25 removes onAddEvent stub; PokemonIndicatorDialog.test.tsx:189 removes obsolete EventInspector.onAdd prop; all EventInspector.test.tsx fixtures remove onAdd props. Their existing behavior assertions are unchanged. Indicator-at lookups for newly selected existing objects are explicitly mocked in the migrated App/visit fixtures.

Audit command: rg -n -e 'onAddEvent' -e 'onAdd=' -e 'Add Event' packages/ui/test. Final matches: only EventInspector.test.tsx:26, the description asserting that the old button is absent. Also inspected every addEvent match: remaining occurrences are low-level session API tests, Duplicate tests, session stubs, capability flags, addEventListener spies or the new addEvent/types import. They do not consume the retired button/callback and were not weakened or removed.

## Verification evidence and limits

- npm run typecheck through PowerShell's npm.ps1 initially failed before execution: PSSecurityException / scripts disabled (not EPERM).
- npm.cmd run typecheck succeeds: tsc --noEmit -p tsconfig.base.json and tsc --noEmit -p packages/ui/tsconfig.json, exit 0. Repeated after migrations and at final verification.
- Focused Vitest: not run, per explicit sandbox instruction. 28 newly authored cases, not a passing-count claim.
- Full UI suite and full repo gate: not run; pass/fail/file counts unavailable.
- UI build: not run in this sandbox; conductor must run npm run build -w packages/ui.
- Live UI, mutations, independent spec/quality reviews: pending conductor. No claim of completion or merge readiness.
- No git commands or commits attempted. Requested final commit message for conductor: feat(plan-14.1): add-event bar and placement mode.

Conductor mutations: remove event-origin subtraction in the pick path -> geometry/anchor tests must fail; let placement fall through into paint -> strict fetch test must fail. Extra ownership witnesses pin World Escape priority and active-popup cancellation.

Required conductor runs: focused two new files; all packages/ui tests; full gate (pass/fail/files); typecheck; UI build; live UI check; mutations; separate High-tier spec and quality reviews. Preserve this report until those reviews pass, then move into _archive per AGENTS.md.
