# Plan 14.2 Task 6, fix round 1 (hop B) — implementation report

## Scope

Only `packages/core/src/blockEdit/gbcOps.ts` changed. `placement.ts` and the two protected test
files (`gbcOps.test.ts`, `placement.test.ts`) were **not** touched. Nothing was committed.

Risk tier: high. The change touches palette ordering (R5a), I/O error boundaries (R1a/R1b), and
staged-overlay semantics; a wrong answer here is not caught by typecheck.

## What changed

1. **R5a — All renames apply before any Local resolution.** The palette loop no longer walks
   `changes` in entry order. `changes` is split into `all` and `local`; every All entry's
   missing-palette-entry check and `patchGbcPaletteMap` rename runs first, then each Local entry
   is resolved. Local reuse candidates and free-slot palette names are compared against the
   palette map reparsed from the already-renamed text, so a later All rename can no longer
   recolour a tile a Local entry reused. Entry order is preserved within each scope, and the
   All-then-Local split still lets the all-missing-entry `BAD_VALUE` fire before any Local check.
2. **R1a — shared read boundary refuses instead of leaking native fs errors.** The planner's one
   `read(path)` now wraps `staged.get(key) ?? readFileSync(join(proj.root, path))` in a
   try/catch and throws `BlockEditRefusal("BAD_VALUE", "<canonical path>: <reason>")`. This covers
   metatiles, collision, palette map, gfx PNG, the free-slot scan's metatiles reads, and the
   confirm-path usage reads.
3. **R6a — `ALL_WITH_SAVE_AS_NEW` message offers the alternatives.** Now
   `<metatiles path>: an All palette change cannot be saved as new; use Local or OK`.
4. **R1b — no plain/native error escapes.** `planGbcBlockEdit` is now a thin wrapper around
   `planGbcBlockEditInner`; the wrapper rethrows `BlockEditRefusal` unchanged and turns anything
   else (unknown map, usage read, tileset load) into
   `BlockEditRefusal("BAD_VALUE", "<map>: <original message>")`.
5. **Mutation survivors left intact.** Free-slot reuse (reservation skip, draft-tile skip,
   earliest-slot ordering) and the Local reuse path are unchanged except for the R5a ordering;
   their pinned tests still pass.

`changes` is still used to derive `all`/`local` and to drive the All-usage confirmation check;
no check was loosened or removed.

## Verification (commands and result lines)

```
npx vitest run packages/core/test/blockEdit/placement.test.ts packages/core/test/blockEdit/gbcOps.test.ts
 Test Files  2 passed (2)
      Tests  53 passed (53)
   Duration  91.45s
```

0 skipped; 53 = 8 placement + 45 gbcOps tests.

```
npx tsc --noEmit -p tsconfig.base.json && npx tsc --noEmit -p packages/ui/tsconfig.json
(no output — exit 0)
```

This is exactly what `npm run typecheck` runs; `npm run ...` itself was permission-denied by the
harness shell policy in this session, so the two underlying `tsc` invocations were run directly.

## Notes / limitations

- The corpus copy ran once per the brief; no second vitest run or mutation run was made.
- Both R5a ordering tests (`Local listed first`, `All listed first`), the failed-read test, and the
  `ALL_WITH_SAVE_AS_NEW` alternatives test pass.
