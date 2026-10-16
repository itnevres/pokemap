import { useState } from "react";

export const FOLLOW_HOVER_KEY = "pokemap.palette.followHover";

/** Plan 9 (R4): whether a metatile palette scrolls to the cell under the canvas cursor. One per-browser preference
 *  for both families; storage can be blocked (private mode, cleared site data), so it falls back to on. */
export function useFollowHover(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem(FOLLOW_HOVER_KEY) !== "off"; } catch { return true; }
  });
  const set = (next: boolean) => {
    setOn(next);
    try { localStorage.setItem(FOLLOW_HOVER_KEY, next ? "on" : "off"); } catch { /* keep the in-memory choice */ }
  };
  return [on, set];
}
