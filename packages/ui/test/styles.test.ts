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

  // Plan 6c E1 (follow-up D2): a long hover string must not widen the canvas column and scroll the page, so the
  // shared `.map-canvas` (GBA and GBC) declares `min-width: 0` and its hover ellipsises (staying right-aligned).
  // The 44px two-row strip is GBC-only; GBA keeps the 28px single row.
  const ruleBody = (selector: string) => {
    const out = transform({ filename: "styles.css", code: css, errorRecovery: true }).code.toString();
    const esc = selector.replace(/\./g, String.raw`\.`);
    const m = new RegExp(String.raw`(^|\})\s*${esc}\s*\{([^}]*)\}`).exec(out);
    expect(m, selector).not.toBeNull();
    return m![2]!;
  };

  it("declares min-width: 0 on .map-canvas", () => {
    expect(ruleBody(".map-canvas")).toMatch(/min-width\s*:\s*0(px)?\s*(;|$)/);
  });

  it("keeps the shared hover right-aligned and ellipsising, with no margin-left: 0 or max-width on it", () => {
    const body = ruleBody(".map-canvas__hover");
    expect(body).toMatch(/text-overflow\s*:\s*ellipsis/);
    expect(body).toMatch(/margin-left\s*:\s*auto/);
    expect(body).not.toMatch(/max-width/);
  });

  it("makes only the GBC status strip a fixed 44px two-row strip", () => {
    expect(ruleBody(".gbc-map-canvas .map-canvas__status")).toMatch(/height\s*:\s*44px/);
    expect(ruleBody(".map-canvas__status")).toMatch(/height\s*:\s*28px/);
  });

  // Plan 6c E3 fix round: the menu is absolutely positioned and measured at its previous (stale) left, so without
  // an intrinsic width a wider menu would shrink-to-fit the space left of that position and stay wrapped.
  it("sizes the world context menu to its content, capped to the viewport, with a readable hint", () => {
    const body = ruleBody(".world-context-menu");
    expect(body).toMatch(/width\s*:\s*max-content/);
    expect(body).toMatch(/max-width\s*:\s*calc\(/);
    expect(ruleBody(".world-context-menu__hint")).toMatch(/color\s*:\s*var\(--text-secondary\)/);
  });
});
