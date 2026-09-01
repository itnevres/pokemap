import type { Project } from "../project.js";
import { buildWorld, type Placement, type World } from "./connections.js";
import { autoLayoutUnplaced, unplacedMapNames } from "./warpGraph.js";
import { applySidecar, type Sidecar } from "./sidecar.js";

export interface ResolveWorldOptions {
  /** Master on/off for dungeon auto-layout, ANDed with sidecar.dungeonAutoLayout
   *  -- matches /api/world's own `?dungeons=` query semantics: this can
   *  only turn auto-layout OFF for one call, never force it on over a
   *  sidecar that has it stored off. Defaults to true (no override). */
  dungeons?: boolean;
}

/**
 * The placements actually shown: buildWorld's base set, with singleton
 * (unplaced) maps either repositioned into their auto-layout warp clusters
 * (dungeons on) or removed entirely (dungeons off), then the sidecar's
 * manual overrides applied on top. Shared by the server's `/api/world`
 * route and the CLI's `render-world` command, which is the point --
 * before this existed, the two call sites carried the same fix hand-copied
 * with a comment promising to keep them in sync, exactly the kind of
 * duplication this project's own history (git log: "the same defect in
 * four disguises") warns tends to drift.
 *
 * buildWorld places EVERY map unconditionally -- even an isolated map
 * becomes its own 1-map component (see buildWorld's own comment in
 * connections.ts) -- so `world.placements` always holds every map's key
 * regardless of the toggle. Naively spreading `autoLayoutUnplaced`'s result
 * on top of it can only ever move x/y for names already present (those
 * keys are always a SUBSET of world.placements' keys), so the toggle would
 * do nothing observable -- confirmed by reverting to exactly that shape and
 * watching packages/server/test/world.test.ts's "respects the
 * dungeonAutoLayout flag" fail with "expected 1209 to be greater than
 * 1209". "Off" has to positively delete the unplaced names from the base
 * set; "on" restores them at their auto-clustered position instead of
 * their buildWorld seed position (0,0 within their own lone component).
 */
export function resolveWorldPlacements(
  proj: Project,
  world: World,
  sidecar: Sidecar,
  opts: ResolveWorldOptions = {},
): Map<string, Placement> {
  const dungeonsOn = (opts.dungeons ?? true) && sidecar.dungeonAutoLayout;
  const auto = autoLayoutUnplaced(proj, world, { enabled: dungeonsOn });

  const base = new Map(world.placements);
  if (dungeonsOn) {
    for (const [name, p] of auto) base.set(name, p);
  } else {
    for (const name of unplacedMapNames(world)) base.delete(name);
  }

  return applySidecar(base, sidecar);
}

// Re-exported so a caller that only needs buildWorld + resolveWorldPlacements
// (both server and CLI do) can import them from one module.
export { buildWorld };
