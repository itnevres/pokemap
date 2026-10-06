// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { transform } from "lightningcss";

// Plan 6c E4: the in-context overlay's geometry is what keeps the chromeless MapCanvas's stage box equal to the world
// canvas box, so its rules are pinned the way styles.test.ts pins the shared canvas ones.
describe("styles.css: in-context editing overlay (Plan 6c E4)", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url));
  const out = transform({ filename: "styles.css", code: css, errorRecovery: true }).code.toString();
  const ruleBody = (selector: string) => {
    const esc = selector.replace(/\./g, String.raw`\.`);
    const m = new RegExp(String.raw`(^|\})\s*${esc}\s*\{([^}]*)\}`).exec(out);
    expect(m, selector).not.toBeNull();
    return m![2]!;
  };

  it("the overlay fills the world viewport box exactly", () => {
    const body = ruleBody(".world-canvas__context");
    expect(body).toMatch(/position\s*:\s*absolute/);
    expect(body).toMatch(/inset\s*:\s*0|top\s*:\s*0[^;]*;[^}]*left\s*:\s*0/);
  });

  it("the dim layer uses the spotlight dim token and covers the overlay", () => {
    const body = ruleBody(".world-canvas__context-dim");
    expect(body).toMatch(/background\s*:\s*var\(--overlay-spotlight-dim\)/);
    expect(body).toMatch(/position\s*:\s*absolute/);
  });

  it("the chromeless MapCanvas viewport is transparent so the dim layer and the world show around the map", () => {
    expect(ruleBody(".map-canvas--chromeless .map-canvas__viewport")).toMatch(/background\s*:\s*(transparent|none)/); // lightningcss normalises the shorthand
  });

  it("the bar sits top-left on the raised panel with the strong border, and its name can shrink", () => {
    const body = ruleBody(".world-canvas__context-bar");
    expect(body).toMatch(/background\s*:\s*var\(--bg-panel-raised\)/);
    expect(body).toMatch(/border\s*:[^;]*var\(--border-strong\)/);
    expect(body).toMatch(/border-radius\s*:\s*4px/);
    expect(ruleBody(".world-canvas__context-name")).toMatch(/min-width\s*:\s*0/);
  });
});
