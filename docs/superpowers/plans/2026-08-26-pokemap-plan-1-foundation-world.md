# PokeMap Plan 1 — Foundation, Renderer, Stitched World, Encounter Atlas

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read [Plan 0](2026-08-26-pokemap-plan-0-roadmap.md) first — its invariants I1–I8 bind every task here.

**Goal:** Build a read-only PokeMap that renders every map in a pokeemerald-family decomp correctly against its own per-layout metatile boundary, stitches them into one pannable world, overlays wild encounter data, and exposes it all through a CLI an AI agent can drive.

**Architecture:** Node-targeted `core` package does all parsing and renders to raw RGBA. `cli` encodes those buffers to PNG. `server` serves them over HTTP. `ui` (React + Canvas) blits them. No writes to the decomp anywhere in this plan — the surgical JSON editor is built and proven as a pure text transform, but nothing calls `fs.writeFile` on a decomp path until Plan 2.

**Tech Stack:** TypeScript strict, ESM, Node 24, npm workspaces, vitest, commander, React 19, Vite, Playwright. Zero image-library dependencies — PNG decode and encode are ~150 lines each of owned code over `node:zlib`.

**Spec:** [`docs/superpowers/specs/2026-08-26-pokemap-design.md`](../specs/2026-08-26-pokemap-design.md)

**Test convention, binding on every task in this plan.** Tests that read a real decomp import `SUBJECT_ROOT`, `itWithCorpus`, `hasProject` and `availableReferenceRoots` from `packages/core/test/helpers/corpus.ts` (created in Task 3). They never hardcode an absolute path, and every assertion against real data uses `itWithCorpus` rather than `it`, so a machine without the checkout **skips** instead of failing the suite with `ENOENT`. Code samples below show `SUBJECT_ROOT` already substituted; add the import when you write the file.

Corollary worth stating, because it is the failure this convention can cause: a suite that skips its real-data tests and reports green is worse than one that fails loudly. When a task's expected output says a real-data test passes, verify with `--reporter=verbose` that it actually **ran**.

**Success criteria — demonstrated, not asserted:**
1. `pokemap render PetalburgCity --out shot.png` produces a correct PNG.
2. An `emerald` layout and an `frlg` layout render correctly **in the same session**, with no edit to `include/fieldmap.h`.
3. All 1,209 subject maps and all layouts across 5 reference engines load without error.
4. The JSON identity corpus test passes at zero bytes changed.
5. The whole overworld pans as one continuous image in the browser.
6. `pokemap where PIKACHU` lists every map, rate, and level band.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/config/paths.ts` | Resolve a project root into the ~15 known file paths |
| `packages/core/src/config/fieldmap.ts` | Parse the six split constants from `include/fieldmap.h` |
| `packages/core/src/config/engine.ts` | `porymap.project.cfg` → `EngineProfile`, with per-`base_game_version` defaults |
| `packages/core/src/model/types.ts` | All shared types. No logic. |
| `packages/core/src/load/layouts.ts` | `layouts.json` → `Layout[]`, split resolution |
| `packages/core/src/load/maps.ts` | `map_groups.json`, `map.json` → `MapData` |
| `packages/core/src/load/tilesets.ts` | `headers.h` + `metatiles.h` + `graphics.h` → tileset paths |
| `packages/core/src/load/pal.ts` | JASC-PAL → `RGB[]` |
| `packages/core/src/load/png.ts` | Indexed PNG (colorType 3, depth 4 and 8) → index plane |
| `packages/core/src/load/tilesetData.ts` | `metatiles.bin`, `metatile_attributes.bin`, tiles, palettes → `Tileset` |
| `packages/core/src/load/blocks.ts` | `map.bin` / `border.bin` → `Block[]` |
| `packages/core/src/load/encounters.ts` | `wild_encounters.json` → `EncounterTable`, true percentages |
| `packages/core/src/render/raster.ts` | RGBA buffer primitives — alloc, blit, tint |
| `packages/core/src/render/tile.ts` | One 8×8 tile → RGBA, with flips and palette |
| `packages/core/src/render/metatile.ts` | One metatile → 16×16 RGBA, two layers |
| `packages/core/src/render/layout.ts` | A whole layout + border → RGBA |
| `packages/core/src/render/overlays.ts` | Grid, collision, elevation, events, seams |
| `packages/core/src/validate/metatileRange.ts` | Port of `check_metatile_range.py` |
| `packages/core/src/write/jsonEdit.ts` | Surgical JSON text splice. Identity-safe. |
| `packages/core/src/world/connections.ts` | Connection graph → global coords, conflict detection |
| `packages/core/src/world/warpGraph.ts` | Dungeon auto-layout heuristic |
| `packages/core/src/world/sidecar.ts` | `.pokemap/world.json` read/write |
| `packages/cli/src/png.ts` | Minimal RGBA → PNG encoder |
| `packages/cli/src/index.ts` | commander wiring |
| `packages/server/src/index.ts` | HTTP shim |
| `packages/ui/src/**` | React app |

---

# Phase A — Scaffold and configuration

## Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`, `pokemap.config.json`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`

- [ ] **Step 1: Initialise the repo**

```bash
cd "C:/Programming Projects/PokeMap"
git init
npm init -y
```

- [ ] **Step 2: Write the root `package.json`**

```json
{
  "name": "pokemap",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.base.json"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 3: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": [
    "packages/*/src/**/*.ts",
    "packages/*/src/**/*.tsx",
    "packages/*/test/**/*.ts",
    "packages/*/test/**/*.tsx"
  ]
}
```

Three details that are load-bearing:

- **`lib: ["ES2023"]` with no `DOM`.** Without it, TypeScript includes DOM types by default and `document.title` type-checks happily inside `core` — which makes "`core` never touches the DOM" a convention with nothing enforcing it. Task 20's `ui` package overrides this with `"lib": ["ES2023", "DOM", "DOM.Iterable"]` in its own tsconfig.
- **`.tsx` must be included.** With `.ts` only, a `.tsx` file with a blatant type error is invisible to `npm run typecheck`, which exits 0 and reports green. Get this right before `ui` exists.
- **Four separate entries, NOT `*.{ts,tsx}`.** TypeScript's `include` matcher supports `*`, `?` and `**/` and **does not expand brace groups**. `"packages/*/src/**/*.{ts,tsx}"` matches zero files, and an `include` that matches nothing makes `tsc` fail outright with `TS18003` — worse than the bug it was meant to fix. Verified against TypeScript 5.9.3 via `ts.parseJsonConfigFileContent`. Note this does *not* apply to vitest's `include` in Task 20, which uses minimatch and does support brace groups.

- [ ] **Step 4: Write `pokemap.config.json`**

```json
{
  "projectPath": "C:/Programming Projects/Pokemon Game/game",
  "referenceProjects": [
    "C:/Programming Projects/Pokemon Game/refs/pokeemerald",
    "C:/Programming Projects/Pokemon Game/refs/pokefirered",
    "C:/Programming Projects/Pokemon Game/refs/pokeemerald-expansion",
    "C:/Programming Projects/Pokemon Game/refs/modern-emerald",
    "C:/Programming Projects/Pokemon Game/refs/pokeclassic"
  ]
}
```

- [ ] **Step 5: Create the `core` package**

`packages/core/package.json`:

```json
{
  "name": "@pokemap/core",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts"
}
```

**No `exports` field, deliberately.** Later packages import `core` by deep source path — `import { openProject } from "@pokemap/core/src/project.js"` — and an `exports` map encapsulates the package so that every such path is refused. An `exports` map cannot rescue this either: the specifier ends in `.js` while the file on disk is `.ts`, so a `"./src/*": "./src/*"` wildcard resolves to a file that does not exist. Adding `exports` breaks `tsc --noEmit` (TS2307), `tsx` (`ERR_PACKAGE_PATH_NOT_EXPORTED`) and `vitest` (missing specifier) simultaneously. Leave it out.

`packages/core/src/index.ts`:

```ts
export const VERSION = "0.0.0";
```

- [ ] **Step 6: Install and verify**

Run: `npm install && npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.base.json pokemap.config.json .gitignore packages/core
git commit -m "chore: scaffold pokemap monorepo"
```

---

## Task 2: Project paths

**Files:**
- Create: `packages/core/src/config/paths.ts`
- Test: `packages/core/test/config/paths.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { projectPaths } from "../../src/config/paths.js";

describe("projectPaths", () => {
  it("resolves known decomp paths from a root", () => {
    const p = projectPaths("C:/proj");
    expect(p.layoutsJson).toBe("C:/proj/data/layouts/layouts.json");
    expect(p.mapGroupsJson).toBe("C:/proj/data/maps/map_groups.json");
    expect(p.fieldmapH).toBe("C:/proj/include/fieldmap.h");
    expect(p.porymapCfg).toBe("C:/proj/porymap.project.cfg");
    expect(p.wildEncountersJson).toBe("C:/proj/src/data/wild_encounters.json");
    expect(p.regionMapDir).toBe("C:/proj/src/data/region_map");
    expect(p.regionMapSections).toBe("C:/proj/src/data/region_map/region_map_sections.json");
    expect(p.tilesetGraphicsC).toBe("C:/proj/src/graphics.c");
    expect(p.mapDir("NewBarkTown")).toBe("C:/proj/data/maps/NewBarkTown");
    expect(p.layoutDir("NewBarkTown")).toBe("C:/proj/data/layouts/NewBarkTown");
  });

  it("normalises backslashes so Windows roots produce forward-slash paths", () => {
    const p = projectPaths("C:\\proj");
    expect(p.layoutsJson).toBe("C:/proj/data/layouts/layouts.json");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/config/paths.test.ts`
Expected: FAIL — cannot find module `paths.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/config/paths.ts
export interface ProjectPaths {
  root: string;
  layoutsJson: string;
  mapGroupsJson: string;
  fieldmapH: string;
  porymapCfg: string;
  wildEncountersJson: string;
  /** Region map files are globbed from here — the subject repo has two
   *  (`region_map_sections.json` and `region_map_sections_johto.json`) and
   *  Porymap knows about only one. Plan 3 Task 4 depends on the directory,
   *  not on a single hardcoded filename. */
  regionMapDir: string;
  regionMapSections: string;
  tilesetHeadersH: string;
  tilesetMetatilesH: string;
  tilesetGraphicsH: string;
  /** Three tilesets -- gTileset_General among them -- declare their palettes
   *  here rather than in src/data/tilesets/graphics.h. Reading only the header
   *  leaves 242 of 1,020 layouts with an empty palette array. */
  tilesetGraphicsC: string;
  eventObjectsH: string;
  sidecar: string;
  mapDir(name: string): string;
  mapJson(name: string): string;
  mapScriptsInc(name: string): string;
  layoutDir(name: string): string;
  monIconPng(speciesLower: string): string;
  monOverworldPng(speciesLower: string): string;
}

const norm = (s: string) => s.replace(/\\/g, "/").replace(/\/+$/, "");

export function projectPaths(root: string): ProjectPaths {
  const r = norm(root);
  return {
    root: r,
    layoutsJson: `${r}/data/layouts/layouts.json`,
    mapGroupsJson: `${r}/data/maps/map_groups.json`,
    fieldmapH: `${r}/include/fieldmap.h`,
    porymapCfg: `${r}/porymap.project.cfg`,
    wildEncountersJson: `${r}/src/data/wild_encounters.json`,
    regionMapDir: `${r}/src/data/region_map`,
    regionMapSections: `${r}/src/data/region_map/region_map_sections.json`,
    tilesetHeadersH: `${r}/src/data/tilesets/headers.h`,
    tilesetMetatilesH: `${r}/src/data/tilesets/metatiles.h`,
    tilesetGraphicsH: `${r}/src/data/tilesets/graphics.h`,
    tilesetGraphicsC: `${r}/src/graphics.c`,
    eventObjectsH: `${r}/include/constants/event_objects.h`,
    sidecar: `${r}/.pokemap/world.json`,
    mapDir: (n) => `${r}/data/maps/${n}`,
    mapJson: (n) => `${r}/data/maps/${n}/map.json`,
    mapScriptsInc: (n) => `${r}/data/maps/${n}/scripts.inc`,
    layoutDir: (n) => `${r}/data/layouts/${n}`,
    monIconPng: (s) => `${r}/graphics/pokemon/${s}/icon.png`,
    monOverworldPng: (s) => `${r}/graphics/object_events/pics/pokemon/${s}.png`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/config/paths.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config/paths.ts packages/core/test/config/paths.test.ts
git commit -m "feat(core): resolve decomp file paths from a project root"
```

---

## Task 3: Parse the split constants from `include/fieldmap.h`

This is invariant **I1**'s data source. Hardcoding 512 or 640 anywhere is a bug.

**Files:**
- Create: `packages/core/src/config/fieldmap.ts`
- Test: `packages/core/test/config/fieldmap.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseFieldmapConstants } from "../../src/config/fieldmap.js";

const SRC = `
#define NUM_TILES_IN_PRIMARY 640
#define NUM_TILES_IN_PRIMARY_EMERALD 512

#define NUM_METATILES_IN_PRIMARY 640
#define NUM_METATILES_IN_PRIMARY_EMERALD 512
#define NUM_METATILES_TOTAL 999
#define NUM_PALS_IN_PRIMARY 7
#define NUM_PALS_IN_PRIMARY_EMERALD 6
`;

describe("parseFieldmapConstants", () => {
  it("reads all six split constants plus the total", () => {
    const c = parseFieldmapConstants(SRC);
    expect(c.tilesInPrimary).toBe(640);
    expect(c.tilesInPrimaryEmerald).toBe(512);
    expect(c.metatilesInPrimary).toBe(640);
    expect(c.metatilesInPrimaryEmerald).toBe(512);
    expect(c.palsInPrimary).toBe(7);
    expect(c.palsInPrimaryEmerald).toBe(6);
    expect(c.metatilesTotal).toBe(999);
  });

  it("follows the header when the owner swaps the values", () => {
    // 704 is deliberately neither the fixture's value (640) nor the field's
    // fallback (512). Asserting 512 here would be tautological: a regex that
    // matched nothing would also produce 512, so the test could not tell
    // "read from the header" from "silently fell back".
    const swapped = SRC.replace("NUM_METATILES_IN_PRIMARY 640", "NUM_METATILES_IN_PRIMARY 704");
    expect(parseFieldmapConstants(swapped).metatilesInPrimary).toBe(704);
  });

  it("falls back to Emerald stock values when the _EMERALD names are absent", () => {
    const stock = "#define NUM_TILES_IN_PRIMARY 512\n#define NUM_METATILES_IN_PRIMARY 512\n#define NUM_METATILES_TOTAL 1024\n#define NUM_PALS_IN_PRIMARY 6\n";
    const c = parseFieldmapConstants(stock);
    expect(c.metatilesInPrimary).toBe(512);
    expect(c.metatilesInPrimaryEmerald).toBe(512);
    expect(c.palsInPrimaryEmerald).toBe(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/config/fieldmap.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/config/fieldmap.ts
export interface FieldmapConstants {
  tilesInPrimary: number;
  tilesInPrimaryEmerald: number;
  metatilesInPrimary: number;
  metatilesInPrimaryEmerald: number;
  palsInPrimary: number;
  palsInPrimaryEmerald: number;
  metatilesTotal: number;
}

function defineValue(src: string, name: string): number | undefined {
  const re = new RegExp(`^\\s*#define\\s+${name}\\s+(\\d+)\\s*(?://.*)?$`, "m");
  const m = re.exec(src);
  return m?.[1] === undefined ? undefined : Number(m[1]);
}

export function parseFieldmapConstants(src: string): FieldmapConstants {
  const tiles = defineValue(src, "NUM_TILES_IN_PRIMARY") ?? 512;
  const metatiles = defineValue(src, "NUM_METATILES_IN_PRIMARY") ?? 512;
  const pals = defineValue(src, "NUM_PALS_IN_PRIMARY") ?? 6;
  return {
    tilesInPrimary: tiles,
    // An engine with no per-layout split has one boundary; the "emerald" set
    // collapses onto it. That is the correct behaviour for pokeemerald,
    // pokefirered, modern-emerald and pokeclassic.
    tilesInPrimaryEmerald: defineValue(src, "NUM_TILES_IN_PRIMARY_EMERALD") ?? tiles,
    metatilesInPrimary: metatiles,
    metatilesInPrimaryEmerald: defineValue(src, "NUM_METATILES_IN_PRIMARY_EMERALD") ?? metatiles,
    palsInPrimary: pals,
    palsInPrimaryEmerald: defineValue(src, "NUM_PALS_IN_PRIMARY_EMERALD") ?? pals,
    metatilesTotal: defineValue(src, "NUM_METATILES_TOTAL") ?? 1024,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/config/fieldmap.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Create the corpus test helper**

Roughly fifteen later tests in this plan assert against the real decomp checkouts. Written naively, each is a bare `readFileSync` on an absolute path outside the repo, so on any machine without that checkout the whole suite fails with `ENOENT` rather than skipping. Establish the pattern once, here, before it is copied fifteen times.

```ts
// packages/core/test/helpers/corpus.ts
import { existsSync, readFileSync } from "node:fs";
import { it } from "vitest";
import { projectPaths } from "../../src/config/paths.js";

// Read at module load, resolved against the process cwd: run vitest from the
// repo root. Roughly fifteen test files import this, so a missing or malformed
// pokemap.config.json surfaces as one collection error per importing file
// rather than a single one — noisy, but each message names the real cause.
const config = JSON.parse(readFileSync("pokemap.config.json", "utf8")) as {
  projectPath: string;
  referenceProjects: string[];
};

export const SUBJECT_ROOT = config.projectPath;
export const REFERENCE_ROOTS = config.referenceProjects;

/** A decomp checkout is "present" if the one file every engine has is there. */
export const hasProject = (root: string): boolean =>
  existsSync(projectPaths(root).layoutsJson);

/** Skips rather than fails when the subject decomp is not on this machine. */
export const itWithCorpus = it.skipIf(!hasProject(SUBJECT_ROOT));

export const availableReferenceRoots = (): string[] => REFERENCE_ROOTS.filter(hasProject);

/**
 * A reference engine by directory name, e.g. `referenceRoot("pokefirered")`.
 * Returns undefined when that engine is not configured or not checked out,
 * so a caller can skip rather than fail.
 */
export const referenceRoot = (name: string): string | undefined =>
  REFERENCE_ROOTS.find((r) => projectPaths(r).root.split("/").pop() === name && hasProject(r));
```

Note it reads `pokemap.config.json` rather than hardcoding a path, so a contributor with the decomp elsewhere only edits one file.

`referenceRoot` exists because several later tasks assert against **one named** engine — Task 4 against `pokefirered`'s cfg, Task 5 against `pokeemerald`'s `layouts.json`. Reaching for a literal path in those tests defeats the helper: on a machine whose config points elsewhere the test silently skips despite a perfectly good checkout being declared. Use:

```ts
const frlg = referenceRoot("pokefirered");
it.skipIf(!frlg)("...", () => { /* frlg is defined here */ });
```

Both helpers route through `projectPaths`, which already normalises backslashes and strips trailing slashes. Do not hand-roll that here: a configured root written as `"C:/repos/pokefirered/"` would make a naive `.split("/").pop()` return `""`, the lookup would miss, and the test would **silently skip** — losing that engine's coverage with no signal that anything broke.

- [ ] **Step 6: Add a test against the real header**

```ts
// append to the same test file
import { readFileSync } from "node:fs";
import { projectPaths } from "../../src/config/paths.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

itWithCorpus("parses the subject repo's real fieldmap.h", () => {
  const p = projectPaths(SUBJECT_ROOT);
  const c = parseFieldmapConstants(readFileSync(p.fieldmapH, "utf8"));
  expect(c.metatilesInPrimary).toBe(640);
  expect(c.metatilesInPrimaryEmerald).toBe(512);
  expect(c.palsInPrimary).toBe(7);
  expect(c.palsInPrimaryEmerald).toBe(6);
});
```

Run: `npx vitest run packages/core/test/config/fieldmap.test.ts`
Expected: PASS, 4 tests — and the fourth must actually **run**, not skip, on a machine that has the decomp. Confirm with `--reporter=verbose`; a suite that skips its only real-data assertion while reporting green is the failure mode this helper must not introduce.

**Every later task in this plan that asserts against a real decomp uses `itWithCorpus` and `SUBJECT_ROOT`, never a hardcoded absolute path.**

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/config/fieldmap.ts packages/core/test/config/fieldmap.test.ts packages/core/test/helpers/corpus.ts
git commit -m "feat(core): parse per-layout split constants from fieldmap.h"
```

---

## Task 4: Engine profile from `porymap.project.cfg`

**Files:**
- Create: `packages/core/src/config/engine.ts`
- Test: `packages/core/test/config/engine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseCfg, engineProfile, defaultProfile } from "../../src/config/engine.js";

describe("parseCfg", () => {
  it("reads key=value, hex, ints and comma lists", () => {
    const cfg = parseCfg("base_game_version=pokeemerald\nblock_collision_mask=0xC00\nmetatile_attributes_size=2\nwarp_behaviors=0x62,0x93\n");
    expect(cfg.base_game_version).toBe("pokeemerald");
    expect(cfg.block_collision_mask).toBe("0xC00");
  });
});

describe("engineProfile", () => {
  it("builds a profile from the subject repo's cfg", () => {
    const p = engineProfile(parseCfg([
      "base_game_version=pokeemerald",
      "block_metatile_id_mask=0x3FF",
      "block_collision_mask=0xC00",
      "block_elevation_mask=0xF000",
      "metatile_attributes_size=2",
      "metatile_behavior_mask=0xFF",
      "metatile_layer_type_mask=0xF000",
      "warp_behaviors=0x62,0x93,0x6A",
    ].join("\n")));

    expect(p.baseGameVersion).toBe("pokeemerald");
    expect(p.blockMetatileIdMask).toBe(0x3ff);
    expect(p.blockCollisionMask).toBe(0xc00);
    expect(p.blockCollisionShift).toBe(10);
    expect(p.blockElevationShift).toBe(12);
    expect(p.metatileAttributesSize).toBe(2);
    expect(p.warpBehaviors).toEqual([0x62, 0x93, 0x6a]);
  });

  it("uses FireRed's 4-byte attributes and terrain masks", () => {
    const p = defaultProfile("pokefirered");
    expect(p.metatileAttributesSize).toBe(4);
    expect(p.metatileTerrainTypeMask).toBe(0x3e00);
    expect(p.metatileEncounterTypeMask).toBe(0x7000000);
    expect(p.supportsFloorNumber).toBe(true);
  });

  it("marks pokeemerald-expansion as supporting layout_version", () => {
    expect(defaultProfile("pokeemerald-expansion").supportsLayoutVersion).toBe(true);
    expect(defaultProfile("pokeemerald").supportsLayoutVersion).toBe(false);
  });

  it("reads masks from the cfg rather than falling through to defaults", () => {
    // Every mask in a REAL cfg happens to equal this engine's default, so a
    // parser that ignored the file entirely would still pass the corpus tests
    // below. Deliberately non-default values are the only way to prove the
    // keys are actually read. Same trap that made Task 3's swap test useless.
    const p = engineProfile(parseCfg([
      "base_game_version=pokeemerald",
      "block_metatile_id_mask=0x1FF",
      "block_collision_mask=0x600",
      "block_elevation_mask=0x7800",
      "metatile_attributes_size=4",
      "metatile_behavior_mask=0x3F",
      "metatile_layer_type_mask=0x0F00",
    ].join("
")));

    expect(p.blockMetatileIdMask).toBe(0x1ff);
    expect(p.blockCollisionMask).toBe(0x600);
    expect(p.blockCollisionShift).toBe(9);
    expect(p.blockElevationMask).toBe(0x7800);
    expect(p.blockElevationShift).toBe(11);
    expect(p.metatileAttributesSize).toBe(4);
    expect(p.metatileBehaviorMask).toBe(0x3f);
    expect(p.metatileLayerTypeMask).toBe(0x0f00);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/config/engine.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/config/engine.ts
export interface EngineProfile {
  baseGameVersion: string;
  blockMetatileIdMask: number;
  blockCollisionMask: number;
  blockCollisionShift: number;
  blockElevationMask: number;
  blockElevationShift: number;
  metatileAttributesSize: 2 | 4;
  metatileBehaviorMask: number;
  metatileLayerTypeMask: number;
  metatileTerrainTypeMask: number;
  metatileEncounterTypeMask: number;
  warpBehaviors: number[];
  /** Whether layouts.json may carry a per-layout `layout_version` key. */
  supportsLayoutVersion: boolean;
  supportsFloorNumber: boolean;
}

export function parseCfg(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

/** `Number()` parses "0x1FF" natively, so hex and decimal both just work. */
const num = (v: string | undefined, dflt: number): number =>
  v === undefined || v === "" ? dflt : Number(v);

/** Bit position of the lowest set bit, i.e. the shift a mask implies. */
export function maskShift(mask: number): number {
  if (mask === 0) return 0;
  let s = 0;
  while (((mask >> s) & 1) === 0) s++;
  return s;
}

export function defaultProfile(version: string): EngineProfile {
  const frlg = version === "pokefirered";
  return {
    baseGameVersion: version,
    blockMetatileIdMask: 0x3ff,
    blockCollisionMask: 0xc00,
    blockCollisionShift: 10,
    blockElevationMask: 0xf000,
    blockElevationShift: 12,
    metatileAttributesSize: frlg ? 4 : 2,
    metatileBehaviorMask: frlg ? 0x1ff : 0xff,
    metatileLayerTypeMask: frlg ? 0x60000000 : 0xf000,
    metatileTerrainTypeMask: frlg ? 0x3e00 : 0,
    metatileEncounterTypeMask: frlg ? 0x7000000 : 0,
    warpBehaviors: [],
    supportsLayoutVersion: version === "pokeemerald-expansion",
    supportsFloorNumber: frlg,
  };
}

// Adding a cfg-backed field to EngineProfile? Add its override below too.
// The `...base` spread makes every field structurally satisfied, so a forgotten
// override type-checks fine and silently returns the default instead of the
// value the cfg asked for.
export function engineProfile(cfg: Record<string, string>): EngineProfile {
  const base = defaultProfile(cfg.base_game_version ?? "pokeemerald");
  const collision = num(cfg.block_collision_mask, base.blockCollisionMask);
  const elevation = num(cfg.block_elevation_mask, base.blockElevationMask);
  return {
    ...base,
    blockMetatileIdMask: num(cfg.block_metatile_id_mask, base.blockMetatileIdMask),
    blockCollisionMask: collision,
    blockCollisionShift: maskShift(collision),
    blockElevationMask: elevation,
    blockElevationShift: maskShift(elevation),
    metatileAttributesSize: (num(cfg.metatile_attributes_size, base.metatileAttributesSize) === 4 ? 4 : 2),
    metatileBehaviorMask: num(cfg.metatile_behavior_mask, base.metatileBehaviorMask),
    metatileLayerTypeMask: num(cfg.metatile_layer_type_mask, base.metatileLayerTypeMask),
    metatileTerrainTypeMask: num(cfg.metatile_terrain_type_mask, base.metatileTerrainTypeMask),
    metatileEncounterTypeMask: num(cfg.metatile_encounter_type_mask, base.metatileEncounterTypeMask),
    warpBehaviors: (cfg.warp_behaviors ?? "").split(",").map((s) => s.trim()).filter(Boolean).map(Number),
  };
}
```

Note: `supportsLayoutVersion` is *also* set true whenever `layouts.json` actually contains the key — that override lands in Task 5, where the layouts file is available.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/config/engine.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add real-corpus tests**

Using `itWithCorpus`/`SUBJECT_ROOT`/`hasProject` from `packages/core/test/helpers/corpus.ts`, parse the two real cfgs in the corpus — the subject repo's (`base_game_version=pokeemerald`, 2-byte attrs, behaviour `0xFF`, layer type `0xF000`, **28** warp behaviours) and `refs/pokefirered`'s (4-byte attrs, behaviour `0x1FF`, layer type `0x60000000`, terrain `0x3E00`, encounter `0x7000000`, **17** warp behaviours). Those two files are the only real cfgs across the six trees.

Assert `warpBehaviors.length` in both. It is the one field with no default — `defaultProfile` always returns `[]` — so it is the only assertion in either test that a do-nothing parser cannot satisfy. The mask assertions are worth keeping as documentation of what the files say, but Step 1's non-default-mask test is what actually guards the parser.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/config/engine.ts packages/core/test/config/engine.test.ts
git commit -m "feat(core): build engine profile from porymap.project.cfg with per-version defaults"
```

---

# Phase B — Model loaders

## Task 5: Layouts and split resolution

The heart of invariant **I1**.

**Files:**
- Create: `packages/core/src/model/types.ts`
- Create: `packages/core/src/load/layouts.ts`
- Test: `packages/core/test/load/layouts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseLayouts, resolveSplit } from "../../src/load/layouts.js";
import { parseFieldmapConstants } from "../../src/config/fieldmap.js";
import { projectPaths } from "../../src/config/paths.js";
import { SUBJECT_ROOT, itWithCorpus, referenceRoot } from "../helpers/corpus.js";

// Tiles and metatiles are deliberately given DIFFERENT values here, unlike the
// real headers where both are 512/640. With them equal, a tiles<->metatiles
// crossover inside a branch is invisible: both fields would still read back the
// number the test expects. The +1 makes a swap fail loudly.
const CONSTANTS = parseFieldmapConstants(`
#define NUM_TILES_IN_PRIMARY 641
#define NUM_TILES_IN_PRIMARY_EMERALD 513
#define NUM_METATILES_IN_PRIMARY 640
#define NUM_METATILES_IN_PRIMARY_EMERALD 512
#define NUM_METATILES_TOTAL 1024
#define NUM_PALS_IN_PRIMARY 7
#define NUM_PALS_IN_PRIMARY_EMERALD 6
`);

describe("resolveSplit", () => {
  it("gives emerald layouts the 512 boundary", () => {
    const s = resolveSplit({ layoutVersion: "emerald" } as never, CONSTANTS);
    expect(s).toEqual({ version: "emerald", tiles: 513, metatiles: 512, pals: 6 });
  });

  it("gives frlg and hns layouts the 640 boundary", () => {
    for (const v of ["frlg", "hns"] as const) {
      const s = resolveSplit({ layoutVersion: v } as never, CONSTANTS);
      expect(s.tiles).toBe(641);
      expect(s.metatiles).toBe(640);
      expect(s.pals).toBe(7);
    }
  });

  it("treats a missing layout_version as emerald, matching GetNumMetatilesInPrimary's default branch", () => {
    expect(resolveSplit({ layoutVersion: undefined } as never, CONSTANTS).metatiles).toBe(512);
  });
});

describe("parseLayouts", () => {
  itWithCorpus("parses the subject repo's layouts.json with the documented version counts", () => {
    const p = projectPaths(SUBJECT_ROOT);
    const { layouts } = parseLayouts(readFileSync(p.layoutsJson, "utf8"));
    const byVersion: Record<string, number> = {};
    for (const l of layouts) byVersion[l.layoutVersion ?? "(none)"] = (byVersion[l.layoutVersion ?? "(none)"] ?? 0) + 1;
    expect(byVersion.emerald).toBe(389);
    expect(byVersion.frlg).toBe(349);
    expect(byVersion.hns).toBe(282);
  });

  it("refuses an unrecognised layout_version rather than inventing a boundary", () => {
    expect(() => resolveSplit({ layoutVersion: "radical_red" } as never, CONSTANTS))
      .toThrow(/unknown layout_version/);
  });

  itWithCorpus("reads the seven 3x2 borders; every layout here has explicit border keys", () => {
    const p = projectPaths(SUBJECT_ROOT);
    const { layouts } = parseLayouts(readFileSync(p.layoutsJson, "utf8"));
    const wide = layouts.filter((l) => l.borderWidth === 3 && l.borderHeight === 2).map((l) => l.name).sort();
    expect(wide).toHaveLength(7);
    expect(layouts.every((l) => l.borderWidth >= 2 && l.borderHeight >= 2)).toBe(true);
  });

  const emerald = referenceRoot("pokeemerald");
  it.skipIf(!emerald)("parses pokeemerald's layouts.json, which has no border or version keys", () => {
    const { layouts } = parseLayouts(readFileSync(projectPaths(emerald!).layoutsJson, "utf8"));
    expect(layouts.length).toBeGreaterThan(0);
    // Stock pokeemerald has neither key. borderWidth must DEFAULT to 2 rather
    // than being read, and layoutVersion must stay undefined -- writing it back
    // would be the Porymap 6 failure (inventing keys into 726 layouts).
    expect(layouts[0]!.borderWidth).toBe(2);
    expect(layouts[0]!.layoutVersion).toBeUndefined();
  });

  const frlg = referenceRoot("pokefirered");
  it.skipIf(!frlg)("preserves an explicit border of 0 rather than defaulting it to 2", () => {
    // 28 of pokefirered's 383 layouts are indoor rooms with border_width 0.
    // The undefined-check must stay `=== undefined`, not falsy: `!l.border_width`
    // would give every one of those a 2x2 border it does not have.
    const { layouts } = parseLayouts(readFileSync(projectPaths(frlg!).layoutsJson, "utf8"));
    const zero = layouts.filter((l) => l.borderWidth === 0);
    expect(zero.length).toBe(28);
    expect(zero.every((l) => l.borderHeight === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/load/layouts.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the types**

```ts
// packages/core/src/model/types.ts
export type LayoutVersion = "emerald" | "frlg" | "hns";

export interface Split {
  version: LayoutVersion;
  /** First tile index belonging to the secondary tileset. */
  tiles: number;
  /** First metatile id belonging to the secondary tileset. */
  metatiles: number;
  /** First palette index belonging to the secondary tileset. */
  pals: number;
}

export interface Layout {
  id: string;
  name: string;
  width: number;
  height: number;
  borderWidth: number;
  borderHeight: number;
  primaryTileset: string;
  secondaryTileset: string;
  borderFilepath: string;
  blockdataFilepath: string;
  layoutVersion?: LayoutVersion;
}

export interface RGB { r: number; g: number; b: number; }

export interface Block {
  metatileId: number;
  collision: number;
  elevation: number;
}
```

- [ ] **Step 4: Write the loader**

```ts
// packages/core/src/load/layouts.ts
import type { FieldmapConstants } from "../config/fieldmap.js";
import type { Layout, LayoutVersion, Split } from "../model/types.js";

export function parseLayouts(text: string): { tableLabel: string; layouts: Layout[] } {
  const raw = JSON.parse(text) as {
    layouts_table_label: string;
    layouts: Record<string, unknown>[];
  };
  return {
    tableLabel: raw.layouts_table_label,
    layouts: raw.layouts.map((l) => ({
      id: String(l.id),
      name: String(l.name),
      width: Number(l.width),
      height: Number(l.height),
      borderWidth: l.border_width === undefined ? 2 : Number(l.border_width),
      borderHeight: l.border_height === undefined ? 2 : Number(l.border_height),
      primaryTileset: String(l.primary_tileset),
      secondaryTileset: String(l.secondary_tileset),
      borderFilepath: String(l.border_filepath),
      blockdataFilepath: String(l.blockdata_filepath),
      layoutVersion: l.layout_version as LayoutVersion | undefined,
    })),
  };
}

/**
 * Invariant I1. Every render, validate and write path takes its boundary from
 * here and never from an ambient constant.
 *
 * A layout with no `layout_version` resolves to emerald, matching the
 * `default:` branch of the engine's GetNumMetatilesInPrimary().
 */
const KNOWN_VERSIONS: readonly LayoutVersion[] = ["emerald", "frlg", "hns"];

export function resolveSplit(layout: Pick<Layout, "layoutVersion">, c: FieldmapConstants): Split {
  const raw = layout.layoutVersion;

  // A MISSING key defaults to emerald -- that is the engine's own `default:`
  // branch, not a guess. An UNRECOGNISED VALUE is a different thing entirely
  // and must not be guessed at: the ternary below would send it down the
  // non-emerald path and hand back 640 purely by accident of the comparison,
  // with nothing to signal that a boundary had been invented. A wrong boundary
  // corrupts map.bin on save, so refuse instead (invariant I7).
  if (raw !== undefined && !KNOWN_VERSIONS.includes(raw)) {
    throw new Error(
      `unknown layout_version ${JSON.stringify(raw)}; ` +
      `expected one of ${KNOWN_VERSIONS.join(", ")}. ` +
      `Add its boundary to resolveSplit rather than letting it default.`,
    );
  }

  const version: LayoutVersion = raw ?? "emerald";
  return version === "emerald"
    ? { version, tiles: c.tilesInPrimaryEmerald, metatiles: c.metatilesInPrimaryEmerald, pals: c.palsInPrimaryEmerald }
    : { version, tiles: c.tilesInPrimary, metatiles: c.metatilesInPrimary, pals: c.palsInPrimary };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/core/test/load/layouts.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/model/types.ts packages/core/src/load/layouts.ts packages/core/test/load/layouts.test.ts
git commit -m "feat(core): load layouts and resolve the per-layout metatile split"
```

---

## Task 6: Map groups and map headers

**Files:**
- Create: `packages/core/src/load/maps.ts`
- Test: `packages/core/test/load/maps.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMapGroups, parseMap } from "../../src/load/maps.js";
import { projectPaths } from "../../src/config/paths.js";
import { SUBJECT_ROOT, itWithCorpus, referenceRoot } from "../helpers/corpus.js";

const P = projectPaths(SUBJECT_ROOT);

describe("parseMapGroups", () => {
  itWithCorpus("reads group order and membership", () => {
    const g = parseMapGroups(readFileSync(P.mapGroupsJson, "utf8"));
    expect(g.groupOrder[0]).toBe("gMapGroup_TownsAndRoutes");
    expect(g.groupOrder).toHaveLength(28);
    expect(g.allMapNames()).toContain("NewBarkTown");
    expect(g.allMapNames().length).toBe(1209);
  });
});

describe("parseMap", () => {
  itWithCorpus("reads NewBarkTown's header, connections and events", () => {
    const m = parseMap(readFileSync(P.mapJson("NewBarkTown"), "utf8"));
    expect(m.id).toBe("MAP_NEW_BARK_TOWN");
    expect(m.layout).toBe("LAYOUT_NEW_BARK_TOWN");
    expect(m.mapType).toBe("MAP_TYPE_TOWN");
    expect(m.connections.map((c) => c.direction).sort()).toEqual(["left", "right"]);
    expect(m.connections.find((c) => c.direction === "left")).toMatchObject({ map: "MAP_ROUTE29", offset: -5 });
    expect(m.objectEvents.length).toBeGreaterThan(0);
  });

  itWithCorpus("preserves species object events verbatim", () => {
    const m = parseMap(readFileSync(P.mapJson("CeladonCity"), "utf8"));
    const sign = m.objectEvents.find((o) => o.graphicsId.startsWith("OBJ_EVENT_GFX_SPECIES"));
    expect(sign).toMatchObject({
      graphicsId: "OBJ_EVENT_GFX_SPECIES(POLIWRATH)",
      x: 36, y: 14, elevation: 3,
      script: "CeladonCity_EventScript_Poliwrath",
    });
  });

  const frlg = referenceRoot("pokefirered");
  it.skipIf(!frlg)("reads a firered map, and finds one carrying floor_number", () => {
    const fp = projectPaths(frlg!);
    const groups = parseMapGroups(readFileSync(fp.mapGroupsJson, "utf8"));
    const names = groups.allMapNames();
    expect(names.length).toBeGreaterThan(0);
    expect(parseMap(readFileSync(fp.mapJson(names[0]!), "utf8")).id).toMatch(/^MAP_/);

    // floor_number is FireRed-only. Prove the parser surfaces it rather than
    // dropping it -- at least one FRLG map has it, and asserting that is what
    // makes this a portability test instead of a smoke test.
    const withFloor = names
      .map((n) => parseMap(readFileSync(fp.mapJson(n), "utf8")))
      .filter((m) => m.floorNumber !== undefined);
    expect(withFloor.length).toBeGreaterThan(0);
  });

  itWithCorpus("leaves floorNumber undefined on an engine that has no such key", () => {
    // The positive assertion above passes even against an implementation that
    // hardcodes a floorNumber, since all 425 FireRed maps carry the key. Only
    // the negative case proves the value is read rather than invented -- the
    // same discipline the layouts suite applies to layout_version.
    const m = parseMap(readFileSync(P.mapJson("NewBarkTown"), "utf8"));
    expect(m.floorNumber).toBeUndefined();
    expect(m.region).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/load/maps.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/load/maps.ts
export type ConnectionDirection = "up" | "down" | "left" | "right" | "dive" | "emerge";

export interface Connection { map: string; offset: number; direction: ConnectionDirection; }

export interface ObjectEvent {
  graphicsId: string; x: number; y: number; elevation: number;
  movementType: string; movementRangeX: number; movementRangeY: number;
  trainerType: string; trainerSightOrBerryTreeId: string;
  script: string; flag: string;
}

export interface WarpEvent { x: number; y: number; elevation: number; destMap: string; destWarpId: string; }
export interface CoordEvent { type?: string; x: number; y: number; elevation: number; [k: string]: unknown; }
export interface BgEvent { type: string; x: number; y: number; elevation: number; [k: string]: unknown; }

export interface MapData {
  id: string; name: string; layout: string; music: string;
  regionMapSection: string; mapType: string; weather: string;
  floorNumber?: number; region?: string;
  connections: Connection[];
  objectEvents: ObjectEvent[];
  warpEvents: WarpEvent[];
  coordEvents: CoordEvent[];
  bgEvents: BgEvent[];
}

export interface MapGroups {
  groupOrder: string[];
  groups: Record<string, string[]>;
  allMapNames(): string[];
}

export function parseMapGroups(text: string): MapGroups {
  const raw = JSON.parse(text) as Record<string, unknown>;
  const groupOrder = raw.group_order;
  // Every one of the six target trees has this key. Without the check, a fork
  // that named it differently would fail as a bare "undefined is not iterable"
  // naming no file and no cause -- the opposite of invariant I7's "refuse and
  // say what to fix".
  if (!Array.isArray(groupOrder)) {
    throw new Error("map_groups.json has no `group_order` array; cannot enumerate maps");
  }
  const groups: Record<string, string[]> = {};
  for (const g of groupOrder) groups[g] = (raw[g] as string[]) ?? [];
  return { groupOrder, groups, allMapNames: () => groupOrder.flatMap((g) => groups[g] ?? []) };
}

export function parseMap(text: string): MapData {
  const r = JSON.parse(text) as Record<string, any>;
  return {
    id: r.id, name: r.name, layout: r.layout, music: r.music,
    regionMapSection: r.region_map_section, mapType: r.map_type, weather: r.weather,
    floorNumber: r.floor_number, region: r.region,
    connections: (r.connections ?? []).map((c: any) => ({ map: c.map, offset: Number(c.offset), direction: c.direction })),
    objectEvents: (r.object_events ?? []).map((o: any) => ({
      graphicsId: o.graphics_id, x: Number(o.x), y: Number(o.y), elevation: Number(o.elevation),
      movementType: o.movement_type, movementRangeX: Number(o.movement_range_x), movementRangeY: Number(o.movement_range_y),
      trainerType: o.trainer_type, trainerSightOrBerryTreeId: String(o.trainer_sight_or_berry_tree_id),
      script: o.script, flag: String(o.flag),
    })),
    warpEvents: (r.warp_events ?? []).map((w: any) => ({
      x: Number(w.x), y: Number(w.y), elevation: Number(w.elevation),
      destMap: w.dest_map, destWarpId: String(w.dest_warp_id),
    })),
    coordEvents: r.coord_events ?? [],
    bgEvents: r.bg_events ?? [],
  };
}
```

**Note on `parseMap`:** this is a *reading* projection. It deliberately drops keys it does not model. Nothing in this codebase ever writes a `MapData` back out by serialising it — writes go through `write/jsonEdit.ts` (Task 18), which splices the original text. This separation is invariant **I2**, and it is the reason Porymap 6's failure cannot recur here.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/load/maps.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/load/maps.ts packages/core/test/load/maps.test.ts
git commit -m "feat(core): load map groups and map headers across engines"
```

---

## Task 7: Tileset path resolution from INCBIN

Invariant **I4**. Never mangle a symbol into a directory name.

This is not hypothetical caution. Measured against the tree: **22 of its 242 tilesets have a directory no naming rule could produce**, and `gTileset_TrainerHill_Courtyard` → `battle_tower_outer` is not a mangling at all — it is a different name.

Worse, the relation is **many-to-one**, so no function from symbol to path can exist regardless of how clever the rule is. Nine symbols share `primary/building` (`gTileset_Building` plus the eight Frontier facilities) and six share `secondary/secret_base`. The subject repo's own `rules.md` records a mangling attempt getting this wrong before. The mapping is data; read it.

**A tileset's art does not always live beside its metatiles.** `.tiles` and
`.metatiles` are separate fields pointing at separate INCBIN paths, and for **15
of the 242 tilesets they are in different directories** — `gTileset_Building_Frontier`
has metatiles in `primary/building` but art in `primary/building_frontier`.
Deriving the `tiles.png` path from the metatiles directory sends **93 layouts** to
another tileset's art, and for the eight `Building_*` cases a `tiles.png` exists
at the wrong path too, so nothing errors: the map simply renders wrong. Resolve
each field from its own INCBIN entry.

**Palette declarations are split across two files.** `gTileset_General`,
`gTileset_General_Frontier_East` and `gTileset_General_Frontier_West` declare
their palettes in `src/graphics.c`, not `src/data/tilesets/graphics.h`. Reading
only the header gives those three an empty palette array — and since
`gTileset_General` is the primary tileset for 240 layouts, **242 of 1,020
layouts would render every pixel transparent.** Nothing would throw; the maps
would simply come out blank. Both files must be read.

**Files:**
- Create: `packages/core/src/load/tilesets.ts`
- Test: `packages/core/test/load/tilesets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { parseTilesetPaths } from "../../src/load/tilesets.js";
import { projectPaths } from "../../src/config/paths.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const P = projectPaths(SUBJECT_ROOT);
const read = () => parseTilesetPaths(
  readFileSync(P.tilesetHeadersH, "utf8"),
  readFileSync(P.tilesetMetatilesH, "utf8"),
  [readFileSync(P.tilesetGraphicsH, "utf8"), readFileSync(P.tilesetGraphicsC, "utf8")],
);

describe("parseTilesetPaths", () => {
  itWithCorpus("resolves gTileset_General to the primary/general directory", () => {
    const t = read().get("gTileset_General")!;
    expect(t.metatilesBin).toBe("data/tilesets/primary/general/metatiles.bin");
    expect(t.attributesBin).toBe("data/tilesets/primary/general/metatile_attributes.bin");
    expect(t.dir).toBe("data/tilesets/primary/general");
    expect(t.isSecondary).toBe(false);
    // Declared in src/graphics.c, not graphics.h. Reading only the header
    // leaves this empty and every map using General renders transparent.
    expect(t.palettes).toHaveLength(16);
    expect(t.palettes[0]).toBe("data/tilesets/primary/general/palettes/00.gbapal");
  });

  itWithCorpus("resolves tilesPng from .tiles, not from the metatiles directory", () => {
    // 15 tilesets keep their art in a different directory from their metatiles.
    // Deriving one from the other renders 93 layouts with another tileset's
    // art -- and for the Building_* cases a tiles.png exists at the wrong path
    // too, so there is no error to notice, just a wrong map.
    const t = read();
    expect(t.get("gTileset_Building_Frontier")!.tilesPng)
      .toBe("data/tilesets/primary/building_frontier/tiles.png");
    expect(t.get("gTileset_Building_Frontier")!.dir)
      .toBe("data/tilesets/primary/building");
    // Nested one level deeper than its metatiles, not a sibling directory --
    // secondary/secret_base/tree, not secondary/tree.
    expect(t.get("gTileset_SecretBaseTree")!.tilesPng)
      .toBe("data/tilesets/secondary/secret_base/tree/tiles.png");
    expect(t.get("gTileset_FrlgSilphCo")!.tilesPng)
      .toBe("data/tilesets/secondary/condominiums/tiles.png");
    // And the ordinary case still agrees with dir.
    expect(t.get("gTileset_Petalburg")!.tilesPng)
      .toBe("data/tilesets/secondary/petalburg/tiles.png");
  });

  itWithCorpus("every tilesPng a layout depends on actually exists on disk", () => {
    // The guard for this whole class: a path that is merely plausible resolves
    // silently. Only the filesystem settles it.
    const t = read();
    const { layouts } = JSON.parse(readFileSync(P.layoutsJson, "utf8")) as { layouts: any[] };
    const named = new Set(layouts.flatMap((l) => [l.primary_tileset, l.secondary_tileset]));
    const missing = [...named].filter((k) => {
      const png = t.get(k)?.tilesPng;
      return !png || !existsSync(`${SUBJECT_ROOT}/${png}`);
    });
    expect(missing).toEqual([]);
  });

  itWithCorpus("every tileset layouts.json names resolves a non-empty palette list", () => {
    // The blank-render trap, pinned. An empty palettes array throws nothing --
    // it renders a fully transparent map, which no "does it throw" test catches.
    const t = read();
    const { layouts } = JSON.parse(readFileSync(P.layoutsJson, "utf8")) as { layouts: any[] };
    const named = new Set(layouts.flatMap((l) => [l.primary_tileset, l.secondary_tileset]));
    const empty = [...named].filter((k) => (t.get(k)?.palettes.length ?? 0) === 0);
    expect(empty).toEqual([]);
  });

  itWithCorpus("resolves a secondary tileset and its palette list", () => {
    const t = read().get("gTileset_Petalburg")!;
    expect(t.dir).toBe("data/tilesets/secondary/petalburg");
    expect(t.isSecondary).toBe(true);
    expect(t.palettes).toHaveLength(16);
    expect(t.palettes[0]).toBe("data/tilesets/secondary/petalburg/palettes/00.gbapal");
  });

  itWithCorpus("resolves tilesets no name-mangling scheme could reach", () => {
    // 22 of this tree's 242 tilesets have a directory that cannot be derived
    // from the symbol by any rule. This is the proof of invariant I4: the
    // mapping is DATA, read from INCBIN, not a transformation of the name.
    const t = read();
    // Nothing about "TrainerHill_Courtyard" suggests "battle_tower_outer".
    expect(t.get("gTileset_TrainerHill_Courtyard")!.dir).toBe("data/tilesets/secondary/battle_tower_outer");
    // Directories that drop or rewrite words the symbol carries.
    expect(t.get("gTileset_GoldenrodCity_TrainStation")!.dir).toBe("data/tilesets/secondary/goldenrod_station");
    expect(t.get("gTileset_SaffronCity_FightingDojoVIP")!.dir).toBe("data/tilesets/secondary/saffron_city_dojo_vip");
    expect(t.get("gTileset_SSAnne")!.dir).toBe("data/tilesets/secondary/ss_anne");
    expect(t.get("gTileset_RuinsOfAlph_B1F")!.dir).toBe("data/tilesets/secondary/ruins_of_alph_b1_f");
  });

  itWithCorpus("handles the many-to-one case that makes mangling impossible in principle", () => {
    // NINE symbols share one directory, and six share another. No function
    // from symbol to path can produce that, however the rule is written --
    // which is why the mapping has to be read rather than derived.
    const t = read();
    const byDir = new Map<string, string[]>();
    for (const [symbol, paths] of t) {
      (byDir.get(paths.dir) ?? byDir.set(paths.dir, []).get(paths.dir)!).push(symbol);
    }
    expect(byDir.get("data/tilesets/primary/building")).toHaveLength(9);
    expect(byDir.get("data/tilesets/secondary/secret_base")).toHaveLength(6);
    expect(t.get("gTileset_Building")!.dir).toBe("data/tilesets/primary/building");
    expect(t.get("gTileset_Building_Pyramid")!.dir).toBe("data/tilesets/primary/building");
  });

  itWithCorpus("parses every Tileset struct in headers.h", () => {
    // 242 today. A regex that silently stopped matching some of them would
    // still satisfy the coverage test below, since layouts.json names only a
    // subset -- so pin the total independently.
    expect(read().size).toBe(242);
  });

  itWithCorpus("covers every tileset named by layouts.json", () => {
    const paths = read();
    const { layouts } = JSON.parse(readFileSync(P.layoutsJson, "utf8")) as { layouts: any[] };
    const missing = new Set<string>();
    for (const l of layouts) {
      for (const k of [l.primary_tileset, l.secondary_tileset]) if (!paths.has(k)) missing.add(k);
    }
    expect([...missing]).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/load/tilesets.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/load/tilesets.ts
export interface TilesetPaths {
  symbol: string;
  /** The directory of `.metatiles` and `.metatileAttributes` ONLY. The art and
   *  palettes can live elsewhere, so never build another path from this. */
  dir: string;
  isSecondary: boolean;
  metatilesBin: string;
  attributesBin: string;
  /** Resolved from the `.tiles` field's own INCBIN path, which is NOT always in
   *  `dir` -- 15 tilesets differ. The INCBIN names `tiles.4bpp.lz`, a gitignored
   *  build artifact (I3); its directory is right, the filename is not. */
  tilesPng: string;
  /** .gbapal paths as INCBINed; the .pal sibling is the committed source (I3). */
  palettes: string[];
}

/**
 * `const u16 gMetatiles_General[] = INCBIN_U16("data/.../metatiles.bin");`
 *
 * The character class must admit parentheses. Palette declarations are written
 * `const u16 ALIGNED(4) gTilesetPalettes_Petalburg[][16] = ...`, and a class of
 * `[\w\s*]` cannot step past `ALIGNED(` to reach the symbol -- which silently
 * drops 148 of graphics.h's 494 declarations, every one of them a palette list.
 */
function incbinMap(src: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re = /const\s+[\w\s*()]+?\b(g\w+)\s*(?:\[\s*\]|\[\s*\]\s*\[\s*\d+\s*\])\s*=\s*([\s\S]*?);/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const paths = [...m[2]!.matchAll(/INCBIN_\w+\(\s*"([^"]+)"\s*\)/g)].map((p) => p[1]!);
    if (paths.length) out.set(m[1]!, paths);
  }
  return out;
}

/**
 * Bind gTileset_X to its data symbols through headers.h — the authoritative
 * link — then resolve those symbols to paths through metatiles.h and
 * graphics.h. Directory names are never derived from symbol names (I4).
 */
export function parseTilesetPaths(
  headersH: string, metatilesH: string, graphicsSources: string | string[],
): Map<string, TilesetPaths> {
  const graphics = Array.isArray(graphicsSources) ? graphicsSources : [graphicsSources];
  const data = new Map([
    ...incbinMap(metatilesH),
    ...graphics.flatMap((g) => [...incbinMap(g)]),
  ]);
  const out = new Map<string, TilesetPaths>();

  const structRe = /const\s+struct\s+Tileset\s+(g\w+)\s*=\s*\{([\s\S]*?)\n\};/g;
  for (let m = structRe.exec(headersH); m; m = structRe.exec(headersH)) {
    const [symbol, body] = [m[1]!, m[2]!];
    const field = (name: string) => new RegExp(`\\.${name}\\s*=\\s*(\\w+)`).exec(body)?.[1];

    const metatilesBin = data.get(field("metatiles") ?? "")?.[0];
    const attributesBin = data.get(field("metatileAttributes") ?? "")?.[0];
    const tilesBin = data.get(field("tiles") ?? "")?.[0];
    const palettes = data.get(field("palettes") ?? "") ?? [];
    if (!metatilesBin || !attributesBin) continue;

    const dirOf = (p: string) => p.slice(0, p.lastIndexOf("/"));
    const dir = dirOf(metatilesBin);
    out.set(symbol, {
      symbol, dir,
      isSecondary: /\.isSecondary\s*=\s*TRUE/.test(body),
      metatilesBin, attributesBin,
      // From `.tiles`, not from `dir`. They differ for 15 tilesets, and eight
      // of those have a tiles.png at the wrong path too, so getting this wrong
      // renders another tileset's art with no error at all.
      tilesPng: `${tilesBin ? dirOf(tilesBin) : dir}/tiles.png`,
      palettes,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/load/tilesets.test.ts`
Expected: PASS, 9 tests. If the "covers every tileset" test reports missing symbols, the `headers.h` struct regex needs widening — fix it rather than adding a fallback mangler.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/load/tilesets.ts packages/core/test/load/tilesets.test.ts
git commit -m "feat(core): resolve tileset directories through INCBIN, never by name mangling"
```

---

## Task 8: JASC-PAL parser

**Files:**
- Create: `packages/core/src/load/pal.ts`
- Test: `packages/core/test/load/pal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { parseJascPal } from "../../src/load/pal.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

describe("parseJascPal", () => {
  it("parses a 16-colour JASC palette", () => {
    const pal = parseJascPal("JASC-PAL\r\n0100\r\n16\r\n24 41 82\r\n255 255 255\r\n" + "0 0 0\r\n".repeat(14));
    expect(pal).toHaveLength(16);
    expect(pal[0]).toEqual({ r: 24, g: 41, b: 82 });
    expect(pal[1]).toEqual({ r: 255, g: 255, b: 255 });
  });

  itWithCorpus("parses the subject repo's real palette", () => {
    const pal = parseJascPal(readFileSync(
      `${SUBJECT_ROOT}/data/tilesets/primary/general/palettes/00.pal`, "utf8"));
    expect(pal).toHaveLength(16);
    // Real values. `every(c => c.r <= 255)` would pass against a parser that
    // returned sixteen blacks, which is exactly what the `?? 0` fallback
    // produces on a line it fails to read.
    expect(pal[0]).toEqual({ r: 24, g: 41, b: 82 });
    expect(pal[1]).toEqual({ r: 255, g: 255, b: 255 });
    expect(pal[2]).toEqual({ r: 222, g: 230, b: 238 });
    expect(new Set(pal.map((c) => `${c.r},${c.g},${c.b}`)).size).toBe(15);
  });

  itWithCorpus("reads every .pal in the tree, honouring each declared count", () => {
    // 3,724 files. Almost all declare 16 colours, but one declares 10 and one
    // declares 15 -- so the count is read from the file, never assumed.
    const dir = `${SUBJECT_ROOT}/data/tilesets`;
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith(".pal") ? [`${d}/${e.name}`] : []);

    const files = walk(dir);
    expect(files.length).toBe(3724);

    const sizes = new Map<number, number>();
    for (const f of files) {
      const pal = parseJascPal(readFileSync(f, "utf8"));
      sizes.set(pal.length, (sizes.get(pal.length) ?? 0) + 1);
    }
    expect(sizes.get(16)).toBe(3722);
    expect(sizes.get(15)).toBe(1);
    expect(sizes.get(10)).toBe(1);
  }, 120_000);

  it("rejects a file that is not JASC-PAL", () => {
    expect(() => parseJascPal("RIFF...")).toThrow(/JASC-PAL/);
  });

  it("refuses a malformed colour line rather than silently calling it black", () => {
    // `parts[0] ?? 0` would turn "24 41" into {24,41,0} -- a plausible colour
    // that is simply wrong, and indistinguishable from a real dark blue.
    const short = "JASC-PAL\r\n0100\r\n2\r\n24 41\r\n255 255 255\r\n";
    expect(() => parseJascPal(short)).toThrow(/malformed/i);
  });

  it("refuses a file with fewer colour lines than it declares", () => {
    const truncated = "JASC-PAL\r\n0100\r\n4\r\n1 2 3\r\n4 5 6\r\n";
    expect(() => parseJascPal(truncated)).toThrow(/declares 4/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/load/pal.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/load/pal.ts
import type { RGB } from "../model/types.js";

/**
 * JASC-PAL is the committed source for tileset palettes. The sibling .gbapal
 * is a gitignored build artifact and must not be the only source (I3).
 */
export function parseJascPal(text: string): RGB[] {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "JASC-PAL") throw new Error("not a JASC-PAL file");

  // Read the declared count; do not assume 16. Of this tree's 3,724 palettes,
  // one declares 10 and one declares 15.
  const count = Number(lines[2]);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`JASC-PAL header declares a bad colour count: ${JSON.stringify(lines[2])}`);
  }

  const out: RGB[] = [];
  for (let i = 0; i < count; i++) {
    const raw = lines[3 + i];
    if (raw === undefined || raw.trim() === "") {
      throw new Error(`JASC-PAL declares ${count} colours but has only ${i}`);
    }
    const parts = raw.trim().split(/\s+/).map(Number);
    // Refusing beats `?? 0`, which turns "24 41" into a plausible dark blue
    // that is simply wrong and looks like real data downstream (I7).
    if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      throw new Error(`JASC-PAL colour ${i} is malformed: ${JSON.stringify(raw)}`);
    }
    out.push({ r: parts[0]!, g: parts[1]!, b: parts[2]! });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/load/pal.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/load/pal.ts packages/core/test/load/pal.test.ts
git commit -m "feat(core): parse JASC-PAL tileset palettes"
```

---

## Task 9: Indexed PNG reader

`tiles.png` appears at **both** bit depth 4 (`secondary/petalburg`) and bit depth 8 (`primary/general`), always colour type 3, never interlaced. Owning ~120 lines here removes a dependency whose 4-bit support is uncertain.

**Files:**
- Create: `packages/core/src/load/png.ts`
- Test: `packages/core/test/load/png.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readIndexedPng } from "../../src/load/png.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const G = SUBJECT_ROOT;

describe("readIndexedPng", () => {
  itWithCorpus("reads a depth-8 indexed PNG (primary/general tiles)", () => {
    const img = readIndexedPng(readFileSync(`${G}/data/tilesets/primary/general/tiles.png`));
    expect(img.width).toBe(128);
    expect(img.height).toBe(256);
    expect(img.indices).toHaveLength(128 * 256);
    expect(Math.max(...img.indices)).toBeLessThanOrEqual(15);
  });

  itWithCorpus("reads a depth-4 indexed PNG (secondary/petalburg tiles)", () => {
    const img = readIndexedPng(readFileSync(`${G}/data/tilesets/secondary/petalburg/tiles.png`));
    expect(img.width).toBe(128);
    expect(img.height).toBe(80);
    expect(img.indices).toHaveLength(128 * 80);
    expect(Math.max(...img.indices)).toBeLessThanOrEqual(15);
  });

  itWithCorpus("reads a mon overworld sprite", () => {
    const img = readIndexedPng(readFileSync(`${G}/graphics/object_events/pics/pokemon/espeon.png`));
    expect([img.width, img.height]).toEqual([192, 32]);
  });

  itWithCorpus("throws a clear error on an unsupported colour type", () => {
    const truecolour = Buffer.from(readFileSync(`${G}/data/tilesets/primary/general/tiles.png`));
    truecolour[25] = 6; // colourType 6
    expect(() => readIndexedPng(truecolour)).toThrow(/colour type/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/load/png.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/load/png.ts
import { inflateSync } from "node:zlib";
import type { RGB } from "../model/types.js";

export interface IndexedImage {
  width: number;
  height: number;
  /** One palette index per pixel, row-major. */
  indices: Uint8Array;
  /** The PLTE chunk, for reference. Tileset rendering uses .pal files instead. */
  palette: RGB[];
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function readIndexedPng(buf: Buffer): IndexedImage {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const depth = buf[24]!;
  const colourType = buf[25]!;
  const interlace = buf[28]!;

  if (colourType !== 3) throw new Error(`unsupported PNG colour type ${colourType}; expected 3 (indexed)`);
  if (interlace !== 0) throw new Error("interlaced PNGs are not supported");
  if (depth !== 4 && depth !== 8) throw new Error(`unsupported PNG bit depth ${depth}; expected 4 or 8`);

  const palette: RGB[] = [];
  const idat: Buffer[] = [];
  for (let off = 8; off + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "PLTE") for (let i = 0; i + 2 < data.length; i += 3) palette.push({ r: data[i]!, g: data[i + 1]!, b: data[i + 2]! });
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const bytesPerRow = Math.ceil((width * depth) / 8);
  const unfiltered = Buffer.alloc(bytesPerRow * height);

  // bpp is 1 for both supported depths (sub-byte samples filter as 1 byte).
  const bpp = 1;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (bytesPerRow + 1)]!;
    const src = raw.subarray(y * (bytesPerRow + 1) + 1, (y + 1) * (bytesPerRow + 1));
    const dst = unfiltered.subarray(y * bytesPerRow, (y + 1) * bytesPerRow);
    const prev = y === 0 ? null : unfiltered.subarray((y - 1) * bytesPerRow, y * bytesPerRow);
    for (let x = 0; x < bytesPerRow; x++) {
      const a = x >= bpp ? dst[x - bpp]! : 0;
      const b = prev ? prev[x]! : 0;
      const c = prev && x >= bpp ? prev[x - bpp]! : 0;
      const v = src[x]!;
      dst[x] =
        filter === 0 ? v :
        filter === 1 ? (v + a) & 0xff :
        filter === 2 ? (v + b) & 0xff :
        filter === 3 ? (v + ((a + b) >> 1)) & 0xff :
        filter === 4 ? (v + paeth(a, b, c)) & 0xff :
        (() => { throw new Error(`unknown PNG filter ${filter} on row ${y}`); })();
    }
  }

  const indices = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (depth === 8) indices[y * width + x] = unfiltered[y * bytesPerRow + x]!;
      else {
        const byte = unfiltered[y * bytesPerRow + (x >> 1)]!;
        indices[y * width + x] = (x & 1) === 0 ? byte >> 4 : byte & 0x0f;
      }
    }
  }

  return { width, height, indices, palette };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/load/png.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/load/png.ts packages/core/test/load/png.test.ts
git commit -m "feat(core): read indexed PNGs at bit depth 4 and 8 without a dependency"
```

---

## Task 10: Tileset data

**Files:**
- Create: `packages/core/src/load/tilesetData.ts`
- Test: `packages/core/test/load/tilesetData.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { loadTileset } from "../../src/load/tilesetData.js";
import { parseTilesetPaths } from "../../src/load/tilesets.js";
import { projectPaths } from "../../src/config/paths.js";
import { defaultProfile } from "../../src/config/engine.js";
import { readFileSync } from "node:fs";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const P = projectPaths(SUBJECT_ROOT);
const PATHS = parseTilesetPaths(
  readFileSync(P.tilesetHeadersH, "utf8"),
  readFileSync(P.tilesetMetatilesH, "utf8"),
  readFileSync(P.tilesetGraphicsH, "utf8"),
);
const PROFILE = defaultProfile("pokeemerald");

describe("loadTileset", () => {
  itWithCorpus("loads gTileset_General with its real metatile count", () => {
    const t = loadTileset(P, PATHS.get("gTileset_General")!, PROFILE);
    expect(t.metatileCount).toBe(512);
    expect(t.attributes).toHaveLength(512);
    expect(t.tiles.width).toBe(128);
    expect(t.palettes.length).toBe(16);
    expect(t.palettes[0]).toHaveLength(16);
  });

  itWithCorpus("loads a secondary tileset", () => {
    const t = loadTileset(P, PATHS.get("gTileset_Petalburg")!, PROFILE);
    expect(t.metatileCount).toBe(144);
  });

  itWithCorpus("decodes a metatile's eight tile entries", () => {
    const t = loadTileset(P, PATHS.get("gTileset_General")!, PROFILE);
    const entries = t.metatile(1);
    expect(entries).toHaveLength(8);
    for (const e of entries) {
      expect(e.tile).toBeLessThanOrEqual(0x3ff);
      expect(e.palette).toBeLessThanOrEqual(15);
    }
  });

  itWithCorpus("exposes layer type from attributes", () => {
    const t = loadTileset(P, PATHS.get("gTileset_General")!, PROFILE);
    expect(t.layerType(1)).toBeGreaterThanOrEqual(0);
    expect(t.layerType(1)).toBeLessThanOrEqual(15);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/load/tilesetData.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/load/tilesetData.ts
import { readFileSync } from "node:fs";
import type { EngineProfile } from "../config/engine.js";
import type { ProjectPaths } from "../config/paths.js";
import type { TilesetPaths } from "./tilesets.js";
import { readIndexedPng, type IndexedImage } from "./png.js";
import { parseJascPal } from "./pal.js";
import type { RGB } from "../model/types.js";

export interface TileEntry { tile: number; xFlip: boolean; yFlip: boolean; palette: number; }

export interface Tileset {
  symbol: string;
  isSecondary: boolean;
  metatileCount: number;
  tiles: IndexedImage;
  palettes: RGB[][];
  attributes: number[];
  metatile(id: number): TileEntry[];
  layerType(id: number): number;
  behavior(id: number): number;
}

const TILES_PER_METATILE = 8;

export function loadTileset(paths: ProjectPaths, tp: TilesetPaths, profile: EngineProfile): Tileset {
  const abs = (rel: string) => `${paths.root}/${rel}`;

  const metatilesBuf = readFileSync(abs(tp.metatilesBin));
  const metatileCount = metatilesBuf.length / (TILES_PER_METATILE * 2);

  const attrBuf = readFileSync(abs(tp.attributesBin));
  const size = profile.metatileAttributesSize;
  const attributes: number[] = [];
  for (let i = 0; i + size <= attrBuf.length; i += size) {
    attributes.push(size === 2 ? attrBuf.readUInt16LE(i) : attrBuf.readUInt32LE(i));
  }

  const tiles = readIndexedPng(readFileSync(abs(tp.tilesPng)));

  // I3: read the committed .pal, not the gitignored .gbapal that graphics.h INCBINs.
  const palettes = tp.palettes.map((g) => parseJascPal(readFileSync(abs(g.replace(/\.gbapal$/, ".pal")), "utf8")));

  const layerShift = profile.metatileLayerTypeMask === 0 ? 0 :
    (() => { let s = 0; while (((profile.metatileLayerTypeMask >>> s) & 1) === 0) s++; return s; })();

  return {
    symbol: tp.symbol,
    isSecondary: tp.isSecondary,
    metatileCount,
    tiles,
    palettes,
    attributes,
    metatile(id) {
      const base = id * TILES_PER_METATILE * 2;
      const out: TileEntry[] = [];
      for (let i = 0; i < TILES_PER_METATILE; i++) {
        const e = metatilesBuf.readUInt16LE(base + i * 2);
        out.push({ tile: e & 0x3ff, xFlip: !!((e >> 10) & 1), yFlip: !!((e >> 11) & 1), palette: (e >> 12) & 0x0f });
      }
      return out;
    },
    layerType: (id) => ((attributes[id] ?? 0) & profile.metatileLayerTypeMask) >>> layerShift,
    behavior: (id) => (attributes[id] ?? 0) & profile.metatileBehaviorMask,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/load/tilesetData.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/load/tilesetData.ts packages/core/test/load/tilesetData.test.ts
git commit -m "feat(core): load tileset metatiles, attributes, tiles and palettes"
```

---

## Task 11: Blockdata

**Files:**
- Create: `packages/core/src/load/blocks.ts`
- Test: `packages/core/test/load/blocks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseBlocks } from "../../src/load/blocks.js";
import { defaultProfile } from "../../src/config/engine.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const PROFILE = defaultProfile("pokeemerald");
const G = SUBJECT_ROOT;

describe("parseBlocks", () => {
  it("decodes id, collision and elevation from a u16", () => {
    const buf = Buffer.alloc(2);
    // elevation 3 (0x3000), collision 1 (0x0400), id 0x123
    buf.writeUInt16LE(0x3000 | 0x0400 | 0x123, 0);
    const [b] = parseBlocks(buf, PROFILE);
    expect(b).toEqual({ metatileId: 0x123, collision: 1, elevation: 3 });
  });

  itWithCorpus("reads NewBarkTown's real map.bin", () => {
    const blocks = parseBlocks(readFileSync(`${G}/data/layouts/NewBarkTown/map.bin`), PROFILE);
    expect(blocks).toHaveLength(1170);
    expect(blocks.every((b) => b.metatileId <= 0x3ff)).toBe(true);
    expect(blocks.every((b) => b.elevation <= 15)).toBe(true);
  });

  itWithCorpus("block count equals width * height for every layout", () => {
    const { layouts } = JSON.parse(readFileSync(`${G}/data/layouts/layouts.json`, "utf8")) as { layouts: any[] };
    const bad: string[] = [];
    for (const l of layouts) {
      const buf = readFileSync(`${G}/${l.blockdata_filepath}`);
      if (buf.length / 2 !== l.width * l.height) bad.push(l.name);
    }
    expect(bad).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/load/blocks.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/load/blocks.ts
import type { EngineProfile } from "../config/engine.js";
import type { Block } from "../model/types.js";

export function parseBlocks(buf: Buffer, p: EngineProfile): Block[] {
  const out: Block[] = new Array(buf.length >> 1);
  for (let i = 0; i < out.length; i++) {
    const v = buf.readUInt16LE(i * 2);
    out[i] = {
      metatileId: v & p.blockMetatileIdMask,
      collision: (v & p.blockCollisionMask) >>> p.blockCollisionShift,
      elevation: (v & p.blockElevationMask) >>> p.blockElevationShift,
    };
  }
  return out;
}

export function encodeBlocks(blocks: Block[], p: EngineProfile): Buffer {
  const buf = Buffer.alloc(blocks.length * 2);
  blocks.forEach((b, i) => buf.writeUInt16LE(
    (b.metatileId & p.blockMetatileIdMask) |
    ((b.collision << p.blockCollisionShift) & p.blockCollisionMask) |
    ((b.elevation << p.blockElevationShift) & p.blockElevationMask), i * 2));
  return buf;
}
```

- [ ] **Step 4: Run test to verify it passes, and prove the encoder round-trips**

Add to the test file:

```ts
import { encodeBlocks } from "../../src/load/blocks.js";

it("encodeBlocks is the exact inverse of parseBlocks for every real layout", () => {
  const { layouts } = JSON.parse(readFileSync(`${G}/data/layouts/layouts.json`, "utf8")) as { layouts: any[] };
  for (const l of layouts.slice(0, 50)) {
    const orig = readFileSync(`${G}/${l.blockdata_filepath}`);
    expect(encodeBlocks(parseBlocks(orig, PROFILE), PROFILE).equals(orig)).toBe(true);
  }
});
```

Run: `npx vitest run packages/core/test/load/blocks.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/load/blocks.ts packages/core/test/load/blocks.test.ts
git commit -m "feat(core): decode and encode map.bin blockdata"
```

---

# Phase C — Renderer

## Task 12: RGBA raster primitives

**Files:**
- Create: `packages/core/src/render/raster.ts`
- Test: `packages/core/test/render/raster.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { createRaster, blit, fillRect } from "../../src/render/raster.js";

describe("raster", () => {
  it("creates a transparent RGBA buffer", () => {
    const r = createRaster(4, 2);
    expect(r.width).toBe(4);
    expect(r.height).toBe(2);
    expect(r.data).toHaveLength(4 * 2 * 4);
    expect([...r.data.slice(0, 4)]).toEqual([0, 0, 0, 0]);
  });

  it("blits a source over a destination, skipping transparent pixels", () => {
    const dst = createRaster(2, 1);
    fillRect(dst, 0, 0, 2, 1, { r: 10, g: 20, b: 30, a: 255 });
    const src = createRaster(2, 1);
    src.data.set([99, 0, 0, 255], 0); // opaque red at x=0; x=1 stays transparent
    blit(dst, src, 0, 0);
    expect([...dst.data.slice(0, 4)]).toEqual([99, 0, 0, 255]);
    expect([...dst.data.slice(4, 8)]).toEqual([10, 20, 30, 255]);
  });

  it("clips a blit that runs past the destination edge", () => {
    const dst = createRaster(2, 2);
    const src = createRaster(2, 2);
    src.data.fill(255);
    expect(() => blit(dst, src, 1, 1)).not.toThrow();
    expect([...dst.data.slice(0, 4)]).toEqual([0, 0, 0, 0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/render/raster.test.ts`
Expected: FAIL — cannot find module `raster.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/render/raster.ts
export interface Raster {
  width: number;
  height: number;
  /** RGBA, row-major, 4 bytes per pixel. */
  data: Uint8ClampedArray;
}

export interface RGBA { r: number; g: number; b: number; a: number; }

export function createRaster(width: number, height: number): Raster {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function fillRect(r: Raster, x0: number, y0: number, w: number, h: number, c: RGBA): void {
  for (let y = Math.max(0, y0); y < Math.min(r.height, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(r.width, x0 + w); x++) {
      const i = (y * r.width + x) * 4;
      r.data[i] = c.r; r.data[i + 1] = c.g; r.data[i + 2] = c.b; r.data[i + 3] = c.a;
    }
  }
}

/** Source-over blit. Fully transparent source pixels are skipped. */
export function blit(dst: Raster, src: Raster, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width) continue;
      const si = (y * src.width + x) * 4;
      if (src.data[si + 3] === 0) continue;
      const di = (ty * dst.width + tx) * 4;
      dst.data[di] = src.data[si]!;
      dst.data[di + 1] = src.data[si + 1]!;
      dst.data[di + 2] = src.data[si + 2]!;
      dst.data[di + 3] = src.data[si + 3]!;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/render/raster.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/render/raster.ts packages/core/test/render/raster.test.ts
git commit -m "feat(core): RGBA raster primitives for the renderer"
```

---

## Task 13: Tile and metatile rendering

Where the split is applied. `renderMetatile` takes a `Split` and never reads a global constant — invariant **I1**.

**Files:**
- Create: `packages/core/src/render/tile.ts`
- Create: `packages/core/src/render/metatile.ts`
- Test: `packages/core/test/render/metatile.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderMetatile } from "../../src/render/metatile.js";
import { loadTileset } from "../../src/load/tilesetData.js";
import { parseTilesetPaths } from "../../src/load/tilesets.js";
import { projectPaths } from "../../src/config/paths.js";
import { defaultProfile } from "../../src/config/engine.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const P = projectPaths(SUBJECT_ROOT);
const PROFILE = defaultProfile("pokeemerald");
const PATHS = parseTilesetPaths(
  readFileSync(P.tilesetHeadersH, "utf8"),
  readFileSync(P.tilesetMetatilesH, "utf8"),
  readFileSync(P.tilesetGraphicsH, "utf8"),
);
const primary = loadTileset(P, PATHS.get("gTileset_General")!, PROFILE);
const secondary = loadTileset(P, PATHS.get("gTileset_Petalburg")!, PROFILE);

const EMERALD = { version: "emerald", tiles: 512, metatiles: 512, pals: 6 } as const;
const HNS = { version: "hns", tiles: 640, metatiles: 640, pals: 7 } as const;

describe("renderMetatile", () => {
  itWithCorpus("renders a 16x16 RGBA tile", () => {
    const r = renderMetatile(1, primary, secondary, EMERALD, PROFILE);
    expect(r.width).toBe(16);
    expect(r.height).toBe(16);
    expect(r.data).toHaveLength(16 * 16 * 4);
  });

  itWithCorpus("paints every pixel of a ground metatile from its own palette", () => {
    const r = renderMetatile(1, primary, secondary, EMERALD, PROFILE);

    // A ground tile is fully opaque -- 256 of 256 pixels. "> 0" would pass
    // against a renderer that drew a single pixel and left the rest blank.
    let opaque = 0;
    for (let i = 3; i < r.data.length; i += 4) if (r.data[i] === 255) opaque++;
    expect(opaque).toBe(16 * 16);

    // And every colour it used must come from a palette this metatile's own
    // tile entries reference -- not an arbitrary fill.
    const allowed = new Set<string>();
    for (const e of primary.metatile(1)) {
      for (const c of primary.palettes[e.palette] ?? []) allowed.add(`${c.r},${c.g},${c.b}`);
    }
    for (let i = 0; i < r.data.length; i += 4) {
      expect(allowed.has(`${r.data[i]},${r.data[i + 1]},${r.data[i + 2]}`)).toBe(true);
    }
  });

  itWithCorpus("routes id 512 to the SECONDARY tileset under the emerald split", () => {
    // gTileset_General holds exactly 512 metatiles, so 512 is the first
    // secondary id for an emerald layout.
    expect(renderMetatile(512, primary, secondary, EMERALD, PROFILE).outOfRange).toBe(false);
  });

  itWithCorpus("flags id 512 as out of range under the hns split", () => {
    // Under the 640 split, 512 is a PRIMARY id -- but gTileset_General only has
    // 512 metatiles, so this is exactly open-bugs.md #41. It must be
    // detectable, not silently rendered as garbage.
    expect(renderMetatile(512, primary, secondary, HNS, PROFILE).outOfRange).toBe(true);
  });

  itWithCorpus("honours x flips", () => {
    const entries = primary.metatile(1);
    const flipped = renderMetatile(1, primary, secondary, EMERALD, PROFILE, {
      overrideEntries: entries.map((e) => ({ ...e, xFlip: !e.xFlip })),
    });
    const plain = renderMetatile(1, primary, secondary, EMERALD, PROFILE);
    expect(Buffer.from(flipped.data).equals(Buffer.from(plain.data))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/render/metatile.test.ts`
Expected: FAIL — cannot find module `metatile.js`.

- [ ] **Step 3: Write the tile renderer**

```ts
// packages/core/src/render/tile.ts
import type { IndexedImage } from "../load/png.js";
import type { RGB } from "../model/types.js";
import type { Raster } from "./raster.js";

/**
 * Draw one 8x8 tile into `dst` at (dx, dy).
 * Palette index 0 is transparent in every GBA tileset palette.
 */
export function drawTile(
  dst: Raster, sheet: IndexedImage, tileIndex: number,
  palette: RGB[], dx: number, dy: number, xFlip: boolean, yFlip: boolean,
): void {
  const tilesPerRow = sheet.width >> 3;
  const sx = (tileIndex % tilesPerRow) * 8;
  const sy = Math.floor(tileIndex / tilesPerRow) * 8;
  if (sy + 8 > sheet.height) return; // index past the end of this sheet

  for (let y = 0; y < 8; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < 8; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width) continue;
      const px = xFlip ? 7 - x : x;
      const py = yFlip ? 7 - y : y;
      const idx = sheet.indices[(sy + py) * sheet.width + (sx + px)]!;
      if (idx === 0) continue; // transparent
      const c = palette[idx];
      if (!c) continue;
      const di = (ty * dst.width + tx) * 4;
      dst.data[di] = c.r; dst.data[di + 1] = c.g; dst.data[di + 2] = c.b; dst.data[di + 3] = 255;
    }
  }
}
```

- [ ] **Step 4: Write the metatile renderer**

```ts
// packages/core/src/render/metatile.ts
import type { EngineProfile } from "../config/engine.js";
import type { Tileset, TileEntry } from "../load/tilesetData.js";
import type { RGB, Split } from "../model/types.js";
import { createRaster, type Raster } from "./raster.js";
import { drawTile } from "./tile.js";

export interface MetatileRaster extends Raster {
  /** True when the id, or a tile it references, falls outside its tileset's
   *  real range for this split. open-bugs.md #41, made visible. */
  outOfRange: boolean;
}

export interface RenderMetatileOptions { overrideEntries?: TileEntry[]; }

/**
 * Invariant I1: the boundary arrives as `split`. There is no ambient constant.
 *
 *   id  <  split.metatiles  -> primary,   index id
 *   id  >= split.metatiles  -> secondary, index id - split.metatiles
 *
 * The same rule governs tile indices (split.tiles) and palettes (split.pals).
 */
export function renderMetatile(
  id: number, primary: Tileset, secondary: Tileset,
  split: Split, profile: EngineProfile, opts: RenderMetatileOptions = {},
): MetatileRaster {
  const dst = createRaster(16, 16) as MetatileRaster;
  dst.outOfRange = false;

  const inSecondary = id >= split.metatiles;
  const owner = inSecondary ? secondary : primary;
  const local = inSecondary ? id - split.metatiles : id;

  if (local >= owner.metatileCount) {
    dst.outOfRange = true;
    return dst;
  }

  const entries = opts.overrideEntries ?? owner.metatile(local);
  const layerType = owner.layerType(local);

  const paletteFor = (p: number): RGB[] =>
    p < split.pals ? (primary.palettes[p] ?? []) : (secondary.palettes[p - split.pals] ?? []);

  const sheetFor = (t: number) =>
    t < split.tiles
      ? { sheet: primary.tiles, index: t }
      : { sheet: secondary.tiles, index: t - split.tiles };

  // Entries 0-3 are the bottom layer, 4-7 the top. layerType 1 (covered) draws
  // the top set first so the bottom overwrites it, matching how the hardware
  // composites the BG layers for that type.
  const order = layerType === 1 ? [4, 5, 6, 7, 0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6, 7];

  for (const i of order) {
    const e = entries[i];
    if (!e) continue;
    const { sheet, index } = sheetFor(e.tile);
    drawTile(dst, sheet, index, paletteFor(e.palette), (i % 2) * 8, (Math.floor(i / 2) % 2) * 8, e.xFlip, e.yFlip);
  }

  return dst;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/core/test/render/metatile.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/render/tile.ts packages/core/src/render/metatile.ts packages/core/test/render/metatile.test.ts
git commit -m "feat(core): render metatiles against a per-layout split"
```

---

## Task 14: Project facade and layout rendering

**Files:**
- Create: `packages/core/src/project.ts`
- Create: `packages/core/src/render/layout.ts`
- Test: `packages/core/test/render/layout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { renderLayout } from "../../src/render/layout.js";
import { openProject } from "../../src/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const proj = openProject(SUBJECT_ROOT);

describe("renderLayout", () => {
  itWithCorpus("renders PetalburgCity at 16px per block", () => {
    // renderLayout takes a LAYOUT name, which ends in _Layout. Passing the map
    // name "PetalburgCity" throws -- the three namespaces (map, layout, layout
    // directory) look alike and are not interchangeable.
    const r = renderLayout(proj, "PetalburgCity_Layout");
    expect(r.width).toBe(30 * 16);
    expect(r.height).toBe(30 * 16);
  });

  itWithCorpus("refuses a map name where a layout name is required", () => {
    expect(() => renderLayout(proj, "PetalburgCity")).toThrow(/unknown layout/);
    expect(proj.layoutForMap("PetalburgCity").name).toBe("PetalburgCity_Layout");
  });

  itWithCorpus("renders an emerald and an hns layout in the same session, both fully in range", () => {
    const emerald = proj.layoutForMap("PetalburgCity");
    const hns = proj.layouts.find((l) => l.layoutVersion === "hns")!;
    expect(emerald.layoutVersion).toBe("emerald");
    expect(renderLayout(proj, emerald.name).outOfRangeCount).toBe(0);
    expect(renderLayout(proj, hns.name).outOfRangeCount).toBe(0);
  });

  itWithCorpus("includes the border when asked, honouring a 3x2 border", () => {
    const wide = proj.layouts.find((l) => l.borderWidth === 3)!;
    const plain = renderLayout(proj, wide.name);
    const bordered = renderLayout(proj, wide.name, { border: 1 });
    expect(bordered.width).toBe(plain.width + 3 * 2 * 16);
    expect(bordered.height).toBe(plain.height + 2 * 2 * 16);
  });

  itWithCorpus("renders every layout in the subject repo without throwing", () => {
    const failures: string[] = [];
    for (const l of proj.layouts) {
      try { renderLayout(proj, l.name); } catch (e) { failures.push(`${l.name}: ${(e as Error).message}`); }
    }
    expect(failures).toEqual([]);
  }, 900_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/render/layout.test.ts`
Expected: FAIL — cannot find module `project.js`.

- [ ] **Step 3: Write the project facade**

```ts
// packages/core/src/project.ts
import { existsSync, readFileSync } from "node:fs";
import { projectPaths, type ProjectPaths } from "./config/paths.js";
import { parseFieldmapConstants, type FieldmapConstants } from "./config/fieldmap.js";
import { engineProfile, defaultProfile, parseCfg, type EngineProfile } from "./config/engine.js";
import { parseLayouts, resolveSplit } from "./load/layouts.js";
import { parseMapGroups, parseMap, type MapData, type MapGroups } from "./load/maps.js";
import { parseTilesetPaths, type TilesetPaths } from "./load/tilesets.js";
import { loadTileset, type Tileset } from "./load/tilesetData.js";
import type { Layout, Split } from "./model/types.js";

export interface Project {
  paths: ProjectPaths;
  profile: EngineProfile;
  constants: FieldmapConstants;
  layouts: Layout[];
  groups: MapGroups;
  /** Layout names end in `_Layout` -- "PetalburgCity_Layout", not
   *  "PetalburgCity". The directory under data/layouts/ uses the short form,
   *  and the map that uses it is a third name again. Do not conflate them. */
  layoutByName(name: string): Layout | undefined;
  layoutById(id: string): Layout | undefined;
  /** The layout a MAP uses. Most callers start from a map name, so reach for
   *  this rather than guessing at the layout's name. */
  layoutForMap(mapName: string): Layout;
  splitFor(layout: Layout): Split;
  tileset(symbol: string): Tileset;
  map(name: string): MapData;
  mapNames(): string[];
}

export function openProject(root: string): Project {
  const paths = projectPaths(root);

  const profileBase = existsSync(paths.porymapCfg)
    ? engineProfile(parseCfg(readFileSync(paths.porymapCfg, "utf8")))
    : defaultProfile(guessVersion(paths));

  const constants = parseFieldmapConstants(readFileSync(paths.fieldmapH, "utf8"));
  const { layouts } = parseLayouts(readFileSync(paths.layoutsJson, "utf8"));

  // The cfg's base_game_version does not say whether this tree carries
  // per-layout versions. The data does.
  const profile: EngineProfile = {
    ...profileBase,
    supportsLayoutVersion:
      profileBase.supportsLayoutVersion || layouts.some((l) => l.layoutVersion !== undefined),
  };

  const groups = parseMapGroups(readFileSync(paths.mapGroupsJson, "utf8"));
  const tsPaths: Map<string, TilesetPaths> = parseTilesetPaths(
    readFileSync(paths.tilesetHeadersH, "utf8"),
    readFileSync(paths.tilesetMetatilesH, "utf8"),
    readFileSync(paths.tilesetGraphicsH, "utf8"),
  );

  const tilesetCache = new Map<string, Tileset>();
  const mapCache = new Map<string, MapData>();

  return {
    paths, profile, constants, layouts, groups,
    layoutByName: (n) => layouts.find((l) => l.name === n),
    layoutById: (id) => layouts.find((l) => l.id === id),
    layoutForMap(mapName) {
      const map = this.map(mapName);
      const layout = layouts.find((l) => l.id === map.layout);
      if (!layout) throw new Error(`map ${mapName} references unknown layout ${map.layout}`);
      return layout;
    },
    splitFor: (l) => resolveSplit(l, constants),
    tileset(symbol) {
      let t = tilesetCache.get(symbol);
      if (!t) {
        const tp = tsPaths.get(symbol);
        if (!tp) throw new Error(`unknown tileset symbol ${symbol}`);
        t = loadTileset(paths, tp, profile);
        tilesetCache.set(symbol, t);
      }
      return t;
    },
    map(name) {
      let m = mapCache.get(name);
      if (!m) { m = parseMap(readFileSync(paths.mapJson(name), "utf8")); mapCache.set(name, m); }
      return m;
    },
    mapNames: () => groups.allMapNames(),
  };
}

function guessVersion(paths: ProjectPaths): string {
  const src = existsSync(paths.fieldmapH) ? readFileSync(paths.fieldmapH, "utf8") : "";
  return /NUM_METATILES_IN_PRIMARY_EMERALD/.test(src) ? "pokeemerald-expansion" : "pokeemerald";
}
```

- [ ] **Step 4: Write the layout renderer**

```ts
// packages/core/src/render/layout.ts
import { readFileSync } from "node:fs";
import type { Project } from "../project.js";
import { parseBlocks } from "../load/blocks.js";
import { createRaster, blit, type Raster } from "./raster.js";
import { renderMetatile, type MetatileRaster } from "./metatile.js";
import type { Block } from "../model/types.js";

export interface LayoutRaster extends Raster {
  layoutName: string;
  blockWidth: number;
  blockHeight: number;
  /** Pixel offset of block (0,0). Non-zero when a border is drawn. */
  originX: number;
  originY: number;
  outOfRangeCount: number;
  blocks: Block[];
}

export interface RenderLayoutOptions {
  /** Rings of border to draw outside the map. 0 = none. */
  border?: number;
}

export function renderLayout(proj: Project, layoutName: string, opts: RenderLayoutOptions = {}): LayoutRaster {
  const layout = proj.layoutByName(layoutName);
  if (!layout) throw new Error(`unknown layout ${layoutName}`);

  const split = proj.splitFor(layout);
  const primary = proj.tileset(layout.primaryTileset);
  const secondary = proj.tileset(layout.secondaryTileset);

  const blocks = parseBlocks(readFileSync(`${proj.paths.root}/${layout.blockdataFilepath}`), proj.profile);
  const borderBlocks = parseBlocks(readFileSync(`${proj.paths.root}/${layout.borderFilepath}`), proj.profile);

  const rings = opts.border ?? 0;
  const padX = rings * layout.borderWidth;
  const padY = rings * layout.borderHeight;

  const dst = createRaster((layout.width + padX * 2) * 16, (layout.height + padY * 2) * 16) as LayoutRaster;
  dst.layoutName = layout.name;
  dst.blockWidth = layout.width;
  dst.blockHeight = layout.height;
  dst.originX = padX * 16;
  dst.originY = padY * 16;
  dst.outOfRangeCount = 0;
  dst.blocks = blocks;

  const cache = new Map<number, MetatileRaster>();
  const tile = (id: number): MetatileRaster => {
    let r = cache.get(id);
    if (!r) { r = renderMetatile(id, primary, secondary, split, proj.profile); cache.set(id, r); }
    return r;
  };

  if (rings > 0) {
    for (let y = 0; y < layout.height + padY * 2; y++) {
      for (let x = 0; x < layout.width + padX * 2; x++) {
        if (x >= padX && x < padX + layout.width && y >= padY && y < padY + layout.height) continue;
        const b = borderBlocks[(y % layout.borderHeight) * layout.borderWidth + (x % layout.borderWidth)];
        if (b) blit(dst, tile(b.metatileId), x * 16, y * 16);
      }
    }
  }

  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      const b = blocks[y * layout.width + x];
      if (!b) continue;
      const r = tile(b.metatileId);
      if (r.outOfRange) dst.outOfRangeCount++;
      blit(dst, r, dst.originX + x * 16, dst.originY + y * 16);
    }
  }

  return dst;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/core/test/render/layout.test.ts`
Expected: PASS, 4 tests. The last test walks all 1,020 layouts and is slow by design — it is the first real proof the whole tree renders.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/project.ts packages/core/src/render/layout.ts packages/core/test/render/layout.test.ts
git commit -m "feat(core): project facade and whole-layout rendering with borders"
```

---

## Task 15: PNG encoder and `pokemap render`

**Files:**
- Create: `packages/cli/package.json`, `packages/cli/src/png.ts`, `packages/cli/src/index.ts`
- Test: `packages/cli/test/png.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { encodePng } from "../src/png.js";

describe("encodePng", () => {
  it("writes a valid signature and IHDR", () => {
    const buf = encodePng({ width: 2, height: 1, data: new Uint8ClampedArray([255,0,0,255, 0,255,0,255]) });
    expect(buf.readUInt32BE(0)).toBe(0x89504e47);
    expect(buf.readUInt32BE(16)).toBe(2);
    expect(buf.readUInt32BE(20)).toBe(1);
    expect(buf[24]).toBe(8); // bit depth
    expect(buf[25]).toBe(6); // colour type RGBA
  });

  it("round-trips pixel data through zlib", () => {
    const src = new Uint8ClampedArray([1,2,3,4, 5,6,7,8]);
    const buf = encodePng({ width: 2, height: 1, data: src });
    let off = 8, idat: Buffer | null = null;
    while (off + 8 <= buf.length) {
      const len = buf.readUInt32BE(off);
      if (buf.toString("ascii", off + 4, off + 8) === "IDAT") { idat = buf.subarray(off + 8, off + 8 + len); break; }
      off += 12 + len;
    }
    const raw = inflateSync(idat!);
    expect(raw[0]).toBe(0); // filter byte
    expect([...raw.subarray(1)]).toEqual([...src]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/cli/test/png.test.ts`
Expected: FAIL — cannot find module `png.js`.

- [ ] **Step 3: Write the encoder**

```ts
// packages/cli/src/png.ts
import { deflateSync } from "node:zlib";

export interface RasterLike { width: number; height: number; data: Uint8ClampedArray; }

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGBA, 8-bit, non-interlaced, filter type 0 on every row. */
export function encodePng(r: RasterLike): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(r.width, 0);
  ihdr.writeUInt32BE(r.height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = r.width * 4;
  const raw = Buffer.alloc((stride + 1) * r.height);
  const bytes = Buffer.from(r.data.buffer, r.data.byteOffset, r.data.length);
  for (let y = 0; y < r.height; y++) {
    raw[y * (stride + 1)] = 0;
    bytes.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
```

- [ ] **Step 4: Wire the CLI**

`packages/cli/package.json`:

```json
{
  "name": "@pokemap/cli",
  "version": "0.0.0",
  "type": "module",
  "bin": { "pokemap": "./src/index.ts" },
  "dependencies": { "@pokemap/core": "*", "commander": "^12.1.0" }
}
```

`packages/cli/src/index.ts`:

```ts
#!/usr/bin/env node
import { Command } from "commander";
import { writeFileSync, readFileSync } from "node:fs";
import { openProject, type Project } from "@pokemap/core/src/project.js";
import { renderLayout } from "@pokemap/core/src/render/layout.js";
import { encodePng } from "./png.js";

export function resolveProject(explicit?: string): Project {
  if (explicit) return openProject(explicit);
  const cfg = JSON.parse(readFileSync("pokemap.config.json", "utf8")) as { projectPath: string };
  return openProject(cfg.projectPath);
}

/** Accept either a layout name or a map name. */
export function layoutNameFor(proj: Project, target: string): string {
  if (proj.layoutByName(target)) return target;
  const name = proj.layoutById(proj.map(target).layout)?.name;
  if (!name) throw new Error(`no layout or map named ${target}`);
  return name;
}

const program = new Command();
program.name("pokemap").option("-p, --project <path>", "decomp root");

program
  .command("render <target>")
  .description("render a map or layout to a PNG")
  .option("-o, --out <file>", "output path", "out.png")
  .option("--border <rings>", "rings of border to draw", "0")
  .action((target: string, opts: { out: string; border: string }) => {
    const proj = resolveProject(program.opts().project);
    const r = renderLayout(proj, layoutNameFor(proj, target), { border: Number(opts.border) });
    writeFileSync(opts.out, encodePng(r));
    process.stdout.write(`${opts.out} ${r.width}x${r.height} outOfRange=${r.outOfRangeCount}\n`);
  });

program.parse();
```

- [ ] **Step 5: Run the test, then the real command**

Run: `npx vitest run packages/cli/test/png.test.ts`
Expected: PASS, 2 tests.

Run: `npx tsx packages/cli/src/index.ts render PetalburgCity --out shot.png`
Expected: `shot.png 480x480 outOfRange=0`

**Open `shot.png` and look at it.** Per `superpowers:verification-before-completion`, this task is not done until someone has seen the image and confirmed it looks like Petalburg City rather than noise.

- [ ] **Step 6: Add `pokemap query`**

Spec §11's read command. Everything it prints already exists on the `Project` facade; this is a thin projection, and it is what `pokemap_map_info` wraps in Plan 4.

```ts
program
  .command("query <map>")
  .description("print a map's header, connections, events and resolved split")
  .option("--header", "header fields only")
  .option("--connections", "connections only")
  .option("--events", "events only")
  .option("--json", "machine-readable output", true)
  .action((map: string, opts: { header?: boolean; connections?: boolean; events?: boolean; json?: boolean }) => {
    const proj = resolveProject(program.opts().project);
    const m = proj.map(map);
    const layout = proj.layoutById(m.layout);
    if (!layout) throw new Error(`map ${map} references unknown layout ${m.layout}`);

    const all = !opts.header && !opts.connections && !opts.events;
    const out: Record<string, unknown> = {};
    if (all || opts.header) {
      const { connections, objectEvents, warpEvents, coordEvents, bgEvents, ...header } = m;
      out.header = header;
      // The split is the thing this tool exists to get right; always report it.
      out.layout = { name: layout.name, width: layout.width, height: layout.height,
                     borderWidth: layout.borderWidth, borderHeight: layout.borderHeight,
                     layoutVersion: layout.layoutVersion ?? null,
                     primaryTileset: layout.primaryTileset, secondaryTileset: layout.secondaryTileset };
      out.split = proj.splitFor(layout);
    }
    if (all || opts.connections) out.connections = m.connections;
    if (all || opts.events) {
      out.events = { object: m.objectEvents, warp: m.warpEvents, coord: m.coordEvents, bg: m.bgEvents };
    }
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  });
```

Add a test in `packages/cli/test/query.test.ts` asserting that `query NewBarkTown` reports `split.metatiles === 640` and `layout.layoutVersion === "hns"`, and that `query PetalburgCity` reports `512` and `"emerald"`.

Run: `npx tsx packages/cli/src/index.ts query NewBarkTown --header`
Expected: JSON including `"layoutVersion": "hns"` and `"metatiles": 640`.

- [ ] **Step 7: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): encode rasters to PNG, add render and query commands"
```

---

## Task 16: Visual regression harness

**Files:**
- Create: `fixtures/visual-list.json`
- Create: `packages/core/test/render/visual.test.ts`
- Generated: `fixtures/visual-hashes.json`

- [ ] **Step 1: Write the fixed map list**

`fixtures/visual-list.json` — must span both boundaries and the 3×2 border case:

```json
{
  "maps": [
    "PetalburgCity",
    "NewBarkTown",
    "ViridianForest",
    "SafariZoneCenter",
    "NavelRock_Base",
    "NavelRock_Bottom"
  ]
}
```

**These are MAP names, and the harness resolves each to its layout via
`proj.layoutForMap`.** They are not layout names: `NavelRock_Base`'s layout is
`NavelRockBase_Layout`, and every other entry gains a `_Layout` suffix. Naming
the file's key `layouts` while filling it with map names is exactly the sort of
quiet mismatch that makes a later reader trust the wrong thing.

`PetalburgCity` is `emerald` (512 boundary). `NewBarkTown` is `hns` (640). `ViridianForest` and `SafariZoneCenter` are two of the seven 3×2-border layouts. The two NavelRock maps are the documented Emerald/FRLG art mismatch — a real rendering difference that must stay visible.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { openProject } from "../../src/project.js";
import { renderLayout } from "../../src/render/layout.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const proj = openProject(SUBJECT_ROOT);
const list = JSON.parse(readFileSync("fixtures/visual-list.json", "utf8")) as { maps: string[] };
const HASHES = "fixtures/visual-hashes.json";

describe("visual regression", () => {
  itWithCorpus("renders the fixed list to stable hashes", () => {
    const actual: Record<string, string> = {};
    for (const name of list.maps) {
      const r = renderLayout(proj, proj.layoutForMap(name).name, { border: 1 });
      actual[name] = createHash("sha256").update(Buffer.from(r.data)).digest("hex").slice(0, 16);
    }
    if (!existsSync(HASHES)) {
      writeFileSync(HASHES, JSON.stringify(actual, null, 2));
      throw new Error("baseline written; inspect the PNGs, then re-run to lock it in");
    }
    expect(actual).toEqual(JSON.parse(readFileSync(HASHES, "utf8")));
  });

  itWithCorpus("covers both metatile boundaries and a 3x2 border", () => {
    const layouts = list.maps.map((n) => proj.layoutForMap(n));
    const versions = new Set(layouts.map((l) => l.layoutVersion ?? "emerald"));
    expect(versions.has("emerald")).toBe(true);
    expect([...versions].some((v) => v === "hns" || v === "frlg")).toBe(true);
    expect(layouts.some((l) => l.borderWidth === 3)).toBe(true);
  });
});
```

- [ ] **Step 3: Run to generate the baseline**

Run: `npx vitest run packages/core/test/render/visual.test.ts`
Expected: FAIL with "baseline written".

- [ ] **Step 4: Inspect the baseline BEFORE locking it**

```bash
for m in PetalburgCity NewBarkTown ViridianForest SafariZoneCenter NavelRock_Base NavelRock_Bottom; do npx tsx packages/cli/src/index.ts render "$m" --border 1 --out "fixtures/baseline-$m.png"; done
```

Compare `fixtures/baseline-NavelRock_Base.png` and `fixtures/baseline-NavelRock_Bottom.png` against the subject repo's emulator screenshots at `tools/verify/scratch/mapshot/02_navel_rock_base.png` and `00_navel_rock_bottom.png`. Those came from a real emulator and are ground truth. **If the renderer disagrees with them, the renderer is wrong — fix it, do not lock the baseline.**

- [ ] **Step 5: Re-run to lock in**

Run: `npx vitest run packages/core/test/render/visual.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add fixtures/visual-list.json fixtures/visual-hashes.json packages/core/test/render/visual.test.ts
git commit -m "test(core): lock visual regression across both metatile boundaries"
```

---

# Phase D — Validation and the corpus gate

## Task 17: Port `check_metatile_range.py`

**Files:**
- Create: `packages/core/src/validate/metatileRange.ts`
- Test: `packages/core/test/validate/metatileRange.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { validateMetatileRange } from "../../src/validate/metatileRange.js";
import { openProject } from "../../src/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const proj = openProject(SUBJECT_ROOT);

describe("validateMetatileRange", () => {
  itWithCorpus("agrees with the subject repo's Python checker: only Saffron_Temp is out of range", () => {
    const findings = validateMetatileRange(proj);
    // The Python tool names layouts, and layout names carry the _Layout suffix.
    expect(findings.map((f) => f.layout).sort()).toEqual(["Saffron_Temp_Layout"]);
    expect(findings[0]!.split.version).toBe("hns");
    expect(findings[0]!.source).toBe("map");
  }, 900_000);

  itWithCorpus("reports the layout's own split version on every finding", () => {
    for (const f of validateMetatileRange(proj)) {
      expect(["emerald", "frlg", "hns"]).toContain(f.split.version);
    }
  }, 900_000);

  itWithCorpus("checking every layout against one global constant is the bug, not the test", () => {
    // Forcing the 640 boundary onto emerald layouts must produce many findings.
    const forced = { ...proj, splitFor: () => ({ version: "hns" as const, tiles: 640, metatiles: 640, pals: 7 }) };
    expect(validateMetatileRange(forced as typeof proj).length).toBeGreaterThan(100);
  }, 900_000);
});
```

The third test encodes the whole point of the tool: it fails loudly if anyone reintroduces a global boundary.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/validate/metatileRange.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/validate/metatileRange.ts
import { readFileSync } from "node:fs";
import type { Project } from "../project.js";
import { parseBlocks } from "../load/blocks.js";
import type { Split } from "../model/types.js";

export interface RangeFinding {
  layout: string;
  split: Split;
  /** Distinct offending metatile ids, with how often each appears. */
  ids: { id: number; count: number }[];
  source: "map" | "border";
}

/**
 * Port of tools/verify/check_metatile_range.py.
 *
 *   id <  split.metatiles   must be < the primary tileset's own count
 *   id >= split.metatiles   must be < split.metatiles + secondary count,
 *                           and inside NUM_METATILES_TOTAL -- the id field is
 *                           10 bits, so a 512-metatile secondary above a 640
 *                           split only ever exposes its first 384 entries.
 */
export function validateMetatileRange(proj: Project): RangeFinding[] {
  const out: RangeFinding[] = [];

  for (const layout of proj.layouts) {
    const split = proj.splitFor(layout);
    const primaryCount = proj.tileset(layout.primaryTileset).metatileCount;
    const secondaryCount = proj.tileset(layout.secondaryTileset).metatileCount;
    const ceiling = Math.min(split.metatiles + secondaryCount, proj.constants.metatilesTotal);

    const bad = (id: number) => (id < split.metatiles ? id >= primaryCount : id >= ceiling);

    for (const [source, file] of [["map", layout.blockdataFilepath], ["border", layout.borderFilepath]] as const) {
      const counts = new Map<number, number>();
      for (const b of parseBlocks(readFileSync(`${proj.paths.root}/${file}`), proj.profile)) {
        if (bad(b.metatileId)) counts.set(b.metatileId, (counts.get(b.metatileId) ?? 0) + 1);
      }
      if (counts.size) {
        out.push({
          layout: layout.name, split, source,
          ids: [...counts].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count),
        });
      }
    }
  }

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/validate/metatileRange.test.ts`
Expected: PASS, 3 tests.

If the first test finds layouts beyond `Saffron_Temp`, cross-check against the Python tool before changing anything:

```bash
cd "C:/Programming Projects/Pokemon Game/game" && python tools/verify/check_metatile_range.py --verbose
```

Whichever disagrees with the engine's own `GetNumMetatilesInPrimary()` is the one that is wrong.

- [ ] **Step 5: Add the CLI command**

In `packages/cli/src/index.ts`:

```ts
program
  .command("validate")
  .description("run static checks over the project")
  .option("--metatile-range", "check every metatile id against its layout's split")
  .option("--json", "machine-readable output")
  .action((opts: { metatileRange?: boolean; json?: boolean }) => {
    const proj = resolveProject(program.opts().project);
    const findings = opts.metatileRange === false ? [] : validateMetatileRange(proj);
    if (opts.json) { process.stdout.write(JSON.stringify(findings, null, 2)); }
    else {
      for (const f of findings) {
        process.stdout.write(`${f.layout} (${f.split.version}, ${f.source}): ${f.ids.length} bad id(s), worst 0x${f.ids[0]!.id.toString(16)} x${f.ids[0]!.count}\n`);
      }
      process.stdout.write(`${findings.length} finding(s)\n`);
    }
    process.exitCode = findings.length ? 1 : 0;
  });
```

Run: `npx tsx packages/cli/src/index.ts validate --metatile-range`
Expected: one finding, `Saffron_Temp`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/validate packages/core/test/validate packages/cli/src/index.ts
git commit -m "feat(core): port the per-layout metatile range check and expose it on the CLI"
```

---

## Task 18: Surgical JSON editing and the identity corpus gate

Invariant **I2** and **I5**. No file is written to any decomp in this plan — this task proves the *text transform* is identity-safe so that Plan 2 can write with confidence.

**Files:**
- Create: `packages/core/src/write/jsonEdit.ts`
- Test: `packages/core/test/write/jsonEdit.test.ts`
- Test: `packages/core/test/write/corpus.test.ts`

- [ ] **Step 1: Write the failing unit test**

```ts
import { describe, it, expect } from "vitest";
import { editJson } from "../../src/write/jsonEdit.js";

const SRC = `{
  "id": "MAP_TEST",
  "weird_key_pokemap_never_heard_of": 42,
  "connections": [
    { "map": "MAP_A", "offset": -5, "direction": "left" }
  ]
}`;

describe("editJson", () => {
  it("is the identity when nothing changes", () => {
    expect(editJson(SRC, [])).toBe(SRC);
  });

  it("replaces one scalar and leaves every other byte alone", () => {
    const out = editJson(SRC, [{ path: ["id"], value: "MAP_RENAMED" }]);
    expect(out).toBe(SRC.replace('"MAP_TEST"', '"MAP_RENAMED"'));
    expect(out).toContain("weird_key_pokemap_never_heard_of");
  });

  it("edits inside an array element without reformatting the array", () => {
    const out = editJson(SRC, [{ path: ["connections", 0, "offset"], value: -7 }]);
    expect(out).toContain('{ "map": "MAP_A", "offset": -7, "direction": "left" }');
  });

  it("never invents a key that was absent", () => {
    expect(() => editJson(SRC, [{ path: ["border_width"], value: 2 }]))
      .toThrow(/absent|not present/i);
  });

  it("preserves CRLF line endings", () => {
    const crlf = SRC.replace(/\n/g, "\r\n");
    expect(editJson(crlf, [])).toBe(crlf);
    expect(editJson(crlf, [{ path: ["id"], value: "X" }])).toContain("\r\n");
  });
});
```

The fourth test is the direct countermeasure to Porymap 6 injecting `border_width` into 726 layouts. Adding a key is a separate, explicit operation (Plan 3), never a side effect of saving.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/write/jsonEdit.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/write/jsonEdit.ts
export type JsonPath = (string | number)[];
export interface JsonEdit { path: JsonPath; value: unknown; }

interface Span { start: number; end: number; }

/**
 * Invariant I2. This module never calls JSON.stringify on a whole document.
 * It locates each target value's source span and splices a new literal in.
 *
 * Consequences, all of them deliberate:
 *   - keys PokeMap has never heard of survive untouched
 *   - keys that were absent stay absent
 *   - key order, indentation and line endings are preserved
 *   - an unchanged document is returned byte-identical
 */
export function editJson(src: string, edits: JsonEdit[]): string {
  if (edits.length === 0) return src;

  const spans = edits.map((e) => ({ span: locate(src, e.path), value: e.value }));
  // Apply right-to-left so earlier offsets stay valid.
  spans.sort((a, b) => b.span.start - a.span.start);

  let out = src;
  for (const { span, value } of spans) {
    out = out.slice(0, span.start) + JSON.stringify(value) + out.slice(span.end);
  }
  return out;
}

/** Find the source span of the value at `path`, throwing if any step is absent. */
export function locate(src: string, path: JsonPath): Span {
  let cursor = skipWs(src, 0);
  for (const step of path) {
    cursor = typeof step === "number" ? enterIndex(src, cursor, step) : enterKey(src, cursor, step);
  }
  return { start: cursor, end: valueEnd(src, cursor) };
}

const WS = new Set([" ", "\t", "\r", "\n"]);
const skipWs = (s: string, i: number): number => { while (i < s.length && WS.has(s[i]!)) i++; return i; };

function readString(s: string, i: number): { value: string; end: number } {
  let out = "";
  i++; // opening quote
  while (i < s.length && s[i] !== '"') {
    if (s[i] === "\\") { out += s[i]! + s[i + 1]!; i += 2; }
    else out += s[i++]!;
  }
  return { value: JSON.parse(`"${out}"`) as string, end: i + 1 };
}

/** End offset (exclusive) of the JSON value starting at `i`. */
export function valueEnd(s: string, i: number): number {
  const c = s[i];
  if (c === '"') return readString(s, i).end;
  if (c === "{" || c === "[") {
    const close = c === "{" ? "}" : "]";
    let depth = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '"') { i = readString(s, i).end; continue; }
      if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === close) { depth--; if (depth === 0) return i + 1; }
      i++;
    }
    throw new Error("unterminated container");
  }
  while (i < s.length && !WS.has(s[i]!) && s[i] !== "," && s[i] !== "}" && s[i] !== "]") i++;
  return i;
}

function enterKey(s: string, objStart: number, key: string): number {
  if (s[objStart] !== "{") throw new Error(`expected an object at offset ${objStart}`);
  let i = skipWs(s, objStart + 1);
  while (i < s.length && s[i] !== "}") {
    const k = readString(s, i);
    i = skipWs(s, k.end);
    if (s[i] !== ":") throw new Error(`malformed object at offset ${i}`);
    const valueStart = skipWs(s, i + 1);
    if (k.value === key) return valueStart;
    i = skipWs(s, valueEnd(s, valueStart));
    if (s[i] === ",") i = skipWs(s, i + 1);
  }
  throw new Error(`key "${key}" is absent; adding keys is an explicit operation, never a side effect of saving`);
}

function enterIndex(s: string, arrStart: number, index: number): number {
  if (s[arrStart] !== "[") throw new Error(`expected an array at offset ${arrStart}`);
  let i = skipWs(s, arrStart + 1);
  for (let n = 0; i < s.length && s[i] !== "]"; n++) {
    if (n === index) return i;
    i = skipWs(s, valueEnd(s, i));
    if (s[i] === ",") i = skipWs(s, i + 1);
  }
  throw new Error(`index ${index} is not present`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/write/jsonEdit.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the corpus gate**

```ts
// packages/core/test/write/corpus.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { editJson } from "../../src/write/jsonEdit.js";
import { openProject } from "../../src/project.js";

const cfg = JSON.parse(readFileSync("pokemap.config.json", "utf8")) as {
  projectPath: string; referenceProjects: string[];
};
const roots = [cfg.projectPath, ...cfg.referenceProjects].filter((r) => existsSync(`${r}/data/layouts/layouts.json`));

describe("identity corpus (invariant I5)", () => {
  it("has every reference engine available", () => {
    expect(roots.length).toBeGreaterThanOrEqual(5);
  });

  it.each(roots)("round-trips every map.json in %s with zero bytes changed", (root) => {
    const proj = openProject(root);
    const changed: string[] = [];
    for (const name of proj.mapNames()) {
      const path = proj.paths.mapJson(name);
      if (!existsSync(path)) continue;
      const src = readFileSync(path, "utf8");
      if (editJson(src, []) !== src) changed.push(name);
    }
    expect(changed).toEqual([]);
  }, 900_000);

  it.each(roots)("round-trips layouts.json in %s with zero bytes changed", (root) => {
    const proj = openProject(root);
    const src = readFileSync(proj.paths.layoutsJson, "utf8");
    expect(editJson(src, [])).toBe(src);
  });

  it.each(roots)("edits one value in every map.json and changes nothing else (%s)", (root) => {
    const proj = openProject(root);
    const offenders: string[] = [];
    for (const name of proj.mapNames().slice(0, 200)) {
      const path = proj.paths.mapJson(name);
      if (!existsSync(path)) continue;
      const src = readFileSync(path, "utf8");
      const out = editJson(src, [{ path: ["music"], value: "MUS_PLACEHOLDER" }]);
      // Exactly one substitution: lengths differ only by the literal delta.
      const restored = editJson(out, [{ path: ["music"], value: JSON.parse(src).music }]);
      if (restored !== src) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  }, 900_000);
});
```

- [ ] **Step 6: Run the corpus gate**

Run: `npx vitest run packages/core/test/write/corpus.test.ts`
Expected: PASS. Roughly 5,000 files across 5–6 engines, all byte-identical.

If a reference repo is missing, the first test fails and names the gap. Clone it rather than deleting the assertion — engine portability that is not tested is engine portability that has already rotted.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/write packages/core/test/write
git commit -m "feat(core): surgical JSON editing with an identity corpus gate across 5 engines"
```

---

# Phase E — Server and UI shell

## Task 19: HTTP shim

**Files:**
- Create: `packages/server/package.json`, `packages/server/src/index.ts`
- Test: `packages/server/test/api.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";

let s: PokemapServer;
beforeAll(async () => { s = await createServer({ projectPath: SUBJECT_ROOT, port: 0 }); });
afterAll(async () => { await s.close(); });

const get = async (path: string) => fetch(`http://127.0.0.1:${s.port}${path}`);

// beforeAll opens the real project, so an individual it-level guard is too
// late -- the hook throws first and every test in the file fails.
describe.skipIf(!hasProject(SUBJECT_ROOT))("server", () => {
  it("lists map groups", async () => {
    const r = await get("/api/groups");
    expect(r.status).toBe(200);
    const body = await r.json() as { groupOrder: string[]; groups: Record<string, string[]> };
    expect(body.groupOrder[0]).toBe("gMapGroup_TownsAndRoutes");
    expect(body.groups[body.groupOrder[0]!]).toContain("NewBarkTown");
  });

  it("returns a map's header, split and layout metadata", async () => {
    const body = await (await get("/api/map/NewBarkTown")).json() as any;
    expect(body.map.id).toBe("MAP_NEW_BARK_TOWN");
    expect(body.layout.name).toBe("NewBarkTown_Layout");
    expect(body.split.metatiles).toBe(640);
    expect(body.split.version).toBe("hns");
  });

  it("serves a rendered layout as a PNG", async () => {
    const r = await get("/api/render/PetalburgCity.png?border=1");
    expect(r.headers.get("content-type")).toBe("image/png");
    const buf = Buffer.from(await r.arrayBuffer());
    expect(buf.readUInt32BE(0)).toBe(0x89504e47);
  });

  it("404s an unknown map rather than throwing", async () => {
    expect((await get("/api/map/NoSuchMap")).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/test/api.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

`packages/server/package.json`:

```json
{
  "name": "@pokemap/server",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "dependencies": { "@pokemap/core": "*", "@pokemap/cli": "*" }
}
```

```ts
// packages/server/src/index.ts
import { createServer as createHttp, type Server } from "node:http";
import { openProject, type Project } from "@pokemap/core/src/project.js";
import { renderLayout } from "@pokemap/core/src/render/layout.js";
import { encodePng } from "@pokemap/cli/src/png.js";

export interface PokemapServer { port: number; project: Project; close(): Promise<void>; }

export async function createServer(opts: { projectPath: string; port?: number }): Promise<PokemapServer> {
  const project = openProject(opts.projectPath);
  const pngCache = new Map<string, Buffer>();

  const http: Server = createHttp((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    try {
      if (url.pathname === "/api/groups") {
        return send(200, { groupOrder: project.groups.groupOrder, groups: project.groups.groups });
      }

      const mapMatch = /^\/api\/map\/(.+)$/.exec(url.pathname);
      if (mapMatch) {
        const name = decodeURIComponent(mapMatch[1]!);
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        const map = project.map(name);
        const layout = project.layoutById(map.layout);
        if (!layout) return send(404, { error: `no layout ${map.layout}` });
        return send(200, { map, layout, split: project.splitFor(layout) });
      }

      const renderMatch = /^\/api\/render\/(.+)\.png$/.exec(url.pathname);
      if (renderMatch) {
        const name = decodeURIComponent(renderMatch[1]!);
        const border = Number(url.searchParams.get("border") ?? "0");
        const key = `${name}:${border}`;
        let png = pngCache.get(key);
        if (!png) {
          const layoutName = project.layoutByName(name)
            ? name
            : project.layoutById(project.map(name).layout)?.name;
          if (!layoutName) return send(404, { error: `no layout or map ${name}` });
          png = encodePng(renderLayout(project, layoutName, { border }));
          pngCache.set(key, png);
        }
        res.writeHead(200, { "content-type": "image/png", "cache-control": "no-cache" });
        return res.end(png);
      }

      return send(404, { error: "not found" });
    } catch (e) {
      return send(500, { error: (e as Error).message });
    }
  });

  await new Promise<void>((r) => http.listen(opts.port ?? 5174, "127.0.0.1", r));
  const addr = http.address();
  const port = typeof addr === "object" && addr ? addr.port : (opts.port ?? 5174);

  return { port, project, close: () => new Promise<void>((r) => http.close(() => r())) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/server/test/api.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): HTTP shim exposing groups, map metadata and rendered PNGs"
```

---

## Task 20: UI shell and map list

- [ ] **Step 0: Invoke the design skills — required, not optional**

Before writing any component, invoke both:

```
Skill(skill="frontend-design")
Skill(skill="ui-ux-pro-max")
```

Brief them with: a desktop map editor for a 1,209-map ROM hack; dense information; long scrolling tree with 28 groups; a canvas that must dominate the screen; used for hours at a time; dark mode matters because the user works at night; it will be wrapped in Electron. Take their layout, spacing, type and colour decisions as the design system for every later UI task and record it in `packages/ui/DESIGN.md` so Plans 2–4 stay consistent.

**Files:**
- Create: `packages/ui/package.json`, `packages/ui/vite.config.ts`, `packages/ui/index.html`
- Create: `packages/ui/src/main.tsx`, `packages/ui/src/App.tsx`
- Create: `packages/ui/src/components/MapTree.tsx`
- Create: `packages/ui/DESIGN.md`
- Test: `packages/ui/test/MapTree.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MapTree } from "../src/components/MapTree.js";

const GROUPS = {
  groupOrder: ["gMapGroup_TownsAndRoutes", "gMapGroup_Dungeons"],
  groups: {
    gMapGroup_TownsAndRoutes: ["NewBarkTown", "Route29"],
    gMapGroup_Dungeons: ["NavelRock_Base"],
  },
};

describe("MapTree", () => {
  it("renders every group with its map count", () => {
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} />);
    expect(screen.getByText(/TownsAndRoutes/)).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("filters maps as the user types, keeping groups that still match", () => {
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: "navel" } });
    expect(screen.queryByText("NewBarkTown")).toBeNull();
    expect(screen.getByText("NavelRock_Base")).toBeTruthy();
  });

  it("calls onSelect with the map name", () => {
    let picked: string | null = null;
    render(<MapTree data={GROUPS} selected={null} onSelect={(n) => { picked = n; }} />);
    fireEvent.click(screen.getByText("Route29"));
    expect(picked).toBe("Route29");
  });

  it("says so when a filter matches nothing, rather than showing an empty panel", () => {
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: "zzzz" } });
    expect(screen.getByText(/no maps match/i)).toBeTruthy();
  });
});
```

The fourth test is a design requirement from the spec (§9: "Empty states explain rather than sit blank"), enforced as a test so it cannot quietly regress.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ui/test/MapTree.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Scaffold the app**

```bash
npm create vite@latest packages/ui -- --template react-ts
npm install -w @pokemap/ui @testing-library/react @testing-library/jest-dom jsdom
```

Set `vitest.config.ts` `environment: "jsdom"` for `packages/ui/**`, and proxy `/api` to `http://127.0.0.1:5174` in `vite.config.ts`.

**Also widen the vitest `include` glob.** Task 1 set it to `packages/*/test/**/*.test.ts`, which matches only `.test.ts`. This task's tests are `.test.tsx`, so without the change they are silently collected as zero tests and everything "passes". Change it to:

```ts
include: ["packages/*/test/**/*.test.{ts,tsx}"],
```

Then confirm the count: `npx vitest run --reporter=verbose` must list the `MapTree` tests by name. A green run that names no tests is a failing run.

- [ ] **Step 4: Write `MapTree`**

```tsx
// packages/ui/src/components/MapTree.tsx
import { useMemo, useState } from "react";

export interface MapGroupsData { groupOrder: string[]; groups: Record<string, string[]>; }

export interface MapTreeProps {
  data: MapGroupsData;
  selected: string | null;
  onSelect(name: string): void;
}

export function MapTree({ data, selected, onSelect }: MapTreeProps) {
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return data.groupOrder
      .map((g) => ({ group: g, maps: (data.groups[g] ?? []).filter((m) => !q || m.toLowerCase().includes(q)) }))
      .filter((g) => g.maps.length > 0);
  }, [data, filter]);

  return (
    <nav className="map-tree" aria-label="Maps">
      <input
        className="map-tree__filter"
        placeholder="Filter maps…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {visible.length === 0 ? (
        <p className="map-tree__empty">No maps match “{filter}”. Clear the filter to see all {data.groupOrder.length} groups.</p>
      ) : (
        visible.map(({ group, maps }) => (
          <details key={group} open>
            <summary>
              <span>{group.replace(/^gMapGroup_/, "")}</span>
              <span className="map-tree__count">{maps.length}</span>
            </summary>
            <ul>
              {maps.map((m) => (
                <li key={m}>
                  <button
                    type="button"
                    aria-current={selected === m ? "true" : undefined}
                    onClick={() => onSelect(m)}
                  >{m}</button>
                </li>
              ))}
            </ul>
          </details>
        ))
      )}
    </nav>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/ui/test/MapTree.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 6: Record the design system**

Write `packages/ui/DESIGN.md` capturing the tokens, spacing scale, type ramp and colour roles the two design skills produced. Plans 2–4 read this file rather than re-deriving a look.

- [ ] **Step 7: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): app shell and filterable map tree"
```

---

## Task 21: Single-map canvas with overlays

**Files:**
- Create: `packages/core/src/render/overlays.ts`
- Create: `packages/ui/src/components/MapCanvas.tsx`
- Test: `packages/core/test/render/overlays.test.ts`
- Test: `packages/ui/test/MapCanvas.test.tsx`

- [ ] **Step 1: Write the failing overlay test**

```ts
import { describe, it, expect } from "vitest";
import { openProject } from "../../src/project.js";
import { renderLayout } from "../../src/render/layout.js";
import { drawGrid, drawCollision, drawEvents } from "../../src/render/overlays.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const proj = openProject(SUBJECT_ROOT);

describe("overlays", () => {
  itWithCorpus("drawGrid only touches pixels on 16px boundaries", () => {
    const r = renderLayout(proj, proj.layoutForMap("PetalburgCity").name);
    const before = Buffer.from(r.data);
    drawGrid(r, 16);
    const changedInterior = (() => {
      for (let y = 1; y < 16; y++) for (let x = 1; x < 16; x++) {
        const i = (y * r.width + x) * 4;
        if (before[i] !== r.data[i]) return true;
      }
      return false;
    })();
    expect(changedInterior).toBe(false);
  });

  itWithCorpus("drawCollision tints exactly the blocked cells and nothing else", () => {
    const r = renderLayout(proj, proj.layoutForMap("PetalburgCity").name);
    expect(r.blocks.length).toBe(900);
    const blocked = r.blocks.filter((b) => b.collision !== 0).length;
    expect(blocked).toBe(429);

    const before = Buffer.from(r.data);
    drawCollision(r);

    // "does not throw" would pass against a function with an empty body. Count
    // the cells whose centre pixel actually changed and match it to the data.
    let changed = 0;
    for (let by = 0; by < r.blockHeight; by++) {
      for (let bx = 0; bx < r.blockWidth; bx++) {
        const px = r.originX + bx * 16 + 8;
        const py = r.originY + by * 16 + 8;
        const i = (py * r.width + px) * 4;
        if (before[i] !== r.data[i] || before[i + 1] !== r.data[i + 1] || before[i + 2] !== r.data[i + 2]) changed++;
      }
    }
    expect(changed).toBe(blocked);
  });

  itWithCorpus("drawEvents marks warps, objects and bg events distinctly", () => {
    const r = renderLayout(proj, proj.layoutForMap("CeladonCity").name);
    const map = proj.map("CeladonCity");
    const marks = drawEvents(r, map);
    expect(marks.filter((m) => m.kind === "object").length).toBe(map.objectEvents.length);
    expect(marks.filter((m) => m.kind === "warp").length).toBe(map.warpEvents.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/render/overlays.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the overlays**

```ts
// packages/core/src/render/overlays.ts
import type { MapData } from "../load/maps.js";
import type { LayoutRaster } from "./layout.js";
import { fillRect, type RGBA } from "./raster.js";

const GRID: RGBA = { r: 255, g: 255, b: 255, a: 40 };
const COLLISION: RGBA = { r: 220, g: 40, b: 40, a: 110 };

export function drawGrid(r: LayoutRaster, step = 16): void {
  for (let x = 0; x < r.width; x += step) fillRect(r, x, 0, 1, r.height, GRID);
  for (let y = 0; y < r.height; y += step) fillRect(r, 0, y, r.width, 1, GRID);
}

export function drawCollision(r: LayoutRaster): void {
  for (let y = 0; y < r.blockHeight; y++) {
    for (let x = 0; x < r.blockWidth; x++) {
      const b = r.blocks[y * r.blockWidth + x];
      if (!b || b.collision === 0) continue;
      fillRect(r, r.originX + x * 16, r.originY + y * 16, 16, 16, COLLISION);
    }
  }
}

export function drawElevation(r: LayoutRaster): void {
  for (let y = 0; y < r.blockHeight; y++) {
    for (let x = 0; x < r.blockWidth; x++) {
      const b = r.blocks[y * r.blockWidth + x];
      if (!b) continue;
      const v = Math.round((b.elevation / 15) * 255);
      fillRect(r, r.originX + x * 16, r.originY + y * 16, 16, 16, { r: v, g: 0, b: 255 - v, a: 90 });
    }
  }
}

export type EventKind = "object" | "warp" | "coord" | "bg";
export interface EventMark { kind: EventKind; x: number; y: number; label: string; }

/** Returns the marks so the UI can make them interactive; also paints them. */
export function drawEvents(r: LayoutRaster, map: MapData): EventMark[] {
  const marks: EventMark[] = [
    ...map.objectEvents.map((o) => ({ kind: "object" as const, x: o.x, y: o.y, label: o.graphicsId })),
    ...map.warpEvents.map((w) => ({ kind: "warp" as const, x: w.x, y: w.y, label: `→ ${w.destMap}` })),
    ...map.coordEvents.map((c) => ({ kind: "coord" as const, x: Number(c.x), y: Number(c.y), label: "trigger" })),
    ...map.bgEvents.map((b) => ({ kind: "bg" as const, x: Number(b.x), y: Number(b.y), label: b.type })),
  ];

  const colour: Record<EventKind, RGBA> = {
    object: { r: 60, g: 200, b: 90, a: 150 },
    warp: { r: 240, g: 190, b: 40, a: 150 },
    coord: { r: 200, g: 80, b: 240, a: 150 },
    bg: { r: 60, g: 160, b: 240, a: 150 },
  };

  for (const m of marks) fillRect(r, r.originX + m.x * 16, r.originY + m.y * 16, 16, 16, colour[m.kind]);
  return marks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/render/overlays.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Build the canvas component**

Invoke `frontend-design` and `ui-ux-pro-max` first, and follow `packages/ui/DESIGN.md`.

`MapCanvas.tsx` requirements, each of which gets a test in `packages/ui/test/MapCanvas.test.tsx`:
- Loads `/api/render/<map>.png?border=1` into an `<img>` and draws it to a `<canvas>` at integer zoom levels 1×, 2×, 4× — nearest-neighbour, never smoothed, because a blurred metatile is a lie about the art.
- Wheel zooms about the cursor; drag pans; a "fit" control resets.
- A toolbar toggles grid, collision, elevation and events independently. **Every toggle starts off** (spec §9) and turning one on reveals its legend.
- Hovering a block shows metatile id, collision, elevation and behaviour in a status strip — the id shown in hex, matching how `docs/human-porymap.md` writes them.
- The status strip always shows the layout's `layout_version` and resolved split. That number is the thing this tool exists to get right; it should never be more than a glance away.

- [ ] **Step 6: Run the UI tests**

Run: `npx vitest run packages/ui/test/MapCanvas.test.tsx`
Expected: PASS.

- [ ] **Step 7: Verify against the real app**

```bash
npm run dev -w @pokemap/ui
```

Open the app, select `PetalburgCity` (emerald/512) and then `NewBarkTown` (hns/640). **Both must render correctly without restarting anything.** That is the headline claim of this whole project; confirm it with your eyes before ticking this box.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/render/overlays.ts packages/core/test/render/overlays.test.ts packages/ui/src packages/ui/test
git commit -m "feat(ui): single-map canvas with grid, collision, elevation and event overlays"
```

---

# Phase F — The stitched world

## Task 22: Connection graph to global coordinates

**Files:**
- Create: `packages/core/src/world/connections.ts`
- Test: `packages/core/test/world/connections.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildWorld } from "../../src/world/connections.js";
import { openProject } from "../../src/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const proj = openProject(SUBJECT_ROOT);

/**
 * Set this to whatever the first correct run reports, then leave it alone.
 * A change here means a connection in the decomp started disagreeing with
 * itself -- a real finding to investigate, not a number to bump.
 */
const CONFLICT_BASELINE = 0;

describe("buildWorld", () => {
  itWithCorpus("places NewBarkTown's left neighbour to its left, at the stated offset", () => {
    const w = buildWorld(proj);
    const town = w.placements.get("NewBarkTown")!;
    const route = w.placements.get("Route29")!;
    expect(route.x).toBe(town.x - proj.layoutForMap("Route29").width);
    expect(route.y).toBe(town.y + -5);
    // NewBarkTown's layout is NewBarkTown_Layout; layoutByName("NewBarkTown")
    // returns undefined, which is why placements are keyed by MAP name.
    expect(proj.layoutForMap("NewBarkTown").name).toBe("NewBarkTown_Layout");
  });

  itWithCorpus("excludes dive and emerge from planar placement but records them as links", () => {
    const w = buildWorld(proj);
    expect(w.verticalLinks.length).toBe(14); // 7 dive + 7 emerge
    for (const l of w.verticalLinks) expect(["dive", "emerge"]).toContain(l.direction);
  });

  itWithCorpus("groups maps into the three landmasses plus the loose rooms", () => {
    const w = buildWorld(proj);
    expect(w.placements.size).toBe(1209);
    expect(w.components.length).toBe(1045);

    const sizes = w.components.map((c) => c.maps.length).sort((a, b) => b - a);
    // Hoenn, Johto, Kanto. Only 182 maps have any planar connection; the rest
    // are interiors and dungeon floors reached solely by warps.
    expect(sizes.slice(0, 3)).toEqual([51, 40, 37]);
    expect(sizes.filter((n) => n === 1).length).toBe(1028);
    expect(sizes.filter((n) => n > 1).length).toBe(17);

    expect(w.components.reduce((n, c) => n + c.maps.length, 0)).toBe(w.placements.size);
  });

  itWithCorpus("puts the right maps in the right landmass", () => {
    const w = buildWorld(proj);
    const componentOf = (m: string) => w.components[w.placements.get(m)!.component]!;
    // Same region -> same component; different regions -> different ones.
    expect(componentOf("NewBarkTown")).toBe(componentOf("CherrygroveCity"));
    expect(componentOf("NewBarkTown")).not.toBe(componentOf("CeladonCity"));
    expect(componentOf("NewBarkTown")).not.toBe(componentOf("PetalburgCity"));
    expect(componentOf("PetalburgCity").maps.length).toBe(51);
  });

  itWithCorpus("reports contradictions instead of silently picking one", () => {
    const w = buildWorld(proj);
    for (const c of w.conflicts) {
      expect(c.map).toBeTypeOf("string");
      expect(c.viaA.from).toBeTypeOf("string");
      expect(c.viaB.from).toBeTypeOf("string");
      // A conflict means two paths disagree; identical coordinates are not one.
      expect([c.viaA.x, c.viaA.y]).not.toEqual([c.viaB.x, c.viaB.y]);
    }
    // Pin the count. `toBeLessThanOrEqual(placements.size)` was near-vacuous --
    // it holds for almost any implementation, including one reporting none.
    // Record whatever the first correct run produces and treat a change as a
    // finding about the decomp's connection data, not noise to re-baseline.
    expect(w.conflicts.length).toBe(CONFLICT_BASELINE);
  });

  itWithCorpus("gives every component a non-overlapping bounding box", () => {
    const w = buildWorld(proj);
    for (let i = 0; i < w.components.length; i++) {
      for (let j = i + 1; j < w.components.length; j++) {
        const a = w.components[i]!.bounds, b = w.components[j]!.bounds;
        const overlaps = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlaps).toBe(false);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/world/connections.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/world/connections.ts
import type { Project } from "../project.js";
import type { ConnectionDirection } from "../load/maps.js";

export interface Placement { map: string; x: number; y: number; width: number; height: number; component: number; }
export interface Bounds { x: number; y: number; width: number; height: number; }
export interface Component { index: number; maps: string[]; bounds: Bounds; }
export interface VerticalLink { from: string; to: string; direction: "dive" | "emerge"; }
export interface Conflict { map: string; viaA: { from: string; x: number; y: number }; viaB: { from: string; x: number; y: number }; }

export interface World {
  placements: Map<string, Placement>;
  components: Component[];
  verticalLinks: VerticalLink[];
  conflicts: Conflict[];
}

const PLANAR = new Set<ConnectionDirection>(["up", "down", "left", "right"]);

/**
 * Breadth-first over the planar connection graph.
 *
 * offset is in tiles, along the shared edge:
 *   left  -> neighbour sits at (x - nWidth,  y + offset)
 *   right -> neighbour sits at (x + width,   y + offset)
 *   up    -> neighbour sits at (x + offset,  y - nHeight)
 *   down  -> neighbour sits at (x + offset,  y + height)
 *
 * dive/emerge are vertical and have no planar meaning; they are recorded
 * separately so the UI can badge them.
 */
export function buildWorld(proj: Project): World {
  const placements = new Map<string, Placement>();
  const verticalLinks: VerticalLink[] = [];
  const conflicts: Conflict[] = [];
  const components: Component[] = [];

  const sizeOf = (name: string) => {
    const l = proj.layoutById(proj.map(name).layout);
    return l ? { width: l.width, height: l.height } : { width: 0, height: 0 };
  };

  // Built ONCE. Connections name their target by map id, and resolving that
  // with `mapNames().find(...)` inside the BFS below would rescan all 1,209
  // maps per connection edge -- quadratic for no reason. warpGraph.ts already
  // does it this way; this keeps the two consistent.
  const idToName = new Map(proj.mapNames().map((n) => [proj.map(n).id, n]));

  const remaining = new Set(proj.mapNames());

  while (remaining.size > 0) {
    const seed = [...remaining][0]!;
    const index = components.length;
    const maps: string[] = [];
    const queue: string[] = [seed];

    const seedSize = sizeOf(seed);
    placements.set(seed, { map: seed, x: 0, y: 0, ...seedSize, component: index });
    remaining.delete(seed);
    maps.push(seed);

    while (queue.length) {
      const name = queue.shift()!;
      const here = placements.get(name)!;

      for (const c of proj.map(name).connections) {
        const target = idToName.get(c.map);
        if (!target) continue;

        if (!PLANAR.has(c.direction)) {
          verticalLinks.push({ from: name, to: target, direction: c.direction as "dive" | "emerge" });
          continue;
        }

        const size = sizeOf(target);
        const pos =
          c.direction === "left" ? { x: here.x - size.width, y: here.y + c.offset } :
          c.direction === "right" ? { x: here.x + here.width, y: here.y + c.offset } :
          c.direction === "up" ? { x: here.x + c.offset, y: here.y - size.height } :
          { x: here.x + c.offset, y: here.y + here.height };

        const existing = placements.get(target);
        if (existing) {
          if (existing.x !== pos.x || existing.y !== pos.y) {
            conflicts.push({
              map: target,
              viaA: { from: name, x: pos.x, y: pos.y },
              viaB: { from: "(already placed)", x: existing.x, y: existing.y },
            });
          }
          continue;
        }

        placements.set(target, { map: target, ...pos, ...size, component: index });
        remaining.delete(target);
        maps.push(target);
        queue.push(target);
      }
    }

    components.push({ index, maps, bounds: boundsOf(maps, placements) });
  }

  layOutComponents(components, placements);
  return { placements, components, verticalLinks, conflicts };
}

function boundsOf(maps: string[], placements: Map<string, Placement>): Bounds {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of maps) {
    const p = placements.get(m)!;
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + p.width); y1 = Math.max(y1, p.y + p.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Shelf-pack components left to right so no two overlap. */
function layOutComponents(components: Component[], placements: Map<string, Placement>): void {
  const GAP = 8;
  let cursorX = 0;
  for (const c of components) {
    const dx = cursorX - c.bounds.x;
    for (const m of c.maps) {
      const p = placements.get(m)!;
      p.x += dx;
    }
    c.bounds.x += dx;
    cursorX += c.bounds.width + GAP;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/world/connections.test.ts`
Expected: PASS, 5 tests.

If the conflicts list is large, that is a finding about the subject repo, not necessarily a bug in this code. Print it and check a couple by hand against `data/maps/<Name>/map.json` before adjusting the algorithm.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/world/connections.ts packages/core/test/world/connections.test.ts
git commit -m "feat(core): build a global coordinate space from the connection graph"
```

---

## Task 23: Dungeon auto-layout from the warp graph

**Files:**
- Create: `packages/core/src/world/warpGraph.ts`
- Test: `packages/core/test/world/warpGraph.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { autoLayoutUnplaced } from "../../src/world/warpGraph.js";
import { buildWorld } from "../../src/world/connections.js";
import { openProject } from "../../src/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const proj = openProject(SUBJECT_ROOT);

describe("autoLayoutUnplaced", () => {
  itWithCorpus("places every map that has no planar connections", () => {
    const world = buildWorld(proj);
    const before = world.placements.size;
    const placed = autoLayoutUnplaced(proj, world);
    expect(placed.size).toBeGreaterThan(0);
    expect(world.placements.size).toBe(before); // buildWorld's result is not mutated
  });

  itWithCorpus("clusters maps linked by warps near each other", () => {
    const world = buildWorld(proj);
    const placed = autoLayoutUnplaced(proj, world);
    const base = placed.get("NavelRock_Base");
    const bottom = placed.get("NavelRock_Bottom");
    if (base && bottom) {
      const dist = Math.hypot(base.x - bottom.x, base.y - bottom.y);
      expect(dist).toBeLessThan(400);
    }
  });

  itWithCorpus("produces no overlapping placements", () => {
    const world = buildWorld(proj);
    const all = [...autoLayoutUnplaced(proj, world).values()];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]!, b = all[j]!;
        const overlaps = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlaps).toBe(false);
      }
    }
  });

  itWithCorpus("returns an empty map when auto-layout is disabled", () => {
    const world = buildWorld(proj);
    expect(autoLayoutUnplaced(proj, world, { enabled: false }).size).toBe(0);
  });
});
```

The fourth test is the user-facing toggle from the design: with dungeon stitching off, the canvas starts empty and maps are dragged on by hand.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/world/warpGraph.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/world/warpGraph.ts
import type { Project } from "../project.js";
import type { Placement, World } from "./connections.js";

export interface AutoLayoutOptions {
  /** When false, nothing is placed — the user drags maps on by hand. */
  enabled?: boolean;
  /** Tiles of empty space between packed maps. */
  gap?: number;
  /** Where the dungeon shelf starts, in tiles. */
  originX?: number;
  originY?: number;
}

/**
 * A starting guess, not a truth. Warps are not geometrically consistent — two
 * floors linked by a ladder have no defined relative position — so this groups
 * warp-connected maps into clusters and shelf-packs each cluster. The user
 * drags to correct, and the correction is what persists (see world/sidecar).
 */
export function autoLayoutUnplaced(proj: Project, world: World, opts: AutoLayoutOptions = {}): Map<string, Placement> {
  const out = new Map<string, Placement>();
  if (opts.enabled === false) return out;

  const gap = opts.gap ?? 4;
  const unplaced = proj.mapNames().filter((n) => !world.placements.has(n));
  if (unplaced.length === 0) return out;

  const idToName = new Map(proj.mapNames().map((n) => [proj.map(n).id, n]));
  const unplacedSet = new Set(unplaced);

  // Union-find over warp links, restricted to unplaced maps.
  const parent = new Map<string, string>(unplaced.map((n) => [n, n]));
  const find = (n: string): string => {
    let r = n;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (parent.get(n) !== r) { const next = parent.get(n)!; parent.set(n, r); n = next; }
    return r;
  };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  for (const n of unplaced) {
    for (const w of proj.map(n).warpEvents) {
      const dest = idToName.get(w.destMap);
      if (dest && unplacedSet.has(dest)) union(n, dest);
    }
  }

  const clusters = new Map<string, string[]>();
  for (const n of unplaced) {
    const r = find(n);
    (clusters.get(r) ?? clusters.set(r, []).get(r)!).push(n);
  }

  const sizeOf = (name: string) => {
    const l = proj.layoutById(proj.map(name).layout);
    return { width: l?.width ?? 0, height: l?.height ?? 0 };
  };

  // Shelf-pack: clusters left to right, maps within a cluster in rows.
  const worldBottom = Math.max(0, ...world.components.map((c) => c.bounds.y + c.bounds.height));
  let shelfX = opts.originX ?? 0;
  const shelfY = opts.originY ?? worldBottom + 32;
  let componentIndex = world.components.length;

  for (const maps of clusters.values()) {
    const sorted = [...maps].sort((a, b) => sizeOf(b).height - sizeOf(a).height);
    const columns = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
    let x = shelfX, y = shelfY, rowHeight = 0, col = 0, clusterWidth = 0;

    for (const name of sorted) {
      const size = sizeOf(name);
      out.set(name, { map: name, x, y, ...size, component: componentIndex });
      x += size.width + gap;
      rowHeight = Math.max(rowHeight, size.height);
      clusterWidth = Math.max(clusterWidth, x - shelfX);
      if (++col >= columns) { col = 0; x = shelfX; y += rowHeight + gap; rowHeight = 0; }
    }

    shelfX += clusterWidth + gap * 4;
    componentIndex++;
  }

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/world/warpGraph.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/world/warpGraph.ts packages/core/test/world/warpGraph.test.ts
git commit -m "feat(core): shelf-pack unconnected maps from the warp graph as a starting guess"
```

---

## Task 24: The sidecar

The only file PokeMap writes in this whole plan, and it lives outside the build. Invariant **I8**.

**Files:**
- Create: `packages/core/src/world/sidecar.ts`
- Test: `packages/core/test/world/sidecar.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSidecar, writeSidecar, applySidecar, type Sidecar } from "../../src/world/sidecar.js";

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/world/sidecar.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/world/sidecar.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Placement } from "./connections.js";

export interface Sidecar {
  version: 1;
  dungeonAutoLayout: boolean;
  manualPlacements: Record<string, { x: number; y: number }>;
  view: { x: number; y: number; zoom: number };
}

const DEFAULTS: Sidecar = {
  version: 1,
  dungeonAutoLayout: true,
  manualPlacements: {},
  view: { x: 0, y: 0, zoom: 1 },
};

const file = (root: string) => `${root.replace(/\\/g, "/")}/.pokemap/world.json`;

export function readSidecar(root: string): Sidecar {
  const path = file(root);
  if (!existsSync(path)) return structuredClone(DEFAULTS);
  return { ...structuredClone(DEFAULTS), ...(JSON.parse(readFileSync(path, "utf8")) as Partial<Sidecar>) };
}

/**
 * The only write PokeMap performs outside the decomp's own data files (I8).
 * This file never affects the ROM build.
 */
export function writeSidecar(root: string, s: Sidecar): void {
  const path = file(root);
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  writeFileSync(path, `${JSON.stringify(s, null, 2)}\n`);
}

export function applySidecar(auto: Map<string, Placement>, s: Sidecar): Map<string, Placement> {
  const out = new Map(auto);
  for (const [name, pos] of Object.entries(s.manualPlacements)) {
    const existing = out.get(name);
    out.set(name, existing ? { ...existing, ...pos } : { map: name, ...pos, width: 0, height: 0, component: -1 });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/world/sidecar.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/world/sidecar.ts packages/core/test/world/sidecar.test.ts
git commit -m "feat(core): persist world layout to .pokemap/world.json"
```

---

## Task 25: The world canvas

**Files:**
- Modify: `packages/server/src/index.ts` (add `/api/world`, `/api/world/placement`)
- Create: `packages/ui/src/components/WorldCanvas.tsx`
- Test: `packages/server/test/world.test.ts`
- Test: `packages/ui/test/WorldCanvas.test.tsx`

- [ ] **Step 1: Write the failing server test**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";

let s: PokemapServer;
beforeAll(async () => { s = await createServer({ projectPath: SUBJECT_ROOT, port: 0 }); });
afterAll(async () => { await s.close(); });

describe.skipIf(!hasProject(SUBJECT_ROOT))("world api", () => {
  it("returns placements, components, conflicts and vertical links", async () => {
    const w = await (await fetch(`http://127.0.0.1:${s.port}/api/world`)).json() as any;
    expect(Object.keys(w.placements).length).toBe(1209);
    expect(w.verticalLinks.length).toBe(14);
    expect(Array.isArray(w.conflicts)).toBe(true);
  }, 300_000);

  it("respects the dungeonAutoLayout flag", async () => {
    const on = await (await fetch(`http://127.0.0.1:${s.port}/api/world?dungeons=1`)).json() as any;
    const off = await (await fetch(`http://127.0.0.1:${s.port}/api/world?dungeons=0`)).json() as any;
    expect(Object.keys(on.placements).length).toBeGreaterThan(Object.keys(off.placements).length);
  }, 300_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/test/world.test.ts`
Expected: FAIL — `/api/world` 404s.

- [ ] **Step 3: Add the endpoints**

In `packages/server/src/index.ts`, add before the 404:

```ts
if (url.pathname === "/api/world") {
  const dungeons = url.searchParams.get("dungeons") !== "0";
  const world = buildWorld(project);
  const sidecar = readSidecar(project.paths.root);
  const auto = autoLayoutUnplaced(project, world, { enabled: dungeons && sidecar.dungeonAutoLayout });
  const merged = applySidecar(new Map([...world.placements, ...auto]), sidecar);
  return send(200, {
    placements: Object.fromEntries(merged),
    components: world.components,
    conflicts: world.conflicts,
    verticalLinks: world.verticalLinks,
    sidecar,
  });
}

if (url.pathname === "/api/world/placement" && req.method === "POST") {
  return readBody(req).then((body) => {
    const { map, x, y } = JSON.parse(body) as { map: string; x: number; y: number };
    const sidecar = readSidecar(project.paths.root);
    sidecar.manualPlacements[map] = { x, y };
    writeSidecar(project.paths.root, sidecar);
    send(200, { ok: true });
  });
}
```

Cache the `buildWorld` result — it walks 1,209 maps and must not run per request.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/server/test/world.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Build the world canvas**

Invoke `frontend-design` and `ui-ux-pro-max`, follow `packages/ui/DESIGN.md`.

Requirements, each with a test in `packages/ui/test/WorldCanvas.test.tsx`:
- **Culling:** only maps intersecting the viewport are fetched and drawn. With 1,209 maps this is what makes the view usable at all — assert that a viewport containing 3 maps issues 3 image requests, not 1,209.
- **LOD:** below a zoom threshold, draw cached downscaled buffers rather than full-resolution PNGs.
- **Pan/zoom:** drag to pan, wheel to zoom about the cursor, and a "fit world" control.
- **Drag to place:** dragging a map posts to `/api/world/placement` and the position survives a reload.
- **Dungeon toggle:** a visible switch for `dungeonAutoLayout`. Off means unconnected maps are not placed; a side rail lists them and they can be dragged onto the canvas.
- **Conflict badges:** every entry in `conflicts` draws a marker on the offending map with a tooltip naming both paths that disagree. Connection bugs become visible as geometry — do not hide them.
- **Dive/emerge badges:** the 14 vertical links draw as a distinct icon, not as adjacency.

- [ ] **Step 6: Add `pokemap render-world`**

Spec §11's second render command, and what `pokemap_render_world` wraps in Plan 4. Composites placed maps into one raster over a bounding box given in tiles.

```ts
program
  .command("render-world")
  .description("render a region of the stitched world to a PNG")
  .requiredOption("--bbox <x,y,w,h>", "region in tiles")
  .option("-o, --out <file>", "output path", "world.png")
  .option("--scale <n>", "pixels per tile (16 = full size, 4 = overview)", "4")
  .option("--no-dungeons", "exclude auto-placed dungeon maps")
  .action((opts: { bbox: string; out: string; scale: string; dungeons: boolean }) => {
    const proj = resolveProject(program.opts().project);
    const [bx, by, bw, bh] = opts.bbox.split(",").map(Number) as [number, number, number, number];
    const scale = Number(opts.scale);

    const world = buildWorld(proj);
    const sidecar = readSidecar(proj.paths.root);
    const auto = autoLayoutUnplaced(proj, world, { enabled: opts.dungeons && sidecar.dungeonAutoLayout });
    const placements = applySidecar(new Map([...world.placements, ...auto]), sidecar);

    const dst = createRaster(bw * scale, bh * scale);
    let drawn = 0;
    for (const p of placements.values()) {
      if (p.x + p.width <= bx || p.x >= bx + bw || p.y + p.height <= by || p.y >= by + bh) continue;
      const layoutName = proj.layoutById(proj.map(p.map).layout)?.name;
      if (!layoutName) continue;
      blitScaled(dst, renderLayout(proj, layoutName), (p.x - bx) * scale, (p.y - by) * scale, scale / 16);
      drawn++;
    }

    writeFileSync(opts.out, encodePng(dst));
    process.stdout.write(`${opts.out} ${dst.width}x${dst.height} maps=${drawn}\n`);
  });
```

`blitScaled` is a nearest-neighbour variant of `blit`; add it to `packages/core/src/render/raster.ts` with a test asserting that a scale of 1 is byte-identical to `blit` and that a scale of 0.25 samples every fourth pixel. Nearest-neighbour, never smoothed — the same rule as the canvas, for the same reason.

Run: `npx tsx packages/cli/src/index.ts render-world --bbox 0,0,400,400 --scale 4 --out world.png`
Expected: a PNG showing several stitched maps, with `maps=` well above 1. Open it and look.

- [ ] **Step 7: Verify in the real app**

```bash
npm run dev -w @pokemap/ui
```

Zoom out to the whole world. **Confirm Johto and Kanto read as continuous landmasses and that panning stays smooth.** Then drag a NavelRock floor, reload, and confirm it stayed put. This is the feature the project was asked for; verify it with your eyes.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/render/raster.ts packages/cli/src/index.ts packages/server/src/index.ts packages/server/test/world.test.ts packages/ui/src packages/ui/test
git commit -m "feat(ui): stitched world canvas with culling, LOD, drag placement and conflict badges"
```

---

# Phase G — Encounter atlas

## Task 26: Wild encounters with true percentages

**Files:**
- Create: `packages/core/src/load/encounters.ts`
- Test: `packages/core/test/load/encounters.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseEncounters, speciesChances, FISHING_RODS } from "../../src/load/encounters.js";
import { projectPaths } from "../../src/config/paths.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const P = projectPaths(SUBJECT_ROOT);
const enc = parseEncounters(readFileSync(P.wildEncountersJson, "utf8"));

describe("parseEncounters", () => {
  itWithCorpus("reads all three groups with their slot weights", () => {
    expect(enc.groups.get("gWildMonHeaders")!.entries.length).toBe(497);
    const fields = enc.groups.get("gWildMonHeaders")!.fields;
    expect(fields.get("land_mons")!.length).toBe(12);
    expect(fields.get("water_mons")!.length).toBe(5);
    expect(fields.get("rock_smash_mons")!.length).toBe(5);
    expect(fields.get("fishing_mons")!.length).toBe(10);
  });

  itWithCorpus("land, water and rock smash sum to 100 -- fishing sums to 300", () => {
    const fields = enc.groups.get("gWildMonHeaders")!.fields;
    for (const m of ["land_mons", "water_mons", "rock_smash_mons"] as const) {
      expect(fields.get(m)!.reduce((a, b) => a + b, 0)).toBe(100);
    }
    // Fishing is THREE independent distributions -- one per rod -- packed into
    // one array: [70,30 | 60,20,20 | 40,40,15,4,1]. Summing the whole thing and
    // calling it a probability yields 300%.
    expect(fields.get("fishing_mons")!.reduce((a, b) => a + b, 0)).toBe(300);
    for (const { from, count } of FISHING_RODS) {
      expect(fields.get("fishing_mons")!.slice(from, from + count).reduce((a, b) => a + b, 0)).toBe(100);
    }
  });

  itWithCorpus("returns EVERY entry for a map, not just the first", () => {
    // 125 maps here carry more than one table. `.find()` would silently hide
    // three quarters of Route 101's data and present the day table as if it
    // were the only one that existed.
    const entries = enc.forMap("MAP_ROUTE101");
    expect(entries.map((e) => e.baseLabel)).toEqual([
      "gRoute101", "gRoute101_Night", "gRoute101_DayC", "gRoute101_NightC",
    ]);
    expect(entries[0]!.methods.land_mons!.encounterRate).toBe(20);
    expect(entries[0]!.methods.land_mons!.mons.length).toBe(12);
  });

  itWithCorpus("distinct variants really do hold distinct species", () => {
    const entries = enc.forMap("MAP_ROUTE101");
    expect(entries[0]!.methods.land_mons!.mons[0]!.species).toBe("SPECIES_ESPEON");
    expect(entries[1]!.methods.land_mons!.mons[0]!.species).toBe("SPECIES_UMBREON");
  });

  itWithCorpus("counts the maps carrying multiple tables", () => {
    const byMap = new Map<string, number>();
    for (const e of enc.groups.get("gWildMonHeaders")!.entries) {
      byMap.set(e.map, (byMap.get(e.map) ?? 0) + 1);
    }
    expect(byMap.size).toBe(227);                                    // distinct maps
    expect([...byMap.values()].filter((n) => n > 1).length).toBe(125);
    expect(Math.max(...byMap.values())).toBe(9);                     // MAP_ALTERING_CAVE
  });

  itWithCorpus("returns an empty array for a map with no table", () => {
    expect(enc.forMap("MAP_NO_SUCH_MAP")).toEqual([]);
  });
});

describe("speciesChances", () => {
  itWithCorpus("weights by slot rate, not slot count", () => {
    const chances = speciesChances(enc, "MAP_ROUTE101", "land_mons")!;
    expect(chances.reduce((a, c) => a + c.percent, 0)).toBeCloseTo(100, 5);
  });

  itWithCorpus("reads the requested variant, not always the first", () => {
    const day = speciesChances(enc, "MAP_ROUTE101", "land_mons")!;
    const night = speciesChances(enc, "MAP_ROUTE101", "land_mons", { entry: 1 })!;
    expect(day[0]!.species).toBe("SPECIES_ESPEON");
    expect(night[0]!.species).toBe("SPECIES_UMBREON");
  });

  itWithCorpus("computes fishing percentages PER ROD, so each rod totals 100", () => {
    // Without the rod split a species in Old Rod slot 0 reads as 70% of all
    // fishing encounters rather than 70% of Old Rod ones, and every map's
    // fishing figures sum to 300%.
    const withFishing = enc.groups.get("gWildMonHeaders")!.entries.find((e) => e.methods.fishing_mons)!;
    for (const { rod } of FISHING_RODS) {
      const chances = speciesChances(enc, withFishing.map, "fishing_mons", { rod })!;
      expect(chances.reduce((a, c) => a + c.percent, 0)).toBeCloseTo(100, 5);
    }
  });

  itWithCorpus("merges duplicate species across slots and reports a level band", () => {
    const chances = speciesChances(enc, "MAP_ROUTE101", "land_mons")!;
    const espeon = chances.find((c) => c.species === "SPECIES_ESPEON")!;
    expect(espeon.percent).toBeCloseTo(100, 5);
    expect(espeon.minLevel).toBe(2);
    expect(espeon.slots.length).toBe(12);
  });

  itWithCorpus("returns undefined for a map with no table", () => {
    expect(speciesChances(enc, "MAP_NO_SUCH_MAP", "land_mons")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/load/encounters.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/load/encounters.ts
export type Method = "land_mons" | "water_mons" | "rock_smash_mons" | "fishing_mons";

export interface Mon { minLevel: number; maxLevel: number; species: string; }
export interface MethodTable { encounterRate: number; mons: Mon[]; }
export interface EncounterEntry {
  map: string;
  /** e.g. "gRoute101_Night" -- the only thing distinguishing a map's variants. */
  baseLabel: string;
  methods: Partial<Record<Method, MethodTable>>;
}
export interface EncounterGroup { label: string; fields: Map<Method, number[]>; entries: EncounterEntry[]; }

export type Rod = "old" | "good" | "super";

/**
 * fishing_mons packs THREE distributions into one 10-slot array, one per rod,
 * each summing to 100: [70,30 | 60,20,20 | 40,40,15,4,1]. Treating it as a
 * single distribution makes every fishing percentage wrong and the totals 300%.
 */
export const FISHING_RODS: readonly { rod: Rod; from: number; count: number }[] = [
  { rod: "old", from: 0, count: 2 },
  { rod: "good", from: 2, count: 3 },
  { rod: "super", from: 5, count: 5 },
];

export interface Encounters {
  groups: Map<string, EncounterGroup>;
  /**
   * ALL entries for a map, in file order -- 125 maps in the subject tree have
   * more than one (day, night and two further variants; MAP_ALTERING_CAVE has
   * nine). Returning just the first would hide most of the data while looking
   * like an answer.
   */
  forMap(mapId: string, group?: string): EncounterEntry[];
  fieldsFor(group: string): Map<Method, number[]>;
}

export interface SpeciesChance {
  species: string;
  /** True probability within its distribution, 0-100. For fishing that means
   *  within the selected rod, not across all ten slots. */
  percent: number;
  minLevel: number;
  maxLevel: number;
  slots: number[];
}

export interface ChanceOptions {
  /** Which of the map's entries (day/night/variant). Defaults to the first. */
  entry?: number;
  /** Required in practice for fishing; ignored for other methods. Defaults to "old". */
  rod?: Rod;
}

export function parseEncounters(text: string): Encounters {
  const raw = JSON.parse(text) as { wild_encounter_groups: any[] };
  const groups = new Map<string, EncounterGroup>();

  for (const g of raw.wild_encounter_groups) {
    const fields = new Map<Method, number[]>();
    for (const f of g.fields ?? []) fields.set(f.type as Method, f.encounter_rates as number[]);

    groups.set(g.label, {
      label: g.label,
      fields,
      entries: (g.encounters ?? []).map((e: any) => {
        const methods: Partial<Record<Method, MethodTable>> = {};
        for (const m of ["land_mons", "water_mons", "rock_smash_mons", "fishing_mons"] as Method[]) {
          if (!e[m]) continue;
          methods[m] = {
            encounterRate: Number(e[m].encounter_rate),
            mons: (e[m].mons as any[]).map((x) => ({
              minLevel: Number(x.min_level), maxLevel: Number(x.max_level), species: String(x.species),
            })),
          };
        }
        return { map: e.map, baseLabel: e.base_label, methods };
      }),
    });
  }

  return {
    groups,
    fieldsFor: (g) => groups.get(g)?.fields ?? new Map(),
    forMap: (mapId, group = "gWildMonHeaders") =>
      (groups.get(group)?.entries ?? []).filter((e) => e.map === mapId),
  };
}

/**
 * The real chance of meeting each species, from the per-slot weights.
 *
 * Slot count is not the answer: land_mons slot 0 is 20% and slot 11 is 1%.
 * A species in slots 0 and 1 is a 40% encounter; one in slots 10 and 11 is 2%.
 */
export function speciesChances(
  enc: Encounters, mapId: string, method: Method,
  opts: ChanceOptions = {}, group = "gWildMonHeaders",
): SpeciesChance[] | undefined {
  const entries = enc.forMap(mapId, group);
  const table = entries[opts.entry ?? 0]?.methods[method];
  if (!table) return undefined;

  const weights = enc.fieldsFor(group).get(method) ?? [];

  // Fishing is scoped to one rod; every other method spans all its slots.
  const segment = method === "fishing_mons"
    ? FISHING_RODS.find((r) => r.rod === (opts.rod ?? "old"))!
    : { from: 0, count: table.mons.length };

  const by = new Map<string, SpeciesChance>();

  for (let slot = segment.from; slot < segment.from + segment.count; slot++) {
    const mon = table.mons[slot];
    if (!mon) continue;
    const weight = weights[slot] ?? 0;
    const found = by.get(mon.species);
    if (found) {
      found.percent += weight;
      found.minLevel = Math.min(found.minLevel, mon.minLevel);
      found.maxLevel = Math.max(found.maxLevel, mon.maxLevel);
      found.slots.push(slot);
    } else {
      by.set(mon.species, {
        species: mon.species, percent: weight,
        minLevel: mon.minLevel, maxLevel: mon.maxLevel, slots: [slot],
      });
    }
  }

  return [...by.values()].sort((a, b) => b.percent - a.percent);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/load/encounters.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/load/encounters.ts packages/core/test/load/encounters.test.ts
git commit -m "feat(core): load wild encounters and compute true species percentages"
```

---

## Task 27: Coverage analysis and the encounter CLI

**Files:**
- Create: `packages/core/src/analyse/coverage.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/core/test/analyse/coverage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { whereSpecies, coverage } from "../../src/analyse/coverage.js";
import { openProject } from "../../src/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const proj = openProject(SUBJECT_ROOT);

describe("whereSpecies", () => {
  itWithCorpus("finds every map containing a species, with rate and level band", () => {
    const hits = whereSpecies(proj, "SPECIES_ESPEON");
    expect(hits.length).toBeGreaterThan(0);
    const route101 = hits.find((h) => h.mapId === "MAP_ROUTE101")!;
    expect(route101.method).toBe("land_mons");
    expect(route101.variant).toBe("gRoute101");
    expect(route101.percent).toBeCloseTo(100, 5);
    expect(route101.minLevel).toBe(2);
  });

  itWithCorpus("finds a species that exists only in a NIGHT variant", () => {
    // The decisive test for variant support. Umbreon is on Route 101 at night
    // and absent from its day table, so a search reading only each map's first
    // entry reports that it cannot be caught anywhere at all.
    const hits = whereSpecies(proj, "SPECIES_UMBREON");
    const route101 = hits.find((h) => h.mapId === "MAP_ROUTE101");
    expect(route101).toBeDefined();
    expect(route101!.variant).toBe("gRoute101_Night");
  });

  itWithCorpus("returns nothing for a species that appears nowhere", () => {
    expect(whereSpecies(proj, "SPECIES_NOT_A_REAL_MON")).toEqual([]);
  });
});

describe("coverage", () => {
  itWithCorpus("counts DISTINCT maps, not tables", () => {
    const c = coverage(proj);
    // 497 tables spread across 227 maps. Reporting 497 as "maps with
    // encounters" overstates coverage by more than double and makes the whole
    // gap analysis useless, because 125 maps carry several variants each.
    expect(c.encounterTables).toBe(497);
    expect(c.mapsWithEncounters).toBe(227);
    expect(c.mapsWithoutEncounters.length).toBe(982);
    expect(c.mapsWithEncounters + c.mapsWithoutEncounters.length).toBe(proj.mapNames().length);
  });

  itWithCorpus("reports an average level per map for the level-curve lens", () => {
    const c = coverage(proj);
    const withLevels = c.levelByMap.filter((m) => m.averageLevel > 0);
    expect(withLevels.length).toBeGreaterThan(400);
    for (const m of withLevels) expect(m.averageLevel).toBeGreaterThan(1);
  });

  itWithCorpus("lists species that appear in zero encounter tables", () => {
    const c = coverage(proj);
    expect(Array.isArray(c.unusedSpecies)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/analyse/coverage.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/analyse/coverage.ts
import { readFileSync, existsSync, readdirSync } from "node:fs";
import type { Project } from "../project.js";
import { parseEncounters, speciesChances, type Encounters, type Method } from "../load/encounters.js";

const METHODS: Method[] = ["land_mons", "water_mons", "rock_smash_mons", "fishing_mons"];

export interface SpeciesHit {
  mapId: string; mapName?: string; method: Method;
  /** Which of the map's tables this hit came from, e.g. "gRoute101_Night". */
  variant: string;
  rod?: Rod;
  percent: number; minLevel: number; maxLevel: number;
}

export interface Coverage {
  /** DISTINCT maps carrying at least one table -- not the table count, which is
   *  far higher because 125 maps have several variants each. */
  mapsWithEncounters: number;
  /** Total tables across all maps, counting every day/night variant. */
  encounterTables: number;
  mapsWithoutEncounters: string[];
  levelByMap: { mapId: string; averageLevel: number }[];
  unusedSpecies: string[];
  byMethod: Record<Method, number>;
}

function load(proj: Project): Encounters {
  return parseEncounters(readFileSync(proj.paths.wildEncountersJson, "utf8"));
}

export function whereSpecies(proj: Project, species: string): SpeciesHit[] {
  const enc = load(proj);
  const idToName = new Map(proj.mapNames().map((n) => [proj.map(n).id, n]));
  const out: SpeciesHit[] = [];

  const entries = enc.groups.get("gWildMonHeaders")?.entries ?? [];

  // Search EVERY variant, not just each map's first table. A night-only species
  // would otherwise be reported as appearing nowhere -- the search would
  // confidently return an empty list for a Pokemon the player can catch.
  const indexWithinMap = new Map<EncounterEntry, number>();
  const seenPerMap = new Map<string, number>();
  for (const e of entries) {
    const n = seenPerMap.get(e.map) ?? 0;
    indexWithinMap.set(e, n);
    seenPerMap.set(e.map, n + 1);
  }

  for (const entry of entries) {
    for (const method of METHODS) {
      const rods: (Rod | undefined)[] = method === "fishing_mons"
        ? FISHING_RODS.map((r) => r.rod)
        : [undefined];

      for (const rod of rods) {
        const chances = speciesChances(enc, entry.map, method, {
          entry: indexWithinMap.get(entry)!, rod,
        });
        const hit = chances?.find((c) => c.species === species);
        if (!hit) continue;
        out.push({
          mapId: entry.map, mapName: idToName.get(entry.map), method,
          variant: entry.baseLabel, rod,
          percent: hit.percent, minLevel: hit.minLevel, maxLevel: hit.maxLevel,
        });
      }
    }
  }

  return out.sort((a, b) => b.percent - a.percent);
}

export function coverage(proj: Project): Coverage {
  const enc = load(proj);
  const entries = enc.groups.get("gWildMonHeaders")?.entries ?? [];
  const withTable = new Set(entries.map((e) => e.map));

  const seen = new Set<string>();
  const levelByMap: Coverage["levelByMap"] = [];
  const byMethod = { land_mons: 0, water_mons: 0, rock_smash_mons: 0, fishing_mons: 0 } as Record<Method, number>;

  // The level curve is per MAP, averaged over every variant that map carries,
  // so a route is not counted four times merely because it has four tables.
  const perMap = new Map<string, { weighted: number; total: number }>();
  const seenPerMap = new Map<string, number>();

  for (const e of entries) {
    const entryIndex = seenPerMap.get(e.map) ?? 0;
    seenPerMap.set(e.map, entryIndex + 1);

    for (const method of METHODS) {
      const rods: (Rod | undefined)[] = method === "fishing_mons"
        ? FISHING_RODS.map((r) => r.rod)
        : [undefined];

      for (const rod of rods) {
        const chances = speciesChances(enc, e.map, method, { entry: entryIndex, rod });
        if (!chances) continue;
        // Count a method once per table, not once per rod.
        if (rod === undefined || rod === "old") byMethod[method]++;
        const acc = perMap.get(e.map) ?? { weighted: 0, total: 0 };
        for (const c of chances) {
          seen.add(c.species);
          acc.weighted += ((c.minLevel + c.maxLevel) / 2) * c.percent;
          acc.total += c.percent;
        }
        perMap.set(e.map, acc);
      }
    }
  }

  for (const [mapId, a] of perMap) {
    levelByMap.push({ mapId, averageLevel: a.total ? a.weighted / a.total : 0 });
  }

  return {
    mapsWithEncounters: withTable.size,
    encounterTables: entries.length,
    mapsWithoutEncounters: proj.mapNames().filter((n) => !withTable.has(proj.map(n).id)),
    levelByMap,
    unusedSpecies: allSpecies(proj).filter((s) => !seen.has(s)),
    byMethod,
  };
}

/** Species the project actually has art for — the honest denominator. */
function allSpecies(proj: Project): string[] {
  const dir = `${proj.paths.root}/graphics/pokemon`;
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `SPECIES_${d.name.toUpperCase()}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/analyse/coverage.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the CLI commands**

```ts
program
  .command("encounters <map>")
  .description("wild encounters for a map, with true percentages")
  .option("--json", "machine-readable output")
  .action((map: string, opts: { json?: boolean }) => {
    const proj = resolveProject(program.opts().project);
    const enc = parseEncounters(readFileSync(proj.paths.wildEncountersJson, "utf8"));
    const mapId = proj.map(map).id;
    const result = Object.fromEntries(
      (["land_mons", "water_mons", "rock_smash_mons", "fishing_mons"] as const)
        .map((m) => [m, speciesChances(enc, mapId, m)])
        .filter(([, v]) => v),
    );
    if (opts.json) return void process.stdout.write(JSON.stringify(result, null, 2));
    for (const [method, chances] of Object.entries(result)) {
      process.stdout.write(`${method}\n`);
      for (const c of chances as SpeciesChance[]) {
        process.stdout.write(`  ${c.percent.toFixed(1).padStart(5)}%  Lv ${c.minLevel}-${c.maxLevel}  ${c.species}\n`);
      }
    }
  });

program
  .command("where <species>")
  .description("every map a species can be caught on")
  .option("--json", "machine-readable output")
  .action((species: string, opts: { json?: boolean }) => {
    const proj = resolveProject(program.opts().project);
    const hits = whereSpecies(proj, species.startsWith("SPECIES_") ? species : `SPECIES_${species.toUpperCase()}`);
    if (opts.json) return void process.stdout.write(JSON.stringify(hits, null, 2));
    if (hits.length === 0) return void process.stdout.write(`${species} appears in no encounter table\n`);
    for (const h of hits) {
      process.stdout.write(`${(h.mapName ?? h.mapId).padEnd(32)} ${h.percent.toFixed(1).padStart(5)}%  Lv ${h.minLevel}-${h.maxLevel}  ${h.method}\n`);
    }
  });

program
  .command("coverage")
  .description("encounter design gaps across the project")
  .option("--empty", "list maps with no encounter table")
  .option("--unused", "list species in no encounter table")
  .option("--json", "machine-readable output")
  .action((opts: { empty?: boolean; unused?: boolean; json?: boolean }) => {
    const proj = resolveProject(program.opts().project);
    const c = coverage(proj);
    if (opts.json) return void process.stdout.write(JSON.stringify(c, null, 2));
    process.stdout.write(`${c.mapsWithEncounters} maps with encounters, ${c.mapsWithoutEncounters.length} without\n`);
    if (opts.empty) for (const m of c.mapsWithoutEncounters) process.stdout.write(`  ${m}\n`);
    if (opts.unused) for (const s of c.unusedSpecies) process.stdout.write(`  ${s}\n`);
  });
```

Run: `npx tsx packages/cli/src/index.ts where ESPEON`
Expected: a list including `Route101` at 100.0%, Lv 2–3.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/analyse packages/core/test/analyse packages/cli/src/index.ts
git commit -m "feat(cli): encounters, where and coverage commands for agents and humans"
```

---

## Task 28: Species icons and the encounter gutter

**Files:**
- Create: `packages/core/src/render/species.ts`
- Modify: `packages/server/src/index.ts` (add `/api/species/:name/icon.png`, `/api/encounters/:map`)
- Create: `packages/ui/src/components/EncounterGutter.tsx`
- Test: `packages/core/test/render/species.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { renderSpeciesIcon, speciesToDirName } from "../../src/render/species.js";
import { openProject } from "../../src/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const proj = openProject(SUBJECT_ROOT);

describe("speciesToDirName", () => {
  it("lowercases a plain species constant", () => {
    expect(speciesToDirName("SPECIES_ESPEON")).toBe("espeon");
  });

  it("handles the gendered Nidoran names that appear in real tables", () => {
    expect(speciesToDirName("SPECIES_NIDORAN_F")).toBe("nidoran_f");
    expect(speciesToDirName("SPECIES_NIDORAN_M")).toBe("nidoran_m");
  });
});

describe("renderSpeciesIcon", () => {
  itWithCorpus("renders a 32x32 icon frame", () => {
    const r = renderSpeciesIcon(proj, "SPECIES_ESPEON")!;
    expect(r.width).toBe(32);
    expect(r.height).toBe(32);
    let opaque = 0;
    for (let i = 3; i < r.data.length; i += 4) if (r.data[i] === 255) opaque++;
    expect(opaque).toBeGreaterThan(50);
  });

  itWithCorpus("returns undefined for a species with no art rather than throwing", () => {
    expect(renderSpeciesIcon(proj, "SPECIES_NOT_A_REAL_MON")).toBeUndefined();
  });

  itWithCorpus("renders the overworld sprite used by wild signs", () => {
    const r = renderSpeciesIcon(proj, "SPECIES_POLIWRATH", { source: "overworld" })!;
    expect(r.width).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/render/species.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/render/species.ts
import { existsSync, readFileSync } from "node:fs";
import type { Project } from "../project.js";
import { readIndexedPng } from "../load/png.js";
import { parseJascPal } from "../load/pal.js";
import { createRaster, type Raster } from "./raster.js";

export interface SpeciesIconOptions {
  /** "icon" is the dex icon; "overworld" is the sprite a wild sign displays. */
  source?: "icon" | "overworld";
  /** Which animation frame of the sheet to take. */
  frame?: number;
}

export const speciesToDirName = (species: string): string =>
  species.replace(/^SPECIES_/, "").toLowerCase();

/**
 * Icon sheets are indexed PNGs with their palette in the PLTE chunk; the
 * separate normal.pal is used when present, since that is the committed source.
 */
export function renderSpeciesIcon(proj: Project, species: string, opts: SpeciesIconOptions = {}): Raster | undefined {
  const dir = speciesToDirName(species);
  const path = opts.source === "overworld" ? proj.paths.monOverworldPng(dir) : proj.paths.monIconPng(dir);
  if (!existsSync(path)) return undefined;

  const img = readIndexedPng(readFileSync(path));
  const frame = opts.frame ?? 0;
  const size = opts.source === "overworld" ? Math.min(img.height, 32) : 32;

  const palPath = `${proj.paths.root}/graphics/pokemon/${dir}/normal.pal`;
  const palette = existsSync(palPath) ? parseJascPal(readFileSync(palPath, "utf8")) : img.palette;

  const dst = createRaster(size, size);
  const sx = opts.source === "overworld" ? frame * size : 0;
  const sy = opts.source === "overworld" ? 0 : frame * size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (sx + x >= img.width || sy + y >= img.height) continue;
      const idx = img.indices[(sy + y) * img.width + (sx + x)]!;
      if (idx === 0) continue;
      const c = palette[idx];
      if (!c) continue;
      const di = (y * size + x) * 4;
      dst.data[di] = c.r; dst.data[di + 1] = c.g; dst.data[di + 2] = c.b; dst.data[di + 3] = 255;
    }
  }

  return dst;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/render/species.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Build the gutter**

Invoke `frontend-design` and `ui-ux-pro-max`. Requirements:
- A strip along each map's edge in the world view, showing that map's species icons grouped by method.
- Hover gives species, level band and **percentage**, taken from `speciesChances` — never slot count.
- Off by default behind one toggle (spec §9), and turning it on opens its legend.
- At low zoom the gutter collapses to a count badge rather than unreadable icon soup.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/render/species.ts packages/core/test/render/species.test.ts packages/server/src packages/ui/src
git commit -m "feat(ui): species icons and per-map encounter gutters"
```

---

## Task 29: Species spotlight and coverage lenses

**Files:**
- Create: `packages/ui/src/components/LensPanel.tsx`
- Create: `packages/ui/src/components/SpeciesSpotlight.tsx`
- Modify: `packages/server/src/index.ts` (add `/api/coverage`, `/api/where/:species`)
- Test: `packages/ui/test/LensPanel.test.tsx`
- Test: `packages/ui/test/SpeciesSpotlight.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LensPanel } from "../src/components/LensPanel.js";

const LENSES = ["level-curve", "empty-maps", "unused-species", "method"] as const;

describe("LensPanel", () => {
  it("starts with every lens off", () => {
    render(<LensPanel active={null} onChange={() => {}} summary={{ emptyMaps: 982, unusedSpecies: 12 }} />);
    for (const l of LENSES) expect(screen.getByLabelText(new RegExp(l, "i")).getAttribute("aria-pressed")).toBe("false");
  });

  it("shows a legend the moment a lens is turned on", () => {
    const onChange = vi.fn();
    render(<LensPanel active="level-curve" onChange={onChange} summary={{ emptyMaps: 982, unusedSpecies: 12 }} />);
    expect(screen.getByRole("note")).toBeTruthy();
    expect(screen.getByText(/average encounter level/i)).toBeTruthy();
  });

  it("states the finding in plain words with a next action", () => {
    render(<LensPanel active="empty-maps" onChange={() => {}} summary={{ emptyMaps: 982, unusedSpecies: 12 }} />);
    expect(screen.getByText(/982 maps have no encounters/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /list them/i })).toBeTruthy();
  });

  it("only one lens is active at a time", () => {
    const onChange = vi.fn();
    render(<LensPanel active="level-curve" onChange={onChange} summary={{ emptyMaps: 982, unusedSpecies: 12 }} />);
    fireEvent.click(screen.getByLabelText(/empty-maps/i));
    expect(onChange).toHaveBeenCalledWith("empty-maps");
  });
});
```

```tsx
// packages/ui/test/SpeciesSpotlight.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SpeciesSpotlight } from "../src/components/SpeciesSpotlight.js";

describe("SpeciesSpotlight", () => {
  it("dims every map except the hits", async () => {
    const onHits = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ([{ mapName: "Route29", percent: 20, minLevel: 3, maxLevel: 5, method: "land_mons" }]),
    }) as never;

    render(<SpeciesSpotlight onHits={onHits} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "PIKACHU" } });
    await waitFor(() => expect(onHits).toHaveBeenCalled());
    expect(onHits.mock.calls.at(-1)![0]).toEqual([expect.objectContaining({ mapName: "Route29" })]);
  });

  it("says so plainly when a species appears nowhere", async () => {
    global.fetch = vi.fn().mockResolvedValue({ json: async () => [] }) as never;
    render(<SpeciesSpotlight onHits={() => {}} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "MISSINGNO" } });
    await waitFor(() => expect(screen.getByText(/appears in no encounter table/i)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ui/test/LensPanel.test.tsx packages/ui/test/SpeciesSpotlight.test.tsx`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Add the server endpoints**

```ts
if (url.pathname === "/api/coverage") return send(200, coverage(project));

const whereMatch = /^\/api\/where\/(.+)$/.exec(url.pathname);
if (whereMatch) {
  const s = decodeURIComponent(whereMatch[1]!);
  return send(200, whereSpecies(project, s.startsWith("SPECIES_") ? s : `SPECIES_${s.toUpperCase()}`));
}
```

Cache `coverage(project)` — it walks all 497 tables.

- [ ] **Step 4: Build the components**

Invoke `frontend-design` and `ui-ux-pro-max`, follow `packages/ui/DESIGN.md`.

- **`SpeciesSpotlight`** — a search box; on a hit, the world canvas dims non-matching maps and lights matches with their percentage and level band. Debounce input; never block the canvas while fetching.
- **`LensPanel`** — one active lens at a time, all off by default, each with a legend that says what the colours mean **and what to do next**. Required copy, per spec §9:
  - *level-curve*: "Colour is the average encounter level, weighted by encounter rate. Blue is low, red is high. Look for maps that jump several levels above their neighbours."
  - *empty-maps*: "982 maps have no encounters. Many should not — buildings, corridors, single rooms. Click to list them."
  - *unused-species*: "N species appear in no encounter table. They may still be gifts, statics or trades."
  - *method*: "Which maps reward surfing, fishing or rock smash."

- [ ] **Step 5: Run the tests**

Run: `npx vitest run packages/ui/test`
Expected: PASS.

- [ ] **Step 6: Verify in the real app**

```bash
npm run dev -w @pokemap/ui
```

Search `ESPEON` and confirm Route 101 lights up at 100%. Turn on the level-curve lens and confirm Johto reads as a rising gradient rather than noise. **Look at the screen; do not infer from tests.**

- [ ] **Step 7: Commit**

```bash
git add packages/ui packages/server
git commit -m "feat(ui): species spotlight and coverage lenses with explanatory legends"
```

---

# Plan 1 completion checklist

Per `superpowers:verification-before-completion`, run each of these and paste the real output before declaring this plan done.

- [ ] `npm test` — all suites green, including the 5-engine identity corpus
- [ ] `npm run typecheck` — clean
- [ ] `npx tsx packages/cli/src/index.ts validate --metatile-range` — one finding, `Saffron_Temp`, matching the Python tool
- [ ] `npx tsx packages/cli/src/index.ts render PetalburgCity --out /tmp/a.png` and `render NewBarkTown --out /tmp/b.png` — **both correct, no edit to `include/fieldmap.h` between them.** The CLI accepts a map OR a layout name via `layoutNameFor`; confirm both spellings work, since the two namespaces differ by a `_Layout` suffix
- [ ] `npx tsx packages/cli/src/index.ts where ESPEON` — Route 101 at 100.0%, Lv 2–3
- [ ] `git status` in `C:\Programming Projects\Pokemon Game\game` — **clean.** PokeMap must not have written a single byte to the decomp in this entire plan. If anything is modified, find out what wrote it before going further.
- [ ] The world view pans the full overworld smoothly, and a dragged dungeon floor survives a reload

Then move to Plan 2, re-granularising it against the code that now exists.

