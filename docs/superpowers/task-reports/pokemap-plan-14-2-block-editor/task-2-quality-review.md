- Important — packages/core/test/blockEdit/gbcPatch.test.ts:158 — Palette losslessness is tested only with canonical `tilepal` formatting; the conductor’s line-reserialization mutation survives — A regression could alter whitespace or comments while every test passes — Add a noncanonical target line with mixed spacing, a trailing comment, CRLF, and no final newline; assert the entire output equals the input with only the selected name replaced, and verify the mutation dies.

- Minor — packages/core/src/blockEdit/gbcPatch.ts:147 — Collision append loses valid source style: whitespace before commas triggers the `", "` fallback, and line 149 always uses one space after `tilecoll` — Appending to `  tilecoll\tFLOOR , WALL , FLOOR , WALL` does not follow the existing line’s spacing — Preserve the keyword-to-argument whitespace and comma separators; add an exact-output append test with noncanonical spacing and no final newline.

- Minor — packages/core/src/blockEdit/gbcPatch.ts:159 — The doc comment requires the requested palette name to already occur in the file, but the implementation accepts any of the eight predefined names — This misstates the public contract and contradicts the existing GRAY/RED-to-GREEN test — Document the fixed-eight-name validation and remove the corresponding stale claim at line 186.

No files edited or tests run. The palette bank arithmetic and existing-record span splicing appear correct. The metatile whole-buffer re-encode mutation is behaviorally equivalent for fixed 16-byte records.

Needs changes