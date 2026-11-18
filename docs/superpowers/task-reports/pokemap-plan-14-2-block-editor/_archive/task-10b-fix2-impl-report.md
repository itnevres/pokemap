# Task 10b fix-2 implementation report

High risk (React hook rules, async). The committed tests are the oracle; no test logic was changed and no new dependencies were added. Worktree branch `p14-2-t10b` only. Not committed.

## Rulings

- U7a no hook-calling getter. The `get imageUrl()` accessors are gone; the world adapter now carries a hook member.
  - `packages/ui/src/canvas/worldSurfaceAdapter.ts:126-127` — `imageUrl(p, version)` replaced by `useImageUrl(): (p: P, version: number | undefined) => string`, doc comment: "Hook: called once per render, unconditionally. Returns the URL builder for a placement at a tile version."
  - `packages/ui/src/gba/worldSurface.tsx:207-213` — `useImageUrl: () => { const tv = useTilesetVersion(); return useCallback(...) }, [tv]`. URL template byte-identical to the old getter (`/api/render/<map>.png` + `v=`/`tv=` query).
  - `packages/ui/src/gbc/worldSurface.tsx:314-320` — same shape, `useCallback(..., [tv, time])`, query still starts with `time=${time}`; URL template byte-identical.
  - `packages/ui/src/canvas/WorldSurface.tsx:98` — `const imageUrl = adapter.useImageUrl();` called once per render at top level, beside `adapter.useWorld` (:96) and `adapter.useCoverage()` (:97); passed to `useWorldTiles` as `imageUrl` at :253. No other reader of the member remains (grep below).
  - `packages/ui/test/canvas/WorldSurface.test.tsx:10` (`const fakeImageUrl = ...`), :97; `packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx:10`, :170 — each fake's `imageUrl: <fn>` became `useImageUrl: () => fakeImageUrl` with the function hoisted to a module-level const (stable identity across renders). No other change in those two files.
- U7b discard reads its body best-effort. `packages/ui/src/shared/useEditSessionCore.ts:142-144` — a 2xx whose body is not JSON now runs the local reset: `await r.json().catch(() => null)`; `noteTilesetVersion` is unchanged and still notes only a numeric `tilesetVersion` (it ignores non-numbers), gated by the captured `tilesetGeneration()`.
- U7c docs.
  - `packages/ui/src/shared/tilesetVersion.ts:30` — `resetTilesetVersion` comment now names its production role (the FamilyApp unmount resets it, retiring the generation so late replies from the old project are dropped), keeping test isolation as a secondary use. `tilesetGeneration` gets a one-line doc at :46 (bumped by `resetTilesetVersion`; `noteTilesetVersion` drops replies stamped with an older generation).
  - `packages/ui/src/hooks/useGuardedFetch.ts:66-67`, :74-79, :91-92 — comments no longer name `useGbcMap` as a caller (it inlines its own copy); they now read generically (nullable-URL caller / a caller whose `url` changes per selection). No code change.

## Grep: no other reader of the world-adapter member

`grep -n "get imageUrl|adapter\.imageUrl|\.imageUrl\(" packages/ui` (all of src and test):

```
src/canvas/MapSurface.tsx:114: const imageUrl = adapter.imageUrl(mapName, editSession ? paintVersion : 0);
```

That one hit is the map-surface adapter (`mapSurfaceAdapter.ts:28`, a different interface, out of scope), not the world adapter. `grep "get imageUrl"` has zero matches. All remaining `imageUrl` identifiers belong to the map-surface adapter, `useWorldTiles` options (`args[0].imageUrl` in the WorldCanvasSurface tests is the options-object property, by design), `useRasterComposite`, `useStage`/`MapCanvasViewport` props, or `useWorldTiles.test.tsx` — none read the world adapter's member. World-adapter `useImageUrl` references: `worldSurfaceAdapter.ts:127` (declaration), `gba/worldSurface.tsx:207`, `gbc/worldSurface.tsx:314`, `canvas/WorldSurface.tsx:98`, and the two fake adapters in the edited test files.

## Verify

- `npm run typecheck` was rejected by this environment's permission layer before execution (`Permission denied: shell`) — same as the fix-2 tests hop. Its two constituent invocations were run directly instead, both exit 0 with no diagnostics:
  - `npx tsc --noEmit -p tsconfig.base.json` — pass.
  - `npx tsc --noEmit -p packages/ui/tsconfig.json` — pass (this project includes `test/**/*.ts(x)`, so the edited test files typecheck).
- `npx vitest run packages/ui` was NOT run — vitest is for the conductor (per the brief; never two vitest processes). No test-pass claim is made. The conducting run must confirm green for the fix-2 oracle cases 1–6 and red→green flip for case 7 (U7b).
- No check was loosened; no protected test file was edited (only the two named test files, and only the mechanical `imageUrl` → hoisted `const` + `useImageUrl: () => ...` change).
