// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { transform } from "lightningcss";

// A `*/` inside a comment (e.g. "world-canvas__spotlight-*/...") closes it
// early. Browsers then silently drop the next rule as an invalid selector --
// that swallowed `.species-spotlight { position: relative }`, so its dropdown
// anchored to the page and rendered off-screen -- and `vite build`'s
// lightningcss minify refuses the file outright. Parse strictly, as the build does.
describe("styles.css", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url));

  it("parses with no error recovery", () => {
    expect(() => transform({ filename: "styles.css", code: css, errorRecovery: false })).not.toThrow();
  });

  it("keeps the spotlight's positioning rule, which its absolute dropdown anchors to", () => {
    const out = transform({ filename: "styles.css", code: css, errorRecovery: true }).code.toString();
    expect(out).toMatch(/\.species-spotlight\s*\{[^}]*position:\s*relative/);
  });

  // Plan 6c C1: the lens legend is an in-flow row below the toolbar, never the
  // old absolutely-positioned popover that covered the Encounters toggle.
  it("keeps the lens legend an in-flow row: no position on it, and no .lens-panel__legend popover rule", () => {
    const out = transform({ filename: "styles.css", code: css, errorRecovery: true }).code.toString();
    const row = /\.world-canvas__legend-row\s*\{([^}]*)\}/.exec(out);
    expect(row).not.toBeNull();
    expect(row![1]).not.toMatch(/position\s*:/);
    expect(out).not.toMatch(/\.lens-panel__legend\s*\{/);
  });
});
