import { useMemo, useRef } from "react";
import type { Dungeon } from "../hooks/useDungeons.js";

/**
 * The open dungeon's map filter for the world canvas.
 * - cache off (GBA, App.tsx:136-149): re-minted whenever the dungeon object changes, so a pure rename refits the
 *   canvas (intended: "opened/switched/edited").
 * - cache on (GBC, GbcApp.tsx:133-143): the same id and sorted members keep the Set identity, so a rename keeps pan.
 */
export function useDungeonFilter(openDungeon: Dungeon | null, cache: boolean): Set<string> | null {
  const filterCache = useRef<{ id: string; members: string[]; filter: Set<string> } | null>(null);
  return useMemo(() => {
    if (!openDungeon) { filterCache.current = null; return null; }
    if (!cache) return new Set(openDungeon.maps);
    const members = [...openDungeon.maps].sort();
    const cached = filterCache.current;
    if (cached?.id === openDungeon.id && cached.members.length === members.length
      && members.every((name, index) => name === cached.members[index])) return cached.filter;
    const filter = new Set(openDungeon.maps);
    filterCache.current = { id: openDungeon.id, members, filter };
    return filter;
  }, [openDungeon, cache]);
}
