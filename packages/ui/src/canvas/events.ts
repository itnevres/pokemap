/** An ordered `[kind, list]` tuple per event kind; the adapter supplies its family's lists, in scan order. */
export type EventLists<Kind extends string> = readonly (readonly [Kind, readonly { x: number; y: number }[]])[];

/** The FIRST event (of any kind) on cell (x,y), scanning the lists in the given order. This is NOT "whichever
 *  paints on top": the overlay drawers blend marks in the same order, so the last list is visually topmost, the
 *  opposite end of this scan. Adapters pass object first because object events (NPCs, the usual click target)
 *  are the kind most worth selecting on an overlap -- an arbitrary-but-documented choice, not a derived one.
 *  Whole-cell hit test: the overlays tint the entire cell a marker sits on, so "under the cursor" means "same cell". */
export function firstEventAt<Kind extends string>(lists: EventLists<Kind>, cell: { x: number; y: number }): { kind: Kind; index: number } | null {
  for (const [kind, list] of lists) {
    const index = list.findIndex((e) => e.x === cell.x && e.y === cell.y);
    if (index !== -1) return { kind, index };
  }
  return null;
}

/** One event's current x/y by {kind,index} (the static selection ring's position); null when absent. */
export function eventAt<Kind extends string>(lists: EventLists<Kind>, ref: { kind: Kind; index: number } | null | undefined): { x: number; y: number } | null {
  if (!ref) return null;
  const e = lists.find(([kind]) => kind === ref.kind)?.[1][ref.index];
  return e ? { x: e.x, y: e.y } : null;
}
