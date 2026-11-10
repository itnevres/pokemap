# Task 6 fix round 1

Status: two requested fixes written; conductor test rerun pending. No git, Vitest, build, or live commands run under the sandbox instruction.

Tier remains High because the regression concerns canvas input mode ownership. Delegate routing: continue the same already-dispatched Codex implementer. Tiny inline repair (one source line plus rationale comment; two expectation lines) is cheaper than another dispatch. Existing red evidence is the conductor's two failing tests; no assertion was weakened and no test deleted.

## 1. Extra request / inert Pencil

Request identified by source trace: GET /api/edit/Route1/indicator/at?index=0.

The migrated App fixture now contains an existing object at (0,0), inherited by Route1. On a map switch, useMapEditing correctly clears currentStamp and preserves activeToolKind='pencil'; its translated activeTool becomes null. MapSurface interprets !activeTool plus onSelectEvent as event-selection mode. The click at (20,20) selects object #0, causing EventInspector's useIndicatorBlock effect to issue the Indicator GET. This is a click-triggered request, not an additional map-switch fetch or paint request. Identification is from the exact fixture, cell geometry, selection branch and Indicator fetch expression; runtime tracing was unavailable in this sandbox.

Fix: MapEditingWorkspace passes onSelectEvent only when activeToolKind is null. A selected tool with no usable stamp cannot fall back to event selection. Normal selection with no chosen tool, configured paint tools, and placement's earlier pick branch retain their existing paths. No fetch or mock was added, and App.test.tsx (including the exact count assertion at line 634) was untouched in this round.

## 2. Rail order

DESIGN.md line 284 establishes collision palette (Collision only), metatile palette, inspector. The Add Event design spec ruling A1 (line 27) explicitly places the four Add buttons above the event inspector in the rail. Therefore the order is:

- Collision: collision-palette, metatile-palette, add-event-bar, event-inspector.
- Other tools: metatile-palette, add-event-bar, event-inspector.

Updated only the two railOrder expectations at MapEditingWorkspace.test.tsx:157 and :159. This explicitly pins the new component's required location while retaining exact ordering assertions and every existing child.

## Changed files

- packages/ui/src/components/MapEditingWorkspace.tsx:94 (mode guard and comment).
- packages/ui/test/MapEditingWorkspace.test.tsx:157 and :159 (two exact rail expectations).
- This fix report; original implementer report preserved.

## Verification

Conductor input before this round: typecheck pass, UI build pass, UI suite 2128 pass / 2 fail out of 2130; supplied focused failure run 45 pass / 2 fail out of 47 across 2 files.

Current-round npm.cmd run typecheck: PASS, exit 0 (both root and UI TypeScript checks). Vitest and UI build not rerun here. Required conductor regression run: npx vitest run packages/ui/test/App.test.tsx packages/ui/test/MapEditingWorkspace.test.tsx, followed by the UI suite/full gate as appropriate. Neither UI pass counts nor a green regression result are claimed for this round.

Both edited existing files retain CRLF and no UTF-8 BOM. No unrelated source changes.
