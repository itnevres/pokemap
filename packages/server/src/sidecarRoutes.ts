import type { IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import {
  conflictKey,
  isAcceptConflictBody,
  updatedAcceptedConflicts,
} from "@pokemap/core/world/conflictAcceptance";
import type { Conflict } from "@pokemap/core/world/connections";
import { readDungeons, writeDungeons } from "@pokemap/core/world/dungeons";
import { readSidecar, writeSidecar } from "@pokemap/core/world/sidecar";
import { decodeSegment, jsonBody } from "./http.js";

/**
 * The seven sidecar routes both server families used to hand-write inline
 * (Plan H task H-b): `POST /api/world/conflicts/accept`,
 * `POST /api/world/placement`, `POST /api/world/dungeons`, `GET|POST
 * /api/dungeons` and `PATCH|DELETE /api/dungeons/<id>`. GBA
 * (`index.ts`) and GBC (`gbcRoutes.ts`) kept near-identical copies that
 * differed in three injected deps (below), plus the guard unifications Plan
 * H H-b made on purpose: GBC gained the placement known-map check, and the
 * stricter GBC body guards and `malformed dungeon id` text now apply to
 * both. The dep differences are:
 *
 * - `knownMap`: GBA's `project.mapNames().includes(name)` vs GBC's
 *   `mapNames.has(name)` (a Set).
 * - `expandSeed`: `warpConnectedMapsFrom(project, seed)` (which itself
 *   reads the project's warp data) vs `gbcWarpConnectedMapsFrom(seed,
 *   getWarps())` (which takes the already-cached warp list).
 * - `autoLayoutReply`: the two families answer `POST /api/world/dungeons`
 *   differently and both are pinned by tests -- GBA answers
 *   `{ ok: true }` (`world.test.ts`), GBC answers
 *   `{ dungeonAutoLayout: <new value> }` (`gbcRoutes.test.ts`, and the GBC
 *   UI reads it). That one function is the only reply-shape difference.
 *
 * Everything else -- status codes, error strings, validation order, the
 * `runs after the try/catch` rationale and the `__proto__` rationale -- is
 * shared on purpose. The module has no family dependency: it imports
 * neither `Project` nor `GbcProject`, so a test can mount it against a
 * bare temp root with stub deps (`sidecarRoutes.test.ts` pins that).
 */
export interface SidecarRouteDeps {
  /** Project root for `readSidecar`/`writeSidecar`/`readDungeons`/`writeDungeons`. */
  root: string;
  /**
   * The already-built world (GBA's `getWorld()` / GBC's lazy
   * `worldCache ??= buildGbcWorld(proj)`). GBC passes the function, never a
   * value: the world must not be built at mount time.
   */
  getWorld: () => { conflicts: Conflict[] };
  /** GBA: `project.mapNames().includes` ; GBC: `mapNames.has`. */
  knownMap: (name: string) => boolean;
  /** GBA: `warpConnectedMapsFrom(project, seed)` ; GBC: `gbcWarpConnectedMapsFrom(seed, getWarps())`. */
  expandSeed: (seedMap: string) => Iterable<string>;
  /** GBA: `() => ({ ok: true })` ; GBC: `(v) => ({ dungeonAutoLayout: v })`. */
  autoLayoutReply: (dungeonAutoLayout: boolean) => unknown;
}

/** True for a parsed JSON body that is a non-null, non-array object. */
function isObjectBody(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The placement guard GBA's inline copy had, which GBC gained in Plan H
 * H-b. `null`, a non-object and an array are all refused here rather than
 * reaching `.map` and throwing, and `Number.isFinite` rejects the `1e999`
 * JSON.parse turns into Infinity.
 */
function isPlacementBody(value: unknown): value is { map: string; x: number; y: number } {
  if (!isObjectBody(value)) return false;
  const p = value as { map?: unknown; x?: unknown; y?: unknown };
  return typeof p.map === "string" && typeof p.x === "number" && Number.isFinite(p.x)
    && typeof p.y === "number" && Number.isFinite(p.y);
}

/** Non-null, non-array object with a boolean `enabled` (GBC's stricter guard). */
function isDungeonLayoutBody(value: unknown): value is { enabled: boolean } {
  return isObjectBody(value) && typeof (value as { enabled?: unknown }).enabled === "boolean";
}

/**
 * The seven routes. Returns a handler that answers a request only when it
 * owns the path, returning `true` then -- the same contract as
 * `addEvents.handleOptions` and `gbcEditRoutes.handle`. A request for a
 * path it does not own returns `false` and sends nothing, so both families
 * mount it ONCE wherever the first of these routes sits today and let the
 * rest of their own dispatch run untouched.
 *
 * Every body-reading route goes through http.ts's `jsonBody`, which owns
 * read/parse/400/413/500.
 *
 * `GET /api/dungeons` and `DELETE /api/dungeons/<id>` read `dungeons.json` synchronously, so
 * a corrupt file throws out of this function: the caller's own try/catch must
 * answer the 500 (both handlers mount it inside theirs). Do not mount it
 * outside a try/catch.
 */
export function sidecarRoutes(
  deps: SidecarRouteDeps,
): (req: IncomingMessage, url: URL, send: (code: number, body: unknown) => unknown) => boolean {
  const { root, getWorld, knownMap, expandSeed, autoLayoutReply } = deps;

  return (req, url, send): boolean => {
    const pathname = url.pathname;

    if (pathname === "/api/world/conflicts/accept" && req.method === "POST") {
      // `jsonBody`'s chain runs after the caller's own try/catch has
      // already returned, so a throw in here (readSidecar's own I7
      // refusal on a corrupted world.json) would otherwise become an
      // unhandled rejection and leave the request hanging forever instead
      // of answering it -- `jsonBody` turns it into the 500.
      jsonBody(req, send, isAcceptConflictBody, "{ key: string, accepted: boolean }", (parsed) => {
        if (!getWorld().conflicts.some((conflict) => conflictKey(conflict) === parsed.key)) {
          return send(404, { error: `unknown conflict key ${parsed.key}` });
        }
        const sidecar = readSidecar(root);
        sidecar.acceptedConflicts = updatedAcceptedConflicts(sidecar.acceptedConflicts ?? [], parsed.key, parsed.accepted);
        writeSidecar(root, sidecar);
        return send(200, { acceptedConflicts: sidecar.acceptedConflicts });
      });
      return true;
    }

    if (pathname === "/api/world/placement" && req.method === "POST") {
      // Same "runs after the try/catch" reason as above: `jsonBody`'s chain
      // settles after the caller's own try/catch has returned, so its `.catch`
      // is the only thing standing between a readSidecar I7 refusal and an
      // unhandled rejection that would leave the request hanging forever.
      // Bad JSON and a wrong body shape are answered by `jsonBody` before
      // this handler runs.
      jsonBody(req, send, isPlacementBody, "{ map: string, x: number, y: number }", (placement) => {
        // The known-map check is GBA's guard, shared by both families since
        // Plan H H-b -- without it `__proto__`
        // (and any other unknown name) would be written as a
        // `manualPlacements` key, and `manualPlacements["__proto__"] = ...`
        // replaces only that object's own prototype and persists nothing,
        // yet would answer a silent 200 `{ ok: true }`.
        if (!knownMap(placement.map)) {
          return send(400, { error: `unknown map ${placement.map}` });
        }
        const sidecar = readSidecar(root);
        sidecar.manualPlacements[placement.map] = { x: placement.x, y: placement.y };
        writeSidecar(root, sidecar);
        return send(200, { ok: true });
      });
      return true;
    }

    // Review fix: the dungeon-layout switch (packages/ui's WorldCanvas) only
    // ever changed the query string used for its own next fetch -- nothing
    // persisted sidecar.dungeonAutoLayout, so a reload silently discarded it.
    // The world payload is rebuilt from the sidecar on every request, so no cache needs clearing.
    if (pathname === "/api/world/dungeons" && req.method === "POST") {
      // Same "runs after the try/catch" reason as the two routes above.
      jsonBody(req, send, isDungeonLayoutBody, "{ enabled: boolean }", (parsed) => {
        const sidecar = readSidecar(root);
        sidecar.dungeonAutoLayout = parsed.enabled;
        writeSidecar(root, sidecar);
        return send(200, autoLayoutReply(sidecar.dungeonAutoLayout));
      });
      return true;
    }

    // Feature C (dungeon-mode-and-warp-tools spec §5.3): user-curated
    // named groups of maps, persisted to their own sidecar file --
    // .pokemap/dungeons.json, not world.json, for the same single-
    // responsibility split sidecar.ts's own file already established.
    if (pathname === "/api/dungeons" && req.method === "GET") {
      send(200, readDungeons(root).dungeons);
      return true;
    }

    if (pathname === "/api/dungeons" && req.method === "POST") {
      jsonBody(req, send, isObjectBody, "a dungeon object", (input, rawBody) => {
        if (typeof input.name !== "string" || input.name.trim() === "") {
          return send(400, { error: `expected a non-empty "name" string, got ${rawBody}` });
        }
        if (input.seedMap !== undefined && typeof input.seedMap !== "string") {
          return send(400, { error: `"seedMap" must be a string when present, got ${rawBody}` });
        }
        if (input.maps !== undefined && (!Array.isArray(input.maps) || input.maps.some((m) => typeof m !== "string"))) {
          return send(400, { error: `"maps" must be a string array when present, got ${rawBody}` });
        }

        let maps: string[];
        if (typeof input.seedMap === "string") {
          if (!knownMap(input.seedMap)) {
            return send(400, { error: `seedMap ${input.seedMap} is not a known map` });
          }
          maps = [...expandSeed(input.seedMap)].sort();
        } else {
          maps = (input.maps as string[] | undefined) ?? [];
        }

        const dungeons = readDungeons(root);
        const dungeon = { id: randomUUID(), name: input.name, maps };
        dungeons.dungeons.push(dungeon);
        writeDungeons(root, dungeons);
        return send(200, dungeon);
      });
      return true;
    }

    const dungeonIdMatch = /^\/api\/dungeons\/(.+)$/.exec(pathname);
    if (dungeonIdMatch && (req.method === "PATCH" || req.method === "DELETE")) {
      const rawId = dungeonIdMatch[1]!;
      const id = decodeSegment(rawId);
      // Return TRUE, not `send(...)`'s value: the contract is "did I handle
      // this?", and `send` returns whatever the caller's own sender returns.
      if (id === undefined) { send(400, { error: `malformed dungeon id ${rawId}` }); return true; }
      if (req.method === "DELETE") {
        const dungeons = readDungeons(root);
        const before = dungeons.dungeons.length;
        dungeons.dungeons = dungeons.dungeons.filter((d) => d.id !== id);
        if (dungeons.dungeons.length === before) { send(404, { error: `no dungeon ${id}` }); return true; }
        writeDungeons(root, dungeons);
        send(200, { ok: true });
        return true;
      }
      jsonBody(req, send, isObjectBody, "a dungeon object", (input, rawBody) => {
        if (input.name !== undefined && (typeof input.name !== "string" || input.name.trim() === "")) {
          return send(400, { error: `"name" must be a non-empty string when present, got ${rawBody}` });
        }
        if (input.maps !== undefined && (!Array.isArray(input.maps) || input.maps.some((m) => typeof m !== "string"))) {
          return send(400, { error: `"maps" must be a string array when present, got ${rawBody}` });
        }
        const dungeons = readDungeons(root);
        const dungeon = dungeons.dungeons.find((d) => d.id === id);
        if (!dungeon) { send(404, { error: `no dungeon ${id}` }); return; }
        if (typeof input.name === "string") dungeon.name = input.name;
        if (Array.isArray(input.maps)) dungeon.maps = input.maps as string[];
        writeDungeons(root, dungeons);
        send(200, dungeon);
      });
      return true;
    }

    return false;
  };
}