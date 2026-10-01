import type { BorderSide } from "./borderSide.js";

/**
 * The map views' `Fit` (Plan 6c B4), pure: the largest zoom level at which the
 * image plus one encounter band on `side` fits the viewport, with that content
 * centred. `pw`/`ph` are the image's native px, `bandNative` the band's native
 * px (0 = encounters off, the plain fit). The image itself is then pushed
 * `bandNative * zoom` right (left band) or down (top band), so the band's room
 * sits on the side the border draws on. No level fits: the first (smallest).
 */
export function fitWithBand<Z extends number>(a: {
  pw: number;
  ph: number;
  vw: number;
  vh: number;
  levels: readonly Z[];
  bandNative: number;
  side: BorderSide;
}): { zoom: Z; pan: { x: number; y: number } } {
  const { pw, ph, vw, vh, levels, bandNative, side } = a;
  const extraW = side === "left" || side === "right" ? bandNative : 0;
  const extraH = side === "top" || side === "bottom" ? bandNative : 0;
  let zoom = levels[0]!;
  for (const level of levels) {
    if ((pw + extraW) * level <= vw && (ph + extraH) * level <= vh) zoom = level;
  }
  return {
    zoom,
    pan: {
      x: Math.round((vw - (pw + extraW) * zoom) / 2) + (side === "left" ? bandNative * zoom : 0),
      y: Math.round((vh - (ph + extraH) * zoom) / 2) + (side === "top" ? bandNative * zoom : 0),
    },
  };
}
