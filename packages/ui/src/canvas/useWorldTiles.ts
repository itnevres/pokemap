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

/**
 * P12-7: a tile-version bump keeps the old image drawing until the new image loads, then swaps.
 * Superseded-URL rule: onload lands only if the entry is still current for its map and its URL matches.
 * CacheKey rule: a cacheKey change drops every entry at once and ignores late loads from the old key.
 */
export function useWorldTiles<P extends { map: string }>(o: UseWorldTilesOptions<P>): {
  tileFor: (map: string) => WorldTile | undefined;
  version: number;
} {
  const { visible, imageUrl, sizeOf, nativePx, cacheKey, tileVersions } = o;

  const mapRef = useRef<Map<string, Entry>>(new Map());
  const cacheKeyRef = useRef(cacheKey);
  const [version, setVersion] = useState(0);
  // A load that lands after unmount does no work. Set in an effect, so StrictMode's replay re-arms it.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (cacheKey !== cacheKeyRef.current) {
      mapRef.current = new Map();
      cacheKeyRef.current = cacheKey;
      setVersion(v => v + 1);
    }

    for (const p of visible) {
      const url = imageUrl(p, tileVersions?.[p.map]);
      let entry = mapRef.current.get(p.map);

      if (entry && entry.url === url) continue;

      if (!entry) {
        entry = { url };
        mapRef.current.set(p.map, entry);
      } else {
        entry.url = url;
      }

      const img = new Image();
      img.onload = () => {
        if (mounted.current && mapRef.current.get(p.map) === entry && entry.url === url) {
          const size = sizeOf(p);
          entry.tile = { img, small: buildSmallTile(img, size.width, size.height, nativePx, LOD_SCALE) };
          setVersion(v => v + 1);
        }
      };
      // No onerror: a failed load lands nothing, so the previous image stays (or the map stays empty),
      // and its unchanged URL is not retried.
      img.src = url;
    }
  }, [visible, cacheKey, tileVersions, imageUrl, sizeOf, nativePx]);

  const tileFor = useCallback((map: string) => mapRef.current.get(map)?.tile, []);

  return { tileFor, version };
}

/** `url` is the URL last requested; `tile` is the last image that landed (kept while a newer URL loads). */
interface Entry {
  url: string;
  tile?: WorldTile;
}
