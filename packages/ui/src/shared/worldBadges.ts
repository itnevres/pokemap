export const BADGE_SIZE = 10;

export function conflictBadgeCenter(placement: { x: number; y: number }, size: { width: number; height: number }, zoom: number, pan: { x: number; y: number }, offset: number) {
  return {
    cx: placement.x * zoom + pan.x + size.width * zoom - BADGE_SIZE - offset,
    cy: placement.y * zoom + pan.y + BADGE_SIZE,
  };
}
