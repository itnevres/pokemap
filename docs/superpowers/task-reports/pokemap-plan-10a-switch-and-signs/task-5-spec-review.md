# Task 5 spec-compliance review (Plan 10a, linked text)

Reviewed: `packages/core/src/signs/linked.ts` (125 lines) and `packages/core/test/signs/linked.test.ts` (113 lines),
both read in full (staged, uncommitted vs 6ebe404). Checked against plan Task 5 interfaces, spec S4, S9a "Species list",
S10, the brief, dispatch and the binding oracle.

### Spec Compliance

- ✅ Spec compliant (0 Critical, 0 Important, 3 Minor).
- ⚠️ Cannot verify from this task: the GBC "Indicator" in S4 uses `gbcEncounterSources(proj, name)` with the water
  filter (`packages/server/src/gbcRoutes.ts:252`), while linked species does not (see Point to check). Controller should
  record the ruling (below) in the spec so Task 6/8 do not re-litigate it.

Check run: `node node_modules/vitest/vitest.mjs run packages/core/test/signs/linked.test.ts` -> 1 file, 11 passed, 0
skipped, no warnings.

Requirement by requirement:
- `gbaMapDisplayName(proj, map)`: `regionMapSection` -> `[MAPSEC_X] = {..., sMapName_Y}` -> `sMapName_Y[] = _("...")`
  in `${proj.paths.regionMapDir}/region_map_entries.h` (linked.ts:32-41). Located errors name the file and the section
  or label (linked.ts:37,39). Comments masked so a commented-out entry cannot satisfy the lookup (linked.ts:19-22,
  tested at test:76-77). Matches.
- `gbcMapDisplayName(root, map)`: landmark -> index via `parseConstDefs` on the first `const_def` block
  (linked.ts:44-55) -> same index in `landmark` macro calls (linked.ts:58) -> `Label: db "...@"` with `@` padding
  stripped and `<BSP>` -> space, other tokens kept (linked.ts:62-65; token preservation tested at test:87-88). Missing
  constant / index / label each throw naming the file and key (linked.ts:55,59,66; test:36-37,89-92). Matches S4 and S10.
- `gbaSpeciesNames` (linked.ts:69-77) and `gbcSpeciesNames` (names.asm order joined with `loadGbcSpeciesIds`,
  linked.ts:79-92). Truncated table refuses with the missing species key (test:95-99). Matches.
- `linkedSpecies`: GBA from `rankSpeciesForSign` (linked.ts:104); GBC from `gbcEncounterSources` (which calls
  `wildForMap`, atlas.ts:419) skipping `conditional === "swarm"`, max chance per species across tables (linked.ts:111-116);
  both sorted by chance desc then display name (linked.ts:118-120), which adds the GBA tie-break the dispatch required.
  Matches plan + oracle chance rule (per-table sums come from the atlas builders; max across tables here).
- `linkedText` (linked.ts:123-125): exact strings `name`, `${name}\n\n${list}`, `${name}\n\nNo wild POKEMON here.`
  (test:17-21). Matches.
- Plan Step 1 / B3: Route101 -> `ROUTE 101`, NewBarkTown -> `NEW BARK TOWN`, Route29 -> `ROUTE 29` (test:25,33-34);
  both oracle arrays pinned verbatim against task-5-oracle.md (test:42, test:48-49; compared character by character).
  Empty case in both families against real maps: GBA PalletTown (test:53-59), GBC CeruleanGym with FISHGROUP_NONE
  asserted (test:61-69). Swarm exclusion test (test:101-108).
- Scope: only the two task files plus the report were added (`git status`); no export changes to existing modules.

### Point to check: GBC empty case / header fishing on dry maps — DECIDED: compliant

Correction to the common file: the empty GBC test uses CeruleanGym (FISHGROUP_NONE, test:63-64), not PlayersHouse1F.
PlayersHouse1F is used in a separate positive test (test:109-111) that pins header fishing
`["MAGIKARP","KRABBY","CORSOLA","STARYU","KINGLER"]` on a dry indoor map.

Ruling basis:
- S9a "Species list" is literal: "GBC includes every source `wildForMap` returns except swarms." `wildForMap` returns the
  header fish group whenever `fishGroup !== "FISHGROUP_NONE"`, with no water check
  (`packages/core/src/gbc/load/encounters.ts:759-764`). The water-reachability filter lives only in the atlas
  (`atlas.ts:427`), not in `wildForMap`. Passing `hasWaterOverride = true` (linked.ts:111) reproduces exactly the
  `wildForMap` source set. PlayersHouse1F really is `FISHGROUP_SHORE` in the subject (`data/maps/maps.asm:499`).
- The dispatch's own example for the empty case is "a GBC house interior with FISHGROUP_NONE", i.e. it already
  expected header fishing to count; the implementer followed that.
- The coordinator's Route29 oracle derives the fish entries from the map header (`maps.asm Route29 = FISHGROUP_SHORE`),
  not from water tiles.
- S4's "the same sources the Indicator's ranking uses" names `wildForMap` for GBC explicitly, so it does not override
  S9a. The resulting behaviour (a sign inside a FISHGROUP_SHORE house lists fish) is a spec consequence, not a code
  defect; see Minor 1.

### Downstream consumption (Task 6 plan lines 242-280, Task 7)

- Task 6 `refreshLinkedSigns` can generate both modes from what is exported: name via `gbaMapDisplayName(proj, map)` /
  `gbcMapDisplayName(root, map)`, species via the overloaded `linkedSpecies("gba"|"gbc", proj, mapName)`, text via
  `linkedText`. GBA takes a `MapData`, so a session copy works. All name/species files are re-read on every call (no
  cache in linked.ts), so B4 (edit the landmark or region-map string in a temp copy, then plan) sees the new data and
  unchanged data regenerates identical text (deterministic sort with a total tie-break), which Task 6's plan==commit
  equality needs.
- Errors are thrown `Error`s with file + key; Task 6 must turn them into `{ refusals }` (S10 "located refusal"). Not
  this task's job, noted for the Task 6 brief.
- Task 7 only consumes server routes; no direct dependency on linked.ts.

### Strengths

- Reuses existing chance math (`rankSpeciesForSign`, atlas source builders with exact fishing-byte probabilities)
  instead of re-deriving it.
- Oracle pinned verbatim and passes with no disagreement; mutation-relevant tests exist for BSP, swarm, tie-break, max.
- Located errors are tested for every lookup step, including the comment-masking edge case.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
None.

#### Minor (Nice to Have)
1. linked.ts:109-111 / test:109-111 — Header fishing on dry maps (spec-mandated by S9a) means a sign inside any
   FISHGROUP_SHORE interior lists MAGIKARP, KRABBY, etc., and differs from the app's own GBC encounter panel, which
   applies the water filter (`gbcRoutes.ts:252` -> `atlas.ts:427`). Not a defect against the spec; recommend the
   coordinator record this as an explicit ruling in the spec S9a line (or ask the user once) so it is a known choice.
2. linked.ts:20-21,70,103 — `species_names.h` path string is built twice (gbaSpeciesNames and linkedSpecies) and
   `names.asm` likewise (linked.ts:80,108); only for error text. Could return the file from the name loaders. Polish.
3. Common file "Point to check" text names PlayersHouse1F as the empty test; it is CeruleanGym. Doc nit for the
   coordinator, not the implementer.

### Assessment

**Task quality:** Approved

**Reasoning:** Every plan interface exists with the specified behaviour, both oracle lists pass verbatim, located errors
cover each lookup, and the header-fishing choice follows S9a's literal "every source wildForMap returns except swarms".
