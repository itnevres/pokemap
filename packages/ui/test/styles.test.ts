// @vitest-environment node
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { transform } from "lightningcss";

// A `*/` inside a comment (e.g. "world-canvas__spotlight-*/...") closes it
// early. Browsers then silently drop the next rule as an invalid selector --
// that swallowed `.species-spotlight { position: relative }`, so its dropdown
// anchored to the page and rendered off-screen -- and `vite build`'s
// lightningcss minify refuses the file outright. Parse strictly, as the build does.
describe("styles.css", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url));

  // Plan H M1: reduced motion zeroes transitions and animations globally.
  it("zeroes transitions and animations under prefers-reduced-motion: reduce", () => {
    expect(css.toString()).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*transition-duration:\s*0s[^}]*animation-duration:\s*0s/);
  });

  // Plan H M3: fonts are self-hosted. No third-party request at launch, and every
  // @font-face file exists under public/fonts beside its licence.
  it("self-hosts its fonts: no remote @import or url(), font-display: swap, files and licences present", () => {
    const text = css.toString();
    expect(text).not.toMatch(/@import/);
    expect(text).not.toMatch(/https?:\/\//);
    const faces = [...text.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");
    expect(faces.map((f) => /font-family:\s*"([^"]+)"/.exec(f)?.[1] ?? "").sort()).toEqual(["IBM Plex Sans", "JetBrains Mono"]);
    for (const f of faces) {
      expect(f).toMatch(/font-display:\s*swap/);
      const file = /url\("\/fonts\/([^"]+\.woff2)"\)/.exec(f)?.[1] ?? "";
      expect(file).not.toBe("");
      expect(existsSync(new URL(`../public/fonts/${file}`, import.meta.url))).toBe(true);
    }
    expect(existsSync(new URL("../public/fonts/OFL-IBMPlex.txt", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../public/fonts/OFL-JetBrainsMono.txt", import.meta.url))).toBe(true);
  });

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

  it(".toolbar wraps instead of overflowing (Plan 9 Task 12 F1)", () => {
    const body = ruleBody(".toolbar");
    expect(body).toMatch(/flex-wrap\s*:\s*wrap/);
    expect(body).toMatch(/min-width\s*:\s*0(px)?\s*(;|$)/);
  });

  // Plan 9 addendum R-F7 / R-F5: abutting cells, inset marks, a pinned header and a rail wide enough for 256 px.
  it.each([".metatile-palette__cell", ".gbc-metatile-palette__cell"])("%s abuts its neighbours: no border, padding or radius", (sel) => {
    const body = ruleBody(sel);
    expect(body).toMatch(/border\s*:\s*(none|0)/);
    expect(body).toMatch(/padding\s*:\s*0/);
    expect(body).not.toMatch(/border-radius\s*:\s*[1-9]/);
  });
  it("palette columns have no gap between cells", () => {
    expect(ruleBody(".palette__column")).toMatch(/gap\s*:\s*0/);
  });
  it("picked marks are an inset box-shadow; hovered marks an inward dashed outline (Review Focus 4)", () => {
    expect(ruleBody(".metatile-palette__cell.metatile-palette__cell--selected")).toMatch(/box-shadow\s*:\s*inset/);
    expect(ruleBody(".gbc-metatile-palette__cell--picked")).toMatch(/box-shadow\s*:\s*inset/);
    for (const sel of [".metatile-palette__cell--hovered", ".gbc-metatile-palette__cell--selected"]) {
      const body = ruleBody(sel);
      expect(body).toMatch(/outline\s*:[^;]*dashed/);
      expect(body).toMatch(/outline-offset\s*:\s*-2px/);
      expect(body).not.toMatch(/box-shadow/);
    }
  });
  it("only .palette__scroll scrolls; the palette root does not", () => {
    expect(ruleBody(".palette__scroll")).toMatch(/overflow-y\s*:\s*auto/);
    expect(ruleBody(".palette")).not.toMatch(/overflow/);
    expect(ruleBody(".metatile-palette")).not.toMatch(/overflow/);
    expect(ruleBody(".gbc-metatile-palette")).not.toMatch(/overflow/);
  });
  it("no stale grid rule can stack the columns, and the split divider wraps", () => {
    const out = transform({ filename: "styles.css", code: css, errorRecovery: true }).code.toString();
    expect(out).not.toMatch(/(^|\})\s*\.metatile-palette__grid\s*\{/);
    expect(out).not.toMatch(/(^|\})\s*\.gbc-metatile-palette__grid\s*\{/);
    expect(ruleBody(".metatile-palette__boundary")).not.toMatch(/nowrap/);
  });
  it("the edit rail is 272 px (256 px of columns + rule + thin scrollbar + border)", () => {
    expect(ruleBody(".edit-rail")).toMatch(/width\s*:\s*272px/);
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

  // Plan 11 final review M2: GBA's conflict, save and reload toasts stack in one group instead of covering each other.
  it("stacks the world toasts in a column group, each toast in flow", () => {
    const group = ruleBody(".world-canvas__toasts");
    expect(group).toMatch(/position\s*:\s*absolute/);
    expect(group).toMatch(/flex-direction\s*:\s*column/);
    expect(ruleBody(".world-canvas__toasts > .world-canvas__toast")).toMatch(/position\s*:\s*static/);
  });
});
