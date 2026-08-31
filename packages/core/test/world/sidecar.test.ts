import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSidecar, writeSidecar, applySidecar, type Sidecar } from "../../src/world/sidecar.js";
import type { Placement } from "../../src/world/connections.js";
import { projectPaths } from "../../src/config/paths.js";

const roots: string[] = [];
const tempRoot = () => { const r = mkdtempSync(join(tmpdir(), "pokemap-")); roots.push(r); return r; };
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

describe("sidecar", () => {
  it("returns defaults when no file exists", () => {
    const s = readSidecar(tempRoot());
    expect(s.version).toBe(1);
    expect(s.dungeonAutoLayout).toBe(true);
    expect(Object.keys(s.manualPlacements)).toHaveLength(0);
  });

  it("round-trips", () => {
    const root = tempRoot();
    const s: Sidecar = { version: 1, dungeonAutoLayout: false, manualPlacements: { NavelRock_Base: { x: 10, y: 20 } }, view: { x: 0, y: 0, zoom: 1 } };
    writeSidecar(root, s);
    expect(existsSync(`${root}/.pokemap/world.json`)).toBe(true);
    expect(readSidecar(root)).toEqual(s);
  });

  it("writes only inside .pokemap/", () => {
    const root = tempRoot();
    writeSidecar(root, readSidecar(root));
    expect(readFileSync(`${root}/.pokemap/world.json`, "utf8")).toContain("dungeonAutoLayout");
  });

  it("manual placements override auto placements", () => {
    const auto = new Map([["A", { map: "A", x: 0, y: 0, width: 10, height: 10, component: 0 }]]);
    const merged = applySidecar(auto, { version: 1, dungeonAutoLayout: true, manualPlacements: { A: { x: 99, y: 99 } }, view: { x: 0, y: 0, zoom: 1 } });
    expect(merged.get("A")).toMatchObject({ x: 99, y: 99, width: 10, height: 10 });
  });

  // Gap flagged in review: none of the four tests above exercise the branch
  // of applySidecar where a manual placement names a map that ISN'T in the
  // auto layout at all (e.g. a stale manual entry for a since-removed or
  // not-yet-auto-placed map). Assert the placeholder placement it fabricates
  // is exactly the documented shape: real x/y, zero size, component -1.
  it("fabricates a placeholder placement for a manual entry absent from auto", () => {
    const auto = new Map<string, Placement>();
    const merged = applySidecar(auto, {
      version: 1,
      dungeonAutoLayout: true,
      manualPlacements: { GhostMap: { x: 5, y: 7 } },
      view: { x: 0, y: 0, zoom: 1 },
    });
    expect(merged.size).toBe(1);
    expect(merged.get("GhostMap")).toEqual({ map: "GhostMap", x: 5, y: 7, width: 0, height: 0, component: -1 });
  });

  // I8 at unit scope: writeSidecar must never create anything at root other
  // than the .pokemap/ directory itself. Complements the concrete,
  // whole-repo I8 check (decomp untouched) run separately for this task.
  it("creates nothing at root except the .pokemap/ directory", () => {
    const root = tempRoot();
    writeSidecar(root, readSidecar(root));
    expect(readdirSync(root)).toEqual([".pokemap"]);
  });

  // Review fix (I7): readSidecar previously trusted `JSON.parse(...) as
  // Partial<Sidecar>` unchecked. Invalid JSON threw a bare SyntaxError with
  // no file path -- technically a refusal, but not an I7-quality one.
  it("refuses a corrupted (invalid JSON) sidecar file, naming the file", () => {
    const root = tempRoot();
    writeSidecar(root, readSidecar(root)); // establishes a valid .pokemap/world.json
    writeFileSync(projectPaths(root).sidecar, "{ not valid json");
    expect(() => readSidecar(root)).toThrow(projectPaths(root).sidecar);
  });

  // Review fix (I7): syntactically-valid-but-wrong-shaped data was worse --
  // no throw at all. A hand-edited `"manualPlacements": "oops"` made
  // applySidecar's `Object.entries(s.manualPlacements)` iterate the
  // string's characters, fabricating bogus single-character placements with
  // no crash and no refusal. This is the concrete case that must now refuse.
  it("refuses a manualPlacements that is not an object, naming the file", () => {
    const root = tempRoot();
    writeSidecar(root, readSidecar(root));
    writeFileSync(
      projectPaths(root).sidecar,
      JSON.stringify({ version: 1, dungeonAutoLayout: true, manualPlacements: "oops", view: { x: 0, y: 0, zoom: 1 } }),
    );
    expect(() => readSidecar(root)).toThrow(projectPaths(root).sidecar);
    expect(() => readSidecar(root)).toThrow(/manualPlacements/);
  });

  // Review fix: sidecar.ts had its own root-normalizer that stripped
  // backslashes but not a trailing slash, diverging from the shared, tested
  // `projectPaths` helper (which strips both) -- a real duplicate with a
  // real bug, not just style. Proven here via the refusal message itself
  // rather than filesystem existence: Windows/Node silently collapses a
  // redundant "//" for file access (verified separately), so an existence
  // check alone cannot tell the buggy path from the canonical one. The
  // message text can, because string interpolation isn't
  // filesystem-normalized.
  it("names the canonical projectPaths(...).sidecar path in refusals, even from a trailing-slash root", () => {
    const root = tempRoot();
    writeSidecar(root, readSidecar(root));
    writeFileSync(projectPaths(root).sidecar, "{ not valid json");
    expect(() => readSidecar(`${root}/`)).toThrow(projectPaths(root).sidecar);
  });
});
