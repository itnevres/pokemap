import { describe, it, expect } from "vitest";
import { openProject } from "@pokemap/core/src/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../../core/test/helpers/corpus.js";
import { resolvePlacementRect } from "../src/renderWorld.js";

const proj = openProject(SUBJECT_ROOT);

// Review fix: render-world used to skip every `component: -1` placement
// outright (a manually-placed-but-not-yet-auto-clustered map -- see
// packages/core/test/world/sidecar.test.ts's "fabricates a placeholder
// placement" test for that documented width:0,height:0 shape), reasoning in
// a comment that there was "no cheap way" to size it. That reasoning was
// wrong: proj.layoutForMap is exactly that cheap lookup (buildWorld has
// already warmed proj's map cache for every map in the project by the time
// render-world runs), and was already being called two lines below the
// skip for a different purpose. Net effect of the old code:
// `render-world --no-dungeons` silently omitted every manually-dragged map,
// which is not an auto-placed dungeon map and so is not what --no-dungeons
// is documented to exclude.
describe("resolvePlacementRect", () => {
  itWithCorpus("recovers a component:-1 placement's real size via layoutForMap instead of leaving it 0x0", () => {
    const mapName = proj.mapNames()[0]!;
    const layout = proj.layoutForMap(mapName);
    // Exactly applySidecar's documented fallback shape.
    const placeholder = { map: mapName, x: 5, y: 7, width: 0, height: 0, component: -1 };

    expect(resolvePlacementRect(proj, placeholder)).toEqual({
      width: layout.width,
      height: layout.height,
      layoutName: layout.name,
    });
  });

  itWithCorpus("passes an ordinary placement's own width/height through unchanged", () => {
    const mapName = proj.mapNames()[1]!;
    const layout = proj.layoutForMap(mapName);
    const placement = { map: mapName, x: 0, y: 0, width: 999, height: 888, component: 0 };

    expect(resolvePlacementRect(proj, placement)).toEqual({
      width: 999,
      height: 888,
      layoutName: layout.name,
    });
  });

  // The one genuinely unrecoverable case: sidecar.json is the one
  // hand-editable state file in this project (packages/core/src/world/sidecar.ts's
  // own comment) and can go stale -- a manual placement naming a map that
  // no longer exists in the project at all. layoutForMap throws naming it;
  // that throw is what this must turn into "skip", not a crash.
  itWithCorpus("returns null for a manual placement naming a map no longer in the project", () => {
    const placeholder = { map: "ThisMapDoesNotExist_Ghost", x: 0, y: 0, width: 0, height: 0, component: -1 };
    expect(resolvePlacementRect(proj, placeholder)).toBeNull();
  });
});
