# F1/F1b spec review (Claude Opus, read-only), diff 92cf48e..25397cf

Verdict: meets D25; no blockers.

- IMPORTANT-1 (fixed): `Project.tileset()` refusal test matched `/outside\/metatiles\.bin/`, which a POSIX ENOENT message also matches, so removing the refusal survived off Windows. Test now asserts the exact broken-path message.
- NIT-1: empty path, `.`, `data/..` accepted (stay inside the root, D25 holds); an empty `blockdata_filepath` would later fail EISDIR on the root. Out of D25.
- NIT-2: tileset mark's `file` is always `src/data/tilesets/headers.h`; for `.tiles` the reported path is the derived `tiles.png`, not the INCBIN `.4bpp.lz`. Defensible; consider raw INCBIN path in the message.
- NIT-3: test gaps only (UNC backslash, bare `C:` in layouts; `..hidden/x`, `data/a..b/x` accept cases in paths.test).

Consumers still reading layout/tileset paths unchecked (for F1c): core `defects/gba.ts:57,63,72-82` (reads metatilesBin directly, skips the tileset() refusal), `render/layout.ts:62,108`, `signs/suggest.ts:79`, `validate/metatileRange.ts:56`, `blockEdit/gbaOps.ts:91,216,306,251-253`, `write/binary.ts:57,76` (F2 guard is the backstop); outside core: `cli/src/writeCommands.ts:25-26`, `server/src/editSessions.ts:45-46`, `server/src/index.ts:428,945`, `server/src/blockEditRoutes.ts:247`.
