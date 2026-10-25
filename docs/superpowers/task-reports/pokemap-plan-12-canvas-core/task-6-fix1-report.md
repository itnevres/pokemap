# Plan 12a Task 6 fix round 1 report
A. Dangling MapCanvas refs: canvas/MapSurface.tsx (:18, :183), gbc/mapSurface.tsx (3 refs), gbc/GbcWorldCanvas.tsx (:92) repointed by name or stated inline. Comment-only.
B. MapSurface.tsx comment merges (rect/shift sentence, selection, preview, mouseup capture; history line deleted; "No ring when nothing is selected or dragged."). useRasterComposite.ts overlay-blending comments folded into one.
C. Mark leak: gba/mapSurface.tsx marks ref now { name: map.name, list }, used by hoverAt only when name matches the current map. New test "event marks never leak across a map switch before the new map composites" (real MapCanvas, events on for Foo, hover shows "object:", switch to Bar, Events on before Bar loads, hover has no "object:").
   Test before fix (name check removed): FAIL at the not.toContain("object:") assertion. After fix: PASS.
D1. New canvas/events.ts: EventLists, firstEventAt, eventAt (no family branch). gba and gbc mapSurface build ordered object/warp/coord/bg tuples; scan order unchanged.
D2. Stale gba wording cut (findEventAt doc moved to events.ts, Task 14 history, behaviour essay -> one live/static note; hoverAt keeps the 0=MB_NORMAL note).
D3. METATILE_PX declared before compositeOrigin and used there.
D4. useGbaMapSurface param is Pick<MapCanvasProps, "data" | "editSession" | "activeTool">.
D5. P12-4b test renamed (dropped "and resets at stroke end").
D6. Blank line after imports; double blank lines removed (gba/mapSurface.tsx, gbc/mapSurface.tsx, test).
Skipped: Minor 7 (as instructed). No existing test edited; only GbaMapSurface.test.tsx changed.
Verify (worktree root):
- vitest gba+gbc+canvas+MapCanvas+MapEditingWorkspace, --maxWorkers=4 --minWorkers=1: 37 files, 717 tests passed.
- tsc -p packages/ui --noEmit: exit 0.
Nothing committed. Files new: packages/ui/src/canvas/events.ts. Temp edit scripts removed.
