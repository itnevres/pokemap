# Plan 6b Task 1: executed spec

Server family branch + `/api/project` + GBC groups/map/render/metatile routes. Re-granularised against the code at `plan-6b-gbc-app-layer` HEAD. The plan is `docs/superpowers/plans/2026-09-25-pokemap-plan-6b-gbc-app-layer.md`; read its "Resolved design questions" section first.

## Ground rules (read before touching anything)

- **Read-only on every decomp.** PerfPlus is at `/root/pokemap-corpus/pokecrystal-PerfPlus` and the GBA subject at `/home/user/pokemon-three-region`. Nothing in this task writes to either.
- **Never commit `pokemap.config.json`** (it is skip-worktree). Stage with `git add <named paths>` only. Use Conventional Commits. Commit green work early.
- End each commit message with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01FgxW6sP6yke1yprYouFxmc
  ```
- **Don't reformat or re-indent the GBA body of `createServer`.** The only GBA-side edits are: the family branch before `openProject`, the `/api/project` route, the `readBody` export, and the `PokemapServer` type. Keep the diff to `packages/server/src/index.ts` small and reviewable.
- **GBA regression gate.** Run `npm test 2>&1 | tee /tmp/claude-0/-home-user/4cae0c11-1686-58ef-8391-8711e19c1398/scratchpad/t1-test.log`, then:
  - `grep -E "^ FAIL " <log> | sort -u` must equal `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/baseline-fails.txt` exactly (6 lines);
  - the pass count is 1271 plus your new tests;
  - `npm run typecheck` is clean.
- Test rules (Plan 0 §7):
  - pin values, not "it changed";
  - make each fixture discriminate;
  - guard corpus tests so they skip rather than fail, with hooks **inside** `describe.skipIf(...)` (see `packages/server/test/api.test.ts:10-17` for why);
  - confirm with `--reporter=verbose` that they **ran**.

## Deliverables

### 1. Core additions (additive only; no existing signature changes)

**a. `packages/core/src/gbc/load/map.ts`**

Add `parseMapGroupNames(text): string[]` and `loadGbcGroupNames(root): string[]`.
- Index `i` is the name of group `i+1`: the first arg of each `newgroup` line, in order.
- Reuse the same `stripMacroDefs`/`matchCall` iteration as `parseMapConstants`. The file defines `MACRO newgroup` itself; that definition must not count as a group.
- Throw, naming the file, if a `newgroup` has no argument.
- Real excerpt:
  ```
  	newgroup OLIVINE                                              ;  1
  	newgroup MAHOGANY                                             ;  2
  	newgroup DUNGEONS                                             ;  3
  ```
- Tests:
  - a unit test with a fixture that includes a `MACRO newgroup` block (it must not count);
  - a corpus test pinning the group count (= max `GbcMap.group` across `proj.maps`; measure it, don't assume it);
  - `names[0] === "OLIVINE"`;
  - NewBarkTown's group name is `names[NewBarkTown.group - 1]` (measure it; the findings say group 24 = NEW_BARK).

**b. `packages/core/src/gbc/load/tileset.ts`**

Add `loadGbcCollisionInfo(root): Map<number, { names: string[]; category: "land" | "water" | "wall"; talk: boolean }>`, covering all 256 raw values.
- `names`: every `COLL_*` name whose value equals v, in file order. Build it by inverting `parseCollisionConstants`. Values with no name get `[]`.
- `category`: from `parseTileCollisionCategoryTable(...)[v] & 0xf`, compared against `bits.land/water/wall`. Any other low nybble throws, naming the value.
- `talk`: `(row & bits.talk) !== 0`.
- Share the file reads with `loadGbcWaterCollisionValues`. Factor the common part into one internal helper; don't read the files twice by copy-paste.
- Tests pin, measured from the real files:
  - one duplicate-name value (e.g. `$00`) with its full names list;
  - one water value;
  - one wall value;
  - one `| TALK` value (e.g. `COLL_WHIRLPOOL` $24 → water + talk);
  - `COLL_WHIRLPOOL` resolved to a value and back.

**c. `packages/core/src/gbc/project.ts`**

Add lazily cached `groupNames(): string[]` and `collisionInfo()`, following the existing `paddingWidth`/`waterCollisionValues` pattern.

**d. `packages/core/src/gbc/render/map.ts`**

Add `renderGbcMapMetatile(proj, mapName, metatileId, { time }): GbcMetatileRaster`.
- It uses the same `resolveFromTables(proj.paletteTables(), map, {time})` and the same `roofSwappedTiles(...)` as `renderGbcMap`. Extract nothing new; call the existing private helper.
- It does **not** apply the block-0 → border substitution: it is a raw metatile thumbnail.
- Out-of-range ids return the placeholder with `outOfRange: true`, as `renderGbcMetatile` already does. The route decides the status code.
- Test: on NewBarkTown (a roofed JOHTO map), `renderGbcMapMetatile(proj, "NewBarkTown", id)` must be byte-identical to the 32×32 region at block `(bx,by)` of `renderGbcMap(proj, "NewBarkTown")`. Pick a block whose raw id is non-zero **and** whose metatile uses a roof tile ($0A-$12), so the roof path is actually exercised. Find one by scanning `proj.tileset(...).metatiles`, and prove it's roofed in the test.
- A second assertion: the same id rendered for a different map on the same tileset with a different roof (or none) differs. That is what justifies keying by map.

**e. `packages/core/src/gbc/wire.ts` (new, types only, no runtime code)**

```ts
export type EngineFamily = "gba" | "gbc";   // re-export from ../family.js instead of redeclaring
export interface ProjectInfo { family: EngineFamily; root: string }
export interface GbcGroupsPayload { groupOrder: string[]; groups: Record<string, string[]> }
export type GbcCollisionCategory = "land" | "water" | "wall";
export interface GbcCollisionInfoEntry { names: string[]; category: GbcCollisionCategory; talk: boolean }
export interface GbcMapPayload {
  family: "gbc";
  map: GbcMap;
  layout: { blkPath: string; width: number; height: number; writable: boolean };
  blocks: Block[];                              // exactly width*height, raw ids (0 is NOT substituted)
  metatileCount: number;                        // tileset.metatiles.length
  tileset: { constName: string; name: string };
  collision: Collision[];                       // per metatile, length === metatileCount
  collisionInfo: Record<string, GbcCollisionInfoEntry>; // keys = String(value), only values used by `collision`
  events: GbcMapEvents;
  defects: DataDefect[];                        // layout defects then event defects
  paddingWidth: number;
}
```

### 2. Server

**a. `packages/server/src/index.ts`**

- `export function readBody`, unchanged. (Task 1 has no GBC POST; the export is for `gbcRoutes.ts`'s future use and Plan 7. If nothing imports it by the end of the task, don't export it. YAGNI beats a speculative export.)
- `PokemapServer` becomes `{ port; close(); family: "gba"; project: Project } | { port; close(); family: "gbc"; project: GbcProject }`.
- First line of `createServer`:
  ```ts
  if (detectEngineFamily(opts.projectPath) === "gbc") return createGbcServer(opts);
  ```
  The GBA path returns `family: "gba"`.
- The GBA handler's first route is `GET /api/project` → `{ family: "gba", root: project.paths.root } satisfies ProjectInfo`.
- Nothing else in the GBA body changes.

**b. `packages/server/src/gbcRoutes.ts` (new)**

`createGbcServer(opts: { projectPath; port? }): Promise<PokemapServer>`:
- `openGbcProject(root)`;
- the same `createHttp` + `send` + try/catch-500 skeleton as the GBA handler (a JSON `send`, and a 500 with `console.error` for unexpected throws);
- `listen(opts.port ?? 5174, "127.0.0.1")`;
- `close`.

Routes (exact-match or anchored regex, like the GBA file):

| Route | Response |
|---|---|
| `GET /api/project` | `{ family: "gbc", root: proj.root }` |
| `GET /api/groups` | `groupOrder = proj.groupNames()` (group index order); `groups[name]` = map names in that group sorted by `GbcMap.number`. Every group key exists even if empty (measure: should be none). Satisfies `GbcGroupsPayload` |
| `GET /api/map/:name` (`(.+)`, decoded) | 404 `{error:"no map X"}` for an unknown name (check against `proj.maps`; don't let `proj.map` throw a 500). Otherwise `GbcMapPayload` per the wire type. `collisionInfo` is restricted to the values present in `collision` |
| `GET /api/render/:name.png` | `?border=`: `parseBorder` (400 on its throw), then `> proj.paddingWidth()` → 400 naming the max. `?time=`: absent → "day", else `parseTime` (400 on its throw). Unknown map → 404. PNG via `encodePng(renderGbcMap(...))`. Cache key is `${name}:${border}:${time}`; every input goes in the key. Headers match GBA (`content-type: image/png`, `cache-control: no-cache`) |
| `GET /api/metatile/:map/:id.png` (map `(.+)`, id `([^/]+)`, the GBA convention) | Unknown map → 404. A non-integer or negative id → 400 (the GBA message wording). `id >= metatileCount` → 404 `{error:"metatile N out of range for <tileset> (count C)"}`. `?time=` as for render. Cache key is `${map}:${id}:${time}` |
| GBA-only routes on GBC | **501** `{ error: "<pathname> is not supported for gbc (pokecrystal-family) projects yet" }` for pathnames matching `^/api/(warps/|dungeons(/|$)|world/placement$|world/dungeons$|sign/|edit/|species/[^/]+/icon\.png$)` |
| Anything else | 404 `{error:"not found"}`. Note `/api/world`, `/api/encounters/*`, `/api/where/*`, `/api/coverage` and `/api/species` are **Task 2**, and are 404 in this task |

**c. `packages/server/src/serve.ts`**

- `--gbc` anywhere in argv selects `cfg.gbc.projectPath`. If it is missing, refuse: `pokemap.config.json has no "gbc.projectPath"`, then exit code 1.
- Otherwise, the first non-flag argv (after the script) is the root, falling back to `cfg.projectPath`.
- Print the detected family in the startup line.

**d. `.claude/launch.json`**

Add:
- `{ "name": "server", "runtimeExecutable": "npx", "runtimeArgs": ["tsx", "packages/server/src/serve.ts"], "port": 5174 }`;
- `server-gbc`: the same, plus `"--gbc"`.

### 3. Tests

**`packages/server/test/gbcRoutes.test.ts`**

Wrap the real-corpus suite in `describe.skipIf(!hasGbcProject(GBC_SUBJECT_ROOT))`, with `beforeAll`/`afterAll` inside. Import from `@pokemap/core/test/gbc/helpers/corpus.js`. Pin values measured independently from the corpus files, never by echoing the route:
- `/api/project` → `family: "gbc"`, and `root` equals the normalised root.
- `/api/groups`:
  - `groupOrder.length` = group count;
  - `groupOrder[0] === "OLIVINE"`;
  - NewBarkTown sits in the right group;
  - the total map count across groups is 391;
  - the order within a group equals map number order (pin one small group fully).
- `/api/map/NewBarkTown`:
  - 10×9, 90 blocks;
  - `tileset.constName === "TILESET_JOHTO"`;
  - `metatileCount` 128;
  - `collision.length === metatileCount`;
  - `layout.writable` true;
  - 4 warps, the first at (6,3) → `ELMS_LAB`;
  - `defects` `[]`;
  - every `collisionInfo` key is used by `collision` and every used value has a key (both directions);
  - `blocks[0].metatileId` equals the first byte of `maps/NewBarkTown.blk` (read the file in the test).
- `/api/map/CeruleanCave2F` → `writable: false`, and a defect naming `CeruleanCave2F.blk`.
- `/api/map/NoSuchMap` → 404.
- `/api/render/NewBarkTown.png`:
  - border 0 → 320×288 (read the IHDR width/height bytes);
  - border 3 → 512×480;
  - border 4 → 400 with a message naming `3`;
  - `border=abc` → 400.
  - `time=nite` bytes differ from `time=day` **and** from `time=morn`; a second `time=day` request is byte-identical to the first.
  - Cache-key discrimination: request `day`, then `nite`, then `day` again; the second `day` equals the first and differs from `nite`.
- `time=noon` → 400.
- `/api/metatile/NewBarkTown/<id>.png` → a 32×32 PNG. `/1.5.png` and `/-1.png` → 400. `/<metatileCount>.png` → 404. `time` changes the bytes.
- 501 for each GBA-only prefix (at least one per regex branch). `/api/nope` → 404.

**Family isolation**

- A GBA-root `createServer` answers `/api/project` with `gba`.
- A GBC-root server answers `/api/groups` in the GBC shape. `groupOrder[0]` is `"OLIVINE"`, not `gMapGroup_*`, which proves the GBC handler ran.
- Add the GBA `/api/project` assertion to `api.test.ts`, inside its existing suite.

**Mutation checks (implementer and reviewers)**

Each of these must turn at least one test red:
- remove `time` from the render cache key;
- remove the `paddingWidth` cap;
- swap `names`/`category`;
- drop the `collisionInfo` filter;
- make `/api/map` include block-0 substitution;
- sort groups alphabetically instead of by index;
- serve the 501 refusal as 404;
- drop the GBC branch in `createServer`.

Record each mutation and the test that caught it in the report.

## Report

Write `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/task-1-implementer.md` with:
- what was built;
- the commits;
- the test counts before and after;
- the gate result (fails diff);
- the mutation table;
- any deviation from this spec, with reasons.
