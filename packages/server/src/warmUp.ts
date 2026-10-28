export interface WarmResult { rendered: number; skipped: number; failed: number; ms: number }

/** Runs warmOne(name) for each name, one per macrotask: a setImmediate yield BEFORE each map, so a client request queued
 *  meanwhile is answered after at most one map's render. warmOne is synchronous (render + cache insert in one step: see
 *  P12-4w -- a cache clear on save can then never be refilled from a render taken before the clear). Stops as soon as
 *  stopped() is true. A throwing map counts as failed and the loop goes on. Never rejects. */
export function warmEach(names: Iterable<string>, warmOne: (name: string) => "rendered" | "skipped",
  stopped: () => boolean): Promise<WarmResult> {
  return new Promise((resolve) => {
    const start = performance.now();
    let rendered = 0;
    let skipped = 0;
    let failed = 0;

    const iterator = names[Symbol.iterator]();
    function step(): void {
      const { value, done } = iterator.next();
      if (done) {
        resolve({ rendered, skipped, failed, ms: performance.now() - start });
        return;
      }
      const name = value;
      // Yield before each map so a queued client request can run after at most one render.
      setImmediate(() => {
        if (stopped()) {
          resolve({ rendered, skipped, failed, ms: performance.now() - start });
          return;
        }
        try {
          const result = warmOne(name);
          if (result === "rendered") rendered++;
          else skipped++;
        } catch (e) {
          failed++;
          console.warn(`pokemap warm: ${name}: ${e instanceof Error ? e.message : String(e)}`);
        }
        step();
      });
    }
    step();
  });
}
