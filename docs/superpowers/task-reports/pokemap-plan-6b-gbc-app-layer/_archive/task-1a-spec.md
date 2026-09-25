# Plan 6b Task 1a: executed spec

Core additions, server family branch, `/api/project`, GBC refusals, `serve.ts --gbc`.

This task was re-granularised against the code at `plan-6b-gbc-app-layer` HEAD. The plan is `docs/superpowers/plans/2026-09-25-pokemap-plan-6b-gbc-app-layer.md`; read its "Resolved design questions" section first. The plan review is `plan-review.md` in this directory.

Task 1b (the groups/map/render/metatile routes) comes next. **Don't build any of it here.**

## Ground rules

**The decomps are read-only.**
- PerfPlus: `/root/pokemap-corpus/pokecrystal-PerfPlus`.
- GBA subject: `/home/user/pokemon-three-region`.
- Nothing in this task writes to either.

**Committing.**
- Never commit `pokemap.config.json`; it is skip-worktree.
- Stage with `git add <named paths>` only.
- Use Conventional Commits, and commit green work early.
- You work in `/home/user/pokemap`, on branch `plan-6b-gbc-app-layer`. Don't push; the coordinator pushes.
- End every commit message with these two lines:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01FgxW6sP6yke1yprYouFxmc
  ```

**Keep the GBA body of `createServer` exactly as it is.** Don't reformat it or re-indent it. The only GBA-side edits allowed are:
- the family branch, placed before `openProject`;
- the `/api/project` route;
- the `PokemapServer` type.

**GBA regression gate.** Run:

```
npm test 2>&1 | tee /tmp/claude-0/-home-user/4cae0c11-1686-58ef-8391-8711e19c1398/scratchpad/t1a-test.log
```

Then check all three:
- `grep -E "^ FAIL " <log> | sort -u` equals `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/baseline-fails.txt` exactly (6 lines).
- The pass count is 1271 plus your new tests.
- `npm run typecheck` is clean.

**Test rules** (Plan 0 §7):
- Pin exact values. Never assert only that something changed.
- Every fixture must discriminate.
- Guard corpus tests so they skip rather than fail. In server tests, `beforeAll`/`afterAll` go **inside** `describe.skipIf(...)`; see `packages/server/test/api.test.ts:10-17` for why.
- Confirm with `--reporter=verbose` that your corpus tests actually **ran** in this environment (PerfPlus is present).

**If you are interrupted and resumed:** diff your files against your intended code, revert any leftover mutation, and re-run the suite before continuing.

## Deliverables

### 1. Core (additive only; no existing signature changes)

**a. `packages/core/src/family.ts`**

Add:

```ts
export interface ProjectInfo { family: EngineFamily; root: string }
```

**b. `packages/core/src/gbc/load/map.ts`**

Add `parseMapGroupNames(text, source)` and `loadGbcGroupNames(root): string[]`. Index `i` holds the name of group `i+1`: the first argument of each `newgroup` line, in order.

- Iterate with `stripMacroDefs`/`matchCall`, the same way `parseMapConstants` does. The file itself defines `MACRO newgroup`, and that definition must not count as a group.
- Throw, naming `source`, on a `newgroup` with no argument.

Real excerpt from `constants/map_constants.asm`:

```
	newgroup OLIVINE                                              ;  1
	newgroup MAHOGANY                                             ;  2
	newgroup DUNGEONS                                             ;  3
```

Tests:
- A unit fixture that includes a `MACRO newgroup … ENDM` block. The fixture's group names must all differ.
- A corpus test pinning the count at 26, checked against `max(GbcMap.group)` over `proj.maps`.
- `names[0] === "OLIVINE"`.
- NewBarkTown's group name, `names[map.group - 1]`. Measure it, then pin it.

**c. `packages/core/src/gbc/load/tileset.ts`**

Add `loadGbcCollisionInfo(root): Map<number, { name: string | null; category: "land" | "water" | "wall"; talk: boolean }>`, covering all 256 raw values.

- `name` is the `COLL_*` name with that value, from inverting `parseCollisionConstants`, or `null` if none. The corpus has 109 names for 109 distinct values. If two names ever share a value, **throw**, naming both; a silent pick would be a guess.
- `category` is `categoryTable[v] & 0xf` compared against `bits.land/water/wall`. Any other low nybble throws, naming the value.
- `talk` is `(categoryTable[v] & bits.talk) !== 0`.
- Factor the constants-file and table-file reads shared with `loadGbcWaterCollisionValues` into one internal helper, so each file is read in one place. Leave `loadGbcWaterCollisionValues`'s behaviour and signature unchanged; its tests must stay green.

Tests pin values read from the real files, not from this spec:
- one land value;
- one water value;
- one wall value;
- `COLL_WHIRLPOOL` resolves to water with `talk: true`;
- an unnamed value gives `name: null`;
- a unit test that a duplicate-value fixture throws.

**d. `packages/core/src/gbc/load/events.ts`**

Add `outOfBoundsEventDefects(map: Pick<GbcMap, "name" | "width" | "height">, events: GbcMapEvents): DataDefect[]`. It is pure.

- The step grid is `2*width × 2*height` (event coordinates are 16-px steps; see the plan).
- Any warp, coord, bg or object event with `x < 0 || y < 0 || x >= 2w || y >= 2h` yields one defect:
  - `file: maps/<Name>.asm`;
  - the message names the kind, the 0-based index within its kind, `(x,y)`, and the grid size.

Corpus test: exactly these 7 across all 391 maps, pinned by map, kind and index:
- CeruleanCave1F: 3 warps;
- CeruleanCave2F: 3 warps;
- GoldenrodPokecenter1F: 1 object.

Re-measure the 7 yourself. The plan-review report lists them.

**e. `packages/core/src/gbc/project.ts`**

Add lazily cached `groupNames()` and `collisionInfo()`, following the `paddingWidth`/`waterCollisionValues` pattern.

**f. `packages/core/src/gbc/render/map.ts`**

Add:

```ts
export function renderGbcMapMetatile(proj, mapName, metatileId, opts: { time?: "morn" | "day" | "nite" } = {}): GbcMetatileRaster
```

- Use the same `resolveFromTables(proj.paletteTables(), map, { time })` and the private `roofSwappedTiles(...)` as `renderGbcMap`, then `renderGbcMetatile`.
- **No** block-0 → border substitution: this is a raw metatile thumbnail.
- An out-of-range id returns the existing placeholder raster with `outOfRange: true`. The route decides the HTTP status.

Tests:
- On **VioletCity**, pick a map block (not in the ring) whose raw id is non-zero and whose metatile contains a tile id in `$0A-$12`. Assert that in the test. `renderGbcMapMetatile(proj, "VioletCity", id)` must byte-equal the 32×32 region at that block in `renderGbcMap(proj, "VioletCity")`.
- The same id on **AzaleaTown** (same tileset, different roof; assert both facts) must differ.
- NewBarkTown's roof swap is a measured no-op, so don't use it here.
- `time: "nite"` must byte-equal the matching region of `renderGbcMap(..., { time: "nite" })`.

**g. `packages/core/src/gbc/wire.ts`** (new, types only, no runtime code)

Define the shared payload interfaces for later tasks. Only `GbcMapPayload` and `GbcCollisionInfoEntry` are needed now; Task 2 adds the rest.

```ts
import type { Block, Collision, DataDefect, GbcMap, GbcMapEvents } from "./model/types.js";
export type GbcCollisionCategory = "land" | "water" | "wall";
export interface GbcCollisionInfoEntry { name: string | null; category: GbcCollisionCategory; talk: boolean }
export interface GbcMapPayload {
  family: "gbc";
  map: GbcMap;
  layout: { blkPath: string; width: number; height: number; writable: boolean };
  blocks: Block[];                               // exactly width*height, raw ids (0 NOT substituted)
  metatileCount: number;
  tileset: { constName: string; name: string };
  collision: Collision[];                        // per metatile, length === metatileCount
  collisionInfo: Record<string, GbcCollisionInfoEntry>; // keys String(value), only values used by `collision`
  events: GbcMapEvents;
  defects: DataDefect[];                         // layout, then event, then out-of-bounds-event defects
  paddingWidth: number;
}
```

Make `loadGbcCollisionInfo`'s value type this same `GbcCollisionInfoEntry`, so the entry shape is declared once.

### 2. Server

**a. `packages/server/src/index.ts`**

- `PokemapServer` becomes the union:
  ```ts
  { port: number; close(): Promise<void>; family: "gba"; project: Project }
  | { port: number; close(): Promise<void>; family: "gbc"; project: GbcProject }
  ```
- The first statement of `createServer` is:
  ```ts
  if (detectEngineFamily(opts.projectPath) === "gbc") return createGbcServer(opts);
  ```
  The GBA return adds `family: "gba"`.
- The first route in the GBA handler is:
  ```ts
  if (url.pathname === "/api/project") return send(200, { family: "gba", root: project.paths.root } satisfies ProjectInfo);
  ```
  Check what `project.paths.root` actually holds.
- Don't export `readBody`. It would create an import cycle, and it has no GBC user yet.

**b. `packages/server/src/gbcRoutes.ts`** (new)

`export async function createGbcServer(opts: { projectPath: string; port?: number }): Promise<PokemapServer>`:

- `const proj = openGbcProject(opts.projectPath)`.
- A `createHttp` handler with the same JSON `send` and outer try/catch → `console.error` + 500 skeleton as the GBA handler. The four-line `send` is copied, since it's a closure.
- Listen on `127.0.0.1` at `opts.port ?? 5174`, and resolve the real port the same way the GBA code does.
- `close()`.
- Give the file a header comment saying it is the server counterpart of `cli/src/gbcCommands.ts`, and that Task 1b, Task 2 and Plan 7 add routes here.

Routes in this task:

| Route | Response |
|---|---|
| `GET /api/project` | `{ family: "gbc", root: proj.root } satisfies ProjectInfo` |
| GBA-only paths matching `^/api/(warps/\|dungeons(/\|$)\|world/placement$\|world/dungeons$\|sign/\|edit/\|species/[^/]+/icon\.png$)` | **501** `{ error: \`${pathname} is not supported for gbc (pokecrystal-family) projects yet\` }`, for any method |
| Anything else | 404 `{ error: "not found" }` |

**c. `packages/server/src/serve.ts`**

- If `--gbc` is present, use `cfg.gbc.projectPath`. If that is missing, write `pokemap.config.json has no "gbc.projectPath"` to stderr and set `process.exitCode = 1`, then return. Don't `throw` with a stack trace.
- Otherwise the root is the first argv entry after the script that doesn't start with `--`, falling back to `cfg.projectPath`.
- The startup line prints the family: `pokemap server (<family>) on http://… for <root>`. Take the family from the returned `PokemapServer`.
- Add a comment explaining why the server reads `gbc.projectPath` even though `cli/src/context.ts` documents it as test-only for the CLI: it is a dev-server convenience for launching the UI against the configured Crystal project.

**d. `.claude/launch.json`**

Add two configurations:
- `"server"`: `npx tsx packages/server/src/serve.ts`, port 5174.
- `"server-gbc"`: the same with `--gbc` appended.

Both use port 5174 because the Vite proxy targets it, so they are alternatives and can't run at once. JSON has no comments, so record that in the report.

### 3. Tests

**`packages/server/test/gbcRoutes.test.ts`**

A real-corpus suite in `describe.skipIf(!hasGbcProject(GBC_SUBJECT_ROOT))`, with its hooks inside. Import the helper from `@pokemap/core/test/gbc/helpers/corpus.js`.

- `/api/project` returns 200 with `{ family: "gbc", root }`, where `root` equals `openGbcProject(GBC_SUBJECT_ROOT).root`, computed independently in the test.
- For each regex branch, one path returns **501** with the exact message: `/api/warps/NewBarkTown`, `/api/dungeons`, `/api/dungeons/x` (PATCH), `/api/world/placement` (POST), `/api/world/dungeons` (POST), `/api/sign/NewBarkTown/suggestions`, `/api/edit/NewBarkTown/undo` (POST), `/api/species/CHIKORITA/icon.png`.
- `/api/nope` returns 404.
- Near-misses that must **not** be refused return 404, proving the regex anchors: `/api/worldx`, `/api/world/placementx`, `/api/species`. `/api/species` is 404 in this task; Task 2 adds it. Pin that here and update the test in Task 2.
- `/api/map/NewBarkTown` returns 404 in this task. It proves the GBC handler, not the GBA one, answered.

**Family isolation**
- In `api.test.ts`, inside its existing GBA suite: `/api/project` returns `{ family: "gba", root: <SUBJECT_ROOT normalised as project.paths.root> }`.
- In `gbcRoutes.test.ts`: the returned `PokemapServer.family === "gbc"`, and the GBA-only route `/api/groups` is **not** served by GBA code. In this task it returns 404, since Task 1b adds the GBC one.

**`serve.ts`**

A test that spawns the file is optional. Do at least one manual run of each mode (`--gbc`, a positional path, and the missing-`gbc`-block error using a temp cwd with a stub config) and paste the output into the report.

### Mutation checks

Each of these must turn at least one test red. Record, for each, the mutation and the test that caught it. Restore from `git show HEAD:path` or from the in-memory original, never from a stale copy.

1. Drop the GBC branch in `createServer`.
2. Serve the 501s as 404.
3. Remove the `$` anchor in `world/placement$`.
4. Make `parseMapGroupNames` count the `MACRO newgroup` line.
5. Swap `water` and `wall` in the category mapping.
6. Make `talk` always false.
7. Change `>=` to `>` in the out-of-bounds check.
8. Drop the roof swap in `renderGbcMapMetatile`.
9. Apply the block-0 → border substitution in `renderGbcMapMetatile`.
10. Return the GBA family string from the GBC `/api/project`.

## Report

Write `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/task-1a-implementer.md` with:
- what you built;
- commit SHAs;
- test counts before and after;
- the gate result (the fails diff, plus typecheck);
- the mutation table;
- the `serve.ts` run outputs;
- any deviation from this spec, with the reason.
