# Plan 6 Task 2 -- code-quality review (f907b18..3c895cc)

Scope: `packages/core/src/family.ts`, `packages/core/src/gbc/{model/types.ts,load/blocks.ts,load/tileset.ts,load/incbin.ts}`, `packages/core/test/family.test.ts`, `packages/core/test/gbc/**`, `pokemap.config.json`. Spec compliance already approved separately (see `task-2-spec-review.md`, both rounds ✅). This review is quality-only: correctness edge cases, idiom match, over/under-engineering, test hygiene, reuse shape for Tasks 3/5.

## Verification (mine)
- `npm test`: 77 files / **752 passed**, 0 failed, 0 skipped-unexpectedly.
- `npm run typecheck`: exit 0, no output (clean).

## Findings

### Minor -- 1

**M1. `norm()` duplicated verbatim instead of reused.** `packages/core/src/family.ts:5` is byte-identical to `packages/core/src/config/paths.ts:38`:
```
const norm = (s: string) => s.replace(/\\/g, "/").replace(/\/+$/, "");
```
Ladder rung 2 (reuse what's already in the codebase) says this should be one function. `paths.ts` doesn't currently export `norm`, so today's fix is: export it from `paths.ts` (or a tiny shared `pathUtils.ts` if `family.ts` importing from `config/paths.ts` feels backwards) and import in `family.ts`. One-line function, so impact is cosmetic, not a bug -- flagging as Minor, not blocking. Fix is a 2-line diff (add `export`, change the `const` in `family.ts` to an import) whenever someone next touches either file; not worth a dedicated round for this alone.

### Nothing else rises to Important/Critical

Everything the review prompt asked me to hunt for checked out clean:

- **Regex anchoring (`incbin.ts`).** `LABEL_RE`'s single capture group is non-optional inside an alternation that only matches when the whole line is `ident[::][;comment]$` -- if `label` is truthy, `label[1]` is guaranteed present by construction, so the `!` at `incbin.ts:34` is sound, not a hidden-`undefined` risk. Same reasoning for `INCBIN_RE`/`incbin.ts:40` (`([^"]+)` inside a matched literal-prefix regex). Verified by hand and by the corpus pins (439 labels / 305 INCBINs) actually running, not skipping.
  - Local `.label` lines (dot-prefixed): excluded by `[A-Za-z_]` as the first char, so they fall to the "reset pending" branch -- conservative and correct, even though the real corpus has zero occurrences to test it against (same as the already-flagged blank-line-inert case in the spec review).
  - `SECTION "..."` lines: don't match `LABEL_RE` (no `::?` immediately after the bare word) or `INCBIN_RE`, correctly reset `pending`. Exercised implicitly by the 305/439 corpus pins over real `blocks.asm`, which contains `SECTION` lines throughout.
  - Comment lines containing the substring `INCBIN` (e.g. `; see INCBIN below`): `INCBIN_RE` is anchored `^\s*INCBIN`, so a leading `;` blocks the match. Correct, not test-covered by name but covered by construction.
  - `INCBIN "x", 0, 16` (extra args): `INCBIN_RE` has no `$` anchor, captures the quoted path and ignores trailing args. Correct.
  - CRLF: `text.split(/\r\n|\n/)` strips the `\r` before regexing, and is also directly tested (`incbin.test.ts:61-64`).
- **`noUncheckedIndexedAccess`.** No unguarded array-index reads in prod code. `blocks.ts` uses `buf.readUInt8(i)` (a method call, not `buf[i]`) for the one place that would otherwise trip the flag; all other array/Buffer access in `blocks.ts`/`tileset.ts` is either a write (`buf[i] = ...`, unaffected by the flag) or already-asserted via `!` on a proven-non-empty regex match. Consistent with how the rest of the package handles the same tsconfig setting (e.g. `test/edit/events.test.ts:25`, `test/load/layouts.test.ts:73` use the identical `arr[0]!.field` idiom after a length assertion).
- **Buffer vs Uint8Array.** All codec signatures take `Buffer` (matching GBA's `parseBlocks(buf: Buffer, ...)` in `src/load/blocks.ts:4`), fed from `readFileSync` everywhere. No mixed-type surprises.
- **Error messages.** All four throw sites (`blocks.ts:28`, `tileset.ts:15/34/38`, `family.ts` x4) name the offending index/path/value inline, matching the repo's I7 convention (compare `src/load/blocks.ts:33-39`, `src/project.ts:95/136/149/161-164`). No generic "invalid input" messages anywhere in the diff.
- **Naming/structure.** `parseBlk`/`encodeBlk` (singular, format-name-based) vs GBA's `parseBlocks`/`encodeBlocks` (plural) is an intentional-looking divergence, not an inconsistency: the GBC pair is named after the `.blk` file format they codec, and diverging from GBA's name is actually convenient for Task 3/5 call sites that may need both engines' codecs side by side without aliasing imports. `parseMetatiles`/`encodeMetatiles` matches GBA's plural-verb-noun pattern exactly. `gbc/model/types.ts` mirrors `model/types.ts`'s per-format doc-comment style (explains *why* fields are absent, e.g. "no per-block collision or elevation bit", not just what's present) -- same density as the GBA sibling, no padding, no thin restating-the-type-signature comments.
- **Over/under-engineering.** No speculative abstractions: `Metatile.tiles` stays a plain `number[]` with a runtime length check rather than a fixed 16-tuple type (self-flagged by the implementer as a deliberate simplification, and it's the right one -- a literal-length tuple type buys nothing a runtime `!== 16` check doesn't already give at the one call site that matters). No config knobs added for the codec constants (16, 255, etc.) -- they're actual format constants, not tunables, correctly left as literals. `gbcCorpusRoots()` mirrors GBA's `availableReferenceRoots()`/`referenceRoot()` shape exactly rather than inventing a new pattern, and is not unused scaffolding -- both whole-corpus round-trip tests loop over it as of `0d6644c`.
- **Test hygiene.** `family.test.ts` cleans up every `mkdtempSync` root via a single `afterAll`/`rmSync(..., {recursive:true,force:true})` (same pattern as elsewhere in the suite). Real-root tests are all guarded by `existsSync`/config-presence checks, degrading to an early `return` (spec review flagged this as "reports pass not skip" -- acceptable, not a quality regression, matches `family.test.ts`'s own pre-existing convention for real-root tests). No Windows-only path separators: every path in test and prod code is built with forward slashes via string templates, matching `config/paths.ts`'s own `norm()`-then-forward-slash convention, so these run correctly under Windows Node despite hardcoding `/`.
- **Reuse shape for Tasks 3/5.** `parseIncbins(text: string): IncbinEntry[]` takes a bare string and returns a generic `{labels, path}[]` with zero GBC-specific coupling baked in beyond "this is RGBDS asm" -- it's already exercised in this diff's own tests against both `data/maps/blocks.asm` and `gfx/tilesets.asm`, and the findings doc explicitly assigns Task 3 the job of driving it over `blocks.asm` again for map data (doc line 572). No rewrite forced. `parseMetatiles`/`encodeMetatiles` already do exactly what Task 5 needs ("metatile count = bin size / 16", doc line 587) with no changes required. `detectEngineFamily` is a pure `(root) => EngineFamily`, no hidden state, trivial to call from a future CLI entry point.

## Verdict

APPROVED (1 Minor, non-blocking).
