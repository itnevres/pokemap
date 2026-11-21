Approved — Critical: 0, Important: 0, Minor: 5 (plus 1 escalation outside 11a's scope, not counted)

Reviewer: Claude Opus (fallback; astra out of quota). ROLE: spec. Static review of `git diff 9a51768..e2658b1 -- packages/`
(99f0ac5 tests, 3c12b60 conductor test, e2658b1 fix), read-only checkout `rv-t11`. I also read the subject project's
headers and layouts on disk (read only) to check what the fixtures actually select. I ran no tests and no mutations.

## Round-1 findings

| # | Finding | Status | Evidence |
|---|---|---|---|
| I1 | 32-bit `&` lets `2**32` through (B11/B14a) | **Closed** | `blockEditRoutes.ts:233,235`: the `>` check runs before the bitwise test. `integer()` (:40) already refuses negative and unsafe values, so every input that reaches the `&` is in range. Tests `suite:603-608` cover `2**32` and mask+1 for both fields. The test's layer mask (lowest-set-bit shift) is derived on its own, not copied from `maskShift`. The conductor's red run (both 200 before the fix) confirms the tests guard this. |
| I2 | Cap from the current layout only (B6/B14b) | **Closed**, see m2/m3 and E1 | `:193-198`: minimum over every alias symbol whose canonical `metatilesBin` matches, through `gbaConsumingLayouts`, using the planner's role rule. `nextId` is null at the cap (`:209`). |
| I3 | Coverage gaps | **Closed except two deferred items** (m4) | Case 3 content (`suite:280`): GBA entries are decoded from the staged 16 bytes with literal masks; GBC tiles are compared to the staged buffer. Cap (`:318`). `tv` before and after a stage. GBC `time` value, day≠nite sheet (`:424`). Changed-draft preview (`:469`). GBC 15 tiles and unknown collision (`:588-639`). Still untested: GET planner refusal → 409, and B14d. |
| m1 | Hardcoded layer options (B14c′) | **Implementation closed; test does not guard it** (m1 below) | `:89-116` parses enum and defines from `include/global.fieldmap.h` and falls back to 0/1/2. |
| q-m1 | Short grid 500 → 409 BAD_GRID (B14d) | Implemented; untested by agreement | `:83-88,128,185,267`. The message matches B14d exactly: `<path>: has N blocks, fewer than W×H`. |

## Findings

**m1 Minor: the layer-options test cannot tell the parser from the fallback.** `suite:610-629` vs `blockEditRoutes.ts:174`.
The subject's enum (`include/global.fieldmap.h:23-27`) is `METATILE_LAYER_TYPE_NORMAL, _COVERED, _SPLIT` with
implicit values 0/1/2. That is identical to the fallback literal. The conductor's red run backs this up: only 3 tests
failed, so this test passed against the old hardcoded code. Surviving mutation: `layerTypes: ["NORMAL","COVERED","SPLIT"].map(...)`,
or always taking the fallback branch at `:115`. To guard B14c′, run the enum parser on a temp copy of the header with a
reordered or extended enum (for example `METATILE_LAYER_TYPE_X = 5`).

**m2 Minor: B14b's alias expansion is untested.** `blockEditRoutes.ts:195-198`, `suite:318-346`. I replayed the
fixture's candidate search on disk (layouts.json order, map_groups order, splits emerald 512 / others 640). It selects
`data/tilesets/primary/general/metatiles.bin`, map `FarawayIsland_Interior`, symbol `gTileset_General`. The 512 consumer
there uses the **same symbol**, so a symbol-only cap (`gbaConsumingLayouts(project, symbol)` with no `tilesetSymbols()`
filter) still yields 512 and passes. The planner's own `SPLIT_LIMIT` also refuses at 512 for this file (count is
8192/16 = 512), so `nextId === null` passes even if the `ts.metatileCount >= cap` guard at `:209` is deleted. The alias
path does exist in the subject: `building/metatiles.bin` is used by `gTileset_Building` (emerald, 512) and by
`gTileset_Building_Dome/Pike/Palace/...` (frlg, 640). A case that runs GET on a Dome map and expects `cap: 512` would
kill both mutations. This is my replay, not a run. Confirm with the alias filter mutated.

**m3 Minor: under aliasing, the route's `limits` disagree with the planner (B6 vs B14b).** `blockEditRoutes.ts:195-209`
vs `gbaOps.ts:337-349`. The planner checks only `consumingUses(proj, symbol)`, which is symbol-scoped (Task 5 R8). The
route takes the minimum across aliases. Scenario in the subject: `building/metatiles.bin` holds 512 to 639 metatiles and
GET runs on a `gTileset_Building_Dome` map. The route reports `cap: 512, nextId: null`. The planner, and therefore 11b's
`apply` with `saveAsNew`, accepts the append and returns `newBlockId`. B6 defines `nextId` as "null when the planner would
refuse", while B14b defines the cap as the file's. Both cannot hold here. The route follows the spec ("GBA the limit of
every layout consuming the tileset", design §Save as new; identity by file, §Identity). The planner is the side that is
wrong (E1). Current counts (building: 2048/16 = 128) make this unreachable today. The conductor should record which side
11b must follow.

**m4 Minor: two contracts still have no test.** (a) A GET planner refusal → 409 `{error, code}` (B4; `:203,282`).
Mutating `getConflict` into a plain throw (400 for BAD_VALUE, or 500) survives. (b) B14d: a truncated blockdata or `.blk`
file answering 409 `BAD_GRID`. Deleting the `BadGrid` branch at `:128` survives and returns 500 with `INTERNAL_ERROR`.
Both were deferred knowingly in the brief. Logged here so they are not lost before 11b.

**m5 Minor (spec side of the quality question): an unparseable enum member refuses every GBA block GET with 400.**
`blockEditRoutes.ts:99,104,106`. `options()` runs on every GET (`:209`). A project whose enum that mentions
`METATILE_LAYER_TYPE_` contains a member the regex cannot read (`= 1 << 1`, `= METATILE_LAYER_TYPE_COVERED + 1`, or a
`u`-suffixed hex value with a trailing cast) makes every `GET /api/edit/<map>/block` answer 400 BAD_VALUE
`options.layerTypes: ...`. The block editor is unusable for that project. B11 reserves 400 for malformed requests, and
this request is well formed. B14c′ says the fallback is "narrow, not a refusal". The narrower reading is to skip
unreadable members, or fall back when none can be read. The quality pass owns the final call.

## Escalation E1 (outside 11a: core Task 5/6 rulings R8/R9; not counted)

GBA `gbaConsumingLayouts`, `gbaBlockUsage`, `usedElsewhere`, `assertStructural` and the `SPLIT_LIMIT` loop are
symbol-scoped (`usage.ts:345-357,385`; `gbaOps.ts:43-55,206-221,337-349`). The design spec (§Identity, lines 41-47)
requires every usage count and check to be keyed by resolved file path, "never by tileset name". This subject has real
GBA aliases: nine `gTileset_Building*` symbols share `gMetatiles_InsideBuilding` (`headers.h:225-342`), and six
SecretBase secondaries share `gMetatiles_SecretBaseSecondary`. Concrete failures:
- An OK edit of a block through a `gTileset_Building_Dome` map returns `usage.maps` without the 112 emerald
  `gTileset_Building` layouts' maps, and `confirm` can be false while those maps change.
- A tile that is valid under the frlg 640/7 split but not under emerald's 512/6 split passes `assertStructural`.

11a's GET exposes this `usage` as is. This needs a conductor ruling: either amend R8/R9, or record that GBA aliasing is
out of scope.

## Do the new tests pin what they name?

- Case 3 (`:280`): yes for content. The oracle is disk bytes plus a literal decode. GBA covers entries only; staged
  behavior and layerType are not compared, as the brief scoped it.
- Case 5 (`:318`): GBA pins the cap against an independent disk scan (see m2 for alias coverage). The `if (count >=
  minimum)` is live in the subject (512 >= 512), so `nextId: null` is asserted. GBC stages a complete 256-block plan
  with collision records (T1) and pins `{nextId: null, cap: 256}`.
- Case 6 tv and time: yes. `tv` is checked against the map GET before and after a stage, so a constant version fails. The
  day≠nite map is chosen by the hub render route, an independent oracle.
- M15 (`:443`): compares sheet cells with the top-left 8x8 of the hub's `/api/metatile` image for blocks whose top-left
  tile has a palette other than 0. A sheet drawn in palette 0 fails. The oracle is a hub image (T5).
- Case 7 changed draft (`:469`): rendering the unchanged block A fails, because B is chosen visibly different from A by the
  hub's own images. The same-layer filter only removes a confound.
- Guards (`:588-639`): status, code and `^draft.<field>` are all asserted.
- No expectation is computed by `blockEditRoutes.ts`. The fixtures use the shared project loaders (`splitFor`,
  `tilesetPaths`, `palMap`) only as selectors and for literal derivations. That is acceptable under T5.

## B14b vs the planner (the brief's question)

They match whenever the file has one symbol, and the subject's selected fixture is in that case. They differ when
aliases exist: the route refuses earlier than the planner (m3), and the root cause is the planner's symbol scope (E1).
The role rule is the same in both (`primary → split.metatiles`, `secondary → metatilesTotal − split.metatiles`).
`Math.min` cannot see an empty list, because the current layout always consumes its own symbol.

## Not checked

- No vitest, typecheck or mutation runs. My m2 replay of the fixture's candidate search is a Node approximation of
  `mapNames()` order and of `splitFor`.
- 11b check and apply. The quality items: per-request header reads, BadGrid placement, test robustness.
- Whether `gbcSheetToTileId` and `palMap` index agree for tiles ≥ 0x80 in the M15 test. Its selected blocks may all use
  tiles below 0x60, which would let a mutation indexing `palMap` by sheet index survive. Not verified.
