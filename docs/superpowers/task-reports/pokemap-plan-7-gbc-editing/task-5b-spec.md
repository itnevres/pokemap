# Task 5b executed spec: GBC in-context editing on the World view (port of 6c E4)

This task was added by user decision U1 (2026-10-06). Risk class: **high**: view-coordinate math, remount and focus hazards, live freshness. Reviews: Opus spec review (runs the app) and a Sonnet quality review. Load the `frontend-design:frontend-design` skill first when available; `packages/ui/DESIGN.md` is binding.

It depends on Task 5's **final** code (`GbcMapCanvas` editing props, `useGbcEditSession`, `GbcMapEditing`, `GbcApp` wiring). Read it before starting.

## Required reading (GBA's E4 is the template; port it, don't reinvent it)

- `docs/superpowers/task-reports/pokemap-plan-6c-hub-encounters-world/_archive/task-E4-{spec,coordinator,spec-review,quality-review}.md`: the executed spec, the live findings (`pngCache` invalidation, refetch only the one tile with `?v=n`, the snap timing via `getBoundingClientRect`, the Escape capture phase, never remounting the canvas), and the review lessons.
- `packages/ui/src/world/contextView.ts` (the view math, with `NATIVE = 16` px per GBA tile).
- `packages/ui/src/components/WorldCanvas.tsx`: the `context` prop, `onEditHere`, `tileVersions`; the in-context section around lines 1436-1530 and the overlay JSX around 2149-2175.
- `packages/ui/src/App.tsx`: `contextMap`, `tileVersions`, enter/exit with the dirty guard, SaveDialog in context, "a mode switch leaves context without a prompt".
- `packages/ui/src/gbc/GbcWorldCanvas.tsx`: `editItem` (disabled, "GBC editing arrives with Plan 7", line ~487); zoom is **px per block**, `BLOCK_PX = 32`, `GBC_MAX_ZOOM = 32`.
- RESUME's 6c Phase E lessons (Escape capture phase; never remount a heavy canvas to add chrome; snap with client coordinates and convert at snap time).

## Design (binding)

1. **`contextView.ts`: parameterise the native scale.** Each function gains an optional `native` argument defaulting to 16, so GBA is byte-identical. `contextView.test.ts` (or the existing tests) stays unchanged. Add GBC cases with `native: 32`, including the exact inverse property `mapViewFromWorld ∘ worldViewFromMapView = id`.
2. **`GbcMapCanvas` gains `view?`/`onViewChange?` (controlled) and `chromeless?`.**
   - Mirror GBA `MapCanvas`'s E1/E4 props exactly: controlled view when given, no Fit/toggles/legend/status chrome when chromeless.
   - Its border ring (`BORDER_RINGS = 1` block = 32 px) gives the composite origin `originX = originY = 32 * BORDER_RINGS` px. Derive it from that constant, not a literal.
3. **`GbcWorldCanvas` gains `onEditHere?`, `context?: GbcWorldCanvasContext` and `tileVersions?`**, ported from `WorldCanvas`:
   - the overlay `world-canvas__context` filling the viewport box, with the dim layer and the context bar (map name, 1×/2×/4× zoom, Done);
   - the snap on entry;
   - Escape in the capture phase;
   - a double-click outside the map exits;
   - a plain double-click on a map body enters (Shift+double-click keeps "Open in Map view");
   - in context, the world's zoom cap rises to `32 * 4` (as GBA's does above `MAX_ZOOM`).
   - **Never remount the world canvas** when chrome appears. Capture the DOM node before and after in a test, and count the `/api/world` calls.
   - `editItem` becomes enabled: `{ label: "Edit here", onSelect: … }`, with the "arrives with Plan 7" hint removed.
4. **The `tileVersions` refetch of one tile:** after a commit while in context, bump that map's version. `GbcWorldCanvas` requests that one map's render with `&v=n`. The server side already clears `renderCache` on commit (Task 4).
5. **`GbcApp`:**
   - the `contextMap` state (always equals `selected` while set);
   - enter through the same dirty guard as a tree click;
   - exit: a dirty session opens `SaveDialog`, and Cancel keeps editing; a clean one just leaves;
   - a mode switch leaves context without a prompt (the session persists);
   - a tree click leaves context;
   - the chromeless canvas is `GbcMapCanvas` with the same edit props `GbcMapEditing` builds. Reuse Task 5's builder rather than duplicating prop assembly; if Task 5 didn't factor one, extract the smallest shared function;
   - the editing chrome (Toolbar, metatile strip, inspector) wraps the world canvas the way `MapEditingWorkspace`'s `active={false}`/`renderCanvas` seam does for GBA. Follow GBA's structure, adapted to `GbcMapEditing`.
6. **Known GBA deferrals stay deferred:** the toolbar crowding at 1024 px, the Grid/Collision toggles unreachable in context, a blank tile until its image loads. Note them; don't fix them here.

## Tests (TDD)

1. `contextView` GBC cases: snap zoom from a world zoom of 32/64/128 → 1/2/4; enter centres the placement on the pointer; exact inverse round trip on several placements/pans.
2. `GbcMapCanvas` controlled view: `onViewChange` fires on wheel/pan; a `view` prop drives drawing with no internal fit; chromeless hides the chrome. The read-only default is unchanged (existing tests untouched).
3. `GbcWorldCanvas`:
   - "Edit here" is enabled and calls `onEditHere(map)`;
   - double-click enters; Shift+double-click opens Map view;
   - with `context`, the overlay renders inside the viewport box and the same canvas DOM node is kept (identity before and after), and `/api/world` isn't refetched;
   - Escape exits only when no modal or menu is open (capture phase; mimic React's flush with a document listener that removes the modal, as E3/E4 did);
   - a double-click outside exits;
   - `tileVersions` bumps one tile's URL only.
4. `GbcApp`:
   - enter through the dirty guard;
   - exit with a dirty session opens SaveDialog, and Cancel stays in context;
   - commit in context bumps that map's tile version and `markClean`;
   - a mode switch leaves context without a prompt;
   - a tree click leaves context.
5. Every GBA test is unchanged: `git diff <base> -- packages/ui/test/ | grep -c '^-[^-]'` = 0, outside any named reason.

## Teeth-proof

| ID | Mutation | Must go red |
|---|---|---|
| X1 | `native` default changed to 32 (breaks GBA) | GBA contextView tests |
| X2 | GBC passes `native` 16 | 1 |
| X3 | world canvas remounts on context entry | 3 (identity) |
| X4 | Escape listener in the bubble phase | 3 |
| X5 | exit with a dirty session leaves without SaveDialog | 4 |
| X6 | `tileVersions` bumps every tile | 3 |
| X7 | origin uses a literal `0` instead of the border ring | 1/3 (the map is misaligned under the world) |
| X8 | "Edit here" still disabled | 3 |

## Live verification (the coordinator, after review)

On scratch servers 5184/5183 (`preload.mjs`/`vite.mjs` from `C:\Users\Serve\AppData\Local\Temp\pokemap-phase-d-coordinator\`), using the Playwright MCP's `browser_run_code_unsafe` (check `document.visibilityState` first):
- double-click NewBarkTown in the GBC World view;
- the map overlays in place and aligned (pixel-check the ring);
- paint one block, save, and confirm the world tile refreshes;
- reverse-paint, save; `cmp` against the byte snapshots shows identical;
- PerfPlus ends clean, with no `.pokemap`.

## Rules

Same as Task 5.
