import { useMemo, useRef } from "react";
import type { Dungeon } from "../hooks/useDungeons.js";

/**
 * The open dungeon's map filter for the world canvas.
 * The same id and sorted members keep the Set identity (both families), so a pure rename keeps the canvas pan.
 */
export function useDungeonFilter(openDungeon: Dungeon | null): Set<string> | null {
  const filterCache = useRef<{ id: string; members: string[]; filter: Set<string> } | null>(null);
  return useMemo(() => {
    if (!openDungeon) { filterCache.current = null; return null; }
    const members = [...openDungeon.maps].sort();
    const cached = filterCache.current;
    if (cached?.id === openDungeon.id && cached.members.length === members.length
      && members.every((name, index) => name === cached.members[index])) return cached.filter;
    const filter = new Set(openDungeon.maps);
    filterCache.current = { id: openDungeon.id, members, filter };
    return filter;
  }, [openDungeon]);
}
