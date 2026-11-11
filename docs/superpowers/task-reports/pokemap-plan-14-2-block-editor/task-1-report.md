# Task 1 report (conductor; implementer DeepSeek V4.1 Flash via OpenCode, no report: timed out at 40 min)

Files: created `packages/core/src/blockEdit/{types,grids,index}.ts`, `packages/core/test/blockEdit/contracts.test.ts`,
`packages/core/test/helpers/gbaTilesetProject.ts`; modified `core/src/index.ts`, `config/engine.ts`, `project.ts`,
`gbc/project.ts`, `load/tilesetData.ts`, `gbc/load/tileset.ts`; `engine.test.ts` (+1 case). Support edits (interface
members only, no removed lines): `test/helpers/stubProject.ts`, `test/gbc/helpers/stubGbcProject.ts`,
`test/world/warpGraph.test.ts`, `test/write/save.test.ts`.

Evidence (conductor): typecheck pass; `npx vitest run packages/core`: 1,593 pass / 1 fail / 96 files (the fail is the
known env fail in engine.test). Mutations on contracts.test.ts: GBA PNG bypasses `read` → KILLED; GBC PNG bypasses
`read` → KILLED; GBA cache not cleared on `setTilesetOverlay` → KILLED; GBC likewise → KILLED.

Notes: overlay keys are root-relative paths as `TilesetPaths`/`GbcTileset` carry them; `gbaGridIds` takes the mask as a
parameter (default 0x3ff); GBC overlay covers only tileset files (map/layout/palette tables stay disk-backed).
`tilesetGeneration` per the preflight ruling.

## Fix round 1

Scoped high-risk fix round (path identity at the tileset file-read boundary). Baseline:
`5aa29f5611572ad3d54d18ec82deff8c7ce3b09f`; initial `git status --short` was clean.
Implementation remains in this already-dispatched Codex fix session; no additional helper or commit.
Acceptance: canonical identities at overlay storage/lookup and exposed paths; complete block and restore
raster comparisons; actual injected loader reads match exposed files. The conductor owns runtime validation.

### Finding 1: canonical overlay identity

Added exported `canonicalTilesetPath`, using forward slashes plus `path.posix.normalize`.
Both projects copy overlay entries into a map with canonical keys; each tileset read canonicalizes its
lookup and disk fallback. GBA `tilesetPaths` exposes canonical directory, metatiles, attributes, PNG,
and palette paths; GBC loader return values expose canonical gfx/metatiles/collision/palette-map paths.
The existing GBA and GBC render regressions now stage the real metatiles file under a spelling combining
leading `./`, backslashes and internal dot segments, so ignoring normalized keys cannot satisfy the
swap assertion. Added a corpus-free helper regression, including parent-segment normalization.

### Finding 2: complete render comparisons

Replaced center-pixel extraction with row-by-row extraction of every RGBA byte of the block region
(16x16 GBA, 32x32 GBC). Pair selection requires differing complete rasters, with an explicit pre-swap
inequality assertion retained. Each patched block must equal the complete source block and differ from
its own baseline. Clearing must restore dimensions and every byte of the complete rendered image.
No assertion was loosened; other overlay/cache-generation assertions remain.

### Finding 3: recorded loader paths

Replaced the parser-to-parser comparison with an injected recording reader passed to `loadTileset` for
every exposed symbol. It reads the real scratch files and asserts the exact read sequence equals the
exposed metatiles, attributes, PNG and palettes converted from `.gbapal` to `.pal`.
The unknown-symbol refusal assertion remains.

### Files touched

- `packages/core/src/blockEdit/canonicalTilesetPath.ts` (new)
- `packages/core/src/blockEdit/index.ts`
- `packages/core/src/project.ts`
- `packages/core/src/gbc/project.ts`
- `packages/core/src/gbc/load/tileset.ts`
- `packages/core/test/blockEdit/contracts.test.ts`
- This report (append only)

### Verification and limits

- `npx vitest run packages/core/test/blockEdit/contracts.test.ts`: could not execute; PowerShell
  `PSSecurityException` / `UnauthorizedAccess`: `npx.ps1` cannot be loaded because running scripts is disabled.
- `npm run typecheck`: could not execute; same PowerShell restriction for `npm.ps1`.
- No alternate shell/launcher or execution-policy workaround attempted, per the fix-round instructions.
- `git diff --check`: passed (Git warns that the existing LF contracts/index files will become CRLF
  when Git next touches them). Existing CRLF files retain CRLF; existing LF files retain LF.
- Full gate, UI build, runtime red/green and mutation checks were not run; this scoped round leaves
  execution to the conductor. No test pass count or runtime success is claimed.
- Working-tree scope and complete diff inspected; no other tests or fixtures changed; no dependencies added;
  no commit made. Status: implementation ready for conductor verification, with runtime checks pending.
