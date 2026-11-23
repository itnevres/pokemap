# Task A (A1 GBA, A2 GBC): render cache bypass keyed on dirtiness

Tier Medium: a wrong answer fails a test automatically (cache-hit spy plus pixel compares).

## Change
- `packages/server/src/index.ts` render route: live render only when the session `isDirty` or a paint stroke is open (`strokeStartBlocks !== null`); a clean open session (GET /plan, undone to clean) uses `pngCache`.
- `packages/server/src/gbcEditRoutes.ts` `openBlocks`: same condition (GBC twin). The GBC pre-warm (`gbcRoutes.ts`) uses `openBlocks`, so it now also warms a clean session's map (harmless; it caches disk state). GBA pre-warm untouched.
- Deviation from the plan snippet: `isDirty` alone broke the existing live-render test, because a stroke's command is pushed only at /paint/end, so mid-stroke `isDirty` is false. An open stroke is therefore also live.
- Tests: `api.test.ts` (cache-hit spy on `project.layoutById`: clean session = baseline, dirty bypasses, undo returns to cache; plus a staged-block-edit-only session: isDirty true and pixels differ from disk); `gbcRoutes.test.ts` (same three cases, spy on `proj.map`). A staged-only block edit pushes an undo command, so it is dirty.

## Verify (through the lock)
typecheck clean; vitest api + gbcRoutes + gbcEditRoutes: 3 files, 196 tests passed. (An earlier run had one 5 s timeout on the unrelated /api/defects test while the box was loaded; it passed on rerun.)

## Mutations (old bypass restored; wrapper restores in finally)
- A1 `if (liveEntry)`: A1 cache test fails ("open but clean session must keep hitting the cache").
- A2 `openBlocks` returns blocks for any session: A2 cache test fails, same message.
