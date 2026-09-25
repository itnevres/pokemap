# Plan 6 Task 11: world / connections stitching (re-granularised 2026-09-24 against real code)

Binding sources:
- The plan's Task 11.
- Findings §Extra "Connections": offset axis north/south = x, east/west = y, units are blocks, and target origin = current origin + offset. These were engine-verified against `LoadMapConnections`.
- "Consequences → Task 11".
- Real code:
  - GBA `packages/core/src/world/connections.ts` (`buildWorld` BFS, `boundsOf`, private `layOutComponents` shelf-pack) and `world/resolve.ts`;
  - CLI `render-world` in `packages/cli/src/index.ts` (`--bbox`, `--scale`, `blitScaled`);
  - Task 9's `openGbcProject`/`renderGbcMap`;
  - Task 10's family branch and `gbcCommands.ts`.

## Deliverables

1. **`packages/core/src/gbc/world/connections.ts`: `buildGbcWorld(proj: GbcProject): GbcWorld`.**
   - It is a direct port of GBA `buildWorld`'s BFS, and places EVERY map: an isolated interior becomes its own 1-map component, the same as GBA.
   - Units are **blocks** (1 block = 32 px).
   - Placement rules, per the findings:
     - `west`: target at `(x − tw, y + offset)`;
     - `east`: `(x + w, y + offset)`;
     - `north`: `(x + offset, y − th)`;
     - `south`: `(x + offset, y + h)`.
   - Connections name their target by `targetConst`. Resolve it through a const→map index built once, not by `targetName` string (I4: join on the real key). Refuse (throw, naming the source map and the const) an unknown target const.
   - Conflicts are recorded, never thrown. Use the same `Conflict` shape as GBA, with `viaB.from` = the map that actually placed it.
   - Reuse, don't duplicate:
     - Export GBA `connections.ts`'s `Placement`/`Bounds`/`Component`/`Conflict` types and its shelf-pack, if the types fit (they are family-agnostic: map-name strings plus numbers).
     - For the shelf-pack, export `layOutComponents` with an optional `{ gap, rowTarget }` param whose defaults are exactly today's 8/512, so GBA behaviour is byte-identical.
     - Choose GBC values in blocks, justified by the measured extent (e.g. rowTarget ≈ the largest component's width), and state them.
     - Also export `boundsOf`.
   - These are the only permitted GBA-file edits: exports plus an optional param. GBA tests must stay green where they can run. They can't run here (no GBA decomp), so the change must be provably behaviour-neutral by inspection. Keep it minimal.
   - No vertical links: GBC has no dive/emerge.
   - No warp-based dungeon auto-layout and no sidecar. Those are GBA UI features with no GBC UI in Plan 6; note it as out of scope.
2. **LOD assessment (the plan asks for it explicitly).**
   - Measure the component count, the largest component's extent in blocks and pixels, the total packed world extent, and the time to render the full packed world at scale 32 and at scale 8.
   - Report the numbers and the decision. The expected decision is "no LOD/culling needed", but decide from the measurements.
3. **`packages/core/src/gbc/render/world.ts`: `renderGbcWorld(proj, world, { bbox, scale, time })`.**
   - `bbox` is in blocks, and `scale` is pixels per block: 32 = full size, 8 = overview. It refuses a non-divisor or non-positive scale, mirroring `args.ts`'s `parseScale` semantics.
   - It renders each placement intersecting the bbox with `renderGbcMap(proj, name, { time })` (borderless) and `blitScaled` at `(p.x − bx)·scale`.
   - It returns the raster plus `{ drawn, defects }`, where `defects` is the de-duplicated `DataDefect`s of the maps drawn.
4. **CLI.** `render-world` on a GBC root (currently refused per Task 10) now runs `runGbcRenderWorld(root, { bbox, out, scale, time })` in `gbcCommands.ts`.
   - stdout: `<out> <w>x<h> maps=<n>`. stderr: defect warnings.
   - Remove `render-world` from the GBC refusal list.
   - The `--no-dungeons` flag is irrelevant for GBC. If it's passed, ignore it and document that, or refuse only when it's explicitly passed; pick one and document it.
   - `--scale` default: GBA's is 4 (px per 16-px tile, i.e. a quarter). For GBC use 8 (px per 32-px block, also a quarter) and document it. `parseScale`'s allowed set may be GBA-specific; check it and handle GBC with its own validation if needed.
5. **Tests** (`packages/core/test/gbc/world/connections.test.ts`, `.../render/world.test.ts`, plus CLI additions).
   - **Unit, hand-derived fixture GbcProject stub** (build it from the `GbcProject` interface, with no unchecked partial casts):
     - 4 maps with one connection in each direction and non-zero offsets, with exact placements;
     - a conflict case, with the exact `Conflict`;
     - an unknown target const refused;
     - an isolated map as its own component;
     - the shelf-pack not overlapping.
   - **Corpus:**
     - NewBarkTown/Route29 exact relative placement: Route29.x = NBT.x − Route29.width, same y.
     - AzaleaTown/Route34 (`connection west, Route34, ROUTE_34, -18`): Route34.y = Azalea.y − 18.
     - The measured component count, and which maps share NewBarkTown's component (pin the count and a few named members; is Kanto connected to Johto? measure it).
     - **Conflict count pinned** (measured; expected 0). Crystal has connection CYCLES, e.g. Kanto's Cerulean/Route5/Saffron/Route8/Lavender/Route10/Route9 loop, so a sign error on either axis MUST produce conflicts. Confirm this by mutation.
     - Reciprocity: for every A→B connection with offset o that has a B→A partner, the partner's offset is −o. Measure how many pairs exist and how many are unpaired (one-way), and pin both.
   - **World render corpus:** a bbox covering NewBarkTown + Route29 at scale 32. Pixels at two points (one in each map) equal the corresponding `renderGbcMap` pixel at that map's placement. Scale 8 dimensions are exact.
   - **CLI:** `runGbcRenderWorld` writes a PNG that decodes to the `renderGbcWorld` raster. Add 1 spawned test: `--project <gbc> render-world --bbox ... -o <tmp>` exits 0.
   - Grep `packages/*/test/**` for any map name you use before adding a test. Everything is read-only against the subject.
6. **Mutation-check.** At minimum:
   - negate the offset on the x axis only, then on the y axis only (each must go red via the conflict pin and/or exact placement);
   - swap the north/south formulas;
   - resolve targets by `targetName` instead of `targetConst` (does anything go red? if equivalent on the corpus, say so and add a unit test where name ≠ const-derived name);
   - drop conflict recording;
   - change the GBA `layOutComponents` defaults (the GBA world tests can't run here, so check that a unit test of the exported function with default args catches it);
   - drop the bbox intersection check.
7. **Live-verify.** Render the Johto overworld region at scale 8 and at full size for a small bbox around NewBarkTown/Route29/CherrygroveCity. View the PNGs and describe them in the report. The coordinator will look too.

## Out of scope
- UI/server world view.
- Warp-graph dungeon auto-layout and the sidecar.
- Connection-strip rendering inside a single map's border ring (the engine draws neighbour strips there; the single-map render keeps the plain border ring, per Task 9).
