/**
 * Map types hidden from the world view by default (spec §3.1) -- mostly
 * small interiors that read as noise at world scale. Population counts
 * measured against the subject decomp (dungeon-mode-and-warp-tools spec
 * §2): MAP_TYPE_INDOOR 695, MAP_TYPE_NONE 6, out of 1,209 total.
 */
export const HIDDEN_MAP_TYPES: ReadonlySet<string> = new Set(["MAP_TYPE_INDOOR", "MAP_TYPE_NONE"]);

/**
 * A map draws by default if its type isn't hidden, OR the user has ever
 * manually placed it (dragging it in is the deliberate override -- spec
 * §3.1's last paragraph: "A map the user has ever manually dragged in...
 * always shows, regardless of type"). Pure and tiny so both WorldCanvas
 * (drives what actually draws) and the sidebar's grey-out (drives what
 * LOOKS drawable) can share one definition instead of two copies drifting
 * apart.
 */
export function isDrawnByDefault(mapType: string, manual: boolean): boolean {
  return manual || !HIDDEN_MAP_TYPES.has(mapType);
}
