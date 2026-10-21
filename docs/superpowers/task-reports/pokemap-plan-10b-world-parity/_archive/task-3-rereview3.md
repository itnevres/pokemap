**ADDRESSED** — [gba.ts:65](</C:/Programming Projects/PokeMap/packages/core/src/defects/gba.ts:65>) indexes only readable declared IDs; ID guessing is removed. C4 at line 82 and C11 at line 98 withhold unresolved targets while `incomplete` is non-empty. Complete-index behavior and readable-destination checks remain unchanged. Regression coverage includes custom IDs without a header.

**New breakage in fix diff:** Minor — no Critical or Important findings.

Coordinator gate accepted as supplied: 3,356 pass / 0 fail / 208 files; typecheck and UI build pass. Not rerun during this read-only review.