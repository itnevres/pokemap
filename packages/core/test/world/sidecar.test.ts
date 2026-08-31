import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSidecar, writeSidecar, applySidecar, type Sidecar } from "../../src/world/sidecar.js";
import type { Placement } from "../../src/world/connections.js";

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
});
