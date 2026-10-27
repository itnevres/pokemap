# Task 3 brief: `packages/ui/src/canvas/useWorldTiles.ts`

Create ONE file: `packages/ui/src/canvas/useWorldTiles.ts`. Touch no other file. Do not edit the test.

Oracle (read it, it is the spec): `packages/ui/test/canvas/useWorldTiles.test.tsx`. Make every test pass.

## API (exact)

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { buildSmallTile } from "../shared/worldTiles.js";
import { LOD_SCALE } from "./worldView.js";

export interface WorldTile { img: HTMLImageElement; small: HTMLCanvasElement }

export interface UseWorldTilesOptions<P extends { map: string }> {
  /** Placements to load, already culled to the viewport by the caller. */
  visible: readonly P[];
  /** Adapter URL for a placement at a tile version (undefined = never bumped). */
  imageUrl: (p: P, version: number | undefined) => string;
  /** Native size of a placement (tiles or blocks), for the small LOD tile. */
  sizeOf: (p: P) => { width: number; height: number };
  /** Native px per tile/block (16 GBA, 32 GBC). */
  nativePx: number;
  /** A change drops every entry (GBC: time of day; GBA: constant). */
  cacheKey: string | number;
  tileVersions?: Record<string, number>;
}

export function useWorldTiles<P extends { map: string }>(o: UseWorldTilesOptions<P>): {
  tileFor: (map: string) => WorldTile | undefined; // stable identity across renders
  version: number; // bumps once per landed image and once per cacheKey change
}
```

## Behaviour

- Entries live in a `useRef<Map<string, Entry>>`, `Entry = { url: string; img?: HTMLImageElement; small?: HTMLCanvasElement }` (url = the URL currently requested; img/small = the last image that landed).
- One `useEffect` (deps: visible, cacheKey, tileVersions, imageUrl, sizeOf, nativePx):
  - If `cacheKey` differs from the key the map was built for (a ref; first run just records it): replace the map with a NEW empty `Map` and `setVersion(v => v + 1)`.
  - For each visible `p`: `url = imageUrl(p, tileVersions?.[p.map])`. If an entry exists with the same `url`, skip. Otherwise create the entry if missing, or set `entry.url = url` on the existing one (keep its `img`/`small`: P12-7, the old image keeps drawing). Then `const img = new Image();` set `img.onload` and `img.onerror` as PROPERTIES (existing tests' fake images call `onload`), then `img.src = url`.
  - `onload`: land only if `mapRef.current.get(p.map) === entry && entry.url === url` (a superseded URL or an old cacheKey's map is ignored). Then `entry.img = img; entry.small = buildSmallTile(img, size.width, size.height, nativePx, LOD_SCALE); setVersion(v => v + 1)` where `size = sizeOf(p)`.
  - `onerror`: do nothing (previous image stays, or the map stays empty; no retry because the url is unchanged).
- `tileFor = useCallback((map) => { const e = mapRef.current.get(map); return e?.img && e.small ? { img: e.img, small: e.small } : undefined }, [])`. It must return the SAME object for the same landed image (the test checks `toBe` between lookups): cache the `WorldTile` object on the entry when it lands (e.g. `entry.tile = { img, small }`) and return that.
- Comments: a short JSDoc on the hook stating the P12-7 retention rule, the superseded-URL rule and the cacheKey rule. Match the repo's terse comment style.

## Verify

From the repo root `C:\Programming Projects\PokeMap` (vitest must run from there):

```
npx vitest run packages/ui/test/canvas/useWorldTiles.test.tsx
```

Pass = all tests pass, 0 fail. Then `npm run typecheck` passes. Do not commit.
