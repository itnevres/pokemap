# Plan 6b review: GBC app layer (Opus, read-only)

Reviewed: `docs/superpowers/plans/2026-09-25-pokemap-plan-6b-gbc-app-layer.md` at `fe7e8cd`. Every claim below was re-derived against the code and the PerfPlus corpus, using `npx tsx` probes run from the scratchpad with the real loaders. No repo file was changed except this report.

## Verdict: **approve-with-changes**

The architecture holds: separate wire types, GBC sibling components behind `Root.tsx`, and app-level time of day. Nothing is Critical. Six Important findings change what gets built or tested:
- off-map events;
- the fish time filter;
- the spotlight dropdown;
- LensPanel copy;
- "it changed" assertions;
- a roof test that can't discriminate.

Fold them into the plan text before dispatching Task 1.

### Verified correct (no action)

- **Line references.** All of these match:
  - `useMapLayout.ts:14-21`;
  - `MapCanvas.tsx:173`, `354-357`, `600-601` (in `hoverAt`, l. 577), `944-948`, and its `drawCollision`/`drawEvents` imports from `core/render/overlays.ts` (typed to `LayoutRaster`/`MapData`);
  - `WorldCanvas.tsx:240` (`computeFit` exported);
  - `SpeciesSpotlight.tsx:234`.
- **File sizes.** MapCanvas 961, WorldCanvas 2,083, App 633, server `index.ts` 997.
- **Server.**
  - No test reads `PokemapServer.project`. `editSessions.test.ts` uses its own `openProject`.
  - `parseBorder` is imported from `@pokemap/cli/src/args.js` (`index.ts:16`), and `parseTime` lives in the same module.
  - `readBody` is currently private (`index.ts:33`).
- **Group names.** `newgroup` names are dropped at `gbc/load/map.ts:34-35`. There are 26 groups; NewBarkTown is group 24, `NEW_BARK`.
- **NewBarkTown.** 10×9, `TILESET_JOHTO`, 4 warps. `border 3` gives 512×480 = (10+6)·32. `border 4` throws in `renderGbcMap` (`render/map.ts:231-233`), so the 400 pre-check is needed. The three times of day produce three distinct PNGs.
- **World.** 2 conflicts. `buildGbcWorld` takes 2 ms.
- **Encounters.** DUNSPARCE has 6 hits, all on `DarkCaveVioletEntrance`. Route29's grass sources each sum to 100.
- **Event units.** Half-block steps confirmed corpus-wide, not just on NewBarkTown:
  - 2,730 of the 3,701 events (in 389 of 391 maps) lie beyond the block range (x ≥ w or y ≥ h), so blocks are impossible;
  - no event has a negative coordinate;
  - see finding 1 for the 7 events that fall outside even the step range.
- **Map-keyed metatile route is justified.** `resolveFromTables(map, time)` is per map, and so is the roof swap, per group (`render/map.ts:112`).
- **Vite.** The proxy `/api → 127.0.0.1:5174` serves both families unchanged (`packages/ui/vite.config.ts`).
- **UI typecheck.** Importing core types from the UI already works: the UI tsconfig has `types: ["node", ...]`, and `SpeciesSpotlight` already type-imports `analyse/coverage.ts`.
- **Performance, measured.** Cold render + `encodePng` of all 391 maps takes 1.7 s and totals 3.2 MB (largest: Route26, 51 KB). `gbcWhereSpecies` takes 9-36 ms and `gbcCoverage` 11 ms. The world route and per-keystroke spotlight are fine.

---

## Findings

### 1. Important: 7 real events lie outside the map even in step units, including on the success-criterion map

**Evidence.** Probe with `loadGbcMapEvents` over all 391 maps, checking `x ≥ 2w || y ≥ 2h`:
- `CeruleanCave1F`: warps 25,15 / 23,9 / 27,1 on a 9×15 map (`maps/CeruleanCave1F.asm:13-15`);
- `CeruleanCave2F`: warps 23,7 / 29,1 / 19,7 (`CeruleanCave2F.asm:13,14,16`). This is the criterion-1 defect-banner map;
- `GoldenrodPokecenter1F`: object 16,8 on a 5×4 map (`GoldenrodPokecenter1F.asm:820`).

CeruleanCave1F's `.blk` is the correct 135 bytes, so no layout defect flags it.

The plan never says what `GbcMapCanvas` does with an event that falls outside the drawable area, even with `border=1`. The default outcome is a silent drop, which runs against G4 ("never silently drop").

**Fix.** Add to Task 1's payload or Task 4's UI:
- count out-of-bounds events per kind and surface them in the defect banner as "N events outside the map: …";
- make the event hit test bounds-check;
- add a Task 4 test that pins CeruleanCave2F = 3 off-map warps and GoldenrodPokecenter1F = 1 off-map object;
- live-verify that the banner lists them.

### 2. Important: the gutter's time filter hides every time-tagged fishing row at "morn"

**Evidence.**
- Fish sources are tagged only `time: "day" | "nite"`. "day" means `wTimeOfDay < NITE_F`, which covers morn **and** day (`atlas.ts:153-158`, `222-223`, from `fish.asm .TimeEncounter`).
- Probe: all **67 of 67** fishing maps carry time-tagged fish sources, 272 of them.

Task 6's "filtered to the app-level time for time-tagged sources", written the natural way (`s.time === time`), shows no time-tagged fishing rows at morn on any map.

**Fix.** In Task 6, specify a single `sourceMatchesTime(source, time)` rule:
- untagged → always shown;
- grass → exact match;
- fish `"day"` → morn or day;
- fish `"nite"` → nite.

Add a test: a fixture fish `day` source is visible at morn and at day, and hidden at nite.

### 3. Important: the SpeciesSpotlight dropdown never opens against a bare GBC species list

**Evidence.**
- `SpeciesSpotlight.tsx:108-113` filters `/api/species` with `s.startsWith("SPECIES_" + q)`.
- Plan Task 2 returns "sorted bare species constants", e.g. `DUNSPARCE`, so every match list is empty.
- Typed search still works, because `/api/where` normalises server-side. The type-ahead fails silently, and no planned test would notice.

**Fix.** Pick one of these in the plan:
- **(a)** make the matcher prefix-agnostic: compare `s.replace(/^SPECIES_/, "")` against `q.replace(/^SPECIES_/, "")`. This is GBA-identical, so add a GBA regression test and a bare-list test;
- **(b)** have GBC `/api/species` emit `SPECIES_`-prefixed names. That leaves the component untouched, but invents a prefix the GBC data never has.

(a) is preferred. Add "dropdown lists DUNSPARCE for `duns` against a bare list" to Task 6's tests.

### 4. Important: an optional `methodKey` alone doesn't make LensPanel honest for GBC

**Evidence.**
- The method legend copy is hard-coded as "surfing, fishing or rock smash" (`LensPanel.tsx:43`), with no headbutt.
- The `METHOD_LENS_KEY` slug union is `"water"|"fishing"|"rock-smash"` (`LensPanel.tsx:60-64`), and the swatch classes exist only for those three (`styles.css:1465-1475`).
- The level-curve copy says "weighted by encounter rate" (`LensPanel.tsx:38-39`). `GbcCoverage.levelByMap` is instead an **unweighted** mean of per-source averages, and its own doc says it is a different statistic from GBA's (`atlas.ts:531-546`).
- The precedence isn't defined: Task 6 tests "method-lens tint precedence", but the plan never states the GBC order, or where headbutt ranks. GBA's is water > fishing > rock (`WorldCanvas.tsx:1052-1054`).
- The plan contradicts itself: criterion 3 lists **grass** among the method-lens tints, while Task 6 lists water/fish/headbutt/rock.

**Fix.**
- Add a second optional prop, `legendCopy?: Partial<Record<LensId, (s) => string>>`. GBA stays unchanged when it is unset.
- Widen `methodKey` to `{ slug; label }[]` and add `.lens-panel__legend-swatch--headbutt`.
- State the GBC precedence (e.g. water > fish > headbutt > rock) and the GBC level-curve wording.
- Drop grass from criterion 3, or add it to Task 6.

### 5. Important: three planned checks are "it changed" assertions (Plan 0 §7)

**Evidence.** Plan 0 §7 says: "'It changed' is not an assertion. 'It changed to this' is." The plan has:
- Task 1: "time-of-day PNGs that differ";
- Task 4: "the `time` change changes the URL";
- criterion 1: "see different pixels".

**Fix.**
- **Task 1:** for each of morn/day/nite, assert that the route body is byte-equal to `encodePng(renderGbcMap(proj, "NewBarkTown", { border, time }))`, then that the three are pairwise distinct. The equality pins the value, and it also catches a cache key that drops `time`, the Task 19 lesson.
- **Task 4:** pin the exact URL string, e.g. `/api/render/NewBarkTown.png?border=1&time=nite`.
- **Criterion 1:** name one pixel coordinate whose RGB is recorded for each time.

### 6. Important: the roof-risk test on NewBarkTown can't detect a missing roof swap; the core helper is missing from the file map

**Evidence.**
- NewBarkTown's roof swap is a measured byte-identical no-op (`task-9-implementer.md:122-131`, RESUME l. 71).
- Probe: the swap is also a no-op for all 7 JOHTO-tileset maps in groups 24/26 (NewBarkTown, CherrygroveCity, Route26/27/29/30/31). It is real for VioletCity (roof 1), AzaleaTown (2), CianwoodCity (3) and GoldenrodCity (4).
- `task-1-spec.md:71` uses NewBarkTown for the thumbnail-equals-render-region test. That test passes even if the thumbnail helper skips `roofSwappedTiles`.
- `roofSwappedTiles` is private (`render/map.ts:112`), so a map-keyed thumbnail needs a new core export. `task-1-spec.md:67` adds `renderGbcMapMetatile`, but the plan's file table doesn't list `render/map.ts`.

**Fix.**
- Risk row plus Task 1: run the equality test on **VioletCity**, on a block whose metatile uses a tile in `$0A-$12`.
- Add the discriminating pair: the same id renders differently for VioletCity and AzaleaTown (different roofs).
- Add `packages/core/src/gbc/render/map.ts | changed, additive | renderGbcMapMetatile` to the file table.

### 7. Minor: the "duplicate COLL_* values" claim is false for this corpus

**Evidence.** `parseCollisionConstants` gives 109 names and 109 distinct values, with no duplicates. The duplicated `$00`/`$01`/`$07`/`$10`/… come from `LAND_TILE`/`WATER_TILE`/`TALK`/`LO_NYBBLE_GRASS`/`HI_NYBBLE_*`, which aren't `COLL_` names (`collision_constants.asm:2-5, 119-128`).

**Fix.** Keep `names: string[]` as future-proofing if you like, but correct the justification and drop the "`+N` if aliased" hover rule, which can never fire.

### 8. Minor: sharing server helpers via `index.ts` creates an import cycle and exports dead code

**Evidence.**
- `index.ts` would import `createGbcServer` from `gbcRoutes.ts`, and `gbcRoutes.ts` would import `readBody` from `index.ts`, which is an ESM cycle.
- 6b's GBC routes are all GETs, so `readBody` is unused.
- `send` is a closure inside `createServer` (`index.ts:176`), so it can't be shared without editing the GBA body.

**Fix.** Drop "export `readBody`" and let `gbcRoutes` define its own 3-line `send`. Alternatively, move the shared helpers to a new `packages/server/src/http.ts` and state that this is the only GBA-side refactor.

### 9. Minor: `serve.ts --gbc` wording and config posture

**Evidence.**
- "`argv[2]` still wins" conflicts with running `serve.ts --gbc`, since `argv[2]` would be `"--gbc"`.
- `cli/src/context.ts:17-20` documents `gbc.projectPath` as test-only, "never a CLI fallback".
- Passing the PerfPlus root positionally already works once `createServer` branches.
- Both new `launch.json` entries bind port 5174.

**Fix.**
- Say that `--gbc` is parsed first and that otherwise a positional root beats `cfg.projectPath`.
- Note that the dev server is the one sanctioned non-test reader of `gbc.projectPath`, and update the `context.ts` comment in Task 1.
- State that `server` and `server-gbc` are mutually exclusive, so criterion 4's GBA smoke test restarts the server.

### 10. Minor: wire-type naming and location

**Evidence.**
- Q1 says the UI "imports both families' wire types from core already". It doesn't: GBA's are UI-side (`useMapLayout.ts:14-21`, `MapTree.tsx:4-7`).
- `GbcProjectInfo` (Q1) and `ProjectInfo` (file table) name the same type.
- `GbcGroupsPayload` duplicates the `MapGroupsData` shape.
- The GBA server would import from `core/src/gbc/wire.ts`.

**Fix.**
- Put `ProjectInfo` in `core/src/family.ts`, next to `EngineFamily`.
- Define `GbcGroupsPayload` as `{ groupOrder: string[]; groups: Record<string, string[]> }` and note that it is structurally `MapGroupsData`.
- Correct the Q1 sentence.

### 11. Minor: the world view is dominated by 323 single-map interiors, and `computeFit` clamps

**Evidence.**
- Probe: 326 components. Only 3 hold more than one map: Johto (31 maps), Kanto (35), and SilverCaveOutside + Route28. The other 323 are singletons.
- The bounds are 255×746 blocks (8,160×23,872 px), and the singletons occupy y ≥ 304.
- GBA hides interiors by default (`isDrawnByDefault`), but the plan has no GBC equivalent.
- Decoded memory is 38.2 Mpx ≈ 153 MB RGBA per time of day. A cache keyed by map + time and never evicted reaches about 460 MB after cycling all three times.
- `computeFit` clamps to `MAX_ZOOM = 16` in bounds units (`WorldCanvas.tsx:21-22, 244`). With block-unit bounds that is half of native 32.

**Fix.**
- Initial fit to the union of multi-map components.
- Evict other-time image entries when the time changes.
- Pass bounds in pixels to `computeFit`, or note the cap.
- Task 2's tests pin 326 components, 3 of them multi-map.

### 12. Minor: the conflict badge target is ambiguous

**Evidence.** Each `Conflict` involves three maps: `map`, `viaA.from` and `viaB.from`. The real conflicts are:
- Route18: via Route17 at (40,87), via FuchsiaCity at (40,88);
- Route17: via Route18 at (30,50), via Route16 at (30,49).

**Fix.** Put the badge on `conflict.map` (Route18 and Route17). The tooltip names both `via` maps and the (dx,dy) = (0,1). Task 5's fixture test pins exactly that.

### 13. Minor: block id 0 semantics (no corpus impact, record for Plan 7)

**Evidence.**
- `renderGbcMap` draws raw id 0 as `map.border` (`render/map.ts:269`).
- The engine's `GetCoordTile` returns `$FF` for raw id 0, which is `COLL_FF` → `WALL_TILE` (`home/map.asm:1717-1719, 1744-1746`; `collision_permissions.asm` row 255). A naive `collision[0]` lookup would be wrong.
- Probe: 0 raw-zero blocks in the corpus.

**Fix.** Add one line to Task 4: the hover and overlay treat raw id 0 as "renders border $xx, collision $FF (wall)". This carries forward to Plan 7's painting.

### 14. Minor: granularity and ordering

**Evidence.** Task 1 bundles a lot:
- 2 core loaders plus the new render export;
- the wire types;
- the family branch;
- 5 routes and the 501s;
- `serve.ts` and `launch.json`.

Task 2 and Task 3 depend only on Task 1.

**Fix.** Split Task 1 into:
- **1a:** core additions, the family branch, `/api/project`, the 501s and `serve.ts`;
- **1b:** the groups/map/render/metatile routes.

Note that Tasks 2 and 3 can run in parallel worktrees (RESUME's parallel-worktree lesson).

### 15. Minor: small factual nits

- Q3's `"day"` default comes from `cli/src/index.ts:52` (`parseTime, "day"`). `args.ts parseTime` has no default.
- Criterion 3: "lights up Dark Cave" → "lights up exactly `DarkCaveVioletEntrance`, and no other map".
- Criterion 2: "Johto and Kanto components" → "the 3 multi-map components".
