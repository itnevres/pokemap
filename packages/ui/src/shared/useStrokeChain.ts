import { useCallback, useLayoutEffect, useMemo, useRef } from "react";

export interface StrokeSession<Body> {
  beginStroke(): Promise<void>;
  applyPaint(body: Body): Promise<unknown>;
  endStroke(): Promise<void>;
}

export interface StrokeChain<Body> {
  /** mousedown: ends any still-open stroke first (F3/M4), then begin, then `first` (if any) as one awaited link. */
  start(session: StrokeSession<Body>, first: Body | null): void;
  /** held move: queued behind every earlier link; dropped if the visit retired or begin failed. */
  queue(body: Body): void;
  /** mouseup/mouseleave: `last` (rect/shift final apply, or null), then end, after every queued link. */
  finish(last: Body | null): void;
  isOpen(): boolean;
  /** Resolves when every link issued so far has settled. */
  settled(): Promise<void>;
}

export type SettledChain = Pick<StrokeChain<unknown>, "settled">;

export function useStrokeChainRegistry(): { onStrokeChain(chain: SettledChain, mounted: boolean): void; strokeSettled(): Promise<void> } {
  const chains = useRef(new Set<SettledChain>());
  const onStrokeChain = useCallback((chain: SettledChain, mounted: boolean) => {
    if (mounted) chains.current.add(chain); else chains.current.delete(chain);
  }, []);
  const strokeSettled = useCallback(() => Promise.all([...chains.current].map((chain) => chain.settled())).then(() => {}), []);
  return { onStrokeChain, strokeSettled };
}

interface Stroke<Body> {
  visit: object;
  begun: boolean;
  session: StrokeSession<Body>;
}

/**
 * One completion chain for begin, every apply and end, so no request in a stroke outruns its predecessor (B1,
 * moved out of GbcMapCanvas). `visitKey` = the map name: a change or unmount retires the visit, so queued work
 * drops and a begun stroke still ends on its captured session; errors of a retired visit are not reported.
 */
export function useStrokeChain<Body>(visitKey: string, onError: (message: string) => void): StrokeChain<Body> {
  const tailRef = useRef<Promise<void>>(Promise.resolve());
  const visitRef = useRef<object>({});
  const strokeRef = useRef<Stroke<Body> | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useLayoutEffect(() => {
    visitRef.current = {};
    return () => {
      visitRef.current = {};
      const stroke = strokeRef.current;
      strokeRef.current = null;
      if (stroke) {
        tailRef.current = tailRef.current.then(async () => {
          if (stroke.begun) await stroke.session.endStroke();
        }).catch(() => {}); // The retired visit cannot display a late error.
      }
    };
  }, [visitKey]);

  return useMemo<StrokeChain<Body>>(() => {
    const owns = (stroke: Stroke<Body>) => stroke.visit === visitRef.current;
    const report = (stroke: Stroke<Body>, e: unknown) => {
      if (!owns(stroke)) return;
      try { onErrorRef.current(e instanceof Error ? e.message : "Paint failed."); } catch { /* a throwing handler must not skip the end (M3) */ }
    };
    /** Append a link. The terminal catch keeps a throwing onError from rejecting (poisoning) the chain (M3). */
    const append = (stroke: Stroke<Body>, link: () => Promise<unknown> | void) => {
      tailRef.current = tailRef.current
        .then(link)
        .catch((e) => report(stroke, e))
        .catch(() => {})
        .then(() => {});
    };
    const finish = (last: Body | null) => {
      const stroke = strokeRef.current;
      if (!stroke) return;
      strokeRef.current = null;
      append(stroke, async () => {
        if (!owns(stroke) && !stroke.begun) return;
        if (last !== null && owns(stroke) && stroke.begun) {
          await stroke.session.applyPaint(last).catch((e) => report(stroke, e)); // a rejected apply must not leave the stroke open
        }
        // A retired visit stops queued paint but still finishes an issued stroke on its captured session.
        await stroke.session.endStroke();
      });
    };
    return {
      start(session, first) {
        finish(null); // lost mouseup: the old stroke ends before the new begin
        const stroke: Stroke<Body> = { visit: visitRef.current, begun: false, session };
        strokeRef.current = stroke;
        append(stroke, async () => {
          if (!owns(stroke)) return;
          await session.beginStroke();
          stroke.begun = true;
          if (!owns(stroke) || first === null) return;
          await session.applyPaint(first);
        });
      },
      queue(body) {
        const stroke = strokeRef.current;
        if (!stroke) return;
        append(stroke, () => {
          if (owns(stroke) && stroke.begun) return stroke.session.applyPaint(body);
        });
      },
      finish,
      isOpen: () => strokeRef.current !== null,
      settled: () => tailRef.current.then(() => {}),
    };
  }, []);
}
