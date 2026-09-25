# Plan 6 Task 11: spec-compliance review (GBC world stitching + render-world)

Reviewed: worktree `/home/user/pokemap/.claude/worktrees/agent-adc366c1016fd68fc`, commit `0f456ac` (on `9192a69`). Subject: `/home/user/pokecrystal-PerfPlus` @ `81ededbe3`, read-only. The local-only `pokemap.config.json` edit was left alone. After every mutation was reverted, `git diff` shows only that file.

Verdict: **❌ ISSUES (2)**. The stitching rule is correct and the 2 conflicts are real data. The two issues are test-strength gaps where the spec, or the test's own name, promises coverage that is not there. Both are small to fix.

---

## 1. Conflict analysis (the central question)

### 1.1 Placement rule, derived independently from the engine

The findings name `LoadMapConnections`, but no routine by that name exists in this decomp. The relevant code is:
- the `connection` macro in `data/maps/attributes.asm`;
- `EnterMapConnection` in `engine/overworld/warp_connection.asm`;
- `GetMapConnection`/`FillMapConnections` in `home/map.asm`.

The macro stores `_y, _x` coordinate adjustments and a strip pointer. `EnterMapConnection` applies them when the player crosses an edge. Player coordinates are in 2-per-block steps.

| dir | macro | effect on entering the target | target origin in world (blocks) |
|---|---|---|---|
| west | `_x = tw*2-1`, `_y = -2*off` | `wXCoord = tw*2-1` (right edge of target); `wYCoord += -2*off` | `(x − tw, y + off)` |
| east | `_x = 0`, `_y = -2*off` | `wXCoord = 0`; `wYCoord += -2*off` | `(x + w, y + off)`. **Current** map's width: the target starts at the current map's right edge |
| north | `_y = th*2-1`, `_x = -2*off` | `wYCoord = th*2-1`; `wXCoord += -2*off` | `(x + off, y − th)` |
| south | `_y = 0`, `_x = -2*off` | `wYCoord = 0`; `wXCoord += -2*off` | `(x + off, y + h)`. **Current** map's height |

- **Offset reference point.** The offset is relative to the **current map's origin**, not to a strip start or a padding width. The `+ MAP_CONNECTION_PADDING_WIDTH` (3) in `_tgt = off + 3` only converts that origin-relative offset into `wOverworldMapBlocks`' padded buffer, and `_src`/`_tgt` clipping only handles a negative strip start. `_len` is a strip length and never affects coordinates.
- **Axis and sign.** North/south shift x and east/west shift y. This is the reverse of the macro's own header comment, so the findings are correct.
- **Dimensions.** West/north subtract the **target's** width/height; east/south add the **current map's** width/height.
- **Macro form.** All 142 `connection` lines use the 4-argument form. The legacy 6-argument form (`\4 − \5`) is unused.

This matches `buildGbcWorld` exactly (`packages/core/src/gbc/world/connections.ts`).

### 1.2 The conflicts, hand-computed from the raw lines

Sizes from `constants/map_constants.asm` (w×h): Route16 10×9, Route17 10×45, Route18 10×9, FuchsiaCity 20×18.

Raw lines:
```
FuchsiaCity: connection west, Route18, ROUTE_18, 7      Route18: connection west, Route17, ROUTE_17, -38
Route17:     connection north, Route16, ROUTE_16, 0              connection east, FuchsiaCity, FUCHSIA_CITY, -7
             connection east, Route18, ROUTE_18, 38     Route16: connection south, Route17, ROUTE_17, 0
```
Every edge is individually reciprocal (±38, ±7, 0/0). There is no 4-map loop among Route16/17/18/Fuchsia; they form a path. The **smallest cycle that fails to close** has 13 maps:

Route16 → Route17 → Route18 → FuchsiaCity → Route15 → Route14 → Route13 → Route12 → LavenderTown → Route8 → SaffronCity → Route7 → CeladonCity → Route16.

Walking it from Route18 at (0,0) and avoiding the direct Route18–Route17 edge:

| step | line | result |
|---|---|---|
| Route18 −east,−7→ Fuchsia | (10, −7) | |
| Fuchsia −east,9→ Route15 | (30, 2) | |
| Route15 −east,−9→ Route14 | (50, −7) | |
| Route14 −north,0→ Route13 | (50, −16) | |
| Route13 −north,20→ Route12 | (70, −43) | |
| Route12 −north,0→ Lavender | (70, −52) | |
| Lavender −west,0→ Route8 | (50, −52) | |
| Route8 −west,−9→ Saffron | (30, −61) | |
| Saffron −west,9→ Route7 | (20, −52) | |
| Route7 −west,−5→ Celadon | (0, −57) | |
| Celadon −west,9→ Route16 | (−10, −48) | |
| Route16 −south,0→ Route17 | **(−10, −39)** | via the loop |
| Route18 −west,−38→ Route17 (direct) | **(−10, −38)** | via the direct edge |

- **x closes and y is off by exactly 1 block.** The disagreeing constraint is the Route17↔Route18 edge (offset ±38) against the rest of the loop.
- **Which edge the BFS flags.** It reaches Route18 via Fuchsia first and Route17 via Route16 first, so it flags exactly that edge in both directions:
  - `Route18`: via Route17 (east, 38) gives (40,87); via FuchsiaCity (west, 7) gives (40,88).
  - `Route17`: via Route18 (west, −38) gives (30,50); via Route16 (south, 0) gives (30,49).
- **Match with the implementation.** My independent Python stitcher (`scratchpad/conn.py`, which parses `attributes.asm` and `map_constants.asm` directly) and `buildGbcWorld` produce these same 2 conflicts, byte for byte, pre-pack coordinates included.
- **Seen in the render.** A scale-32 render of bbox `54,100,12,12` shows the Route17/Route18 gatehouse split. Route18's half is drawn 1 block lower than Route17's half. That is the expected visual result of keeping the Fuchsia-derived placement.

### 1.3 Vanilla pokecrystal

- I fetched `pret/pokecrystal` master `data/maps/attributes.asm` and `constants/map_constants.asm` from raw.githubusercontent.com.
- `diff` of all `connection` lines between vanilla and PerfPlus shows **0 differences**. The four maps' sizes are also identical.
- Running my stitcher on vanilla gives the same 2 conflicts, with the same maps and coordinates.
- So this is **not PerfPlus-specific**. pret's disassembly builds a byte-identical Crystal ROM, so the retail game has this connection data too.

### 1.4 Every other cycle closes

- The planar graph has 71 undirected edges (142 records / 2) and a BFS spanning forest of 65 tree edges, which leaves **6 independent cycles**.
- **5 of the 6 close exactly** under the same rule:
  - Johto: Ecruteak–Route42–Mahogany–Route44–Blackthorn–Route45–Route46–Route29–Cherrygrove–Route30–Route31–Violet–Route36–Route37 (14 maps);
  - Johto: Goldenrod–Route35–Route36–Violet–Route32–Route33–Azalea–Route34 (8 maps);
  - Kanto: Lavender–Route8–Saffron–Route5–Cerulean–Route9–Route10North–Route10South (8 maps; the spec's Cerulean/Route5/Saffron/Route8/Lavender/Route10/Route9 loop);
  - Kanto: Route11–Vermilion–Route6–Saffron–Route8–Lavender–Route12 (7 maps);
  - Kanto: the 21-map outer ring through Pallet/Cinnabar/Fuchsia/Route15.
- **Only the cycle containing the Route17–Route18 edge fails**, by 1 block in y.
- These cycles use every direction and non-zero offsets on both axes, e.g. Route13 north 20, Saffron west ±9, Azalea west −18.
- **A wrong rule would show up broadly.** Negating the x offset gives 8 conflicts; negating y or swapping north/south gives 10; using the target's width for east also breaks the pin. One unit-sized inconsistency confined to a single edge is the signature of the data, not of the rule.

### 1.5 Conclusion

**The conflicts are real data, not an implementation error.**
- **What the data does.** The original game's Kanto connection data does not embed in a plane (it is non-Euclidean by 1 block). The engine never notices, because it only ever uses one connection at a time and every edge is locally reciprocal.
- **Not a `DataDefect`.** The plan-wide `DataDefect` rule covers loader-level recoverable defects: something malformed that a loader had to work around, per `DataDefect`'s doc comment and `gbcCommands.ts` `warningLines`. Nothing here is malformed or worked around. Each line is valid and in-game correct.
- **Parity.** GBA's CLI `render-world` doesn't print conflicts either; GBA only ships them to the UI through the server. `Conflict` is recorded in `world.conflicts`, exactly as the spec requires.
- **No issue**, but see Minor m1: an optional stderr `note:` when a drawn map is in `world.conflicts` would explain the visible gatehouse seam.

---

## 2. Verification table

| Item | Result | How |
|---|---|---|
| 326 components; sizes 35/31/2 + 323 singletons; 391 maps | ✅ | own Python stitcher and implementation |
| Kanto 35 (PalletTown's), Johto 31 (NewBarkTown's), not connected | ✅ | both |
| Reciprocity 71 pairs, 0 unpaired, 0 sign mismatches | ✅ | own script, over all 142 raw lines |
| NewBarkTown→Route29: Route29 = (NBT.x − 30, NBT.y) | ✅ | own: rel (−30, 0), R29 is 30×9 |
| AzaleaTown→Route34: (Azalea.x − 10, Azalea.y − 18) | ✅ | own: rel (−10, −18) |
| Conflicts = 2, identities as reported | ✅ | own script; the implementation's `world.conflicts` matches exactly |
| Placement formulas vs engine | ✅ | §1.1 |
| Resolution by `targetConst` via a once-built index; unknown const throws naming map + const | ✅ | inspection + unit test |
| `Conflict` shape, `viaB.from` = placer | ✅ with caveat | correct within a component; a seed map falls back to the *current* seed (m4) |
| GBA edit behaviour-neutral | ✅ | line-by-line: only `export` on `boundsOf`/`layOutComponents`, plus `opts = {}` with `GAP = opts.gap ?? 8`, `ROW_TARGET = opts.rowTarget ?? 512`; the sole GBA call site passes no opts; nothing else in the file changed |
| GBC shelf-pack values stated and justified (gap 8, rowTarget 256 > Johto 235) | ✅ | doc comment; packed extent 255×746 blocks confirmed by the CLI (2040×5968 at scale 8) |
| `renderGbcWorld` bbox intersection | ✅ | same strict `<=`/`>=` shape as GBA |
| Scale validation (positive integer divisor of 32) | ✅ | 3, 0, −8 and 1.5 refused; 1, 2, 4, 8, 16 and 32 accepted |
| Defect de-dupe | ✅ by inspection | key is `file\0message`; **not tested** (Issue 2) |
| Pixel tests compare to `renderGbcMap` at the placement offset | ✅ | `(p.x − bbox.x)*32 + 36` vs own `(36,36)`, per map. Weak (one pixel per map), but it killed the blit-offset mutation M17. CeruleanCave2F is a full-buffer equality |
| CLI stdout `<out> <w>x<h> maps=<n>`, stderr warnings | ✅ | live |
| `render-world` removed from the GBC refusal list | ✅ | wrapper replaced by a family branch; refusal-loop test updated |
| `--scale` default: GBC 8 | ✅ live, **untested** (m2) | no `--scale` gives 1880×1080 for the Johto bbox (235×8, 135×8) |
| `--scale` default: GBA still 4 | ✅ by inspection | `opts.scale ?? 4`. No commander default is configured any more, so `getOptionValueSource(...) === "default"` in the GBC branch is dead (m5). Same parser, same observable value. Help text lost "(default: 4)" but says "gba default 4" |
| GBA handler otherwise unchanged | ✅ | diff is only the removed `runGbaOnly` wrapper (it only threw for gbc), `const scale = opts.scale ?? 4`, and the closing brace. `--time` is now parsed but ignored on GBA |
| `--no-dungeons` on GBC | ✅ ignored, documented | live: output byte-identical (`cmp`) to the run without the flag |
| Bad scale via CLI | ✅ | `--scale 3`: `pokemap: renderGbcWorld: --scale must be a positive integer divisor of 32, got 3`, exit 1, no file written. `--scale 0`: commander's `parseScale` error, exit 1 |
| Live renders | ✅ viewed | Johto bbox `0,143,235,135` at scale 8: 1880×1080, maps=31. A coherent Johto overworld: routes join towns with no seam jumps; Whirl Islands water lower-left; Lake of Rage top. Kanto seam crop (see §1.2) shows the expected 1-block gatehouse split |
| LOD | ✅ agree | full world end-to-end CLI (load + render + PNG encode): 2.4 s at scale 8, 7.6 s at scale 32. The implementer's render-only 0.63/1.49 s is consistent. No LOD needed |
| Gates | ✅ | `vitest run packages/core/test/gbc packages/cli/test/gbcCommands.test.ts`: **16 files / 497 tests passed, 0 skipped**. `npm run typecheck`: clean. The GBA suite was not run (environmental, per brief) |

---

## 3. Mutation table

Each mutation was applied with perl to the source, then these 3 test files were run: `world/connections.test.ts`, `render/world.test.ts`, `cli/gbcCommands.test.ts`. The mutation was reverted with `git checkout`. tsc stayed clean for every mutation.

| # | Mutation | Result | Killing test(s) |
|---|---|---|---|
| M1 | x-offset negated (north/south) | ✅ killed (4) | fixture placements, fixture conflict, corpus conflict pin (2→8), e2e |
| M2 | y-offset negated (west/east) | ✅ killed (7) | fixture ×2, Azalea/Route34, conflict pin, render ×2, e2e |
| M3 | north/south formulas swapped | ✅ killed (6) | fixture ×2, conflict pin, render ×2, e2e |
| M4 | resolve by `targetName` | ✅ killed (1) | "resolves by targetConst" unit test only. Equivalent on the corpus, as the spec predicted |
| M5 | conflict recording dropped | ✅ killed (2) | fixture conflict, corpus pin |
| M6 | GBA `layOutComponents` defaults 8/512 → 20/900 | ✅ killed (1) | default-args unit test |
| M7 | bbox intersection dropped | ✅ killed (6) | render ×3, runGbcRenderWorld ×2, e2e |
| M8 | east uses **target** width | ✅ killed (3) | fixture ×2, conflict pin |
| M9a/b/c | bbox left/right/top edge `<=`/`>=` → `<`/`>` | ✅ killed (3 each) | render ×2, e2e (`drawn` count) |
| M9d | bbox **bottom** edge `p.y >= bbox.y+bbox.h` → `>` | ❌ **survived** | no test bbox has a map abutting its bottom edge (m3) |
| M10 | **swap `viaA`/`viaB`** | ❌ **survived** | fixture conflict test uses `toContainEqual` in either order; corpus pins only the count (**Issue 1**) |
| M11 | **defect de-dupe removed** | ❌ **survived** | the "de-duplicates" test covers two *different* defects (**Issue 2**) |
| M12 | GBC `rowTarget` 256 → 512 (GBA's) | ✅ killed (1) | e2e only, via its hard-coded bbox `145,251,40,9` (fragile but effective) |
| M12b | GBC gap 8 → 9 | ✅ killed (1) | e2e only |
| M13 | south uses target height | ✅ killed (3) | fixture ×2, conflict pin |
| M14 | west uses current width | ✅ killed (5) | NBT/Route29, Azalea, fixture, conflict pin, render |
| M15 | GBC CLI default scale 8 → 4 | ❌ **survived** | no test omits `--scale` (m2) |
| M16 | `viaB.from` = `seed` always | ✅ killed (1) | fixture conflict (`["North",8,10]`) |
| M17 | blit x offset +1 block | ✅ killed | "two pixels" test. The CeruleanCave2F full-buffer test also fails, but vitest then hangs rendering the Buffer diff (m7). My first attempt only hit the doc comment; it was redone targeting the `blitScaled(` call |
| M18 | divisor-of-32 check removed | ✅ killed (1) | scale-refusal test |
| M19 | `runGbcRenderWorld` ignores `time` (forces nite) | ✅ killed | runGbcRenderWorld PNG-equality test fails, then hangs in the Buffer diff (m7); killed manually |
| M20 | GBA CLI default 4 → 8 | ⚠️ survived, expected | no GBA test can run here; inspection only |

After all mutations, `git status` shows only ` M pokemap.config.json`.

---

## 4. Issues

1. **The spec-required "exact `Conflict`" is not pinned, and a viaA/viaB swap survives (M10).**
   - The spec requires "a conflict case, with the exact `Conflict`" and `viaB.from` = the map that actually placed it.
   - `connections.test.ts` "records a conflict…" only asserts that both `[from,x,y]` triples are present, in either order. Its comment calls the order "an implementation detail this test does not otherwise depend on". The corpus test pins only the count.
   - **Fix:** `expect(w.conflicts).toEqual([{ map: "Bridge", viaA: { from: "East", x: 14, y: 6 }, viaB: { from: "North", x: 8, y: 10 } }])`. North's connection is processed before East's because Home's queue is N, S, W, E, so North places Bridge. Also pin the two corpus conflicts exactly, not just the count: `Route18` via Route17 (40,87) / FuchsiaCity (40,88), and `Route17` via Route18 (30,50) / Route16 (30,49), pre-pack. That turns a count pin into an identity pin for the one real data finding.
2. **Defect de-duplication is untested; the test named for it cannot fail without de-dupe (M11).**
   - "de-duplicates defects across multiple drawn maps" draws two maps with two *different* defects, so it passes with de-dupe deleted.
   - De-dupe is a stated deliverable ("`defects` is the de-duplicated `DataDefect`s").
   - **Fix:** a small stub-project test in which two placements yield the same `{file, message}`, or share a `.blk`. Or rename the test and admit it only checks that defects flow through. The former is preferred.

## 5. Minors

- **m1.** Consider a stderr `note: <map> placed via <viaB.from>; <viaA.from> disagrees by (dx,dy)` for drawn maps in `world.conflicts`. The Route17/Route18 gatehouse seam is visibly broken in any Kanto render and nothing tells the user why. This is optional: it is not a `DataDefect`, and GBA's CLI doesn't do it either.
- **m2.** The GBC `--scale` default of 8 is correct live but has no test (M15 survives). Dropping `--scale 32` from the spawned e2e test and expecting `320x72` would pin it at no extra spawn cost.
- **m3.** A bottom-edge off-by-one in the bbox check survives (M9d). It only affects `drawn` and defect reporting, not pixels. Fix: add a bbox whose bottom edge abuts a map, e.g. NBT's bbox with `h = 9` has nothing below it, so choose a vertical pair such as Route17/Route18 or Cherrygrove/Route30.
- **m4.** The one-way cross-component edge edge case is inherited verbatim from GBA and is moot on this corpus, which has 0 one-way edges. I verified it with a scratch test:
  - A map in a later component with a one-way edge into an already-placed map of an earlier component records a bogus conflict, whose coordinates belong to two different pre-pack frames.
  - That conflict also gets `viaB.from` = the *current* component's seed, not the target's placer. `placedBy` has no entry for a seed, so `?? seed` names the wrong map: `{"map":"Home","viaA":{"from":"Solo",…},"viaB":{"from":"Solo",…}}`.
  - The "resolves by targetConst" test's comment ("a same-map graph loop the BFS never even has to consider") is wrong: it does record this conflict, and the test simply doesn't assert `w.conflicts`.
- **m5.** In `index.ts`, `cmd.getOptionValueSource("scale") === "default"` can never be true, because the option no longer has a commander default. Only `opts.scale === undefined` matters. It is harmless, but the implementer report overstates `getOptionValueSource` as the mechanism.
- **m6.** Stale documentation and comments:
  - `runGbaOnly`'s doc comment still lists "render-world (Task 11)" as going through it.
  - The corpus comment and the implementer report describe the conflicts as a "Route16/17/18/FuchsiaCity(/Route19/Route15) loop". The actual non-closing cycle is the 13-map loop in §1.2, and Route19 is not on it.
  - The findings' "engine-verified against `LoadMapConnections`" names a routine that doesn't exist in this decomp; the routines are `EnterMapConnection` and `FillMapConnections`.
- **m7.** Failing `expect(Buffer.from(...)).toEqual(Buffer.from(...))` on world-sized rasters makes vitest spend minutes at 100% CPU rendering the diff (seen with M17 and M19). A real regression would look like a hang, not a red test. Comparing a hash, or `Buffer.compare(...) === 0`, would fail fast.
- **m8.** `--time` is now accepted and ignored on GBA `render-world`. This is documented in the help text and fine, but noted for completeness.
