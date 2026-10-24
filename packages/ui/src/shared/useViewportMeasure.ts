import { useEffect } from "react";
import type { RefObject } from "react";

/** Measures the world viewport, mirroring MapCanvas's established pattern (Task 21's canvas-blanking postmortem: a
 *  redraw effect that does not depend on `viewport` leaves the canvas stale after any resize). */
export function useViewportMeasure(containerRef: RefObject<HTMLElement | null>, setViewport: (viewport: { w: number; h: number }) => void) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setViewport({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [containerRef, setViewport]);
}
