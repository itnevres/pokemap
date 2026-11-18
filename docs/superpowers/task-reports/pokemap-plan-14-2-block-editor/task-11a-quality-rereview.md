Needs changes — Critical: 0, Important: 2, Minor: 2.

Reviewer: Claude Opus (fallback; astra out of quota). ROLE quality, fix round 1, static review of
`git diff 9a51768..e2658b1 -- packages/` (99f0ac5 tests, 3c12b60 conductor test, e2658b1 fix). No tests run.

## Round-1 findings

- **I1 (32-bit `&` lets `2**32` through): closed.** `blockEditRoutes.ts:233` and `:235` compare with `>` before the
  `&`. Worked through by hand for the subject's masks (behavior 0xFF, layer 0xF000 >>> 12 = 15): `2**32 > 15` is
  refused, and `mask+1` is refused by both terms. Tests `blockEditRoutesSuite.ts:599-607` cover `2**32` and `mask+1` for
  both fields. They compute the shift independently (`clz32`, not `maskShift`). The conductor's red run (behavior and
  layerType at `2**32` answered 200) shows they kill the old code.
- **m1 (short GBA grid gives 500): closed in code, not tested.** `:185` `requireGridCell` runs before `ids[...]`, and
  `:128` maps `BadGrid` to 409 `BAD_GRID`. The message has the form "<path>: has N blocks, fewer than W×H" (B14d). See
  m1 below for the missing test.
- **Trailing blank line: closed.** `git diff --check` is clean. The file ends `}\r\n`.

## Findings

**I1 — Important — One unparseable enum member blocks every GBA block GET with a 400.**
`blockEditRoutes.ts:99`, `:104`, `:107` throw `bad(...)` (BAD_VALUE) from `gbaLayerTypes`. `options()` is called inside
the GET result at `:208`. That refusal is not a `GetConflict`, so `fail` at `:130` sends **400**, for every
`/api/edit/<map>/block` GET (`block=` and `x/y` alike) on every map of the project. Preview and sheet are not
affected. Answer to the brief's question: yes, it refuses every GET for such a project. That is not acceptable.
- Concrete scenario: a fork whose `include/global.fieldmap.h` enum has any member the strict regex at `:98` rejects.
  Examples: `METATILE_LAYER_TYPE_SPLIT = METATILE_LAYER_TYPE_COVERED + 1`, `= 1 << 1`, a `#if`/`#endif` line inside the
  enum (the comma split makes `"#if X\n METATILE_LAYER_TYPE_Y"` one part), or an unrelated enum that merely mentions
  the prefix in a value (`FOO = METATILE_LAYER_TYPE_SPLIT + 1`; `:94` selects any enum that contains the substring).
  The block editor then cannot open any block. Its only defect is one option list. The client gets a 4xx for a
  project-data defect it cannot fix.
- This is not hit today. All six configured GBA corpora (game, pokeemerald, pokefirered, expansion, modern-emerald,
  pokeclassic) have the plain 3-member enum, which parses.
- It contradicts B14c′'s "narrow, not a refusal" for the missing case and the project's narrow-refusal rule.
  `gbaDefineValues` (`:112`) already skips an unresolvable define silently. The enum path should do the same:
  1. Drop an unparseable member and every implicit successor until the next literal `= n`.
  2. Fall back to 0/1/2 only if nothing parses (or return what parsed plus a warning).
  3. In no case throw from `options()`.

**I2 — Important — The new enum parser has no test that fails when it breaks. The B14c′ test equals the old literals.**
`blockEditRoutesSuite.ts:610-629` compares `options.layerTypes` with the disk enum. On the subject that enum is
exactly NORMAL/COVERED/SPLIT = 0/1/2, the same as the removed literals. So reverting `:174` to
`["NORMAL","COVERED","SPLIT"].map(...)` passes the test. So does deleting the enum loop (fallback), and so do breaking
the explicit-value, octal, hex, suffix and sign handling and the `#define` override at `:112`. The conductor's red
run confirms this: 3 failures before the fix (cap and the two `2**32` cases), none on layer options. The parser is
roughly 25 lines of new parse-edge logic with a refusal path (I1). Under the high-risk evidence rule it needs a
killing test.
- The GBA root is a temp copy (`copyGbaTilesetProject`, `:147`) and the header is reread per request.
- So a test can rewrite `include/global.fieldmap.h` in `root`, restore it in a `finally`, and assert the parsed result,
  for example:
  - an enum with `METATILE_LAYER_TYPE_COVERED = 4`, followed by an implicit member (expect 5);
  - a header with no enum (expect the 0/1/2 fallback);
  - after I1's fix, an unparseable member (expect 200 and the remaining members).

**m1 — Minor — B14d is untested, and GBC short grids still give 500 for cells inside the data.**
- No test reaches `requireGridCell` (`blockEditRoutes.ts:83-87`, `:185`, `:267`). The brief acknowledges this. An
  off-by-one mutation (`index > count`) lets `index == count` through to `ids[count]` = `undefined`, which gives the
  old NaN-offset 500 on GBA. No test notices.
- On GBC, `loadLayout` (`core/src/gbc/load/map.ts:350-352`) throws for any undersize `.blk`. A cell with
  `index < count` on a short file passes `:267`. It then fails in `resolveGbcEditTarget`, which calls `proj.layout`,
  as a plain Error: **500** `INTERNAL_ERROR`, with the loader's good message. A cell one past the data gets
  409 `BAD_GRID`. The same file answers 409 or 500 depending on the cell, and `block=` on it answers 409 through the
  planner.
- Suggest:
  - On GBC, check `count < width*height`, because the loader refuses the whole grid.
  - Add one temp-copy test: truncate a grid, expect 409 `BAD_GRID`, restore the file.

**m2 — Minor — Two test oracles depend on the fixture in ways that can fail falsely or never assert.**
- (a) `blockEditRoutesSuite.ts:452-464` (M15 test) picks blocks whose top-left tile has palette ≠ 0. It compares the
  raw sheet cell with the hub metatile's top-left 8x8.
  - For roof tilesets (`ROOF_TILESETS`, `core/src/gbc/render/map.ts:12-16`), the hub swaps tiles 0x0A-0x12 for the
    map group's roof. Those tiles use `PAL_BG_ROOF` (6, nonzero), which is exactly the kind of tile this filter keeps.
  - If `pair.a` ever lands on such a tileset with a roof group, the test fails, although the sheet does what it was
    built to do. It passes today only because of which map is `pair.a`.
  - Either skip roof indices for roof groups, or decide (spec question) whether the sheet should show roof-swapped
    pixels. Today it shows the raw placeholder graphics, which do not match the map view.
- (b) `:346` `if (count >= minimum) expect(nextId).toBeNull()` is conditional. If the chosen file has fewer blocks
  than the minimum cap, `nextId` is never asserted. On the subject the candidate's count is 640 against a cap of 512,
  so it asserts today. If the fixture changes it stops asserting without any signal. Assert the other branch as well
  (`nextId` equals the count).
- (c) `:424-433` renders every GBC map twice in full until day and nite differ. This is unbounded, under a 120 s
  timeout. It follows the brief, and it stops early. Note only.

## Other checks (no finding)

- **Per-request header reads.** Each GBA GET reads `metatile_behaviors.h` and `global.fieldmap.h` (plus its
  `constants/` includes), and runs `existsSync`. The cost is small, and the reads pick up header edits without a
  restart. Not a blocker.
- **Cap (B14b)** (`:193-198`).
  - Every symbol is a key of `tsPaths`, so `tilesetPaths` cannot throw.
  - The current layout always consumes `symbol`, so `Math.min` never gets an empty list (which would give `Infinity`,
    serialised as `null`).
  - `ts.metatileCount` comes through the overlay (`setTilesetOverlay`), so staged appends count. The short-circuit at
    `:209` agrees with the planner whenever the planner would refuse.
  - Cross-reference for the spec pass: the planner (`gbaOps.ts:336-349`) checks only `symbol`'s own uses. With an
    alias file, the route can advertise `nextId: null` where 11b's saveAsNew would still succeed. That direction is
    conservative, and the planner is the side missing the alias check.
- **GBC staged-grid choice** (`:264-266`). Default `.sort()` and `gbcOps.ts`'s `compare` order names the same way, so
  the same staged grid wins.
- **`BadGrid`** is thrown synchronously in `read`, caught at `:149`, and mapped before the refusal branch. It is never
  thrown on the async preview path. Using the class before its declaration is fine at runtime.
- **Test hygiene.**
  - Staged plans in tests 3, 5 and 6 are discarded in `finally` and in `afterEach` (`:210`, `closeAll` clears the
    sessions).
  - The new tests write no files. Both roots are temp copies, removed in `afterAll`.
  - Test 3's GBC no-op collision edits satisfy T1.
  - Test 7 keeps the layer types equal and uses ids from the primary file (`idFor` returns 0 on GBA).
  - The oracles are disk bytes, literals, or hub responses captured before staging.

## Outside the fix scope (pre-existing, not counted)

`options.behaviors` (`:170-173`) reads `MB_*` only as `#define`s. Upstream pokeemerald and pokeemerald-expansion
declare them in an `enum` (240 members; the only define is `MB_INVALID UCHAR_MAX`, which does not resolve). Their
behaviour list is therefore empty. The subject (256 defines) and pokefirered are fine. Once I1 is fixed, the same
enum reader could serve both lists. Conductor's call.

## Not checked

- Runtime: no vitest, typecheck, build, live UI or mutation runs. The red run (3 failed / 27 passed), the typecheck,
  and the 11-file verify list are conductor evidence and were not re-run here.
- Spec-role questions (B14b against the planner, whether the tests pin what they name) beyond the cross-references
  above.
