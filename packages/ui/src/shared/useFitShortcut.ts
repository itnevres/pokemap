import { useEffect, useRef } from "react";
import { shortcutBlocked } from "./shortcutGuard.js";

/**
 * Plan 9 (R5): F fits the current view -- exactly what the calling canvas's own Fit button does. One window keydown
 * listener while `enabled`. Callers pass `enabled` = "my Fit button is shown and enabled", so the chromeless
 * in-context map canvas never listens and each view has at most one listener. Same ignore rules as the toolbar's
 * shortcuts (shortcutBlocked), and F with any modifier is left alone (Ctrl+F stays the browser's find).
 */
export function useFitShortcut(fit: () => void, enabled: boolean): void {
  const latest = useRef(fit);
  latest.current = fit;
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (shortcutBlocked(e) || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.key.toLowerCase() !== "f") return;
      e.preventDefault();
      latest.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
