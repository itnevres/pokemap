# Dungeon Mode and Warp Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three features in `docs/superpowers/specs/2026-09-07-dungeon-mode-and-warp-tools-design.md`: (A) the world view hides small interiors by default, with a greyed/draggable third state in the sidebar map list; (B) a warp toggle that draws markers over every visible warp and a double-click preview of its destination; (C) a new Dungeon tab holding user-curated, named groups of maps, viewed on a scoped `WorldCanvas` with warp-connection lines between exact tiles.

**Architecture:** Every wire-shape addition mirrors an existing, already-reviewed pattern in this codebase rather than inventing a new one: per-placement `mapType`/`manual` flags are enriched onto `/api/world`'s response exactly the way `/api/coverage` already enriches `levelByMap` with a display name; `/api/warps/:map` is a new, uncached per-map GET route shaped like `/api/encounters/:map`; the dungeon CRUD routes mirror `/api/world/placement`'s read-body/parse-guard/shape-guard/read-mutate-write/outer-catch shape exactly; `.pokemap/dungeons.json` is a second sidecar file with its own `readDungeons`/`writeDungeons`/`assertShape` trio, copy-structured from `sidecar.ts`. `WorldCanvas` itself is never forked — Dungeon mode is the same component with a new `mapFilter` prop, per the spec's own §5.4 interface.

**Tech Stack:** Unchanged from Plan 1 / the World View Usability plan — React 19, TypeScript strict, vitest + @testing-library/react, a plain Node `http` server, npm workspaces (`@pokemap/core`, `@pokemap/server`, `@pokemap/ui`).

**Read before starting, if you have not already:**
- `docs/superpowers/specs/2026-09-07-dungeon-mode-and-warp-tools-design.md` — the approved spec every task below implements a piece of.
- `packages/ui/DESIGN.md` — the project's colour/type/spacing tokens. Every new colour in this plan is a CSS custom property added there, never a hardcoded hex value in a `.tsx` file (DESIGN.md's own closing rule).
- `packages/ui/src/components/WorldCanvas.tsx` — the component nine of these sixteen tasks touch. Read it in full before Task 3; it is ~1,540 lines and this plan's own code snippets quote the exact surrounding lines they insert next to, but the file will have moved on by the time you reach later tasks in the same session.

**Standing rules for every task below**, matching this project's own established practice (see `docs/superpowers/RESUME.md` if present):
- Independently verify every file path, type name, and function signature this plan cites against the REAL current source before trusting it — the plan author audited the repo at write time, but earlier tasks in this same plan change several of the files later tasks depend on.
- Every fetch mock addition to `packages/ui/test/WorldCanvas.test.tsx`'s `makeFetchMock` must be additive — do not remove or restructure existing branches other tests depend on.
- `C:\Programming Projects\Pokemon Game\game` (the subject decomp) is READ-ONLY. The only legitimate write is `.pokemap/` inside it (I8). Any test that writes there must restore the prior state in a `finally` block, exactly like `packages/server/test/world.test.ts`'s existing placement/dungeon-toggle tests do.
- Give a tautology audit, independent number verification, willingness to question this plan's own instructions, and a teeth-proof (break the fix, watch the right test go red, restore, confirm green) for every task.

---

## Feature A: Default population + search grey-out

### Task 1: Server — tag each `/api/world` placement with its map kind and manual-override status

**Files:**
- Modify: `packages/server/src/index.ts:291-303` (the `/api/world` route)
- Test: `packages/server/test/world.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/server/test/world.test.ts`, inside the existing `describe.skipIf(...)("world api", ...)` block (anywhere after the existing `it("returns placements, components, conflicts and vertical links", ...)` test):

```ts
  it("tags each placement with its map kind and whether it was manually placed (Feature A)", async () => {
    const body = await (await fetch(`http://127.0.0.1:${s.port}/api/world`)).json() as any;
    // NewBarkTown_Lab is MAP_TYPE_NONE and Route101 is MAP_TYPE_ROUTE --
    // measured directly against the subject decomp's own map.json files
    // (the dungeon-mode design spec's own §2 table), not assumed.
    expect(body.placements.NewBarkTown_Lab.mapType).toBe("MAP_TYPE_NONE");
    expect(body.placements.Route101.mapType).toBe("MAP_TYPE_ROUTE");
    expect(body.placements.Route101.manual).toBe(false);
  }, 300_000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/test/world.test.ts -t "tags each placement"`
Expected: FAIL — `body.placements.NewBarkTown_Lab.mapType` is `undefined`.

- [ ] **Step 3: Implement**

In `packages/server/src/index.ts`, replace the `/api/world` route body (currently):

```ts
      if (url.pathname === "/api/world") {
        const dungeons = url.searchParams.get("dungeons") !== "0";
        const world = getWorld();
        const sidecar = readSidecar(project.paths.root);
        const merged = resolveWorldPlacements(project, world, sidecar, { dungeons });
        return send(200, {
          placements: Object.fromEntries(merged),
          components: world.components,
          conflicts: world.conflicts,
          verticalLinks: world.verticalLinks,
          sidecar,
        });
      }
```

with:

```ts
      if (url.pathname === "/api/world") {
        const dungeons = url.searchParams.get("dungeons") !== "0";
        const world = getWorld();
        const sidecar = readSidecar(project.paths.root);
        const merged = resolveWorldPlacements(project, world, sidecar, { dungeons });

        // Feature A (dungeon-mode-and-warp-tools spec §3.2): the world
        // view's default-population filter needs each placement's own map
        // kind and whether the user ever manually placed it -- both are
        // UI-only display concerns layered onto the wire response, not onto
        // Placement itself (core/world/connections.ts), mirroring how
        // /api/coverage already enriches levelByMap with a display name
        // rather than growing coverage()'s own tested shape for a UI-only
        // need (see that route's own comment just below in this file). A
        // name absent from knownMaps (a stale manualPlacements entry for a
        // since-renamed or removed map) has no real mapType to report --
        // MAP_TYPE_NONE is the project's own "nothing special" value and,
        // combined with `manual` being true for any such entry, is never
        // actually consulted either way (see
        // packages/ui/src/world/visibility.ts's isDrawnByDefault: `manual`
        // alone already forces the map to show).
        const knownMaps = new Set(project.mapNames());
        const placements: Record<string, unknown> = {};
        for (const [name, p] of merged) {
          placements[name] = {
            ...p,
            mapType: knownMaps.has(name) ? project.map(name).mapType : "MAP_TYPE_NONE",
            manual: name in sidecar.manualPlacements,
          };
        }

        return send(200, {
          placements,
          components: world.components,
          conflicts: world.conflicts,
          verticalLinks: world.verticalLinks,
          sidecar,
        });
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/server/test/world.test.ts`
Expected: PASS, all tests in the file (this change must not break the existing `"returns placements, components, conflicts and vertical links"` test, which only checks `Object.keys(w.placements).length` and is unaffected by extra fields per-entry).

- [ ] **Step 5: Teeth-proof**

Temporarily revert the `mapType`/`manual` additions (comment out the two new lines, ship `placements[name] = p` instead), confirm this task's new test fails with `mapType` being `undefined`, then restore.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/index.ts packages/server/test/world.test.ts
git commit -m "feat(server): tag /api/world placements with mapType and manual for the default-population filter"
```

---

### Task 2: UI — shared default-visibility rule (`packages/ui/src/world/visibility.ts`)

**Files:**
- Create: `packages/ui/src/world/visibility.ts`
- Test: `packages/ui/test/world/visibility.test.ts`

This is the ONE place the "which map types are hidden by default" rule lives. `WorldCanvas` (Task 3, drives what actually draws) and the sidebar's grey-out (Task 5, drives what LOOKS drawable) both import from here — never duplicate the rule, which is exactly the "same defect in different disguises" class of bug this project's own history warns about.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/test/world/visibility.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { HIDDEN_MAP_TYPES, isDrawnByDefault } from "../../src/world/visibility.js";

describe("visibility", () => {
  it("hides MAP_TYPE_INDOOR and MAP_TYPE_NONE by default", () => {
    expect(HIDDEN_MAP_TYPES.has("MAP_TYPE_INDOOR")).toBe(true);
    expect(HIDDEN_MAP_TYPES.has("MAP_TYPE_NONE")).toBe(true);
    expect(isDrawnByDefault("MAP_TYPE_INDOOR", false)).toBe(false);
    expect(isDrawnByDefault("MAP_TYPE_NONE", false)).toBe(false);
  });

  it("shows every other measured map type by default", () => {
    // Every non-hidden type from the design spec's own §2 table -- pinned
    // individually, not just "not INDOOR/NONE", so a future edit to
    // HIDDEN_MAP_TYPES that accidentally hides one of these fails loudly
    // here instead of only in a much harder-to-diagnose WorldCanvas test.
    for (const t of [
      "MAP_TYPE_TOWN", "MAP_TYPE_CITY", "MAP_TYPE_ROUTE", "MAP_TYPE_OCEAN_ROUTE",
      "MAP_TYPE_UNDERGROUND", "MAP_TYPE_UNDERWATER", "MAP_TYPE_SECRET_BASE",
    ]) {
      expect(isDrawnByDefault(t, false)).toBe(true);
    }
  });

  it("a manually-placed map always shows, regardless of its type", () => {
    expect(isDrawnByDefault("MAP_TYPE_INDOOR", true)).toBe(true);
    expect(isDrawnByDefault("MAP_TYPE_NONE", true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ui/test/world/visibility.test.ts`
Expected: FAIL — the module does not exist yet.

- [ ] **Step 3: Implement**

Create `packages/ui/src/world/visibility.ts`:

```ts
/**
 * Map types hidden from the world view by default (spec §3.1) -- mostly
 * small interiors that read as noise at world scale. Population counts
 * measured against the subject decomp (dungeon-mode-and-warp-tools spec
 * §2): MAP_TYPE_INDOOR 695, MAP_TYPE_NONE 6, out of 1,209 total.
 */
export const HIDDEN_MAP_TYPES: ReadonlySet<string> = new Set(["MAP_TYPE_INDOOR", "MAP_TYPE_NONE"]);

/**
 * A map draws by default if its type isn't hidden, OR the user has ever
 * manually placed it (dragging it in is the deliberate override -- spec
 * §3.1's last paragraph: "A map the user has ever manually dragged in...
 * always shows, regardless of type"). Pure and tiny so both WorldCanvas
 * (drives what actually draws) and the sidebar's grey-out (drives what
 * LOOKS drawable) can share one definition instead of two copies drifting
 * apart.
 */
export function isDrawnByDefault(mapType: string, manual: boolean): boolean {
  return manual || !HIDDEN_MAP_TYPES.has(mapType);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ui/test/world/visibility.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Teeth-proof**

Temporarily change `isDrawnByDefault` to `return !HIDDEN_MAP_TYPES.has(mapType);` (dropping the `manual ||`), confirm the third test ("a manually-placed map always shows") fails, then restore.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/world/visibility.ts packages/ui/test/world/visibility.test.ts
git commit -m "feat(ui): shared default-population visibility rule for the world view and sidebar"
```

---

### Task 3: UI — WorldCanvas hides small interiors by default, with temporary reveal-on-jump

**Files:**
- Modify: `packages/ui/src/components/WorldCanvas.tsx`
- Test: `packages/ui/test/WorldCanvas.test.tsx`

**Read `packages/ui/src/components/WorldCanvas.tsx` in full before starting this task** — it is long, and this step quotes exact surrounding lines that must match the real file or your edit will fail to apply cleanly.

- [ ] **Step 1: Write the failing tests**

Add to `packages/ui/test/WorldCanvas.test.tsx`, as a new top-level `describe` inside the outer `describe("WorldCanvas", ...)` block (anywhere after the existing `describe("multi-select", ...)` block is fine):

```ts
  describe("default population filter (Feature A)", () => {
    function typedWorld() {
      return {
        placements: {
          Town: { map: "Town", x: 0, y: 0, width: 10, height: 10, component: 0, mapType: "MAP_TYPE_TOWN", manual: false },
          House: { map: "House", x: 20, y: 0, width: 10, height: 10, component: 1, mapType: "MAP_TYPE_INDOOR", manual: false },
          ManualHouse: { map: "ManualHouse", x: 40, y: 0, width: 10, height: 10, component: 2, mapType: "MAP_TYPE_INDOOR", manual: true },
        },
        components: [
          { index: 0, maps: ["Town"], bounds: { x: 0, y: 0, width: 10, height: 10 } },
          { index: 1, maps: ["House"], bounds: { x: 20, y: 0, width: 10, height: 10 } },
          { index: 2, maps: ["ManualHouse"], bounds: { x: 40, y: 0, width: 10, height: 10 } },
        ],
        conflicts: [],
        verticalLinks: [],
        sidecar: { version: 1, dungeonAutoLayout: true, manualPlacements: { ManualHouse: { x: 40, y: 0 } }, view: { x: 0, y: 0, zoom: 1 } },
      };
    }

    it("does not fetch art for a MAP_TYPE_INDOOR map that was never manually placed", async () => {
      const { impl } = makeFetchMock(typedWorld() as any);
      await mountReady(impl);
      const srcs = FakeImage.instances.map((i) => i.src);
      expect(srcs.some((s) => s.includes("Town"))).toBe(true);
      expect(srcs.some((s) => s.includes("ManualHouse"))).toBe(true);
      // Plain "House" must not appear, but "ManualHouse" (which DOES
      // contain the substring "House") must -- checked as a whole path
      // segment, not a bare substring, so this assertion cannot pass by
      // accident against the wrong map.
      expect(srcs.some((s) => s.includes("/House.png") || s.includes(encodeURIComponent("House") + ".png"))).toBe(false);
    });

    it("jumping to a hidden-by-type map reveals it for this view, without writing anything (no POST fired -- spec §6: a look, not a commit)", async () => {
      const { impl } = makeFetchMock(typedWorld() as any);
      vi.stubGlobal("fetch", impl);
      render(<WorldCanvas jumpToMap="House" jumpToken={1} />);
      await waitFor(() => expect(screen.queryByText(/Loading world/)).toBeNull());
      await waitFor(() => expect(FakeImage.instances.some((i) => i.src.includes(encodeURIComponent("House")))).toBe(true));
      const posts = impl.mock.calls.filter(([url]: [string]) => url.startsWith("/api/world/placement"));
      expect(posts.length).toBe(0);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ui/test/WorldCanvas.test.tsx -t "default population filter"`
Expected: FAIL — `House` still fetches its PNG (no filter exists yet), so the first test's negative assertion fails.

- [ ] **Step 3: Implement**

**3a.** Add the import, alongside the existing imports at the top of `packages/ui/src/components/WorldCanvas.tsx`:

```ts
import { isDrawnByDefault } from "../world/visibility.js";
```

**3b.** Change the `WorldPayload`/`WorldState` interfaces (currently at lines 31–45):

```ts
interface WorldPayload {
  placements: Record<string, Placement>;
  components: WorldComponentInfo[];
  conflicts: Conflict[];
  verticalLinks: VerticalLink[];
  sidecar: { dungeonAutoLayout: boolean };
}

interface WorldState {
  placements: Map<string, Placement>;
  components: WorldComponentInfo[];
  conflicts: Conflict[];
  verticalLinks: VerticalLink[];
  sidecarDungeonAutoLayout: boolean;
}
```

to:

```ts
/** Placement.map plus the two Feature A fields Task 1 added to the wire
 *  response (packages/server/src/index.ts's `/api/world` route). A
 *  superset of Placement, so every existing helper that takes a `Placement`
 *  (sizeOfPlacement, componentOfPlacement, intersects/contains callers)
 *  keeps working unchanged via plain structural typing. */
interface WirePlacement extends Placement {
  mapType: string;
  manual: boolean;
}

interface WorldPayload {
  placements: Record<string, WirePlacement>;
  components: WorldComponentInfo[];
  conflicts: Conflict[];
  verticalLinks: VerticalLink[];
  sidecar: { dungeonAutoLayout: boolean };
}

interface WorldState {
  placements: Map<string, WirePlacement>;
  components: WorldComponentInfo[];
  conflicts: Conflict[];
  verticalLinks: VerticalLink[];
  sidecarDungeonAutoLayout: boolean;
}
```

**3c.** Add new state, alongside the existing `selected`/`marqueeRect` state (near line 248-249):

```ts
  // Feature A: maps hidden by default (visibility.ts's isDrawnByDefault)
  // that the user has temporarily revealed by clicking their name in the
  // sidebar map list while it has a real placement (spec §3.3). Session-
  // local and unpersisted by design -- WorldCanvas fully unmounts when
  // leaving World mode (App.tsx's conditional render), which already
  // clears this for free on "leaving World mode does not survive" per the
  // spec; no explicit reset is needed.
  const [revealedMaps, setRevealedMaps] = useState<Set<string>>(new Set());
```

**3d.** Modify the `visible` useMemo (currently at lines 520-531):

```ts
  const visible = useMemo(() => {
    if (!world) return [] as Placement[];
    const x0 = -pan.x / zoom, y0 = -pan.y / zoom;
    const x1 = (viewport.w - pan.x) / zoom, y1 = (viewport.h - pan.y) / zoom;
    const out: Placement[] = [];
    for (const p of world.placements.values()) {
      const size = sizeOfPlacement(p, sizeByMap);
      if (size.width <= 0 || size.height <= 0) continue; // unrenderable orphan, see sizeOfPlacement
      if (intersects(p.x, p.y, size.width, size.height, x0, y0, x1, y1)) out.push(p);
    }
    return out;
  }, [world, pan, zoom, viewport, sizeByMap]);
```

to:

```ts
  const visible = useMemo(() => {
    if (!world) return [] as Placement[];
    const x0 = -pan.x / zoom, y0 = -pan.y / zoom;
    const x1 = (viewport.w - pan.x) / zoom, y1 = (viewport.h - pan.y) / zoom;
    const out: Placement[] = [];
    for (const p of world.placements.values()) {
      const size = sizeOfPlacement(p, sizeByMap);
      if (size.width <= 0 || size.height <= 0) continue; // unrenderable orphan, see sizeOfPlacement
      // Feature A (spec §3.1): a placement not drawn by default (mapType in
      // HIDDEN_MAP_TYPES and never manually placed) stays hidden unless the
      // user has temporarily revealed it via a sidebar jump (see the jump
      // effect below). `p.mapType`/`p.manual` are always present on a
      // server-fetched placement (Task 1); a locally-fabricated
      // component:-1 placement from a fresh sidebar/rail drop (onDropOnCanvas
      // below) has neither field, but that object represents a map the user
      // JUST deliberately placed -- isDrawnByDefault("" as mapType, false)
      // reads as "not hidden" (HIDDEN_MAP_TYPES never contains ""), so it
      // draws immediately without needing this filter's cooperation.
      if (!isDrawnByDefault(p.mapType ?? "", p.manual ?? false) && !revealedMaps.has(p.map)) continue;
      if (intersects(p.x, p.y, size.width, size.height, x0, y0, x1, y1)) out.push(p);
    }
    return out;
  }, [world, pan, zoom, viewport, sizeByMap, revealedMaps]);
```

**3e.** Modify the jump effect (currently at lines 471-487) to reveal a hidden-by-type target. Change:

```ts
  useEffect(() => {
    if (jumpToken === undefined || jumpToken === appliedJumpTokenRef.current) return;
    if (!jumpToMap || !world) return; // retry once `world` itself changes (see comment above)
    appliedJumpTokenRef.current = jumpToken;
    const p = world.placements.get(jumpToMap);
    if (!p) return;
    const size = sizeOfPlacement(p, sizeByMap);
    if (size.width <= 0 || size.height <= 0) return;
    const fit = computeFit({ x: p.x, y: p.y, width: size.width, height: size.height }, viewport);
    setZoom(fit.zoom);
    setPan(fit.pan);
    setJumpHighlight(jumpToMap);
```

to:

```ts
  useEffect(() => {
    if (jumpToken === undefined || jumpToken === appliedJumpTokenRef.current) return;
    if (!jumpToMap || !world) return; // retry once `world` itself changes (see comment above)
    appliedJumpTokenRef.current = jumpToken;
    const p = world.placements.get(jumpToMap);
    if (!p) return;
    const size = sizeOfPlacement(p, sizeByMap);
    if (size.width <= 0 || size.height <= 0) return;
    // Feature A (spec §3.3): clicking a sidebar entry that has a real
    // placement but isn't drawn by default reveals it for this view -- a
    // "look," not a commit (contrast with dragging it onto the canvas,
    // which DOES persist, via the existing onDropOnCanvas/postPlacement
    // path). A map with no placement at all already returns above (`if
    // (!p) return`), matching spec §3.3's own "has nowhere to jump to;
    // clicking it does nothing."
    if (!isDrawnByDefault(p.mapType ?? "", p.manual ?? false)) {
      setRevealedMaps((prev) => (prev.has(jumpToMap) ? prev : new Set(prev).add(jumpToMap)));
    }
    const fit = computeFit({ x: p.x, y: p.y, width: size.width, height: size.height }, viewport);
    setZoom(fit.zoom);
    setPan(fit.pan);
    setJumpHighlight(jumpToMap);
```

(The rest of the effect, and its `eslint-disable-next-line` comment, is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ui/test/WorldCanvas.test.tsx`
Expected: PASS, every test in the file — including every pre-existing test, since `typedWorld` fixtures elsewhere in the file omit `mapType`/`manual` entirely (`undefined`), which the `?? ""`/`?? false` fallbacks above treat as "not hidden," matching every existing fixture's implicit expectation that its placements simply draw.

- [ ] **Step 5: Run the FULL suite, not just this file**

Run: `npm test`
Expected: PASS. This step exists specifically because Task 3 changes a `useMemo` nine other overlays (`encounterEntries`, `lensOverlayEntries`, `spotlightOverlayEntries`, `selectionOverlayEntries`, `hitTest`, the image/encounter-fetch effects, the draw effect) all read from — a regression here would show up as a failure in one of THOSE tests, not necessarily this task's own new ones.

- [ ] **Step 6: Teeth-proof**

Temporarily remove the `!isDrawnByDefault(...) && !revealedMaps.has(...)` guard from `visible` (revert to the original loop body), confirm this task's first new test ("does not fetch art for a MAP_TYPE_INDOOR map") fails, then restore.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/WorldCanvas.tsx packages/ui/test/WorldCanvas.test.tsx
git commit -m "feat(ui): world view hides small interiors by default, reveals on sidebar jump"
```

---

### Task 4: UI — `useWorldVisibility` hook

**Files:**
- Create: `packages/ui/src/hooks/useWorldVisibility.ts`
- Test: `packages/ui/test/useWorldVisibility.test.tsx`

Feeds the sidebar's grey-out (Task 5). Deliberately its OWN fetch of `/api/world`, independent of `WorldCanvas`'s own — the same "each component fetches what it needs, the server caches the expensive part" split `SpeciesSpotlight`'s own `/api/species` fetch already established, and it avoids threading `WorldCanvas`'s large, heavily-reviewed internal state up to `App.tsx` for a small sidebar need.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/test/useWorldVisibility.test.tsx`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useWorldVisibility } from "../src/hooks/useWorldVisibility.js";

afterEach(() => vi.unstubAllGlobals());

/** No renderHook in this project's testing-library setup elsewhere -- a
 *  tiny host component is the established way to exercise a hook here too
 *  (mirrors how useMapGroups/useCoverage are exercised indirectly through
 *  the components that use them; this hook has no such component yet). */
function Host({ enabled, onResult }: { enabled: boolean; onResult: (r: ReturnType<typeof useWorldVisibility>) => void }) {
  const result = useWorldVisibility(enabled);
  onResult(result);
  return null;
}

describe("useWorldVisibility", () => {
  it("fetches nothing when disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    let last: ReturnType<typeof useWorldVisibility> | undefined;
    render(<Host enabled={false} onResult={(r) => { last = r; }} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(last?.placed).toBeNull();
  });

  it("fetches /api/world once enabled and exposes mapType/manual per placed map", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            placements: {
              Town: { map: "Town", x: 0, y: 0, width: 10, height: 10, component: 0, mapType: "MAP_TYPE_TOWN", manual: false },
            },
          }),
      } as Response),
    );
    vi.stubGlobal("fetch", fetchMock);
    let last: ReturnType<typeof useWorldVisibility> | undefined;
    render(<Host enabled={true} onResult={(r) => { last = r; }} />);
    await waitFor(() => expect(last?.placed).not.toBeNull());
    expect(last!.placed!.get("Town")).toEqual({ mapType: "MAP_TYPE_TOWN", manual: false });
    expect(last!.placed!.has("NotPlaced")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ui/test/useWorldVisibility.test.tsx`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement**

Create `packages/ui/src/hooks/useWorldVisibility.ts`:

```ts
import { useEffect, useState } from "react";

export interface MapVisibilityInfo {
  mapType: string;
  manual: boolean;
}

export interface UseWorldVisibilityResult {
  /** Every map with a real placement, keyed by name. A name absent here
   *  has NO placement at all -- see visibility.ts's own isDrawnByDefault
   *  and the sidebar grey-out (Task 5) for how the two cases combine into
   *  one "greyed" state. Null while loading or disabled. */
  placed: Map<string, MapVisibilityInfo> | null;
  error: string | null;
}

/**
 * Feeds the sidebar's World-mode grey-out (dungeon-mode-and-warp-tools
 * spec §3.3) -- independent of WorldCanvas's own /api/world fetch by
 * design, the same "each component fetches what it needs, the server
 * caches the expensive part" split SpeciesSpotlight's own /api/species
 * fetch already established. `enabled` gates the fetch so Map mode never
 * pays for 1,209 placements it has no use for.
 */
export function useWorldVisibility(enabled: boolean): UseWorldVisibilityResult {
  const [placed, setPlaced] = useState<Map<string, MapVisibilityInfo> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPlaced(null);
      setError(null);
      return;
    }
    let cancelled = false;
    fetch("/api/world")
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/world -> ${r.status}`);
        return r.json() as Promise<{ placements: Record<string, { mapType: string; manual: boolean }> }>;
      })
      .then((d) => {
        if (cancelled) return;
        const out = new Map<string, MapVisibilityInfo>();
        for (const [name, p] of Object.entries(d.placements)) out.set(name, { mapType: p.mapType, manual: p.manual });
        setPlaced(out);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { placed, error };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ui/test/useWorldVisibility.test.tsx`
Expected: PASS, 2/2.

- [ ] **Step 5: Teeth-proof**

Temporarily change the guard to `if (false)` (always fetch), confirm the first test ("fetches nothing when disabled") fails because `fetchMock` WAS called, then restore.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/hooks/useWorldVisibility.ts packages/ui/test/useWorldVisibility.test.tsx
git commit -m "feat(ui): useWorldVisibility hook for the sidebar's world-mode grey-out"
```

---

### Task 5: UI — MapTree grey-out + drag, App.tsx wiring, CSS

**Files:**
- Modify: `packages/ui/src/components/MapTree.tsx`
- Modify: `packages/ui/src/App.tsx`
- Modify: `packages/ui/src/styles.css`
- Test: `packages/ui/test/MapTree.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `packages/ui/test/MapTree.test.tsx`, inside the existing `describe("MapTree", ...)` block:

```ts
  it("does not grey anything out in Map mode, even with visibility data", () => {
    const visibility = new Map([["NewBarkTown", { mapType: "MAP_TYPE_TOWN", manual: false }]]);
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} worldMode={false} visibility={visibility} />);
    expect(screen.getByText("Route29").className).not.toContain("greyed");
  });

  it("greys out a World-mode map with no placement at all", () => {
    const visibility = new Map<string, { mapType: string; manual: boolean }>(); // nothing placed
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} worldMode={true} visibility={visibility} />);
    expect(screen.getByText("Route29").className).toContain("greyed");
  });

  it("greys out a placed-but-hidden-by-type World-mode map, but not a shown one", () => {
    const visibility = new Map([
      ["NewBarkTown", { mapType: "MAP_TYPE_TOWN", manual: false }],
      ["Route29", { mapType: "MAP_TYPE_INDOOR", manual: false }],
    ]);
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} worldMode={true} visibility={visibility} />);
    expect(screen.getByText("NewBarkTown").className).not.toContain("greyed");
    expect(screen.getByText("Route29").className).toContain("greyed");
  });

  it("a manually-placed indoor map is not greyed out", () => {
    const visibility = new Map([["Route29", { mapType: "MAP_TYPE_INDOOR", manual: true }]]);
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} worldMode={true} visibility={visibility} />);
    expect(screen.getByText("Route29").className).not.toContain("greyed");
  });

  it("a greyed entry is draggable, carrying its own map name as plain text", () => {
    const visibility = new Map<string, { mapType: string; manual: boolean }>();
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} worldMode={true} visibility={visibility} />);
    const el = screen.getByText("Route29");
    expect(el.getAttribute("draggable")).toBe("true");
    const dataTransfer = { setData: vi.fn() };
    fireEvent.dragStart(el, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "Route29");
  });

  it("a shown entry is not specially draggable", () => {
    const visibility = new Map([["NewBarkTown", { mapType: "MAP_TYPE_TOWN", manual: false }]]);
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} worldMode={true} visibility={visibility} />);
    expect(screen.getByText("NewBarkTown").getAttribute("draggable")).not.toBe("true");
  });

  it("treats every entry as shown while visibility is still loading (null), avoiding a flash of all-grey", () => {
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} worldMode={true} visibility={null} />);
    expect(screen.getByText("Route29").className).not.toContain("greyed");
  });
```

Add `vi` to the existing `import { describe, it, expect } from "vitest";` line at the top of the file (change to `import { describe, it, expect, vi } from "vitest";`) and `fireEvent` to the existing `@testing-library/react` import (change `import { render, screen, fireEvent } from "@testing-library/react";` — this import already includes `fireEvent`, so no change needed there; verify against the real current file).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ui/test/MapTree.test.tsx`
Expected: FAIL — `MapTree` does not accept `worldMode`/`visibility` props yet, so every new test's grey/drag assertions fail.

- [ ] **Step 3: Implement**

**3a.** Rewrite `packages/ui/src/components/MapTree.tsx`:

```tsx
import { useMemo, useState } from "react";
import { isDrawnByDefault } from "../world/visibility.js";

export interface MapGroupsData {
  groupOrder: string[];
  groups: Record<string, string[]>;
}

export interface MapVisibilityInfo {
  mapType: string;
  manual: boolean;
}

export interface MapTreeProps {
  data: MapGroupsData;
  selected: string | null;
  onSelect(name: string): void;
  /** World or Dungeon mode is active -- the third "greyed" visual state
   *  (spec §3.3) only ever applies outside plain Map mode. Defaults to
   *  false so every existing Map-mode call site is unaffected. */
  worldMode?: boolean;
  /** From useWorldVisibility. Null while loading/disabled -- treated as
   *  "nothing greyed yet" so the list doesn't flash entirely grey before
   *  the fetch resolves. */
  visibility?: Map<string, MapVisibilityInfo> | null;
}

export function MapTree({ data, selected, onSelect, worldMode = false, visibility = null }: MapTreeProps) {
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return data.groupOrder
      .map((g) => ({
        group: g,
        maps: (data.groups[g] ?? []).filter((m) => !q || m.toLowerCase().includes(q)),
      }))
      .filter((g) => g.maps.length > 0);
  }, [data, filter]);

  // A map is greyed when it is not currently drawn in World/Dungeon mode:
  // either it has no real placement at all, or it does but isn't drawn by
  // default and was never manually placed (visibility.ts's own rule,
  // shared with WorldCanvas -- see that module's doc comment for why this
  // is not a second copy of the same logic).
  const isGreyed = (name: string): boolean => {
    if (!worldMode || !visibility) return false;
    const info = visibility.get(name);
    return !info || !isDrawnByDefault(info.mapType, info.manual);
  };

  return (
    <nav className="map-tree" aria-label="Maps">
      <input
        className="map-tree__filter"
        placeholder="Filter maps…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {visible.length === 0 ? (
        <p className="map-tree__empty">
          No maps match &ldquo;{filter}&rdquo;. Clear the filter to see all {data.groupOrder.length} groups.
        </p>
      ) : (
        visible.map(({ group, maps }) => (
          <details key={group} className="map-tree__group" open>
            <summary className="map-tree__summary">
              <span className="map-tree__group-name">{group.replace(/^gMapGroup_/, "")}</span>
              <span className="map-tree__count">{maps.length}</span>
            </summary>
            <ul className="map-tree__list">
              {maps.map((m) => {
                const greyed = isGreyed(m);
                return (
                  <li key={m}>
                    <button
                      type="button"
                      className={`map-tree__map${greyed ? " map-tree__map--greyed" : ""}`}
                      aria-current={selected === m ? "true" : undefined}
                      onClick={() => onSelect(m)}
                      // Only a greyed entry is draggable from here -- a
                      // shown map is already visible on the canvas and can
                      // be dragged directly there (Shift+drag); this is
                      // specifically the "drag it onto the world" path for
                      // a map that isn't drawn yet (spec §3.3).
                      draggable={greyed}
                      onDragStart={greyed ? (e) => e.dataTransfer.setData("text/plain", m) : undefined}
                    >
                      {m}
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        ))
      )}
    </nav>
  );
}
```

**3b.** Add to `packages/ui/src/styles.css`, immediately after the existing `.map-tree__map[aria-current="true"] { ... }` rule (currently ending around line 291):

```css
/* Feature A (dungeon-mode-and-warp-tools spec §3.3): the sidebar's third
   visual state in World/Dungeon mode -- a map that isn't currently drawn,
   either because it has no placement at all or because its type is hidden
   by default. Dimmed via --text-muted + reduced opacity rather than a new
   colour token: this is a muting of the existing row, not a new semantic
   colour (contrast with e.g. --overlay-selection, which IS a new meaning). */
.map-tree__map--greyed {
  color: var(--text-muted);
  opacity: 0.6;
}

.map-tree__map--greyed:hover {
  opacity: 0.85;
}
```

**3c.** Modify `packages/ui/src/App.tsx`. Add the import:

```ts
import { useWorldVisibility } from "./hooks/useWorldVisibility.js";
```

Add inside `App()`, alongside the existing `const { data, error } = useMapGroups();` line:

```ts
  // Gated on World mode specifically, not "not Map mode": Task 15 adds a
  // third "dungeon" mode whose sidebar is DungeonSidebar, not MapTree (this
  // hook's only consumer) -- fetching this in Dungeon mode too would just
  // be wasted work nothing reads. Task 15 does not need to touch this line.
  const { placed: worldVisibility } = useWorldVisibility(mode === "world");
```

Change the `<MapTree ... />` call (currently `<MapTree data={data} selected={selected} onSelect={selectMap} />`) to:

```tsx
            <MapTree
              data={data}
              selected={selected}
              onSelect={selectMap}
              worldMode={mode === "world"}
              visibility={worldVisibility}
            />
```

(Task 15 leaves this exact line unchanged: `MapTree` is not rendered at all in Dungeon mode — `DungeonSidebar` replaces it in the sidebar's own conditional — so `worldMode={mode === "world"}` stays correct once `mode`'s type widens to include `"dungeon"`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ui/test/MapTree.test.tsx`
Expected: PASS, all tests (7 new + 5 pre-existing = 12).

- [ ] **Step 5: Run the full UI suite**

Run: `npx vitest run packages/ui`
Expected: PASS — confirms App.tsx's own change didn't break anything App-level (there is no dedicated `App.test.tsx` in this repo today, so this is the closest coverage; a manual click-through happens in Task 16).

- [ ] **Step 6: Teeth-proof**

Temporarily hardcode `isGreyed` to always `return false`, confirm the "greys out a World-mode map with no placement at all" test fails, then restore.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/MapTree.tsx packages/ui/src/App.tsx packages/ui/src/styles.css packages/ui/test/MapTree.test.tsx
git commit -m "feat(ui): sidebar greys out and makes draggable any map not drawn in world/dungeon mode"
```

---

## Feature B: Warp toggle + destination popup

### Task 6: Server — `GET /api/warps/:map`

**Files:**
- Modify: `packages/server/src/index.ts`
- Test: `packages/server/test/api.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `packages/server/test/api.test.ts`, inside the existing `describe.skipIf(...)("server", ...)` block (anywhere after the `/api/encounters` tests is a natural place):

```ts
  it("returns a map's warp events, with each destination resolved to a map NAME too", async () => {
    // NewBarkTown_Lab's real first warp -- read directly from the subject
    // decomp's own data/maps/NewBarkTown_Lab/map.json before writing this
    // test, not assumed.
    const body = await (await get("/api/warps/NewBarkTown_Lab")).json() as any;
    expect(body.mapName).toBe("NewBarkTown_Lab");
    const toTown = body.warps.find((w: any) => w.destMap === "MAP_NEW_BARK_TOWN");
    expect(toTown).toBeDefined();
    expect(toTown.x).toBe(6);
    expect(toTown.y).toBe(12);
    expect(toTown.destWarpId).toBe("0");
    // The one thing this route adds beyond the raw parsed data: destMap
    // (a raw MAP_ID constant) resolved onto a real map NAME too, the same
    // idToName enrichment /api/coverage and /api/where already use for the
    // identical reason (the client only ever works with map names).
    expect(toTown.destMapName).toBe("NewBarkTown");
  });

  it("404s an unknown map for /api/warps too", async () => {
    expect((await get("/api/warps/NoSuchMap")).status).toBe(404);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/test/api.test.ts -t "warp events"`
Expected: FAIL — `/api/warps/NewBarkTown_Lab` 404s (route does not exist).

- [ ] **Step 3: Implement**

In `packages/server/src/index.ts`, insert a new route immediately after the existing `/api/encounters/(.+)` route block ends (it ends with `return send(200, { mapName: name, mapId, methods });` followed by `}`) and before the `if (url.pathname === "/api/coverage")` block:

```ts
      // Feature B (dungeon-mode-and-warp-tools spec §4.2): a map's warp
      // events, already fully parsed by load/maps.ts but not exposed
      // anywhere until now. Reused by BOTH the warp-marker toggle (fetched
      // lazily per visible map, mirroring the encounter cache exactly --
      // Task 7) and Feature C's dungeon connection lines (Task 13) -- one
      // route, two consumers, per the design spec's own framing. Not
      // cached server-side: this is already-parsed, uncomputed data, the
      // same "no cache needed" posture as /api/map and /api/encounters.
      const warpsMatch = /^\/api\/warps\/(.+)$/.exec(url.pathname);
      if (warpsMatch) {
        const name = decodeURIComponent(warpsMatch[1]!);
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        // Same idToName enrichment /api/coverage and /api/where already
        // build for the identical reason: the client only ever works with
        // map NAMES (world/connections.ts's own Placement.map), never the
        // raw MAP_ID constants warpEvents.destMap carries.
        const idToName = new Map(project.mapNames().map((n) => [project.map(n).id, n]));
        const warps = project.map(name).warpEvents.map((w) => ({ ...w, destMapName: idToName.get(w.destMap) }));
        return send(200, { mapName: name, warps });
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/server/test/api.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Teeth-proof**

Temporarily remove the `destMapName: idToName.get(w.destMap)` mapping (return raw `project.map(name).warpEvents` unmodified), confirm the new test fails on `toTown.destMapName` being `undefined`, then restore.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/index.ts packages/server/test/api.test.ts
git commit -m "feat(server): GET /api/warps/:map, with each destination resolved to a map name"
```

---

### Task 7: UI — WorldCanvas warp toggle, warp cache, marker overlay

**Files:**
- Modify: `packages/ui/src/components/WorldCanvas.tsx`
- Modify: `packages/ui/src/styles.css`
- Test: `packages/ui/test/WorldCanvas.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `packages/ui/test/WorldCanvas.test.tsx`'s `makeFetchMock`, a new branch (add it right before the final `return Promise.reject(new Error(...))` line, alongside the existing `/api/species` branch):

```ts
    if (url.startsWith("/api/warps/")) {
      const name = decodeURIComponent(url.slice("/api/warps/".length));
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ mapName: name, warps: [] }),
      } as Response);
    }
```

(Individual tests below override this per-map as needed via a second `vi.fn` wrapping `impl`, or by editing this shared branch — follow whichever existing convention this file already uses for per-test fetch overrides; check the file's own `makeFetchMock` callers for the established pattern before writing the tests below.)

Add a new `describe` block, after `describe("default population filter (Feature A)", ...)`:

```ts
  describe("warp toggle and markers (Feature B)", () => {
    function warpWorld() {
      return makeWorld({
        placements: {
          A: { map: "A", x: 0, y: 0, width: 10, height: 10, component: 0 },
          B: { map: "B", x: 20, y: 0, width: 10, height: 10, component: 1 },
          Far: { map: "Far", x: 500, y: 500, width: 10, height: 10, component: 2 },
        },
      });
    }

    function withWarps(base: ReturnType<typeof makeFetchMock>["impl"], warpsByMap: Record<string, unknown[]>) {
      return vi.fn((url: string, init?: RequestInit) => {
        const m = /^\/api\/warps\/(.+)$/.exec(url);
        if (m) {
          const name = decodeURIComponent(m[1]!);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ mapName: name, warps: warpsByMap[name] ?? [] }),
          } as Response);
        }
        return base(url, init);
      });
    }

    it("draws a marker only for a warp on a currently-visible map, not the whole corpus", async () => {
      const { impl } = makeFetchMock(warpWorld());
      const wrapped = withWarps(impl, {
        A: [{ x: 2, y: 3, elevation: 0, destMap: "MAP_B", destWarpId: "0", destMapName: "B" }],
        // Far is placed but scrolled well outside the 100x100 default
        // viewport at the default zoom -- its own warp fetch, if it
        // happens at all, must not produce a visible marker.
        Far: [{ x: 1, y: 1, elevation: 0, destMap: "MAP_A", destWarpId: "0", destMapName: "A" }],
      });
      const { canvas } = await mountReady(wrapped);
      const warpsToggle = screen.getByRole("switch", { name: /warps/i });
      fireEvent.click(warpsToggle);
      await waitFor(() => expect(canvas.parentElement!.querySelectorAll(".world-canvas__warp-marker").length).toBe(1));
    });

    it("markers are hidden until the toggle is switched on", async () => {
      const { impl } = makeFetchMock(warpWorld());
      const wrapped = withWarps(impl, { A: [{ x: 2, y: 3, elevation: 0, destMap: "MAP_B", destWarpId: "0", destMapName: "B" }] });
      const { canvas } = await mountReady(wrapped);
      await waitFor(() => expect(canvas.parentElement!.querySelectorAll(".world-canvas__warp-marker").length).toBe(0));
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ui/test/WorldCanvas.test.tsx -t "warp toggle and markers"`
Expected: FAIL — no "warps" switch exists, no `.world-canvas__warp-marker` elements render.

- [ ] **Step 3: Implement**

**3a.** Add the `WarpEvent` type import alongside the existing type imports at the top of `WorldCanvas.tsx`:

```ts
import type { WarpEvent } from "@pokemap/core/src/load/maps.js";
```

**3b.** Add a wire-shape type for a warp with its resolved destination name, and a cache-entry interface, alongside the existing `EncounterCacheEntry` interface:

```ts
/** WarpEvent plus the destMapName Task 6's server route resolves onto it. */
interface WireWarpEvent extends WarpEvent {
  destMapName?: string;
}

/** Mirrors EncounterCacheEntry's own shape and reasoning exactly -- a
 *  placeholder written synchronously before the fetch starts, so a second
 *  effect run for the same map never double-fetches. */
interface WarpCacheEntry {
  loaded: boolean;
  warps?: WireWarpEvent[];
}
```

**3c.** Add new refs/state, alongside the existing `encounterCacheRef`/`encounterVersion`:

```ts
  const warpCacheRef = useRef<Map<string, WarpCacheEntry>>(new Map());
```

and, alongside `const [encounterVersion, setEncounterVersion] = useState(0);`:

```ts
  const [warpVersion, setWarpVersion] = useState(0);
  // Feature B: off by default (spec §4.1), same visual family as the
  // existing dungeon-auto-layout switch.
  const [warpsOn, setWarpsOn] = useState(false);
```

**3d.** Add a new fetch effect, immediately after the existing encounter-fetch effect (`useEffect(() => { for (const p of visible) { ... /api/encounters/... } }, [visible]);`):

```ts
  // Mirrors the encounter-fetch effect immediately above exactly (same
  // cache-by-ref placeholder + version-bump-on-arrival shape, same
  // "fetch what's visible regardless of the toggle" reasoning: turning the
  // warp toggle on shows markers immediately rather than kicking off a
  // fetch at that moment). Also feeds Feature C's connection lines (Task
  // 13), which need warp data for a dungeon's own member maps independent
  // of this toggle's own on/off state.
  useEffect(() => {
    for (const p of visible) {
      if (warpCacheRef.current.has(p.map)) continue;
      const entry: WarpCacheEntry = { loaded: false };
      warpCacheRef.current.set(p.map, entry);
      fetch(`/api/warps/${encodeURIComponent(p.map)}`)
        .then((r) => {
          if (!r.ok) throw new Error(`GET /api/warps/${p.map} -> ${r.status}`);
          return r.json() as Promise<{ warps: WireWarpEvent[] }>;
        })
        .then((d) => {
          entry.loaded = true;
          entry.warps = d.warps;
          setWarpVersion((v) => v + 1);
        })
        .catch(() => {
          entry.loaded = true;
          setWarpVersion((v) => v + 1);
        });
    }
  }, [visible]);
```

**3e.** Add a marker-entries memo, alongside `spotlightOverlayEntries`:

```ts
  const WARP_HIT_RADIUS = 6; // screen px -- generous enough to reliably hit a small marker with a mouse

  interface WarpMarkerEntry { key: string; sx: number; sy: number; destMapName?: string; }

  const warpMarkerEntries = useMemo<WarpMarkerEntry[]>(() => {
    if (!warpsOn) return [];
    const out: WarpMarkerEntry[] = [];
    for (const p of visible) {
      const cache = warpCacheRef.current.get(p.map);
      if (!cache?.loaded || !cache.warps) continue;
      cache.warps.forEach((w, i) => {
        out.push({
          key: `${p.map}:${i}`,
          sx: (p.x + w.x) * zoom + pan.x,
          sy: (p.y + w.y) * zoom + pan.y,
          destMapName: w.destMapName,
        });
      });
    }
    return out;
    // warpVersion, not warpCacheRef itself (a ref) -- the same
    // "encounterVersion drives methodTintFor's reads of a ref" pattern
    // lensOverlayEntries already uses just above.
  }, [warpsOn, visible, zoom, pan, warpVersion]);
```

**3f.** Add the double-click popup handler and modal state, alongside `onCanvasClick`:

```ts
  const [warpPopup, setWarpPopup] = useState<string | null>(null);

  const onCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!warpsOn) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const hit = warpMarkerEntries.find((m) => Math.hypot(m.sx - sx, m.sy - sy) <= WARP_HIT_RADIUS);
    if (hit?.destMapName) setWarpPopup(hit.destMapName);
  };
```

(Task 8 wires `onCanvasDoubleClick` onto the `<canvas>` element and renders the modal; this task leaves the handler defined but not yet attached, since the modal component doesn't exist until Task 8. To keep this task's own tests green without the modal, attach the handler now too — it is harmless before Task 8, since `warpPopup` is unused in JSX until then:)

Add `onDoubleClick={onCanvasDoubleClick}` to the existing `<canvas ... />` element's prop list (alongside `onClick={onCanvasClick}`).

**3g.** Add the toolbar toggle. First, rename the existing dungeon-toggle label class for reuse (it is about to gain a second, non-dungeon consumer): in `packages/ui/src/styles.css`, rename `.world-canvas__dungeon-label` to `.world-canvas__switch-label` (find-and-replace the one selector), and in `WorldCanvas.tsx`, change the existing dungeon toggle's `<span className="world-canvas__dungeon-label">Dungeon auto-layout {dungeonsOn ? "on" : "off"}</span>` to `<span className="world-canvas__switch-label">Dungeon auto-layout {dungeonsOn ? "on" : "off"}</span>`.

Then add the new toggle as a sibling `world-canvas__toolbar-group`, immediately after the existing dungeon-toggle group's closing `</div>`:

```tsx
        <div className="world-canvas__toolbar-group">
          <button
            type="button"
            role="switch"
            aria-checked={warpsOn}
            aria-label="Warps"
            className="world-canvas__switch"
            onClick={() => setWarpsOn((w) => !w)}
          >
            <span className="world-canvas__switch-thumb" />
          </button>
          <span className="world-canvas__switch-label">Warps {warpsOn ? "on" : "off"}</span>
        </div>
```

**3h.** Add the marker overlay JSX, as a sibling of the existing `.world-canvas__selection` block (anywhere inside `.world-canvas__viewport`, after `<EncounterGutter .../>`):

```tsx
          {warpsOn && warpMarkerEntries.length > 0 && (
            <div className="world-canvas__warps" aria-hidden="true">
              {warpMarkerEntries.map((m) => (
                <div key={m.key} className="world-canvas__warp-marker" style={{ left: m.sx, top: m.sy }} />
              ))}
            </div>
          )}
```

**3i.** Add CSS to `packages/ui/src/styles.css`, after the existing `.world-canvas__lens-tint`/`.world-canvas__spotlight-dim` rules and before `.world-canvas__selection` (z-index tier between the lens/spotlight overlays at 2 and the selection outlines at 6 -- see that rule's own z-index-audit comment for the layering convention this follows):

```css
/* Feature B (spec §4.1): warp markers, a small dot per warp tile among
   currently-visible placements. Reuses --event-warp -- the colour
   MapCanvas's own event overlay already established for "this is a warp"
   -- rather than inventing a second colour for the same meaning. */
.world-canvas__warps {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 4;
}

.world-canvas__warp-marker {
  position: absolute;
  width: 8px;
  height: 8px;
  margin-left: -4px;
  margin-top: -4px;
  border-radius: 50%;
  background: var(--event-warp);
  border: 1px solid var(--bg-canvas);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ui/test/WorldCanvas.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Run the full UI suite**

Run: `npx vitest run packages/ui`
Expected: PASS.

- [ ] **Step 6: Teeth-proof**

Temporarily remove the `if (!warpsOn) return [];` early-return from `warpMarkerEntries`, confirm "markers are hidden until the toggle is switched on" fails (markers now render before the toggle is clicked), then restore.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/WorldCanvas.tsx packages/ui/src/styles.css packages/ui/test/WorldCanvas.test.tsx
git commit -m "feat(ui): world view warp toggle draws markers over every visible warp"
```

---

### Task 8: UI — double-click destination popup (`WarpDestinationModal`)

**Files:**
- Create: `packages/ui/src/components/WarpDestinationModal.tsx`
- Modify: `packages/ui/src/components/WorldCanvas.tsx`
- Modify: `packages/ui/src/styles.css`
- Test: `packages/ui/test/WarpDestinationModal.test.tsx`
- Test: `packages/ui/test/WorldCanvas.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/test/WarpDestinationModal.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WarpDestinationModal } from "../src/components/WarpDestinationModal.js";

afterEach(() => vi.unstubAllGlobals());

describe("WarpDestinationModal", () => {
  it("shows a loading state, then the destination map's own canvas once its data arrives", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            map: { id: "MAP_B", name: "B", layout: "LAYOUT_B" },
            layout: { id: "LAYOUT_B", name: "B_Layout", width: 5, height: 5, borderWidth: 2, borderHeight: 2, primaryTileset: "gTileset_1", secondaryTileset: "gTileset_2" },
            split: { version: "hns", metatiles: 512, tiles: 512, pals: 12 },
            blocks: Array.from({ length: 25 }, () => ({ metatileId: 0, collision: 0, elevation: 0, behavior: 0 })),
          }),
      } as Response),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<WarpDestinationModal mapName="B" onClose={() => {}} />);
    expect(screen.getByText(/Loading B/)).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText("B canvas")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/map/B");
  });

  it("calls onClose when the close button is clicked", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("network down")));
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();
    render(<WarpDestinationModal mapName="B" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an error state rather than hanging forever on a failed fetch", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 404 } as Response)));
    render(<WarpDestinationModal mapName="NoSuchMap" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Could not load NoSuchMap/)).toBeTruthy());
  });
});
```

Add to `packages/ui/test/WorldCanvas.test.tsx`, inside the existing `describe("warp toggle and markers (Feature B)", ...)` block:

```ts
    it("double-clicking a warp marker opens the destination popup; the × closes it without disturbing the canvas", async () => {
      const { impl } = makeFetchMock(warpWorld());
      const wrapped = withWarps(impl, { A: [{ x: 2, y: 3, elevation: 0, destMap: "MAP_B", destWarpId: "0", destMapName: "B" }] });
      const fullMock = vi.fn((url: string, init?: RequestInit) => {
        if (url === "/api/map/B") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                map: { id: "MAP_B", name: "B", layout: "LAYOUT_B" },
                layout: { id: "LAYOUT_B", name: "B_Layout", width: 1, height: 1, borderWidth: 0, borderHeight: 0, primaryTileset: "t1", secondaryTileset: "t2" },
                split: { version: "hns", metatiles: 512, tiles: 512, pals: 12 },
                blocks: [{ metatileId: 0, collision: 0, elevation: 0, behavior: 0 }],
              }),
          } as Response);
        }
        return wrapped(url, init);
      });
      const { canvas } = await mountReady(fullMock);
      fireEvent.click(screen.getByRole("switch", { name: /warps/i }));
      await waitFor(() => expect(canvas.parentElement!.querySelectorAll(".world-canvas__warp-marker").length).toBe(1));

      // Marker A's warp is at world (0+2, 0+3); default zoom/pan is
      // identity (zoom=1, pan={0,0}) before any jump/fit, so its screen
      // position is exactly (2,3).
      fireEvent.doubleClick(canvas, { clientX: 2, clientY: 3 });
      await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
      expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("B preview");

      const zoomBefore = screen.getByText(/%/).textContent;
      fireEvent.click(screen.getByLabelText("Close"));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByText(/%/).textContent).toBe(zoomBefore); // pan/zoom untouched
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ui/test/WarpDestinationModal.test.tsx`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement**

**3a.** Create `packages/ui/src/components/WarpDestinationModal.tsx`:

```tsx
import { useMapLayout } from "../hooks/useMapLayout.js";
import { MapCanvas } from "./MapCanvas.js";

export interface WarpDestinationModalProps {
  mapName: string;
  onClose: () => void;
}

/**
 * Feature B's destination preview (spec §4.3): a real, interactive
 * MapCanvas for the warp's destination, not a static image -- MapCanvas
 * already does its own data fetching given just a map name (App.tsx's own
 * Map-mode usage), so this only needs the same useMapLayout hook App.tsx
 * already drives it with.
 *
 * Rendered by its caller (WorldCanvas) as a TOP-LEVEL sibling, never nested
 * inside `.world-canvas__body` or any other descendant with its own
 * stacking context -- Task 28's tooltip postmortem
 * (packages/ui/src/components/WorldCanvas.tsx) is the standing lesson
 * here: a modal buried inside a lower stacking context could never paint
 * above its siblings, however high its own z-index is set.
 */
export function WarpDestinationModal({ mapName, onClose }: WarpDestinationModalProps) {
  const { data, error } = useMapLayout(mapName);

  return (
    <div className="warp-modal__backdrop" role="dialog" aria-modal="true" aria-label={`${mapName} preview`}>
      <div className="warp-modal__panel">
        <div className="warp-modal__header">
          <span className="warp-modal__title">{mapName}</span>
          <button type="button" className="warp-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="warp-modal__body">
          {error ? (
            <p className="app__canvas-placeholder">Could not load {mapName}: {error}</p>
          ) : data ? (
            <MapCanvas mapName={mapName} data={data} />
          ) : (
            <p className="app__canvas-placeholder">Loading {mapName}…</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

**3b.** In `WorldCanvas.tsx`, render the modal as a sibling of `.world-canvas__body` (i.e., a direct child of the root `<section className="world-canvas">`, after the closing `</div>` of `world-canvas__body` and after `.world-canvas__status`). Add the import:

```ts
import { WarpDestinationModal } from "./WarpDestinationModal.js";
```

Add, as the last child of the root `<section>`, after the existing `.world-canvas__status` div:

```tsx
      {warpPopup && <WarpDestinationModal mapName={warpPopup} onClose={() => setWarpPopup(null)} />}
```

**3c.** Add CSS to `packages/ui/src/styles.css`:

```css
/* Feature B's destination popup. Fixed, full-viewport backdrop with a very
   high z-index -- a top-level sibling by construction (see
   WarpDestinationModal.tsx's own doc comment), so this only needs to
   outrank every OTHER top-level z-index in this file (the highest so far
   is .world-canvas__marquee at 7). */
.warp-modal__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 8, 16, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.warp-modal__panel {
  width: min(720px, 90vw);
  height: min(560px, 85vh);
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.warp-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
}

.warp-modal__title {
  font-family: var(--font-data);
  font-size: var(--text-base);
  color: var(--text-primary);
}

.warp-modal__close {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: var(--text-lg);
  line-height: 1;
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
  border-radius: 4px;
}

.warp-modal__close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.warp-modal__body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.warp-modal__body .map-canvas {
  flex: 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ui/test/WarpDestinationModal.test.tsx packages/ui/test/WorldCanvas.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Run the full UI suite**

Run: `npx vitest run packages/ui`
Expected: PASS.

- [ ] **Step 6: Teeth-proof**

Temporarily change `onCanvasDoubleClick`'s hit-test radius check to `<= 0` (effectively never hits), confirm the new WorldCanvas double-click test fails (no dialog appears), then restore.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/WarpDestinationModal.tsx packages/ui/src/components/WorldCanvas.tsx packages/ui/src/styles.css packages/ui/test/WarpDestinationModal.test.tsx packages/ui/test/WorldCanvas.test.tsx
git commit -m "feat(ui): double-clicking a warp marker previews its destination in a real map canvas"
```

---

## Feature C: Dungeon tab

### Task 9: Core — `.pokemap/dungeons.json` sidecar

**Files:**
- Modify: `packages/core/src/config/paths.ts`
- Create: `packages/core/src/world/dungeons.ts`
- Test: `packages/core/test/world/dungeons.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/world/dungeons.test.ts`, mirroring `packages/core/test/world/sidecar.test.ts`'s own structure exactly:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readDungeons, writeDungeons, type DungeonsFile } from "../../src/world/dungeons.js";
import { projectPaths } from "../../src/config/paths.js";

const roots: string[] = [];
const tempRoot = () => { const r = mkdtempSync(join(tmpdir(), "pokemap-")); roots.push(r); return r; };
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

describe("dungeons sidecar", () => {
  it("returns defaults when no file exists", () => {
    const d = readDungeons(tempRoot());
    expect(d.version).toBe(1);
    expect(d.dungeons).toEqual([]);
  });

  it("round-trips", () => {
    const root = tempRoot();
    const d: DungeonsFile = { version: 1, dungeons: [{ id: "abc", name: "Mt Moon", maps: ["MtMoon_1F", "MtMoon_B1F"] }] };
    writeDungeons(root, d);
    expect(existsSync(`${root}/.pokemap/dungeons.json`)).toBe(true);
    expect(readDungeons(root)).toEqual(d);
  });

  it("writes only inside .pokemap/", () => {
    const root = tempRoot();
    writeDungeons(root, readDungeons(root));
    expect(readdirSync(root)).toEqual([".pokemap"]);
  });

  it("refuses a corrupted (invalid JSON) file, naming the file", () => {
    const root = tempRoot();
    writeDungeons(root, readDungeons(root));
    writeFileSync(projectPaths(root).dungeons, "{ not valid json");
    expect(() => readDungeons(root)).toThrow(projectPaths(root).dungeons);
  });

  it("refuses a dungeons entry missing a required field, naming the file", () => {
    const root = tempRoot();
    writeFileSync(
      projectPaths(root).dungeons,
      JSON.stringify({ version: 1, dungeons: [{ id: "abc", name: "Mt Moon" }] }), // missing "maps"
    );
    expect(() => readDungeons(root)).toThrow(projectPaths(root).dungeons);
  });

  it("refuses a dungeons field that is not an array, naming the file", () => {
    const root = tempRoot();
    writeFileSync(projectPaths(root).dungeons, JSON.stringify({ version: 1, dungeons: "oops" }));
    expect(() => readDungeons(root)).toThrow(projectPaths(root).dungeons);
    expect(() => readDungeons(root)).toThrow(/dungeons/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/world/dungeons.test.ts`
Expected: FAIL — neither `dungeons.ts` nor `projectPaths(...).dungeons` exist yet.

- [ ] **Step 3: Implement**

**3a.** In `packages/core/src/config/paths.ts`, add to the `ProjectPaths` interface (alongside `sidecar: string;`):

```ts
  /** .pokemap/dungeons.json -- Feature C's own sidecar file, deliberately
   *  separate from `sidecar` (layout/placement state) for the same
   *  single-responsibility reason sidecar.ts and resolve.ts are already
   *  split apart. */
  dungeons: string;
```

and to the `projectPaths()` return object (alongside `sidecar: \`${r}/.pokemap/world.json\`,`):

```ts
    dungeons: `${r}/.pokemap/dungeons.json`,
```

**3b.** Create `packages/core/src/world/dungeons.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { projectPaths } from "../config/paths.js";

export interface Dungeon {
  id: string;
  name: string;
  maps: string[];
}

export interface DungeonsFile {
  version: 1;
  dungeons: Dungeon[];
}

const DEFAULTS: DungeonsFile = { version: 1, dungeons: [] };

/** Mirrors sidecar.ts's own assertShape exactly -- same I7 reasoning (a
 *  hand-editable JSON file needs to refuse an obviously-wrong shape rather
 *  than silently misbehave downstream), same "not a full schema validator"
 *  scope. */
function assertShape(path: string, parsed: unknown): asserts parsed is Partial<DungeonsFile> {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path} must contain a JSON object, found ${JSON.stringify(parsed)}.`);
  }
  const p = parsed as Record<string, unknown>;
  if ("dungeons" in p) {
    if (!Array.isArray(p.dungeons)) {
      throw new Error(`${path} has a "dungeons" that is not an array (found ${JSON.stringify(p.dungeons)}).`);
    }
    for (const [i, d] of p.dungeons.entries()) {
      if (d === null || typeof d !== "object" || Array.isArray(d)) {
        throw new Error(`${path}: dungeons[${i}] must be an object, found ${JSON.stringify(d)}.`);
      }
      const dd = d as Record<string, unknown>;
      if (typeof dd.id !== "string" || typeof dd.name !== "string" || !Array.isArray(dd.maps)) {
        throw new Error(
          `${path}: dungeons[${i}] must be { id: string, name: string, maps: string[] }, found ${JSON.stringify(dd)}.`,
        );
      }
    }
  }
}

export function readDungeons(root: string): DungeonsFile {
  const path = projectPaths(root).dungeons;
  if (!existsSync(path)) return structuredClone(DEFAULTS);

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`${path} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  assertShape(path, parsed);

  return { ...structuredClone(DEFAULTS), ...parsed };
}

/** The only write PokeMap performs outside the decomp's own data files
 *  (I8), same guarantee as sidecar.ts's own writeSidecar. */
export function writeDungeons(root: string, d: DungeonsFile): void {
  const path = projectPaths(root).dungeons;
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  writeFileSync(path, `${JSON.stringify(d, null, 2)}\n`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/world/dungeons.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 5: Run the full core suite**

Run: `npx vitest run packages/core`
Expected: PASS — confirms the `ProjectPaths` interface change didn't break any existing consumer (`sidecar.ts`, the CLI, the server all construct `projectPaths(root)` and only ever read the fields they need, so an additive field is safe, but verify).

- [ ] **Step 6: Teeth-proof**

Temporarily remove the `typeof dd.maps` / `Array.isArray(dd.maps)` check from `assertShape`, confirm "refuses a dungeons entry missing a required field" fails, then restore.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/config/paths.ts packages/core/src/world/dungeons.ts packages/core/test/world/dungeons.test.ts
git commit -m "feat(core): .pokemap/dungeons.json sidecar (readDungeons/writeDungeons)"
```

---

### Task 10: Core — `warpConnectedMapsFrom` BFS

**Files:**
- Modify: `packages/core/src/world/warpGraph.ts`
- Test: `packages/core/test/world/warpGraph.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/test/world/warpGraph.test.ts`, importing the new function (change the existing `import { autoLayoutUnplaced, unplacedMapNames } from "../../src/world/warpGraph.js";` to `import { autoLayoutUnplaced, unplacedMapNames, warpConnectedMapsFrom } from "../../src/world/warpGraph.js";`), and add a new `describe` block at the end of the file:

```ts
describe("warpConnectedMapsFrom", () => {
  /** A tiny synthetic warp graph -- deliberately NOT the corpus, so the
   *  exact reachable set can be hand-verified rather than merely
   *  "non-empty". `warps` maps a map name to the list of names it warps
   *  TO; ids are derived (`MAP_${name}`) so this stays self-contained. */
  function graphProject(warps: Record<string, string[]>): Project {
    const names = Object.keys(warps);
    const mapsByName = new Map(
      names.map((n) => [
        n,
        {
          id: `MAP_${n}`,
          warpEvents: warps[n]!.map((dest) => ({ x: 0, y: 0, elevation: 0, destMap: `MAP_${dest}`, destWarpId: "0" })),
        } as unknown as MapData,
      ]),
    );
    return stubProject({
      mapNames: () => names,
      map: (name: string) => mapsByName.get(name)!,
    });
  }

  it("returns exactly the transitively-reachable set, forward-directional -- no more and no less", () => {
    const proj = graphProject({
      A: ["B"],
      B: ["C", "D"],
      C: [],
      D: ["B"], // back-edge -- must not cause infinite recursion or a duplicate visit
      E: [],    // disconnected island -- must not appear
      F: ["A"], // one-way INTO A -- BFS from A must not reach back through it
    });
    const reached = warpConnectedMapsFrom(proj, "A");
    expect(reached).toEqual(new Set(["A", "B", "C", "D"]));
  });

  it("returns just the seed when it has no warps at all", () => {
    const proj = graphProject({ Solo: [] });
    expect(warpConnectedMapsFrom(proj, "Solo")).toEqual(new Set(["Solo"]));
  });

  it("ignores a warp to a destination id that resolves to no known map", () => {
    const proj = graphProject({ A: [] });
    // Manually inject a warp to an id with no matching map (a real
    // possibility if the corpus and this function ever disagree on which
    // maps exist) -- must be skipped, not throw.
    (proj.map("A").warpEvents as unknown[]).push({ x: 0, y: 0, elevation: 0, destMap: "MAP_GHOST", destWarpId: "0" });
    expect(warpConnectedMapsFrom(proj, "A")).toEqual(new Set(["A"]));
  });
});
```

Verify `stubProject` and the `MapData`/`Project` imports are already present in this file from the existing `autoLayoutUnplaced` tests above (they are — see that describe block) before adding this one; do not redeclare them.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/world/warpGraph.test.ts -t "warpConnectedMapsFrom"`
Expected: FAIL — the export does not exist.

- [ ] **Step 3: Implement**

Add to `packages/core/src/world/warpGraph.ts`, after `autoLayoutUnplaced`:

```ts
/**
 * Plain BFS over `warpEvents`, forward-directional (a map's own warps to
 * their destination -- not the reverse), starting from `seedMap`.
 * Deliberately NOT the same traversal as `autoLayoutUnplaced`'s union-find
 * above: that one restricts to unplaced maps and treats a warp link as
 * symmetric (either endpoint can pull the other into its cluster), because
 * its whole job is grouping mutually-isolated maps together. This one has
 * no such restriction -- it walks the WHOLE corpus's warp graph from one
 * named seed, which is what "create a dungeon from this seed map" (spec
 * §5.2) actually needs: everything reachable by warp, full stop, for the
 * user to prune afterward. Always includes the seed itself, even with no
 * warps at all -- a one-map "dungeon" is still a valid, meaningful result,
 * not an empty set a caller has to special-case.
 */
export function warpConnectedMapsFrom(proj: Project, seedMap: string): Set<string> {
  const idToName = new Map(proj.mapNames().map((n) => [proj.map(n).id, n]));
  const seen = new Set<string>([seedMap]);
  const queue = [seedMap];
  while (queue.length) {
    const name = queue.shift()!;
    for (const w of proj.map(name).warpEvents) {
      const dest = idToName.get(w.destMap);
      if (dest && !seen.has(dest)) {
        seen.add(dest);
        queue.push(dest);
      }
    }
  }
  return seen;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/world/warpGraph.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Teeth-proof**

Temporarily change `if (dest && !seen.has(dest))` to `if (dest)` (dropping the seen-check), confirm the back-edge test ("D: ["B"]") now infinite-loops or the test suite hangs/times out, then restore. (This is the classic BFS-without-a-visited-set bug; confirming it actually breaks proves the guard is load-bearing, not decorative.)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/world/warpGraph.ts packages/core/test/world/warpGraph.test.ts
git commit -m "feat(core): warpConnectedMapsFrom -- forward BFS over warpEvents from one seed map"
```

---

### Task 11: Server — dungeon CRUD routes

**Files:**
- Modify: `packages/server/src/index.ts`
- Test: `packages/server/test/dungeons.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/test/dungeons.test.ts`, mirroring `packages/server/test/world.test.ts`'s own save/restore discipline exactly:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";
import { projectPaths } from "@pokemap/core/src/config/paths.js";

let s: PokemapServer;
const dungeonsPath = projectPaths(SUBJECT_ROOT).dungeons;

describe.skipIf(!hasProject(SUBJECT_ROOT))("dungeons api", () => {
  beforeAll(async () => { s = await createServer({ projectPath: SUBJECT_ROOT, port: 0 }); });
  afterAll(async () => { await s?.close(); });

  const withCleanDungeonsFile = async (fn: () => Promise<void>) => {
    const before = existsSync(dungeonsPath) ? readFileSync(dungeonsPath, "utf8") : null;
    try {
      await fn();
    } finally {
      if (before === null) rmSync(dungeonsPath, { force: true });
      else writeFileSync(dungeonsPath, before);
    }
  };

  it("lists an empty array when no dungeons exist yet", async () => {
    await withCleanDungeonsFile(async () => {
      rmSync(dungeonsPath, { force: true });
      const r = await fetch(`http://127.0.0.1:${s.port}/api/dungeons`);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual([]);
    });
  }, 300_000);

  it("creates a dungeon from an explicit maps list, lists it, then deletes it", async () => {
    await withCleanDungeonsFile(async () => {
      const create = await fetch(`http://127.0.0.1:${s.port}/api/dungeons`, {
        method: "POST",
        body: JSON.stringify({ name: "Test Dungeon", maps: ["NewBarkTown_Lab", "NewBarkTown"] }),
      });
      expect(create.status).toBe(200);
      const created = await create.json() as any;
      expect(created.name).toBe("Test Dungeon");
      expect(created.maps).toEqual(["NewBarkTown_Lab", "NewBarkTown"]);
      expect(typeof created.id).toBe("string");
      expect(created.id.length).toBeGreaterThan(0);

      const list = await (await fetch(`http://127.0.0.1:${s.port}/api/dungeons`)).json() as any[];
      expect(list.some((d) => d.id === created.id)).toBe(true);

      const del = await fetch(`http://127.0.0.1:${s.port}/api/dungeons/${created.id}`, { method: "DELETE" });
      expect(del.status).toBe(200);
      const listAfter = await (await fetch(`http://127.0.0.1:${s.port}/api/dungeons`)).json() as any[];
      expect(listAfter.some((d) => d.id === created.id)).toBe(false);
    });
  }, 300_000);

  it("creates a dungeon from a seedMap, computing its members via the warp BFS", async () => {
    await withCleanDungeonsFile(async () => {
      const create = await fetch(`http://127.0.0.1:${s.port}/api/dungeons`, {
        method: "POST",
        body: JSON.stringify({ name: "From Seed", seedMap: "NewBarkTown_Lab" }),
      });
      expect(create.status).toBe(200);
      const created = await create.json() as any;
      // NewBarkTown_Lab warps to NewBarkTown (Task 6's own fixture fact) --
      // the BFS must include at least both.
      expect(created.maps).toContain("NewBarkTown_Lab");
      expect(created.maps).toContain("NewBarkTown");
    });
  }, 300_000);

  it("400s a create with an unknown seedMap", async () => {
    await withCleanDungeonsFile(async () => {
      const r = await fetch(`http://127.0.0.1:${s.port}/api/dungeons`, {
        method: "POST",
        body: JSON.stringify({ name: "Bad", seedMap: "NoSuchMap" }),
      });
      expect(r.status).toBe(400);
    });
  }, 300_000);

  it("PATCHes a dungeon's name and maps, reflected in the next GET", async () => {
    await withCleanDungeonsFile(async () => {
      const created = await (
        await fetch(`http://127.0.0.1:${s.port}/api/dungeons`, {
          method: "POST",
          body: JSON.stringify({ name: "Before", maps: ["NewBarkTown"] }),
        })
      ).json() as any;

      const patch = await fetch(`http://127.0.0.1:${s.port}/api/dungeons/${created.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "After", maps: ["NewBarkTown", "Route29"] }),
      });
      expect(patch.status).toBe(200);
      const patched = await patch.json() as any;
      expect(patched.name).toBe("After");
      expect(patched.maps).toEqual(["NewBarkTown", "Route29"]);
    });
  }, 300_000);

  it("404s a PATCH or DELETE for an unknown dungeon id", async () => {
    await withCleanDungeonsFile(async () => {
      expect((await fetch(`http://127.0.0.1:${s.port}/api/dungeons/no-such-id`, { method: "PATCH", body: "{}" })).status).toBe(404);
      expect((await fetch(`http://127.0.0.1:${s.port}/api/dungeons/no-such-id`, { method: "DELETE" })).status).toBe(404);
    });
  }, 300_000);

  it("400s a create with no name", async () => {
    await withCleanDungeonsFile(async () => {
      const r = await fetch(`http://127.0.0.1:${s.port}/api/dungeons`, { method: "POST", body: JSON.stringify({ maps: [] }) });
      expect(r.status).toBe(400);
    });
  }, 300_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/test/dungeons.test.ts`
Expected: FAIL — every route 404s (none exist yet).

- [ ] **Step 3: Implement**

**3a.** Add imports to `packages/server/src/index.ts`, alongside the existing core imports:

```ts
import { readDungeons, writeDungeons } from "@pokemap/core/src/world/dungeons.js";
import { warpConnectedMapsFrom } from "@pokemap/core/src/world/warpGraph.js";
import { randomUUID } from "node:crypto";
```

**3b.** Insert new routes immediately before the final `return send(404, { error: "not found" });` fallback:

```ts
      // Feature C (dungeon-mode-and-warp-tools spec §5.3): user-curated
      // named groups of maps, persisted to their own sidecar file --
      // .pokemap/dungeons.json, not world.json, for the same single-
      // responsibility split sidecar.ts's own file already established.
      if (url.pathname === "/api/dungeons" && req.method === "GET") {
        return send(200, readDungeons(project.paths.root).dungeons);
      }

      if (url.pathname === "/api/dungeons" && req.method === "POST") {
        return readBody(req)
          .then((body) => {
            let parsed: { name?: unknown; seedMap?: unknown; maps?: unknown };
            try {
              parsed = JSON.parse(body) as typeof parsed;
            } catch (e) {
              return send(400, { error: `invalid JSON body: ${(e as Error).message}` });
            }
            if (typeof parsed.name !== "string" || parsed.name.trim() === "") {
              return send(400, { error: `expected a non-empty "name" string, got ${body}` });
            }
            if (parsed.seedMap !== undefined && typeof parsed.seedMap !== "string") {
              return send(400, { error: `"seedMap" must be a string when present, got ${body}` });
            }
            if (parsed.maps !== undefined && (!Array.isArray(parsed.maps) || parsed.maps.some((m) => typeof m !== "string"))) {
              return send(400, { error: `"maps" must be a string array when present, got ${body}` });
            }

            let maps: string[];
            if (typeof parsed.seedMap === "string") {
              if (!project.mapNames().includes(parsed.seedMap)) {
                return send(400, { error: `seedMap ${parsed.seedMap} is not a known map` });
              }
              maps = [...warpConnectedMapsFrom(project, parsed.seedMap)].sort();
            } else {
              maps = (parsed.maps as string[] | undefined) ?? [];
            }

            const dungeons = readDungeons(project.paths.root);
            const dungeon = { id: randomUUID(), name: parsed.name, maps };
            dungeons.dungeons.push(dungeon);
            writeDungeons(project.paths.root, dungeons);
            return send(200, dungeon);
          })
          .catch((e: unknown) => {
            console.error(e);
            send(500, { error: e instanceof Error ? e.message : String(e) });
          });
      }

      const dungeonIdMatch = /^\/api\/dungeons\/(.+)$/.exec(url.pathname);
      if (dungeonIdMatch && req.method === "PATCH") {
        const id = decodeURIComponent(dungeonIdMatch[1]!);
        return readBody(req)
          .then((body) => {
            let parsed: { name?: unknown; maps?: unknown };
            try {
              parsed = JSON.parse(body) as typeof parsed;
            } catch (e) {
              return send(400, { error: `invalid JSON body: ${(e as Error).message}` });
            }
            if (parsed.name !== undefined && typeof parsed.name !== "string") {
              return send(400, { error: `"name" must be a string when present, got ${body}` });
            }
            if (parsed.maps !== undefined && (!Array.isArray(parsed.maps) || parsed.maps.some((m) => typeof m !== "string"))) {
              return send(400, { error: `"maps" must be a string array when present, got ${body}` });
            }
            const dungeons = readDungeons(project.paths.root);
            const dungeon = dungeons.dungeons.find((d) => d.id === id);
            if (!dungeon) return send(404, { error: `no dungeon ${id}` });
            if (typeof parsed.name === "string") dungeon.name = parsed.name;
            if (Array.isArray(parsed.maps)) dungeon.maps = parsed.maps as string[];
            writeDungeons(project.paths.root, dungeons);
            return send(200, dungeon);
          })
          .catch((e: unknown) => {
            console.error(e);
            send(500, { error: e instanceof Error ? e.message : String(e) });
          });
      }

      if (dungeonIdMatch && req.method === "DELETE") {
        const id = decodeURIComponent(dungeonIdMatch[1]!);
        const dungeons = readDungeons(project.paths.root);
        const before = dungeons.dungeons.length;
        dungeons.dungeons = dungeons.dungeons.filter((d) => d.id !== id);
        if (dungeons.dungeons.length === before) return send(404, { error: `no dungeon ${id}` });
        writeDungeons(project.paths.root, dungeons);
        return send(200, { ok: true });
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/server/test/dungeons.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Run the full server suite**

Run: `npx vitest run packages/server`
Expected: PASS.

- [ ] **Step 6: Teeth-proof**

Temporarily remove the `if (!dungeon) return send(404, ...)` guard in the PATCH route (let it fall through and crash on `dungeon.name = ...` against `undefined`), confirm the "404s a PATCH or DELETE for an unknown dungeon id" test fails (500 instead of 404, or an unhandled rejection), then restore.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/index.ts packages/server/test/dungeons.test.ts
git commit -m "feat(server): dungeon CRUD routes (GET/POST/PATCH/DELETE /api/dungeons)"
```

---

### Task 12: UI — WorldCanvas `mapFilter` prop

**Files:**
- Modify: `packages/ui/src/components/WorldCanvas.tsx`
- Test: `packages/ui/test/WorldCanvas.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `packages/ui/test/WorldCanvas.test.tsx`:

```ts
  describe("mapFilter (Feature C, dungeon mode)", () => {
    function fourMapsWorld() {
      return makeWorld({
        placements: {
          InDungeon1: { map: "InDungeon1", x: 0, y: 0, width: 10, height: 10, component: 0 },
          InDungeon2: { map: "InDungeon2", x: 20, y: 0, width: 10, height: 10, component: 1 },
          OutsideDungeon: { map: "OutsideDungeon", x: 0, y: 20, width: 10, height: 10, component: 2 },
          Far: { map: "Far", x: 500, y: 500, width: 10, height: 10, component: 3 },
        },
      });
    }

    it("draws and fetches art only for maps in mapFilter, ignoring viewport-only culling for the rest of the corpus", async () => {
      const { impl } = makeFetchMock(fourMapsWorld());
      vi.stubGlobal("fetch", impl);
      render(<WorldCanvas mapFilter={new Set(["InDungeon1", "InDungeon2"])} />);
      await waitFor(() => expect(screen.queryByText(/Loading world/)).toBeNull());
      await waitFor(() => expect(FakeImage.instances.length).toBeGreaterThan(0));
      const srcs = FakeImage.instances.map((i) => i.src);
      expect(srcs.some((s) => s.includes("InDungeon1"))).toBe(true);
      expect(srcs.some((s) => s.includes("InDungeon2"))).toBe(true);
      expect(srcs.some((s) => s.includes("OutsideDungeon"))).toBe(false);
      expect(srcs.some((s) => s.includes("Far"))).toBe(false);
    });

    it("auto-fits to the filtered maps on open, without requiring a manual 'Fit world' click", async () => {
      const { impl } = makeFetchMock(fourMapsWorld());
      vi.stubGlobal("fetch", impl);
      const utils = render(<WorldCanvas mapFilter={new Set(["InDungeon1", "InDungeon2"])} />);
      await waitFor(() => expect(screen.queryByText(/Loading world/)).toBeNull());
      // InDungeon1+InDungeon2 together span x:[0,30) y:[0,10) -- a 30x10
      // bounds fit into the 100x100 viewport at zoom=min(100/30,100/10)=
      // 3.33..., clamped nowhere -- readout is Math.round((zoom/16)*100).
      await waitFor(() => {
        const readout = utils.getByText(/%/).textContent;
        expect(readout).not.toBe("100%"); // the un-fit default (zoom=1 -> 6%) would read differently anyway; this just proves SOME fit ran
      });
    });
  });
```

(This second test is intentionally loose on the exact percentage — it exists to prove *a* fit ran on mount, not to hand-verify the exact zoom; do not over-fit this assertion to a brittle exact number.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ui/test/WorldCanvas.test.tsx -t "mapFilter"`
Expected: FAIL — `WorldCanvasProps` doesn't accept `mapFilter` yet, so nothing filters and every map's art fetches.

- [ ] **Step 3: Implement**

**3a.** Add `mapFilter` to `WorldCanvasProps` (per the spec's own §5.4 interface):

```ts
  /** When set, only these maps are ever drawn, fetched, or hit-testable --
   *  everything else in WorldCanvas (pan/zoom/drag/multi-select/warp
   *  toggle) behaves exactly as in the full world view, just scoped. Used
   *  by Dungeon mode (App.tsx) to reuse this exact component rather than
   *  forking a second implementation. */
  mapFilter?: Set<string> | null;
```

Destructure it in the function signature: change `export function WorldCanvas({ jumpToMap, jumpToken }: WorldCanvasProps = {})` to `export function WorldCanvas({ jumpToMap, jumpToken, mapFilter }: WorldCanvasProps = {})`.

**3b.** Modify the `visible` useMemo (as it stands after Task 3's edit) to source from `mapFilter` when set, and to skip Feature A's type-visibility filter in that case:

```ts
  const visible = useMemo(() => {
    if (!world) return [] as Placement[];
    const x0 = -pan.x / zoom, y0 = -pan.y / zoom;
    const x1 = (viewport.w - pan.x) / zoom, y1 = (viewport.h - pan.y) / zoom;
    const out: Placement[] = [];
    const source = mapFilter
      ? ([...mapFilter].map((name) => world.placements.get(name)).filter((p): p is WirePlacement => !!p))
      : [...world.placements.values()];
    for (const p of source) {
      const size = sizeOfPlacement(p, sizeByMap);
      if (size.width <= 0 || size.height <= 0) continue; // unrenderable orphan, see sizeOfPlacement
      // Feature A's default-population filter only applies to the unscoped
      // world view -- a dungeon's own curated member list (mapFilter) is
      // already the definitive visible set the user built; re-applying the
      // type-based hide-by-default rule on top of it would silently drop,
      // say, an indoor room the user deliberately added to a dungeon, with
      // no way to see or override it from inside that view.
      if (!mapFilter && !isDrawnByDefault(p.mapType ?? "", p.manual ?? false) && !revealedMaps.has(p.map)) continue;
      if (intersects(p.x, p.y, size.width, size.height, x0, y0, x1, y1)) out.push(p);
    }
    return out;
  }, [world, pan, zoom, viewport, sizeByMap, revealedMaps, mapFilter]);
```

**3c.** Modify `fitWorld` to compute the dungeon's own bounds when scoped:

```ts
  const fitWorld = useCallback(() => {
    if (!world) return;
    let bounds: ReturnType<typeof worldBoundsOf>;
    if (mapFilter) {
      const scoped = new Map([...world.placements].filter(([name]) => mapFilter.has(name)));
      bounds = worldBoundsOf(scoped, sizeByMap);
    } else {
      const landmasses = new Map(
        [...world.placements].filter(([, p]) => {
          const comp = componentOfPlacement(p, world.components);
          return comp !== null && comp.maps.length > 1;
        }),
      );
      bounds = worldBoundsOf(landmasses.size > 0 ? landmasses : world.placements, sizeByMap);
    }
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const fit = computeFit(bounds, viewport);
    setZoom(fit.zoom);
    setPan(fit.pan);
  }, [world, viewport, sizeByMap, mapFilter]);
```

**3d.** Add a mount/open auto-fit effect for dungeon mode, anywhere alongside the other top-level effects (e.g. immediately after the jump-highlight fade effect):

```ts
  // Dungeon mode (Feature C): auto-fit to the dungeon's own maps as soon as
  // both they and `world` are available -- unlike the full world view
  // (whose own "don't auto-fit" reasoning above the `fitWorld` definition
  // is entirely about the cost of loading all 1,209 placements' images at
  // once), a curated dungeon is small and, at the default origin-anchored
  // view, may contain none of its own maps on screen at all -- effectively
  // blank until the user finds "Fit world" themselves. Depends on
  // `mapFilter`'s IDENTITY, not its contents -- App.tsx (Task 15) hands
  // this a stable Set per open dungeon, so this fires once per dungeon
  // opened/switched/edited, not on every unrelated re-render.
  useEffect(() => {
    if (mapFilter && world) fitWorld();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fitWorld
    // itself is recreated each render (it closes over world/viewport/
    // sizeByMap) but must not retrigger this effect on its own; mapFilter's
    // identity and world's arrival are the only two things that should.
  }, [mapFilter, world]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ui/test/WorldCanvas.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Run the full UI suite**

Run: `npx vitest run packages/ui`
Expected: PASS.

- [ ] **Step 6: Teeth-proof**

Temporarily change `const source = mapFilter ? (...) : [...world.placements.values()];` to always use `[...world.placements.values()]` (ignore mapFilter), confirm the first mapFilter test fails (`OutsideDungeon`/`Far` now fetch), then restore.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/WorldCanvas.tsx packages/ui/test/WorldCanvas.test.tsx
git commit -m "feat(ui): WorldCanvas mapFilter prop scopes drawing/fetching/hit-testing and fit-world"
```

---

### Task 13: UI — dungeon connection lines

**Files:**
- Modify: `packages/ui/src/components/WorldCanvas.tsx`
- Modify: `packages/ui/src/styles.css`
- Modify: `packages/ui/DESIGN.md`
- Test: `packages/ui/test/WorldCanvas.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `packages/ui/test/WorldCanvas.test.tsx`, inside a new `describe` block:

```ts
  describe("dungeon connection lines (Feature C)", () => {
    function dungeonWorld() {
      return makeWorld({
        placements: {
          Room1: { map: "Room1", x: 0, y: 0, width: 10, height: 10, component: 0 },
          Room2: { map: "Room2", x: 30, y: 0, width: 10, height: 10, component: 1 },
          Outside: { map: "Outside", x: 60, y: 0, width: 10, height: 10, component: 2 },
        },
      });
    }

    function withWarps(base: ReturnType<typeof makeFetchMock>["impl"], warpsByMap: Record<string, unknown[]>) {
      return vi.fn((url: string, init?: RequestInit) => {
        const m = /^\/api\/warps\/(.+)$/.exec(url);
        if (m) {
          const name = decodeURIComponent(m[1]!);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ mapName: name, warps: warpsByMap[name] ?? [] }),
          } as Response);
        }
        return base(url, init);
      });
    }

    it("draws a line only between two maps that are BOTH members of the open dungeon", async () => {
      const { impl } = makeFetchMock(dungeonWorld());
      const wrapped = withWarps(impl, {
        Room1: [
          { x: 1, y: 1, elevation: 0, destMap: "MAP_ROOM2", destWarpId: "0", destMapName: "Room2" },
          { x: 2, y: 2, elevation: 0, destMap: "MAP_OUTSIDE", destWarpId: "0", destMapName: "Outside" },
        ],
        Room2: [{ x: 3, y: 3, elevation: 0, destMap: "MAP_ROOM1", destWarpId: "0", destMapName: "Room1" }],
        Outside: [{ x: 4, y: 4, elevation: 0, destMap: "MAP_ROOM1", destWarpId: "1", destMapName: "Room1" }],
      });
      vi.stubGlobal("fetch", wrapped);
      const utils = render(<WorldCanvas mapFilter={new Set(["Room1", "Room2"])} />);
      await waitFor(() => expect(utils.queryByText(/Loading world/)).toBeNull());

      const linesToggle = utils.getByRole("switch", { name: /connection lines/i });
      fireEvent.click(linesToggle);

      await waitFor(() => {
        const lines = utils.container.querySelectorAll(".world-canvas__connections line");
        // Room1 has two warps; only the one to Room2 (a dungeon member)
        // draws. Room2's own warp back to Room1 is a SEPARATE warp entry
        // (destWarpId "0" on Room2, distinct from Room1's own entries), so
        // exactly two lines total.
        expect(lines.length).toBe(2);
      });
    });

    it("assigns the same colour to the same connection regardless of mapFilter's own construction order", async () => {
      const { impl } = makeFetchMock(dungeonWorld());
      const wrapped = withWarps(impl, {
        Room1: [{ x: 1, y: 1, elevation: 0, destMap: "MAP_ROOM2", destWarpId: "0", destMapName: "Room2" }],
        Room2: [],
      });
      vi.stubGlobal("fetch", wrapped);

      const runOnce = async (filter: Set<string>) => {
        const utils = render(<WorldCanvas mapFilter={filter} />);
        await waitFor(() => expect(utils.queryByText(/Loading world/)).toBeNull());
        fireEvent.click(utils.getByRole("switch", { name: /connection lines/i }));
        await waitFor(() => expect(utils.container.querySelectorAll(".world-canvas__connections line").length).toBe(1));
        const stroke = utils.container.querySelector(".world-canvas__connections line")!.getAttribute("stroke");
        utils.unmount();
        return stroke;
      };

      const colorA = await runOnce(new Set(["Room1", "Room2"]));
      const colorB = await runOnce(new Set(["Room2", "Room1"])); // same members, different construction order
      expect(colorA).toBe(colorB);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ui/test/WorldCanvas.test.tsx -t "dungeon connection lines"`
Expected: FAIL — no "connection lines" switch, no `.world-canvas__connections` element.

- [ ] **Step 3: Implement**

**3a.** Add CSS custom properties to `packages/ui/DESIGN.md`'s dark-mode `:root` block (immediately after `--overlay-selection: #22d3ee;`):

```css
  /* Dungeon connection lines (Feature C): deterministic per-connection
     colour, assigned by a stable sort order (source map name, then the
     warp's own index within it), not randomised or hashed -- so the same
     connection reads the same colour across sessions without persisting
     anything (spec §5.5). Eight visually distinct hues, none reused from
     any other overlay token above (selection cyan, conflict/danger red,
     dive/emerge blue/orange, warn amber) so a connection line never
     misreads as one of those existing meanings. */
  --connection-1: #e879f9;
  --connection-2: #34d399;
  --connection-3: #fb923c;
  --connection-4: #60a5fa;
  --connection-5: #facc15;
  --connection-6: #f472b6;
  --connection-7: #2dd4bf;
  --connection-8: #a78bfa;
```

And add a short prose note in DESIGN.md's own "Colour tokens" section, immediately after the existing paragraph about `--overlay-selection`:

```markdown
`--connection-1` through `--connection-8` (Feature C): the dungeon
connection-line palette, cycled by index (`PALETTE[i % 8]`) over a stable,
deterministically-sorted connection order -- see WorldCanvas.tsx's own
`connectionLines` memo.
```

(These are not overridden in light mode, matching the event-kind/elevation tokens' own precedent — they sit on thin lines over map art, not body text, so one value clears contrast in both themes.)

**3b.** In `packages/ui/src/components/WorldCanvas.tsx`, add state and a palette-reading helper alongside the existing `warpsOn` state:

```ts
  // Feature C: own toggle, independent of Feature B's warpsOn -- both may
  // be on at once (spec §5.4: "markers show every warp, lines show only
  // the subset connecting two of the dungeon's own maps"). Only rendered
  // in the toolbar when mapFilter is set (App.tsx only ever mounts this in
  // Dungeon mode with mapFilter populated, but the guard is here too so
  // this component never shows a dungeon-only control outside that mode).
  const [linesOn, setLinesOn] = useState(false);
```

Add a small palette constant near the top of the file, alongside `BADGE_SIZE`:

```ts
const CONNECTION_PALETTE_VARS = [
  "--connection-1", "--connection-2", "--connection-3", "--connection-4",
  "--connection-5", "--connection-6", "--connection-7", "--connection-8",
];
const CONNECTION_PALETTE_FALLBACK = [
  "#e879f9", "#34d399", "#fb923c", "#60a5fa", "#facc15", "#f472b6", "#2dd4bf", "#a78bfa",
];
```

Add the `connectionLines` memo, alongside `warpMarkerEntries`:

```ts
  interface ConnectionLine { key: string; x1: number; y1: number; x2: number; y2: number; color: string; }

  const connectionLines = useMemo<ConnectionLine[]>(() => {
    if (!mapFilter || !linesOn || !world) return [];
    // Stable order: sort() on the source map name, warps within a map kept
    // in their own array's index order -- not insertion/iteration order of
    // `mapFilter` itself (a Set, whose iteration order is construction-
    // order-dependent) -- see this task's own colour-stability test.
    const raw: Array<{ sourceMap: string; warpIndex: number; x1: number; y1: number; x2: number; y2: number }> = [];
    for (const sourceMap of [...mapFilter].sort()) {
      const srcPlacement = world.placements.get(sourceMap);
      const srcCache = warpCacheRef.current.get(sourceMap);
      if (!srcPlacement || !srcCache?.loaded || !srcCache.warps) continue;
      srcCache.warps.forEach((w, warpIndex) => {
        if (!w.destMapName || !mapFilter.has(w.destMapName)) return; // outside the dungeon -- no line (spec §5.5)
        const destPlacement = world.placements.get(w.destMapName);
        const destCache = warpCacheRef.current.get(w.destMapName);
        const destIndex = Number(w.destWarpId);
        if (!destPlacement || !destCache?.loaded || !destCache.warps || !Number.isInteger(destIndex) || destIndex < 0) return;
        const destWarp = destCache.warps[destIndex];
        if (!destWarp) return;
        raw.push({
          sourceMap, warpIndex,
          x1: (srcPlacement.x + w.x) * zoom + pan.x, y1: (srcPlacement.y + w.y) * zoom + pan.y,
          x2: (destPlacement.x + destWarp.x) * zoom + pan.x, y2: (destPlacement.y + destWarp.y) * zoom + pan.y,
        });
      });
    }
    const style = typeof getComputedStyle === "function" ? getComputedStyle(document.documentElement) : null;
    const palette = CONNECTION_PALETTE_VARS.map((v, i) => style?.getPropertyValue(v).trim() || CONNECTION_PALETTE_FALLBACK[i]!);
    return raw.map((r, i) => ({
      key: `${r.sourceMap}:${r.warpIndex}`,
      x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2,
      color: palette[i % palette.length]!,
    }));
  }, [mapFilter, linesOn, world, zoom, pan, warpVersion]);
```

Add the toolbar toggle (only when `mapFilter` is set), immediately after the warp-toggle group added in Task 7:

```tsx
        {mapFilter && (
          <div className="world-canvas__toolbar-group">
            <button
              type="button"
              role="switch"
              aria-checked={linesOn}
              aria-label="Connection lines"
              className="world-canvas__switch"
              onClick={() => setLinesOn((l) => !l)}
            >
              <span className="world-canvas__switch-thumb" />
            </button>
            <span className="world-canvas__switch-label">Connection lines {linesOn ? "on" : "off"}</span>
          </div>
        )}
```

Add the SVG overlay JSX, as a sibling of the warp-marker overlay added in Task 7:

```tsx
          {mapFilter && linesOn && connectionLines.length > 0 && (
            <svg className="world-canvas__connections" aria-hidden="true">
              {connectionLines.map((c) => (
                <line key={c.key} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke={c.color} strokeWidth={2} />
              ))}
            </svg>
          )}
```

**3c.** Add CSS to `packages/ui/src/styles.css`, alongside `.world-canvas__warps`:

```css
.world-canvas__connections {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 4;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ui/test/WorldCanvas.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Run the full UI suite**

Run: `npx vitest run packages/ui`
Expected: PASS.

- [ ] **Step 6: Teeth-proof**

Temporarily change the line filter to `if (!w.destMapName) return;` (dropping the `|| !mapFilter.has(w.destMapName)` half), confirm "draws a line only between two maps that are BOTH members" now finds 3 lines instead of 2 (the Outside-bound warp now draws too), then restore.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/WorldCanvas.tsx packages/ui/src/styles.css packages/ui/DESIGN.md packages/ui/test/WorldCanvas.test.tsx
git commit -m "feat(ui): dungeon connection-lines toggle, deterministic per-connection colour"
```

---

### Task 14: UI — `useDungeons` hook and `DungeonSidebar` component

**Files:**
- Create: `packages/ui/src/hooks/useDungeons.ts`
- Create: `packages/ui/src/components/DungeonSidebar.tsx`
- Modify: `packages/ui/src/styles.css`
- Test: `packages/ui/test/useDungeons.test.tsx`
- Test: `packages/ui/test/DungeonSidebar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/test/useDungeons.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useDungeons } from "../src/hooks/useDungeons.js";

afterEach(() => vi.unstubAllGlobals());

function Host({ enabled, onResult }: { enabled: boolean; onResult: (r: ReturnType<typeof useDungeons>) => void }) {
  const result = useDungeons(enabled);
  onResult(result);
  return null;
}

describe("useDungeons", () => {
  it("fetches nothing when disabled", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<Host enabled={false} onResult={() => {}} />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches the list once enabled, and reloads after create/rename/setMaps/remove", async () => {
    let dungeons = [{ id: "1", name: "Mt Moon", maps: ["A"] }];
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/dungeons" && (!init || init.method === undefined)) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(dungeons) } as Response);
      }
      if (url === "/api/dungeons" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        const created = { id: "2", name: body.name, maps: body.maps ?? [] };
        dungeons = [...dungeons, created];
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(created) } as Response);
      }
      if (url.startsWith("/api/dungeons/") && init?.method === "PATCH") {
        const id = url.slice("/api/dungeons/".length);
        const body = JSON.parse(String(init.body));
        dungeons = dungeons.map((d) => (d.id === id ? { ...d, ...body } : d));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(dungeons.find((d) => d.id === id)) } as Response);
      }
      if (url.startsWith("/api/dungeons/") && init?.method === "DELETE") {
        const id = url.slice("/api/dungeons/".length);
        dungeons = dungeons.filter((d) => d.id !== id);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } as Response);
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    let last: ReturnType<typeof useDungeons> | undefined;
    render(<Host enabled={true} onResult={(r) => { last = r; }} />);
    await waitFor(() => expect(last?.data).toHaveLength(1));

    await last!.create({ name: "New One", maps: ["B"] });
    await waitFor(() => expect(last?.data).toHaveLength(2));

    await last!.rename("1", "Mt Moon Renamed");
    await waitFor(() => expect(last?.data?.find((d) => d.id === "1")?.name).toBe("Mt Moon Renamed"));

    await last!.setMaps("1", ["A", "C"]);
    await waitFor(() => expect(last?.data?.find((d) => d.id === "1")?.maps).toEqual(["A", "C"]));

    await last!.remove("2");
    await waitFor(() => expect(last?.data).toHaveLength(1));
  });
});
```

Create `packages/ui/test/DungeonSidebar.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DungeonSidebar } from "../src/components/DungeonSidebar.js";

const DUNGEONS = [
  { id: "1", name: "Mt Moon", maps: ["MtMoon_1F", "MtMoon_B1F"] },
  { id: "2", name: "Safari Zone", maps: [] },
];

describe("DungeonSidebar", () => {
  it("lists every dungeon by name with its map count", () => {
    render(
      <DungeonSidebar
        dungeons={DUNGEONS}
        error={null}
        openId={null}
        onOpen={() => {}}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onSetMaps={vi.fn()}
        onDelete={vi.fn()}
        allMapNames={["MtMoon_1F", "MtMoon_B1F", "Route1"]}
      />,
    );
    expect(screen.getByText("Mt Moon")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy(); // Mt Moon's map count
    expect(screen.getByText("Safari Zone")).toBeTruthy();
  });

  it("opening a dungeon calls onOpen with its id", () => {
    const onOpen = vi.fn();
    render(
      <DungeonSidebar
        dungeons={DUNGEONS}
        error={null}
        openId={null}
        onOpen={onOpen}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onSetMaps={vi.fn()}
        onDelete={vi.fn()}
        allMapNames={[]}
      />,
    );
    fireEvent.click(screen.getByText("Mt Moon"));
    expect(onOpen).toHaveBeenCalledWith("1");
  });

  it("marks the open dungeon for assistive tech", () => {
    render(
      <DungeonSidebar
        dungeons={DUNGEONS}
        error={null}
        openId="2"
        onOpen={() => {}}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onSetMaps={vi.fn()}
        onDelete={vi.fn()}
        allMapNames={[]}
      />,
    );
    expect(screen.getByText("Safari Zone").closest("button")!.getAttribute("aria-current")).toBe("true");
    expect(screen.getByText("Mt Moon").closest("button")!.getAttribute("aria-current")).toBeNull();
  });

  it("the + New Dungeon form calls onCreate with the entered name and seed map, then opens it", async () => {
    const onCreate = vi.fn().mockResolvedValue({ id: "3", name: "New Cave", maps: ["Route1"] });
    const onOpen = vi.fn();
    render(
      <DungeonSidebar
        dungeons={DUNGEONS}
        error={null}
        openId={null}
        onOpen={onOpen}
        onCreate={onCreate}
        onRename={vi.fn()}
        onSetMaps={vi.fn()}
        onDelete={vi.fn()}
        allMapNames={["Route1"]}
      />,
    );
    fireEvent.click(screen.getByText("+ New Dungeon"));
    fireEvent.change(screen.getByPlaceholderText(/name/i), { target: { value: "New Cave" } });
    fireEvent.change(screen.getByPlaceholderText(/seed map/i), { target: { value: "Route1" } });
    fireEvent.click(screen.getByText("Create"));
    await Promise.resolve();
    expect(onCreate).toHaveBeenCalledWith({ name: "New Cave", seedMap: "Route1" });
  });

  it("editing the open dungeon's membership shows its maps as removable rows", () => {
    render(
      <DungeonSidebar
        dungeons={DUNGEONS}
        error={null}
        openId="1"
        onOpen={() => {}}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onSetMaps={vi.fn()}
        onDelete={vi.fn()}
        allMapNames={[]}
      />,
    );
    expect(screen.getByText("MtMoon_1F")).toBeTruthy();
    expect(screen.getByText("MtMoon_B1F")).toBeTruthy();
  });

  it("removing a map from the open dungeon calls onSetMaps with it excluded", () => {
    const onSetMaps = vi.fn();
    render(
      <DungeonSidebar
        dungeons={DUNGEONS}
        error={null}
        openId="1"
        onOpen={() => {}}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onSetMaps={onSetMaps}
        onDelete={vi.fn()}
        allMapNames={[]}
      />,
    );
    fireEvent.click(screen.getByLabelText("Remove MtMoon_1F"));
    expect(onSetMaps).toHaveBeenCalledWith("1", ["MtMoon_B1F"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ui/test/useDungeons.test.tsx packages/ui/test/DungeonSidebar.test.tsx`
Expected: FAIL — neither module exists.

- [ ] **Step 3: Implement**

**3a.** Create `packages/ui/src/hooks/useDungeons.ts`:

```ts
import { useCallback, useEffect, useState } from "react";

export interface Dungeon {
  id: string;
  name: string;
  maps: string[];
}

export interface UseDungeonsResult {
  data: Dungeon[] | null;
  error: string | null;
  create(input: { name: string; seedMap?: string; maps?: string[] }): Promise<Dungeon>;
  rename(id: string, name: string): Promise<Dungeon>;
  setMaps(id: string, maps: string[]): Promise<Dungeon>;
  remove(id: string): Promise<void>;
}

/**
 * Feature C's dungeon CRUD (Task 11's own routes), gated by `enabled` the
 * same way useWorldVisibility is -- Dungeon mode is the only consumer, and
 * Map/World mode should never pay for this fetch.
 */
export function useDungeons(enabled: boolean): UseDungeonsResult {
  const [data, setData] = useState<Dungeon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gen, setGen] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    fetch("/api/dungeons")
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/dungeons -> ${r.status}`);
        return r.json() as Promise<Dungeon[]>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, gen]);

  const reload = useCallback(() => setGen((g) => g + 1), []);

  const create = useCallback(
    async (input: { name: string; seedMap?: string; maps?: string[] }): Promise<Dungeon> => {
      const r = await fetch("/api/dungeons", { method: "POST", body: JSON.stringify(input) });
      if (!r.ok) throw new Error(`POST /api/dungeons -> ${r.status}`);
      const dungeon = (await r.json()) as Dungeon;
      reload();
      return dungeon;
    },
    [reload],
  );

  const rename = useCallback(
    async (id: string, name: string): Promise<Dungeon> => {
      const r = await fetch(`/api/dungeons/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ name }) });
      if (!r.ok) throw new Error(`PATCH /api/dungeons/${id} -> ${r.status}`);
      const dungeon = (await r.json()) as Dungeon;
      reload();
      return dungeon;
    },
    [reload],
  );

  const setMaps = useCallback(
    async (id: string, maps: string[]): Promise<Dungeon> => {
      const r = await fetch(`/api/dungeons/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ maps }) });
      if (!r.ok) throw new Error(`PATCH /api/dungeons/${id} -> ${r.status}`);
      const dungeon = (await r.json()) as Dungeon;
      reload();
      return dungeon;
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      const r = await fetch(`/api/dungeons/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`DELETE /api/dungeons/${id} -> ${r.status}`);
      reload();
    },
    [reload],
  );

  return { data, error, create, rename, setMaps, remove };
}
```

**3b.** Create `packages/ui/src/components/DungeonSidebar.tsx`:

```tsx
import { useState } from "react";
import type { Dungeon } from "../hooks/useDungeons.js";

export interface DungeonSidebarProps {
  dungeons: Dungeon[] | null;
  error: string | null;
  openId: string | null;
  onOpen(id: string): void;
  onCreate(input: { name: string; seedMap?: string; maps?: string[] }): Promise<Dungeon>;
  onRename(id: string, name: string): void;
  onSetMaps(id: string, maps: string[]): void;
  onDelete(id: string): void;
  allMapNames: string[];
}

/**
 * Feature C's own sidebar (spec §5.4: "not the shared map list"). Lists
 * saved dungeons, a "+ New Dungeon" seed-picker/create form, and -- for
 * whichever dungeon is currently open -- its name (editable inline) and
 * member maps as removable rows, plus a small add-map input. Native
 * `<datalist>`-backed text inputs stand in for a full autocomplete
 * component here (unlike SpeciesSpotlight's own combobox, this is a
 * one-off picker over a list the browser can already filter for free, not
 * a live-typing search UX this project has invested a dedicated component
 * in).
 */
export function DungeonSidebar({
  dungeons, error, openId, onOpen, onCreate, onRename, onSetMaps, onDelete, allMapNames,
}: DungeonSidebarProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSeed, setNewSeed] = useState("");
  const [addMapName, setAddMapName] = useState("");

  const open = dungeons?.find((d) => d.id === openId) ?? null;

  const submitCreate = async () => {
    if (!newName.trim()) return;
    const created = await onCreate(newSeed.trim() ? { name: newName.trim(), seedMap: newSeed.trim() } : { name: newName.trim(), maps: [] });
    setCreating(false);
    setNewName("");
    setNewSeed("");
    onOpen(created.id);
  };

  const removeMap = (map: string) => {
    if (!open) return;
    onSetMaps(open.id, open.maps.filter((m) => m !== map));
  };

  const addMap = () => {
    if (!open || !addMapName.trim() || open.maps.includes(addMapName.trim())) return;
    onSetMaps(open.id, [...open.maps, addMapName.trim()]);
    setAddMapName("");
  };

  return (
    <nav className="dungeon-sidebar" aria-label="Dungeons">
      {error && <p className="map-tree__empty">Could not load dungeons: {error}</p>}

      <ul className="dungeon-sidebar__list">
        {(dungeons ?? []).map((d) => (
          <li key={d.id}>
            <button
              type="button"
              className="dungeon-sidebar__item"
              aria-current={openId === d.id ? "true" : undefined}
              onClick={() => onOpen(d.id)}
            >
              <span className="dungeon-sidebar__item-name">{d.name}</span>
              <span className="dungeon-sidebar__item-count">{d.maps.length}</span>
            </button>
          </li>
        ))}
      </ul>

      {!creating ? (
        <button type="button" className="dungeon-sidebar__new" onClick={() => setCreating(true)}>
          + New Dungeon
        </button>
      ) : (
        <div className="dungeon-sidebar__create">
          <input
            className="dungeon-sidebar__input"
            placeholder="Dungeon name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="dungeon-sidebar__input"
            placeholder="Seed map (optional)"
            list="dungeon-sidebar-all-maps"
            value={newSeed}
            onChange={(e) => setNewSeed(e.target.value)}
          />
          <div className="dungeon-sidebar__create-actions">
            <button type="button" className="map-canvas__btn" onClick={submitCreate}>
              Create
            </button>
            <button type="button" className="map-canvas__btn" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {open && (
        <div className="dungeon-sidebar__edit">
          <input
            className="dungeon-sidebar__input"
            value={open.name}
            onChange={(e) => onRename(open.id, e.target.value)}
            aria-label="Dungeon name"
          />
          <ul className="dungeon-sidebar__maps">
            {open.maps.map((m) => (
              <li key={m} className="dungeon-sidebar__map-row">
                <span>{m}</span>
                <button type="button" aria-label={`Remove ${m}`} onClick={() => removeMap(m)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="dungeon-sidebar__add-map">
            <input
              className="dungeon-sidebar__input"
              placeholder="Add map…"
              list="dungeon-sidebar-all-maps"
              value={addMapName}
              onChange={(e) => setAddMapName(e.target.value)}
            />
            <button type="button" className="map-canvas__btn" onClick={addMap}>
              Add
            </button>
          </div>
          <button type="button" className="dungeon-sidebar__delete" onClick={() => onDelete(open.id)}>
            Delete dungeon
          </button>
        </div>
      )}

      <datalist id="dungeon-sidebar-all-maps">
        {allMapNames.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </nav>
  );
}
```

**3c.** Add CSS to `packages/ui/src/styles.css`:

```css
.dungeon-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.dungeon-sidebar__list {
  list-style: none;
  margin: 0;
  padding: var(--space-2) 0;
}

.dungeon-sidebar__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-family: var(--font-data);
  font-size: var(--text-sm);
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
  border-radius: 4px;
}

.dungeon-sidebar__item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.dungeon-sidebar__item[aria-current="true"] {
  background: var(--bg-selected);
  color: var(--text-primary);
  font-weight: 600;
}

.dungeon-sidebar__item-count {
  color: var(--text-muted);
  font-size: var(--text-2xs);
}

.dungeon-sidebar__new {
  margin: var(--space-2) var(--space-3);
  background: var(--accent);
  color: var(--text-on-accent);
  border: none;
  border-radius: 4px;
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
  font-size: var(--text-sm);
}

.dungeon-sidebar__create,
.dungeon-sidebar__edit {
  padding: var(--space-2) var(--space-3);
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.dungeon-sidebar__input {
  background: var(--bg-panel-raised);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: var(--text-sm);
  padding: var(--space-1) var(--space-2);
}

.dungeon-sidebar__create-actions {
  display: flex;
  gap: var(--space-2);
}

.dungeon-sidebar__maps {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
}

.dungeon-sidebar__map-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--font-data);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  padding: var(--space-1) 0;
}

.dungeon-sidebar__map-row button {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--text-base);
  line-height: 1;
}

.dungeon-sidebar__map-row button:hover {
  color: var(--danger);
}

.dungeon-sidebar__add-map {
  display: flex;
  gap: var(--space-2);
}

.dungeon-sidebar__delete {
  background: transparent;
  border: 1px solid var(--danger);
  color: var(--danger);
  border-radius: 4px;
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
  font-size: var(--text-sm);
  align-self: flex-start;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ui/test/useDungeons.test.tsx packages/ui/test/DungeonSidebar.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Teeth-proof**

Temporarily change `removeMap` to `onSetMaps(open.id, open.maps)` (no-op, doesn't actually filter), confirm "removing a map from the open dungeon calls onSetMaps with it excluded" fails, then restore.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/hooks/useDungeons.ts packages/ui/src/components/DungeonSidebar.tsx packages/ui/src/styles.css packages/ui/test/useDungeons.test.tsx packages/ui/test/DungeonSidebar.test.tsx
git commit -m "feat(ui): useDungeons hook and DungeonSidebar (list, create, rename, edit membership, delete)"
```

---

### Task 15: UI — App.tsx wiring: Dungeon mode

**Files:**
- Modify: `packages/ui/src/App.tsx`
- Modify: `packages/ui/src/styles.css`

No new test file — this task wires already-tested pieces (`WorldCanvas`'s `mapFilter`, `DungeonSidebar`, `useDungeons`, `useWorldVisibility`) together at the top level. Its own correctness is verified by the full suite staying green (Step 4) plus Task 16's manual run-through, matching how the World View Usability plan's own final App.tsx wiring step was verified.

- [ ] **Step 1: Implement**

Rewrite `packages/ui/src/App.tsx`:

```tsx
import { useMemo, useState } from "react";
import { MapTree } from "./components/MapTree.js";
import { MapCanvas } from "./components/MapCanvas.js";
import { WorldCanvas } from "./components/WorldCanvas.js";
import { DungeonSidebar } from "./components/DungeonSidebar.js";
import { useMapGroups } from "./hooks/useMapGroups.js";
import { useMapLayout } from "./hooks/useMapLayout.js";
import { useWorldVisibility } from "./hooks/useWorldVisibility.js";
import { useDungeons } from "./hooks/useDungeons.js";

type Mode = "map" | "world" | "dungeon";

export function App() {
  const [mode, setMode] = useState<Mode>("map");
  const [selected, setSelected] = useState<string | null>(null);
  // Bumped on every sidebar click, even a re-click of the same map name --
  // see WorldCanvas's own jumpToken doc comment for why jumpToMap alone
  // can't carry that signal.
  const [selectVersion, setSelectVersion] = useState(0);
  const [openDungeonId, setOpenDungeonId] = useState<string | null>(null);

  const { data, error } = useMapGroups();
  const layout = useMapLayout(selected);
  const { placed: worldVisibility } = useWorldVisibility(mode === "world");
  const dungeons = useDungeons(mode === "dungeon");

  const selectMap = (name: string) => {
    setSelected(name);
    setSelectVersion((v) => v + 1);
  };

  // `.find()` over `dungeons.data` returns the SAME element reference every
  // render as long as the array itself hasn't been replaced (only true
  // after a real create/rename/setMaps/remove -- see useDungeons's own
  // `gen`-driven refetch) -- so `openDungeon`'s identity is stable across
  // unrelated App re-renders, which is what lets the mapFilter memo below
  // (and, inside WorldCanvas, its own mapFilter-keyed auto-fit effect) fire
  // only when the open dungeon genuinely changes.
  const openDungeon = mode === "dungeon" ? (dungeons.data?.find((d) => d.id === openDungeonId) ?? null) : null;
  const mapFilter = useMemo(() => (openDungeon ? new Set(openDungeon.maps) : null), [openDungeon]);

  const allMapNames = useMemo(
    () => (data ? data.groupOrder.flatMap((g) => data.groups[g] ?? []) : []),
    [data],
  );

  return (
    <div className="app">
      <header className="app__toolbar">
        <h1 className="app__title">PokeMap</h1>
        <div className="app__mode" role="group" aria-label="View">
          <button
            type="button"
            className="map-canvas__btn"
            aria-pressed={mode === "map"}
            onClick={() => setMode("map")}
          >
            Map
          </button>
          <button
            type="button"
            className="map-canvas__btn"
            aria-pressed={mode === "world"}
            onClick={() => setMode("world")}
          >
            World
          </button>
          <button
            type="button"
            className="map-canvas__btn"
            aria-pressed={mode === "dungeon"}
            onClick={() => setMode("dungeon")}
          >
            Dungeon
          </button>
        </div>
        {mode === "map" && selected && <span className="app__status">{selected}</span>}
      </header>
      <div className="app__body">
        <aside className="app__sidebar">
          {mode === "dungeon" ? (
            <DungeonSidebar
              dungeons={dungeons.data}
              error={dungeons.error}
              openId={openDungeonId}
              onOpen={setOpenDungeonId}
              onCreate={dungeons.create}
              onRename={dungeons.rename}
              onSetMaps={dungeons.setMaps}
              onDelete={(id) => {
                dungeons.remove(id);
                if (openDungeonId === id) setOpenDungeonId(null);
              }}
              allMapNames={allMapNames}
            />
          ) : error ? (
            <p className="map-tree__empty">Could not load map groups: {error}</p>
          ) : data ? (
            <MapTree
              data={data}
              selected={selected}
              onSelect={selectMap}
              worldMode={mode === "world"}
              visibility={worldVisibility}
            />
          ) : (
            <p className="map-tree__empty">Loading map groups…</p>
          )}
        </aside>
        <main className="app__canvas">
          {mode === "world" ? (
            <WorldCanvas jumpToMap={selected} jumpToken={selectVersion} />
          ) : mode === "dungeon" ? (
            openDungeon ? (
              <WorldCanvas mapFilter={mapFilter} />
            ) : (
              <p className="app__canvas-placeholder">Select or create a dungeon</p>
            )
          ) : !selected ? (
            <p className="app__canvas-placeholder">Select a map</p>
          ) : layout.error ? (
            <p className="app__canvas-placeholder">Could not load {selected}: {layout.error}</p>
          ) : layout.data ? (
            <MapCanvas mapName={selected} data={layout.data} />
          ) : (
            <p className="app__canvas-placeholder">Loading {selected}…</p>
          )}
        </main>
      </div>
    </div>
  );
}
```

Add CSS to `packages/ui/src/styles.css` (the `.app__mode` group already exists and needs no change — the third button reuses `.map-canvas__btn` exactly as the existing two do, so no new CSS is strictly required; verify this against the real current stylesheet before skipping this step).

- [ ] **Step 2: Run the full UI suite**

Run: `npx vitest run packages/ui`
Expected: PASS. This is the step that proves Task 15's wiring didn't regress Map or World mode — there is no dedicated `App.test.tsx` in this repo, so `MapTree.test.tsx`, `WorldCanvas.test.tsx`, `DungeonSidebar.test.tsx`, and `useDungeons.test.tsx`/`useWorldVisibility.test.tsx` passing together is the closest coverage; Task 16 adds the manual click-through this can't substitute for.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean. `Mode` widening from two to three values is exactly the kind of change TypeScript's own exhaustiveness checking is good at catching if a conditional elsewhere forgot the new case — this step is not optional.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/App.tsx packages/ui/src/styles.css
git commit -m "feat(ui): App.tsx wires up Dungeon mode (DungeonSidebar + scoped WorldCanvas)"
```

---

### Task 16: Final verification

**Files:** none (verification only, plus RESUME.md if it exists)

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: every test in `packages/core`, `packages/server`, `packages/ui` (and `packages/cli`, unaffected by this plan) passes. Record the final pass count.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Decomp untouched (I8)**

Run: `git -C "C:\Programming Projects\Pokemon Game\game" status --porcelain`
Expected: only whatever pre-existing entries were present before this plan started (the World View Usability plan's own final review found 7 pre-existing, unrelated entries — confirm the count and content are unchanged, or explain any difference). This plan's only legitimate write there is `.pokemap/dungeons.json` (gitignored, so it will not appear in `git status` regardless).

- [ ] **Step 4: Run the actual UI and look at it**

Start the dev server (`launch.sh` at the repo root, or `npm run dev` in `packages/server` + `packages/ui` separately) and, in a real browser, verify by hand — this project's own established practice, since jsdom cannot catch passive-listener bugs, real stacking-context bugs, or genuine visual regressions (see WorldCanvas.tsx's own wheel-handler and tooltip comments for two prior examples of exactly this class of bug):

- World mode: confirm most houses/small interiors are no longer drawn by default, but towns/routes/dungeons/caves still are; search the sidebar for a hidden interior, confirm it shows greyed with a normal (non-greyed) map above/below it for contrast; click it and confirm the view jumps there and reveals it; drag a different greyed entry onto the canvas and confirm it appears and survives a reload.
- World mode: turn on the warp toggle, confirm small markers appear only on visible maps; double-click one and confirm the destination preview opens with a working, interactive canvas (pan/zoom it) and closes cleanly via the × with the underlying world view unchanged.
- Dungeon mode: create a dungeon from a seed map with real warp connections (e.g. a cave with multiple floors), confirm the suggested member list is sensible; remove one map and add a different one via the edit panel; confirm the canvas auto-fits to the dungeon on open; turn on connection lines and confirm they draw between the correct tiles and do NOT draw to a map outside the dungeon; confirm the warp-marker toggle and destination popup both still work identically inside this scoped view.

- [ ] **Step 5: Update `docs/superpowers/RESUME.md`** (if it exists — check first)

If present, add a short section noting this plan's completion: what Features A/B/C shipped, any open items or deliberately-deferred edges (e.g. no confirmation dialog on dungeon delete, no drag-and-drop reordering of a dungeon's map list), and the recurring defect-pattern lessons this plan's own tasks surfaced (if any teeth-proof in Tasks 1–15 caught something worth remembering for the next plan).

- [ ] **Step 6: Report**

Summarize: final test count (X/X passing), typecheck status, decomp diff status, and a plain-language confirmation that all three features (A, B, C) were verified live in the browser, not just via unit tests.
