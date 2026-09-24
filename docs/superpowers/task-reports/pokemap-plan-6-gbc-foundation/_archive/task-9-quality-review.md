# Plan 6 Task 9 code-quality review: GBC per-map renderer

Reviewed: `git diff 5e453f1..623ee41` in
`/home/user/pokemap/.claude/worktrees/agent-a5471bd90c343f9d4`
(494380f implementation + 623ee41 spec-review fix round).

## Baseline

- `npx vitest run packages/core/test/gbc`: **13 files / 370 tests, all green.**
- `npm run typecheck`: clean.

Both confirmed by me directly (not just taken from the implementer report).

## Strengths

- **API shape is right for Tasks 10-12.** `GbcProject` mirrors the GBA
  `Project`'s cache-per-varying-key pattern exactly (`tileset()` per const,
  `paletteTables()`/`roofs()` lazy-once, `layout()` deliberately uncached to
  match `loadLayout`'s own doc comment), and `renderGbcMap(proj, mapName,
  opts)` is a clean, single entry point a world-stitcher can call 391 times
  without re-parsing anything but the map's own `.blk`.
- **Never mutates the cached tileset.** `roofSwappedTiles` returns `ts.tiles`
  by reference in the common (no-swap) case and only ever writes into a
  fresh `.slice()`. This is verified by both a dedicated unit test and, more
  convincingly, a real corpus test (VioletCity) that would show roof bleed
  into a second map if the cache were ever corrupted, since `tileset()`
  really does cache by const.
- **Corpus pixel derivations are independent and readable.** Every pinned
  pixel in `render/map.test.ts`'s `describe("corpus")` block carries a full
  from-bytes chain (block byte -> metatile -> tile id -> PNG index -> shade
  -> palette -> RGB, with the 5-to-8-bit conversion spelled out), computed by
  a route that doesn't reuse the renderer's own code. The NewBarkTown
  roof-swap no-op is a genuine, well-explained corpus fact (New Bark's own
  art is baked into the base tileset), and the report is honest that it
  can't literally satisfy the spec's "differs from unswapped" ask on
  NewBarkTown itself -- it correctly moves that specific proof to VioletCity
  instead, which does show a real per-pixel difference and also
  discriminates a `group - 1` bug (Azalea vs. Violet).
- **`GbcProject` stub in tests has no unchecked casts.** `stubProject` in
  `render/map.test.ts` is built field-by-field against the real `GbcProject`
  interface, with unused methods throwing loudly if a test path reaches them
  by accident (a genuine, real defense that one test used: `blocksOverride`
  skips `proj.layout` entirely).
- **Refusal messages are specific.** `renderGbcMap`'s border/blocksOverride
  refusals name the map and the actual/expected values;
  `parseRoofsAsm`'s phase-machine refusals name file:line and quote the
  offending line's shape, consistent with the sibling loaders' convention.
- **Mutation coverage is real and broad.** Both rounds (8 implementer
  mutations + 19 reviewer mutations, 27 total) are recorded with which test(s)
  went red, and the fix round closed every genuine gap the concurrent Opus
  spec review found (ring exclusion untested, bank-1/null palMap untested,
  `GbcProject` caching untested) with new tests rather than hand-waving.

## Issues

### Critical

None.

### Important

None. (See "duplication" and "parsePaddingWidth robustness" below, which I
considered for this bucket but downgraded -- neither blocks Task 10-12's use
of `GbcProject`/`renderGbcMap`, and both are cheap to fix later.)

### Minor

1. **`parsePaddingWidth` duplicates an existing "find one `DEF X EQU value`
   line" idiom instead of extracting it.**
   `packages/core/src/gbc/project.ts:17-22` re-implements, nearly verbatim,
   the pattern already in
   `packages/core/src/gbc/load/palette.ts:388` (`parseBrightnessLevels`'s
   `darknessPalsetLine` lookup: `text.split(/\r\n|\n/).find(l =>
   /^\s*DEF\s+<NAME>\s+EQU\b/.test(stripComment(l)))`, then a second regex
   for the value). The task's own review checklist asked to check this
   against `parseConstDefs` specifically -- that one genuinely doesn't fit
   (it parses the `const_def`/`const NAME` enum idiom, not `DEF NAME EQU N`),
   so the implementer's choice not to reuse it is correct. But the closer,
   actually-matching duplicate in `palette.ts` was missed. Given how heavily
   this codebase's own doc comments emphasize "one implementation, not two"
   (see `asm.ts`'s own top-of-file comment), this is worth fixing before a
   third `DEF ... EQU` reader gets written (Task 10/11 may well need one for
   another engine constant).
   **Fix:** add a small shared helper to `asm.ts`, e.g.
   `findDefEquLine(text: string, name: string): string | undefined` (or one
   that returns the matched value directly), and have both
   `parsePaddingWidth` and `parseBrightnessLevels`'s `darknessPalsetLine`
   lookup call it.

2. **`parsePaddingWidth` can crash with an unnamed error on a malformed but
   present `EQU` line.** `packages/core/src/gbc/project.ts:20-21`:
   ```ts
   const m = stripComment(line).match(/^\s*DEF\s+MAP_CONNECTION_PADDING_WIDTH\s+EQU\s+(\S+)/);
   return parseNum(m![1]!);
   ```
   The `.find()` above only requires the line to match up through `EQU\b` --
   it doesn't require a value token to follow. If the found line has nothing
   parseable after `EQU` (e.g. `DEF MAP_CONNECTION_PADDING_WIDTH EQU ; note`,
   where the comment strips the value), `m` is `null` and `m![1]!` throws a
   raw `TypeError: Cannot read properties of null (reading '1')` -- no file
   name, no line number, unlike every other named refusal in this module and
   its siblings (verified live: this exact input reproduces the crash).
   Compare to the established pattern one function away,
   `findClockConstIn` (`palette.ts:346-351`), which throws a proper message
   naming `source` when its own lookup fails, instead of asserting non-null.
   This can't occur against the current real corpus (proven by the passing
   corpus tests), so it doesn't block Task 10, but it's a real robustness
   gap and a one-line fix.
   **Fix:** check `if (!m) throw new Error(...)` before calling `parseNum`,
   naming `source` in the message (matches the "not found" branch just above
   it).

3. **`parsePaddingWidth` has no dedicated unit test.** It's only exercised
   indirectly: through `renderGbcMap`'s corpus tests (`border: 3` succeeds,
   `border: 4` is refused against the real
   `constants/gfx_constants.asm`, which does catch a value-parsing
   regression) and through hand-stubbed `paddingWidth()` closures everywhere
   else. There is no test at all for its own "not found" refusal, and (per
   Minor #2) no test could catch the malformed-EQU-line crash even if one
   were added today, since nothing calls `parsePaddingWidth` with a
   synthetic string. Its sibling single-constant parsers (`parseCollisionConstants`,
   `parseRoofsAsm`, `parseBrightnessLevels`'s darkness-palset lookup) all
   have direct unit-level coverage; this one doesn't.
   **Fix:** export `parsePaddingWidth` (or add a thin
   `packages/core/test/gbc/project.test.ts` case) covering the success case
   and the "not found" refusal on a synthetic string, the same way
   `roofs.test.ts` tests `parseRoofsAsm` directly rather than only through
   `loadGbcRoofs`.

4. **`RenderGbcMapOptions.flash` forwarding is untested.** `time` forwarding
   has both a real-corpus differential test (NewBarkTown day vs. nite,
   `render/map.test.ts` corpus block) and was on the reviewer's mutation
   list (R14, killed). `flash` is forwarded the same way
   (`render/map.ts:201`: `resolveFromTables(..., { time: opts.time, flash:
   opts.flash })`) but has no equivalent test anywhere in this task's suite
   -- a future refactor that drops `flash` from that call would not be
   caught. Low risk (this is a straight pass-through, and `resolveFromTables`
   itself is well-tested elsewhere for the flash branch), but it's an
   asymmetry worth closing.
   **Fix:** one test rendering with `flash: true` vs `flash: false` against a
   `PALETTE_DARK` map (or a stubbed `paletteTables()` whose `flashPalette`/
   `noFlashPalette` differ) and asserting the pixels differ.

5. **`GbcMapRaster.originX`/`originY` naming vs. GBA's `border` semantics
   differs in a way that isn't cross-referenced.** GBC's `border: N` is N
   blocks of padding directly (`render/map.ts:222-233`); GBA's
   `renderLayout`'s `border: N` is `N * layout.borderWidth` blocks
   (`render/layout.ts:79-81`), since a GBA border tile is typically a 2x2+
   block. Both fields are named `border` and both produce an `originX`/
   `originY` pair, so a Task-10/11 author skimming the GBA renderer first
   could reasonably expect the same multiplier semantics here. The GBC doc
   comment on `RenderGbcMapOptions.border` does say "in blocks," which is
   correct and sufficient on a close read, but nothing calls out that this
   diverges from the GBA option of the same name. Not a defect -- the GBC
   engine genuinely has no per-family border-block dimension to multiply by,
   so the implementer's reading (matching the spec's own worked example,
   `border: 3` -> `(w+6)*32`) is the only sensible one. Purely a
   cross-reference/discoverability nit.
   **Fix (optional, low priority):** one clause in the doc comment, e.g. "note:
   unlike GBA's `renderLayout`'s `border`, this is not multiplied by a
   border-block width -- the GBC engine has no such dimension."

## Assessment

**Approved.**

No Critical or Important issues. The five Minor items are all narrow,
mechanical, and none of them affect the shape or correctness of the public
API (`GbcProject`, `renderGbcMetatile`, `renderGbcMap`, `GbcMapRaster`) that
Tasks 10-12 will build against. The roof-swap gate, block-0/border
substitution, palette selection, out-of-range/unmapped accounting, and
`GbcProject`'s caching are all correctly implemented, well-documented, and
backed by a genuinely independent corpus derivation plus a broad, verified
mutation-kill record (27/27). Task 10 can proceed; I'd fold the five Minors
into a later pass rather than a blocking fix round.
