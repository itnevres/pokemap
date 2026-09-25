# Plan 6b Task 1b: executed spec

**Scope:** the GBC `/api/groups`, `/api/map/:name`, `/api/render/:name.png` and `/api/metatile/:map/:id.png` routes, in `packages/server/src/gbcRoutes.ts`.

**Builds on Task 1a:** `createGbcServer`, `ProjectInfo`, `groupNames()`, `collisionInfo()`, `outOfBoundsEventDefects`, `renderGbcMapMetatile` and `wire.ts`. Read `task-1a-implementer.md` and the 1a code first; where the code and this spec disagree, the code wins.

**Ground rules:** exactly as in `task-1a-spec.md`. That covers read-only decomps, commit hygiene and trailers, the GBA gate against `baseline-fails.txt`, Plan 0 §7 test rules, hooks inside `describe.skipIf`, and confirming with `--reporter=verbose` that corpus tests ran. `index.ts` is not touched in this task.

## Routes

All four go into `createGbcServer`'s handler, ahead of the 501-refusal check and the final 404. Match the GBA file's conventions:
- per-name captures use `(.+)` and `decodeURIComponent`;
- the id segment is `([^/]+)`;
- the PNG headers are `content-type: image/png` and `cache-control: no-cache`.

Look up names with a `Set` of `proj.maps` names, built once. Never let `proj.map()` throw its way into a 500.

| Route | Behaviour |
|---|---|
| `GET /api/groups` | `{ groupOrder, groups }`:<br>• `groupOrder` = `proj.groupNames()` (`newgroup` order);<br>• `groups[name]` = the names of maps with `map.group === i+1`, sorted by `map.number`;<br>• every name in `groupOrder` has a key. |
| `GET /api/map/:name` | 404 `{ error: "no map X" }` for an unknown map. Otherwise `send(200, payload satisfies GbcMapPayload)`. See the payload notes below. |
| `GET /api/render/:name.png` | Parse `?border` first:<br>• absent → 0;<br>• else `parseBorder` from `@pokemap/cli/src/args.js`, 400 with its message on a throw;<br>• then `> proj.paddingWidth()` → 400 `border N out of range -- must be an integer 0-<max>`.<br><br>Parse `?time`:<br>• absent → `"day"`;<br>• else `parseTime`, 400 with its message on a throw.<br><br>Then:<br>• unknown map → 404;<br>• cache key `${name}:${border}:${time}` → `encodePng(renderGbcMap(proj, name, { border, time }))`. |
| `GET /api/metatile/:map/:id.png` | • unknown map → 404;<br>• `Number(id)` not a non-negative integer → 400, with the GBA route's wording (`metatile id must be a non-negative integer, got <raw>`);<br>• `?time` as for render (400 on bad);<br>• `id >= metatileCount` → 404 `{ error: "metatile N out of range for <tileset const> (count C)" }`;<br>• cache key `${map}:${id}:${time}` → `encodePng(renderGbcMapMetatile(proj, map, id, { time }))`. |

Decide the order of the 404 and 400 checks deliberately. Make it the same for both PNG routes, and document it in a comment. The GBA metatile route checks the name before the id.

### `GbcMapPayload` fields

- `map`: `proj.map(name)`, exactly the `GbcMap`, connections included.
- `layout` and the layout defects come from `proj.layout(map)`:
  - `layout` is `{ blkPath, width, height, writable }`;
  - `blocks` is `layout.blocks`, exactly `width * height` entries.
- `tileset`: `const ts = proj.tileset(map.tileset)`. It gives:
  - `metatileCount = ts.metatiles.length`;
  - `tileset = { constName: ts.constName, name: ts.name }`;
  - `collision = ts.collision`.
- `collisionInfo`: only the values that occur in `collision`, keyed by `String(value)`, from `proj.collisionInfo()`.
- `events` and the event defects: `loadGbcMapEvents(proj.root, map)`.
- `defects` = `[...layoutDefects, ...eventDefects, ...outOfBoundsEventDefects(map, events)]`, in that order.
- `paddingWidth`: `proj.paddingWidth()`.

## Tests

Put them in `packages/server/test/gbcRoutes.test.ts`, inside the existing corpus-guarded suite. Pin values measured independently from the corpus files or the core functions, never by echoing the route.

### Groups

- `groupOrder` equals `openGbcProject(root).groupNames()`, so 26 entries.
- `groupOrder[0] === "OLIVINE"`.
- The total of all `groups[*]` lengths is 391, with no duplicates.
- NewBarkTown is in `groups[groupOrder[NewBarkTown.group - 1]]`.
- One small group is pinned **fully, in order**. Pick one of 3-6 maps and read its `map_const` lines from `constants/map_constants.asm` in the test. This order must differ from alphabetical, so an alphabetical-sort mutation fails; assert that too.

### Map

For `/api/map/NewBarkTown`:
- 10×9, and `blocks.length` 90;
- `blocks.map(b => b.metatileId)` equals the bytes of `maps/NewBarkTown.blk`, read with `readFileSync` in the test;
- `tileset.constName` is `"TILESET_JOHTO"`;
- `metatileCount` is 128, and `collision.length` is 128;
- `layout.writable` is true;
- `events.warps.length` is 4, and the first is `{ x: 6, y: 3, mapConst: "ELMS_LAB", destWarp: 1 }` (use `toMatchObject`);
- `defects` is `[]`;
- `collisionInfo` keys equal the set of values used in `collision`, both ways;
- one pinned entry's `category` and `name` match `proj.collisionInfo().get(v)`.

For `/api/map/CeruleanCave2F`:
- `layout.writable` is false;
- `defects` has the `.blk` defect first (it names `CeruleanCave2F.blk`), followed by exactly 3 out-of-bounds warp defects.

For `/api/map/ElmsLab`, a `border $00` interior:
- `map.border` is 0;
- 200 with its real dimensions.

`/api/map/NoSuchMap` is a 404.

### Render

- NewBarkTown at border 0, 1 and 3, and at each of morn, day and nite: the response bytes **equal** `encodePng(renderGbcMap(proj, "NewBarkTown", { border, time }))`, computed in the test.
- Read the IHDR width and height: 320×288 at border 0, 512×480 at border 3.
- Pairwise, the three times are not equal.
- Cache-key proof:
  - request day, then nite, then day again; the second day response equals the first and differs from nite;
  - do the same with border 0, 1, 0.
- 400s:
  - `border=4`, with the message naming `0-3`;
  - `border=abc`, `border=-1` and `border=1.5`;
  - `time=noon`.
- `/api/render/NoSuchMap.png` is a 404.

### Metatile

- `/api/metatile/VioletCity/<the roof id 1a's test uses>.png?time=nite` equals `encodePng(renderGbcMapMetatile(...))`, and its IHDR is 32×32.
- The same id with `time=day` gives different bytes.
- The same id on `AzaleaTown` gives different bytes.
- 400s: `/1.5.png`, `/-1.png`, `/abc.png`, and `?time=noon`.
- 404s: `/<metatileCount>.png`, which must name the count, and `/api/metatile/NoSuchMap/0.png`.

### Refusals

Keep 1a's refusal tests. Update 1a's "`/api/map/NewBarkTown` → 404" and "`/api/groups` → 404" assertions: these routes now answer, so replace them with the real-answer tests above. The family-isolation test now asserts `groupOrder[0] === "OLIVINE"`, which a GBA handler could never produce. GBA's is `gMapGroup_TownsAndRoutes`.

## Mutation checks (record each in the report)

1. Remove `time` from the render cache key.
2. Remove `border` from the render cache key.
3. Remove `time` from the metatile cache key.
4. Remove the `paddingWidth` cap.
5. Sort `groups[name]` alphabetically.
6. Drop the `collisionInfo` filter, so all 256 values are sent.
7. Apply block-0 → border substitution to `blocks`. The corpus has no id-0 blocks, so this mutation may **survive**. If it does, say so and add a unit test with a stub project, or state why a stub isn't worth it. Don't claim coverage that doesn't exist.
8. Change `>=` to `>` in the metatile range check.
9. Omit `outOfBoundsEventDefects` from `defects`.
10. Default `time` to `"nite"`.

## Report

Write `task-1b-implementer.md` with the same sections as 1a:
- what you built;
- commit SHAs;
- test counts before and after;
- the gate result;
- the mutation table;
- any deviations, with the reason for each.

Then run a live check: start `npx tsx packages/server/src/serve.ts --gbc` in the background, `curl` one of each route, and paste the status lines and payload sizes. Stop the server afterwards.
