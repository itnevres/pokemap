# Task 7 hop A: GBA planner tests

Tier: high (independently derived binary fixtures and file parsing). Route: native Codex; parent completed delegation preflight. Budget: 30 minutes, up to two implementation turns. This is the test/fixture/stub hop; implementation and mutation execution are assigned to the conductor.

Fixture choice (b): `gbaFixture.ts` creates a fresh temporary project per test. The synthetic sheets are 128×8 indexed PNGs with 16 tiles; all palettes are generated JASC files. A and B are primary, S and T secondary; E and F pair A/S with Emerald and FRLG splits respectively, O pairs B/S, X and H pair A/T, and SharedA/SharedB share H's blockdata. Primary boundaries are 8/12 tiles and metatiles, 2/3 palettes; total metatiles 32. S has five palettes. Each grid has two occurrences of primary block 1, a secondary occurrence and nonzero collision/elevation bits; each border contains block 1. Attribute 1 is 0x0a12, with nonzero bits outside the behavior/layer masks; block A2 has untouched palette 13–15 entries. Triple mode generates a separate cfg. The helper cleans up temporary directories after each case.

Tests and pinned rulings:

- `OK edits entry N and attribute word N only`: A1, independent little-endian expected bytes and attribute 0x2a34; R1, G1, G7, sorted edits, disk unchanged, no placement, no-op.
- `primary edit allowed; usage counts every paired layout`: A1 across E/F/X/H; independently counts masked fixture grid and border words, shared file once; G1, G7, G8 and Q1.
- `saveAsNew appends at the file-local index; map-visible id = split.metatiles + index for a secondary, under each split` (Emerald, Frlg): S1 -> local 3, visible 11 or 15; independently encoded append, G1/G6 and unchanged disk.
- `saveAsNew keeps the cell's collision and elevation` (Emerald, Frlg): S1 clones 0x0a12 with fields changed to 0x3a45; exact placement keys, G6 and clone mutation.
- `saveAsNew from palette appends only`: A1, G6/G8, no placement and no confirmation.
- `saveAsNew on the shared grid refuses SHARED_GRID`: SharedB, both sorted names and message prefix, G2.
- `append limit refuses SPLIT_LIMIT under the tighter split`: staged S count 20; F's secondary limit is 20 while E's is 24, G2/G6.
- `structural refusal: changed tile 25`, `structural refusal: changed palette 6`, `structural refusal: changed palette 13`: A1, E resolves beyond S sheet or palette availability/total; G4 and G2.
- `cross-half warnings: primary secondary-range tile`, `cross-half warnings: primary secondary-range palette only`, `cross-half warnings: secondary primary-range tile`: A1 or S1, both public APIs and all consuming layout ids; G5, including palette-only mutation.
- `cross-half warnings: no warning when every source is identical`: A1 changed local primary tile, G5.
- `cross-half warnings distinguish different local tiles within the same source tileset`: S tile 12 resolves to S4 vs S0 across splits; G5 compares local indices as well as symbols.
- `existing palette 13-15 / cross-half entries untouched keep their bytes and warn nothing`: A2 with entry 7 changed; G3.
- `triple-layer project refuses TRIPLE_LAYER`: triple cfg and invalid draft together, path prefix and G2 ordering.
- `BAD_VALUE: 7 entries`, `BAD_VALUE: tile 1024`, `BAD_VALUE: palette 16`, `BAD_VALUE: behavior mask`, `BAD_VALUE: past count`, `BAD_VALUE: missing cell`, `BAD_VALUE: flip type`: A1 (or out-of-count A4), G1/G2 validation.
- `check order: invalid draft precedes shared grid, shared grid precedes append limit`: SharedA with combined faults, G2.
- `revision equals independent R9 oracle and changes with staged bytes or grid`: A1 with own SHA-1 framing, staged byte and grid changes, and shared-map alphabetical precedence; R3/R9.
- `staged bytes compose (two plans in a row)`: A1, effective before bytes, independent revision, changed files only, no disk write; R1/R9.
- `staged original determines changed entries and unchanged edits`: staged A1 has an otherwise invalid legacy entry; no-op, no warnings, no confirmation; R1/G3/G8.
- `shared grid uses the alphabetically first staged map for usage and confirmation`: SharedA wins over SharedB; independently asserted counts and shared membership, R3/G8.
- `subject smoke: unchanged General block under emerald split`, `subject smoke: unchanged General block under frlg split`: read-only subject, no edits, SHA-1 shape and tileset usage; G1/G8/R9.

Verification: root `npm.cmd run typecheck` passed (exit 0); PowerShell's `npm` shim is blocked by local execution policy, so the Windows command shim ran the same npm script. Vitest was deliberately not run as instructed. The conductor must execute the red suite and named mutations, and inspect any failures; mutation kills cannot be claimed in this stub-only hop. Full gate and UI build were not run because the task explicitly limits verification to root typecheck and prohibits Vitest.

Additional cases from the independent oracle review:

- `confirmation follows other maps' effective grids and borders`: clears other A-consuming grids and borders, then introduces a border-only use; G8 confirmation false/true without counting the request map.
- `planner staged bytes override the project's separate overlay`: supplies conflicting project and planner overlays, including distinct legacy entries; R1 and G3.
- `append limit precedes structural refusal and applies to every primary split`: A count 8 is full for E but not F, with a simultaneous invalid tile; G2/G6.

Warning tests also check layout IDs as whole tokens, resolved source symbols, deduplication, and the single warning for each changed entry/source kind. The two-plan composition case stages both file types and checks the second attribute edit's effective before and resulting after bytes.

Further boundary cases: `BAD_VALUE: secondary index exactly equals effective count (Emerald)` and `BAD_VALUE: secondary index exactly equals effective count (Frlg)` rejects local 3 of a three-record file; the primary past-count case is local 4 of four. `staged extension makes its new local index a valid source (Emerald)` and `staged extension makes its new local index a valid source (Frlg)` independently appends bytes to the supplied overlay and checks that local 3 is accepted as unchanged. These cover G1 and R1 at both boundaries.

Review findings addressed: assert warning layout IDs as whole tokens and inspect the corresponding tile/palette warning; distinguish same-symbol different-local resolution without introducing a palette warning; use the flagged cell and assert its collision/elevation bits and unchanged grid; stage both files when checking composition; test conflicting project overlays, confirmation from other maps' borders, and primary split limit ordering.


Static test expansion: 40 cases, including two corpus-dependent cases. Independent GPT spec and quality reviews were static; Opus was unavailable in this environment. A separate attempt to load the fixture with tsx failed before loading project code because the sandbox returned `uv_os_get_passwd` ENOMEM, so runtime fixture validation remains for the conductor. The secondary placement cases use cell (0,1), whose grid word has the requested secondary ID and nonzero collision and elevation bits.
