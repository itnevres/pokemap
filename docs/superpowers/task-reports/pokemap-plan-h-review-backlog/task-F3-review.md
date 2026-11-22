# F3 review (Claude Opus spec pass, read-only), diff 38f240b..7045e61

Initial verdict FAIL (free-model implementation was half done):
- B1 `gbc/load/palette.ts`: `includeLabelMap` returned `{path,line}` objects but callers still read strings (`[object Object]` ENOENT on the clean corpus; type error). Fixed by me.
- B2 `palette.ts` had no D25 guard (`assertInsideRoot` imported, never called; `includeLineFor` dead). Fixed: `guardedInclude` helper guards TilesetBGPalette, the per-tileset special palettes and both MansionPalette paths; dead helper removed. `roofPalsPath` is a literal and needs no guard.
- I1 nothing catches `PathEscapeError` yet: `blockEdit/usage.ts:119`, `blockEdit/gbcOps.ts:25` (one escaping map aborts the walk for all maps on the tileset), `cli/src/gbcCommands.ts:147`, `server/src/gbcRoutes.ts:167`. Owner: F1c-style consumer task (not tonight); listed in the final report.
- I2 untested guards: tileset.ts gfx (`:513`), coll (`:515`), palMap (`:516`) and the `loadLayout` fallback guard (`map.ts:362`); only the Meta INCBIN guard has a test. Gap, listed.
- N1 (fixed) UNC and backslash-drive spellings added to `ESCAPING`. N2 (fixed) dead `includeLineFor` removed.
Passed: pathGuard matches the spec; map defect becomes `GbcMap.brokenPaths` without a throw; line numbers 1-based and CRLF-safe; roofs/tileset guarded before any read; other gbc/load readers use literals or single-segment names.
