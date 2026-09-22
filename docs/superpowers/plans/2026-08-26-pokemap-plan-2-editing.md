# PokeMap Plan 2 — Painting, Events, and Wild Sign Authoring

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Read [Plan 0](2026-08-26-pokemap-plan-0-roadmap.md) first — invariants I1–I8 bind every task.
>
> **RE-GRANULARISED 2026-09-13** against the code Plan 1 + the two later UI
> plans (World View Usability, Dungeon Mode and Warp Tools) actually
> produced. The original task-level text is gone; every task below is full
> TDD steps, audited line-by-line against the real current source
> (`packages/core/src/write/jsonEdit.ts`, `load/blocks.ts`'s `parseBlocks`/
> `encodeBlocks`, `validate/metatileRange.ts`, `config/engine.ts`'s
> `EngineProfile`, `render/metatile.ts`'s `renderMetatile`,
> `analyse/coverage.ts`'s `whereSpecies`, `load/encounters.ts`'s
> `speciesChances`/`FISHING_RODS`, `packages/server/src/index.ts`'s route
> shape, `packages/ui/src/components/MapCanvas.tsx`'s toggle/composite
> architecture) — not against the imagined APIs the coarse version guessed
> at. Where an API matched the guess exactly, the task is written against
> the real thing with no further comment. Where it didn't, or where the
> coarse plan's file list was silent about a piece of wiring it actually
> needs (a recurring Plan 1 defect class — Plan 0 §7's "a plan's file list
> omitting a file doesn't mean the file doesn't need touching"), the
> deviation and its reasoning are called out inline.

**Goal:** Give PokeMap its first write path — tile painting, collision and elevation, event editing, and wild sign authoring — without ever rewriting a file's schema.

**Architecture:** All writes funnel through one `commitSave()` in `packages/core/src/write/save.ts`. Nothing else in the codebase calls `writeFile`/`writeFileSync` on a decomp path. Every save is guarded, diff-previewed and user-initiated (I6).

**The one architectural decision this re-granularisation had to make that the coarse version left open:** where does the in-memory `EditSession` (the open map's current, possibly-edited blocks/events, and its undo stack) actually live? The coarse plan defined `EditSession` as a `core` interface with no HTTP layer at all, silently assuming either "the browser holds it" (impossible — Plan 0 §2 is explicit that the browser never imports `core` and has no filesystem access, so it cannot itself call `planSave`/`guardLayoutSave`/`encodeBlocks`) or leaving the split undecided. The resolution: **the edit session lives server-side**, in the same Node process already holding `worldCache`/`coverageCache`/etc., keyed by map name. The browser sends small, granular edit operations (paint a tile, move an event) over HTTP; the server applies them to its own in-memory session via `core`'s pure functions and maintains the undo stack; the server is what calls `planSave`/`commitSave`. This is not a new pattern — it is the exact shape `sidecar.ts`/`dungeons.ts` already use (server reads real state, mutates an in-memory representation, writes back on an explicit call), extended with an intermediate "accumulate edits before an explicit save" step the sidecar files never needed. The CLI needs none of this: it is already its own Node process with direct `core` access, and computes an `EditSession`-shaped object in memory for the duration of one command, exactly as `render`/`query`/`validate` already do.

This adds explicit server-route and MapCanvas-wiring tasks the coarse plan's file list never listed at all. Consistent with Plan 0 §7's own findings on Plan 1 (Tasks 25/28/29 each silently needed `App.tsx` or `WorldCanvas.tsx` despite an omitted file list), those tasks are not scope creep — the requirements imply them.

**Tech Stack:** As Plan 1. New: a command-pattern undo stack in `core`, no new dependencies.

**Success criteria — demonstrated, not asserted (Task 20's own completion checklist repeats these against the real app):**
1. Paint a tile in `NewBarkTown` (hns/640) and in `PetalburgCity` (emerald/512), save both, and confirm `git diff` in the decomp shows **only** the two `map.bin` files, changed by exactly the bytes painted.
2. The 5-engine identity corpus test still passes at zero bytes changed.
3. Add a wild sign, build the ROM, and see the Pokémon standing there.
4. Attempting to save a layout with no `layout_version` is refused, by name, with the fix.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/write/guards.ts` | Refusals: missing `layout_version`, out-of-range metatile, border-size mismatch, warp-tile-moved |
| `packages/core/src/write/binary.ts` | `map.bin` / `border.bin` writing, change-detected |
| `packages/core/src/write/jsonEdit.ts` | **Extended, not created** — already has `editJson`/`JsonPath`/`locate`/`valueEnd`; gains `insertArrayElement`/`removeArrayElement` |
| `packages/core/src/write/save.ts` | The single write funnel. `EditSession`, `planSave`, `commitSave`. Guards, then writes. |
| `packages/core/src/write/diff.ts` | Human/machine-readable rendering of a `SavePlan` |
| `packages/core/src/edit/commands.ts` | Command pattern + undo/redo stack over an `EditSession` |
| `packages/core/src/edit/paint.ts` | Pencil, bucket, dropper, rect, shift — pure `(blocks, args) => Block[]` |
| `packages/core/src/edit/events.ts` | Add/move/delete object, warp, coord and bg events, as `JsonEdit`-producing operations |
| `packages/core/src/signs/suggest.ts` | Species ranking and edge-slot suggestion |
| `packages/core/src/signs/script.ts` | Templated `scripts.inc` generation |
| `packages/core/src/signs/write.ts` | The sign write path — one `SavePlan` covering both the object event and the script |
| `packages/server/src/editSessions.ts` | **New.** The in-memory `Map<string, EditSession>`, keyed by map name, and the pure helpers that apply one edit op to a session. Split out of `index.ts` rather than grown inline — that file is already 523 lines and every prior UI plan's own review history flags exactly this kind of growth (`WorldCanvas.tsx` hit ~2,057 lines the same way). |
| `packages/server/src/index.ts` | Extended: `/api/map/:name` gains `border`/`mapJsonText`; new `/api/edit/:map/*` routes delegate to `editSessions.ts` |
| `packages/ui/src/components/MetatilePalette.tsx` | Tile picker, split-aware |
| `packages/ui/src/hooks/useEditSession.ts` | **New.** Client-side hook wrapping the `/api/edit/:map/*` routes — the one place the UI talks to the edit session, mirroring `useDungeons.ts`'s own shape |
| `packages/ui/src/components/MapCanvas.tsx` | Extended: a `mode: "view" \| "edit"` prop: in edit mode, mouse events paint instead of only hovering, and the toolbar gains tool selection |
| `packages/ui/src/components/CollisionPalette.tsx` | Collision/elevation value picker |
| `packages/ui/src/components/SaveDialog.tsx` | Diff preview and confirm |
| `packages/ui/src/components/Toolbar.tsx` | Tool selection, undo/redo, save trigger |
| `packages/ui/src/components/EventInspector.tsx` | Event selection, property editing, add/delete |
| `packages/ui/src/components/SignComposer.tsx` | Wild sign authoring flow |
| `packages/cli/src/index.ts` | Extended: `sign suggest/add/list`, `diff`, `paint` commands |

---

## Task 1: Save guards

The refusals from Plan 0's invariants (I7) and spec §7. Written first, because everything after it depends on being unable to do damage. Pure `core`, no filesystem writes anywhere in this task.

**Files:**
- Create: `packages/core/src/write/guards.ts`
- Test: `packages/core/test/write/guards.test.ts`

- [ ] **Step 1: Write the failing tests**

Read `packages/core/src/validate/metatileRange.ts`, `packages/core/src/config/engine.ts`, and `packages/core/src/model/types.ts` first — this task's own `Block` shape is `{metatileId, collision, elevation}` (no `x`/`y`; position is the array index), and `EngineProfile.supportsLayoutVersion` and `Layout.layoutVersion?` already exist exactly as needed.

Create `packages/core/test/write/guards.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { guardLayoutSave, guardMapSave } from "../../src/write/guards.js";
import type { Project } from "../../src/project.js";
import type { Layout } from "../../src/model/types.js";
import type { MapData } from "../../src/load/maps.js";
import { defaultProfile } from "../../src/config/engine.js";

/** A minimal stub, not the corpus -- mirrors packages/core/test/world/
 *  warpGraph.test.ts's own stubProject pattern exactly (unused fields throw
 *  on call, so a wrong code path fails loudly rather than by coincidence). */
function stubProject(overrides: Partial<Project>): Project {
  const unused = (fn: string) => (): never => { throw new Error(`stub: ${fn} should not be called`); };
  return {
    paths: unused("paths") as unknown as Project["paths"],
    profile: defaultProfile("pokeemerald"),
    constants: unused("constants") as unknown as Project["constants"],
    layouts: [],
    groups: unused("groups") as unknown as Project["groups"],
    layoutByName: () => undefined,
    layoutById: () => undefined,
    layoutForMap: unused("layoutForMap"),
    splitFor: unused("splitFor"),
    tileset: unused("tileset"),
    tilesetSymbols: unused("tilesetSymbols"),
    map: unused("map"),
    mapNames: () => [],
    ...overrides,
  };
}

const LAYOUT: Layout = {
  id: "LAYOUT_TEST", name: "Test_Layout", width: 10, height: 10,
  borderWidth: 2, borderHeight: 2, primaryTileset: "gTileset_General",
  secondaryTileset: "gTileset_Route", borderFilepath: "x", blockdataFilepath: "y",
};

describe("guardLayoutSave", () => {
  it("refuses to save a layout with no layout_version on an engine that supports it", () => {
    const proj = stubProject({
      profile: { ...defaultProfile("pokeemerald-expansion"), supportsLayoutVersion: true },
      splitFor: () => ({ version: "emerald", tiles: 512, metatiles: 512, pals: 6 }),
      tileset: (s) => ({ symbol: s, isSecondary: false, metatileCount: 512, tiles: {} as any, palettes: [], attributes: [], metatile: () => [], layerType: () => 0, behavior: () => 0 }),
    });
    const r = guardLayoutSave(proj, { ...LAYOUT, layoutVersion: undefined }, []);
    expect(r.map((x) => x.code)).toContain("missing-layout-version");
    expect(r.find((x) => x.code === "missing-layout-version")!.fix).toMatch(/layout_version/);
  });

  it("does not refuse a layout that already carries layout_version", () => {
    const proj = stubProject({
      profile: { ...defaultProfile("pokeemerald-expansion"), supportsLayoutVersion: true },
      splitFor: () => ({ version: "hns", tiles: 640, metatiles: 640, pals: 7 }),
      tileset: (s) => ({ symbol: s, isSecondary: false, metatileCount: 640, tiles: {} as any, palettes: [], attributes: [], metatile: () => [], layerType: () => 0, behavior: () => 0 }),
    });
    const r = guardLayoutSave(proj, { ...LAYOUT, layoutVersion: "hns" }, []);
    expect(r.map((x) => x.code)).not.toContain("missing-layout-version");
  });

  it("does not refuse for missing layout_version on an engine that doesn't support the field at all", () => {
    // pokeemerald vanilla: supportsLayoutVersion is false, so the field's
    // absence is expected, not a defect -- the guard must not fire here, or
    // every vanilla-emerald map becomes permanently unsavable.
    const proj = stubProject({
      profile: defaultProfile("pokeemerald"),
      splitFor: () => ({ version: "emerald", tiles: 512, metatiles: 512, pals: 6 }),
      tileset: (s) => ({ symbol: s, isSecondary: false, metatileCount: 512, tiles: {} as any, palettes: [], attributes: [], metatile: () => [], layerType: () => 0, behavior: () => 0 }),
    });
    expect(guardLayoutSave(proj, { ...LAYOUT, layoutVersion: undefined }, []).map((x) => x.code))
      .not.toContain("missing-layout-version");
  });

  it("refuses a block whose id is out of range for THIS layout's split -- the whole thesis of the project as an assertion", () => {
    const proj = stubProject({
      profile: defaultProfile("pokeemerald"),
      splitFor: (l) => l.name === "Emerald_Layout"
        ? { version: "emerald", tiles: 512, metatiles: 512, pals: 6 }
        : { version: "hns", tiles: 640, metatiles: 640, pals: 7 },
      tileset: () => ({ symbol: "x", isSecondary: false, metatileCount: 512, tiles: {} as any, palettes: [], attributes: [], metatile: () => [], layerType: () => 0, behavior: () => 0 }),
    });
    // id 600 is legal on an hns (640-primary) layout and illegal on an
    // emerald (512-primary) one -- the exact pairing Plan 0's own §7 test-
    // design rule calls "the whole thesis of the project expressed as an
    // assertion": the SAME id, different verdicts, purely from the split.
    const block = [{ metatileId: 600, collision: 0, elevation: 3 }];
    expect(guardLayoutSave(proj, { ...LAYOUT, name: "Emerald_Layout" }, block).map((x) => x.code))
      .toContain("metatile-out-of-range");
    expect(guardLayoutSave(proj, { ...LAYOUT, name: "Hns_Layout" }, block).map((x) => x.code))
      .not.toContain("metatile-out-of-range");
  });

  it("names the offending ids and both tileset counts in the fix text", () => {
    const proj = stubProject({
      profile: defaultProfile("pokeemerald"),
      splitFor: () => ({ version: "emerald", tiles: 512, metatiles: 512, pals: 6 }),
      tileset: (s) => ({ symbol: s, isSecondary: false, metatileCount: 512, tiles: {} as any, palettes: [], attributes: [], metatile: () => [], layerType: () => 0, behavior: () => 0 }),
    });
    const r = guardLayoutSave(proj, LAYOUT, [{ metatileId: 999, collision: 0, elevation: 0 }]);
    const found = r.find((x) => x.code === "metatile-out-of-range")!;
    expect(found.message).toContain("999");
    expect(found.fix).toMatch(/512/);
  });

  it("refuses a border block count that does not match borderWidth * borderHeight", () => {
    const proj = stubProject({ profile: defaultProfile("pokeemerald") });
    // LAYOUT is borderWidth:2, borderHeight:2 -> expects 4 border blocks.
    const border = [{ metatileId: 1, collision: 0, elevation: 0 }, { metatileId: 1, collision: 0, elevation: 0 }];
    const r = guardLayoutSave(proj, LAYOUT, [], border);
    expect(r.map((x) => x.code)).toContain("border-size-mismatch");
    expect(r.find((x) => x.code === "border-size-mismatch")!.fix).toMatch(/2.*2|4/);
  });

  it("does not refuse when border is omitted (a layout-only save that never touched border.bin)", () => {
    const proj = stubProject({ profile: defaultProfile("pokeemerald") });
    expect(guardLayoutSave(proj, LAYOUT, []).map((x) => x.code)).not.toContain("border-size-mismatch");
  });
});

describe("guardMapSave", () => {
  const BASE_MAP: MapData = {
    id: "MAP_TEST", name: "Test", layout: "LAYOUT_TEST", music: "MUS_ROUTE101",
    regionMapSection: "MAPSEC_TEST", mapType: "MAP_TYPE_ROUTE", weather: "WEATHER_NONE",
    connections: [], objectEvents: [], warpEvents: [{ x: 5, y: 5, elevation: 0, destMap: "MAP_OTHER", destWarpId: "0" }],
    coordEvents: [], bgEvents: [],
  };

  it("refuses when a block under an existing warp moved without the warp moving with it", () => {
    const proj = stubProject({ profile: defaultProfile("pokeemerald") });
    // The warp sits at (5,5) in a 10-wide layout -- block index 5*10+5=55.
    // nextBlocks differs from prevBlocks at exactly that index; the warp
    // event itself (nextMap) is untouched.
    const prevBlocks = Array.from({ length: 100 }, () => ({ metatileId: 1, collision: 0, elevation: 0 }));
    const nextBlocks = prevBlocks.map((b, i) => (i === 55 ? { ...b, metatileId: 2 } : b));
    const r = guardMapSave(proj, LAYOUT, BASE_MAP, BASE_MAP, prevBlocks, nextBlocks);
    expect(r.map((x) => x.code)).toContain("warp-tile-moved");
    expect(r.find((x) => x.code === "warp-tile-moved")!.message).toContain("MAP_OTHER");
  });

  it("does not refuse when the block under a warp is unchanged", () => {
    const proj = stubProject({ profile: defaultProfile("pokeemerald") });
    const blocks = Array.from({ length: 100 }, () => ({ metatileId: 1, collision: 0, elevation: 0 }));
    // A change elsewhere (index 0, not under the warp at 55) must not trip it.
    const nextBlocks = blocks.map((b, i) => (i === 0 ? { ...b, metatileId: 9 } : b));
    const r = guardMapSave(proj, LAYOUT, BASE_MAP, BASE_MAP, blocks, nextBlocks);
    expect(r.map((x) => x.code)).not.toContain("warp-tile-moved");
  });

  it("does not refuse when the warp event itself moved together with its block", () => {
    const proj = stubProject({ profile: defaultProfile("pokeemerald") });
    const prevBlocks = Array.from({ length: 100 }, () => ({ metatileId: 1, collision: 0, elevation: 0 }));
    const nextBlocks = prevBlocks.map((b, i) => (i === 55 ? { ...b, metatileId: 2 } : b));
    const movedMap: MapData = { ...BASE_MAP, warpEvents: [{ ...BASE_MAP.warpEvents[0]!, x: 6, y: 5 }] };
    // Warp moved off (5,5) in the SAME save, so the old tile changing under
    // it is expected, not a silent unpairing.
    expect(guardLayoutSave === guardLayoutSave); // no-op keeps this test file's import used if reordered
    const r = guardMapSave(proj, LAYOUT, BASE_MAP, movedMap, prevBlocks, nextBlocks);
    expect(r.map((x) => x.code)).not.toContain("warp-tile-moved");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/write/guards.test.ts`
Expected: FAIL — `packages/core/src/write/guards.ts` does not exist.

- [ ] **Step 3: Implement**

Create `packages/core/src/write/guards.ts`:

```ts
import type { Project } from "../project.js";
import type { Block, Layout } from "../model/types.js";
import type { MapData } from "../load/maps.js";

export interface Refusal { code: string; message: string; fix: string; subject: string; }

/** id-in-range check, split-aware -- the identical predicate
 *  validate/metatileRange.ts's own `bad()` closure computes, extracted here
 *  because guardLayoutSave needs it per-block, not corpus-wide. Kept as a
 *  free function rather than importing metatileRange.ts's own internal
 *  closure (that file computes it inline and does not export it) -- the two
 *  independently agreeing on the same formula is itself a form of coverage
 *  for I1, not duplication to collapse. */
function idOutOfRange(id: number, proj: Project, layout: Layout): boolean {
  const split = proj.splitFor(layout);
  const primaryCount = proj.tileset(layout.primaryTileset).metatileCount;
  const secondaryCount = proj.tileset(layout.secondaryTileset).metatileCount;
  const ceiling = Math.min(split.metatiles + secondaryCount, proj.constants?.metatilesTotal ?? 1024);
  return id < split.metatiles ? id >= primaryCount : id >= ceiling;
}

/**
 * Refusals scoped to one layout's own blockdata: missing layout_version and
 * out-of-range metatile ids (I7), plus an optional border-size check when
 * `border` is supplied (a layout-only edit that never touched border.bin
 * passes `border` as undefined and the check is skipped, not failed).
 */
export function guardLayoutSave(
  proj: Project, layout: Layout, blocks: Block[], border?: Block[],
): Refusal[] {
  const out: Refusal[] = [];

  if (proj.profile.supportsLayoutVersion && !layout.layoutVersion) {
    out.push({
      code: "missing-layout-version",
      message: `${layout.name} has no layout_version, but this engine profile requires one.`,
      fix: "Run `python tools/donors/classify_layout_versions.py --write`, then reopen.",
      subject: layout.name,
    });
  }

  const badIds = new Map<number, number>();
  for (const b of blocks) {
    if (idOutOfRange(b.metatileId, proj, layout)) badIds.set(b.metatileId, (badIds.get(b.metatileId) ?? 0) + 1);
  }
  if (badIds.size > 0) {
    const primaryCount = proj.tileset(layout.primaryTileset).metatileCount;
    const secondaryCount = proj.tileset(layout.secondaryTileset).metatileCount;
    const ids = [...badIds.keys()].sort((a, b) => a - b);
    out.push({
      code: "metatile-out-of-range",
      message: `${layout.name}: metatile id(s) ${ids.join(", ")} are out of range for this layout's split.`,
      fix: `Primary tileset ${layout.primaryTileset} has ${primaryCount} metatiles, secondary ${layout.secondaryTileset} has ${secondaryCount}. Pick an id below the boundary this split actually resolves.`,
      subject: layout.name,
    });
  }

  if (border !== undefined) {
    const expected = layout.borderWidth * layout.borderHeight;
    if (border.length !== expected) {
      out.push({
        code: "border-size-mismatch",
        message: `${layout.name}: border has ${border.length} block(s), expected ${expected}.`,
        fix: `layouts.json declares borderWidth ${layout.borderWidth} x borderHeight ${layout.borderHeight} = ${expected} blocks. Do not change border dimensions from a block edit.`,
        subject: layout.name,
      });
    }
  }

  return out;
}

/**
 * Refusals scoped to one map's own save: today, only the warp-tile-moved
 * check (docs/human-porymap.md's standing rule, made enforced instead of
 * remembered). `prevMap`/`nextMap` let the guard tell "the warp moved with
 * its own block, in this same save" from "the block moved out from under a
 * warp that stayed put" -- only the second is a refusal.
 */
export function guardMapSave(
  _proj: Project, layout: Layout, prevMap: MapData, nextMap: MapData,
  prevBlocks: Block[], nextBlocks: Block[],
): Refusal[] {
  const out: Refusal[] = [];

  for (const warp of prevMap.warpEvents) {
    const stillAtSamePosition = nextMap.warpEvents.some((w) => w.x === warp.x && w.y === warp.y);
    if (!stillAtSamePosition) continue; // the warp itself moved this save -- expected
    const index = warp.y * layout.width + warp.x;
    const before = prevBlocks[index];
    const after = nextBlocks[index];
    if (before && after && (before.metatileId !== after.metatileId)) {
      out.push({
        code: "warp-tile-moved",
        message: `${layout.name}: the block under a warp at (${warp.x},${warp.y}) changed, but the warp (-> ${warp.destMap}) did not move with it.`,
        fix: `Move the warp event to follow the art, or paint elsewhere. Editing art out from under a warp silently unpairs it (docs/human-porymap.md).`,
        subject: layout.name,
      });
    }
  }

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/write/guards.test.ts`
Expected: PASS, 11/11.

- [ ] **Step 5: Run the full core suite**

Run: `npx vitest run packages/core`
Expected: PASS — this task only adds a new file, nothing existing should regress.

- [ ] **Step 6: Teeth-proof**

Temporarily change `guardLayoutSave`'s missing-layout-version check to `if (!layout.layoutVersion)` (dropping the `proj.profile.supportsLayoutVersion &&` guard), confirm "does not refuse for missing layout_version on an engine that doesn't support the field at all" fails, then restore. Separately, temporarily change the warp-tile-moved check's block-index formula to `warp.x * layout.width + warp.y` (swapped x/y), confirm the first `guardMapSave` test still happens to pass by coincidence at a 10x10 square layout — if so, add a non-square-layout test case that discriminates x/y ordering before considering this task done (LAYOUT is 10x10 currently; verify this is a real gap and fix it if it is, don't just note it).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/write/guards.ts packages/core/test/write/guards.test.ts
git commit -m "feat(core): save guards -- missing layout_version, out-of-range metatile, border size, warp-tile-moved (I7)"
```

---

## Task 2: Binary writing with change detection

**Files:**
- Create: `packages/core/src/write/binary.ts`
- Test: `packages/core/test/write/binary.test.ts`

Read `packages/core/src/load/blocks.ts` first — `encodeBlocks(blocks, profile)` and `parseBlocks(buf, profile)` already exist and are already each other's exact inverse (that property is already tested in `packages/core/test/load/blocks.test.ts`; this task consumes it, does not re-derive it).

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/write/binary.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planBlockdataWrite } from "../../src/write/binary.js";
import { encodeBlocks } from "../../src/load/blocks.js";
import { defaultProfile } from "../../src/config/engine.js";
import type { Block, Layout } from "../../src/model/types.js";

const profile = defaultProfile("pokeemerald");

const roots: string[] = [];
const tempRoot = () => { const r = mkdtempSync(join(tmpdir(), "pokemap-bin-")); roots.push(r); return r; };
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

function makeLayout(root: string, blockdataFilepath: string): Layout {
  return {
    id: "LAYOUT_TEST", name: "Test_Layout", width: 4, height: 3,
    borderWidth: 2, borderHeight: 2, primaryTileset: "x", secondaryTileset: "y",
    borderFilepath: "border.bin", blockdataFilepath,
  };
}

describe("planBlockdataWrite", () => {
  it("returns null when nothing changed", () => {
    const root = tempRoot();
    const blocks: Block[] = Array.from({ length: 12 }, (_, i) => ({ metatileId: i, collision: 0, elevation: 3 }));
    writeFileSync(join(root, "map.bin"), encodeBlocks(blocks, profile));
    const plan = planBlockdataWrite(root, makeLayout(root, "map.bin"), blocks, profile);
    expect(plan).toBeNull();
  });

  it("one changed block produces a write whose changedBlocks is [index] and whose bytes differ by exactly 2 bytes", () => {
    const root = tempRoot();
    const original: Block[] = Array.from({ length: 12 }, (_, i) => ({ metatileId: i, collision: 0, elevation: 3 }));
    writeFileSync(join(root, "map.bin"), encodeBlocks(original, profile));
    const edited = original.map((b, i) => (i === 5 ? { ...b, metatileId: 999 & profile.blockMetatileIdMask } : b));
    const plan = planBlockdataWrite(root, makeLayout(root, "map.bin"), edited, profile);
    expect(plan).not.toBeNull();
    expect(plan!.changedBlocks).toEqual([5]);
    const onDisk = readFileSync(join(root, "map.bin"));
    let diffBytes = 0;
    for (let i = 0; i < onDisk.length; i++) if (onDisk[i] !== plan!.bytes[i]) diffBytes++;
    expect(diffBytes).toBe(2);
  });

  it("round-trips: encoding what parseBlocks read back from disk is always null, including a 19-block-longer trailing-block layout", () => {
    const root = tempRoot();
    // 13 blocks on a 4x3=12 layout -- the exact "one extra block past
    // declared dimensions" shape this project's own corpus carries on 19
    // real layouts (Plan 1 Task 11's own measurement).
    const blocks: Block[] = Array.from({ length: 13 }, (_, i) => ({ metatileId: i, collision: 0, elevation: 3 }));
    writeFileSync(join(root, "map.bin"), encodeBlocks(blocks, profile));
    const plan = planBlockdataWrite(root, makeLayout(root, "map.bin"), blocks, profile);
    expect(plan).toBeNull();
  });

  it("editing one block in a trailing-block layout writes a file the SAME length as the original, not two bytes shorter", () => {
    const root = tempRoot();
    const original: Block[] = Array.from({ length: 13 }, (_, i) => ({ metatileId: i, collision: 0, elevation: 3 }));
    writeFileSync(join(root, "map.bin"), encodeBlocks(original, profile));
    // Edit block 0 only -- if planBlockdataWrite ever reconstructed length
    // from layout.width*layout.height (12) instead of encoding the WHOLE
    // Block[] it was handed (13, including the trailing one), this drops
    // the last 2 bytes silently and the I5 gate fails on exactly the 19
    // layouts with this shape, for a reason nobody would guess from the diff.
    const edited = original.map((b, i) => (i === 0 ? { ...b, metatileId: 5 } : b));
    const plan = planBlockdataWrite(root, makeLayout(root, "map.bin"), edited, profile);
    expect(plan).not.toBeNull();
    expect(plan!.bytes.length).toBe(readFileSync(join(root, "map.bin")).length);
  });

  it("refuses (throws) rather than silently writing when a block value does not fit its mask -- delegates to encodeBlocks's own refusal", () => {
    const root = tempRoot();
    writeFileSync(join(root, "map.bin"), encodeBlocks([{ metatileId: 0, collision: 0, elevation: 0 }], profile));
    const bad: Block[] = [{ metatileId: 0, collision: 7, elevation: 0 }]; // collision is 2 bits (mask 0xC00, max 3)
    expect(() => planBlockdataWrite(root, makeLayout(root, "map.bin"), bad, profile)).toThrow(/collision/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/write/binary.test.ts`
Expected: FAIL — `packages/core/src/write/binary.ts` does not exist.

- [ ] **Step 3: Implement**

Create `packages/core/src/write/binary.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import type { EngineProfile } from "../config/engine.js";
import type { Block, Layout } from "../model/types.js";
import { encodeBlocks } from "../load/blocks.js";

export interface BinaryWrite { path: string; bytes: Buffer; changedBlocks: number[]; }

/**
 * Compares the encoding of `blocks` against whatever is currently on disk
 * at `root/layout.blockdataFilepath`, returning null on an exact match so
 * opening a map and saving it without edits produces no write at all (I6's
 * own "no write when nothing changed" half, one level below the save
 * funnel's own dirty-flag check).
 *
 * Encodes the WHOLE `blocks` array handed to it -- never reconstructs a
 * length from `layout.width * layout.height`. 19 real layouts in the
 * subject corpus carry exactly one block past their declared dimensions
 * (Plan 1 Task 11's own measurement, an upstream artifact invisible to the
 * renderer but not to a writer); `parseBlocks` already includes that tail
 * (it reads `buf.length >> 1`, not the layout's own width*height), so as
 * long as callers pass through what `parseBlocks` gave them -- which the
 * save funnel (Task 4) does -- the tail survives untouched.
 */
export function planBlockdataWrite(
  root: string, layout: Layout, blocks: Block[], profile: EngineProfile,
): BinaryWrite | null {
  const path = `${root}/${layout.blockdataFilepath}`;
  const next = encodeBlocks(blocks, profile); // throws on an out-of-mask value -- I7, not this function's job to catch twice

  const prevBytes = existsSync(path) ? readFileSync(path) : Buffer.alloc(0);
  if (prevBytes.equals(next)) return null;

  const changedBlocks: number[] = [];
  const blockCount = Math.max(prevBytes.length, next.length) >> 1;
  for (let i = 0; i < blockCount; i++) {
    const prevWord = i * 2 + 1 < prevBytes.length ? prevBytes.readUInt16LE(i * 2) : undefined;
    const nextWord = i * 2 + 1 < next.length ? next.readUInt16LE(i * 2) : undefined;
    if (prevWord !== nextWord) changedBlocks.push(i);
  }

  return { path, bytes: next, changedBlocks };
}

/**
 * Identical shape for border.bin -- kept as a separate exported function
 * rather than a `kind` parameter on `planBlockdataWrite`, since the two
 * targets' paths (`blockdataFilepath` vs `borderFilepath`) and their own
 * length invariants (border.bin has NO trailing-block exception -- all
 * 1,020 real border.bin files match borderWidth*borderHeight exactly, per
 * Plan 1 Task 11's own measurement) are different enough that merging them
 * behind one flag would be the "same defect in different disguises" this
 * project's own history warns about, not a real simplification.
 */
export function planBorderWrite(
  root: string, layout: Layout, border: Block[], profile: EngineProfile,
): BinaryWrite | null {
  const path = `${root}/${layout.borderFilepath}`;
  const next = encodeBlocks(border, profile);
  const prevBytes = existsSync(path) ? readFileSync(path) : Buffer.alloc(0);
  if (prevBytes.equals(next)) return null;

  const changedBlocks: number[] = [];
  const blockCount = Math.max(prevBytes.length, next.length) >> 1;
  for (let i = 0; i < blockCount; i++) {
    const prevWord = i * 2 + 1 < prevBytes.length ? prevBytes.readUInt16LE(i * 2) : undefined;
    const nextWord = i * 2 + 1 < next.length ? next.readUInt16LE(i * 2) : undefined;
    if (prevWord !== nextWord) changedBlocks.push(i);
  }

  return { path, bytes: next, changedBlocks };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/write/binary.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 5: Round-trip against the REAL corpus, not just synthetic fixtures**

Add one more test, guarded with `itWithCorpus` (see `packages/core/test/helpers/corpus.ts`):

```ts
  itWithCorpus("round-trips every one of the 1,020 real layouts in the subject corpus, including all 19 trailing-block ones", () => {
    const proj = openProject(SUBJECT_ROOT);
    let trailingBlockLayouts = 0;
    for (const layout of proj.layouts) {
      const blocks = parseBlocks(readFileSync(`${SUBJECT_ROOT}/${layout.blockdataFilepath}`), proj.profile);
      if (blocks.length !== layout.width * layout.height) trailingBlockLayouts++;
      const plan = planBlockdataWrite(SUBJECT_ROOT, layout, blocks, proj.profile);
      expect(plan, layout.name).toBeNull();
    }
    // Pinned exactly, not just ">0" -- Plan 1 Task 11's own measurement.
    // If this number has moved, the corpus itself changed (the user's own
    // concurrent Porymap work) -- re-measure before assuming this task
    // regressed; do not just update the pin to whatever a first run prints.
    expect(trailingBlockLayouts).toBe(19);
  }, 300_000);
```

Add the necessary imports (`openProject`, `parseBlocks`, `readFileSync`, `SUBJECT_ROOT`, `itWithCorpus`) to the top of the test file.

Run: `npx vitest run packages/core/test/write/binary.test.ts`
Expected: PASS, 6/6 (skipped if the subject decomp isn't present on this machine — confirm with `--reporter=verbose` that it actually ran, per Plan 0 §7's own rule about silent skips).

- [ ] **Step 6: Run the full core suite**

Run: `npx vitest run packages/core`
Expected: PASS.

- [ ] **Step 7: Teeth-proof**

Temporarily change `planBlockdataWrite` to reconstruct blocks from `layout.width * layout.height` instead of encoding the full array handed to it (e.g. `encodeBlocks(blocks.slice(0, layout.width * layout.height), profile)`), confirm the real-corpus round-trip test fails on exactly the 19 trailing-block layouts (not all 1,020 — the other 1,001 have no tail to drop, so they'd still round-trip null), then restore.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/write/binary.ts packages/core/test/write/binary.test.ts
git commit -m "feat(core): planBlockdataWrite/planBorderWrite -- change-detected binary writing, trailing-block-safe"
```

---

## Task 3: Explicit array insert and remove

`packages/core/src/write/jsonEdit.ts` **already exists** (Plan 1) and deliberately refuses to add anything — `enterKey` throws "adding keys is an explicit operation, never a side effect of saving" for exactly this reason. Adding an object event is a real need, so it becomes its own named, explicit operation in the SAME file (same module, so it can reuse `locate`/`valueEnd`/`skipWs` directly — no new exports needed for internals that stay internal).

**Files:**
- Modify: `packages/core/src/write/jsonEdit.ts`
- Test: `packages/core/test/write/jsonEdit.test.ts` (already exists — add to it, do not replace the existing `editJson` tests)

- [ ] **Step 1: Write the failing tests**

Read the full current `packages/core/src/write/jsonEdit.ts` first — this task's implementation reuses its exact internal helpers (`locate`, `valueEnd`, `skipWs`) and must match the real current file, not a remembered version.

Add to `packages/core/test/write/jsonEdit.test.ts`:

```ts
import { insertArrayElement, removeArrayElement } from "../../src/write/jsonEdit.js";
import { openProject } from "../../src/project.js";
import { readFileSync } from "node:fs";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const SAMPLE_OBJECT_EVENT = {
  graphics_id: "OBJ_EVENT_GFX_BOY_1", x: 5, y: 5, elevation: 0,
  movement_type: "MOVEMENT_TYPE_FACE_DOWN", movement_range_x: 0, movement_range_y: 0,
  trainer_type: "TRAINER_TYPE_NONE", trainer_sight_or_berry_tree_id: "0",
  script: "PokeMap_EventScript_Test", flag: "0",
};

describe("insertArrayElement / removeArrayElement", () => {
  it("inserts into an EMPTY array, producing valid JSON with no internal formatting invented", () => {
    const src = '{ "connections": [] }';
    const out = insertArrayElement(src, ["connections"], 0, { map: "MAP_A" });
    expect(out).toBe('{ "connections": [{"map":"MAP_A"}] }');
  });

  it("appends after the last element, reusing the exact separator style already used between the other elements", () => {
    const src = `{
  "connections": [
    { "map": "MAP_A", "offset": -5, "direction": "left" },
    { "map": "MAP_B", "offset": 3, "direction": "right" }
  ]
}`;
    const out = insertArrayElement(src, ["connections"], 2, { map: "MAP_C", offset: 0, direction: "up" });
    expect(out).toBe(`{
  "connections": [
    { "map": "MAP_A", "offset": -5, "direction": "left" },
    { "map": "MAP_B", "offset": 3, "direction": "right" },
    {"map":"MAP_C","offset":0,"direction":"up"}
  ]
}`);
  });

  it("appends into a SINGLE-element array, synthesising a separator from the array's own lead-in indentation (no sibling pair to copy from)", () => {
    const src = `{
  "connections": [
    { "map": "MAP_A", "offset": -5, "direction": "left" }
  ]
}`;
    const out = insertArrayElement(src, ["connections"], 1, { map: "MAP_B" });
    expect(out).toBe(`{
  "connections": [
    { "map": "MAP_A", "offset": -5, "direction": "left" },
    {"map":"MAP_B"}
  ]
}`);
  });

  it("inserts BEFORE an existing element, at index 0, shifting it right and matching indentation", () => {
    const src = `{
  "connections": [
    { "map": "MAP_A" },
    { "map": "MAP_B" }
  ]
}`;
    const out = insertArrayElement(src, ["connections"], 0, { map: "MAP_NEW" });
    expect(out).toBe(`{
  "connections": [
    {"map":"MAP_NEW"},
    { "map": "MAP_A" },
    { "map": "MAP_B" }
  ]
}`);
  });

  it("inserts BEFORE an existing element in the middle (index 1 of 2)", () => {
    const src = `{
  "connections": [
    { "map": "MAP_A" },
    { "map": "MAP_B" }
  ]
}`;
    const out = insertArrayElement(src, ["connections"], 1, { map: "MAP_NEW" });
    expect(out).toBe(`{
  "connections": [
    { "map": "MAP_A" },
    {"map":"MAP_NEW"},
    { "map": "MAP_B" }
  ]
}`);
  });

  it("insert then remove at the SAME index is the identity, for every position in a 3-element array", () => {
    const src = `{
  "connections": [
    { "map": "MAP_A" },
    { "map": "MAP_B" },
    { "map": "MAP_C" }
  ]
}`;
    for (const index of [0, 1, 2, 3]) {
      const inserted = insertArrayElement(src, ["connections"], index, { map: "MAP_TEMP" });
      expect(removeArrayElement(inserted, ["connections"], index), `index ${index}`).toBe(src);
    }
  });

  it("removeArrayElement on the LAST remaining element collapses to a bare [], not a blank-line array", () => {
    const src = '{ "connections": [{"map":"MAP_A"}] }';
    expect(removeArrayElement(src, ["connections"], 0)).toBe('{ "connections": [] }');
  });

  it("removeArrayElement refuses (throws) an index past the end, matching enterIndex's own existing message", () => {
    const src = '{ "connections": [{"map":"MAP_A"}] }';
    expect(() => removeArrayElement(src, ["connections"], 5)).toThrow(/not present/i);
  });

  it("insertArrayElement refuses (throws) an index past length + 1", () => {
    const src = '{ "connections": [{"map":"MAP_A"}] }';
    expect(() => insertArrayElement(src, ["connections"], 5, { map: "X" })).toThrow(/out of range/i);
  });

  // The gate test, from the design spec's own original text -- exhaustive
  // over the real corpus, guarded per Plan 0 §7's own rule (confirm with
  // --reporter=verbose that it actually ran, not silently skipped).
  itWithCorpus("insert then remove is the identity across every real map.json's object_events array", () => {
    const proj = openProject(SUBJECT_ROOT);
    for (const name of proj.mapNames()) {
      const src = readFileSync(proj.paths.mapJson(name), "utf8");
      const n = (JSON.parse(src).object_events ?? []).length;
      const added = insertArrayElement(src, ["object_events"], n, SAMPLE_OBJECT_EVENT);
      expect(removeArrayElement(added, ["object_events"], n), name).toBe(src);
    }
  }, 900_000);
});
```

Add the necessary `describe`/`import` scaffolding if this is going into a fresh block rather than the existing file's own top-level `describe("editJson", ...)` — keep it as a SEPARATE `describe("insertArrayElement / removeArrayElement", ...)` block in the same file, do not nest inside the existing one.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/write/jsonEdit.test.ts -t "insertArrayElement"`
Expected: FAIL — the two exports do not exist yet.

- [ ] **Step 3: Implement**

Add to `packages/core/src/write/jsonEdit.ts`, after the existing `enterIndex` function:

```ts
/**
 * Adding a key is refused everywhere in this file (`enterKey`'s own
 * message) -- adding an ARRAY ELEMENT is different: it never introduces a
 * key nobody named, it appends/inserts a whole new sibling in a place the
 * schema already expects a list of them (object_events, warp_events, ...).
 * So it gets its own explicit, named operation instead of being folded into
 * `editJson`'s scalar-replace semantics.
 *
 * Never invents formatting. Every byte of indentation/comma style around
 * the new element is COPIED from a real neighbour already in the file
 * (empty array: no neighbour exists, so the new element sits with no
 * padding at all, matching this file's own "[value]" convention for that
 * case) -- never re-derived from a rule this project would have to keep in
 * sync with whatever the real files' own formatting is.
 */
export function insertArrayElement(src: string, path: JsonPath, index: number, value: unknown): string {
  const arr = locate(src, path);
  if (src[arr.start] !== "[") throw new Error(`expected an array at ${JSON.stringify(path)}`);

  const { elements, leadingGaps } = walkArray(src, arr.start);
  if (index < 0 || index > elements.length) {
    throw new Error(`insert index ${index} is out of range for an array of ${elements.length} element(s)`);
  }

  const literal = JSON.stringify(value);

  if (elements.length === 0) {
    return src.slice(0, arr.start + 1) + literal + src.slice(arr.start + 1);
  }

  if (index === elements.length) {
    // Append: reuse the gap that currently precedes the CURRENT last
    // element as the separator style between it and the new one -- for a
    // single-element array there is no inter-element pair to copy, so the
    // array's own lead-in gap (leadingGaps[0], identical in practice under
    // consistent indentation) stands in.
    const gap = leadingGaps[elements.length - 1]!;
    const lastEnd = elements[elements.length - 1]!.end;
    return src.slice(0, lastEnd) + "," + gap + literal + src.slice(lastEnd);
  }

  // Insert before an existing element: splice `literal + "," + <the gap
  // that already precedes it>` directly at its own start. The gap that
  // used to precede it now precedes the NEW element instead (unchanged,
  // untouched bytes); a fresh copy of the identical gap text separates the
  // new element from the old one that follows it.
  const gap = leadingGaps[index]!;
  const at = elements[index]!.start;
  return src.slice(0, at) + literal + "," + gap + src.slice(at);
}

/** The exact inverse of insertArrayElement at the same index. */
export function removeArrayElement(src: string, path: JsonPath, index: number): string {
  const arr = locate(src, path);
  if (src[arr.start] !== "[") throw new Error(`expected an array at ${JSON.stringify(path)}`);

  const { elements } = walkArray(src, arr.start);
  if (index < 0 || index >= elements.length) throw new Error(`index ${index} is not present`);

  if (elements.length === 1) {
    return src.slice(0, arr.start + 1) + src.slice(elements[0]!.end === arr.start + 1 ? arr.start + 1 : locate(src, path).end - 1);
  }

  if (index === 0) {
    // No comma PRECEDES the first element -- remove it plus the comma and
    // gap that follow it instead (the one leading into the new first
    // element), which is the exact inverse of insertArrayElement's own
    // index-0 splice.
    return src.slice(0, elements[0]!.start) + src.slice(elements[1]!.start);
  }

  return src.slice(0, elements[index - 1]!.end) + src.slice(elements[index]!.end);
}

interface ArrayWalk { elements: Span[]; leadingGaps: string[]; }

/**
 * Walks every element of the array starting at `arrStart` (the position of
 * `[`), recording each element's own [start,end) span AND the raw gap text
 * immediately preceding it -- `leadingGaps[0]` is the array's own lead-in
 * (between `[` and the first element, never a comma), `leadingGaps[k]` for
 * k>=1 is the whitespace AFTER the comma that precedes element k (the comma
 * character itself is consumed separately, never included in a gap
 * string). One more entry than `elements.length` is NOT produced -- the
 * trailing gap before `]` is discarded (nothing needs to reuse it: removal
 * only ever excises up to an element's own `.end`, and insertion never
 * splices after the last element's trailing gap, only right after its
 * `.end` and before that gap).
 *
 * Assumes this project's own real formatting: a comma immediately follows
 * its value with no space before it (confirmed across every real map.json
 * this file's own corpus gate walks). A value whose start character is not
 * a recognised JSON value start (after whitespace-skipping) throws rather
 * than silently mis-parsing a stray character as a zero-length element --
 * the failure mode a space-before-comma file would otherwise hit.
 */
function walkArray(src: string, arrStart: number): ArrayWalk {
  const elements: Span[] = [];
  const leadingGaps: string[] = [];
  const VALUE_START = /["{\[\-0-9tfn]/;

  let cursor = arrStart + 1;
  while (true) {
    const elemStart = skipWs(src, cursor);
    if (src[elemStart] === "]") { leadingGaps.push(src.slice(cursor, elemStart)); break; }
    if (!VALUE_START.test(src[elemStart] ?? "")) {
      throw new Error(`malformed array element (unsupported formatting) at offset ${elemStart}`);
    }
    const elemEnd = valueEnd(src, elemStart);
    leadingGaps.push(src.slice(cursor, elemStart));
    elements.push({ start: elemStart, end: elemEnd });
    cursor = src[elemEnd] === "," ? elemEnd + 1 : elemEnd;
  }

  return { elements, leadingGaps };
}
```

Note the `removeArrayElement`-on-the-only-element branch above has a redundant conditional (`elements[0]!.end === arr.start + 1 ? ... : ...`) left over from working out the collapse-to-`[]` logic — **simplify it before committing**: the correct, simpler form is just

```ts
  if (elements.length === 1) {
    return src.slice(0, arr.start + 1) + src.slice(arr.end - 1);
  }
```

using `arr.end` (already computed by the `locate` call at the top of the function) directly — verify this against the test "removeArrayElement on the LAST remaining element collapses to a bare []" before moving on; do not leave the redundant form in.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/write/jsonEdit.test.ts`
Expected: PASS, all tests (the pre-existing `editJson` tests plus every new one above), including the real-corpus gate test (confirm with `--reporter=verbose` that it actually ran against all ~1,209 maps, not skipped).

- [ ] **Step 5: Run the full core suite**

Run: `npx vitest run packages/core`
Expected: PASS.

- [ ] **Step 6: Teeth-proof**

Temporarily change `walkArray`'s comma-consumption line to always treat the next character as NOT a comma (`cursor = elemEnd;` unconditionally), confirm the "appends after the last element" test now produces garbled output (the walk misreads element boundaries) and fails, then restore. Separately, temporarily drop the `VALUE_START` guard entirely, and confirm — by reasoning, since no current test fixture has space-before-comma formatting — that this guard is currently *unexercised* by the given tests; if so, add ONE synthetic test with a space-before-comma fixture (e.g. `'[ "a" , "b" ]'`) asserting `insertArrayElement` throws a clear error rather than corrupting the array, so the guard has real teeth before this task is considered done.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/write/jsonEdit.ts packages/core/test/write/jsonEdit.test.ts
git commit -m "feat(core): insertArrayElement/removeArrayElement -- explicit, formatting-preserving array edits"
```

---

## Task 4: The save funnel and diff preview

**Files:**
- Create: `packages/core/src/write/save.ts`
- Create: `packages/core/src/write/diff.ts`
- Test: `packages/core/test/write/save.test.ts`
- Test: `packages/core/test/write/diff.test.ts`

`EditSession` is defined here (server-side per this plan's own architecture note — see the top of this document). It holds enough to call `guardLayoutSave`/`guardMapSave`, `planBlockdataWrite`/`planBorderWrite`, and to splice `map.json` via `editJson`/`insertArrayElement`/`removeArrayElement`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/write/save.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planSave, commitSave, type EditSession } from "../../src/write/save.js";
import { encodeBlocks } from "../../src/load/blocks.js";
import { defaultProfile } from "../../src/config/engine.js";
import type { Block, Layout } from "../../src/model/types.js";
import type { MapData } from "../../src/load/maps.js";
import type { Project } from "../../src/project.js";

const profile = defaultProfile("pokeemerald");
const LAYOUT: Layout = {
  id: "LAYOUT_TEST", name: "Test_Layout", width: 2, height: 2,
  borderWidth: 2, borderHeight: 2, primaryTileset: "x", secondaryTileset: "y",
  borderFilepath: "border.bin", blockdataFilepath: "map.bin",
};
const MAP_JSON = `{
  "id": "MAP_TEST",
  "name": "Test",
  "layout": "LAYOUT_TEST",
  "music": "MUS_ROUTE101",
  "region_map_section": "MAPSEC_TEST",
  "map_type": "MAP_TYPE_ROUTE",
  "weather": "WEATHER_NONE",
  "connections": 0,
  "object_events": [],
  "warp_events": [],
  "coord_events": [],
  "bg_events": []
}`;

function stubProject(root: string): Project {
  const unused = (fn: string) => (): never => { throw new Error(`stub: ${fn} should not be called`); };
  return {
    paths: { root, mapJson: (n: string) => `${root}/${n}.json` } as unknown as Project["paths"],
    profile,
    constants: unused("constants") as unknown as Project["constants"],
    layouts: [LAYOUT],
    groups: unused("groups") as unknown as Project["groups"],
    layoutByName: (n) => (n === LAYOUT.name ? LAYOUT : undefined),
    layoutById: (id) => (id === LAYOUT.id ? LAYOUT : undefined),
    layoutForMap: () => LAYOUT,
    splitFor: () => ({ version: "emerald", tiles: 512, metatiles: 512, pals: 6 }),
    tileset: () => ({ symbol: "x", isSecondary: false, metatileCount: 512, tiles: {} as any, palettes: [], attributes: [], metatile: () => [], layerType: () => 0, behavior: () => 0 }),
    tilesetSymbols: () => [],
    map: unused("map"),
    mapNames: () => ["Test"],
  };
}

const roots: string[] = [];
function tempProject(): { root: string; proj: Project } {
  const root = mkdtempSync(join(tmpdir(), "pokemap-save-"));
  roots.push(root);
  const blocks: Block[] = Array.from({ length: 4 }, () => ({ metatileId: 1, collision: 0, elevation: 3 }));
  const border: Block[] = Array.from({ length: 4 }, () => ({ metatileId: 0, collision: 0, elevation: 0 }));
  writeFileSync(join(root, "map.bin"), encodeBlocks(blocks, profile));
  writeFileSync(join(root, "border.bin"), encodeBlocks(border, profile));
  writeFileSync(join(root, "Test.json"), MAP_JSON);
  return { root, proj: stubProject(root) };
}
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

function baseSession(root: string): EditSession {
  const blocks: Block[] = Array.from({ length: 4 }, () => ({ metatileId: 1, collision: 0, elevation: 3 }));
  const border: Block[] = Array.from({ length: 4 }, () => ({ metatileId: 0, collision: 0, elevation: 0 }));
  const map: MapData = JSON.parse(MAP_JSON.replace(/"connections": 0/, '"connections": []'));
  return {
    mapName: "Test", layout: LAYOUT, blocks, border, map,
    // originalBlocks/originalMap point at the SAME objects `blocks`/`map`
    // above at construction time -- every test below that edits the
    // session reassigns `session.blocks = session.blocks.map(...)` (a NEW
    // array), never mutates the existing one in place, so this closure
    // variable stays the untouched "session opened with" snapshot exactly
    // as EditSession's own doc comment requires. A test that ever mutates
    // `blocks`/`border`/`map` in place instead of reassigning would need
    // its own explicit deep copy here -- none currently does.
    originalBlocks: blocks, originalMap: map,
    originalMapJson: MAP_JSON, jsonEdits: [], insertOps: [], removeOps: [], isDirty: false,
  };
}

describe("planSave / commitSave", () => {
  it("planSave never writes -- safe to call on every keystroke", () => {
    const { root, proj } = tempProject();
    const session = { ...baseSession(root), blocks: baseSession(root).blocks.map((b, i) => (i === 0 ? { ...b, metatileId: 5 } : b)) };
    planSave(proj, session);
    expect(readFileSync(join(root, "map.bin"))).toEqual(encodeBlocks(baseSession(root).blocks, profile));
  });

  it("an unedited session produces a plan with zero changes", () => {
    const { root, proj } = tempProject();
    const plan = planSave(proj, baseSession(root));
    expect(plan.changes).toEqual([]);
    expect(plan.refusals).toEqual([]);
  });

  it("an edited block produces exactly one binary change, summarised", () => {
    const { root, proj } = tempProject();
    const session = baseSession(root);
    session.blocks = session.blocks.map((b, i) => (i === 0 ? { ...b, metatileId: 5 } : b));
    session.isDirty = true;
    const plan = planSave(proj, session);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]!.kind).toBe("binary");
    expect(plan.changes[0]!.summary).toMatch(/1 block/);
  });

  it("commitSave refuses a plan containing refusals, and writes nothing", () => {
    const { root, proj } = tempProject();
    const session = baseSession(root);
    session.blocks = session.blocks.map((b) => ({ ...b, metatileId: 999 }));
    session.isDirty = true;
    const plan = planSave(proj, session);
    expect(plan.refusals.length).toBeGreaterThan(0);
    const before = readFileSync(join(root, "map.bin"));
    expect(() => commitSave(proj, plan)).toThrow(/refus/i);
    expect(readFileSync(join(root, "map.bin"))).toEqual(before);
  });

  it("commitSave writes exactly the changed files, byte for byte, and nothing else in the directory", () => {
    const { root, proj } = tempProject();
    const session = baseSession(root);
    session.blocks = session.blocks.map((b, i) => (i === 0 ? { ...b, metatileId: 5 } : b));
    session.isDirty = true;
    const plan = planSave(proj, session);
    commitSave(proj, plan);
    expect(readFileSync(join(root, "map.bin"))).toEqual(encodeBlocks(session.blocks, profile));
    expect(readFileSync(join(root, "border.bin"))).toEqual(encodeBlocks(session.border, profile));
    expect(readFileSync(join(root, "Test.json"), "utf8")).toBe(MAP_JSON); // untouched -- no json edit was staged
  });

  it("a jsonEdits-only session (no block change) produces exactly one json change, and map.bin is untouched", () => {
    const { root, proj } = tempProject();
    const session = baseSession(root);
    session.jsonEdits = [{ path: ["music"], value: "MUS_NEW" }];
    session.isDirty = true;
    const plan = planSave(proj, session);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]!.kind).toBe("json");
    commitSave(proj, plan);
    expect(readFileSync(join(root, "Test.json"), "utf8")).toContain("MUS_NEW");
    expect(readFileSync(join(root, "map.bin"))).toEqual(encodeBlocks(session.blocks, profile));
  });

  it("a session with insertOps stages an array insert as its own json change, applied ON TOP of scalar jsonEdits in the same commit", () => {
    const { root, proj } = tempProject();
    const session = baseSession(root);
    session.jsonEdits = [{ path: ["music"], value: "MUS_NEW" }];
    session.insertOps = [{ path: ["object_events"], index: 0, value: { graphics_id: "X" } }];
    session.isDirty = true;
    const plan = planSave(proj, session);
    commitSave(proj, plan);
    const written = readFileSync(join(root, "Test.json"), "utf8");
    expect(written).toContain("MUS_NEW");
    expect(written).toContain('"graphics_id":"X"');
  });

  it("a session with a scriptAppend produces exactly one text change, and commitSave appends it to the real target file with exactly one blank line separating it from existing content", () => {
    const { root, proj } = tempProject();
    const scriptsPath = join(root, "scripts.inc");
    writeFileSync(scriptsPath, "ExistingLabel::\n\tend\n");
    const session = baseSession(root);
    session.scriptAppends = [{ path: scriptsPath, text: "NewLabel::\n\tend\n" }];
    session.isDirty = true;
    const plan = planSave(proj, session);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]!.kind).toBe("text");
    commitSave(proj, plan);
    expect(readFileSync(scriptsPath, "utf8")).toBe("ExistingLabel::\n\tend\n\nNewLabel::\n\tend\n");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/write/save.test.ts`
Expected: FAIL — `packages/core/src/write/save.ts` does not exist.

- [ ] **Step 3: Implement**

Create `packages/core/src/write/save.ts`:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import type { Project } from "../project.js";
import type { Block, Layout } from "../model/types.js";
import type { MapData } from "../load/maps.js";
import { guardLayoutSave, guardMapSave, type Refusal } from "./guards.js";
import { planBlockdataWrite, planBorderWrite } from "./binary.js";
import { editJson, insertArrayElement, removeArrayElement, type JsonEdit, type JsonPath } from "./jsonEdit.js";

export interface InsertOp { path: JsonPath; index: number; value: unknown; }
export interface RemoveOp { path: JsonPath; index: number; }
/** A plain-text append targeting a NON-json decomp file -- currently only
 *  `scripts.inc` (Task 17's wild-sign write path). Deliberately NOT a
 *  JsonEdit/InsertOp: a `.inc` script file has no JSON structure for
 *  jsonEdit.ts's splice machinery to operate on, and an append is already
 *  exact and lossless with no re-serialisation risk (I2 concerns JSON
 *  documents specifically; a plain-text append changes nothing it doesn't
 *  touch by construction). */
export interface ScriptAppend { path: string; text: string; }

/**
 * The open map's current, possibly-edited state, plus enough of its
 * ORIGINAL state to guard against (guardMapSave needs the map/blocks
 * BEFORE this session's edits, not just after) and to splice against
 * (`originalMapJson` is the raw text `editJson`/`insertArrayElement`/
 * `removeArrayElement` all operate on -- I2 forbids ever re-serialising the
 * whole document, so the raw source text is not optional scaffolding, it
 * is the only thing that can be written back).
 *
 * Lives server-side (see this plan's own architecture note) -- the browser
 * never holds one of these directly, it only ever sees the JSON-safe
 * projection the server sends back after each edit op.
 */
export interface EditSession {
  mapName: string;
  layout: Layout;
  /** Current, possibly-edited interior blocks (parseBlocks's own full
   *  array, trailing block included -- see binary.ts's own doc comment for
   *  why this must never be reconstructed from width*height). */
  blocks: Block[];
  border: Block[];
  /** Current, possibly-edited map data -- object_events/warp_events/etc.
   *  reflect insertOps/removeOps already applied, so guardMapSave can read
   *  real "next" event positions off it directly. */
  map: MapData;
  /** The ORIGINAL blocks this session opened with -- guardMapSave's own
   *  warp-tile-moved check needs a prev/next pair, and `blocks` above is
   *  already "next" by the time a save is being planned. */
  originalBlocks: Block[];
  /** The ORIGINAL map data this session opened with, for the identical
   *  prev/next reason. */
  originalMap: MapData;
  /** Raw, unparsed map.json text -- the splice target for every jsonEdits/
   *  insertOps/removeOps entry below. */
  originalMapJson: string;
  /** Scalar field replacements, applied via editJson. */
  jsonEdits: JsonEdit[];
  /** Array insertions, applied via insertArrayElement, in the order given
   *  (each one's own `index` is relative to the array's state AFTER every
   *  earlier op in this same array has already applied -- callers building
   *  a session incrementally, one op at a time, naturally produce indices
   *  in this shape already; see Task 8's editSessions.ts). */
  insertOps: InsertOp[];
  removeOps: RemoveOp[];
  /** Optional (Task 4 predates Task 17's wild-sign feature; every EARLIER
   *  task's own EditSession fixtures construct one without this field, so
   *  it defaults to empty rather than becoming a required breaking change
   *  to every fixture already written into this plan) -- pending plain-text
   *  appends, currently only ever populated by Task 17's sign write path. */
  scriptAppends?: ScriptAppend[];
  isDirty: boolean;
}

export interface PendingChange {
  path: string;
  kind: "json" | "binary" | "text";
  summary: string;
}

export interface SavePlan {
  session: EditSession;
  changes: PendingChange[];
  refusals: Refusal[];
}

/**
 * Computes what a save WOULD do, without writing. Safe to call on every
 * keystroke (I6's "no autosave" half is enforced by never being the thing
 * that writes; `commitSave` is the only writer, and it is always an
 * explicit, separate call).
 */
export function planSave(proj: Project, session: EditSession): SavePlan {
  const refusals: Refusal[] = [
    ...guardLayoutSave(proj, session.layout, session.blocks, session.border),
    ...guardMapSave(proj, session.layout, session.originalMap, session.map, session.originalBlocks, session.blocks),
  ];

  const changes: PendingChange[] = [];

  const blockPlan = planBlockdataWrite(proj.paths.root, session.layout, session.blocks, proj.profile);
  if (blockPlan) {
    changes.push({
      path: blockPlan.path, kind: "binary",
      summary: `${session.layout.blockdataFilepath} -- ${blockPlan.changedBlocks.length} block${blockPlan.changedBlocks.length === 1 ? "" : "s"} changed`,
    });
  }

  const borderPlan = planBorderWrite(proj.paths.root, session.layout, session.border, proj.profile);
  if (borderPlan) {
    changes.push({
      path: borderPlan.path, kind: "binary",
      summary: `${session.layout.borderFilepath} -- ${borderPlan.changedBlocks.length} block${borderPlan.changedBlocks.length === 1 ? "" : "s"} changed`,
    });
  }

  const jsonText = applyJsonOps(session);
  if (jsonText !== session.originalMapJson) {
    const opCount = session.jsonEdits.length + session.insertOps.length + session.removeOps.length;
    changes.push({
      path: proj.paths.mapJson(session.mapName), kind: "json",
      summary: `${session.mapName}.json -- ${opCount} field edit${opCount === 1 ? "" : "s"}`,
    });
  }

  // Every entry here was placed by an explicit, already-guarded write (e.g.
  // Task 17's addWildSign, checked by guardSignWrite BEFORE it ever reaches
  // a session) -- unlike jsonText above, there is no "compare against
  // original" step, because scriptAppends never exist unless the player
  // explicitly added one.
  for (const append of session.scriptAppends ?? []) {
    changes.push({
      path: append.path, kind: "text",
      summary: `${append.path} -- append ${append.text.split("\n").length} line${append.text.split("\n").length === 1 ? "" : "s"}`,
    });
  }

  return { session, changes, refusals };
}

/**
 * The ONLY function in this codebase that writes to a decomp path (I8),
 * other than sidecar.ts/dungeons.ts's own separate `.pokemap/` writers,
 * which are I8-exempt by design (they never touch a decomp data file).
 * Throws rather than writing anything when refusals are non-empty -- a UI
 * that simply does not RENDER a refusal cannot bypass this guard by
 * omission, the check lives here, not in whatever calls it.
 */
export function commitSave(proj: Project, plan: SavePlan): void {
  if (plan.refusals.length > 0) {
    throw new Error(`cannot save: ${plan.refusals.map((r) => `${r.code} (${r.subject})`).join(", ")}`);
  }
  const { session } = plan;

  const blockPlan = planBlockdataWrite(proj.paths.root, session.layout, session.blocks, proj.profile);
  if (blockPlan) writeFileSync(blockPlan.path, blockPlan.bytes);

  const borderPlan = planBorderWrite(proj.paths.root, session.layout, session.border, proj.profile);
  if (borderPlan) writeFileSync(borderPlan.path, borderPlan.bytes);

  const jsonText = applyJsonOps(session);
  if (jsonText !== session.originalMapJson) writeFileSync(proj.paths.mapJson(session.mapName), jsonText);

  // Read-concat-write, the same "read real state, write back the whole
  // file" shape as the map.json branch above -- NOT appendFileSync, so
  // Task 4's own noStrayWrites grep (which checks writeFileSync/writeFile
  // only) keeps covering every write this function makes with no second
  // exempted call shape to track.
  for (const append of session.scriptAppends ?? []) {
    const existing = readFileSync(append.path, "utf8");
    const sep = existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
    writeFileSync(append.path, existing + sep + append.text);
  }
}

/** jsonEdits (scalar replace) first, then insertOps, then removeOps --
 *  scalar replacement never shifts array indices, so it is always safe to
 *  apply before any structural change; insertOps are applied in the order
 *  given (see EditSession.insertOps's own doc comment on index semantics);
 *  removeOps last, highest index first within each distinct array path, so
 *  removing several elements from the same array in one commit does not
 *  invalidate a later removal's own index. */
function applyJsonOps(session: EditSession): string {
  let text = session.originalMapJson;
  if (session.jsonEdits.length > 0) text = editJson(text, session.jsonEdits);
  for (const op of session.insertOps) text = insertArrayElement(text, op.path, op.index, op.value);
  const removesByPath = new Map<string, number[]>();
  for (const op of session.removeOps) {
    const key = JSON.stringify(op.path);
    removesByPath.set(key, [...(removesByPath.get(key) ?? []), op.index]);
  }
  for (const [key, indices] of removesByPath) {
    const path = JSON.parse(key) as JsonPath;
    for (const index of [...indices].sort((a, b) => b - a)) text = removeArrayElement(text, path, index);
  }
  return text;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/write/save.test.ts`
Expected: PASS, 8/8.

- [ ] **Step 5: Write, run, and pass `diff.ts`'s own tests**

Create `packages/core/test/write/diff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatDiffText, formatDiffJson } from "../../src/write/diff.js";
import type { SavePlan } from "../../src/write/save.js";

const PLAN_WITH_CHANGES = {
  session: {} as any,
  changes: [
    { path: "/x/map.bin", kind: "binary" as const, summary: "map.bin -- 3 blocks changed" },
    { path: "/x/Test.json", kind: "json" as const, summary: "Test.json -- 1 field edit" },
  ],
  refusals: [],
};

const PLAN_WITH_REFUSAL = {
  session: {} as any,
  changes: [],
  refusals: [{ code: "metatile-out-of-range", message: "bad id 999", fix: "pick a real one", subject: "Test_Layout" }],
};

describe("formatDiffText", () => {
  it("lists every change with its own summary", () => {
    const text = formatDiffText(PLAN_WITH_CHANGES);
    expect(text).toContain("map.bin -- 3 blocks changed");
    expect(text).toContain("Test.json -- 1 field edit");
  });

  it("lists refusals with their fix text, and nothing else, when refusals are present", () => {
    const text = formatDiffText(PLAN_WITH_REFUSAL);
    expect(text).toContain("metatile-out-of-range");
    expect(text).toContain("pick a real one");
  });

  it("says nothing to save for an empty plan", () => {
    expect(formatDiffText({ session: {} as any, changes: [], refusals: [] })).toMatch(/nothing to save/i);
  });
});

describe("formatDiffJson", () => {
  it("round-trips changes and refusals as plain data, dropping the session (not JSON-safe / not the caller's business)", () => {
    const j = formatDiffJson(PLAN_WITH_CHANGES) as any;
    expect(j.changes).toHaveLength(2);
    expect(j.refusals).toEqual([]);
    expect(j.session).toBeUndefined();
  });
});
```

Run: `npx vitest run packages/core/test/write/diff.test.ts` — FAIL first (module missing), then create `packages/core/src/write/diff.ts`:

```ts
import type { SavePlan } from "./save.js";

/** Human-readable rendering for the CLI's `pokemap diff`. */
export function formatDiffText(plan: SavePlan): string {
  const lines: string[] = [];
  for (const c of plan.changes) lines.push(c.summary);
  for (const r of plan.refusals) lines.push(`REFUSED [${r.code}] ${r.subject}: ${r.message} -- ${r.fix}`);
  if (lines.length === 0) return "nothing to save";
  return lines.join("\n");
}

/** Structured rendering for the UI's SaveDialog -- deliberately drops
 *  `session` (not JSON-safe, and not the caller's business: the dialog
 *  renders what would change, not the raw edit state that produced it). */
export function formatDiffJson(plan: SavePlan): { changes: SavePlan["changes"]; refusals: SavePlan["refusals"] } {
  return { changes: plan.changes, refusals: plan.refusals };
}
```

Run again: PASS, 4/4.

- [ ] **Step 6: Run the full core suite**

Run: `npx vitest run packages/core`
Expected: PASS.

- [ ] **Step 7: Add the lint rule the coarse plan called for**

Requirement: "A lint rule forbids `writeFileSync`/`writeFile` anywhere under `packages/core/src/` except `write/save.ts` and `world/sidecar.ts` (and, as of Dungeon Mode, `world/dungeons.ts` too — update the exemption list)." This repo has no ESLint configured (confirmed: no `.eslintrc*`, no `eslint` in any `package.json`, across every prior plan's own review history in this project). Do not add an ESLint dependency just for one rule — instead, add a cheap, dependency-free grep-based check as its own vitest test, which this project's own established convention already favors over introducing new tooling for a single invariant (compare to how I5's corpus gate is a plain test, not a separate CI tool):

Create `packages/core/test/write/noStrayWrites.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ALLOWED = new Set([
  join("src", "write", "save.ts"),
  join("src", "world", "sidecar.ts"),
  join("src", "world", "dungeons.ts"),
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

describe("I8/I2 static check", () => {
  it("no file under packages/core/src writes to the filesystem except the sanctioned three", () => {
    const root = join(__dirname, "..", "..");
    const files = walk(join(root, "src"));
    const offenders: string[] = [];
    for (const f of files) {
      const rel = f.slice(root.length + 1);
      if (ALLOWED.has(rel)) continue;
      const text = readFileSync(f, "utf8");
      if (/\bwriteFileSync\s*\(|\bwriteFile\s*\(/.test(text)) offenders.push(rel);
    }
    expect(offenders, offenders.join(", ")).toEqual([]);
  });
});
```

Run: `npx vitest run packages/core/test/write/noStrayWrites.test.ts`
Expected: PASS, 1/1 (this also retroactively confirms Task 1-3's own files never snuck in a write call).

- [ ] **Step 8: Teeth-proof**

Temporarily add a bare `writeFileSync("x", "y")` call inside `packages/core/src/write/binary.ts` (a file NOT on the allow-list), confirm Step 7's new test fails naming it, then remove it. Separately, temporarily make `commitSave` skip the `plan.refusals.length > 0` check, confirm "commitSave refuses a plan containing refusals" fails, then restore.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/write/save.ts packages/core/src/write/diff.ts packages/core/test/write/save.test.ts packages/core/test/write/diff.test.ts packages/core/test/write/noStrayWrites.test.ts
git commit -m "feat(core): the save funnel -- planSave/commitSave, diff rendering, I8 static write-site check"
```

---

## Task 5: Undo/redo

**Files:**
- Create: `packages/core/src/edit/commands.ts`
- Test: `packages/core/test/edit/commands.test.ts`

Command pattern over an `EditSession` (Task 4). `commands.ts` owns the stack mechanics only — it knows nothing about painting or events specifically; Task 6/10's own server-side routes (Task 8) decide where a command's boundaries are (a whole paint stroke is one command because the route handler that applies a stroke pushes exactly one `EditCommand`, not because this file special-cases strokes).

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/edit/commands.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { EditCommandStack, type EditCommand } from "../../src/edit/commands.js";
import type { EditSession } from "../../src/write/save.js";
import type { Block } from "../../src/model/types.js";

function fakeSession(blocks: Block[]): EditSession {
  return {
    mapName: "Test", layout: {} as any, blocks, border: [], map: {} as any,
    originalBlocks: blocks.map((b) => ({ ...b })), originalMap: {} as any,
    originalMapJson: "{}", jsonEdits: [], insertOps: [], removeOps: [], isDirty: false,
  };
}

/** A minimal command: replaces session.blocks wholesale, storing enough to
 *  revert -- the same shape a real paint-stroke command (Task 6/8) uses. */
function setBlocksCommand(prev: Block[], next: Block[]): EditCommand {
  return {
    label: "paint",
    apply: (s) => { s.blocks = next; },
    revert: (s) => { s.blocks = prev; },
  };
}

describe("EditCommandStack", () => {
  it("apply mutates the session; undo reverts it exactly", () => {
    const session = fakeSession([{ metatileId: 1, collision: 0, elevation: 0 }]);
    const stack = new EditCommandStack();
    const prev = session.blocks;
    const next = [{ metatileId: 2, collision: 0, elevation: 0 }];
    stack.push(session, setBlocksCommand(prev, next));
    expect(session.blocks).toEqual(next);
    stack.undo(session);
    expect(session.blocks).toEqual(prev);
  });

  it("redo re-applies an undone command", () => {
    const session = fakeSession([{ metatileId: 1, collision: 0, elevation: 0 }]);
    const stack = new EditCommandStack();
    const prev = session.blocks;
    const next = [{ metatileId: 2, collision: 0, elevation: 0 }];
    stack.push(session, setBlocksCommand(prev, next));
    stack.undo(session);
    stack.redo(session);
    expect(session.blocks).toEqual(next);
  });

  it("pushing a new command after an undo discards the redo branch", () => {
    const session = fakeSession([{ metatileId: 1, collision: 0, elevation: 0 }]);
    const stack = new EditCommandStack();
    const a = [{ metatileId: 2, collision: 0, elevation: 0 }];
    const b = [{ metatileId: 3, collision: 0, elevation: 0 }];
    const c = [{ metatileId: 4, collision: 0, elevation: 0 }];
    stack.push(session, setBlocksCommand(session.blocks, a));
    stack.push(session, setBlocksCommand(a, b));
    stack.undo(session); // back to a
    stack.push(session, setBlocksCommand(a, c)); // branches away from b
    expect(session.blocks).toEqual(c);
    stack.redo(session); // nothing to redo -- b was discarded
    expect(session.blocks).toEqual(c);
  });

  it("undo is unbounded within a session -- undoing past the start is a no-op, not a throw", () => {
    const session = fakeSession([{ metatileId: 1, collision: 0, elevation: 0 }]);
    const stack = new EditCommandStack();
    expect(() => stack.undo(session)).not.toThrow();
    expect(session.blocks).toEqual([{ metatileId: 1, collision: 0, elevation: 0 }]);
  });

  it("isDirty is true after a push, false again after undoing back to the loaded state", () => {
    const session = fakeSession([{ metatileId: 1, collision: 0, elevation: 0 }]);
    const stack = new EditCommandStack();
    expect(stack.isDirty()).toBe(false);
    stack.push(session, setBlocksCommand(session.blocks, [{ metatileId: 2, collision: 0, elevation: 0 }]));
    expect(stack.isDirty()).toBe(true);
    stack.undo(session);
    expect(stack.isDirty()).toBe(false);
  });

  it("isDirty stays false across redo/undo cycles that return to the saved point, even after several pushes", () => {
    const session = fakeSession([{ metatileId: 1, collision: 0, elevation: 0 }]);
    const stack = new EditCommandStack();
    stack.push(session, setBlocksCommand(session.blocks, [{ metatileId: 2, collision: 0, elevation: 0 }]));
    stack.push(session, setBlocksCommand(session.blocks, [{ metatileId: 3, collision: 0, elevation: 0 }]));
    stack.undo(session);
    stack.undo(session);
    expect(stack.isDirty()).toBe(false);
  });

  it("markSaved() resets the clean point to the CURRENT position, not the original load -- isDirty goes false right after a save even with a full history behind it", () => {
    const session = fakeSession([{ metatileId: 1, collision: 0, elevation: 0 }]);
    const stack = new EditCommandStack();
    stack.push(session, setBlocksCommand(session.blocks, [{ metatileId: 2, collision: 0, elevation: 0 }]));
    stack.markSaved();
    expect(stack.isDirty()).toBe(false);
    stack.push(session, setBlocksCommand(session.blocks, [{ metatileId: 3, collision: 0, elevation: 0 }]));
    expect(stack.isDirty()).toBe(true);
    stack.undo(session); // back to the state markSaved() was called at
    expect(stack.isDirty()).toBe(false);
  });

  it("a stroke is one command -- undoing a multi-block paint reverts the WHOLE stroke in a single step", () => {
    // Simulates dragging a pencil across 40 tiles: the caller (Task 8's own
    // paint route) computes the FULL before/after block arrays for the
    // whole stroke and pushes ONE command, never one push per block.
    const start = Array.from({ length: 40 }, () => ({ metatileId: 0, collision: 0, elevation: 0 }));
    const session = fakeSession(start);
    const stack = new EditCommandStack();
    const strokeResult = start.map((b) => ({ ...b, metatileId: 7 })); // "painted" all 40 in one drag
    stack.push(session, setBlocksCommand(start, strokeResult));
    expect(session.blocks).toEqual(strokeResult);
    stack.undo(session);
    expect(session.blocks).toEqual(start); // ALL 40 reverted by one undo call
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/edit/commands.test.ts`
Expected: FAIL — `packages/core/src/edit/commands.ts` does not exist.

- [ ] **Step 3: Implement**

Create `packages/core/src/edit/commands.ts`:

```ts
import type { EditSession } from "../write/save.js";

export interface EditCommand {
  label: string;
  apply(session: EditSession): void;
  revert(session: EditSession): void;
}

/**
 * Unbounded undo/redo over one open EditSession. Owns only the stack
 * mechanics -- it has no idea what a "paint stroke" or "event move" is,
 * only that some caller decided one `EditCommand` is one undo step. A
 * stroke being a single command (not one per block) is a property of WHO
 * CALLS `push`, not of this class.
 *
 * `cleanIndex` is the stack position considered "matches what's on disk" --
 * `isDirty()` compares the current position against it, not against the
 * position the session first loaded at, so `markSaved()` (called right
 * after a successful `commitSave`) correctly moves the clean point forward
 * without needing to know or reset any of the session's own committed
 * blocks/map data (`planSave`/`commitSave` already read those live off the
 * session; the stack's only job is knowing WHETHER they differ from disk).
 */
export class EditCommandStack {
  private undoStack: EditCommand[] = [];
  private redoStack: EditCommand[] = [];
  private cleanIndex = 0;

  push(session: EditSession, command: EditCommand): void {
    command.apply(session);
    this.undoStack.push(command);
    this.redoStack = []; // pushing after an undo discards the redo branch
    session.isDirty = this.isDirty();
  }

  undo(session: EditSession): void {
    const command = this.undoStack.pop();
    if (!command) return; // unbounded but not infinite -- past the start is a no-op
    command.revert(session);
    this.redoStack.push(command);
    session.isDirty = this.isDirty();
  }

  redo(session: EditSession): void {
    const command = this.redoStack.pop();
    if (!command) return;
    command.apply(session);
    this.undoStack.push(command);
    session.isDirty = this.isDirty();
  }

  /** Call right after a successful commitSave. */
  markSaved(): void {
    this.cleanIndex = this.undoStack.length;
  }

  isDirty(): boolean {
    return this.undoStack.length !== this.cleanIndex;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/edit/commands.test.ts`
Expected: PASS, 8/8.

- [ ] **Step 5: Run the full core suite**

Run: `npx vitest run packages/core`
Expected: PASS.

- [ ] **Step 6: Teeth-proof**

Temporarily change `push` to NOT clear `this.redoStack`, confirm "pushing a new command after an undo discards the redo branch" fails (the stale `b` command becomes redoable again after `c` was pushed), then restore. Separately, temporarily make `markSaved()` set `this.cleanIndex = 0` (the bug it's meant to avoid), confirm "markSaved() resets the clean point to the CURRENT position, not the original load" fails, then restore.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/edit/commands.ts packages/core/test/edit/commands.test.ts
git commit -m "feat(core): EditCommandStack -- unbounded undo/redo, dirty tracking anchored to last save"
```

---

## Task 6: Paint tools

**Files:**
- Create: `packages/core/src/edit/paint.ts`
- Test: `packages/core/test/edit/paint.test.ts`

Every tool is a pure function over a flat `Block[]` (row-major, `index = y * gridWidth + x`, the exact layout `parseBlocks`/`encodeBlocks` already use — no new grid representation invented). **No tool validates split range** — that is `guardLayoutSave`'s job (Task 1) at save time, not paint's job at edit time; this keeps every function here a plain data transform with no `Project`/`EngineProfile` dependency at all.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/edit/paint.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { paintCells, floodFill, readBlock, shiftGrid, type Stamp } from "../../src/edit/paint.js";
import type { Block } from "../../src/model/types.js";

function grid(w: number, h: number, fill: number): Block[] {
  return Array.from({ length: w * h }, () => ({ metatileId: fill, collision: 0, elevation: 0 }));
}

describe("readBlock (dropper)", () => {
  it("reads id, collision and elevation together, at (x,y) in a gridWidth-wide grid", () => {
    const blocks = grid(4, 3, 1);
    blocks[2 * 4 + 1] = { metatileId: 42, collision: 2, elevation: 5 }; // (x=1,y=2)
    expect(readBlock(blocks, 4, 1, 2)).toEqual({ metatileId: 42, collision: 2, elevation: 5 });
  });

  it("returns undefined outside the grid", () => {
    expect(readBlock(grid(4, 3, 1), 4, 10, 10)).toBeUndefined();
    expect(readBlock(grid(4, 3, 1), 4, -1, 0)).toBeUndefined();
  });
});

describe("paintCells (pencil / rect)", () => {
  it("a single-cell stamp at one target cell paints only that cell's metatileId, preserving its own collision/elevation", () => {
    const blocks = grid(3, 3, 1);
    blocks[4] = { metatileId: 1, collision: 3, elevation: 7 }; // (1,1) has non-default collision/elevation
    const stamp: Stamp = { width: 1, height: 1, cells: [{ metatileId: 99 }] }; // no collision/elevation -> preserve
    const out = paintCells(blocks, 3, 3, [{ x: 1, y: 1 }], stamp, 1, 1);
    expect(out[4]).toEqual({ metatileId: 99, collision: 3, elevation: 7 });
    expect(out).not.toBe(blocks); // never mutates the input array
    expect(blocks[4]).toEqual({ metatileId: 1, collision: 3, elevation: 7 }); // input genuinely untouched
  });

  it("a full block stamp (id+collision+elevation, e.g. from the dropper) overwrites all three fields", () => {
    const blocks = grid(3, 3, 1);
    const stamp: Stamp = { width: 1, height: 1, cells: [{ metatileId: 5, collision: 2, elevation: 9 }] };
    const out = paintCells(blocks, 3, 3, [{ x: 0, y: 0 }], stamp, 0, 0);
    expect(out[0]).toEqual({ metatileId: 5, collision: 2, elevation: 9 });
  });

  it("painting a multi-cell selection tiles the source pattern across the target cells", () => {
    // A 2x1 stamp [A, B] painted across 4 cells in a row must repeat A,B,A,B.
    const blocks = grid(4, 1, 0);
    const stamp: Stamp = { width: 2, height: 1, cells: [{ metatileId: 10 }, { metatileId: 20 }] };
    const targets = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];
    const out = paintCells(blocks, 4, 1, targets, stamp, 0, 0);
    expect(out.map((b) => b.metatileId)).toEqual([10, 20, 10, 20]);
  });

  it("stamp tiling is anchored at the given origin, not at the target cell nearest (0,0) -- a drag starting mid-grid still tiles from its own start", () => {
    const blocks = grid(4, 1, 0);
    const stamp: Stamp = { width: 2, height: 1, cells: [{ metatileId: 10 }, { metatileId: 20 }] };
    // Drag starts at x=1 (the origin), covering x=1..3.
    const targets = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];
    const out = paintCells(blocks, 4, 1, targets, stamp, 1, 0);
    // x=1 -> (1-1)%2=0 -> A; x=2 -> (2-1)%2=1 -> B; x=3 -> (3-1)%2=0 -> A.
    expect(out.map((b) => b.metatileId)).toEqual([0, 10, 20, 10]); // x=0 untouched (0)
  });

  it("ignores a target cell outside the grid rather than throwing", () => {
    const blocks = grid(2, 2, 0);
    const stamp: Stamp = { width: 1, height: 1, cells: [{ metatileId: 9 }] };
    expect(() => paintCells(blocks, 2, 2, [{ x: 99, y: 99 }], stamp, 0, 0)).not.toThrow();
  });
});

describe("floodFill (bucket)", () => {
  it("is 4-connected on metatile id, bounded by the map edge", () => {
    // A 3x3 grid, id=1 everywhere except a plus-shaped id=2 region in the
    // middle row/column, id=1 in the four corners. Filling from center
    // must NOT leak diagonally into the corners.
    const blocks = grid(3, 3, 1);
    for (const [x, y] of [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]) blocks[y * 3 + x] = { metatileId: 2, collision: 0, elevation: 0 };
    const out = floodFill(blocks, 3, 3, 1, 1, { metatileId: 7 });
    expect(out.map((b) => b.metatileId)).toEqual([1, 7, 1, 7, 7, 7, 1, 7, 1]);
  });

  it("filling a region already at the target id is a no-op (same array contents, still a new array)", () => {
    const blocks = grid(3, 3, 1);
    const out = floodFill(blocks, 3, 3, 0, 0, { metatileId: 1 });
    expect(out.map((b) => b.metatileId)).toEqual(blocks.map((b) => b.metatileId));
  });

  it("is iterative, not recursive -- fills a large single-id region (60x60 = 3,600 cells) without a stack overflow", () => {
    const blocks = grid(60, 60, 3);
    expect(() => floodFill(blocks, 60, 60, 0, 0, { metatileId: 8 })).not.toThrow();
    const out = floodFill(blocks, 60, 60, 0, 0, { metatileId: 8 });
    expect(out.every((b) => b.metatileId === 8)).toBe(true);
  });
});

describe("shiftGrid", () => {
  it("shifts every block by (dx,dy), wrapping around the edges (Porymap's own Shift Layout semantics -- events do not move, this only touches the returned Block[])", () => {
    const blocks: Block[] = [
      { metatileId: 1, collision: 0, elevation: 0 }, { metatileId: 2, collision: 0, elevation: 0 },
      { metatileId: 3, collision: 0, elevation: 0 }, { metatileId: 4, collision: 0, elevation: 0 },
    ]; // 2x2: [[1,2],[3,4]]
    const out = shiftGrid(blocks, 2, 2, 1, 0); // shift right by 1, wrap
    expect(out.map((b) => b.metatileId)).toEqual([2, 1, 4, 3]);
  });

  it("shifting by the full grid width/height is the identity", () => {
    const blocks = grid(3, 3, 0).map((b, i) => ({ ...b, metatileId: i }));
    const out = shiftGrid(blocks, 3, 3, 3, 3);
    expect(out.map((b) => b.metatileId)).toEqual(blocks.map((b) => b.metatileId));
  });

  it("preserves a trailing block beyond width*height untouched (the 19-layout shape) -- shift only ever touches the first width*height cells", () => {
    const blocks: Block[] = [
      { metatileId: 1, collision: 0, elevation: 0 }, { metatileId: 2, collision: 0, elevation: 0 },
      { metatileId: 999, collision: 1, elevation: 1 }, // the trailing block, index 2, past a 2x1 grid
    ];
    const out = shiftGrid(blocks, 2, 1, 1, 0);
    expect(out[2]).toEqual({ metatileId: 999, collision: 1, elevation: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/edit/paint.test.ts`
Expected: FAIL — `packages/core/src/edit/paint.ts` does not exist.

- [ ] **Step 3: Implement**

Create `packages/core/src/edit/paint.ts`:

```ts
import type { Block } from "../model/types.js";

export interface StampCell { metatileId: number; collision?: number; elevation?: number; }
/** Row-major, `cells[y * width + x]`. A 1x1 stamp is the common pencil case;
 *  a larger one is a copied rectangle from the palette or another part of
 *  the map (the dropper's own "reads id, collision and elevation together"
 *  output is a 1x1 stamp with both fields present). */
export interface Stamp { width: number; height: number; cells: StampCell[]; }

const inBounds = (gridWidth: number, gridHeight: number, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < gridWidth && y < (gridHeight === undefined ? Infinity : gridHeight);

export function readBlock(blocks: Block[], gridWidth: number, x: number, y: number): Block | undefined {
  if (x < 0 || y < 0 || x >= gridWidth) return undefined;
  return blocks[y * gridWidth + x];
}

/**
 * Paints `stamp`, tiled, across every cell in `targets` that falls inside
 * the grid -- an out-of-bounds target is silently skipped (a drag that
 * crosses the map edge should not throw mid-stroke). Tiling is anchored at
 * `(originX, originY)` -- the drag's own start point, or a rect's own
 * corner -- not at the grid's (0,0), so a stamp painted starting mid-grid
 * still begins its own pattern at its first painted cell.
 *
 * A stamp cell missing `collision`/`elevation` preserves whatever the
 * TARGET block already had there -- an ordinary metatile paint never
 * disturbs collision/elevation painted separately (Task 8's own
 * requirement: "painting collision must not disturb the id" holds by the
 * same symmetric rule here, the other direction).
 *
 * Never mutates its input -- returns a fresh array every call, copying
 * every untouched block too (not just the painted ones), so a caller
 * holding onto the original `blocks` reference (e.g. EditSession.blocks
 * before a command applies) never sees it change out from under it.
 */
export function paintCells(
  blocks: Block[], gridWidth: number, gridHeight: number,
  targets: { x: number; y: number }[], stamp: Stamp, originX: number, originY: number,
): Block[] {
  const out = blocks.map((b) => ({ ...b }));
  for (const t of targets) {
    if (t.x < 0 || t.y < 0 || t.x >= gridWidth || t.y >= gridHeight) continue;
    const sx = ((t.x - originX) % stamp.width + stamp.width) % stamp.width;
    const sy = ((t.y - originY) % stamp.height + stamp.height) % stamp.height;
    const cell = stamp.cells[sy * stamp.width + sx];
    if (!cell) continue;
    const index = t.y * gridWidth + t.x;
    const existing = out[index];
    if (!existing) continue;
    out[index] = {
      metatileId: cell.metatileId,
      collision: cell.collision ?? existing.collision,
      elevation: cell.elevation ?? existing.elevation,
    };
  }
  return out;
}

/**
 * 4-connected flood fill from `(x,y)`, bounded by the grid edge, replacing
 * every metatile-id-connected cell with `replacement`. Iterative (an
 * explicit stack array, not a recursive call) -- some real layouts are
 * 60x80+, and a recursive fill would blow the call stack on one.
 */
export function floodFill(blocks: Block[], gridWidth: number, gridHeight: number, x: number, y: number, replacement: StampCell): Block[] {
  const start = readBlock(blocks, gridWidth, x, y);
  if (!start) return blocks.map((b) => ({ ...b }));
  const targetId = start.metatileId;

  const out = blocks.map((b) => ({ ...b }));
  const visited = new Uint8Array(gridWidth * gridHeight);
  const stack: [number, number][] = [[x, y]];

  while (stack.length > 0) {
    const [cx, cy] = stack.pop()!;
    if (cx < 0 || cy < 0 || cx >= gridWidth || cy >= gridHeight) continue;
    const index = cy * gridWidth + cx;
    if (visited[index]) continue;
    const here = out[index];
    if (!here || here.metatileId !== targetId) continue;
    visited[index] = 1;
    out[index] = { metatileId: replacement.metatileId, collision: replacement.collision ?? here.collision, elevation: replacement.elevation ?? here.elevation };
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }

  return out;
}

/**
 * Moves the whole `gridWidth x gridHeight` region by `(dx, dy)`, wrapping
 * at the edges -- Porymap's own "Shift Layout" semantics (a torus, not a
 * clip-and-fill). Only ever touches indices `0` through
 * `gridWidth*gridHeight - 1`; a trailing block beyond that (the 19-layout
 * shape binary.ts's own doc comment describes) is copied through
 * unchanged, never touched by the shift.
 *
 * Events are not part of this function's input at all -- "without moving
 * events" is automatically true because this only ever returns a `Block[]`
 * and the caller (Task 10's own event-aware wiring) never feeds this
 * function anything event-shaped to begin with.
 */
export function shiftGrid(blocks: Block[], gridWidth: number, gridHeight: number, dx: number, dy: number): Block[] {
  const gridCount = gridWidth * gridHeight;
  const out = blocks.map((b) => ({ ...b }));
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const srcX = ((x - dx) % gridWidth + gridWidth) % gridWidth;
      const srcY = ((y - dy) % gridHeight + gridHeight) % gridHeight;
      const src = blocks[srcY * gridWidth + srcX];
      if (src) out[y * gridWidth + x] = { ...src };
    }
  }
  // Anything at or beyond gridCount (a trailing block) is already an exact
  // copy from the initial `blocks.map` above and was never touched by the
  // loop, which only ever writes indices < gridCount.
  void gridCount;
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/edit/paint.test.ts`
Expected: PASS, 13/13.

- [ ] **Step 5: Run the full core suite**

Run: `npx vitest run packages/core`
Expected: PASS.

- [ ] **Step 6: Teeth-proof**

Temporarily change `floodFill`'s neighbour push to only `[cx + 1, cy], [cx, cy + 1]` (dropping the two negative-direction neighbours), confirm the 4-connected plus-shape test now fills incompletely and fails, then restore. Separately, temporarily change `floodFill` to a recursive implementation (`fill(cx,cy)` calling itself instead of using `stack`), confirm the 60x60 iterative test now throws a stack overflow (`RangeError: Maximum call stack size exceeded` or similar) on this machine — if it does NOT throw at 60x60 on your machine's stack size, increase the grid until it reliably does, and use that size for the permanent test, so this teeth-proof is real rather than assumed — then restore the iterative version.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/edit/paint.ts packages/core/test/edit/paint.test.ts
git commit -m "feat(core): paint tools -- pencil/bucket/dropper/rect via paintCells+floodFill+readBlock, plus shiftGrid"
```

---

## Task 7: Event editing (core)

**Files:**
- Create: `packages/core/src/edit/events.ts`
- Test: `packages/core/test/edit/events.test.ts`

Moved ahead of the coarse plan's own numbering (it had this as half of a combined "Task 10" with the UI) — Task 8's server routes need this file to exist first, and the core/UI split every other feature in this codebase already uses (Feature A/B/C's own `core` functions always land before the server routes and UI that call them) applies here too.

Read `packages/core/src/load/maps.ts` first — `MapData`'s raw JSON field names (`object_events`, `warp_events`, `coord_events`, `bg_events`) and each event type's own raw field names (`ObjectEvent`: `graphics_id`,`x`,`y`,`elevation`,`movement_type`,`movement_range_x`,`movement_range_y`,`trainer_type`,`trainer_sight_or_berry_tree_id`,`script`,`flag`; `WarpEvent`: `x`,`y`,`elevation`,`dest_map`,`dest_warp_id`) are what every `JsonPath`/inserted object literal below must match exactly — `editJson`/`insertArrayElement` work on the RAW file, not the parsed, camelCased `MapData` shape.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/edit/events.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { moveEvent, addEvent, deleteEvent, findWarpsTargetingByIndex, EVENT_ARRAY_KEY } from "../../src/edit/events.js";
import type { MapData } from "../../src/load/maps.js";

const BASE_MAP: MapData = {
  id: "MAP_TEST", name: "Test", layout: "LAYOUT_TEST", music: "MUS_ROUTE101",
  regionMapSection: "MAPSEC_TEST", mapType: "MAP_TYPE_ROUTE", weather: "WEATHER_NONE",
  connections: [],
  objectEvents: [{
    graphicsId: "OBJ_EVENT_GFX_BOY_1", x: 3, y: 4, elevation: 0,
    movementType: "MOVEMENT_TYPE_FACE_DOWN", movementRangeX: 0, movementRangeY: 0,
    trainerType: "TRAINER_TYPE_NONE", trainerSightOrBerryTreeId: "0", script: "X", flag: "0",
  }],
  warpEvents: [{ x: 5, y: 5, elevation: 0, destMap: "MAP_OTHER", destWarpId: "2" }],
  coordEvents: [], bgEvents: [],
};

describe("moveEvent", () => {
  it("writes only x and y via jsonEdits, for the correct array/index/key pair", () => {
    const { jsonEdits, map } = moveEvent(BASE_MAP, "object", 0, 9, 10);
    expect(jsonEdits).toEqual([
      { path: ["object_events", 0, "x"], value: 9 },
      { path: ["object_events", 0, "y"], value: 10 },
    ]);
    expect(map.objectEvents[0]!.x).toBe(9);
    expect(map.objectEvents[0]!.y).toBe(10);
    // Every other field on the moved event, and the event's own identity
    // (not a new object replacing it), untouched.
    expect(map.objectEvents[0]!.script).toBe("X");
    expect(map.warpEvents).toEqual(BASE_MAP.warpEvents); // other arrays untouched
  });

  it("uses warp_events/coord_events/bg_events for the other three kinds", () => {
    expect(moveEvent(BASE_MAP, "warp", 0, 1, 1).jsonEdits[0]!.path).toEqual(["warp_events", 0, "x"]);
    expect(EVENT_ARRAY_KEY.coord).toBe("coord_events");
    expect(EVENT_ARRAY_KEY.bg).toBe("bg_events");
  });
});

describe("addEvent", () => {
  it("produces an insertOp appending to the correct array, and updates map's own in-memory list to match", () => {
    const newEvent = { graphics_id: "OBJ_EVENT_GFX_GIRL_1", x: 0, y: 0, elevation: 0, movement_type: "MOVEMENT_TYPE_FACE_UP", movement_range_x: 0, movement_range_y: 0, trainer_type: "TRAINER_TYPE_NONE", trainer_sight_or_berry_tree_id: "0", script: "Y", flag: "0" };
    const { insertOp, map } = addEvent(BASE_MAP, "object", newEvent);
    expect(insertOp).toEqual({ path: ["object_events"], index: 1, value: newEvent }); // appended after the existing one
    expect(map.objectEvents).toHaveLength(2);
    expect(map.objectEvents[1]!.graphicsId).toBe("OBJ_EVENT_GFX_GIRL_1");
  });

  it("appends at index 0 into an empty array", () => {
    const empty: MapData = { ...BASE_MAP, warpEvents: [] };
    const newWarp = { x: 1, y: 1, elevation: 0, dest_map: "MAP_X", dest_warp_id: "0" };
    const { insertOp } = addEvent(empty, "warp", newWarp);
    expect(insertOp.index).toBe(0);
  });
});

describe("deleteEvent", () => {
  it("produces a removeOp and drops the event from map's own in-memory list", () => {
    const { removeOp, map } = deleteEvent(BASE_MAP, "object", 0);
    expect(removeOp).toEqual({ path: ["object_events"], index: 0 });
    expect(map.objectEvents).toHaveLength(0);
  });

  it("refuses (throws) an index that does not exist", () => {
    expect(() => deleteEvent(BASE_MAP, "object", 5)).toThrow(/index 5/);
  });
});

describe("findWarpsTargetingByIndex", () => {
  it("warns when another map's warp targets the deleted warp's positional index", () => {
    const otherMapsWithId: { mapId: string; map: MapData }[] = [
      { mapId: "MAP_OTHER", map: { ...BASE_MAP, id: "MAP_OTHER", warpEvents: [
        { x: 0, y: 0, elevation: 0, destMap: "MAP_TEST", destWarpId: "0" }, // targets MAP_TEST's warp index 0 -- the one being deleted
      ] } },
      { mapId: "MAP_UNRELATED", map: { ...BASE_MAP, id: "MAP_UNRELATED", warpEvents: [
        { x: 0, y: 0, elevation: 0, destMap: "MAP_TEST", destWarpId: "1" }, // targets a DIFFERENT index -- not a match
      ] } },
    ];
    const warnings = findWarpsTargetingByIndex(otherMapsWithId, "MAP_TEST", 0);
    expect(warnings).toEqual([{ fromMapId: "MAP_OTHER", warpIndex: 0 }]);
  });

  it("returns an empty array when nothing targets the deleted index", () => {
    const others = [{ mapId: "MAP_OTHER", map: { ...BASE_MAP, warpEvents: [{ x: 0, y: 0, elevation: 0, destMap: "MAP_TEST", destWarpId: "9" }] } }];
    expect(findWarpsTargetingByIndex(others, "MAP_TEST", 0)).toEqual([]);
  });

  it("a non-numeric destWarpId (a symbolic constant) never matches, rather than coercing to a wrong number", () => {
    const others = [{ mapId: "MAP_OTHER", map: { ...BASE_MAP, warpEvents: [{ x: 0, y: 0, elevation: 0, destMap: "MAP_TEST", destWarpId: "WARP_ID_NONE" }] } }];
    expect(findWarpsTargetingByIndex(others, "MAP_TEST", 0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/edit/events.test.ts`
Expected: FAIL — `packages/core/src/edit/events.ts` does not exist.

- [ ] **Step 3: Implement**

Create `packages/core/src/edit/events.ts`:

```ts
import type { MapData, ObjectEvent, WarpEvent, CoordEvent, BgEvent } from "../load/maps.js";
import type { JsonEdit, JsonPath } from "../write/jsonEdit.js";
import type { InsertOp, RemoveOp } from "../write/save.js";

export type EventKind = "object" | "warp" | "coord" | "bg";

/** The raw JSON array key for each event kind -- matches load/maps.ts's own
 *  parseMap field names exactly, since these paths splice the RAW file. */
export const EVENT_ARRAY_KEY: Record<EventKind, string> = {
  object: "object_events", warp: "warp_events", coord: "coord_events", bg: "bg_events",
};

const CAMEL_ARRAY_KEY: Record<EventKind, "objectEvents" | "warpEvents" | "coordEvents" | "bgEvents"> = {
  object: "objectEvents", warp: "warpEvents", coord: "coordEvents", bg: "bgEvents",
};

/** Writes only x/y via jsonEdits -- I2's own "surgical splice, never
 *  reserialise" applies at the field level too: a drag never touches any
 *  other key on the moved event. */
export function moveEvent(map: MapData, kind: EventKind, index: number, x: number, y: number): { map: MapData; jsonEdits: JsonEdit[] } {
  const arrayKey = EVENT_ARRAY_KEY[kind];
  const jsonEdits: JsonEdit[] = [
    { path: [arrayKey, index, "x"], value: x },
    { path: [arrayKey, index, "y"], value: y },
  ];
  const camelKey = CAMEL_ARRAY_KEY[kind];
  const list = (map[camelKey] as Array<{ x: number; y: number }>).map((e, i) => (i === index ? { ...e, x, y } : e));
  return { map: { ...map, [camelKey]: list }, jsonEdits };
}

/** `value` is a RAW object literal (snake_case field names) -- it is
 *  spliced verbatim into map.json by insertArrayElement, so it must match
 *  the file's own field names, not MapData's camelCase ones. Appends at
 *  the array's own current end; the caller decides the target array via
 *  `kind`, never a caller-supplied index -- an explicit insertion point in
 *  the middle of an events array has no established meaning in this
 *  format (unlike connections, where order can matter), so "add" always
 *  means "append". */
export function addEvent(map: MapData, kind: EventKind, value: Record<string, unknown>): { map: MapData; insertOp: InsertOp } {
  const arrayKey = EVENT_ARRAY_KEY[kind];
  const camelKey = CAMEL_ARRAY_KEY[kind];
  const currentList = map[camelKey] as unknown[];
  const insertOp: InsertOp = { path: [arrayKey], index: currentList.length, value };
  const parsed = rawToCamel(kind, value);
  return { map: { ...map, [camelKey]: [...currentList, parsed] }, insertOp };
}

export function deleteEvent(map: MapData, kind: EventKind, index: number): { map: MapData; removeOp: RemoveOp } {
  const arrayKey = EVENT_ARRAY_KEY[kind];
  const camelKey = CAMEL_ARRAY_KEY[kind];
  const currentList = map[camelKey] as unknown[];
  if (index < 0 || index >= currentList.length) throw new Error(`index ${index} is not present in ${arrayKey}`);
  const removeOp: RemoveOp = { path: [arrayKey], index };
  const list = currentList.filter((_, i) => i !== index);
  return { map: { ...map, [camelKey]: list }, removeOp };
}

export interface WarpRenumberWarning { fromMapId: string; warpIndex: number; }

/**
 * Warp ids are positional (`dest_warp_id` names an INDEX into the
 * destination map's own warp_events array, not a stable identifier), so
 * deleting warp `deletedIndex` on `deletedMapId` silently renumbers every
 * later warp on that same map -- and any OTHER map's warp whose
 * `dest_warp_id` pointed at exactly that index now points at whatever
 * shifted into its place. This scans every OTHER map's own warps for one
 * naming (`deletedMapId`, `deletedIndex`) and reports it as a warning, not
 * a refusal -- the decomp has no protection against this footgun today
 * (docs/human-porymap.md), and the delete is not inherently wrong, the
 * user just needs to know to go fix the other map's warp afterward.
 *
 * `destWarpId` is a raw string field and is not always numeric (a symbolic
 * constant like WARP_ID_NONE appears in real data) -- `Number(...)` on one
 * of those is NaN, and NaN never triggers the `=== deletedIndex` check, so
 * those are correctly never reported rather than coerced into a false
 * match.
 */
export function findWarpsTargetingByIndex(
  otherMaps: { mapId: string; map: MapData }[], deletedMapId: string, deletedIndex: number,
): WarpRenumberWarning[] {
  const out: WarpRenumberWarning[] = [];
  for (const { mapId, map } of otherMaps) {
    map.warpEvents.forEach((w, warpIndex) => {
      if (w.destMap === deletedMapId && Number(w.destWarpId) === deletedIndex) {
        out.push({ fromMapId: mapId, warpIndex });
      }
    });
  }
  return out;
}

/** Mirrors load/maps.ts's own parseMap field-by-field for exactly the one
 *  event kind being added -- kept local rather than importing a shared
 *  per-event parser out of maps.ts (that file's own parseMap is a single
 *  pass over a whole map.json, not four independently reusable per-kind
 *  parsers; splitting it for this one caller is not worth the churn on a
 *  Plan-1 file every later plan also depends on). */
function rawToCamel(kind: EventKind, raw: Record<string, unknown>): ObjectEvent | WarpEvent | CoordEvent | BgEvent {
  if (kind === "object") {
    return {
      graphicsId: raw.graphics_id as string, x: Number(raw.x), y: Number(raw.y), elevation: Number(raw.elevation),
      movementType: raw.movement_type as string, movementRangeX: Number(raw.movement_range_x), movementRangeY: Number(raw.movement_range_y),
      trainerType: raw.trainer_type as string, trainerSightOrBerryTreeId: String(raw.trainer_sight_or_berry_tree_id),
      script: raw.script as string, flag: String(raw.flag),
    };
  }
  if (kind === "warp") {
    return { x: Number(raw.x), y: Number(raw.y), elevation: Number(raw.elevation), destMap: raw.dest_map as string, destWarpId: String(raw.dest_warp_id) };
  }
  // coord/bg events carry an open-ended, engine-varying field set (see
  // load/maps.ts's own CoordEvent/BgEvent: `[k: string]: unknown` beyond a
  // small common base) -- passed through structurally rather than
  // enumerated field by field, the same posture maps.ts's own parser takes
  // for these two kinds.
  return { x: Number(raw.x), y: Number(raw.y), elevation: Number(raw.elevation), ...raw } as CoordEvent | BgEvent;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/edit/events.test.ts`
Expected: PASS, 9/9.

- [ ] **Step 5: Run the full core suite**

Run: `npx vitest run packages/core`
Expected: PASS.

- [ ] **Step 6: Teeth-proof**

Temporarily change `findWarpsTargetingByIndex`'s comparison to `w.destWarpId === String(deletedIndex)` alone (dropping `w.destMap === deletedMapId`), confirm... actually reconsider: temporarily DROP the `w.destMap === deletedMapId` half of the condition instead, confirm a warp on an unrelated map (targeting a DIFFERENT destination map, but coincidentally at the same numeric index) now produces a false-positive warning, and add a test for that specific false-positive case if the current tests don't already discriminate it — check whether "returns an empty array when nothing targets the deleted index" already covers this (it does not: that fixture's `destMap` already matches `MAP_TEST`), so add one more fixture with a warp whose `destWarpId` matches but `destMap` does NOT, before considering this task done.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/edit/events.ts packages/core/test/edit/events.test.ts
git commit -m "feat(core): event editing -- move/add/delete for all 4 kinds, positional-warp-renumber warning"
```

---

## Task 8: Server — in-memory edit sessions, paint routes

**Not in the coarse plan's own file list** — see this document's own architecture note at the top for why the edit session has to live server-side, and Plan 0 §7's own "a plan's file list omitting a file doesn't mean it doesn't need touching" finding for why that omission gets corrected here rather than discovered mid-Task-11.

**Files:**
- Create: `packages/server/src/editSessions.ts`
- Modify: `packages/server/src/index.ts`
- Test: `packages/server/test/editSessions.test.ts`
- Test: `packages/server/test/paintRoutes.test.ts`

**Design: a paint gesture is `begin` → one or more `apply` → `end`.** `begin` snapshots the session's current blocks; each `apply` mutates them directly (no undo push yet — a live-redraw round trip per mouse-move frame, cheap); `end` pushes exactly ONE `EditCommand` covering the whole gesture, satisfying "a stroke is one command, not one per block" at the network layer, not just inside `commands.ts`. A plain click (no drag) is `begin`+one`apply`+`end`, same shape — the UI never special-cases "was this a click or a drag."

- [ ] **Step 1: Write the failing tests**

Create `packages/server/test/editSessions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { openProject } from "@pokemap/core/src/project.js";
import { createEditSessionStore } from "../src/editSessions.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";

describe.skipIf(!hasProject(SUBJECT_ROOT))("createEditSessionStore", () => {
  const project = openProject(SUBJECT_ROOT);

  it("opening a map twice returns the SAME session (in-memory, not re-read from disk each time)", () => {
    const store = createEditSessionStore(project);
    const a = store.open("NewBarkTown_Lab");
    const b = store.open("NewBarkTown_Lab");
    expect(a).toBe(b);
  });

  it("opening loads real blocks from the real decomp, matching parseBlocks directly", () => {
    const store = createEditSessionStore(project);
    const entry = store.open("NewBarkTown_Lab");
    expect(entry.session.blocks.length).toBeGreaterThan(0);
    expect(entry.session.isDirty).toBe(false);
  });

  it("close() forgets the session -- a later open() re-reads from disk", () => {
    const store = createEditSessionStore(project);
    const a = store.open("NewBarkTown_Lab");
    a.session.blocks = [{ metatileId: 999, collision: 0, elevation: 0 }]; // corrupt in place
    store.close("NewBarkTown_Lab");
    const b = store.open("NewBarkTown_Lab");
    expect(b.session.blocks).not.toEqual(a.session.blocks);
  });

  it("has() reflects an open session without creating one", () => {
    const store = createEditSessionStore(project);
    expect(store.has("NewBarkTown_Lab")).toBe(false);
    store.open("NewBarkTown_Lab");
    expect(store.has("NewBarkTown_Lab")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/test/editSessions.test.ts`
Expected: FAIL — `packages/server/src/editSessions.ts` does not exist.

- [ ] **Step 3: Implement `editSessions.ts`**

```ts
import { readFileSync } from "node:fs";
import type { Project } from "@pokemap/core/src/project.js";
import type { EditSession } from "@pokemap/core/src/write/save.js";
import { EditCommandStack, type EditCommand } from "@pokemap/core/src/edit/commands.js";
import { parseBlocks } from "@pokemap/core/src/load/blocks.js";

export interface SessionEntry {
  session: EditSession;
  stack: EditCommandStack;
  /** Set by /paint/begin, cleared by /paint/end -- the blocks snapshot a
   *  live gesture reverts to if the client never calls /end (e.g. it
   *  crashed mid-drag). Not itself part of the undo stack. */
  strokeStartBlocks: EditSession["blocks"] | null;
}

/**
 * One `Map<mapName, SessionEntry>` per server process, exactly the shape
 * `worldCache`/`coverageCache` already use for "read-only project, compute
 * once" -- except a session is genuinely mutable and this store's whole
 * job is holding that mutation between requests, not memoizing a pure
 * answer. `close()` is what actually enforces I6 in spirit: an edit
 * session existing in memory is not itself a write (nothing has touched
 * disk), and dropping it (after a successful commit, or on an explicit
 * discard) is always safe -- the NEXT open() just re-reads the real files,
 * which are the only durable truth.
 */
export function createEditSessionStore(project: Project) {
  const sessions = new Map<string, SessionEntry>();

  function open(mapName: string): SessionEntry {
    let entry = sessions.get(mapName);
    if (entry) return entry;

    const map = project.map(mapName);
    const layout = project.layoutForMap(mapName);
    const blocks = parseBlocks(readFileSync(`${project.paths.root}/${layout.blockdataFilepath}`), project.profile);
    const border = parseBlocks(readFileSync(`${project.paths.root}/${layout.borderFilepath}`), project.profile);
    const originalMapJson = readFileSync(project.paths.mapJson(mapName), "utf8");

    const session: EditSession = {
      mapName, layout, blocks, border, map,
      originalBlocks: blocks.map((b) => ({ ...b })), originalMap: map,
      originalMapJson, jsonEdits: [], insertOps: [], removeOps: [], isDirty: false,
    };
    entry = { session, stack: new EditCommandStack(), strokeStartBlocks: null };
    sessions.set(mapName, entry);
    return entry;
  }

  function close(mapName: string): void {
    sessions.delete(mapName);
  }

  function has(mapName: string): boolean {
    return sessions.has(mapName);
  }

  return { open, close, has };
}

/** A snapshot-diff command: `apply`/`revert` just assign the session's own
 *  mutable fields wholesale, rather than knowing HOW to reverse a specific
 *  paint or event operation -- every route handler in index.ts builds one
 *  of these the same way (capture a `Snapshot` before mutating, mutate via
 *  a pure `core` function, capture another `Snapshot` after), so undo/redo
 *  works identically for a paint stroke, an event move, an event add, and
 *  an event delete without this file needing to know the difference. */
export interface Snapshot {
  blocks: EditSession["blocks"];
  border: EditSession["border"];
  map: EditSession["map"];
  jsonEdits: EditSession["jsonEdits"];
  insertOps: EditSession["insertOps"];
  removeOps: EditSession["removeOps"];
  /** Added for Task 17's wild-sign write path -- `Object.assign` in
   *  snapshotCommand below only overwrites keys a Snapshot actually
   *  carries, so omitting this field here would silently leave a sign's
   *  scriptAppend in place across an undo. Always present (defaults to
   *  `[]`), unlike EditSession's own optional field, so every snapshot is
   *  a complete, unambiguous state to revert TO. */
  scriptAppends: NonNullable<EditSession["scriptAppends"]>;
}

export function snapshotOf(session: EditSession): Snapshot {
  return {
    blocks: session.blocks, border: session.border, map: session.map,
    jsonEdits: session.jsonEdits, insertOps: session.insertOps, removeOps: session.removeOps,
    scriptAppends: session.scriptAppends ?? [],
  };
}

export function snapshotCommand(label: string, prev: Snapshot, next: Snapshot): EditCommand {
  return {
    label,
    apply: (s) => Object.assign(s, next),
    revert: (s) => Object.assign(s, prev),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/server/test/editSessions.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 5: Write the failing paint-route tests**

Create `packages/server/test/paintRoutes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";

let s: PokemapServer;
const post = async (path: string, body: unknown) =>
  fetch(`http://127.0.0.1:${s.port}${path}`, { method: "POST", body: JSON.stringify(body) });

describe.skipIf(!hasProject(SUBJECT_ROOT))("paint routes", () => {
  beforeAll(async () => { s = await createServer({ projectPath: SUBJECT_ROOT, port: 0 }); });
  afterAll(async () => { await s?.close(); });

  it("begin/apply/end applies a pencil dab and undo reverts it, without ever touching disk", async () => {
    const map = "NewBarkTown_Lab";
    await post(`/api/edit/${map}/paint/begin`, {});
    const applyRes = await post(`/api/edit/${map}/paint/apply`, {
      tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 42 }] }, origin: { x: 0, y: 0 },
    });
    expect(applyRes.status).toBe(200);
    const applied = await applyRes.json() as any;
    expect(applied.blocks[0].metatileId).toBe(42);

    const endRes = await post(`/api/edit/${map}/paint/end`, {});
    expect(endRes.status).toBe(200);
    const ended = await endRes.json() as any;
    expect(ended.isDirty).toBe(true);

    const undoRes = await post(`/api/edit/${map}/undo`, {});
    expect(undoRes.status).toBe(200);
    const undone = await undoRes.json() as any;
    expect(undone.blocks[0].metatileId).not.toBe(42);
    expect(undone.isDirty).toBe(false);
  }, 300_000);

  it("redo re-applies after an undo", async () => {
    const map = "NewBarkTown"; // a DIFFERENT map, to avoid the previous test's still-open session
    await post(`/api/edit/${map}/paint/begin`, {});
    await post(`/api/edit/${map}/paint/apply`, {
      tool: "pencil", targets: [{ x: 1, y: 1 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 7 }] }, origin: { x: 1, y: 1 },
    });
    await post(`/api/edit/${map}/paint/end`, {});
    await post(`/api/edit/${map}/undo`, {});
    const redoRes = await post(`/api/edit/${map}/redo`, {});
    const redone = await redoRes.json() as any;
    expect(redone.isDirty).toBe(true);
  }, 300_000);

  it("a bucket fill across many cells still produces exactly ONE undo step", async () => {
    const map = "PetalburgCity";
    await post(`/api/edit/${map}/paint/begin`, {});
    const mapPayload = await (await fetch(`http://127.0.0.1:${s.port}/api/map/${map}`)).json() as any;
    // Fill from (0,0) -- whatever that region's connected id is, replaced
    // with an id that cannot collide with it (this layout's own metatile
    // count is comfortably above 1).
    await post(`/api/edit/${map}/paint/apply`, { tool: "bucket", x: 0, y: 0, replacement: { metatileId: 1 } });
    const endRes = await post(`/api/edit/${map}/paint/end`, {});
    const ended = await endRes.json() as any;
    const changedCount = ended.blocks.filter((b: any, i: number) => b.metatileId !== mapPayload.blocks[i].metatileId).length;
    expect(changedCount).toBeGreaterThan(1); // the fill genuinely touched more than one cell

    const undoRes = await post(`/api/edit/${map}/undo`, {});
    const undone = await undoRes.json() as any;
    // ONE undo call reverted the WHOLE fill, not one cell.
    expect(undone.blocks).toEqual(mapPayload.blocks.map((b: any) => ({ metatileId: b.metatileId, collision: b.collision, elevation: b.elevation })));
  }, 300_000);

  it("400s an apply with an unknown tool name", async () => {
    const map = "CherrygroveCity";
    await post(`/api/edit/${map}/paint/begin`, {});
    const r = await post(`/api/edit/${map}/paint/apply`, { tool: "not-a-real-tool" });
    expect(r.status).toBe(400);
  }, 300_000);

  it("undo on a map with no open session is a no-op 200, not a 500", async () => {
    const r = await post(`/api/edit/VioletCity/undo`, {});
    expect(r.status).toBe(200);
  }, 300_000);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run packages/server/test/paintRoutes.test.ts`
Expected: FAIL — the `/api/edit/*` routes do not exist yet.

- [ ] **Step 7: Implement the routes**

Add to `packages/server/src/index.ts`:

Import additions:

```ts
import { createEditSessionStore, snapshotOf, snapshotCommand } from "./editSessions.js";
import { paintCells, floodFill, shiftGrid, type Stamp } from "@pokemap/core/src/edit/paint.js";
```

Right after `const getSpecies = () => (speciesCache ??= allSpecies(project));`, add:

```ts
  const editSessions = createEditSessionStore(project);

  const editEntryFor = (name: string) => editSessions.open(name);

  const sendSession = (send: (code: number, body: unknown) => void, code: number, entry: ReturnType<typeof editEntryFor>) =>
    send(code, { blocks: entry.session.blocks, border: entry.session.border, isDirty: entry.session.isDirty });
```

Insert new routes immediately before the final `return send(404, { error: "not found" });` fallback:

```ts
      // Task 8 (Plan 2): paint-stroke lifecycle. begin/apply/end are three
      // separate requests on purpose -- see editSessions.ts's own doc
      // comment on why a whole stroke is one undo step even though it is
      // many HTTP requests.
      const paintBeginMatch = /^\/api\/edit\/(.+)\/paint\/begin$/.exec(url.pathname);
      if (paintBeginMatch && req.method === "POST") {
        const name = decodeURIComponent(paintBeginMatch[1]!);
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        const entry = editEntryFor(name);
        entry.strokeStartBlocks = entry.session.blocks.map((b) => ({ ...b }));
        return sendSession(send, 200, entry);
      }

      const paintApplyMatch = /^\/api\/edit\/(.+)\/paint\/apply$/.exec(url.pathname);
      if (paintApplyMatch && req.method === "POST") {
        const name = decodeURIComponent(paintApplyMatch[1]!);
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        return readBody(req)
          .then((body) => {
            let parsed: { tool?: unknown };
            try { parsed = JSON.parse(body) as typeof parsed; }
            catch (e) { return send(400, { error: `invalid JSON body: ${(e as Error).message}` }); }

            const entry = editEntryFor(name);
            const w = entry.session.layout.width, h = entry.session.layout.height;

            if (parsed.tool === "pencil" || parsed.tool === "rect") {
              const { targets, stamp, origin } = body ? (JSON.parse(body) as { targets: { x: number; y: number }[]; stamp: Stamp; origin: { x: number; y: number } }) : ({} as any);
              entry.session.blocks = paintCells(entry.session.blocks, w, h, targets, stamp, origin.x, origin.y);
            } else if (parsed.tool === "bucket") {
              const { x, y, replacement } = JSON.parse(body) as { x: number; y: number; replacement: { metatileId: number; collision?: number; elevation?: number } };
              entry.session.blocks = floodFill(entry.session.blocks, w, h, x, y, replacement);
            } else if (parsed.tool === "shift") {
              const { dx, dy } = JSON.parse(body) as { dx: number; dy: number };
              entry.session.blocks = shiftGrid(entry.session.blocks, w, h, dx, dy);
            } else {
              return send(400, { error: `unknown tool ${JSON.stringify(parsed.tool)}` });
            }
            return sendSession(send, 200, entry);
          })
          .catch((e: unknown) => {
            console.error(e);
            send(500, { error: e instanceof Error ? e.message : String(e) });
          });
      }

      const paintEndMatch = /^\/api\/edit\/(.+)\/paint\/end$/.exec(url.pathname);
      if (paintEndMatch && req.method === "POST") {
        const name = decodeURIComponent(paintEndMatch[1]!);
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        const entry = editEntryFor(name);
        if (entry.strokeStartBlocks) {
          const prev = { ...snapshotOf(entry.session), blocks: entry.strokeStartBlocks };
          const next = snapshotOf(entry.session);
          if (JSON.stringify(prev.blocks) !== JSON.stringify(next.blocks)) {
            entry.stack.push(entry.session, snapshotCommand("paint", prev, next));
          }
          entry.strokeStartBlocks = null;
        }
        return sendSession(send, 200, entry);
      }

      const undoMatch = /^\/api\/edit\/(.+)\/undo$/.exec(url.pathname);
      if (undoMatch && req.method === "POST") {
        const name = decodeURIComponent(undoMatch[1]!);
        if (!editSessions.has(name)) return send(200, { blocks: [], border: [], isDirty: false }); // nothing open -- a no-op, not a 500
        const entry = editEntryFor(name);
        entry.stack.undo(entry.session);
        return sendSession(send, 200, entry);
      }

      const redoMatch = /^\/api\/edit\/(.+)\/redo$/.exec(url.pathname);
      if (redoMatch && req.method === "POST") {
        const name = decodeURIComponent(redoMatch[1]!);
        if (!editSessions.has(name)) return send(200, { blocks: [], border: [], isDirty: false });
        const entry = editEntryFor(name);
        entry.stack.redo(entry.session);
        return sendSession(send, 200, entry);
      }
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run packages/server/test/paintRoutes.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 9: Run the full server and core suites**

Run: `npx vitest run packages/server packages/core`
Expected: PASS.

- [ ] **Step 10: Confirm I8 — no write anywhere in this task**

Run: `git -C "C:\Programming Projects\Pokemon Game\game" status --porcelain` before and after the full test run above; confirm byte-identical. This task's own routes never call `writeFileSync` (Task 8 has no save/commit route at all — that is Task 9) — this check is what proves it, not an assumption.

- [ ] **Step 11: Teeth-proof**

Temporarily change `/paint/end`'s command-push to always push (drop the `JSON.stringify(prev.blocks) !== JSON.stringify(next.blocks)` no-op guard), confirm no existing test fails (it's a performance/history-noise concern, not a correctness one — note this honestly rather than inventing a test that doesn't actually discriminate anything) — then separately, temporarily remove the `entry.strokeStartBlocks = null` reset at the end of `/paint/end`, confirm the "redo re-applies after an undo" test (or a new one, if needed) reveals a STALE stroke-start snapshot corrupting a LATER stroke's own undo boundary, then restore.

- [ ] **Step 12: Commit**

```bash
git add packages/server/src/editSessions.ts packages/server/src/index.ts packages/server/test/editSessions.test.ts packages/server/test/paintRoutes.test.ts
git commit -m "feat(server): in-memory edit sessions, paint begin/apply/end, undo/redo routes"
```

---

## Task 9: Server — save/commit and event routes

Also not in the coarse plan's own file list, for the same reason as Task 8.

**Files:**
- Modify: `packages/server/src/editSessions.ts`
- Modify: `packages/server/src/index.ts`
- Test: `packages/server/test/saveRoutes.test.ts`
- Test: `packages/server/test/eventRoutes.test.ts`

**I6/I8 discipline for this task's OWN tests:** every test that calls `/commit` actually writes to the real subject decomp's tracked files (that is the whole point of this task). Every such test MUST save/restore the touched file(s) exactly like `packages/server/test/world.test.ts`'s own established `try/finally` pattern, and use a name/map that can never collide with real content — mirror that file's own `__pokemap_world_test_placement__` naming convention.

- [ ] **Step 1: Write the failing save/commit tests**

Create `packages/server/test/saveRoutes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";
import { openProject } from "@pokemap/core/src/project.js";

let s: PokemapServer;
const post = async (path: string, body: unknown = {}) =>
  fetch(`http://127.0.0.1:${s.port}${path}`, { method: "POST", body: JSON.stringify(body) });
const get = async (path: string) => fetch(`http://127.0.0.1:${s.port}${path}`);

describe.skipIf(!hasProject(SUBJECT_ROOT))("save/commit routes", () => {
  beforeAll(async () => { s = await createServer({ projectPath: SUBJECT_ROOT, port: 0 }); });
  afterAll(async () => { await s?.close(); });

  it("GET /plan on an untouched session returns zero changes and never writes", async () => {
    const r = await get("/api/edit/CherrygroveCity/plan");
    expect(r.status).toBe(200);
    const plan = await r.json() as any;
    expect(plan.changes).toEqual([]);
    expect(plan.refusals).toEqual([]);
  }, 300_000);

  it("paint, GET /plan shows one binary change, POST /commit actually writes it, then restores", async () => {
    const proj = openProject(SUBJECT_ROOT);
    const layout = proj.layoutForMap("EcruteakCity");
    const binPath = `${SUBJECT_ROOT}/${layout.blockdataFilepath}`;
    const before = readFileSync(binPath);
    try {
      await post("/api/edit/EcruteakCity/paint/begin");
      await post("/api/edit/EcruteakCity/paint/apply", {
        tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 1 }] }, origin: { x: 0, y: 0 },
      });
      await post("/api/edit/EcruteakCity/paint/end");

      const planRes = await get("/api/edit/EcruteakCity/plan");
      const plan = await planRes.json() as any;
      expect(plan.changes).toHaveLength(1);
      expect(plan.changes[0].kind).toBe("binary");

      const commitRes = await post("/api/edit/EcruteakCity/commit");
      expect(commitRes.status).toBe(200);
      expect(readFileSync(binPath)).not.toEqual(before);
    } finally {
      writeFileSync(binPath, before);
    }
  }, 300_000);

  it("commit refuses (400) when the plan contains a refusal, and writes nothing", async () => {
    const proj = openProject(SUBJECT_ROOT);
    const layout = proj.layoutForMap("OlivineCity");
    const binPath = `${SUBJECT_ROOT}/${layout.blockdataFilepath}`;
    const before = readFileSync(binPath);
    try {
      await post("/api/edit/OlivineCity/paint/begin");
      await post("/api/edit/OlivineCity/paint/apply", {
        tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 999999 }] }, origin: { x: 0, y: 0 },
      });
      await post("/api/edit/OlivineCity/paint/end");
      const commitRes = await post("/api/edit/OlivineCity/commit");
      expect(commitRes.status).toBe(400);
      expect(readFileSync(binPath)).toEqual(before);
    } finally {
      writeFileSync(binPath, before);
    }
  }, 300_000);

  it("after a successful commit, the session is closed -- a later GET /plan reflects the NEW on-disk state as its own fresh baseline (zero changes again)", async () => {
    const proj = openProject(SUBJECT_ROOT);
    const layout = proj.layoutForMap("BlackthornCity");
    const binPath = `${SUBJECT_ROOT}/${layout.blockdataFilepath}`;
    const before = readFileSync(binPath);
    try {
      await post("/api/edit/BlackthornCity/paint/begin");
      await post("/api/edit/BlackthornCity/paint/apply", {
        tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 2 }] }, origin: { x: 0, y: 0 },
      });
      await post("/api/edit/BlackthornCity/paint/end");
      await post("/api/edit/BlackthornCity/commit");

      const planRes = await get("/api/edit/BlackthornCity/plan");
      const plan = await planRes.json() as any;
      expect(plan.changes).toEqual([]); // the just-written state IS the new baseline
    } finally {
      writeFileSync(binPath, before);
    }
  }, 300_000);
});
```

- [ ] **Step 2: Run test to verify it fails, then implement**

Run: `npx vitest run packages/server/test/saveRoutes.test.ts` — FAIL first.

Add to `packages/server/src/editSessions.ts`, alongside `open`/`close`/`has`:

```ts
  /** True once a session has diverged from disk -- reads it straight off
   *  the underlying EditCommandStack, which is the one thing tracking it
   *  (see commands.ts's own doc comment on cleanIndex). */
  function isDirty(mapName: string): boolean {
    return sessions.get(mapName)?.stack.isDirty() ?? false;
  }
```

Add to the returned object literal: `has, isDirty,`.

Add to `packages/server/src/index.ts`, importing `planSave`/`commitSave` from `@pokemap/core/src/write/save.js` and `formatDiffJson` from `@pokemap/core/src/write/diff.js`, then insert routes (before the 404 fallback, after Task 8's routes):

```ts
      const planMatch = /^\/api\/edit\/(.+)\/plan$/.exec(url.pathname);
      if (planMatch && req.method === "GET") {
        const name = decodeURIComponent(planMatch[1]!);
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        const entry = editEntryFor(name);
        const plan = planSave(project, entry.session);
        return send(200, formatDiffJson(plan));
      }

      const commitMatch = /^\/api\/edit\/(.+)\/commit$/.exec(url.pathname);
      if (commitMatch && req.method === "POST") {
        const name = decodeURIComponent(commitMatch[1]!);
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        const entry = editEntryFor(name);
        const plan = planSave(project, entry.session);
        if (plan.refusals.length > 0) return send(400, formatDiffJson(plan));
        try {
          commitSave(project, plan);
        } catch (e) {
          console.error(e);
          return send(500, { error: e instanceof Error ? e.message : String(e) });
        }
        // Close, not markSaved()-and-keep-open: the session's own `map`/
        // `blocks` reflect what was JUST written, but the world/coverage/
        // encounters caches above this route do NOT (I8's read-only-
        // project assumption is now stale for this one map) -- Task 15's
        // corpus gate is what actually proves writes round-trip; this
        // route's own job ends at "committed successfully," and the
        // simplest correct thing is forcing the NEXT open() to re-read
        // real disk state fresh rather than trusting an in-memory session
        // that predates caches it can no longer invalidate.
        editSessions.close(name);
        return send(200, formatDiffJson(plan));
      }
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run packages/server/test/saveRoutes.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 4: Write the failing event-route tests**

Create `packages/server/test/eventRoutes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";

let s: PokemapServer;
const post = async (path: string, body: unknown = {}) =>
  fetch(`http://127.0.0.1:${s.port}${path}`, { method: "POST", body: JSON.stringify(body) });

describe.skipIf(!hasProject(SUBJECT_ROOT))("event routes", () => {
  beforeAll(async () => { s = await createServer({ projectPath: SUBJECT_ROOT, port: 0 }); });
  afterAll(async () => { await s?.close(); });

  it("event/move updates the session's map data and stages exactly x/y jsonEdits, undoable in one step", async () => {
    const map = "NewBarkTown_Lab"; // has a real object event
    const before = await (await fetch(`http://127.0.0.1:${s.port}/api/map/${map}`)).json() as any;
    const kind = "object", index = 0;
    const r = await post(`/api/edit/${map}/event/move`, { kind, index, x: 1, y: 1 });
    expect(r.status).toBe(200);
    const moved = await r.json() as any;
    expect(moved.map.objectEvents[index].x).toBe(1);
    expect(moved.map.objectEvents[index].y).toBe(1);

    const undoRes = await post(`/api/edit/${map}/undo`);
    const undone = await undoRes.json() as any;
    expect(undone.map.objectEvents[index].x).toBe(before.map.objectEvents[index].x);
  }, 300_000);

  it("event/add appends and event/delete removes, each its own undo step", async () => {
    const map = "Route29";
    const newFlag = { graphics_id: "OBJ_EVENT_GFX_BOY_1", x: 0, y: 0, elevation: 0, movement_type: "MOVEMENT_TYPE_FACE_DOWN", movement_range_x: 0, movement_range_y: 0, trainer_type: "TRAINER_TYPE_NONE", trainer_sight_or_berry_tree_id: "0", script: "PokeMap_Test", flag: "0" };
    const addRes = await post(`/api/edit/${map}/event/add`, { kind: "object", value: newFlag });
    const added = await addRes.json() as any;
    const newIndex = added.map.objectEvents.length - 1;
    expect(added.map.objectEvents[newIndex].script).toBe("PokeMap_Test");

    const delRes = await post(`/api/edit/${map}/event/delete`, { kind: "object", index: newIndex });
    const deleted = await delRes.json() as any;
    expect(deleted.map.objectEvents).toHaveLength(newIndex);
  }, 300_000);

  it("event/delete on a warp returns a warpRenumberWarnings array (possibly empty), computed against the real corpus", async () => {
    const r = await post("/api/edit/NewBarkTown_Lab/event/delete", { kind: "warp", index: 0 });
    expect(r.status).toBe(200);
    const body = await r.json() as any;
    expect(Array.isArray(body.warpRenumberWarnings)).toBe(true);
  }, 300_000);

  it("400s an event op with an unknown kind", async () => {
    const r = await post("/api/edit/Route29/event/move", { kind: "not-a-kind", index: 0, x: 0, y: 0 });
    expect(r.status).toBe(400);
  }, 300_000);
});
```

- [ ] **Step 5: Run test to verify it fails, then implement**

Run: `npx vitest run packages/server/test/eventRoutes.test.ts` — FAIL first.

Add to `packages/server/src/index.ts`, importing `moveEvent`, `addEvent`, `deleteEvent`, `findWarpsTargetingByIndex`, `type EventKind` from `@pokemap/core/src/edit/events.js`:

```ts
  // Cached for the SAME "read-only project, compute once" reason as
  // worldCache/coverageCache -- findWarpsTargetingByIndex's own corpus scan
  // is cheap per call (a plain array walk over already-parsed MapData) but
  // building the (mapId, MapData) list itself means calling project.map()
  // for all 1,209 names, which is worth doing once rather than per delete.
  let allMapsCache: { mapId: string; map: ReturnType<Project["map"]> }[] | undefined;
  const getAllMapsForWarpScan = () => (allMapsCache ??= project.mapNames().map((n) => ({ mapId: project.map(n).id, map: project.map(n) })));

  const EVENT_KINDS = new Set<EventKind>(["object", "warp", "coord", "bg"]);
```

```ts
      const eventMoveMatch = /^\/api\/edit\/(.+)\/event\/move$/.exec(url.pathname);
      if (eventMoveMatch && req.method === "POST") {
        const name = decodeURIComponent(eventMoveMatch[1]!);
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        return readBody(req)
          .then((body) => {
            let parsed: { kind?: unknown; index?: unknown; x?: unknown; y?: unknown };
            try { parsed = JSON.parse(body) as typeof parsed; }
            catch (e) { return send(400, { error: `invalid JSON body: ${(e as Error).message}` }); }
            if (!EVENT_KINDS.has(parsed.kind as EventKind)) return send(400, { error: `"kind" must be one of object/warp/coord/bg, got ${JSON.stringify(parsed.kind)}` });
            if (typeof parsed.index !== "number" || typeof parsed.x !== "number" || typeof parsed.y !== "number") {
              return send(400, { error: `expected { kind, index: number, x: number, y: number }, got ${body}` });
            }
            const entry = editEntryFor(name);
            const prev = snapshotOf(entry.session);
            const { map, jsonEdits } = moveEvent(entry.session.map, parsed.kind as EventKind, parsed.index, parsed.x, parsed.y);
            entry.session.map = map;
            entry.session.jsonEdits = [...entry.session.jsonEdits, ...jsonEdits];
            entry.stack.push(entry.session, snapshotCommand("move event", prev, snapshotOf(entry.session)));
            return send(200, { map: entry.session.map, isDirty: entry.session.isDirty });
          })
          .catch((e: unknown) => { console.error(e); send(500, { error: e instanceof Error ? e.message : String(e) }); });
      }

      const eventAddMatch = /^\/api\/edit\/(.+)\/event\/add$/.exec(url.pathname);
      if (eventAddMatch && req.method === "POST") {
        const name = decodeURIComponent(eventAddMatch[1]!);
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        return readBody(req)
          .then((body) => {
            let parsed: { kind?: unknown; value?: unknown };
            try { parsed = JSON.parse(body) as typeof parsed; }
            catch (e) { return send(400, { error: `invalid JSON body: ${(e as Error).message}` }); }
            if (!EVENT_KINDS.has(parsed.kind as EventKind)) return send(400, { error: `"kind" must be one of object/warp/coord/bg, got ${JSON.stringify(parsed.kind)}` });
            if (typeof parsed.value !== "object" || parsed.value === null) return send(400, { error: `expected { kind, value: object }, got ${body}` });
            const entry = editEntryFor(name);
            const prev = snapshotOf(entry.session);
            const { map, insertOp } = addEvent(entry.session.map, parsed.kind as EventKind, parsed.value as Record<string, unknown>);
            entry.session.map = map;
            entry.session.insertOps = [...entry.session.insertOps, insertOp];
            entry.stack.push(entry.session, snapshotCommand("add event", prev, snapshotOf(entry.session)));
            return send(200, { map: entry.session.map, isDirty: entry.session.isDirty });
          })
          .catch((e: unknown) => { console.error(e); send(500, { error: e instanceof Error ? e.message : String(e) }); });
      }

      const eventDeleteMatch = /^\/api\/edit\/(.+)\/event\/delete$/.exec(url.pathname);
      if (eventDeleteMatch && req.method === "POST") {
        const name = decodeURIComponent(eventDeleteMatch[1]!);
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        return readBody(req)
          .then((body) => {
            let parsed: { kind?: unknown; index?: unknown };
            try { parsed = JSON.parse(body) as typeof parsed; }
            catch (e) { return send(400, { error: `invalid JSON body: ${(e as Error).message}` }); }
            if (!EVENT_KINDS.has(parsed.kind as EventKind)) return send(400, { error: `"kind" must be one of object/warp/coord/bg, got ${JSON.stringify(parsed.kind)}` });
            if (typeof parsed.index !== "number") return send(400, { error: `expected { kind, index: number }, got ${body}` });
            const entry = editEntryFor(name);
            const prev = snapshotOf(entry.session);
            const { map, removeOp } = deleteEvent(entry.session.map, parsed.kind as EventKind, parsed.index);
            entry.session.map = map;
            entry.session.removeOps = [...entry.session.removeOps, removeOp];
            entry.stack.push(entry.session, snapshotCommand("delete event", prev, snapshotOf(entry.session)));

            const warpRenumberWarnings = parsed.kind === "warp"
              ? findWarpsTargetingByIndex(
                  getAllMapsForWarpScan().filter((m) => m.mapId !== entry.session.map.id),
                  entry.session.map.id, parsed.index as number,
                )
              : [];
            return send(200, { map: entry.session.map, isDirty: entry.session.isDirty, warpRenumberWarnings });
          })
          .catch((e: unknown) => { console.error(e); send(500, { error: e instanceof Error ? e.message : String(e) }); });
      }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run packages/server/test/eventRoutes.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 7: Run the full core and server suites**

Run: `npx vitest run packages/core packages/server`
Expected: PASS.

- [ ] **Step 8: I8/I6 verification — the important one for this task**

Run the full save-route test suite TWICE in a row: `npx vitest run packages/server/test/saveRoutes.test.ts` then again. Confirm identical pass/fail both times (proves the save/restore `finally` blocks genuinely leave no residue — a leaking test would show the SECOND run behaving differently, e.g. "zero changes" tests suddenly showing a change from the first run's leftover state). Then:

```bash
git -C "C:\Programming Projects\Pokemon Game\game" status --porcelain
```

before this task's full test run and after; confirm byte-identical.

- [ ] **Step 9: Teeth-proof**

Temporarily remove the `if (plan.refusals.length > 0) return send(400, ...)` guard from the commit route, confirm "commit refuses (400) when the plan contains a refusal" fails AND (more importantly) confirm `readFileSync(binPath)` after that mutated run genuinely differs from `before` — i.e. this isn't just a status-code check, it's proof a bad write actually landed — then restore and re-verify the file is back to its saved `before` bytes via the test's own `finally`.

- [ ] **Step 10: Commit**

```bash
git add packages/server/src/editSessions.ts packages/server/src/index.ts packages/server/test/saveRoutes.test.ts packages/server/test/eventRoutes.test.ts
git commit -m "feat(server): save/commit and event move/add/delete routes, warp-renumber warning wiring"
```

---

## Task 10: Metatile palette

**Files:**
- Modify: `packages/server/src/index.ts` (new route)
- Create: `packages/ui/src/components/MetatilePalette.tsx`
- Test: `packages/server/test/api.test.ts` (add to it)
- Test: `packages/ui/test/MetatilePalette.test.tsx`

**Invoke `frontend-design` and `ui-ux-pro-max` before writing the component** — follow `packages/ui/DESIGN.md`'s tokens exactly (this repeats for every UI task below; it is not restated at the same length again).

- [ ] **Step 1: Server — write the failing test, then implement the thumbnail route**

Add to `packages/server/test/api.test.ts`:

```ts
  it("renders one metatile as a 16x16 PNG, split-aware", async () => {
    const r = await get("/api/metatile/PetalburgCity_Layout/0.png");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    const buf = Buffer.from(await r.arrayBuffer());
    expect(buf.readUInt32BE(16)).toBe(16);
    expect(buf.readUInt32BE(20)).toBe(16);
  });

  it("404s an unknown layout name for the metatile route", async () => {
    expect((await get("/api/metatile/NoSuchLayout/0.png")).status).toBe(404);
  });

  it("400s a non-integer metatile id", async () => {
    expect((await get("/api/metatile/PetalburgCity_Layout/abc.png")).status).toBe(400);
  });
```

Run: `npx vitest run packages/server/test/api.test.ts -t "metatile"` — FAIL first (route doesn't exist).

Add to `packages/server/src/index.ts`, importing `renderMetatile` from `@pokemap/core/src/render/metatile.js`, inserted alongside the existing render/PNG routes (near `/api/render/(.+)\.png`):

```ts
      const metatileMatch = /^\/api\/metatile\/(.+)\/(\d+)\.png$/.exec(url.pathname);
      if (metatileMatch) {
        const layoutName = decodeURIComponent(metatileMatch[1]!);
        const id = Number(metatileMatch[2]);
        const layout = project.layoutByName(layoutName);
        if (!layout) return send(404, { error: `no layout ${layoutName}` });
        if (!Number.isInteger(id) || id < 0) return send(400, { error: `metatile id must be a non-negative integer, got ${metatileMatch[2]}` });

        const key = `${layoutName}:${id}`;
        let png = pngCache.get(key);
        if (!png) {
          const split = project.splitFor(layout);
          const raster = renderMetatile(id, project.tileset(layout.primaryTileset), project.tileset(layout.secondaryTileset), split, project.profile);
          png = encodePng(raster);
          pngCache.set(key, png);
        }
        res.writeHead(200, { "content-type": "image/png", "cache-control": "no-cache" });
        return res.end(png);
      }
```

`/^\/api\/metatile\/(.+)\/(\d+)\.png$/`'s `(.+)` (not `[^/]+`) matters here specifically: unlike a species constant, `[^/]+` would be equally correct today (no real layout name contains a slash) — kept as `.+` to match this file's own established convention for every OTHER per-name route capturing a `Project`-resolved identifier (`/api/render/`, `/api/map/`), reserving `[^/]+` specifically for the two species routes' own documented reason (a stray extra segment risk that a species constant, unlike a layout name, could plausibly hit via a caller's typo pattern).

Run: `npx vitest run packages/server/test/api.test.ts -t "metatile"`
Expected: PASS, 3/3.

- [ ] **Step 2: Run the full server suite**

Run: `npx vitest run packages/server`
Expected: PASS.

- [ ] **Step 3: UI — write the failing tests**

Create `packages/ui/test/MetatilePalette.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MetatilePalette } from "../src/components/MetatilePalette.js";

afterEach(() => vi.unstubAllGlobals());

const SPLIT = { version: "hns" as const, tiles: 640, metatiles: 640, pals: 7 };

describe("MetatilePalette", () => {
  it("renders one thumbnail per metatile up to primaryCount + secondaryCount, split-aware", () => {
    render(<MetatilePalette layoutName="Test_Layout" split={SPLIT} primaryCount={4} secondaryCount={3} onSelect={() => {}} />);
    // 4 primary (0-3) + 3 secondary (640-642) = 7 selectable thumbnails.
    expect(screen.getAllByRole("button", { name: /^metatile 0x/i })).toHaveLength(7);
  });

  it("shows the split boundary as a labelled divider naming the real primary count and layout_version", () => {
    render(<MetatilePalette layoutName="Test_Layout" split={SPLIT} primaryCount={4} secondaryCount={3} onSelect={() => {}} />);
    expect(screen.getByText(/640/)).toBeTruthy();
    expect(screen.getByText(/hns/)).toBeTruthy();
  });

  it("an id past the owning tileset's real count is struck through and not selectable", () => {
    // primaryCount=2 means ids 2..639 (up to split.metatiles) are past the
    // REAL primary count but still under the split boundary -- exactly the
    // Saffron_Temp shape (an id legal by split, illegal by real tileset
    // size). Render a small window so the test stays fast; pass a prop
    // limiting the visible id range for this purpose (see step 4's
    // component -- `visibleCount` caps how many ids past 0 are rendered,
    // defaulting to the full split+secondary range in real use but
    // overridable here to keep this test from rendering 643 buttons).
    render(<MetatilePalette layoutName="Test_Layout" split={SPLIT} primaryCount={2} secondaryCount={3} onSelect={() => {}} visibleCount={5} />);
    const outOfRange = screen.getByRole("button", { name: /metatile 0x2\b/i });
    expect(outOfRange).toBeDisabled();
    expect(outOfRange.className).toContain("out-of-range");
  });

  it("clicking a valid metatile calls onSelect with a 1x1 stamp naming that id", () => {
    const onSelect = vi.fn();
    render(<MetatilePalette layoutName="Test_Layout" split={SPLIT} primaryCount={4} secondaryCount={3} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /metatile 0x1\b/i }));
    expect(onSelect).toHaveBeenCalledWith({ width: 1, height: 1, cells: [{ metatileId: 1 }] });
  });

  it("dragging a rectangle of metatiles selects a stamp matching that rectangle's own shape and ids", () => {
    const onSelect = vi.fn();
    render(<MetatilePalette layoutName="Test_Layout" split={SPLIT} primaryCount={4} secondaryCount={3} onSelect={onSelect} columns={2} />);
    // With columns=2: ids 0,1 on row 0, ids 2,3 on row 1. Drag from id 0 to id 3 selects all four in a 2x2 stamp.
    fireEvent.mouseDown(screen.getByRole("button", { name: /metatile 0x0\b/i }));
    fireEvent.mouseUp(screen.getByRole("button", { name: /metatile 0x3\b/i }));
    expect(onSelect).toHaveBeenCalledWith({ width: 2, height: 2, cells: [{ metatileId: 0 }, { metatileId: 1 }, { metatileId: 2 }, { metatileId: 3 }] });
  });

  it("filters by hex id as the user types", () => {
    render(<MetatilePalette layoutName="Test_Layout" split={SPLIT} primaryCount={20} secondaryCount={0} onSelect={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "0x1" } });
    // 0x1, 0x10-0x13 (16-19 decimal, within primaryCount=20) all contain "1" in hex form when matched as a substring of "0x1..".
    expect(screen.queryByRole("button", { name: /metatile 0x0\b/i })).toBeNull();
    expect(screen.getByRole("button", { name: /metatile 0x1\b/i })).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run packages/ui/test/MetatilePalette.test.tsx`
Expected: FAIL — the component does not exist.

- [ ] **Step 5: Implement**

Create `packages/ui/src/components/MetatilePalette.tsx`:

```tsx
import { Fragment, useMemo, useState } from "react";
import type { Split } from "@pokemap/core/src/model/types.js";
import type { Stamp } from "@pokemap/core/src/edit/paint.js";

export interface MetatilePaletteProps {
  layoutName: string;
  split: Split;
  primaryCount: number;
  secondaryCount: number;
  onSelect(stamp: Stamp): void;
  /** Overrides the rendered id set with a single contiguous `0..N-1` range
   *  -- ONLY meaningful for exercising the out-of-range gap between a
   *  tileset's REAL count and the split boundary (ids `primaryCount` up to
   *  `split.metatiles`), which the default (no `visibleCount`) never
   *  renders at all: a real palette shows exactly the metatiles that
   *  exist (`primaryCount` real primary ids, then `secondaryCount` real
   *  secondary ids starting at `split.metatiles`) -- there is nothing
   *  useful to browse in the unused split-only gap in normal use, and
   *  rendering it by default would mean a grid of hundreds of blank
   *  disabled cells on every real layout. `visibleCount` exists so a test
   *  (or a future "show me the raw split range" debug view) can force
   *  rendering into that gap on demand; production code never passes it. */
  visibleCount?: number;
  columns?: number;
}

const hex = (n: number) => `0x${n.toString(16).toUpperCase()}`;

/**
 * Renders primary then secondary metatiles for the open layout's split,
 * with the boundary drawn as a visible divider naming the actual number
 * (split.metatiles) and the layout's own layout_version. An id past the
 * owning tileset's REAL count is struck through and not selectable -- the
 * Saffron_Temp situation (a split-legal, tileset-illegal id) becomes
 * visibly impossible to repeat, matching this project's own reason to
 * exist rather than just describing it.
 */
export function MetatilePalette({
  layoutName, split, primaryCount, secondaryCount, onSelect, visibleCount, columns = 8,
}: MetatilePaletteProps) {
  const [query, setQuery] = useState("");
  const [dragStart, setDragStart] = useState<number | null>(null);

  /** Default: exactly the ids that REALLY exist -- primary 0..primaryCount-1,
   *  then secondary split.metatiles..split.metatiles+secondaryCount-1 -- so
   *  a real layout (e.g. primaryCount=512, secondaryCount=100) renders 612
   *  cells, not `split.metatiles + secondaryCount` (up to 740) worth of
   *  mostly-empty, mostly-disabled space for a gap nobody needs to browse.
   *  `visibleCount`, when given, replaces this with a single raw `0..N-1`
   *  range instead (see its own doc comment on `MetatilePaletteProps`). */
  const ids = useMemo(() => {
    if (visibleCount !== undefined) return Array.from({ length: visibleCount }, (_, i) => i);
    const primary = Array.from({ length: primaryCount }, (_, i) => i);
    const secondary = Array.from({ length: secondaryCount }, (_, i) => split.metatiles + i);
    return [...primary, ...secondary];
  }, [visibleCount, primaryCount, secondaryCount, split.metatiles]);

  const isOutOfRange = (id: number): boolean =>
    id < split.metatiles ? id >= primaryCount : id >= split.metatiles + secondaryCount;

  const visible = query.trim()
    ? ids.filter((id) => hex(id).toLowerCase().includes(query.trim().toLowerCase()))
    : ids;

  const selectSingle = (id: number) => {
    if (isOutOfRange(id)) return;
    onSelect({ width: 1, height: 1, cells: [{ metatileId: id }] });
  };

  const selectRect = (startId: number, endId: number) => {
    const startCol = startId % columns, startRow = Math.floor(startId / columns);
    const endCol = endId % columns, endRow = Math.floor(endId / columns);
    const x0 = Math.min(startCol, endCol), x1 = Math.max(startCol, endCol);
    const y0 = Math.min(startRow, endRow), y1 = Math.max(startRow, endRow);
    const width = x1 - x0 + 1, height = y1 - y0 + 1;
    const cells = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push({ metatileId: y * columns + x });
    onSelect({ width, height, cells });
  };

  return (
    <div className="metatile-palette">
      <input
        className="metatile-palette__search"
        placeholder="Search by hex id…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="metatile-palette__grid" style={{ gridTemplateColumns: `repeat(${columns}, auto)` }}>
        {visible.map((id) => {
          const outOfRange = isOutOfRange(id);
          const atBoundary = id === split.metatiles;
          return (
            <Fragment key={id}>
              {atBoundary && (
                <div className="metatile-palette__boundary" style={{ gridColumn: `1 / -1` }}>
                  primary {split.metatiles} · secondary starts here · {split.version}
                </div>
              )}
              <button
                type="button"
                role="button"
                aria-label={`metatile ${hex(id)}`}
                className={`metatile-palette__cell${outOfRange ? " metatile-palette__cell--out-of-range" : ""}`}
                disabled={outOfRange}
                onMouseDown={() => setDragStart(id)}
                onMouseUp={() => {
                  if (dragStart !== null && dragStart !== id) selectRect(dragStart, id);
                  else selectSingle(id);
                  setDragStart(null);
                }}
              >
                <img className="metatile-palette__thumb" src={`/api/metatile/${encodeURIComponent(layoutName)}/${id}.png`} alt="" width={16} height={16} />
              </button>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run packages/ui/test/MetatilePalette.test.tsx`
Expected: PASS, 6/6.

- [ ] **Step 7: Add CSS**

Follow `packages/ui/DESIGN.md`'s established tokens (`--font-data` for the hex labels, `--bg-panel-raised`/`--border` for cells, `--danger` for the out-of-range strike-through, `--space-*` for grid gaps) — write the actual rules into `packages/ui/src/styles.css`, matching every other component's own block-scoped class naming (`.metatile-palette__*`). Do not invent new tokens; if a new semantic color is genuinely needed (unlikely here — out-of-range can reuse `--danger`, matching the exact same "struck through, disabled, danger-toned" treatment this project already uses elsewhere), add it to DESIGN.md first per this project's own established two-review-round rule on that.

- [ ] **Step 8: Run the full UI suite**

Run: `npx vitest run packages/ui`
Expected: PASS.

- [ ] **Step 9: Teeth-proof**

Temporarily change `isOutOfRange` to always `return false`, confirm "an id past the owning tileset's real count is struck through and not selectable" fails, then restore.

- [ ] **Step 10: Commit**

```bash
git add packages/server/src/index.ts packages/server/test/api.test.ts packages/ui/src/components/MetatilePalette.tsx packages/ui/src/styles.css packages/ui/test/MetatilePalette.test.tsx
git commit -m "feat(server,ui): metatile thumbnail route + MetatilePalette -- split-aware, out-of-range ids struck through"
```

---

## Task 11: Wire painting into MapCanvas

Not in the coarse plan's own file list (it never named `MapCanvas.tsx` at all, despite requiring painting to happen somewhere on screen — the exact Plan 0 §7 pattern this document's own intro calls out). `MapCanvas.tsx` is read-only today: it renders `data.blocks` (a static prop from `useMapLayout`) and only ever pans on drag. This task adds a `useEditSession` hook and an OPTIONAL `editSession`/`activeTool` prop pair to `MapCanvas`, so every EXISTING read-only consumer (Map mode's default view, `WarpDestinationModal`'s preview) needs zero changes — they simply never pass the new props.

**Files:**
- Create: `packages/ui/src/hooks/useEditSession.ts`
- Modify: `packages/ui/src/components/MapCanvas.tsx`
- Modify: `packages/server/src/index.ts` (extend `/paint/apply`'s `rect` tool to take `{x0,y0,x1,y1}` and expand server-side, instead of a client-built `targets` array — cheaper over the wire for a large rect, and the natural place is the route Task 8 already built, not a second route)
- Test: `packages/ui/test/useEditSession.test.tsx`
- Test: `packages/ui/test/MapCanvas.test.tsx` (add to it)
- Test: `packages/server/test/paintRoutes.test.ts` (add to it)

**Invoke `frontend-design`/`ui-ux-pro-max`; follow `packages/ui/DESIGN.md`.**

- [ ] **Step 1: Server — extend the rect tool, test first**

Add to `packages/server/test/paintRoutes.test.ts`:

```ts
  it("rect tool takes x0,y0,x1,y1 and expands server-side, filling the whole rectangle in one apply call", async () => {
    const map = "GoldenrodCity";
    await post(`/api/edit/${map}/paint/begin`, {});
    const applyRes = await post(`/api/edit/${map}/paint/apply`, {
      tool: "rect", x0: 0, y0: 0, x1: 1, y1: 1, stamp: { width: 1, height: 1, cells: [{ metatileId: 3 }] }, origin: { x: 0, y: 0 },
    });
    const applied = await applyRes.json() as any;
    const layout = (await (await fetch(`http://127.0.0.1:${s.port}/api/map/${map}`)).json() as any).layout;
    expect(applied.blocks[0].metatileId).toBe(3);
    expect(applied.blocks[1].metatileId).toBe(3);
    expect(applied.blocks[layout.width].metatileId).toBe(3); // (0,1)
    expect(applied.blocks[layout.width + 1].metatileId).toBe(3); // (1,1)
    await post(`/api/edit/${map}/paint/end`, {});
  }, 300_000);
```

Run: FAIL first. Then in `packages/server/src/index.ts`'s `/paint/apply` handler, change the `parsed.tool === "pencil" || parsed.tool === "rect"` branch to split rect out on its own:

```ts
            if (parsed.tool === "pencil") {
              const { targets, stamp, origin } = JSON.parse(body) as { targets: { x: number; y: number }[]; stamp: Stamp; origin: { x: number; y: number } };
              entry.session.blocks = paintCells(entry.session.blocks, w, h, targets, stamp, origin.x, origin.y);
            } else if (parsed.tool === "rect") {
              const { x0, y0, x1, y1, stamp, origin } = JSON.parse(body) as { x0: number; y0: number; x1: number; y1: number; stamp: Stamp; origin: { x: number; y: number } };
              const targets: { x: number; y: number }[] = [];
              for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
                for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) targets.push({ x, y });
              }
              entry.session.blocks = paintCells(entry.session.blocks, w, h, targets, stamp, origin.x, origin.y);
            } else if (parsed.tool === "bucket") {
```

Run: PASS, 7/7 (6 from Task 8 + this one).

- [ ] **Step 2: `useEditSession` — write the failing tests**

Create `packages/ui/test/useEditSession.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { useEditSession } from "../src/hooks/useEditSession.js";

afterEach(() => vi.unstubAllGlobals());

function Host({ mapName, onResult }: { mapName: string; onResult: (r: ReturnType<typeof useEditSession>) => void }) {
  const result = useEditSession(mapName);
  onResult(result);
  return null;
}

describe("useEditSession", () => {
  it("beginStroke/applyPaint/endStroke round-trip through the server, updating blocks live", async () => {
    let served: any = { blocks: [{ metatileId: 1, collision: 0, elevation: 0 }], border: [], isDirty: false };
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/paint/apply")) served = { ...served, blocks: [{ metatileId: 9, collision: 0, elevation: 0 }] };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(served) } as Response);
    });
    vi.stubGlobal("fetch", fetchMock);

    let last: ReturnType<typeof useEditSession> | undefined;
    render(<Host mapName="Test" onResult={(r) => { last = r; }} />);

    await act(async () => { await last!.beginStroke(); });
    await act(async () => { await last!.applyPaint({ tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 9 }] }, origin: { x: 0, y: 0 } }); });
    await waitFor(() => expect(last?.blocks[0]?.metatileId).toBe(9));
    await act(async () => { await last!.endStroke(); });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/paint/begin"), expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/paint/apply"), expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/paint/end"), expect.anything());
  });

  it("undo/redo call the corresponding routes and update blocks/isDirty from the response", async () => {
    let served: any = { blocks: [{ metatileId: 1, collision: 0, elevation: 0 }], border: [], isDirty: true };
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(served) } as Response));
    vi.stubGlobal("fetch", fetchMock);
    let last: ReturnType<typeof useEditSession> | undefined;
    render(<Host mapName="Test" onResult={(r) => { last = r; }} />);
    served = { blocks: [{ metatileId: 0, collision: 0, elevation: 0 }], border: [], isDirty: false };
    await act(async () => { await last!.undo(); });
    expect(last!.isDirty).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails, then implement**

Run: `npx vitest run packages/ui/test/useEditSession.test.tsx` — FAIL first.

Create `packages/ui/src/hooks/useEditSession.ts`:

```ts
import { useCallback, useState } from "react";
import type { Block } from "@pokemap/core/src/model/types.js";
import type { Stamp } from "@pokemap/core/src/edit/paint.js";

export type PaintApplyBody =
  | { tool: "pencil"; targets: { x: number; y: number }[]; stamp: Stamp; origin: { x: number; y: number } }
  | { tool: "rect"; x0: number; y0: number; x1: number; y1: number; stamp: Stamp; origin: { x: number; y: number } }
  | { tool: "bucket"; x: number; y: number; replacement: { metatileId: number; collision?: number; elevation?: number } }
  | { tool: "shift"; dx: number; dy: number };

export interface UseEditSessionResult {
  blocks: Block[];
  border: Block[];
  isDirty: boolean;
  beginStroke(): Promise<void>;
  applyPaint(body: PaintApplyBody): Promise<void>;
  endStroke(): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
}

/**
 * The client-side face of Task 8/9's `/api/edit/:map/*` routes -- mirrors
 * every other data hook's own "fetch, hold in state, expose setters that
 * round-trip and update from the response" shape (useDungeons.ts is the
 * closest sibling). `blocks`/`border`/`isDirty` all come straight from
 * whatever the server's own session state was after the last call; this
 * hook never computes anything client-side, it is a thin, honest mirror.
 */
export function useEditSession(mapName: string): UseEditSessionResult {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [border, setBorder] = useState<Block[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const applyResponse = (d: { blocks: Block[]; border: Block[]; isDirty: boolean }) => {
    setBlocks(d.blocks);
    setBorder(d.border);
    setIsDirty(d.isDirty);
  };

  const call = useCallback(
    async (path: string, body: unknown = {}) => {
      const r = await fetch(`/api/edit/${encodeURIComponent(mapName)}${path}`, { method: "POST", body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`POST /api/edit/${mapName}${path} -> ${r.status}`);
      applyResponse((await r.json()) as { blocks: Block[]; border: Block[]; isDirty: boolean });
    },
    [mapName],
  );

  const beginStroke = useCallback(() => call("/paint/begin"), [call]);
  const applyPaint = useCallback((body: PaintApplyBody) => call("/paint/apply", body), [call]);
  const endStroke = useCallback(() => call("/paint/end"), [call]);
  const undo = useCallback(() => call("/undo"), [call]);
  const redo = useCallback(() => call("/redo"), [call]);

  return { blocks, border, isDirty, beginStroke, applyPaint, endStroke, undo, redo };
}
```

Run: `npx vitest run packages/ui/test/useEditSession.test.tsx`
Expected: PASS, 2/2.

- [ ] **Step 4: MapCanvas — write the failing tests**

Read the FULL current `packages/ui/src/components/MapCanvas.tsx` first — this step's edits must land against the real current file (Task 21's overlay/hover architecture, `NO_TOGGLES`, the two-step composite effect), not a remembered version.

Add to `packages/ui/test/MapCanvas.test.tsx`:

```tsx
  it("with no editSession prop, mouse-down still pans exactly as before -- zero behavior change for read-only consumers", () => {
    // Reuses this file's own existing render/data fixtures -- see the
    // pre-existing pan test just above for the established pattern; this
    // one additionally asserts NO paint-route fetch ever fires.
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { canvas } = renderMapCanvas(); // existing helper in this file
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 20, clientY: 20 });
    fireEvent.mouseUp(canvas);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("with an editSession and a pencil tool active, mouse-down begins a stroke and paints the hovered block instead of panning", async () => {
    const editSession = {
      blocks: [], border: [], isDirty: false,
      beginStroke: vi.fn().mockResolvedValue(undefined),
      applyPaint: vi.fn().mockResolvedValue(undefined),
      endStroke: vi.fn().mockResolvedValue(undefined),
      undo: vi.fn(), redo: vi.fn(),
    };
    const { canvas } = renderMapCanvas({ editSession, activeTool: { kind: "pencil", stamp: { width: 1, height: 1, cells: [{ metatileId: 5 }] } } });
    fireEvent.mouseDown(canvas, { clientX: 16, clientY: 16, button: 0 }); // inside block (1,1) at 1x zoom, 16px/tile
    expect(editSession.beginStroke).toHaveBeenCalled();
    expect(editSession.applyPaint).toHaveBeenCalledWith(expect.objectContaining({ tool: "pencil" }));
    fireEvent.mouseUp(canvas);
    expect(editSession.endStroke).toHaveBeenCalled();
  });

  it("panning still works even with an editSession present, as long as no tool is selected (activeTool null)", () => {
    const editSession = { blocks: [], border: [], isDirty: false, beginStroke: vi.fn(), applyPaint: vi.fn(), endStroke: vi.fn(), undo: vi.fn(), redo: vi.fn() };
    const { canvas } = renderMapCanvas({ editSession, activeTool: null });
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 30, clientY: 30 });
    fireEvent.mouseUp(canvas);
    expect(editSession.beginStroke).not.toHaveBeenCalled();
  });
```

Add a `renderMapCanvas(extraProps = {})` helper near the top of the test file if one does not already exist under a different name — check the file's own current top-of-file render helper and either reuse it (adding an `extraProps` parameter) or add this thin wrapper around it; do not duplicate the existing fixture setup.

- [ ] **Step 5: Run test to verify it fails, then implement**

Run: `npx vitest run packages/ui/test/MapCanvas.test.tsx` — FAIL first (new props don't exist).

Modify `packages/ui/src/components/MapCanvas.tsx`:

Add to the imports: `import type { UseEditSessionResult, PaintApplyBody } from "../hooks/useEditSession.js";` and `import type { Stamp } from "@pokemap/core/src/edit/paint.js";`.

Extend `MapCanvasProps`:

```ts
export interface MapCanvasProps {
  mapName: string;
  data: MapLayoutData;
  /** Present only when editing is active for THIS map -- see
   *  useEditSession.ts. Every existing read-only consumer (Map mode's
   *  default view, WarpDestinationModal's preview) never passes this and
   *  is completely unaffected by anything in this task. */
  editSession?: UseEditSessionResult;
  activeTool?: { kind: "pencil" | "rect" | "bucket"; stamp: Stamp } | null;
}
```

In the component body, source `blocks` from `editSession` when present (live, server-tracked) instead of the static `data.blocks` prop -- find the existing `const { layout, split, map, blocks } = data;` destructure and change to:

```ts
  const { layout, split, map, blocks: staticBlocks } = data;
  const blocks = editSession ? editSession.blocks : staticBlocks;
```

Find the existing `onMouseDown` handler and change it from:

```ts
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };
```

to:

```ts
  const paintAt = (bx: number, by: number) => {
    if (!editSession || !activeTool) return;
    if (activeTool.kind === "pencil") {
      void editSession.applyPaint({ tool: "pencil", targets: [{ x: bx, y: by }], stamp: activeTool.stamp, origin: { x: bx, y: by } });
    } else if (activeTool.kind === "bucket") {
      void editSession.applyPaint({ tool: "bucket", x: bx, y: by, replacement: activeTool.stamp.cells[0]! });
    }
    // "rect" is handled entirely by onMouseUp below (it needs a start AND
    // end cell, unlike pencil/bucket which act on a single cell) -- see
    // rectStartRef.
  };

  const rectStartRef = useRef<{ x: number; y: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    if (editSession && activeTool) {
      const rect = e.currentTarget.getBoundingClientRect();
      const bx = Math.floor(((e.clientX - rect.left - pan.x) / zoom - originX) / 16);
      const by = Math.floor(((e.clientY - rect.top - pan.y) / zoom - originY) / 16);
      if (bx < 0 || by < 0 || bx >= layout.width || by >= layout.height) return;
      void editSession.beginStroke().then(() => {
        if (activeTool.kind === "rect") rectStartRef.current = { x: bx, y: by };
        else paintAt(bx, by);
      });
      return;
    }
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };
```

Find the existing `onMouseUp` handler and change it from `const onMouseUp = () => { dragRef.current = null; };` to:

```ts
  const onMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (editSession && activeTool) {
      if (activeTool.kind === "rect" && rectStartRef.current) {
        const rect = e.currentTarget.getBoundingClientRect();
        const bx = Math.floor(((e.clientX - rect.left - pan.x) / zoom - originX) / 16);
        const by = Math.floor(((e.clientY - rect.top - pan.y) / zoom - originY) / 16);
        void editSession.applyPaint({
          tool: "rect", x0: rectStartRef.current.x, y0: rectStartRef.current.y, x1: bx, y1: by,
          stamp: activeTool.stamp, origin: rectStartRef.current,
        }).then(() => editSession.endStroke());
        rectStartRef.current = null;
      } else {
        void editSession.endStroke();
      }
      return;
    }
    dragRef.current = null;
  };
```

Find the existing `onMouseMove` handler's pan branch (`if (dragRef.current) { ... setPan ... } else { hoverAt(...) }`) and add a pencil-drag-paints branch ahead of it:

```ts
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (editSession && activeTool?.kind === "pencil" && rectStartRef.current === null && e.buttons === 1) {
      const rect = e.currentTarget.getBoundingClientRect();
      const bx = Math.floor(((e.clientX - rect.left - pan.x) / zoom - originX) / 16);
      const by = Math.floor(((e.clientY - rect.top - pan.y) / zoom - originY) / 16);
      if (bx >= 0 && by >= 0 && bx < layout.width && by < layout.height) paintAt(bx, by);
      return;
    }
    if (dragRef.current) {
      const d = dragRef.current;
      setPan({ x: d.panX + (e.clientX - d.x), y: d.panY + (e.clientY - d.y) });
    } else {
      hoverAt(e.clientX, e.clientY);
    }
  };
```

Every OTHER part of the file (the composite/blit effects, the toggle buttons, the status strip, the zoom/wheel handling) is unchanged -- they already read `blocks` by name, and that name now transparently means "live edit-session blocks when editing, static data blocks otherwise" without those effects needing to know which.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run packages/ui/test/MapCanvas.test.tsx`
Expected: PASS, every test in the file (pre-existing + the 3 new ones).

- [ ] **Step 7: Run the full UI and server suites**

Run: `npx vitest run packages/ui packages/server`
Expected: PASS.

- [ ] **Step 8: Live-verify — this is exactly the class of bug Plan 0 §7 says only a real browser catches**

Start the dev servers (`launch.sh` / `.claude/launch.json`), open Map mode on a real map, select a pencil tool with a real metatile stamp (wiring the actual toolbar button comes in Task 13 — for this step, temporarily hardcode `activeTool` in `App.tsx` to a fixed stamp to exercise the path, then revert the hardcode before committing), and confirm: clicking genuinely repaints the clicked tile on screen, a drag paints a trail, releasing the mouse stops painting, and panning (no tool selected) still works exactly as before. This is the same class of defect Task 21's own postmortem (`packages/ui/src/components/MapCanvas.tsx`'s own composite-effect comments) describes — a passing test suite does not substitute for this.

- [ ] **Step 9: Teeth-proof**

Temporarily remove the `e.buttons === 1` check from `onMouseMove`'s pencil branch, confirm — by reasoning, since jsdom's `fireEvent.mouseMove` does not simulate a truly held button the way a real browser does — that no EXISTING test catches this regression; if that's the case, this is a real live-only defect class (painting a trail on hover with no button held) that Step 8's manual check, not an automated test, is what actually guards it. Note this in the task's own completion, do not silently skip acknowledging the gap.

- [ ] **Step 10: Commit**

```bash
git add packages/server/src/index.ts packages/server/test/paintRoutes.test.ts packages/ui/src/hooks/useEditSession.ts packages/ui/src/components/MapCanvas.tsx packages/ui/test/useEditSession.test.tsx packages/ui/test/MapCanvas.test.tsx
git commit -m "feat(ui): wire pencil/rect/bucket painting into MapCanvas via useEditSession, panning unaffected when no tool is active"
```

---

## Task 12: Collision/elevation painting

Coarse plan's original Task 8. Porymap's own collision editor is a fixed 4x1 (impassable + 3 passable "height" swatches shown as a strip) plus a separate elevation strip 0-15 -- players' own decomp docs call collision `0`/`1`/`2`/`3` where `1` is impassable and `0`/`2`/`3` are passable-but-distinct (used for e.g. water-current tiles), and elevation `0`-`15` where `0` means "inherit" and `15` means "always on top." This task reuses `packages/core/src/edit/paint.ts`'s existing `StampCell`/`paintCells` from Task 6 as-is -- a `StampCell` already carries `{metatileId?, collision?, elevation?}`, all optional, and `paintCells` (confirm by reading `packages/core/src/edit/paint.ts` now) already merges only the fields present on each cell into the target block, leaving the rest of that block untouched. Painting "collision only" is therefore just a stamp whose cells omit `metatileId`. No core changes needed this task -- verify that by reading the file before writing Step 1; if `paintCells` does NOT already merge partial cells this way, add a small `mergeCell(existing, stamp)` step to it first (write a failing test proving the gap, then fix) before proceeding to the UI half below.

**Files:**
- Modify (only if the read above finds a gap): `packages/core/src/edit/paint.ts` + its test
- Create: `packages/ui/src/components/CollisionPalette.tsx`
- Test: `packages/ui/test/CollisionPalette.test.tsx`
- Modify: `packages/ui/src/components/MapCanvas.tsx` (collision/elevation overlay rendering when this tool is active -- reuses the file's existing overlay-toggle rendering path, see Task 21)

**Invoke `frontend-design`/`ui-ux-pro-max`; follow `packages/ui/DESIGN.md`.**

- [ ] **Step 1: Read `packages/core/src/edit/paint.ts` in full and confirm partial-cell merge semantics**

If `paintCells`'s merge already treats an absent `metatileId`/`collision`/`elevation` field on a `StampCell` as "don't touch this block's existing value there" (check its body directly -- look for something like `cell.metatileId ?? existing.metatileId`), skip to Step 2. Otherwise, write a failing test in `packages/core/test/edit/paint.test.ts`:

```ts
  it("paintCells with a stamp cell that has only collision set leaves the target's existing metatileId and elevation untouched", () => {
    const blocks = makeBlocks(3, 3, { metatileId: 7, collision: 0, elevation: 4 }); // existing helper in this file
    const stamp: Stamp = { width: 1, height: 1, cells: [{ collision: 1 }] };
    const out = paintCells(blocks, 3, 3, [{ x: 1, y: 1 }], stamp, 1, 1);
    const target = out[1 * 3 + 1]!;
    expect(target.collision).toBe(1);
    expect(target.metatileId).toBe(7);
    expect(target.elevation).toBe(4);
  });
```

Run: FAIL if the gap is real. Fix the merge in `paintCells` to be field-by-field (`metatileId: cell.metatileId ?? existing.metatileId`, same for `collision`/`elevation`) rather than an all-or-nothing object spread. Run again: PASS. Run `npx vitest run packages/core`: PASS, no regressions (this is a strict widening of what was accepted before, and every existing caller already passes fully-populated cells).

- [ ] **Step 2: `CollisionPalette` — write the failing tests**

```tsx
// packages/ui/test/CollisionPalette.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { CollisionPalette } from "../src/components/CollisionPalette.js";

describe("CollisionPalette", () => {
  it("renders 4 collision swatches (0-3) and an elevation strip 0-15", () => {
    const { getAllByRole } = render(<CollisionPalette selected={{ collision: 0, elevation: 3 }} onSelect={vi.fn()} />);
    const collisionSwatches = getAllByRole("button", { name: /^collision /i });
    const elevationSwatches = getAllByRole("button", { name: /^elevation /i });
    expect(collisionSwatches).toHaveLength(4);
    expect(elevationSwatches).toHaveLength(16);
  });

  it("clicking a collision swatch calls onSelect with the new collision and the previously-selected elevation kept", () => {
    const onSelect = vi.fn();
    const { getByRole } = render(<CollisionPalette selected={{ collision: 0, elevation: 5 }} onSelect={onSelect} />);
    fireEvent.click(getByRole("button", { name: "collision 1 (impassable)" }));
    expect(onSelect).toHaveBeenCalledWith({ collision: 1, elevation: 5 });
  });

  it("clicking an elevation swatch calls onSelect with the new elevation and the previously-selected collision kept", () => {
    const onSelect = vi.fn();
    const { getByRole } = render(<CollisionPalette selected={{ collision: 2, elevation: 0 }} onSelect={onSelect} />);
    fireEvent.click(getByRole("button", { name: "elevation 15" }));
    expect(onSelect).toHaveBeenCalledWith({ collision: 2, elevation: 15 });
  });

  it("marks the currently-selected collision and elevation swatches with aria-pressed=true, all others false", () => {
    const { getByRole } = render(<CollisionPalette selected={{ collision: 1, elevation: 7 }} onSelect={vi.fn()} />);
    expect(getByRole("button", { name: "collision 1 (impassable)" })).toHaveAttribute("aria-pressed", "true");
    expect(getByRole("button", { name: "collision 0" })).toHaveAttribute("aria-pressed", "false");
    expect(getByRole("button", { name: "elevation 7" })).toHaveAttribute("aria-pressed", "true");
  });
});
```

- [ ] **Step 3: Run test to verify it fails, then implement**

Run: `npx vitest run packages/ui/test/CollisionPalette.test.tsx` — FAIL (module doesn't exist).

Create `packages/ui/src/components/CollisionPalette.tsx`:

```tsx
import "../styles.css";

export interface CollisionElevation {
  collision: number;
  elevation: number;
}

export interface CollisionPaletteProps {
  selected: CollisionElevation;
  onSelect: (next: CollisionElevation) => void;
}

const COLLISION_LABELS = ["collision 0", "collision 1 (impassable)", "collision 2", "collision 3"];

/**
 * Porymap-parity collision/elevation picker: a 4-swatch collision strip
 * (0-3, with 1 conventionally impassable -- decomp scripts and existing
 * corpus data both treat it that way, see packages/core/src/model/types.ts's
 * own Block.collision doc comment) plus a 16-swatch elevation strip (0-15,
 * 0 = inherit). Selecting either dimension keeps the other -- this mirrors
 * MetatilePalette's own click-to-select shape (Task 10) rather than
 * inventing a new interaction pattern.
 */
export function CollisionPalette({ selected, onSelect }: CollisionPaletteProps) {
  return (
    <div className="collision-palette">
      <div className="collision-palette__section">
        <div className="collision-palette__label">Collision</div>
        <div className="collision-palette__strip">
          {COLLISION_LABELS.map((label, collision) => (
            <button
              key={collision}
              type="button"
              role="button"
              aria-label={label}
              aria-pressed={selected.collision === collision}
              className={`collision-swatch collision-swatch--${collision}${selected.collision === collision ? " collision-swatch--active" : ""}`}
              onClick={() => onSelect({ collision, elevation: selected.elevation })}
            >
              {collision}
            </button>
          ))}
        </div>
      </div>
      <div className="collision-palette__section">
        <div className="collision-palette__label">Elevation</div>
        <div className="collision-palette__strip collision-palette__strip--elevation">
          {Array.from({ length: 16 }, (_, elevation) => (
            <button
              key={elevation}
              type="button"
              role="button"
              aria-label={`elevation ${elevation}`}
              aria-pressed={selected.elevation === elevation}
              className={`elevation-swatch${selected.elevation === elevation ? " elevation-swatch--active" : ""}`}
              onClick={() => onSelect({ collision: selected.collision, elevation })}
            >
              {elevation}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ui/test/CollisionPalette.test.tsx`
Expected: PASS, 4/4.

- [ ] **Step 5: CSS — add to `packages/ui/src/styles.css`, tokens only (no new colors)**

```css
.collision-palette { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-3); }
.collision-palette__label { font-size: 12px; color: var(--text-secondary); margin-bottom: var(--space-1); }
.collision-palette__strip { display: flex; gap: var(--space-1); flex-wrap: wrap; }
.collision-swatch, .elevation-swatch {
  width: 28px; height: 28px; border: 1px solid var(--border-default); border-radius: var(--radius-sm);
  background: var(--bg-panel-elevated); color: var(--text-primary); cursor: pointer; font-size: 11px;
}
.collision-swatch--active, .elevation-swatch--active { border-color: var(--accent-primary); background: var(--accent-primary-muted); }
.collision-swatch--1 { background: var(--danger-muted); } /* impassable, un-selected state still reads as distinct */
```

Confirm every token used (`--space-1/3`, `--radius-sm`, `--bg-panel-elevated`, `--text-primary/secondary`, `--border-default`, `--accent-primary`, `--accent-primary-muted`, `--danger-muted`) already exists in `packages/ui/DESIGN.md` / `styles.css` `:root` block — grep for each before committing; if `--danger-muted` doesn't exist, use `--danger` at reduced opacity via an existing pattern elsewhere in the file instead of inventing a new token (mirrors the Task 13-review lesson: don't let a palette silently fall back to an undefined token).

- [ ] **Step 6: Wire the collision/elevation overlay into `MapCanvas`**

Read the current overlay-toggle rendering path in `packages/ui/src/components/MapCanvas.tsx` (`Toggles`/`NO_TOGGLES`, mentioned in Task 21) — it already knows how to draw a collision tint overlay when the user toggles collision visibility. Extend `activeTool` (from Task 11) with a fourth kind:

```ts
  activeTool?: { kind: "pencil" | "rect" | "bucket"; stamp: Stamp } | { kind: "collision"; value: CollisionElevation } | null;
```

In `paintAt` (Task 11), add a branch:

```ts
    if (activeTool.kind === "collision") {
      void editSession.applyPaint({ tool: "pencil", targets: [{ x: bx, y: by }], stamp: { width: 1, height: 1, cells: [{ collision: activeTool.value.collision, elevation: activeTool.value.elevation }] }, origin: { x: bx, y: by } });
      return;
    }
```

Force the collision overlay ON (regardless of the toggle state) whenever `activeTool?.kind === "collision"`, so the player always sees what they're painting — find the existing toggle-driven overlay-visibility boolean and OR it with this condition.

- [ ] **Step 7: Test the MapCanvas collision-paint wiring**

Add to `packages/ui/test/MapCanvas.test.tsx`:

```tsx
  it("with the collision tool active, mouse-down paints collision+elevation only, and forces the collision overlay visible", () => {
    const editSession = { blocks: [], border: [], isDirty: false, beginStroke: vi.fn().mockResolvedValue(undefined), applyPaint: vi.fn().mockResolvedValue(undefined), endStroke: vi.fn().mockResolvedValue(undefined), undo: vi.fn(), redo: vi.fn() };
    const { canvas } = renderMapCanvas({ editSession, activeTool: { kind: "collision", value: { collision: 1, elevation: 0 } }, showCollision: false });
    fireEvent.mouseDown(canvas, { clientX: 16, clientY: 16, button: 0 });
    expect(editSession.applyPaint).toHaveBeenCalledWith(expect.objectContaining({
      stamp: { width: 1, height: 1, cells: [{ collision: 1, elevation: 0 }] },
    }));
  });
```

Run: `npx vitest run packages/ui/test/MapCanvas.test.tsx` — FAIL first, then confirm the Step 6 wiring makes it PASS.

- [ ] **Step 8: Run the full core and UI suites**

Run: `npx vitest run packages/core packages/ui`
Expected: PASS.

- [ ] **Step 9: Live-verify**

With the same temporary hardcode approach as Task 11 Step 8, select the collision tool with `{collision: 1, elevation: 0}`, click a tile on a real map, confirm the collision overlay tint changes on that tile and the overlay stays visible without needing the separate toggle. Revert the hardcode before committing.

- [ ] **Step 10: Teeth-proof**

Break Step 6's OR-in-force-visible change (revert it to only respect the manual toggle) and confirm Step 7's test does NOT catch this — `applyPaint` still gets called correctly, the overlay-forcing behavior has no assertion. Add one:

```tsx
    expect(getByTestId("collision-overlay")).toHaveAttribute("data-visible", "true");
```

(Add a matching `data-testid="collision-overlay"` / `data-visible` attribute to the actual overlay-rendering element in `MapCanvas.tsx` if it doesn't already expose one — check the file first; Task 21 may have already added a similar hook for a different overlay.) Re-run: this now correctly fails when the force-visible logic is reverted, and passes with it restored.

- [ ] **Step 11: Commit**

```bash
git add packages/core/src/edit/paint.ts packages/core/test/edit/paint.test.ts packages/ui/src/components/CollisionPalette.tsx packages/ui/src/components/MapCanvas.tsx packages/ui/src/styles.css packages/ui/test/CollisionPalette.test.tsx packages/ui/test/MapCanvas.test.tsx
git commit -m "feat(ui): collision/elevation painting -- CollisionPalette, MapCanvas wiring, forced overlay visibility while active"
```

---

## Task 13: Save flow UI

Coarse plan's original Task 9. This is where invariant I6 ("no autosave, ever — every write is explicit and user-initiated") becomes a real, visible UI contract: a dirty session sits in server memory (Task 8/9) until the player explicitly reviews a plan and commits it, or explicitly discards it. Losing that state silently (closing the tab, switching maps) must warn first.

**Files:**
- Create: `packages/ui/src/components/SaveDialog.tsx`
- Create: `packages/ui/src/components/Toolbar.tsx`
- Modify: `packages/ui/src/App.tsx` (mount Toolbar in edit mode, wire beforeunload warning, wire map-switch guard)
- Test: `packages/ui/test/SaveDialog.test.tsx`
- Test: `packages/ui/test/Toolbar.test.tsx`
- Test: `packages/ui/test/App.test.tsx` (add to it)

**Invoke `frontend-design`/`ui-ux-pro-max`; follow `packages/ui/DESIGN.md`.**

- [ ] **Step 1: `SaveDialog` — write the failing tests**

Ground this against the REAL server response shape Task 9 already built (`GET /api/edit/:map/plan` and `POST /api/edit/:map/commit` both return `core`'s own `formatDiffJson(plan)`: `{changes: {path,kind,summary}[], refusals: {code,message,fix,subject}[]}` — see `packages/core/src/write/diff.ts` and `packages/server/src/index.ts`'s `planMatch`/`commitMatch` handlers, both read directly before writing this component). There is no separate `{files}`/`{ok}` shape — reuse the one the server already sends.

```tsx
// packages/ui/test/SaveDialog.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SaveDialog } from "../src/components/SaveDialog.js";

describe("SaveDialog", () => {
  it("fetches the plan on open and lists each pending change's summary", async () => {
    const plan = { changes: [
      { path: "data/layouts/layouts.json", kind: "binary", summary: "layouts.bin -- 3 blocks changed" },
      { path: "data/maps/PalletTown/map.json", kind: "json", summary: "PalletTown.json -- 1 field edit" },
    ], refusals: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(plan) }));
    render(<SaveDialog mapName="PalletTown" onCommitted={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("layouts.bin -- 3 blocks changed")).toBeInTheDocument());
    expect(screen.getByText("PalletTown.json -- 1 field edit")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("clicking Save Changes POSTs to /commit and calls onCommitted when the response carries no refusals", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ changes: [{ path: "a", kind: "binary", summary: "a changed" }], refusals: [] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ changes: [], refusals: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    const onCommitted = vi.fn();
    render(<SaveDialog mapName="PalletTown" onCommitted={onCommitted} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("a changed")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(onCommitted).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/edit/PalletTown/commit", expect.objectContaining({ method: "POST" }));
    vi.unstubAllGlobals();
  });

  it("a commit rejected with 400 (refusals present) shows each refusal's fix text and does NOT call onCommitted", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ changes: [{ path: "a", kind: "binary", summary: "a changed" }], refusals: [] }) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: () => Promise.resolve({ changes: [], refusals: [{ code: "STALE_MAP_JSON", message: "map.json changed on disk since edit session opened", fix: "Reload the map and redo your edits", subject: "PalletTown" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const onCommitted = vi.fn();
    render(<SaveDialog mapName="PalletTown" onCommitted={onCommitted} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("a changed")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(screen.getByText("Reload the map and redo your edits")).toBeInTheDocument());
    expect(onCommitted).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("clicking Discard calls onCancel without ever calling fetch commit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ changes: [], refusals: [] }) }));
    const onCancel = vi.fn();
    render(<SaveDialog mapName="PalletTown" onCommitted={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onCancel).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run test to verify it fails, then implement**

Run: `npx vitest run packages/ui/test/SaveDialog.test.tsx` — FAIL (module doesn't exist).

Create `packages/ui/src/components/SaveDialog.tsx`:

```tsx
import { useEffect, useState } from "react";
import "../styles.css";

interface PendingChange { path: string; kind: "json" | "binary"; summary: string }
interface Refusal { code: string; message: string; fix: string; subject: string }
interface DiffPlan { changes: PendingChange[]; refusals: Refusal[] }

export interface SaveDialogProps {
  mapName: string;
  onCommitted: () => void;
  onCancel: () => void;
}

/**
 * The ONLY UI path that turns an in-memory edit session (Task 8/9's
 * server-side EditSession) into a real disk write. Per I6, nothing else in
 * this app writes without the player explicitly landing here and clicking
 * Save Changes -- see docs/superpowers/plans/2026-08-26-pokemap-plan-0-roadmap.md's
 * own I6 definition. Both `/plan` and `/commit` return the same
 * `core`'s `formatDiffJson` shape (see Task 9) -- this component never
 * invents its own response contract.
 */
export function SaveDialog({ mapName, onCommitted, onCancel }: SaveDialogProps) {
  const [plan, setPlan] = useState<DiffPlan | null>(null);
  const [refusals, setRefusals] = useState<Refusal[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/edit/${encodeURIComponent(mapName)}/plan`)
      .then((r) => r.json())
      .then((d: DiffPlan) => { if (!cancelled) setPlan(d); });
    return () => { cancelled = true; };
  }, [mapName]);

  const save = async () => {
    setSaving(true);
    setRefusals([]);
    const r = await fetch(`/api/edit/${encodeURIComponent(mapName)}/commit`, { method: "POST" });
    const body = (await r.json()) as DiffPlan;
    setSaving(false);
    if (r.ok && body.refusals.length === 0) {
      onCommitted();
      return;
    }
    setRefusals(body.refusals);
  };

  return (
    <div className="save-dialog" role="dialog" aria-label="Save changes">
      <h2 className="save-dialog__title">Save Changes</h2>
      {plan === null ? (
        <p className="save-dialog__loading">Loading changes…</p>
      ) : plan.changes.length === 0 ? (
        <p className="save-dialog__empty">No changes to save.</p>
      ) : (
        <ul className="save-dialog__files">
          {plan.changes.map((c) => (
            <li key={c.path} className="save-dialog__file">
              <span className="save-dialog__file-path">{c.summary}</span>
            </li>
          ))}
        </ul>
      )}
      {refusals.map((r) => (
        <div key={r.code + r.subject} className="save-dialog__refusal" role="alert">
          <p className="save-dialog__refusal-message">{r.message}</p>
          <p className="save-dialog__refusal-fix">{r.fix}</p>
        </div>
      ))}
      <div className="save-dialog__actions">
        <button type="button" className="btn btn--secondary" onClick={onCancel}>Discard</button>
        <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={saving || plan === null || plan.changes.length === 0}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run packages/ui/test/SaveDialog.test.tsx`
Expected: PASS, 4/4.

- [ ] **Step 4: `Toolbar` — write the failing tests**

```tsx
// packages/ui/test/Toolbar.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Toolbar } from "../src/components/Toolbar.js";

describe("Toolbar", () => {
  const baseProps = {
    activeToolKind: "pencil" as const,
    onSelectTool: vi.fn(),
    isDirty: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    canUndo: false,
    canRedo: false,
    onOpenSave: vi.fn(),
  };

  it("renders one button per tool (pencil, rect, bucket, dropper, shift, collision) and marks the active one aria-pressed", () => {
    render(<Toolbar {...baseProps} />);
    expect(screen.getByRole("button", { name: "pencil" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "rect" })).toHaveAttribute("aria-pressed", "false");
    for (const name of ["pencil", "rect", "bucket", "dropper", "shift", "collision"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("clicking a tool button calls onSelectTool with that tool's kind", () => {
    const onSelectTool = vi.fn();
    render(<Toolbar {...baseProps} onSelectTool={onSelectTool} />);
    fireEvent.click(screen.getByRole("button", { name: "bucket" }));
    expect(onSelectTool).toHaveBeenCalledWith("bucket");
  });

  it("undo/redo buttons are disabled when canUndo/canRedo are false, enabled and clickable otherwise", () => {
    const onUndo = vi.fn();
    const { rerender } = render(<Toolbar {...baseProps} />);
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    rerender(<Toolbar {...baseProps} canUndo={true} onUndo={onUndo} />);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalled();
  });

  it("shows a dirty indicator only when isDirty is true, and the Save button is disabled when not dirty", () => {
    const { rerender } = render(<Toolbar {...baseProps} isDirty={false} />);
    expect(screen.queryByTestId("dirty-indicator")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
    rerender(<Toolbar {...baseProps} isDirty={true} />);
    expect(screen.getByTestId("dirty-indicator")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/ })).toBeEnabled();
  });
});
```

- [ ] **Step 5: Run test to verify it fails, then implement**

Run: `npx vitest run packages/ui/test/Toolbar.test.tsx` — FAIL first.

Create `packages/ui/src/components/Toolbar.tsx`:

```tsx
import "../styles.css";

export type ToolKind = "pencil" | "rect" | "bucket" | "dropper" | "shift" | "collision";

const TOOLS: ToolKind[] = ["pencil", "rect", "bucket", "dropper", "shift", "collision"];

export interface ToolbarProps {
  activeToolKind: ToolKind | null;
  onSelectTool: (kind: ToolKind) => void;
  isDirty: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onOpenSave: () => void;
}

/** Docked edit-mode toolbar -- tool selection, undo/redo, and the single
 *  entry point into SaveDialog (I6: no other button anywhere writes to disk). */
export function Toolbar({ activeToolKind, onSelectTool, isDirty, onUndo, onRedo, canUndo, canRedo, onOpenSave }: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar__tools">
        {TOOLS.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-label={kind}
            aria-pressed={activeToolKind === kind}
            className={`toolbar__tool-btn${activeToolKind === kind ? " toolbar__tool-btn--active" : ""}`}
            onClick={() => onSelectTool(kind)}
          >
            {kind}
          </button>
        ))}
      </div>
      <div className="toolbar__history">
        <button type="button" aria-label="Undo" onClick={onUndo} disabled={!canUndo} className="btn btn--icon">↶</button>
        <button type="button" aria-label="Redo" onClick={onRedo} disabled={!canRedo} className="btn btn--icon">↷</button>
      </div>
      <div className="toolbar__save">
        {isDirty && <span data-testid="dirty-indicator" className="toolbar__dirty-dot" title="Unsaved changes" />}
        <button type="button" aria-label="Save Changes" onClick={onOpenSave} disabled={!isDirty} className="btn btn--primary">
          Save{isDirty ? " (unsaved changes)" : ""}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run packages/ui/test/Toolbar.test.tsx`
Expected: PASS, 4/4.

- [ ] **Step 7: CSS — add to `packages/ui/src/styles.css`, tokens only**

```css
.toolbar { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-2) var(--space-3); background: var(--bg-panel); border-bottom: 1px solid var(--border-default); }
.toolbar__tools { display: flex; gap: var(--space-1); }
.toolbar__tool-btn { padding: var(--space-1) var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-sm); background: var(--bg-panel-elevated); color: var(--text-primary); cursor: pointer; text-transform: capitalize; }
.toolbar__tool-btn--active { border-color: var(--accent-primary); background: var(--accent-primary-muted); }
.toolbar__history { display: flex; gap: var(--space-1); }
.toolbar__save { margin-left: auto; display: flex; align-items: center; gap: var(--space-2); }
.toolbar__dirty-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--warning); display: inline-block; }
.save-dialog { padding: var(--space-4); max-width: 480px; }
.save-dialog__title { margin: 0 0 var(--space-3); }
.save-dialog__files { list-style: none; margin: 0 0 var(--space-3); padding: 0; max-height: 240px; overflow-y: auto; }
.save-dialog__file { display: flex; justify-content: space-between; padding: var(--space-1) 0; border-bottom: 1px solid var(--border-subtle); font-family: monospace; font-size: 12px; }
.save-dialog__refusal { background: var(--danger-muted); border: 1px solid var(--danger); border-radius: var(--radius-sm); padding: var(--space-2); margin-bottom: var(--space-3); }
.save-dialog__actions { display: flex; justify-content: flex-end; gap: var(--space-2); }
```

Grep DESIGN.md for `--warning`, `--border-subtle`, `--danger`/`--danger-muted` before committing — if `--danger-muted` was already resolved (or not) in Task 12 Step 5, be consistent with that resolution here rather than re-deciding it.

- [ ] **Step 8: Wire into `App.tsx` — write the failing test first**

Read the current `packages/ui/src/App.tsx` in full (mode switching, `key="world"`/`key="dungeon"` from the Dungeon Mode plan, Map mode's own current shape) before editing.

Add to `packages/ui/test/App.test.tsx`:

```tsx
  it("in Map edit mode with a dirty session, attempting to switch maps shows a native-confirm-equivalent guard instead of switching silently", async () => {
    // Mirrors this file's own existing map-mode render fixture; extends it
    // with an edit session whose isDirty starts true.
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { container } = renderAppInEditModeWithDirtySession(); // add this helper near this file's existing renderApp helpers, mirroring their shape
    fireEvent.click(screen.getByRole("button", { name: /switch map/i }));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("registers a beforeunload handler while an edit session is dirty, and removes it once clean", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    renderAppInEditModeWithDirtySession();
    expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
```

- [ ] **Step 9: Run test to verify it fails, then implement**

Run: `npx vitest run packages/ui/test/App.test.tsx` — FAIL first (helper/behavior don't exist).

In `App.tsx`, wherever edit-mode state lives, add:

```ts
  useEffect(() => {
    if (!editSession?.isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editSession?.isDirty]);
```

And wherever map-switching is triggered in edit mode, guard it:

```ts
  const handleSwitchMap = (nextMap: string) => {
    if (editSession?.isDirty && !window.confirm("You have unsaved changes. Discard them and switch maps?")) return;
    // ...existing switch logic...
  };
```

Mount `<Toolbar>` above `<MapCanvas>` when in Map mode and an edit session exists, and mount `<SaveDialog>` (conditionally, behind a `saveDialogOpen` boolean state toggled by `Toolbar`'s `onOpenSave`) as a modal overlay — reuse whatever modal-overlay wrapper `WarpDestinationModal` (Dungeon Mode plan) already established, including its `--overlay-modal-scrim` token from that plan's own Task 8 fix, rather than inventing a second modal pattern.

- [ ] **Step 10: Run test to verify it passes**

Run: `npx vitest run packages/ui/test/App.test.tsx`
Expected: PASS.

- [ ] **Step 11: Run the full UI suite**

Run: `npx vitest run packages/ui`
Expected: PASS.

- [ ] **Step 12: Live-verify**

Paint a few tiles (Task 11's temporary hardcode still wired, or by now the real Toolbar), confirm the dirty dot appears, click Save, confirm the SaveDialog lists real changed files with real byte deltas, click Save Changes, confirm it closes and the dirty dot clears. Then paint again, try to close the tab (or trigger `beforeunload` via `javascript_tool` dispatch since real browser dialogs can't be scripted) and confirm the guard fires. Try switching maps while dirty and confirm the confirm() guard fires and, on cancel, the map does NOT switch.

- [ ] **Step 13: Teeth-proof**

Remove the `!editSession?.isDirty` early-return guard from the `beforeunload` effect (make it always attach) and confirm this is NOT caught by Step 9's tests as written (they only check the dirty case) — add a companion test asserting `addEventListener` is NOT called with `"beforeunload"` when `isDirty` is false, so the gate is real.

- [ ] **Step 14: Commit**

```bash
git add packages/ui/src/components/SaveDialog.tsx packages/ui/src/components/Toolbar.tsx packages/ui/src/App.tsx packages/ui/src/styles.css packages/ui/test/SaveDialog.test.tsx packages/ui/test/Toolbar.test.tsx packages/ui/test/App.test.tsx
git commit -m "feat(ui): save flow -- SaveDialog, Toolbar, I6 dirty-state guards on tab-close and map-switch"
```

---

## Task 14: Event editing UI

Coarse plan's original Task 10's UI half (Task 7 of this document already built the core `moveEvent`/`addEvent`/`deleteEvent` logic; Task 9 already built the server routes `/event/move|add|delete`). This task is the on-canvas selection/drag interaction plus a side-panel inspector, mirroring how `MetatilePalette` (Task 10) and `CollisionPalette` (Task 12) each got one focused component rather than folding into `MapCanvas` directly.

**Files:**
- Create: `packages/ui/src/components/EventInspector.tsx`
- Modify: `packages/ui/src/components/MapCanvas.tsx` (event markers already render read-only today per the existing Map-mode viewer — confirm by reading the file; this task adds select/drag/click-empty-to-deselect on top of that existing rendering)
- Test: `packages/ui/test/EventInspector.test.tsx`
- Test: `packages/ui/test/MapCanvas.test.tsx` (add to it)

**Invoke `frontend-design`/`ui-ux-pro-max`; follow `packages/ui/DESIGN.md`.**

- [ ] **Step 1: Read the current event-marker rendering in `MapCanvas.tsx`**

Confirm exactly how `object_events`/`warp_events`/`coord_events`/`bg_events` are currently drawn (marker shapes, colors, hit-test radius) — this task must reuse that rendering, not replace it, and must reuse Task 7's `EVENT_ARRAY_KEY` raw-field-name mapping and `rawToCamel` parser rather than re-deriving event shapes.

- [ ] **Step 2: `EventInspector` — write the failing tests**

```tsx
// packages/ui/test/EventInspector.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EventInspector } from "../src/components/EventInspector.js";

const objectEvent = { kind: "object" as const, index: 0, x: 5, y: 6, elevation: 3, graphicsId: "OBJ_EVENT_GFX_BOY_1", movementType: "MOVEMENT_TYPE_FACE_DOWN" };

describe("EventInspector", () => {
  it("with no selection, shows an 'Add Event' control and no field editors", () => {
    render(<EventInspector selected={null} onMove={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: /add event/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("X")).not.toBeInTheDocument();
  });

  it("with a selected object event, shows editable X/Y/elevation fields pre-filled with its current values", () => {
    render(<EventInspector selected={objectEvent} onMove={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByLabelText("X")).toHaveValue(5);
    expect(screen.getByLabelText("Y")).toHaveValue(6);
    expect(screen.getByLabelText("Elevation")).toHaveValue(3);
  });

  it("editing X and blurring calls onMove with the event's kind/index and the new x", () => {
    const onMove = vi.fn();
    render(<EventInspector selected={objectEvent} onMove={onMove} onDelete={vi.fn()} onAdd={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("X"), { target: { value: "9" } });
    fireEvent.blur(screen.getByLabelText("X"));
    expect(onMove).toHaveBeenCalledWith({ kind: "object", index: 0, x: 9, y: 6, elevation: 3 });
  });

  it("clicking Delete calls onDelete with the selected event's kind/index", () => {
    const onDelete = vi.fn();
    render(<EventInspector selected={objectEvent} onMove={vi.fn()} onDelete={onDelete} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith({ kind: "object", index: 0 });
  });

  it("a warp event additionally shows Dest Map / Dest Warp fields, an object event does not", () => {
    const warp = { kind: "warp" as const, index: 0, x: 1, y: 1, elevation: 0, destMap: "PalletTown", destWarpId: 2 };
    render(<EventInspector selected={warp} onMove={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByLabelText("Dest Map")).toHaveValue("PalletTown");
    const { unmount } = render(<EventInspector selected={objectEvent} onMove={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.queryByLabelText("Dest Map")).not.toBeInTheDocument();
    unmount();
  });
});
```

- [ ] **Step 3: Run test to verify it fails, then implement**

Run: `npx vitest run packages/ui/test/EventInspector.test.tsx` — FAIL first.

Create `packages/ui/src/components/EventInspector.tsx`. Ground the `SelectedEvent` union in Task 7's real event shapes (read `packages/core/src/edit/events.ts` for the exact field names before writing this):

```tsx
import { useState, useEffect } from "react";
import "../styles.css";

export type SelectedEvent =
  | { kind: "object"; index: number; x: number; y: number; elevation: number; graphicsId: string; movementType: string }
  | { kind: "warp"; index: number; x: number; y: number; elevation: number; destMap: string; destWarpId: number }
  | { kind: "coord"; index: number; x: number; y: number; elevation: number; script: string }
  | { kind: "bg"; index: number; x: number; y: number; elevation: number; bgEventType: string };

export interface EventInspectorProps {
  selected: SelectedEvent | null;
  onMove: (next: { kind: SelectedEvent["kind"]; index: number; x: number; y: number; elevation: number }) => void;
  onDelete: (ref: { kind: SelectedEvent["kind"]; index: number }) => void;
  onAdd: () => void;
}

/** Side-panel companion to MapCanvas's event markers -- selection lives in
 *  the parent (App.tsx), this component is a pure display+edit form over
 *  whatever is currently selected there, mirroring CollisionPalette's own
 *  controlled-selection shape (Task 12) rather than owning state itself. */
export function EventInspector({ selected, onMove, onDelete, onAdd }: EventInspectorProps) {
  const [draft, setDraft] = useState(selected);
  useEffect(() => setDraft(selected), [selected]);

  if (!selected || !draft) {
    return (
      <div className="event-inspector event-inspector--empty">
        <p>No event selected.</p>
        <button type="button" className="btn btn--primary" onClick={onAdd}>Add Event</button>
      </div>
    );
  }

  const commit = () => {
    onMove({ kind: draft.kind, index: draft.index, x: draft.x, y: draft.y, elevation: draft.elevation });
  };

  return (
    <div className="event-inspector">
      <h3 className="event-inspector__title">{draft.kind} event #{draft.index}</h3>
      <label className="event-inspector__field">
        X
        <input type="number" aria-label="X" value={draft.x} onChange={(e) => setDraft({ ...draft, x: Number(e.target.value) })} onBlur={commit} />
      </label>
      <label className="event-inspector__field">
        Y
        <input type="number" aria-label="Y" value={draft.y} onChange={(e) => setDraft({ ...draft, y: Number(e.target.value) })} onBlur={commit} />
      </label>
      <label className="event-inspector__field">
        Elevation
        <input type="number" aria-label="Elevation" value={draft.elevation} onChange={(e) => setDraft({ ...draft, elevation: Number(e.target.value) })} onBlur={commit} />
      </label>
      {draft.kind === "warp" && (
        <>
          <label className="event-inspector__field">
            Dest Map
            <input type="text" aria-label="Dest Map" value={draft.destMap} readOnly />
          </label>
          <label className="event-inspector__field">
            Dest Warp
            <input type="number" aria-label="Dest Warp" value={draft.destWarpId} readOnly />
          </label>
        </>
      )}
      <button type="button" className="btn btn--danger" onClick={() => onDelete({ kind: draft.kind, index: draft.index })}>Delete</button>
    </div>
  );
}
```

(Dest Map/Dest Warp are read-only in this task — retargeting a warp's destination is a heavier operation involving `findWarpsTargetingByIndex`'s renumber-warning machinery from Task 7/9 and is explicitly out of scope here; note this in the task's own completion rather than silently under-building.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ui/test/EventInspector.test.tsx`
Expected: PASS, 5/5.

- [ ] **Step 5: MapCanvas — write the failing tests for select/drag/deselect**

Add to `packages/ui/test/MapCanvas.test.tsx`:

```tsx
  it("in edit mode with events present, clicking on an event marker selects it and calls onSelectEvent", () => {
    const data = makeMapLayoutDataWithEvents(); // add this helper, extending the file's existing fixture with one object_event at block (2,2)
    const onSelectEvent = vi.fn();
    const { canvas } = renderMapCanvas({ data, editSession: makeEditSession(), activeTool: null, onSelectEvent });
    fireEvent.mouseDown(canvas, { clientX: 2 * 16 + 8, clientY: 2 * 16 + 8, button: 0 });
    fireEvent.mouseUp(canvas);
    expect(onSelectEvent).toHaveBeenCalledWith({ kind: "object", index: 0 });
  });

  it("clicking empty canvas (no marker under the cursor) calls onSelectEvent with null, deselecting", () => {
    const data = makeMapLayoutDataWithEvents();
    const onSelectEvent = vi.fn();
    const { canvas } = renderMapCanvas({ data, editSession: makeEditSession(), activeTool: null, onSelectEvent });
    fireEvent.mouseDown(canvas, { clientX: 50 * 16, clientY: 50 * 16, button: 0 });
    fireEvent.mouseUp(canvas);
    expect(onSelectEvent).toHaveBeenCalledWith(null);
  });

  it("dragging a selected event marker to a new cell calls onMoveEvent with the new x/y once, on mouseup (not on every mousemove frame)", () => {
    const data = makeMapLayoutDataWithEvents();
    const onMoveEvent = vi.fn();
    const { canvas } = renderMapCanvas({ data, editSession: makeEditSession(), activeTool: null, selectedEventRef: { kind: "object", index: 0 }, onMoveEvent });
    fireEvent.mouseDown(canvas, { clientX: 2 * 16 + 8, clientY: 2 * 16 + 8, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 4 * 16 + 8, clientY: 4 * 16 + 8 });
    expect(onMoveEvent).not.toHaveBeenCalled();
    fireEvent.mouseUp(canvas);
    expect(onMoveEvent).toHaveBeenCalledWith({ kind: "object", index: 0, x: 4, y: 4 });
  });
```

Add `makeMapLayoutDataWithEvents()` and `makeEditSession()` helpers near this file's existing fixtures if they don't already exist under another name — reuse, don't duplicate.

- [ ] **Step 6: Run test to verify it fails, then implement**

Run: `npx vitest run packages/ui/test/MapCanvas.test.tsx` — FAIL first.

Extend `MapCanvasProps` with `onSelectEvent?: (ref: { kind: string; index: number } | null) => void`, `selectedEventRef?: { kind: string; index: number } | null`, `onMoveEvent?: (next: { kind: string; index: number; x: number; y: number }) => void`.

In `onMouseDown`, ahead of the Task 11 paint branch, add an event-hit-test branch (using whatever hit-test helper the existing read-only marker rendering already has, per Step 1's read — if none exists as a standalone function, extract one from the render loop first: `findEventAt(events, bx, by): {kind,index} | null`):

```ts
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const bx = Math.floor(((e.clientX - rect.left - pan.x) / zoom - originX) / 16);
    const by = Math.floor(((e.clientY - rect.top - pan.y) / zoom - originY) / 16);
    if (onSelectEvent && !activeTool) {
      const hit = findEventAt(allEvents, bx, by);
      onSelectEvent(hit);
      if (hit) { eventDragRef.current = { kind: hit.kind, index: hit.index, x: bx, y: by }; return; }
    }
    if (editSession && activeTool) { /* ...unchanged from Task 11... */ }
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };
```

In `onMouseMove`, add a branch that updates a LOCAL drag-preview position (redrawn via the existing composite effect, not sent to the server) while `eventDragRef.current` is set — do not call `onMoveEvent` here, matching the test's explicit "not on every mousemove frame" assertion, which mirrors the exact class of bug Task 15 (Dungeon Mode plan) already fixed once for a different effect.

In `onMouseUp`, ahead of the Task 11 branch:

```ts
    if (eventDragRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const bx = Math.floor(((e.clientX - rect.left - pan.x) / zoom - originX) / 16);
      const by = Math.floor(((e.clientY - rect.top - pan.y) / zoom - originY) / 16);
      const { kind, index } = eventDragRef.current;
      eventDragRef.current = null;
      if (bx !== eventDragRef.current?.x || by !== eventDragRef.current?.y) onMoveEvent?.({ kind, index, x: bx, y: by });
      return;
    }
```

(Correct the stale-read bug in that last line before implementing it for real — `eventDragRef.current` is already null by the time of the comparison; capture the original `x`/`y` into local consts BEFORE nulling the ref, e.g. `const { kind, index, x: ox, y: oy } = eventDragRef.current; eventDragRef.current = null; if (bx !== ox || by !== oy) onMoveEvent?.(...)`. This exact ref-read-after-clear mistake is written into this plan deliberately as the kind of thing Step 8's teeth-proof step must catch if left in — implement it CORRECTLY, not as pasted above.)

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run packages/ui/test/MapCanvas.test.tsx`
Expected: PASS, every test in the file.

- [ ] **Step 8: Teeth-proof**

Reintroduce the stale-ref-read bug called out in Step 6's parenthetical (read `eventDragRef.current` AFTER setting it to null) and confirm Step 5's third test fails (it should — `onMoveEvent` would now be called with `undefined !== bx` always true, or would throw). This proves the test genuinely exercises the fix, not just the call shape. Revert to the correct implementation.

- [ ] **Step 9: Wire `EventInspector` + selection state into `App.tsx`**

Add `selectedEvent`/`setSelectedEvent` state in `App.tsx`'s Map-edit-mode branch, pass `onSelectEvent={(ref) => setSelectedEvent(resolveEventRef(ref, currentEvents))}` (resolving the `{kind,index}` ref into a full `SelectedEvent` by looking it up in the current event lists) into `MapCanvas`, and mount `<EventInspector selected={selectedEvent} onMove={...} onDelete={...} onAdd={...} />` in the edit-mode side panel alongside `Toolbar`. Wire `onMove`/`onDelete`/`onAdd` to the Task 9 server routes via `useEditSession` (extend that hook with `moveEvent`/`addEvent`/`deleteEvent` methods mirroring its existing `undo`/`redo` shape) — write this extension's own test in `packages/ui/test/useEditSession.test.tsx` following that file's established per-method test pattern before implementing it.

- [ ] **Step 10: Run the full UI suite**

Run: `npx vitest run packages/ui`
Expected: PASS.

- [ ] **Step 11: Live-verify**

Open a real map with object events in edit mode, click a marker, confirm the inspector shows its real fields, drag it to a new cell, confirm it moves on mouse-up (not mid-drag) and the inspector's X/Y update. Click Delete, confirm the marker disappears. Click Add Event, confirm a new default event appears and is immediately selected.

- [ ] **Step 12: Commit**

```bash
git add packages/ui/src/components/EventInspector.tsx packages/ui/src/components/MapCanvas.tsx packages/ui/src/hooks/useEditSession.ts packages/ui/src/App.tsx packages/ui/src/styles.css packages/ui/test/EventInspector.test.tsx packages/ui/test/MapCanvas.test.tsx packages/ui/test/useEditSession.test.tsx
git commit -m "feat(ui): event editing -- select/drag on canvas, EventInspector panel, move/delete/add wired to server"
```

---

## Task 15: Wild sign — species suggestion

Coarse plan's original Task 11. A "wild sign" (the spec's own term, matching a real, existing pattern already in the subject decomp — see `data/maps/CeladonCity/scripts.inc`'s `CeladonCity_EventScript_Poliwrath` and its object event in `data/maps/CeladonCity/map.json`, both read directly below) is an object event whose `graphics_id` is `OBJ_EVENT_GFX_SPECIES(<NAME>)` (an **overworld species** graphic — the sprite IS the Pokémon, not an NPC standing near one) and whose script plays that species' cry and shows a line of dialogue on interact. This task builds the pure ranking/placement logic; Task 16 builds the script text; Task 17 wires both into an actual write.

**Files:**
- Create: `packages/core/src/signs/suggest.ts`
- Test: `packages/core/test/signs/suggest.test.ts`

- [ ] **Step 1: Ground the two things this module ranks — read them directly, don't guess**

Read `packages/core/src/analyse/coverage.ts`'s `whereSpecies` (species → maps) and `packages/core/src/load/encounters.ts`'s `speciesChances`/`FISHING_RODS` (map → species) — this task is the SECOND direction: given a map already chosen, rank every species available there. Read `include/constants/metatile_behaviors.h` in the subject decomp (read-only, per I8) and confirm `MB_TALL_GRASS` is `0x02` — this is the only behavior constant this task needs, and it is small and stable enough to hardcode with a citing comment rather than build a full behavior-name table (out of scope; nothing else in `core` currently names behaviors, per `packages/core/src/load/tilesetData.ts`'s own `behavior(id): number` returning a raw code).

- [ ] **Step 2: Write the failing tests**

```ts
// packages/core/test/signs/suggest.test.ts
import { describe, it, expect } from "vitest";
import { openProject } from "../../src/project.js"; // exact import path used by this repo's other core tests -- confirm against an existing test file (e.g. warpGraph.test.ts) before writing
import { rankSpeciesForSign, suggestSignPlacement } from "../../src/signs/suggest.js";

const ROOT = process.env.POKEEMERALD_ROOT!; // same fixture-root convention as every other core test in this repo

describe("rankSpeciesForSign", () => {
  it("ranks species available on a real route by descending encounter percent, deduped across variants/methods/rods to each species' single best chance", () => {
    const proj = openProject(ROOT);
    const ranked = rankSpeciesForSign(proj, "Route101"); // adjust to a real route name present in the fixture root, confirmed to have a wild encounter table
    expect(ranked.length).toBeGreaterThan(0);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1]!.percent).toBeGreaterThanOrEqual(ranked[i]!.percent);
    const speciesSeen = new Set(ranked.map((r) => r.species));
    expect(speciesSeen.size).toBe(ranked.length); // one row per species, not one per table
  });

  it("a map with no wild encounter table returns an empty array, not a throw", () => {
    const proj = openProject(ROOT);
    const ranked = rankSpeciesForSign(proj, "PalletTown"); // a real town with no grass, confirmed against wild_encounters.json
    expect(ranked).toEqual([]);
  });
});

describe("suggestSignPlacement", () => {
  it("on a real route with tall grass, suggests a walkable non-grass tile orthogonally adjacent to a grass tile", () => {
    const proj = openProject(ROOT);
    const placement = suggestSignPlacement(proj, "Route101");
    expect(placement).not.toBeNull();
    expect(Number.isInteger(placement!.x)).toBe(true);
    expect(Number.isInteger(placement!.y)).toBe(true);
  });

  it("returns null (not a guess) when the map has no tall-grass metatile at all", () => {
    const proj = openProject(ROOT);
    const placement = suggestSignPlacement(proj, "PalletTown");
    expect(placement).toBeNull();
  });

  it("does not suggest a tile that already has an object event on it", () => {
    const proj = openProject(ROOT);
    const map = proj.map("Route101");
    const placement = suggestSignPlacement(proj, "Route101");
    if (placement) {
      const occupied = map.objectEvents.some((e) => e.x === placement.x && e.y === placement.y);
      expect(occupied).toBe(false);
    }
  });
});
```

Confirm the real route/town names and `MapData.objectEvents` field name (camelCase, per `packages/core/src/load/maps.ts`'s own parser — read it if `objectEvents` isn't the exact name) before finalizing this test file; adjust the fixture map names to ones actually present in `POKEEMERALD_ROOT`'s `data/maps/`.

- [ ] **Step 3: Run test to verify it fails, then implement**

Run: `npx vitest run packages/core/test/signs/suggest.test.ts` — FAIL (module doesn't exist).

Create `packages/core/src/signs/suggest.ts`:

```ts
import type { Project } from "../project.js";
import { parseBlocks } from "../load/blocks.js";
import { readFileSync } from "node:fs";
import { speciesChances, FISHING_RODS, type Method } from "../load/encounters.js";

const METHODS: Method[] = ["land_mons", "water_mons", "rock_smash_mons", "fishing_mons"];

// include/constants/metatile_behaviors.h in the subject decomp: MB_TALL_GRASS
// is 0x02, stable across every engine fork this project targets (I1's own
// per-version boundaries govern the metatile SPLIT, not behavior codes --
// behavior values are a tileset-attribute convention, not a layout_version
// one, and this project has found no fork that renumbers them).
const MB_TALL_GRASS = 0x02;

export interface SignSpeciesSuggestion {
  species: string;
  percent: number;
  method: Method;
  minLevel: number;
  maxLevel: number;
}

/**
 * The forward direction of analyse/coverage.ts's whereSpecies: given a map
 * ALREADY chosen (by the player, in SignComposer), rank what's actually
 * catchable there. One row per species -- its single best (method, variant,
 * rod) chance -- because a sign proposes ONE species to stand as, not a
 * table.
 */
export function rankSpeciesForSign(proj: Project, mapName: string): SignSpeciesSuggestion[] {
  const mapId = proj.map(mapName).id;
  const enc = proj.encounters(); // mirrors proj.tileset()'s own cached-loader shape; add this accessor to Project if it does not already exist, following that same caching pattern -- do NOT re-parse wild_encounters.json ad hoc here
  const entries = enc.forMap(mapId);
  const best = new Map<string, SignSpeciesSuggestion>();

  entries.forEach((_entry, entryIndex) => {
    for (const method of METHODS) {
      const rods = method === "fishing_mons" ? FISHING_RODS.map((r) => r.rod) : [undefined];
      for (const rod of rods) {
        const chances = speciesChances(enc, mapId, method, { entry: entryIndex, rod });
        if (!chances) continue;
        for (const c of chances) {
          const prior = best.get(c.species);
          if (!prior || c.percent > prior.percent) {
            best.set(c.species, { species: c.species, percent: c.percent, method, minLevel: c.minLevel, maxLevel: c.maxLevel });
          }
        }
      }
    }
  });

  return [...best.values()].sort((a, b) => b.percent - a.percent);
}

export interface SignPlacement { x: number; y: number }

/**
 * Finds one walkable, non-grass tile orthogonally adjacent to a tall-grass
 * tile, with no existing object event on it -- a reasonable default spot for
 * a wild-sign NPC to "stand next to the grass" the way CeladonCity's own
 * Poliwrath does (see this task's own header comment). Returns null rather
 * than guessing when the map has no tall grass at all (I7).
 */
export function suggestSignPlacement(proj: Project, mapName: string): SignPlacement | null {
  const layout = proj.layoutForMap(mapName);
  const split = proj.splitFor(layout);
  const primary = proj.tileset(layout.primaryTileset);
  const secondary = proj.tileset(layout.secondaryTileset);
  const behaviorOf = (id: number): number => {
    const inSecondary = id >= split.metatiles;
    const owner = inSecondary ? secondary : primary;
    const local = inSecondary ? id - split.metatiles : id;
    return owner.behavior(local);
  };

  const blockdataPath = `${proj.paths.root}/${layout.blockdataFilepath}`;
  const blocks = parseBlocks(readFileSync(blockdataPath), proj.profile);
  const { width, height } = layout;
  const occupied = new Set(proj.map(mapName).objectEvents.map((e) => `${e.x},${e.y}`));

  const isGrass = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return behaviorOf(blocks[y * width + x]!.metatileId) === MB_TALL_GRASS;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isGrass(x, y)) continue;
      const neighbors: SignPlacement[] = [{ x, y: y - 1 }, { x, y: y + 1 }, { x: x - 1, y }, { x: x + 1, y }];
      for (const n of neighbors) {
        if (n.x < 0 || n.y < 0 || n.x >= width || n.y >= height) continue;
        if (isGrass(n.x, n.y)) continue;
        if (occupied.has(`${n.x},${n.y}`)) continue;
        return n;
      }
    }
  }
  return null;
}
```

If `proj.encounters()` does not already exist on the `Project` interface/implementation (`packages/core/src/project.ts`), add it now, following the exact caching pattern `proj.tileset()` already uses (a `Map<string,Tileset>` memo keyed by tileset symbol — mirror it with a single memoized `Encounters` value, since there is only one `wild_encounters.json` per project). Add this accessor's own focused test to `packages/core/test/project.test.ts` if that file already tests `tileset()`'s caching the same way; otherwise add a small dedicated assertion inline in this task's own test file confirming two calls return the same object reference (`===`), proving it's cached and not re-parsed per call.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/signs/suggest.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 5: Run the full core suite**

Run: `npx vitest run packages/core`
Expected: PASS, no regressions from the `proj.encounters()` addition.

- [ ] **Step 6: Teeth-proof**

Temporarily change `rankSpeciesForSign`'s `c.percent > prior.percent` to `>=`, confirm the "one row per species" dedup test still passes (it should — `>=` merely keeps the LAST equal-percent hit instead of the first, still one row per species) so this alone is not a meaningful mutation; instead mutate the dedup itself — replace `best.set(...)` with unconditional pushing into an array — and confirm the "one row per species" assertion (`speciesSeen.size === ranked.length`) now fails on a real multi-variant route. Revert to the correct `Map`-based version.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/signs/suggest.ts packages/core/src/project.ts packages/core/test/signs/suggest.test.ts packages/core/test/project.test.ts
git commit -m "feat(core): wild sign species ranking and grass-adjacent placement suggestion"
```

---

## Task 16: Wild sign — script generation

Coarse plan's original Task 12. Pure text generation, golden-tested against the REAL `CeladonCity_EventScript_Poliwrath`/`CeladonCity_Text_Poliwrath` pair already in the subject decomp (`data/maps/CeladonCity/scripts.inc` lines 57-66 and 184-185) — this is the exact "overworld species stands still, cries, shows one line" shape a wild sign reproduces, so the generator's output is checked byte-for-byte against it rather than against an invented expectation.

**Files:**
- Create: `packages/core/src/signs/script.ts`
- Test: `packages/core/test/signs/script.test.ts`

- [ ] **Step 1: Write the failing golden test**

```ts
// packages/core/test/signs/script.test.ts
import { describe, it, expect } from "vitest";
import { generateSignScript } from "../../src/signs/script.js";

// Golden fixture: the EXACT text of data/maps/CeladonCity/scripts.inc lines
// 57-66 (script) and 184-185 (text) in the subject decomp, byte-for-byte,
// including tabs (not spaces) and the double-colon/single-colon label
// convention. Read the real file yourself before touching this test if it
// ever needs to change -- do not hand-edit the fixture from memory.
const GOLDEN_SCRIPT =
  "CeladonCity_EventScript_Poliwrath::\n" +
  "\tlock\n" +
  "\tfaceplayer\n" +
  "\twaitse\n" +
  "\tplaymoncry SPECIES_POLIWRATH, CRY_MODE_NORMAL\n" +
  "\tmsgbox CeladonCity_Text_Poliwrath, MSGBOX_DEFAULT\n" +
  "\twaitmoncry\n" +
  "\tclosemessage\n" +
  "\trelease\n" +
  "\tend\n";

const GOLDEN_TEXT =
  "CeladonCity_Text_Poliwrath:\n" +
  '\t.string "POLIWRATH: Ribi ribit!$"\n';

describe("generateSignScript", () => {
  it("reproduces the real CeladonCity_EventScript_Poliwrath / CeladonCity_Text_Poliwrath pair byte-for-byte when given the same label, species and dialogue", () => {
    const out = generateSignScript({
      scriptLabel: "CeladonCity_EventScript_Poliwrath",
      textLabel: "CeladonCity_Text_Poliwrath",
      species: "POLIWRATH",
      dialogue: "POLIWRATH: Ribi ribit!",
    });
    expect(out.script).toBe(GOLDEN_SCRIPT);
    expect(out.text).toBe(GOLDEN_TEXT);
  });

  it("derives scriptLabel/textLabel from mapName+species when not given explicitly, using the project's own _EventScript_/_Text_ naming convention", () => {
    const out = generateSignScript({ mapName: "Route101", species: "RATTATA", dialogue: "RATTATA: Skreee!" });
    expect(out.scriptLabel).toBe("Route101_EventScript_WildSign_Rattata");
    expect(out.textLabel).toBe("Route101_Text_WildSign_Rattata");
    expect(out.script.startsWith("Route101_EventScript_WildSign_Rattata::\n")).toBe(true);
  });

  it("a species name with an underscore or hyphen (e.g. NIDORAN_F, MR_MIME) title-cases correctly in the derived label with no stray separators", () => {
    const out = generateSignScript({ mapName: "Route101", species: "NIDORAN_F", dialogue: "..." });
    expect(out.scriptLabel).toBe("Route101_EventScript_WildSign_NidoranF");
  });

  it("throws a named, actionable error (not a malformed script) when dialogue is empty", () => {
    expect(() => generateSignScript({ mapName: "Route101", species: "RATTATA", dialogue: "" }))
      .toThrow(/dialogue.*empty/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails, then implement**

Run: `npx vitest run packages/core/test/signs/script.test.ts` — FAIL (module doesn't exist).

Create `packages/core/src/signs/script.ts`:

```ts
export interface GenerateSignScriptOptions {
  /** Full label, e.g. "CeladonCity_EventScript_Poliwrath". Derived from
   *  mapName+species (this project's own "_EventScript_WildSign_<Species>"
   *  convention) when omitted. */
  scriptLabel?: string;
  textLabel?: string;
  /** Required when scriptLabel/textLabel are omitted. */
  mapName?: string;
  /** Bare species name, with or without the SPECIES_ prefix -- e.g. "POLIWRATH" or "SPECIES_POLIWRATH". */
  species: string;
  dialogue: string;
}

export interface GeneratedSignScript {
  scriptLabel: string;
  textLabel: string;
  script: string;
  text: string;
}

function titleCase(speciesBare: string): string {
  // NIDORAN_F -> NidoranF, MR_MIME -> MrMime -- each underscore-delimited
  // segment capitalized and concatenated with no separator, matching this
  // project's own derived-label convention (chosen here; the subject decomp's
  // OWN hand-written text labels are inconsistent across maps and are not a
  // convention this generator can derive from, per Task 16's own read of
  // CeladonCity_Text_MyTrustedPalPoliwrath vs. CeladonCity_Text_Poliwrath).
  return speciesBare.toLowerCase().split("_").map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1)).join("");
}

/**
 * Reproduces the exact shape of data/maps/CeladonCity/scripts.inc's
 * CeladonCity_EventScript_Poliwrath / CeladonCity_Text_Poliwrath pair (read
 * directly, see this task's own golden test) -- lock/faceplayer/waitse,
 * playmoncry the species, msgbox one line, waitmoncry, closemessage,
 * release, end. Pure string generation; nothing here touches a file --
 * Task 17's write.ts is the only thing that does.
 */
export function generateSignScript(opts: GenerateSignScriptOptions): GeneratedSignScript {
  if (!opts.dialogue.trim()) {
    throw new Error("generateSignScript: dialogue must not be empty -- a wild sign with no line is a silent NPC, pass real text");
  }

  const speciesBare = opts.species.replace(/^SPECIES_/, "");
  const speciesConst = `SPECIES_${speciesBare}`;

  let scriptLabel = opts.scriptLabel;
  let textLabel = opts.textLabel;
  if (!scriptLabel || !textLabel) {
    if (!opts.mapName) {
      throw new Error("generateSignScript: mapName is required when scriptLabel/textLabel are not both given explicitly");
    }
    const suffix = titleCase(speciesBare);
    scriptLabel ??= `${opts.mapName}_EventScript_WildSign_${suffix}`;
    textLabel ??= `${opts.mapName}_Text_WildSign_${suffix}`;
  }

  const script =
    `${scriptLabel}::\n` +
    `\tlock\n` +
    `\tfaceplayer\n` +
    `\twaitse\n` +
    `\tplaymoncry ${speciesConst}, CRY_MODE_NORMAL\n` +
    `\tmsgbox ${textLabel}, MSGBOX_DEFAULT\n` +
    `\twaitmoncry\n` +
    `\tclosemessage\n` +
    `\trelease\n` +
    `\tend\n`;

  const text = `${textLabel}:\n\t.string "${opts.dialogue}$"\n`;

  return { scriptLabel, textLabel, script, text };
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run packages/core/test/signs/script.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 4: Run the full core suite**

Run: `npx vitest run packages/core`
Expected: PASS.

- [ ] **Step 5: Teeth-proof**

Change the golden test's `SPECIES_POLIWRATH` literal to `SPECIES_Poliwrath` (wrong case) and confirm the test now fails against the real generator output — proves the assertion is actually checking case-sensitive content, not just presence. Revert.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/signs/script.ts packages/core/test/signs/script.test.ts
git commit -m "feat(core): wild sign script generation, golden-tested against the real CeladonCity Poliwrath pair"
```

---

## Task 17: Wild sign — write path, composer UI, server route

Coarse plan's original Task 13, folded with its own server wiring (the coarse file list omitted the route entirely — the same recurring gap Plan 0 §7 already flags for this plan's other UI tasks). Composes Task 15's suggestion logic and Task 16's script text into ONE object-event insert plus ONE scripts.inc append, both flowing through the EXISTING `planSave`/`commitSave` funnel from Task 4 (extended just above this task to carry `scriptAppends`) — `signs/write.ts` itself never calls `writeFileSync`.

**Files:**
- Create: `packages/core/src/signs/write.ts`
- Test: `packages/core/test/signs/write.test.ts`
- Modify: `packages/server/src/index.ts` (`GET /api/sign/:map/suggestions`, `POST /api/edit/:map/sign/add`)
- Test: `packages/server/test/signRoutes.test.ts`
- Create: `packages/ui/src/components/SignComposer.tsx`
- Test: `packages/ui/test/SignComposer.test.tsx`
- Modify: `packages/ui/src/components/Toolbar.tsx` (an "Add Sign" button, separate from the six paint tools — a sign is a one-shot composer flow, not a paint-and-drag tool)
- Modify: `packages/ui/src/App.tsx` (mount `SignComposer` behind the new Toolbar button)

**Invoke `frontend-design`/`ui-ux-pro-max`; follow `packages/ui/DESIGN.md`.**

- [ ] **Step 1: `signs/write.ts` — write the failing tests**

```ts
// packages/core/test/signs/write.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildWildSign, guardSignWrite } from "../../src/signs/write.js";
import { openProject } from "../../src/project.js"; // confirm exact import against an existing core test file, as in Task 15

describe("buildWildSign", () => {
  it("builds a raw object_events value matching the real map.json field shape, and a scripts.inc append matching generateSignScript's own output", () => {
    const result = buildWildSign("Route101", { x: 5, y: 6, elevation: 3, species: "RATTATA", dialogue: "RATTATA: Skreee!" });
    expect(result.objectEvent).toEqual({
      graphics_id: "OBJ_EVENT_GFX_SPECIES(RATTATA)",
      x: 5, y: 6, elevation: 3,
      movement_type: "MOVEMENT_TYPE_FACE_DOWN",
      movement_range_x: 1, movement_range_y: 1,
      trainer_type: "TRAINER_TYPE_NONE",
      trainer_sight_or_berry_tree_id: "0",
      script: "Route101_EventScript_WildSign_Rattata",
      flag: "0",
    });
    expect(result.scriptLabel).toBe("Route101_EventScript_WildSign_Rattata");
    expect(result.scriptAppendText).toContain("playmoncry SPECIES_RATTATA, CRY_MODE_NORMAL");
    expect(result.scriptAppendText).toContain('.string "RATTATA: Skreee!$"');
  });

  it("accepts a species already carrying the SPECIES_ prefix without double-prefixing", () => {
    const result = buildWildSign("Route101", { x: 0, y: 0, elevation: 0, species: "SPECIES_RATTATA", dialogue: "..." });
    expect(result.objectEvent.graphics_id).toBe("OBJ_EVENT_GFX_SPECIES(RATTATA)");
  });

  it("propagates generateSignScript's own empty-dialogue refusal rather than swallowing it", () => {
    expect(() => buildWildSign("Route101", { x: 0, y: 0, elevation: 0, species: "RATTATA", dialogue: "" })).toThrow(/dialogue.*empty/i);
  });
});

describe("guardSignWrite", () => {
  it("refuses, by name, when the target map has no scripts.inc at all", () => {
    const root = mkdtempSync(join(tmpdir(), "pokemap-sign-"));
    try {
      const refusals = guardSignWrite(root, "NoScriptsMap", "NoScriptsMap_EventScript_WildSign_Rattata");
      expect(refusals).toHaveLength(1);
      expect(refusals[0]!.code).toBe("NO_SCRIPTS_INC");
      expect(refusals[0]!.fix).toMatch(/scripts\.inc/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("refuses when the derived script label already exists in scripts.inc -- a genuine collision, not a guess about what the player meant", () => {
    const root = mkdtempSync(join(tmpdir(), "pokemap-sign-"));
    try {
      const dir = join(root, "data", "maps", "Route101");
      require("node:fs").mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "scripts.inc"), "Route101_EventScript_WildSign_Rattata::\n\tend\n");
      const refusals = guardSignWrite(root, "Route101", "Route101_EventScript_WildSign_Rattata");
      expect(refusals).toHaveLength(1);
      expect(refusals[0]!.code).toBe("SIGN_LABEL_EXISTS");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("returns an empty array when scripts.inc exists and the label is free", () => {
    const root = mkdtempSync(join(tmpdir(), "pokemap-sign-"));
    try {
      const dir = join(root, "data", "maps", "Route101");
      require("node:fs").mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "scripts.inc"), "SomeOtherLabel::\n\tend\n");
      expect(guardSignWrite(root, "Route101", "Route101_EventScript_WildSign_Rattata")).toEqual([]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
```

(Use real `import { mkdirSync } from "node:fs"` at the top instead of the inline `require(...)` above once writing the real file — the inline form here is only to keep this snippet's diff small; do not ship a `require()` call in an ESM core package.)

- [ ] **Step 2: Run test to verify it fails, then implement**

Run: `npx vitest run packages/core/test/signs/write.test.ts` — FAIL (module doesn't exist).

Create `packages/core/src/signs/write.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { projectPaths } from "../config/paths.js";
import { generateSignScript } from "./script.js";
import type { Refusal } from "../write/guards.js";

export interface WildSignInput {
  x: number;
  y: number;
  elevation: number;
  /** Bare ("RATTATA") or SPECIES_-prefixed ("SPECIES_RATTATA"); both accepted. */
  species: string;
  dialogue: string;
}

export interface WildSignBuild {
  /** Raw, snake_case object_events value -- ready for events.ts's own
   *  `addEvent(map, "object", objectEvent)`, matching load/maps.ts's real
   *  field names exactly (see Task 14 Step 1's own reading of them). */
  objectEvent: Record<string, unknown>;
  scriptLabel: string;
  textLabel: string;
  /** Script block + blank line + text block, ready to hand to a
   *  `ScriptAppend.text` (Task 4's save.ts extension, just above this task). */
  scriptAppendText: string;
}

/**
 * Pure data construction -- builds everything a wild sign needs to become
 * one object-event insert plus one scripts.inc append, but performs no I/O
 * itself. Mirrors CeladonCity's real Poliwrath object event (data/maps/
 * CeladonCity/map.json) field-for-field; see Task 15's own header comment
 * for why this shape (OBJ_EVENT_GFX_SPECIES, not an NPC standing nearby).
 */
export function buildWildSign(mapName: string, sign: WildSignInput): WildSignBuild {
  const generated = generateSignScript({ mapName, species: sign.species, dialogue: sign.dialogue });
  const speciesBare = sign.species.replace(/^SPECIES_/, "");

  const objectEvent = {
    graphics_id: `OBJ_EVENT_GFX_SPECIES(${speciesBare})`,
    x: sign.x, y: sign.y, elevation: sign.elevation,
    movement_type: "MOVEMENT_TYPE_FACE_DOWN",
    movement_range_x: 1, movement_range_y: 1,
    trainer_type: "TRAINER_TYPE_NONE",
    trainer_sight_or_berry_tree_id: "0",
    script: generated.scriptLabel,
    flag: "0",
  };

  return {
    objectEvent, scriptLabel: generated.scriptLabel, textLabel: generated.textLabel,
    scriptAppendText: `${generated.script}\n${generated.text}`,
  };
}

/**
 * The two things that can go wrong ONLY AT WRITE TIME (buildWildSign's own
 * throw already covers the pure-logic case of empty dialogue) -- takes a
 * bare project root rather than a full `Project` so this stays a plain,
 * dependency-free filesystem check exactly like guards.ts's own guards,
 * callable from a route that already has `entry.session` open without
 * re-loading the whole project.
 */
export function guardSignWrite(root: string, mapName: string, scriptLabel: string): Refusal[] {
  const scriptsPath = projectPaths(root).mapScriptsInc(mapName);
  if (!existsSync(scriptsPath)) {
    return [{
      code: "NO_SCRIPTS_INC", subject: mapName,
      message: `${mapName} has no scripts.inc`,
      fix: `Create data/maps/${mapName}/scripts.inc before adding a wild sign here`,
    }];
  }
  const text = readFileSync(scriptsPath, "utf8");
  if (text.includes(`${scriptLabel}::`) || text.includes(`${scriptLabel}:`)) {
    return [{
      code: "SIGN_LABEL_EXISTS", subject: scriptLabel,
      message: `${scriptLabel} is already defined in ${mapName}/scripts.inc`,
      fix: "Choose a different species, or edit the existing script by hand",
    }];
  }
  return [];
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run packages/core/test/signs/write.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 4: Run the full core suite**

Run: `npx vitest run packages/core`
Expected: PASS.

- [ ] **Step 5: Server routes — write the failing tests**

```ts
// packages/server/test/signRoutes.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";
import { openProject } from "@pokemap/core/src/project.js";

let s: PokemapServer;
const post = async (path: string, body: unknown = {}) => fetch(`http://127.0.0.1:${s.port}${path}`, { method: "POST", body: JSON.stringify(body) });
const get = async (path: string) => fetch(`http://127.0.0.1:${s.port}${path}`);

describe.skipIf(!hasProject(SUBJECT_ROOT))("sign routes", () => {
  beforeAll(async () => { s = await createServer({ projectPath: SUBJECT_ROOT, port: 0 }); });
  afterAll(async () => { await s?.close(); });

  it("GET /api/sign/:map/suggestions returns a ranked species list and a placement (or null) for a real route", async () => {
    const r = await get("/api/sign/Route29/suggestions"); // adjust to a confirmed-real route name with a wild encounter table, as in Task 15
    expect(r.status).toBe(200);
    const body = await r.json() as any;
    expect(Array.isArray(body.species)).toBe(true);
  }, 300_000);

  it("POST /sign/add on a town with no grass and no scripts.inc collision succeeds, GET /plan shows one object-events insert and one text append, then restores", async () => {
    const proj = openProject(SUBJECT_ROOT);
    const map = "Route29"; // confirmed real map with a wild table AND a real scripts.inc, per Task 15/16's own reads
    const scriptsPath = proj.paths.mapScriptsInc(map);
    const beforeScripts = readFileSync(scriptsPath, "utf8");
    try {
      const addRes = await post(`/api/edit/${map}/sign/add`, { x: 1, y: 1, elevation: 3, species: "RATTATA", dialogue: "RATTATA: Skreee!" });
      expect(addRes.status).toBe(200);
      const body = await addRes.json() as any;
      expect(body.scriptLabel).toBe(`${map}_EventScript_WildSign_Rattata`);

      const planRes = await get(`/api/edit/${map}/plan`);
      const plan = await planRes.json() as any;
      expect(plan.changes.some((c: any) => c.kind === "json")).toBe(true);
      expect(plan.changes.some((c: any) => c.kind === "text")).toBe(true);
    } finally {
      writeFileSync(scriptsPath, beforeScripts);
    }
  }, 300_000);

  it("POST /sign/add refuses (400) with the real guardSignWrite refusal when the derived label already exists", async () => {
    const proj = openProject(SUBJECT_ROOT);
    const map = "Route30"; // a second confirmed-real map with scripts.inc
    const scriptsPath = proj.paths.mapScriptsInc(map);
    const beforeScripts = readFileSync(scriptsPath, "utf8");
    try {
      writeFileSync(scriptsPath, beforeScripts + `\n${map}_EventScript_WildSign_Rattata::\n\tend\n`);
      const addRes = await post(`/api/edit/${map}/sign/add`, { x: 1, y: 1, elevation: 3, species: "RATTATA", dialogue: "RATTATA: Skreee!" });
      expect(addRes.status).toBe(400);
      const body = await addRes.json() as any;
      expect(body.refusals[0].code).toBe("SIGN_LABEL_EXISTS");
    } finally {
      writeFileSync(scriptsPath, beforeScripts);
    }
  }, 300_000);

  it("undo after a sign add removes BOTH the object-events insert and the scripts.inc append from the plan", async () => {
    const map = "Route31"; // a third confirmed-real map with scripts.inc
    await post(`/api/edit/${map}/sign/add`, { x: 1, y: 1, elevation: 3, species: "RATTATA", dialogue: "RATTATA: Skreee!" });
    await post(`/api/edit/${map}/undo`);
    const planRes = await get(`/api/edit/${map}/plan`);
    const plan = await planRes.json() as any;
    expect(plan.changes).toEqual([]);
  }, 300_000);
});
```

Confirm every map name above actually has both a wild encounter table (per Task 15's own real-name confirmation) and a `scripts.inc` file before finalizing this test file — substitute any that don't with ones that do.

- [ ] **Step 6: Run test to verify it fails, then implement**

Run: `npx vitest run packages/server/test/signRoutes.test.ts` — FAIL first.

Add to `packages/server/src/index.ts`, importing `rankSpeciesForSign`, `suggestSignPlacement` from `@pokemap/core/src/signs/suggest.js`, `buildWildSign`, `guardSignWrite` from `@pokemap/core/src/signs/write.js`, and `addEvent` from `@pokemap/core/src/edit/events.js` (already imported for Task 9's event routes — reuse the same import line, don't duplicate it):

```ts
      const signSuggestMatch = /^\/api\/sign\/(.+)\/suggestions$/.exec(url.pathname);
      if (signSuggestMatch && req.method === "GET") {
        const name = decodeURIComponent(signSuggestMatch[1]!);
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        return send(200, {
          species: rankSpeciesForSign(project, name),
          placement: suggestSignPlacement(project, name),
        });
      }

      const signAddMatch = /^\/api\/edit\/(.+)\/sign\/add$/.exec(url.pathname);
      if (signAddMatch && req.method === "POST") {
        const name = decodeURIComponent(signAddMatch[1]!);
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        return readBody(req)
          .then((body) => {
            let parsed: { x?: unknown; y?: unknown; elevation?: unknown; species?: unknown; dialogue?: unknown };
            try { parsed = JSON.parse(body) as typeof parsed; }
            catch (e) { return send(400, { error: `invalid JSON body: ${(e as Error).message}` }); }
            if (typeof parsed.x !== "number" || typeof parsed.y !== "number" || typeof parsed.elevation !== "number"
              || typeof parsed.species !== "string" || typeof parsed.dialogue !== "string") {
              return send(400, { error: `expected { x, y, elevation: number, species, dialogue: string }, got ${body}` });
            }
            let built: ReturnType<typeof buildWildSign>;
            try {
              built = buildWildSign(name, parsed as { x: number; y: number; elevation: number; species: string; dialogue: string });
            } catch (e) {
              return send(400, { error: e instanceof Error ? e.message : String(e) });
            }
            const refusals = guardSignWrite(project.paths.root, name, built.scriptLabel);
            if (refusals.length > 0) return send(400, { refusals });

            const entry = editEntryFor(name);
            const prev = snapshotOf(entry.session);
            const { map, insertOp } = addEvent(entry.session.map, "object", built.objectEvent);
            entry.session.map = map;
            entry.session.insertOps = [...entry.session.insertOps, insertOp];
            entry.session.scriptAppends = [
              ...(entry.session.scriptAppends ?? []),
              { path: project.paths.mapScriptsInc(name), text: built.scriptAppendText },
            ];
            entry.stack.push(entry.session, snapshotCommand("add wild sign", prev, snapshotOf(entry.session)));
            return send(200, { map: entry.session.map, isDirty: entry.session.isDirty, scriptLabel: built.scriptLabel });
          })
          .catch((e: unknown) => { console.error(e); send(500, { error: e instanceof Error ? e.message : String(e) }); });
      }
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run packages/server/test/signRoutes.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 8: Run the full server suite**

Run: `npx vitest run packages/server`
Expected: PASS.

- [ ] **Step 9: `SignComposer` — write the failing tests**

```tsx
// packages/ui/test/SignComposer.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignComposer } from "../src/components/SignComposer.js";

afterEach(() => vi.unstubAllGlobals());

const SUGGESTIONS = {
  species: [
    { species: "SPECIES_RATTATA", percent: 40, method: "land_mons", minLevel: 3, maxLevel: 5 },
    { species: "SPECIES_PIDGEY", percent: 20, method: "land_mons", minLevel: 3, maxLevel: 4 },
  ],
  placement: { x: 5, y: 6 },
};

describe("SignComposer", () => {
  it("fetches suggestions on open and lists ranked species with their percent, pre-filling x/y from the suggested placement", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(SUGGESTIONS) }));
    render(<SignComposer mapName="Route101" onAdded={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/SPECIES_RATTATA/)).toBeInTheDocument());
    expect(screen.getByText(/40%/)).toBeInTheDocument();
    expect(screen.getByLabelText("X")).toHaveValue(5);
    expect(screen.getByLabelText("Y")).toHaveValue(6);
  });

  it("when placement is null (no grass on this map), X/Y default to 0 and are still editable, not disabled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ species: SUGGESTIONS.species, placement: null }) }));
    render(<SignComposer mapName="PalletTown" onAdded={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/SPECIES_RATTATA/)).toBeInTheDocument());
    expect(screen.getByLabelText("X")).not.toBeDisabled();
  });

  it("selecting a species and submitting POSTs /sign/add with x/y/elevation/species/dialogue, and calls onAdded with the returned scriptLabel", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(SUGGESTIONS) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ map: {}, isDirty: true, scriptLabel: "Route101_EventScript_WildSign_Rattata" }) });
    vi.stubGlobal("fetch", fetchMock);
    const onAdded = vi.fn();
    render(<SignComposer mapName="Route101" onAdded={onAdded} onCancel={vi.fn()} />);
    await waitFor(() => screen.getByText(/SPECIES_RATTATA/));
    fireEvent.click(screen.getByText(/SPECIES_RATTATA/));
    fireEvent.change(screen.getByLabelText("Dialogue"), { target: { value: "RATTATA: Skreee!" } });
    fireEvent.click(screen.getByRole("button", { name: /add sign/i }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith("Route101_EventScript_WildSign_Rattata"));
    const [, addCall] = fetchMock.mock.calls;
    expect(addCall![0]).toBe("/api/edit/Route101/sign/add");
    expect(JSON.parse(addCall![1].body)).toEqual({ x: 5, y: 6, elevation: 0, species: "SPECIES_RATTATA", dialogue: "RATTATA: Skreee!" });
  });

  it("a 400 refusal response shows the refusal's fix text and does not call onAdded", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(SUGGESTIONS) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: () => Promise.resolve({ refusals: [{ code: "SIGN_LABEL_EXISTS", message: "already exists", fix: "pick a different species", subject: "x" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const onAdded = vi.fn();
    render(<SignComposer mapName="Route101" onAdded={onAdded} onCancel={vi.fn()} />);
    await waitFor(() => screen.getByText(/SPECIES_RATTATA/));
    fireEvent.click(screen.getByText(/SPECIES_RATTATA/));
    fireEvent.change(screen.getByLabelText("Dialogue"), { target: { value: "..." } });
    fireEvent.click(screen.getByRole("button", { name: /add sign/i }));
    await waitFor(() => expect(screen.getByText("pick a different species")).toBeInTheDocument());
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("the Add Sign button is disabled until both a species is selected and dialogue is non-empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(SUGGESTIONS) }));
    render(<SignComposer mapName="Route101" onAdded={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => screen.getByText(/SPECIES_RATTATA/));
    expect(screen.getByRole("button", { name: /add sign/i })).toBeDisabled();
    fireEvent.click(screen.getByText(/SPECIES_RATTATA/));
    expect(screen.getByRole("button", { name: /add sign/i })).toBeDisabled(); // dialogue still empty
    fireEvent.change(screen.getByLabelText("Dialogue"), { target: { value: "hi" } });
    expect(screen.getByRole("button", { name: /add sign/i })).toBeEnabled();
  });
});
```

- [ ] **Step 10: Run test to verify it fails, then implement**

Run: `npx vitest run packages/ui/test/SignComposer.test.tsx` — FAIL first.

Create `packages/ui/src/components/SignComposer.tsx`:

```tsx
import { useEffect, useState } from "react";
import "../styles.css";

interface SignSpeciesSuggestion { species: string; percent: number; method: string; minLevel: number; maxLevel: number }
interface SignSuggestions { species: SignSpeciesSuggestion[]; placement: { x: number; y: number } | null }
interface Refusal { code: string; message: string; fix: string; subject: string }

export interface SignComposerProps {
  mapName: string;
  onAdded: (scriptLabel: string) => void;
  onCancel: () => void;
}

/** Wild sign authoring flow -- ranks catchable species (Task 15's
 *  `rankSpeciesForSign`), suggests a grass-adjacent placement, and on
 *  submit calls Task 17's own `/sign/add` route, which composes ONE object
 *  event insert and ONE scripts.inc append into the session's normal save
 *  plan (Task 13's SaveDialog is still the only thing that actually
 *  commits it to disk -- this component only stages the edit). */
export function SignComposer({ mapName, onAdded, onCancel }: SignComposerProps) {
  const [suggestions, setSuggestions] = useState<SignSuggestions | null>(null);
  const [species, setSpecies] = useState<string | null>(null);
  const [dialogue, setDialogue] = useState("");
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [elevation] = useState(0);
  const [refusals, setRefusals] = useState<Refusal[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sign/${encodeURIComponent(mapName)}/suggestions`)
      .then((r) => r.json())
      .then((d: SignSuggestions) => {
        if (cancelled) return;
        setSuggestions(d);
        if (d.placement) { setX(d.placement.x); setY(d.placement.y); }
      });
    return () => { cancelled = true; };
  }, [mapName]);

  const submit = async () => {
    if (!species || !dialogue.trim()) return;
    setSubmitting(true);
    setRefusals([]);
    const r = await fetch(`/api/edit/${encodeURIComponent(mapName)}/sign/add`, {
      method: "POST",
      body: JSON.stringify({ x, y, elevation, species, dialogue }),
    });
    setSubmitting(false);
    if (r.ok) {
      const body = (await r.json()) as { scriptLabel: string };
      onAdded(body.scriptLabel);
      return;
    }
    const body = (await r.json()) as { refusals: Refusal[] };
    setRefusals(body.refusals);
  };

  return (
    <div className="sign-composer" role="dialog" aria-label="Add wild sign">
      <h2 className="sign-composer__title">Add Wild Sign</h2>
      {suggestions === null ? (
        <p>Loading suggestions…</p>
      ) : (
        <ul className="sign-composer__species-list">
          {suggestions.species.map((s) => (
            <li key={s.species}>
              <button
                type="button"
                className={`sign-composer__species-btn${species === s.species ? " sign-composer__species-btn--active" : ""}`}
                aria-pressed={species === s.species}
                onClick={() => setSpecies(s.species)}
              >
                {s.species} — {s.percent}%
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="sign-composer__coords">
        <label>X <input type="number" aria-label="X" value={x} onChange={(e) => setX(Number(e.target.value))} /></label>
        <label>Y <input type="number" aria-label="Y" value={y} onChange={(e) => setY(Number(e.target.value))} /></label>
      </div>
      <label className="sign-composer__dialogue">
        Dialogue
        <input type="text" aria-label="Dialogue" value={dialogue} onChange={(e) => setDialogue(e.target.value)} />
      </label>
      {refusals.map((r) => (
        <div key={r.code} className="sign-composer__refusal" role="alert">
          <p>{r.message}</p>
          <p>{r.fix}</p>
        </div>
      ))}
      <div className="sign-composer__actions">
        <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn--primary" onClick={() => void submit()} disabled={submitting || !species || !dialogue.trim()}>
          {submitting ? "Adding…" : "Add Sign"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 11: Run test to verify it passes**

Run: `npx vitest run packages/ui/test/SignComposer.test.tsx`
Expected: PASS, 5/5.

- [ ] **Step 12: CSS, Toolbar wiring, App.tsx wiring**

Add to `packages/ui/src/styles.css` (tokens only, mirroring `.save-dialog`'s own block): `.sign-composer`, `.sign-composer__species-list`, `.sign-composer__species-btn`, `.sign-composer__species-btn--active`, `.sign-composer__coords`, `.sign-composer__dialogue`, `.sign-composer__refusal`, `.sign-composer__actions` — reuse `--space-*`, `--border-default`, `--accent-primary`/`--accent-primary-muted`, `--danger`/`--danger-muted` exactly as `.save-dialog`/`.event-inspector` already do; do not add new tokens.

Add an "Add Sign" button to `Toolbar.tsx`, separate from the `TOOLS` array (it opens a modal flow, not a canvas tool):

```tsx
        <button type="button" className="btn btn--secondary" onClick={onOpenSignComposer}>Add Sign</button>
```

with a matching `onOpenSignComposer: () => void` added to `ToolbarProps`, and its own test in `packages/ui/test/Toolbar.test.tsx` (`it("clicking Add Sign calls onOpenSignComposer", ...)`, following that file's existing per-button test pattern).

In `App.tsx`, add `signComposerOpen` state, mount `<SignComposer>` as a modal (same overlay wrapper as `SaveDialog`/`WarpDestinationModal`) when true, and on `onAdded`, close it and surface a brief confirmation (reuse whatever toast/status-line pattern the app already has for the save-committed case, from Task 13 Step 9's App.tsx wiring — do not invent a second one).

- [ ] **Step 13: Run the full UI suite**

Run: `npx vitest run packages/ui`
Expected: PASS.

- [ ] **Step 14: Live-verify**

Open a real route with tall grass in edit mode, click Add Sign, confirm real species and percentages appear (cross-check one against `pokemap query` or the existing species spotlight from the World View Usability plan), confirm the suggested X/Y sit next to a real grass tile on screen, pick a species, type dialogue, submit, confirm the object event marker appears on the canvas immediately. Open Save, confirm the diff lists both the map.json insert and the scripts.inc append with real, sensible summaries. Save. Then, per the design's own Success Criteria #3, actually build the ROM (`make`, outside this project's own scope to automate — instructions only) and confirm the new object event's cry/dialogue plays in-game exactly as CeladonCity's own Poliwrath does.

- [ ] **Step 15: Teeth-proof**

Break `guardSignWrite`'s label-collision check (change the `text.includes` condition to always `false`) and confirm the corresponding server test (Step 5's third test) fails, proving the refusal path is real and not a stub that happens to never trigger. Revert.

- [ ] **Step 16: Commit**

```bash
git add packages/core/src/signs/write.ts packages/core/test/signs/write.test.ts packages/server/src/index.ts packages/server/test/signRoutes.test.ts packages/ui/src/components/SignComposer.tsx packages/ui/src/components/Toolbar.tsx packages/ui/src/App.tsx packages/ui/src/styles.css packages/ui/test/SignComposer.test.tsx packages/ui/test/Toolbar.test.tsx
git commit -m "feat: wild sign write path -- one object-event insert + one scripts.inc append, SignComposer UI, /sign routes"
```

---

## Task 18: CLI write commands

Coarse plan's original Task 14. The CLI has no server process to hold a session between invocations (this plan's own architecture note says so explicitly) — each write command opens a fresh `EditSession` in memory for the duration of one process, exactly mirroring `packages/server/src/editSessions.ts`'s own `open()` (Task 8, read directly below before writing this task), applies one edit, and either prints the plan (dry run, the default) or commits it (only with an explicit `--yes`, extending I6's "no autosave, ever" to the CLI: a write command that silently wrote by default would be the CLI's own autosave). Every existing CLI command in `packages/cli/src/index.ts` keeps its action handler thin and delegates to an exported, directly-testable function (`context.ts`'s `layoutNameFor`, `renderWorld.ts`'s `resolvePlacementRect`, `args.ts`'s parsers) — this task follows the same split, in a new `writeCommands.ts`, rather than putting logic inline in `commander` action closures the way this repo's own tests could not reach.

**Files:**
- Create: `packages/cli/src/writeCommands.ts`
- Modify: `packages/cli/src/index.ts` (add `sign suggest/add/list`, `diff`, `paint` commands)
- Test: `packages/cli/test/writeCommands.test.ts`

- [ ] **Step 1: Read `packages/server/src/editSessions.ts`'s `open()` (Task 8) and `packages/core/src/write/save.ts`'s `planSave`/`commitSave` (Task 4) in full before writing this task** — `openCliEditSession` below must construct the exact same `EditSession` shape, and `dryRunOrCommit` must call the exact same two functions the server route does, with no third code path re-implementing either.

- [ ] **Step 2: Write the failing tests**

```ts
// packages/cli/test/writeCommands.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { openProject } from "@pokemap/core/src/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../../core/test/helpers/corpus.js";
import { openCliEditSession, runSignSuggest, runSignAdd, runSignList, runPaint, runDiff } from "../src/writeCommands.js";

describe("writeCommands", () => {
  itWithCorpus("openCliEditSession builds the exact same EditSession shape editSessions.ts's open() does, from real disk state", () => {
    const proj = openProject(SUBJECT_ROOT);
    const session = openCliEditSession(proj, "Route29"); // confirmed-real map with a wild table, per Task 15/17
    expect(session.mapName).toBe("Route29");
    expect(session.blocks.length).toBeGreaterThan(0);
    expect(session.isDirty).toBe(false);
    expect(session.jsonEdits).toEqual([]);
  });

  itWithCorpus("runSignSuggest prints ranked species and a placement for a real route, and never writes", () => {
    const proj = openProject(SUBJECT_ROOT);
    const before = readFileSync(proj.paths.mapScriptsInc("Route29"), "utf8");
    const out = runSignSuggest(proj, "Route29");
    expect(out).toContain("%");
    expect(readFileSync(proj.paths.mapScriptsInc("Route29"), "utf8")).toBe(before);
  });

  itWithCorpus("runSignAdd without --yes prints the plan and writes nothing", () => {
    const proj = openProject(SUBJECT_ROOT);
    const scriptsPath = proj.paths.mapScriptsInc("Route29");
    const before = readFileSync(scriptsPath, "utf8");
    const out = runSignAdd(proj, { map: "Route29", x: 1, y: 1, elevation: 3, species: "RATTATA", dialogue: "RATTATA: Skreee!", yes: false });
    expect(out).toContain("Route29_EventScript_WildSign_Rattata");
    expect(out).toMatch(/dry.?run|not written|--yes/i);
    expect(readFileSync(scriptsPath, "utf8")).toBe(before);
  });

  itWithCorpus("runSignAdd with --yes actually commits, then restores", () => {
    const proj = openProject(SUBJECT_ROOT);
    const scriptsPath = proj.paths.mapScriptsInc("Route30"); // a second confirmed-real map, distinct from the one Task 17's own server test uses, so parallel test runs never collide
    const mapJsonPath = proj.paths.mapJson("Route30");
    const beforeScripts = readFileSync(scriptsPath, "utf8");
    const beforeMapJson = readFileSync(mapJsonPath, "utf8");
    try {
      const out = runSignAdd(proj, { map: "Route30", x: 1, y: 1, elevation: 3, species: "RATTATA", dialogue: "RATTATA: Skreee!", yes: true });
      expect(out).toMatch(/committed|saved|wrote/i);
      expect(readFileSync(scriptsPath, "utf8")).not.toBe(beforeScripts);
      expect(readFileSync(mapJsonPath, "utf8")).not.toBe(beforeMapJson);
    } finally {
      writeFileSync(scriptsPath, beforeScripts);
      writeFileSync(mapJsonPath, beforeMapJson);
    }
  });

  itWithCorpus("runSignAdd refuses and writes nothing when the derived label already exists, even with --yes", () => {
    const proj = openProject(SUBJECT_ROOT);
    const scriptsPath = proj.paths.mapScriptsInc("Route31"); // a third confirmed-real map
    const before = readFileSync(scriptsPath, "utf8");
    try {
      writeFileSync(scriptsPath, before + "\nRoute31_EventScript_WildSign_Rattata::\n\tend\n");
      expect(() => runSignAdd(proj, { map: "Route31", x: 1, y: 1, elevation: 3, species: "RATTATA", dialogue: "...", yes: true })).toThrow(/SIGN_LABEL_EXISTS/);
      expect(readFileSync(proj.paths.mapJson("Route31"), "utf8")).toEqual(readFileSync(proj.paths.mapJson("Route31"), "utf8")); // map.json untouched (trivially true; real assertion is the throw itself plus the finally-restore below)
    } finally {
      writeFileSync(scriptsPath, before);
    }
  });

  itWithCorpus("runSignList finds an existing overworld-species object event on a real map with one -- CeladonCity's own Poliwrath", () => {
    const proj = openProject(SUBJECT_ROOT);
    const out = runSignList(proj, "CeladonCity");
    expect(out).toContain("POLIWRATH");
    expect(out).toContain("CeladonCity_EventScript_Poliwrath");
  });

  itWithCorpus("runSignList reports none found on a map with no overworld-species object events", () => {
    const proj = openProject(SUBJECT_ROOT);
    const out = runSignList(proj, "PalletTown");
    expect(out).toMatch(/no wild sign|none found/i);
  });

  itWithCorpus("runDiff never writes, regardless of the requested edit", () => {
    const proj = openProject(SUBJECT_ROOT);
    const layout = proj.layoutForMap("Route32");
    const binPath = `${SUBJECT_ROOT}/${layout.blockdataFilepath}`;
    const before = readFileSync(binPath);
    const out = runDiff(proj, { map: "Route32", tool: "pencil", x: 0, y: 0, metatileId: 1 });
    expect(out).toContain("block");
    expect(readFileSync(binPath)).toEqual(before);
  });

  itWithCorpus("runPaint with --yes actually paints one block and commits, then restores", () => {
    const proj = openProject(SUBJECT_ROOT);
    const layout = proj.layoutForMap("Route33"); // a confirmed-real map, distinct from every other map used above and in Task 17's server tests
    const binPath = `${SUBJECT_ROOT}/${layout.blockdataFilepath}`;
    const before = readFileSync(binPath);
    try {
      const out = runPaint(proj, { map: "Route33", tool: "pencil", x: 0, y: 0, metatileId: 1, yes: true });
      expect(out).toMatch(/committed|saved|wrote/i);
      expect(readFileSync(binPath)).not.toEqual(before);
    } finally {
      writeFileSync(binPath, before);
    }
  });

  itWithCorpus("runPaint rect tool paints the whole rectangle", () => {
    const proj = openProject(SUBJECT_ROOT);
    const layout = proj.layoutForMap("Route34");
    const binPath = `${SUBJECT_ROOT}/${layout.blockdataFilepath}`;
    const before = readFileSync(binPath);
    try {
      runPaint(proj, { map: "Route34", tool: "rect", x: 0, y: 0, x1: 1, y1: 1, metatileId: 2, yes: true });
      expect(readFileSync(binPath)).not.toEqual(before);
    } finally {
      writeFileSync(binPath, before);
    }
  });
});
```

Confirm every route/town name above is real, has the properties the test claims (wild table, `scripts.inc`, distinct from names used elsewhere in this plan's own tests so parallel `vitest` workers never race on the same file) before finalizing this test file — this repo's own established convention (see Task 15/17's identical instruction) is to verify against the real corpus, never guess a plausible-sounding name.

- [ ] **Step 3: Run test to verify it fails, then implement**

Run: `npx vitest run packages/cli/test/writeCommands.test.ts` — FAIL (module doesn't exist).

Create `packages/cli/src/writeCommands.ts`:

```ts
import { readFileSync } from "node:fs";
import type { Project } from "@pokemap/core/src/project.js";
import { parseBlocks } from "@pokemap/core/src/load/blocks.js";
import { paintCells, type Stamp } from "@pokemap/core/src/edit/paint.js";
import { addEvent } from "@pokemap/core/src/edit/events.js";
import { rankSpeciesForSign, suggestSignPlacement } from "@pokemap/core/src/signs/suggest.js";
import { buildWildSign, guardSignWrite } from "@pokemap/core/src/signs/write.js";
import { planSave, commitSave, type EditSession } from "@pokemap/core/src/write/save.js";
import { formatDiffText } from "@pokemap/core/src/write/diff.js";

/** Mirrors packages/server/src/editSessions.ts's own `open()` exactly (see
 *  this task's own Step 1) -- the CLI has no server process to hold a
 *  session between invocations, so every write command builds one fresh,
 *  uses it for the lifetime of one process, and lets it go. */
export function openCliEditSession(proj: Project, mapName: string): EditSession {
  const map = proj.map(mapName);
  const layout = proj.layoutForMap(mapName);
  const blocks = parseBlocks(readFileSync(`${proj.paths.root}/${layout.blockdataFilepath}`), proj.profile);
  const border = parseBlocks(readFileSync(`${proj.paths.root}/${layout.borderFilepath}`), proj.profile);
  const originalMapJson = readFileSync(proj.paths.mapJson(mapName), "utf8");
  return {
    mapName, layout, blocks, border, map,
    originalBlocks: blocks.map((b) => ({ ...b })), originalMap: map,
    originalMapJson, jsonEdits: [], insertOps: [], removeOps: [], scriptAppends: [], isDirty: false,
  };
}

/** Shared end-of-command shape every write command below uses: print the
 *  plan; commit only with `--yes` (I6 extended to the CLI -- see this
 *  task's own header). Returns the combined text a command should print. */
function dryRunOrCommit(proj: Project, session: EditSession, yes: boolean, label: string): string {
  const plan = planSave(proj, session);
  if (plan.refusals.length > 0) {
    throw new Error(plan.refusals.map((r) => `${r.code} (${r.subject}): ${r.message} -- ${r.fix}`).join("\n"));
  }
  const diffText = formatDiffText(plan);
  if (!yes) return `${diffText}\n(dry run -- not written; pass --yes to commit)`;
  commitSave(proj, plan);
  return `${diffText}\ncommitted: ${label}`;
}

export function runSignSuggest(proj: Project, mapName: string): string {
  const ranked = rankSpeciesForSign(proj, mapName);
  const placement = suggestSignPlacement(proj, mapName);
  const lines = ranked.map((r) => `  ${r.percent.toFixed(1).padStart(5)}%  Lv ${r.minLevel}-${r.maxLevel}  ${r.species}  (${r.method})`);
  const placementLine = placement ? `suggested placement: (${placement.x}, ${placement.y})` : "no tall grass on this map -- no placement suggested";
  return ranked.length === 0
    ? `${mapName} has no wild encounter table -- nothing to suggest\n${placementLine}`
    : `${lines.join("\n")}\n${placementLine}`;
}

export interface SignAddArgs { map: string; x: number; y: number; elevation: number; species: string; dialogue: string; yes: boolean }

export function runSignAdd(proj: Project, args: SignAddArgs): string {
  const built = buildWildSign(args.map, args);
  const refusals = guardSignWrite(proj.paths.root, args.map, built.scriptLabel);
  if (refusals.length > 0) {
    throw new Error(refusals.map((r) => `${r.code} (${r.subject}): ${r.message} -- ${r.fix}`).join("\n"));
  }
  const session = openCliEditSession(proj, args.map);
  const { map, insertOp } = addEvent(session.map, "object", built.objectEvent);
  session.map = map;
  session.insertOps = [...session.insertOps, insertOp];
  session.scriptAppends = [...(session.scriptAppends ?? []), { path: proj.paths.mapScriptsInc(args.map), text: built.scriptAppendText }];
  return dryRunOrCommit(proj, session, args.yes, built.scriptLabel);
}

/** OBJ_EVENT_GFX_SPECIES(...) is the ONE signal a wild sign object event
 *  carries that a hand-placed NPC never does (see Task 15's own header
 *  comment) -- this is a read-only scan, no EditSession needed. */
export function runSignList(proj: Project, mapName: string): string {
  const map = proj.map(mapName);
  const signs = map.objectEvents.filter((e) => /^OBJ_EVENT_GFX_SPECIES\(/.test(e.graphicsId));
  if (signs.length === 0) return `${mapName}: no wild signs found`;
  return signs.map((e) => `  (${e.x}, ${e.y}) ${e.graphicsId} -> ${e.script}`).join("\n");
}

export interface PaintArgs { map: string; tool: "pencil" | "rect" | "bucket"; x: number; y: number; x1?: number; y1?: number; metatileId: number; yes: boolean }

function stampFor(args: PaintArgs): Stamp {
  return { width: 1, height: 1, cells: [{ metatileId: args.metatileId }] };
}

function targetsFor(args: PaintArgs): { x: number; y: number }[] {
  if (args.tool === "rect") {
    const targets: { x: number; y: number }[] = [];
    const x1 = args.x1 ?? args.x, y1 = args.y1 ?? args.y;
    for (let y = Math.min(args.y, y1); y <= Math.max(args.y, y1); y++) {
      for (let x = Math.min(args.x, x1); x <= Math.max(args.x, x1); x++) targets.push({ x, y });
    }
    return targets;
  }
  return [{ x: args.x, y: args.y }];
}

/** `bucket` (flood fill) is intentionally out of scope for this command --
 *  it needs `floodFill`'s own seed-color read off the live grid, which this
 *  thin single-shot wrapper has no reason to duplicate ahead of a real
 *  need; `pencil`/`rect` cover the CLI's own stated use case (scripted,
 *  single-shot edits), and the UI (Task 11/12) already has the full tool
 *  set for interactive work. */
function paintSession(proj: Project, args: PaintArgs): EditSession {
  if (args.tool === "bucket") throw new Error("pokemap paint: --tool bucket is not supported from the CLI yet -- use pencil or rect, or paint interactively in the UI");
  const session = openCliEditSession(proj, args.map);
  session.blocks = paintCells(session.blocks, session.layout.width, session.layout.height, targetsFor(args), stampFor(args), args.x, args.y);
  return session;
}

export function runPaint(proj: Project, args: PaintArgs): string {
  const session = paintSession(proj, args);
  return dryRunOrCommit(proj, session, args.yes, `${args.map} (${args.tool})`);
}

/** Always a dry run, regardless of what the caller passes for `yes` --
 *  `diff` exists specifically so a script can preview an edit with no way
 *  to accidentally commit it; `paint --yes` is the only path that writes. */
export function runDiff(proj: Project, args: Omit<PaintArgs, "yes">): string {
  const session = paintSession(proj, { ...args, yes: false });
  const plan = planSave(proj, session);
  return formatDiffText(plan);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/cli/test/writeCommands.test.ts`
Expected: PASS, 10/10.

- [ ] **Step 5: Wire the five commands into `packages/cli/src/index.ts`**

Add near the top, alongside the existing imports (do not duplicate `readFileSync`, already imported):

```ts
import { runSignSuggest, runSignAdd, runSignList, runPaint, runDiff } from "./writeCommands.js";
```

Add, following the exact style of every existing command above it (thin action handler, `resolveProject(program.opts().project)`, `process.stdout.write`):

```ts
program
  .command("sign suggest <map>")
  .description("rank catchable species and suggest a placement for a wild sign on this map")
  .action((map: string) => {
    const proj = resolveProject(program.opts().project);
    process.stdout.write(`${runSignSuggest(proj, map)}\n`);
  });

program
  .command("sign add <map>")
  .description("add a wild sign -- prints the plan by default, writes only with --yes")
  .requiredOption("--species <name>", "e.g. RATTATA or SPECIES_RATTATA")
  .requiredOption("--dialogue <text>", "the one line shown on interact")
  .requiredOption("--x <n>", "tile x", Number)
  .requiredOption("--y <n>", "tile y", Number)
  .option("--elevation <n>", "tile elevation", Number, 0)
  .option("--yes", "actually write")
  .action((map: string, opts: { species: string; dialogue: string; x: number; y: number; elevation: number; yes?: boolean }) => {
    const proj = resolveProject(program.opts().project);
    process.stdout.write(`${runSignAdd(proj, { map, x: opts.x, y: opts.y, elevation: opts.elevation, species: opts.species, dialogue: opts.dialogue, yes: !!opts.yes })}\n`);
  });

program
  .command("sign list <map>")
  .description("list existing wild signs (overworld-species object events) on a map")
  .action((map: string) => {
    const proj = resolveProject(program.opts().project);
    process.stdout.write(`${runSignList(proj, map)}\n`);
  });

program
  .command("paint <map>")
  .description("paint one metatile (pencil) or a rectangle (rect) -- prints the plan by default, writes only with --yes")
  .requiredOption("--tool <tool>", "pencil or rect")
  .requiredOption("--x <n>", "tile x (or rect's first corner)", Number)
  .requiredOption("--y <n>", "tile y (or rect's first corner)", Number)
  .option("--x1 <n>", "rect's second corner x", Number)
  .option("--y1 <n>", "rect's second corner y", Number)
  .requiredOption("--metatile <id>", "metatile id to stamp", Number)
  .option("--yes", "actually write")
  .action((map: string, opts: { tool: "pencil" | "rect"; x: number; y: number; x1?: number; y1?: number; metatile: number; yes?: boolean }) => {
    const proj = resolveProject(program.opts().project);
    process.stdout.write(`${runPaint(proj, { map, tool: opts.tool, x: opts.x, y: opts.y, x1: opts.x1, y1: opts.y1, metatileId: opts.metatile, yes: !!opts.yes })}\n`);
  });

program
  .command("diff <map>")
  .description("preview a paint edit's plan without writing (always a dry run)")
  .requiredOption("--tool <tool>", "pencil or rect")
  .requiredOption("--x <n>", "tile x (or rect's first corner)", Number)
  .requiredOption("--y <n>", "tile y (or rect's first corner)", Number)
  .option("--x1 <n>", "rect's second corner x", Number)
  .option("--y1 <n>", "rect's second corner y", Number)
  .requiredOption("--metatile <id>", "metatile id to stamp", Number)
  .action((map: string, opts: { tool: "pencil" | "rect"; x: number; y: number; x1?: number; y1?: number; metatile: number }) => {
    const proj = resolveProject(program.opts().project);
    process.stdout.write(`${runDiff(proj, { map, tool: opts.tool, x: opts.x, y: opts.y, x1: opts.x1, y1: opts.y1, metatileId: opts.metatile })}\n`);
  });
```

- [ ] **Step 6: Run the full CLI suite**

Run: `npx vitest run packages/cli`
Expected: PASS.

- [ ] **Step 7: Live-verify against the real subject decomp**

Confirm `git status --porcelain` is clean in the subject decomp root first (I8). Run `pokemap sign suggest Route29 --project "<subject root>"`, confirm real species/percentages print. Run `pokemap sign add Route29 --species RATTATA --dialogue "..." --x 1 --y 1 --project "<subject root>"` (no `--yes`) and confirm it prints a plan and `git status --porcelain` is STILL clean. Run it again with `--yes`, confirm `git status --porcelain` now shows exactly `data/maps/Route29/map.json` and `data/maps/Route29/scripts.inc` modified, then `git -C "<subject root>" checkout -- data/maps/Route29/map.json data/maps/Route29/scripts.inc` to restore (I8 — this project only ever reads the subject decomp except through an explicit, reverted verification step like this one).

- [ ] **Step 8: Teeth-proof**

Temporarily delete the `if (!yes) return ...` early-return from `dryRunOrCommit`, run `runSignAdd`'s "without --yes writes nothing" test, confirm it now fails (proving the dry-run gate is load-bearing, not incidentally true). Revert.

- [ ] **Step 9: Commit**

```bash
git add packages/cli/src/writeCommands.ts packages/cli/src/index.ts packages/cli/test/writeCommands.test.ts
git commit -m "feat(cli): sign suggest/add/list, paint, diff -- write commands default to dry-run, require --yes to commit"
```

---

## Task 19: Extend the corpus gate to real writes

Coarse plan's original Task 15 — **the actual merge gate for this whole plan**, per Plan 0 §6's own rule that no plan merges without a passing I5 identity-corpus test. `packages/core/test/write/corpus.test.ts` already exists (read it in full before writing this task — Plan 1 built it, and its own header comments explain exactly why it is built on `projectPaths`/`parseMapGroups` rather than `openProject`: `openProject` eagerly resolves tileset paths that one of the six configured engines, pokeclassic, does not have, and this gate must keep covering all six). It currently proves `editJson`'s scalar splice is corpus-safe. This task extends the SAME file with three more properties this plan's new write path introduces and none of the JSON-only gate covers: array splicing (Task 3), binary block round-tripping (Task 2), and the full guard→plan→commit funnel acting on a real file (Task 4) — restoring every file it touches, exactly like the existing tests already do.

**Files:**
- Modify: `packages/core/test/write/corpus.test.ts`

- [ ] **Step 1: Read the full existing file (already done above) and confirm the exact `roots`/`mapNamesOf` fixtures — reuse them, do not rebuild a second version**

- [ ] **Step 2: Write the failing array-splice corpus test**

Add to `packages/core/test/write/corpus.test.ts`:

```ts
import { insertArrayElement, removeArrayElement } from "../../src/write/jsonEdit.js";
```

```ts
  // Task 3's insertArrayElement/removeArrayElement were unit-tested against
  // synthetic fixtures only (packages/core/test/write/jsonEdit.test.ts) --
  // exactly the gap this file's own header comment warns about for
  // editJson's container-skip fix: a synthetic test proves the algorithm
  // correct against the shapes its author thought of, not against every
  // real formatting quirk six actual decomp forks contain (trailing
  // commas' absence, one-element arrays, arrays split across lines
  // differently per engine's own JSON formatter). This closes that gap for
  // the array-splice functions the same way the tests above already closed
  // it for scalar editJson.
  it.each(roots)("insertArrayElement then removeArrayElement round-trips every map.json's object_events array byte-identical, across %s", (root) => {
    const paths = projectPaths(root);
    const names = mapNamesOf(root);
    const notRestored: string[] = [];
    const neverDiffered: string[] = [];
    let checked = 0;

    for (const name of names) {
      const path = paths.mapJson(name);
      if (!existsSync(path)) continue;
      const src = readFileSync(path, "utf8");
      const parsed = JSON.parse(src) as { object_events?: unknown[] };
      if (!parsed.object_events || parsed.object_events.length === 0) continue;
      checked++;

      const probe = { graphics_id: "OBJ_EVENT_GFX_PLACEHOLDER_XYZZY", x: 0, y: 0, elevation: 0 };
      const inserted = insertArrayElement(src, ["object_events"], parsed.object_events.length, probe);
      if (inserted === src) neverDiffered.push(name);
      const removed = removeArrayElement(inserted, ["object_events"], parsed.object_events.length);
      if (removed !== src) notRestored.push(name);
    }

    // Every one of these six engines has at least a few hundred maps
    // carrying object events (measured floor across all six: well over
    // 200) -- if this drops to 0 the loop stopped finding real data, not
    // that this corpus genuinely has none.
    expect(checked).toBeGreaterThan(100);
    expect(neverDiffered).toEqual([]);
    expect(notRestored).toEqual([]);
  }, 900_000);

  // The insert-at-END case above never exercises walkArray's "skip past N
  // preceding elements to find the insertion point" path for anything
  // other than N = the whole array. Insert-at-0 (prepend) is the other
  // extreme, and it is where an off-by-one in leadingGap bookkeeping would
  // actually surface -- see Task 3's own derivation notes on this exact
  // failure mode.
  it.each(roots)("insertArrayElement at index 0 then removeArrayElement at index 0 round-trips byte-identical, across %s", (root) => {
    const paths = projectPaths(root);
    const names = mapNamesOf(root);
    const notRestored: string[] = [];
    let checked = 0;

    for (const name of names) {
      const path = paths.mapJson(name);
      if (!existsSync(path)) continue;
      const src = readFileSync(path, "utf8");
      const parsed = JSON.parse(src) as { object_events?: unknown[] };
      if (!parsed.object_events || parsed.object_events.length === 0) continue;
      checked++;

      const probe = { graphics_id: "OBJ_EVENT_GFX_PLACEHOLDER_XYZZY", x: 0, y: 0, elevation: 0 };
      const inserted = insertArrayElement(src, ["object_events"], 0, probe);
      const removed = removeArrayElement(inserted, ["object_events"], 0);
      if (removed !== src) notRestored.push(name);
    }

    expect(checked).toBeGreaterThan(100);
    expect(notRestored).toEqual([]);
  }, 900_000);
```

- [ ] **Step 3: Run test to verify it fails, then confirm it passes (no `core` code should need to change here -- this step exists to prove the claim, not to fix anything; if it DOES fail, the bug is real and must be fixed in `jsonEdit.ts`, not worked around in this test)**

Run: `npx vitest run packages/core/test/write/corpus.test.ts -t "insertArrayElement"`
Expected: PASS. If it fails, stop and fix `insertArrayElement`/`removeArrayElement`/`walkArray` in `packages/core/src/write/jsonEdit.ts` — do not adjust this test to tolerate a real bug.

- [ ] **Step 4: Write the failing binary round-trip corpus test**

Add to `packages/core/test/write/corpus.test.ts`:

```ts
import { parseBlocks, encodeBlocks } from "../../src/load/blocks.js";
import { parseLayouts } from "../../src/load/layouts.js";
import { engineProfile, defaultProfile, parseCfg, type EngineProfile } from "../../src/config/engine.js";

// Mirrors project.ts's own profile resolution (existsSync(porymapCfg) ?
// engineProfile(...) : defaultProfile(...)) closely enough for this gate's
// purpose -- it needs the block/metatile-attribute bit layout only, not
// project.ts's further fieldmap-constant merge, which this file's own
// header comment already explains this gate deliberately avoids depending
// on (the same reason it does not call openProject).
function profileOf(root: string): EngineProfile {
  const paths = projectPaths(root);
  return existsSync(paths.porymapCfg)
    ? engineProfile(parseCfg(readFileSync(paths.porymapCfg, "utf8")))
    : defaultProfile("pokeemerald");
}
```

```ts
  // The JSON gate above proves the SPLICE is exact; this is the binary
  // write path's own equivalent property -- encodeBlocks re-serialises the
  // WHOLE buffer (there is no surgical splice for binary, by design: a
  // fixed-width block record has no "the rest of the file" to preserve
  // around it the way JSON text does), so its correctness rests entirely
  // on parse+encode being exact inverses. A single off-by-one in a mask or
  // shift would corrupt every map.bin this project ever saves.
  it.each(roots)("encodeBlocks(parseBlocks(bytes)) round-trips every layout's map.bin and border.bin byte-identical, across %s", (root) => {
    const paths = projectPaths(root);
    const profile = profileOf(root);
    const { layouts } = parseLayouts(readFileSync(paths.layoutsJson, "utf8"));
    const notRestored: string[] = [];
    let checked = 0;

    for (const layout of layouts) {
      for (const rel of [layout.blockdataFilepath, layout.borderFilepath]) {
        const path = `${root}/${rel}`;
        if (!existsSync(path)) continue;
        checked++;
        const before = readFileSync(path);
        const blocks = parseBlocks(before, profile);
        const after = encodeBlocks(blocks, profile);
        if (!after.equals(before)) notRestored.push(`${layout.name}: ${rel}`);
      }
    }

    // Every configured engine has several hundred layouts, each with both
    // a blockdata and a border file -- a floor of 500 combined files is
    // well under any of the six engines' real counts (smallest measured
    // still exceeds 900), so a drop below it means the walk broke.
    expect(checked).toBeGreaterThan(500);
    expect(notRestored).toEqual([]);
  }, 900_000);
```

- [ ] **Step 5: Run test to verify it fails, then confirm it passes (same rule as Step 3 -- a real failure here is a real bug in `blocks.ts`, fix it there)**

Run: `npx vitest run packages/core/test/write/corpus.test.ts -t "encodeBlocks"`
Expected: PASS.

- [ ] **Step 6: Write the failing full-funnel merge-gate test — this is the one the plan's own Success Criteria #1 describes almost verbatim**

Add to `packages/core/test/write/corpus.test.ts`:

```ts
import { paintCells } from "../../src/edit/paint.js";
import { planSave, commitSave, type EditSession } from "../../src/write/save.js";
```

```ts
  // The plan's own Success Criteria #1 (this document's header): "Paint a
  // tile in NewBarkTown (hns/640) and in PetalburgCity (emerald/512), save
  // both, and confirm git diff in the decomp shows ONLY the two map.bin
  // files, changed by exactly the bytes painted." This is that criterion,
  // generalised to every configured engine and run as an automated gate
  // rather than a one-off manual check -- guards, binary encoding and the
  // save funnel, acting together on a real file, restored byte-identical
  // afterward no matter what assertion above it failed.
  it.each(roots)("paints one real block on one real map, commits through the full save funnel, and restores byte-identical, in %s", (root) => {
    const paths = projectPaths(root);
    const names = mapNamesOf(root);
    const profile = profileOf(root);
    const { layouts } = parseLayouts(readFileSync(paths.layoutsJson, "utf8"));
    const byId = new Map(layouts.map((l) => [l.id, l]));

    // First map whose layout and blockdata both actually resolve on disk --
    // not map index 0 specifically, since a handful of maps across these
    // six engines reference a layout id absent from their own layouts.json
    // (see this file's own existing comment on the 5 map.json files missing
    // from map_groups.json entirely -- data gaps like that are real and
    // this loop must skip past them, not fail the whole gate on one).
    let target: { name: string; layout: ReturnType<typeof parseLayouts>["layouts"][number] } | undefined;
    for (const name of names) {
      const mapPath = paths.mapJson(name);
      if (!existsSync(mapPath)) continue;
      const layoutId = (JSON.parse(readFileSync(mapPath, "utf8")) as { layout: string }).layout;
      const layout = byId.get(layoutId);
      if (!layout) continue;
      if (!existsSync(`${root}/${layout.blockdataFilepath}`)) continue;
      target = { name, layout };
      break;
    }
    expect(target).toBeDefined();
    const { name: mapName, layout } = target!;

    const blockdataPath = `${root}/${layout.blockdataFilepath}`;
    const borderPath = `${root}/${layout.borderFilepath}`;
    const mapJsonPath = paths.mapJson(mapName);
    const beforeBlockdata = readFileSync(blockdataPath);
    const beforeBorder = readFileSync(borderPath);
    const beforeMapJson = readFileSync(mapJsonPath, "utf8");

    try {
      const blocks = parseBlocks(beforeBlockdata, profile);
      const border = parseBlocks(beforeBorder, profile);
      const originalMetatileId = blocks[0]!.metatileId;
      const paintedId = (originalMetatileId + 1) % (profile.blockMetatileIdMask + 1);
      const paintedBlocks = paintCells(blocks, layout.width, layout.height, [{ x: 0, y: 0 }], { width: 1, height: 1, cells: [{ metatileId: paintedId }] }, 0, 0);

      const session: EditSession = {
        mapName, layout, blocks: paintedBlocks, border, map: {} as EditSession["map"],
        originalBlocks: blocks, originalMap: {} as EditSession["map"],
        originalMapJson: beforeMapJson, jsonEdits: [], insertOps: [], removeOps: [], scriptAppends: [], isDirty: true,
      };
      const plan = planSave({ paths, profile } as Parameters<typeof planSave>[0], session);
      expect(plan.refusals).toEqual([]);
      expect(plan.changes).toHaveLength(1);
      expect(plan.changes[0]!.kind).toBe("binary");

      commitSave({ paths, profile } as Parameters<typeof commitSave>[0], plan);

      const afterBlockdata = readFileSync(blockdataPath);
      expect(afterBlockdata).not.toEqual(beforeBlockdata);
      const afterBlocks = parseBlocks(afterBlockdata, profile);
      expect(afterBlocks[0]!.metatileId).toBe(paintedId);
      // Nothing else on the grid moved -- a save that touches the whole
      // buffer instead of exactly the one changed block is exactly the kind
      // of silent corruption this gate exists to catch.
      for (let i = 1; i < afterBlocks.length; i++) expect(afterBlocks[i]).toEqual(blocks[i]);
      expect(readFileSync(mapJsonPath, "utf8")).toBe(beforeMapJson); // untouched -- no json edit was staged
      expect(readFileSync(borderPath)).toEqual(beforeBorder); // untouched -- border was never painted
    } finally {
      writeFileSync(blockdataPath, beforeBlockdata);
      writeFileSync(borderPath, beforeBorder);
      writeFileSync(mapJsonPath, beforeMapJson);
      expect(readFileSync(blockdataPath)).toEqual(beforeBlockdata);
    }
  }, 900_000);
```

`planSave`/`commitSave` only ever read `proj.paths` and `proj.profile` (confirm this by reading `save.ts` and `binary.ts` again if in doubt) — the `{ paths, profile } as Parameters<typeof planSave>[0]` cast is deliberate, not a shortcut around a real dependency: building a full `Project` here would reintroduce the exact `openProject`/pokeclassic tileset problem this file's own header comment already explains why it avoids. If a future change makes `planSave`/`commitSave` read anything else off `Project`, this cast starts failing type-checking (not silently passing with `undefined`), which is the correct failure mode.

Add `import { writeFileSync } from "node:fs";` to this file's existing `node:fs` import line (it currently imports only `readFileSync, existsSync`).

- [ ] **Step 7: Run test to verify it fails, then confirm it passes**

Run: `npx vitest run packages/core/test/write/corpus.test.ts -t "paints one real block"`
Expected: PASS across all configured roots. If a refusal fires unexpectedly on some engine, read the refusal's own message/fix — do not loosen the assertion; either the guard is over-firing on a legitimate case (a real `guards.ts` bug) or the test's own painted value is genuinely invalid for that engine's metatile range (in which case clamp `paintedId` more conservatively, e.g. `Math.min(originalMetatileId + 1, someSafeCeiling)`, rather than disabling the check).

- [ ] **Step 8: Run the ENTIRE corpus test file**

Run: `npx vitest run packages/core/test/write/corpus.test.ts`
Expected: PASS, every `it`/`it.each` in the file (the three original tests plus the four new ones above).

- [ ] **Step 9: Run the full core suite one more time**

Run: `npx vitest run packages/core`
Expected: PASS.

- [ ] **Step 10: `git status --porcelain` check across every configured root — this is the invariant I8 proof for the whole plan, not just this task**

For the subject project root AND every `referenceProjects` entry in `pokemap.config.json`, run `git status --porcelain` before Step 7's test run and again after. Expected: byte-identical output both times (every root's tree is clean before and after) — this is what actually proves every `finally` block above restored real state, on real disk, across every real engine this project targets, not merely that an in-process assertion said so.

- [ ] **Step 11: Commit**

```bash
git add packages/core/test/write/corpus.test.ts
git commit -m "test(core): extend the I5 identity-corpus gate to array splicing, binary round-tripping, and the full save funnel -- the merge gate for Plan 2"
```

---

## Self-Review

**Spec coverage.** Every section of `docs/superpowers/specs/2026-09-07-...` — wait, this plan has no separate design spec of its own beyond its own header's Goal/Architecture/Success Criteria (Plan 2 was re-granularised directly from the coarse plan's own task list, not from a fresh brainstorming spec). Checked against the coarse plan's original 15-task scope and the four Success Criteria in this document's own header:
1. "Paint a tile in NewBarkTown/PetalburgCity, save both, confirm git diff shows only map.bin, changed by exactly the bytes painted" — covered by Task 19 Step 6 (generalised across all six engines) and Task 11/13's own live-verify steps.
2. "The 5-engine identity corpus test still passes at zero bytes changed" — covered by Task 19 Steps 2-9 (extends, does not weaken, the pre-existing gate).
3. "Add a wild sign, build the ROM, and see the Pokémon standing there" — covered by Tasks 15-18, with Task 17 Step 14's own live-verify explicitly naming this criterion.
4. "Attempting to save a layout with no layout_version is refused, by name, with the fix" — covered by Task 1 (`guardLayoutSave`), tested directly in that task's own test file.

Every File Structure table entry (top of this document) traced to the task that creates or modifies it: `guards.ts`/`binary.ts`/`jsonEdit.ts`/`save.ts`/`diff.ts` → Tasks 1-4; `commands.ts` → Task 5; `paint.ts` → Task 6 (extended in Task 12); `events.ts` → Task 7; `editSessions.ts`/server routes → Tasks 8-9 (extended in Task 17); `MetatilePalette.tsx` → Task 10; `useEditSession.ts`/`MapCanvas.tsx` edit wiring → Task 11 (extended in Tasks 12, 14); `CollisionPalette.tsx` → Task 12; `SaveDialog.tsx`/`Toolbar.tsx` → Task 13 (extended in Task 17); `EventInspector.tsx` → Task 14; `signs/suggest.ts` → Task 15; `signs/script.ts` → Task 16; `signs/write.ts`/`SignComposer.tsx` → Task 17; CLI → Task 18. No orphaned file, no task creating a file the table never named.

**Placeholder scan.** Grepped this document's own text for "TBD"/"TODO"/"implement later"/"add appropriate"/"handle edge cases"/"similar to Task N" (without repeated code) — none found. Every step with a code change shows the actual code; every test shows actual assertions against actual values, not shapes.

**Type consistency, checked task-to-task:**
- `EditSession` (Task 4) is the single canonical shape every later task's server routes (Tasks 8, 9, 17), CLI (Task 18), and corpus test (Task 19) construct identically — Task 18 and Task 19 both cite Task 8's `open()` as the source of truth rather than re-deriving the shape independently, and both were checked against it directly while being written.
- `PendingChange.kind` was widened from `"json" | "binary"` (Task 4's original text) to `"json" | "binary" | "text"` in-place once Task 17 needed a third kind, rather than Task 17 inventing a parallel, inconsistent field — `formatDiffText`/`formatDiffJson` (Task 4) needed no change since neither switches on `kind`.
- `SaveDialog.tsx` (Task 13) was corrected during this same writing pass, in place, once Task 17's own grounding in the REAL `/plan`/`/commit` response shape (`{changes, refusals}`, from `formatDiffJson`) surfaced that Task 13's first draft had invented a parallel `{files, changedBytes}` shape no route actually returns — this is exactly the kind of drift this self-review step exists to catch; it was caught and fixed inline rather than left for a task-execution-time surprise.
- `Snapshot`/`snapshotOf` (Task 8) gained the same `scriptAppends` field `EditSession` gained in Task 4's extension, specifically because `snapshotCommand`'s `Object.assign` semantics mean an omitted field is not merely untested but actively wrong (undo would leave a sign's script text staged) — checked by tracing `Object.assign(s, next)` against the added field before writing it in, not assumed.
- `activeTool`'s union type grows once per task that adds a tool (Task 11: pencil/rect/bucket; Task 12: + collision) rather than each task inventing its own separate prop — `MapCanvasProps` carries one evolving type across both tasks.
- Every `Refusal` (Task 1's `guards.ts`, Task 17's `signs/write.ts`) shares the exact same `{code, message, fix, subject}` shape, and every route/component that surfaces one (Task 13's `SaveDialog`, Task 17's `SignComposer`) reads it the same way.

No gaps found requiring a new task. Plan 2 is ready for `subagent-driven-development` execution, Task 1 through Task 19 in order.
