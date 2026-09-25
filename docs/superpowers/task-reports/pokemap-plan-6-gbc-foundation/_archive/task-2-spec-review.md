# Plan 6 Task 2 spec-compliance review (c038d03 vs f907b18)

**Verdict: ❌ ISSUES (2)** + 3 ⚠️ test gaps (recommended, not blocking).

Diff scope: 10 new files + `pokemap.config.json`. No GBA src/test touched. PerfPlus porcelain empty before/after. PokeMap porcelain after all mutations = only `?? task-2-implementer.md` (+ this file).

## Verification runs (mine)
- `npx vitest run packages/core/test/gbc packages/core/test/family.test.ts --reporter=verbose`: 40/40 passed, **0 skipped**. All 9 corpus tests ran (3 blocks, 3 incbin, 3 tileset). All 3 real-root family tests ran their assertion (not the early return): gba `Pokemon Game/game` has fieldmap.h; PerfPlus attr+mc, no fieldmap; pokeyellow headers+mc, no attr, no fieldmap.
- `npm test`: 77 files / 750 tests passed. `npm run typecheck`: exit 0 (tsconfig.base includes `packages/*/test/**`).

## Per item
| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | config `gbc` block | ✅ | diff = `]`→`],` + block; existing keys byte-identical. |
| 2 | `family.ts` + test | ✅ ⚠️ | Logic matches spec: both→throw first, gba, gbc (AND), yellow distinct throw ("pokeyellow"/"Plan 8"), neither→throw. Test covers gba/gbc/both/neither/yellow on mkdtemp roots, `afterAll` rmSync. ⚠️a: AND not pinned (M3 survived — no attributes-only root case). ⚠️b: "every probed path": neither-message omits `data/maps/headers` (probed); yellow message omits `include/fieldmap.h` (probed). Minor. ⚠️c: real-root tests `return` early when absent → report pass not skip (acceptable per "guarded by existsSync"). |
| 3 | `test/gbc/helpers/corpus.ts` | ✅ | Mirrors GBA helper. Config variants (temp-edited, restored): no `gbc` block → subject `""`, roots `[]`, 9 corpus tests skip, 0 errors; no `referenceProjects` → `[]`; missing ref path filtered out. |
| 4 | `gbc/model/types.ts` | ✅ | `Block{metatileId}`, `Metatile{tiles}`; doc comments state no collision/elevation, 16 entries. |
| 5 | `blocks.ts` | ✅ | Byte-per-block, length-agnostic, encode throws `block i: metatileId v ...` on non-int / <0 / >255; no masking. |
| 6 | `tileset.ts` | ✅ | parse throws len%16≠0; encode throws `tiles.length≠16` and bad tile (names metatile+tile idx+value). |
| 7 | `incbin.ts` | ✅ ⚠️ | Label run (`:`/`::`, optional `; comment`), other non-blank line resets, blank inert, CRLF via split, no-final-newline OK, INCLUDE ignored. ⚠️: blank-is-inert not pinned by any test (M6 survived; corpus has 0 label→blank→INCBIN cases). CRLF: M7 (split on `\n` only) is an equivalent mutant — `\s*` in LABEL_RE absorbs `\r` — behaviour correct either way. |
| 8 | corpus "over `gbcCorpusRoots()`" | ❌ | `gbcCorpusRoots()` defined, **never called** (grep: only its definition). Every corpus test uses `GBC_SUBJECT_ROOT` only; M15 (drop its filter) survived. Pins (305/439/50/36/NBT/counts/johto) are subject-specific and correctly subject-only, but the two all-files round-trip tests (all `.blk`, all `_metatiles.bin`) should loop `gbcCorpusRoots()` like GBA's identity corpus loops refs. Functionally identical today (`referenceProjects: []`), silent gap once a ref is added. |
| 9 | Unit refusals 256/-1/1.5, 15-tile, len-17 buf, incbin stacked/comment/no-newline/reset | ✅ | All present; extras: 17-tile, empty buf, INCLUDE-not-matched, 0/255 accepted. No unrequested prod features. |
| 10 | Findings doc vs 36 | ❌ | See below. |

## Re-derived pins (own naive line-scan script, different method from parser)
| Pin | Mine | Test |
|---|---|---|
| blocks.asm INCBINs / labels / distinct | 305 / 439 / 305 (only 4 other lines: `SECTION`s; no CR; ends `\n`) | 305/439/305 ✅ |
| House1.blk labels | 50 | 50 ✅ |
| `.blk` on disk under maps/ | 305, all in blocks.asm, 0 missing | — |
| NewBarkTown.blk | 90 B; `05 05 18 1f 19 05 05 05 05 05 05 47 1c 77 1e 05 18 19 05 05` | ✅ |
| CeruleanCave2F / B1 | 400 / 400 | ✅ |
| `_metatiles.bin` INCBINs | **36 lines, 36 distinct** | 36 ✅ |
| `*Meta::` labels | 38 = 36 + stacked `Tileset0Meta::`→johto, `TilesetDarkCaveMeta::`→cave | implementer claim confirmed |
| `_metatiles.bin` on disk | 37; extra = `dark_cave_metatiles.bin` (git-tracked, 1024 B, **byte-identical to cave_metatiles.bin**, never INCBIN'd — orphan) | — |
| `tileset` table entries (data/tilesets.asm) | 37 (36 + Tileset0) | — |
| metatile count hist | 40×1 (forest), 64×30, 128×5 (kanto, johto, unused_johto, johto_modern, battle_tower_outside) | ✅ |
| johto first 3 | all-00, all-06, all-05 | ✅ |

**36/37 settled: 36 is correct.** Spec's 37 = on-disk file count / tileset-table count, not INCBIN paths.

## Mutation checks (mine; each reverted, tree verified clean)
| Mutant | Result |
|---|---|
| M1 family: drop both-branch | KILLED (both test) |
| M2 family: gbc before gba | survived — equivalent (both-branch precedes) |
| M3 family: gbc = attributes.asm only | **SURVIVED** → ⚠️a |
| M4 family: yellow branch removed | KILLED |
| M5 incbin: no reset on other line | KILLED |
| M6 incbin: blank line resets | **SURVIVED** → ⚠️ item 7 |
| M7 incbin: split `\n` only | survived — equivalent |
| M8 incbin: label regex drops `; comment` | KILLED (unit + corpus 439) |
| M9 incbin: pending not cleared after INCBIN | KILLED (439, House1 50) |
| M10 encodeMetatiles: no length-16 check | KILLED |
| M11 parseMetatiles: no %16 check | KILLED |
| M12 encodeMetatiles: no tile range check | KILLED |
| M13 encodeBlk: no range check | KILLED |
| M14 parseBlk truncates at 300 B | KILLED (CeruleanCave 400, all-.blk) |
| M15 helper: gbcCorpusRoots no filter | **SURVIVED** → ❌ item 8 (unused) |

## Findings doc corrections (`docs/superpowers/specs/2026-09-23-pokemap-gbc-format-findings.md`)
- **L564 (required):** "`37 _metatiles.bin (36 tilesets plus unused_johto)`" is wrong under its own "enumerate via INCBINs" rule. Replace with: 36 distinct `_metatiles.bin` INCBIN paths — the 36 tilesets resolve to 35 files (`TilesetDarkCaveMeta::` stacks onto `cave_metatiles.bin`; `Tileset0Meta::` onto johto) plus `unused_johto`. `dark_cave_metatiles.bin` exists on disk (byte-identical to cave's) but is never INCBIN'd, so it is not in the round-trip set.
- **L380 (recommended):** "DarkCave shares cave's palette map." → also shares cave's metatiles and collision (stacked `TilesetDarkCaveMeta::`/`TilesetDarkCaveColl::`, gfx/tilesets.asm L90-95); `dark_cave_metatiles.bin`/`dark_cave_collision.asm` on disk are orphans.
- **L582 (heads-up for Task 5, same error class):** "37 `*_collision.asm`" = on-disk count. gfx/tilesets.asm has only **32** `INCLUDE …_collision.asm`; 5 on-disk not INCLUDEd: dark_cave (stacks on cave) + aerodactyl/ho_oh/kabuto/omanyte_word_room (stack on `TilesetBetaWordRoomColl::`, L300-304). Say which enumeration Task 5 uses.
- L7 ("36 tilesets plus alias Tileset0") consistent; no change.

## Required fixes
1. Loop the all-`.blk` and all-`_metatiles.bin` round-trip tests over `gbcCorpusRoots()` (keep subject-only pins on `GBC_SUBJECT_ROOT`).
2. Fix findings doc L564 (and ideally L380, L582 note).

## Recommended (⚠️)
- family test: attributes.asm-only root (no map_constants) → throws (kills M3).
- incbin test: `Foo:` / blank / `INCBIN` → labels `["Foo"]` (kills M6).
- Optionally include `data/maps/headers` in neither-message and `include/fieldmap.h` in yellow message.

---

# Re-review 1 (0d6644c code/tests, 23bd12d doc)

**Verdict: ❌ ISSUES (1)** + 1 ⚠️ doc nit + 1 ⚠️ Task 5 heads-up.

Runs (mine): gbc+family verbose 42/42 ✓, 0 skipped. `npm test` 77 files / 752 passed. `npm run typecheck` exit 0. PerfPlus porcelain empty. PokeMap porcelain after mutations = 2 untracked reports only. `src/**` unchanged since c038d03 (diff = 4 test files + doc).

| Prior item | Status | Evidence |
|---|---|---|
| ❌1 `gbcCorpusRoots()` unused | ✅ wired, ❌ new vacuity hole | Both whole-corpus round-trips now `for (root of gbcCorpusRoots())`, per-root paths re-derived, 305/36 gated `root === GBC_SUBJECT_ROOT`. Other pins (NBT, CeruleanCave, House1, 439, counts, johto) stay subject-only ✅. **But M17 (`gbcCorpusRoots = () => []`) SURVIVES**: loop runs 0 times, `failures === []`, both round-trip tests pass vacuously and the in-loop 305/36 pins never execute. Pre-fix the 305 pin was unconditional. (305/36 still pinned independently in incbin.test.ts, so only the round-trip itself goes blind.) Fix: one line per test, e.g. `expect(gbcCorpusRoots()).toContain(GBC_SUBJECT_ROOT)` before the loop. |
| ❌2 findings doc L564 | ✅ | 37 table entries (`tileset Tileset0` L16 + 36) − 2 stacked aliases + unused_johto = 36 ✓. dark_cave_metatiles.bin byte-identical to cave's (cmp) ✓, never INCBIN'd ✓. |
| ⚠️ M3 attributes-only | ✅ | New test; M3 KILLED. |
| ⚠️ M6 blank-line inert | ✅ | New test; M6 KILLED. |
| ⚠️ M15 roots filter | n/a | Survives — equivalent while refs `[]` (below). |

**Equivalence claim — partly agree.** Agree: M15 (drop filter) and M16 (`() => [GBC_SUBJECT_ROOT]`) are equivalent mutants while `referenceProjects: []`. Disagree that nothing is killable now: M17 (empty roots) is non-equivalent and survives → the ❌ above.

Other mutants this round: M18 (encodeBlk drops last byte on >300-block files) KILLED by both CeruleanCave and all-.blk tests.

**Doc facts re-verified vs PerfPlus (23bd12d):**
| Claim | Result |
|---|---|
| L115 "all other 30" at 64 | ✓ (hist 40×1, 64×30, 128×5) |
| L380 DarkCave Meta/Coll/PalMap stacked on cave | ✓ gfx/tilesets.asm L90-91, L94-95; tileset_palette_maps.asm L60-61 |
| L380 DarkCaveGFX own `dark_cave.2bpp.lz`, unstacked | ✓ L188-189 |
| L380 dark_cave_{metatiles.bin,collision.asm,palette_map.asm} on disk, never included, "same shape" | ✓ — all three are actually **byte-identical** to cave's (cmp), stronger than "same shape" |
| L380 "like the 4 word-room collision/palette-map files below" | ⚠️ **inaccurate**: collision orphans are 4 (ho_oh/kabuto/omanyte/aerodactyl; beta is INCLUDEd), but palette-map orphans are **5** (beta_word_room_palette_map.asm is also orphaned: all 5 word-room PalMap labels stack onto `ruins_of_alph_palette_map.asm`, tileset_palette_maps.asm L67-73). "Below" (L582) covers collision only. Suggest: "like the 4 word-room collision files (L582) and the 5 word-room palette-map files (all stack onto ruins_of_alph)". |
| L582 37 on disk / 32 INCLUDEd | ✓ 37 files; 32 INCLUDE lines, 32 distinct |
| L582 5 orphans: dark_cave → cave; 4 word rooms → beta_word_room_collision | ✓ gfx/tilesets.asm L300-305 |
| L582 "§Extra" cross-ref | ✓ `## Extra findings` exists (L354) |

**⚠️ Task 5 heads-up (pre-existing, not changed):** palette maps have the same on-disk vs reachable split — 37 `*_palette_map.asm` on disk, 31 INCLUDEd in gfx/tileset_palette_maps.asm (orphans: dark_cave + 5 word rooms incl. beta). L151/L284 "all 37 palette maps" are true as on-disk shape claims, but if Task 5 enumerates by INCLUDE (per the don't-glob rule) it gets 31. Worth a one-line note like L582's.

## Required fix
1. Guard both `gbcCorpusRoots()` round-trip loops against zero iterations (e.g. `expect(gbcCorpusRoots()).toContain(GBC_SUBJECT_ROOT)`); verify M17 then dies.

## Recommended
- Fix L380 word-room orphan count (4 collision / 5 palette-map); optionally "byte-identical" instead of "same shape".
- Optional: L151/L284 add the 37-on-disk / 31-INCLUDEd palette-map note for Task 5.
