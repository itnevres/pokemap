# Task 3 report: world tile cache (`canvas/useWorldTiles.ts`) — High

BASE `3c19fdd`. Brief: `task-3-brief.md`.

## Delegation

- Oracle tests written first by the conductor (`test/canvas/useWorldTiles.test.tsx`, 12 tests); before the hook existed the file failed to resolve the import (right reason).
- Implementer: Aider + Nemotron 3 Ultra (free), `--no-git`, one file. 12/12 pass on first try.
- Conductor trim (inline, ≤20 lines, logged): the entry held `img`, `small` and `tile` (duplicates); reduced to `{ url, tile }`; the empty `onerror` handler replaced by a comment stating the error rule. Tests unchanged, 12/12.

## API

```ts
useWorldTiles<P extends { map: string }>({ visible, imageUrl(p, version), sizeOf(p), nativePx, cacheKey, tileVersions })
  -> { tileFor(map): { img, small } | undefined  /* stable identity */, version }
```

- One entry per map `{ url, tile? }`: `url` is the URL last requested, `tile` the last image that landed.
- A visible placement whose `imageUrl(p, tileVersions?.[map])` differs from the entry's `url` (new map, or tile version bump, including one that happened while off screen) starts a load and keeps the old `tile` (P12-7 retention).
- `onload` lands only if the entry is still the map's current entry and its `url` is still the loaded URL; it builds the small LOD tile once (`buildSmallTile(img, w, h, nativePx, LOD_SCALE)`) and bumps `version`.
- No `onerror`: a failed load lands nothing; the URL is unchanged, so no retry (today's behaviour in both canvases: a failed tile stays blank).
- A `cacheKey` change replaces the map with a new empty one (late loads from the old key fail the identity check) and bumps `version` once, so the draw loop drops the old images at once (GBC's time-switch `setCompositeVersion` bump today).
- `version`: +1 per landed image, +1 per `cacheKey` change, nothing else.

Differences from today's per-canvas effects (both to be replaced in Tasks 7-8, not wired yet):
- Today a tile-version bump deletes the entry (`useTileVersionRefetch`), so the map draws blank until the new image loads; now the old image keeps drawing (P12-7, ruled). `shared/useTileVersionRefetch.ts` stays until the canvases move (Task 9 inventory).
- The effect depends on `imageUrl`/`sizeOf`; an inline adapter closure makes it run every render. It is idempotent (URL compare), and a test pins no re-request and no version bump on re-renders.

## Tests (`test/canvas/useWorldTiles.test.tsx`, new, 12)

First load draws nothing until `load`; culling (only listed maps); StrictMode requests once; unrelated re-renders neither request nor bump; P12-7 retention then swap (only the bumped map refetches); version bump while off screen refetches on return, old image kept; superseded URL ignored before and after the current lands; error on refresh keeps the old image, no retry; error on first load stays empty; `cacheKey` change drops every entry at once, bumps once, ignores late old-key loads (an in-flight refresh and a first load); one small tile per decoded image at (w, h, 16, 0.25), never per lookup/render; stable `tileFor`.

`git diff --stat -- packages/ui/test`: one new file; no existing test changed.

## Mutations (each restored after; all red)

| Mutation | Failing test(s) |
|---|---|
| Swap on request (`entry.tile = undefined` when the URL changes) | P12-7 retention; off-screen bump; superseded URL; error on refresh (4) |
| Drop the URL check in `onload` | superseded URL |
| Keep entries across a `cacheKey` change | cacheKey drop |
| Rebuild the small tile per lookup | one small tile per decoded image |

## Removed comment lines

None (new files only).

## Gate (before review fixes)

3,675 pass / 0 fail / 228 files (baseline 3,663 / 227 + this file's 12); typecheck and UI build pass; both subjects' porcelain unchanged.

## Fix round 1 (Codex astra spec FAIL 2 Important; quality Needs rework 2 Important)

Conductor inline (src 7 lines, tests are the conductor's oracle; logged):
- Spec I1 (cacheKey "every entry" unproven): new test, a loaded map off screen during the key change is dropped and refetched with the new key on return.
- Spec I2 (sizeOf/nativePx unpinned): new test, `nativePx: 32` and `sizeOf` → 7x5 different from the placement fields; asserts `buildSmallTile(img, 7, 5, 32, 0.25)`.
- Quality I1 (loads after unmount do work): `mounted` ref set in a `[]` effect, cleared in its cleanup; `onload` lands only while mounted. New unmount test. StrictMode re-arms it (effect replay sets it again); the StrictMode test now also lands its single request.
- Quality I2 (generation ownership untested): new day → nite → day test with the first day request pending and a second request for the same URL; the first instance's load is ignored (no tile, no build, no version bump), the second lands. Helper `images(src)` added for same-URL instances.
- Finding during the fix: `renderHook`'s `wrapper: <StrictMode>` does NOT replay the hook's effects (probe: `run` only); the `reactStrictMode: true` option does (`run, clean, run`). The StrictMode test now uses the option. Other tests that wrap `renderHook` in `<StrictMode>` may test less than they claim (not audited; follow-up note).

Tests: 16 (was 12).

| Mutation | Failing test(s) |
|---|---|
| M5 drop the entry identity check in `onload` | cacheKey drop; key round trip |
| M6 drop the `mounted` guard | late load after unmount |
| M7 hard-code nativePx 16 | sizeOf/nativePx |
| M8 key change deletes only visible maps | off-screen cacheKey drop |
| M9 `mounted` never re-armed after StrictMode cleanup | StrictMode lands |
| M10 drop the same-URL dedupe | 10 tests (requests once, StrictMode, ...) |

## Gate (after fix round 1)

3,679 pass / 0 fail / 228 files; typecheck and UI build pass; both subjects' porcelain unchanged. Re-review (Codex astra): all 4 findings ADDRESSED, no new breakage.

Delegation log: Task 3: Aider nemotron-3-ultra done (12/12 first try); reviews Codex gpt-6-astra (spec, quality, re-review); fix round 1 conductor inline (<=20 src lines, oracle tests are the conductor's).
