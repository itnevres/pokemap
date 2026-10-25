import { useEffect, useRef, type MutableRefObject } from "react";

/** Drops just the rendered tiles whose caller-owned version changed. */
export function useTileVersionRefetch<T>(tileVersions: Record<string, number> | undefined, imageCacheRef: MutableRefObject<Map<string, T>>) {
  const seenTileVersionsRef = useRef<Record<string, number>>({});
  useEffect(() => {
    for (const [map, n] of Object.entries(tileVersions ?? {})) {
      if (seenTileVersionsRef.current[map] === n) continue;
      seenTileVersionsRef.current[map] = n;
      imageCacheRef.current.delete(map);
    }
  }, [tileVersions, imageCacheRef]);
}
