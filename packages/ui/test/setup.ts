import { afterEach } from "vitest";

// @testing-library/react's own auto-cleanup only fires when it finds a
// *global* `afterEach` (see its dist/index.js: `typeof afterEach ===
// 'function'`). This project runs vitest with `globals: false`, so that
// global is never installed and the library's built-in cleanup never
// engages — DOM nodes from one test in a file leak into the next, and
// `getByText` starts matching stale elements from a previous render.
// Importing `afterEach` from "vitest" directly (not relying on the global)
// and wiring it here restores per-test isolation.
//
// Guarded on `document` so this file is harmless when picked up by a
// node-environment test run elsewhere in the workspace.
if (typeof document !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => {
    cleanup();
  });
}
