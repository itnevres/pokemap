# Plan 14.2 ledger (Block editor, both families)

Branch `plan-14-2-block-editor` from master `3f4a762` (Plan 14.1 merged via itnevres/pokemap#31). Local only.

## Baseline

- Gate at `110559a` (same code as `3f4a762`): 4,416 pass / 1 fail / 254 files; typecheck and UI build pass. The 1 fail
  is environmental: `core/test/config/engine.test.ts` "parses the subject repo's real porymap.project.cfg" (user
  follow-up, not 14.2). Known load flake: server `api.test` "GET /api/defects ..." can exceed 5 s cold.
- Subjects: GBA `26a2e3d1e` + the user's 9 porcelain lines; PerfPlus `81ededbe3` clean.

## Decisions

- User answers Q1-Q10 (2026-11-08) folded into the spec Design (conductor s1, 2026-11-10). Conductor calls made while
  folding: Q6 implements only Ctrl = 2x2 and Ctrl+Shift = 4x4 from Polished Map's eight modes (verified
  `refs/polished-map/src/block-window.cpp` `change_chip_cb`); GBA 2x2 fills one layer, no 4x4. Q2 Local repoints
  every square of this block that used the old tile id, and reuses an existing identical-pixel tile with the target
  palette. Q8 from the palette edits raw block 0.
- **Q11 (user, 2026-11-10; binding):** Local copies go only into an unused, non-reserved slot of the existing sheet;
  the sheet is never grown.
- **Spec approved by the user 2026-11-10.**

## Reviews

- Spec review 2: Codex `gpt-6-astra` read-only (thread `01a1c72a-617b-7c82-b9f3-83d0f2115d8a`): 9 Important, 2 Minor,
  all folded in (see the spec's Review record).
- Plan review 1: Codex `gpt-6-astra` read-only, 2026-11-10: 1 Critical, 11 Important, 1 Minor. Restructured 13 → 16
  tasks (contracts/overlay first; core save split from hub ownership; overlay lifecycle; UI transport task), revision
  token for stale popups, ownership by history, prepared-entry match, `tilesetEffects` producer, version propagation
  to map/world/palette URLs, deterministic GBA fixture, mixed multi-palette and reservation cases, named assertion per
  mutation, `copyGbaTilesetProject` helper. **Declined: Critical #1** (full gate writes the real subject through old
  restore-in-finally tests): pre-existing, the gate the user mandates, guarded by the 14.1 globalSetup snapshot and
  the post-gate subject check; 14.2's own tests never write subjects (plan Global Constraints).

## Offload log

- 2026-11-10 Gemini 503 (high demand) on the Polished Map block-window question; Nemotron answered, claims verified
  against `block-window.cpp:253-323`.
- 2026-11-10 code map for planning: OpenCode `opencode/deepseek-v4.1-flash-free` `--agent plan` passed (no
  free-limit this time); two refs spot-checked (`addEventRoutes.ts:78`, `gbcRoutes.ts:347-359`). Kept in the s1
  scratchpad, not committed.

## Execution (conductor s1, 2026-11-10)

SDD workspace (gitignored): `.superpowers/sdd/2026-11-10-pokemap-plan-14-2-block-editor/` (briefs). This ledger is
the recovery map; reports go next to it.

### Preflight scan

| Pair / task | Produces → consumes | Finding |
|---|---|---|
| T1 → T2-T7 | `TilesetFileEdit`, `BlockEditRefusal`, `FileOverlay`, `StagedGrids`, `tilesetPaths` | consistent |
| T1 → T5, T10 | `setTilesetOverlay` resets static usage relations | T5 adds the relations; T1 must expose a reset hook T5 can register into. Ruling below |
| T2/T3 → T6 | patchers, `copySheetTile`, `loadGbcReservedTiles` | consistent |
| T4 → T7 | `patchGbaMetatile`, `patchGbaAttribute`, `assertNotTripleLayer` | consistent |
| T5 → T6/T7/T11 | `BlockUsage`, `gbc*Usage`, `gbaBlockUsage(…, grids)` | consistent |
| T6 → T7 | `BlockEditPlan`, `placeGroup`, `blockEditRevision` | consistent |
| T8 → T9 | `tilesetEdits`, `mergeTilesetEdits`, `checkTilesetBaselines` | consistent |
| T9 → T10/T11 | `stageTilesetPlan`, `ownedTilesetPaths` | T10 references `stagedTilesetBytes`, not produced by name in T9. Ruling below |
| T11 → T12/T13 | routes under the edit base, `{error, code}` | consistent |
| T6 → T13 | `placeGroup` in UI via `@pokemap/core` | UI importing core runtime code: check the UI build bundles it (core already imported by UI) |
| each task self-consistency | files created vs touched, tests vs code | T7 fixture folder needs `.gitattributes` `-text` (stated); T10 edits UI mocks only where URL gains `tv=` (stated) |

- Ruling: T1 `setTilesetOverlay` also bumps a project-level `tilesetGeneration: number` that T5's static-relation
  cache compares, instead of a reset-callback registry — simplest coupling — if wrong, T5 adds a callback (small).
- Ruling: `stagedTilesetBytes(session): Map<string, Buffer>` (path → `after`) is produced by T9 in
  `blockEditOwnership.ts` — T10 needs it and T9 owns session-side helpers — if wrong, T10 adds it (trivial).

### Task 1 (High): contracts, readers, overlay

- BASE `a336a0d`; worktree `scratchpad/wt-t1`, branch `p14-2-t1`. Hop 1: OpenCode `opencode/deepseek-v4.1-flash-free`
  (Opus-tier chain) started.
- Ruling (user, 2026-11-10, relayed by master `local_7a03546e`): "make the fix in 14.2. redirect at the source as
  recommended" — overrides the conductor's decline of plan review 1 Critical #1. New Task 0 (High) added before Task 1;
  scoped astra re-review of the Task 0 text running. Task 1's DeepSeek hop was already running in its own worktree
  (disjoint files: Task 1 creates `gbaTilesetProject.ts`, touches no root helper); Task 0 merges first.
- Master (2026-11-10): no full gate / merge for Task 1 until Task 0 is merged and verified; focused non-writing tests
  only until then. Task 1 hop 1 stopped before it edited anything (its brief allowed `vitest run packages/core`,
  which includes subject-writing tests); processes 19528/27536 ended. Task 1 brief now restricts tests to its own
  files. Order: Task 0, then Task 1 (fresh DeepSeek hop, not counted as a failed hop).
- Task 0 text scoped review: Codex `gpt-6-astra` read-only: 6 Important (canonical containment + junctions; git-status
  tests need manifests; Yellow root + basenames + absent roots; real-root manifest at teardown; production cwd-config
  readers; proof via sentinel roots, not real subjects), 1 Minor (copy cost measurement). All folded into Task 0.

## Execution (conductor s2, 2026-11-10)

### Task 0 (High): redirect test roots

- BASE `f651851`; worktree `s2-scratchpad/wt-t0`, branch `p14-2-t0`.
- Hop 1: OpenCode `opencode/deepseek-v4.1-flash-free` failed (`provider.invalid-output` "stream ended without
  finish_reason" ×2; stopped half-done, no report). Stashed `delegate: deepseek failed task0`. Hop 2: Codex
  `gpt-6.1-sol` workspace-write started.
- Hop 2 Codex `gpt-6.1-sol`: code done, report BLOCKED (sandbox: npx/npm blocked by PowerShell policy; flagged a
  third git dependency `core/test/gbc/write/writeGate.test.ts:76`). Conductor verified: focused testRoots 11/11
  (setup 87,246 files / 273 MB / 114 s; teardown 45 s), typecheck pass.
- Conductor inline edits (tiny, ≤20 lines): writeGate git-status → `contentManifest` (same intent as the two named
  exceptions; ruling: in scope); `testConfig()` checks root containment only, deep link walk only in setup (copies
  are dereferenced; per-file walk cost ~5 s × every corpus importer); reverted Codex's `ui/test/gbc/Root.test.tsx`
  edit (string was a fake mock root, not a real path; the UI import of a core test helper resolved to the main
  checkout from the worktree).
- Worktree note: server tests import `@pokemap/core/test/...`; added `packages/server/node_modules/@pokemap/core`
  junction → worktree core, else they load main's helpers (real config).
- Mutations (sentinel roots): M1 containment check off → KILLED (2 tests); M2 teardown manifest check off → KILLED; M3 testConfig fallback when env unset → KILLED. Committed `c00e1ad` on `p14-2-t0`. Astra `gpt-6-astra` spec + quality reviews (separate runs) started.
- Astra review 1: spec Needs changes (Important: gate evidence pending → deferred to merge; Minor: stale report → addendum); quality Needs changes (Important: copy filter on absolute path, `build` ancestor empties copy; Important: cleanup error masks real-root change). Fixed inline (conductor, ~25 lines, fix round cheaper than a Codex resume); +2 sentinel tests (13). Mutations M4 absolute filter → KILLED, M5 cleanup masking → KILLED. Fix commit on `p14-2-t0`; scoped re-reviews running.
- Scoped re-reviews (astra): spec Approved, quality Approved. Merged `--no-ff` as `1d6c07d`.
- **Gate at 1d6c07d: 4,429 pass / 1 fail / 255 files; typecheck pass, UI build pass; all 9 real roots (subjects,
  5 GBA refs, pret pokecrystal, pokeyellow) HEAD + porcelain unchanged; teardown manifest check passed.** The 1 fail is
  the known env fail `core/test/config/engine.test.ts` "parses the subject repo's real porymap.project.cfg" (96 vs 98;
  ledger Baseline), now reading the scratch copy. Wall time 2,027 s (no baseline duration on record); setup 86 s,
  teardown 55 s.
- Grep proof: config/real-root names remain only in `testRoots*.ts`, `subjectSnapshotSetup.ts`, `context.test.ts`
  temp-config fixtures, and `ui/test/gbc/Root.test.tsx` (fake mock root string `/root/pokemap-corpus/...`, no fs).
- Task 0 closed. Redirect verified → normal per-task flow (and whole-package vitest) allowed from Task 1 on.

### Task 1 (High): contracts, readers, overlay — s2

- BASE `3671411`; worktree `s2-scratchpad/wt-t1`, branch `p14-2-t1`. Dispatch regenerated on the current plan (Global Constraints post-Task 0; `vitest run packages/core` now allowed). Hop 1: OpenCode `opencode/deepseek-v4.1-flash-free` started.
- Hop 1 DeepSeek: hit the 40-min timeout (exit 124; one ECONNRESET; no report). Diff checked by conductor and found complete against Task 1 (all Files/Interfaces/Step-1 cases; stub additions in stubProject/stubGbcProject/warpGraph/save tests are interface-required, no removed lines). Typecheck pass; focused 45/46 (known env fail). Accepted as hop output rather than re-running a hop on the same work; `packages/core` + 4 mutations running.
- Committed `5aa29f5` (core 1,593/1 known env/96; mutations GBA/GBC PNG-bypass and cache-not-cleared all KILLED). Astra review 1: spec Needs changes (Important: 1-pixel render asserts; Minor: tilesetPaths test not tied to loader reads; Minor: stub edits outside named files → **conductor ruling: interface-only stub additions in stubProject/stubGbcProject/warpGraph/save tests are allowed, required by typecheck**); quality Needs changes (Important: overlay keys not canonical; Minor: 1-pixel asserts). Fix round 1 → Codex `gpt-6.1-sol` (DeepSeek not resumable per rule; timed out).
- Scoped re-reviews (astra): spec Approved, quality Approved. Merged `--no-ff` as `7a834b9`.
- Gate at 7a834b9: 4,441 pass / 1 fail / 256 files (known env fail only); UI build pass; **typecheck failed**:
  `packages/cli/test/context.test.ts` has its own `Project` stub. The worktree typecheck passed because the worktree's
  `node_modules/@pokemap/core` junction resolves to the MAIN checkout's core, so cli/server/ui were checked against
  the old interface. Fixed on the branch (interface-only stub addition, ruling above); typecheck pass, that file 5/5.
  **Lesson for later tasks:** a core interface change needs `packages/{cli,server}/node_modules/@pokemap/core` →
  worktree core junctions in the worktree (cli/server have no node_modules in main); UI resolves through the root
  junction, so the post-merge typecheck is the backstop for UI.
  Real roots unchanged. Wall 1,782 s.

### Task 2 (High): GBC lossless patchers — s2

- BASE `e5080a3`; worktree `s2-scratchpad/wt-t2`, branch `p14-2-t2`. Hop 1: OpenCode `opencode/deepseek-v4.1-flash-free` started.
- Hop 1 DeepSeek: DONE (git denied by harness; conductor committed). Conductor: typecheck pass; gbcPatch+contracts 25/25. Mutations: record off-by-one KILLED; LF-only append KILLED; collision line re-serialize KILLED; **palette line re-serialize SURVIVED** (no non-canonical tilepal test; sent to reviews); metatiles re-encode SURVIVED (equivalent: fixed 16-byte records). Astra spec + quality running.
- Committed `d81a928`. Astra review 1: spec Needs changes (Important: fixed 8-name whitelist also rejects untouched names → **conductor ruling: the NEW name stays restricted to the spec 8 (spec line 63-64); untouched names are not checked**; Important: BLOCK_CAP not enforced on an over-cap buffer; Important: canonical-only palette losslessness test; Minor: report claims); quality Needs changes (Important: same losslessness gap; Minor: collision append loses keyword/separator style; Minor: doc comments contradict code). Fix round 1 → DeepSeek fresh run (author; OpenCode sessions not resumed per rule).
- Fix round 1 DeepSeek: `provider.free-limit` 429 (Zen free cap) → stashed partial `delegate: deepseek free-limit task2 fix1`; DeepSeek skipped for the rest of 2026-11-10. Fix round 1 → Codex `gpt-6.1-sol`.
- Fix round 1 Codex `gpt-6.1-sol` (`14407a9`): conductor typecheck pass, 30/30; mutations palette re-serialize,
  append separator fallback, over-cap allowed, untouched names rejected → all KILLED. Scoped re-reviews: spec
  Approved, quality Approved. Merged `--no-ff` as `0b24484`.
- **Gate at 0b24484: 4,460 pass / 1 fail / 257 files; typecheck pass, UI build pass; all 9 real roots unchanged.**
  The 1 fail is the known env fail (engine.test porymap.project.cfg). Wall 1,679 s. Task 2 closed.
- Task 3 dispatch prepared (`.superpowers/sdd/.../task-3-dispatch.md`); not started (handoff at ~165 calls, s2 end).

## Execution (conductor s3, 2026-11-10)

### Task 3 (High): GBC sheet PNG and reservations — s3

- BASE `924ff1b`; worktree `s3-scratchpad/wt-t3`, branch `p14-2-t3`. Hop 1 DeepSeek: `provider.free-limit` 429 at once
  (no edits). Hop 2: OpenCode `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free` started.
- Hop 2 Nemotron 3 Ultra: timeout (exit 124, ECONNRESET), no report; diff read `ROOF_LENGTH` from
  `mapgroup_roofs.asm` (it is in `constants/tileset_constants.asm`) and loosened the PerfPlus corpus test to accept a
  throw → failed. Stashed `delegate: nemotron-ultra failed task3`. Dots3-note skipped: OpenRouter timeout treated as a
  429 per delegate §4, no Zen Opus-tier model left. Hop 3: Codex `gpt-6.1-sol` with binding clarifications (ROOF_LENGTH
  file, roof destination parsed from `ld de, vTiles2 tile $0a`, keep ancillary PNG chunks, IHDR-first check).
- Hop 3 Codex `gpt-6.1-sol`: BLOCKED as expected (sandbox; no tests run). Conductor: inline type fix (`Buffer[]`,
  1 line); typecheck pass; gbcSheet 11/11 + gbcPatch 19/19; mutations gray-not-inverted, copy stride, vTiles5 offset,
  ancillary chunks dropped → all KILLED. Committed `f0bb6bd`. Astra `gpt-6-astra` spec + quality reviews running.
- Astra review 1: spec Needs changes (Important: distinct-slot identical-pixel copy re-encodes; Important:
  `findDefEqu` takes first token, `9 + 1` under-reserves); quality Needs changes (Important: anim destinations only on
  `dw`-first lines, misses PerfPlus `ld hl, vTiles2 tile $5b/$38/$0c...` and labeled `dw` lines; Important: same
  ROOF_LENGTH expression; Important: copy fixture repeats every 4 rows, constant `sourceY` survives). All verified
  against code/corpus. Fix round 1 → Codex `gpt-6.1-sol` (fresh run, findings brief).
- Fix round 1 Codex `gpt-6.1-sol` (`7a1edf7`): conductor typecheck pass, 14/14; mutations M1-M4 + M5 constant
  sourceY, M6 identical shortcut removed, M7 anims dw-only, M8 literal check off → all KILLED. Re-review 1 (astra):
  prior findings resolved; spec + quality both Needs changes on one new Important (anim operand regex truncated
  `$20 + 1` at whitespace). Fix round 2 conductor inline (tiny: regex + trim + 1 test; cheaper than a hop brief)
  `d3f731a`: 15/15, M9 KILLED. Re-review 2: quality (astra) Approved; spec astra hit **Codex usage limit (account-wide,
  until 2026-11-12 17:11)** → Claude Opus high-risk-reviewer fallback.
- **Codex unavailable until 2026-11-12 17:11** (implementation sol and reviews astra). DeepSeek Zen free-limited today.
- Spec re-review 2 (Claude Opus high-risk-reviewer): Approved. Merged `--no-ff` as `dba63a3`.
- **Gate at dba63a3: 4,475 pass / 1 fail / 258 files; typecheck pass, UI build pass; all 9 real roots HEAD +
  porcelain unchanged.** The 1 fail is the known env fail (engine.test porymap.project.cfg). Wall 1,336 s. Task 3 closed.
- Task 4 dispatch prepared (`.superpowers/sdd/.../task-4-dispatch.md`).
- **Ruling (user, 2026-11-10, Codex out):** "Continue with free open router models and on Claude use sonnet or haiku
  for Claude implementers". Implementer chain until Codex returns: free OpenRouter models (Nemotron 3 Ultra, Dots3)
  → Claude Sonnet (Haiku for transcription). Reviews unchanged by the ruling: astra unavailable → Claude Opus
  high-risk-reviewer (separate spec + quality).

### Task 4 (High): GBA lossless patchers — s3

- BASE `380b5e9`; worktree `s3-scratchpad/wt-t4`, branch `p14-2-t4`. Hop 1: OpenCode
  `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free` (DeepSeek Zen free-limited today; skipped).
- Hop 1 Nemotron 3 Ultra: finished (55 steps), claimed DONE "22 passed, 2 skipped" — corpus tests always skipped
  (duplicate helper with a nonexistent marker `tilesets.h`, GBC incbin parser, width guessing); behavior written
  without `maskShift`; append test blind to `cloneFrom`. Accepted as hop output with conductor inline fixes (corpus
  rewrite on existing `test/helpers/corpus.ts` + subject profile, one shifted-mask path, clone-from-1 case; reason:
  fixes smaller than a fix-round brief, and the next free hop is the same pool). Typecheck pass; 25/25 (corpus runs);
  mutations byte order, mask without shift, append ignores cloneFrom → all KILLED. Committed `7fcc184`. Reviews:
  Claude Opus high-risk-reviewer spec + quality (astra out of quota) running.
- Review 1 (Claude Opus): spec Approved (5 Minor); quality Needs changes (I1: behavior units diverged from the reader
  `tilesetData.ts:97` after the conductor's shifted-mask change; 6 Minor). **Ruling: patcher fields follow the reader
  (behavior unshifted, layerType shifted); reader change out of Task 4 scope.** Fix round 1 conductor inline
  `1cad519` (I1 + all Minors except spec 5, which is per interface, noted for Save-as-new): 28/28, 7 mutations KILLED.
  Scoped quality re-review (same Opus reviewer) running.
- Quality re-review (same Opus reviewer): Approved (informational Minor: a bit-31 behavior mask makes the reader's
  `attr & mask` negative; reader-side, out of scope). Merged `--no-ff` as `51225cf`.
- **Gate at 51225cf: 4,503 pass / 1 fail / 259 files; typecheck pass, UI build pass; all 9 real roots HEAD +
  porcelain unchanged.** The 1 fail is the known env fail (engine.test porymap.project.cfg). Wall 999 s. Task 4 closed.
- Task 5 dispatch prepared (`.superpowers/sdd/.../task-5-dispatch.md`, incl. the `tilesetGeneration` ruling).

## Execution (conductor s4, 2026-11-12)

### Task 5 (High): usage index — s4

- BASE `263061e`; worktree `s4-scratchpad/wt-t5`, branch `p14-2-t5`. Conductor rulings R1-R10 (`.superpowers/sdd/.../task-5-rulings.md`): one MapUse per grid file named after its alphabetically first map; sharedGrids for 2+ map files; staged grid of first staged alias wins; counts never cached; GBC files = metatiles + collision paths, GBA files = metatiles + attributes bins.
- Oracle split (delegate SDD rule): hop A DeepSeek V4.1 Flash (Zen) wrote `usage.test.ts` only (10 corpus tests, node:fs oracle; PerfPlus has no raw-0 cells on disk, so block 0 is staged). Conductor read every line; added a GBA `files` check. Committed `88c5be8`. Hop B: DeepSeek V4.1 Flash implements.
- Hop B DeepSeek V4.1 Flash (Zen): DONE in 6 min, no test edits (index.ts barrel line + usage.ts). Conductor: typecheck pass; usage.test.ts 10/10, 0 skipped; mutations M1 shared grid per map, M2 block-0 ignored, M3 name-keyed relations, M4 counts cached, M5 GBA secondary ignores split -> all KILLED. Committed `dc73228`. Reviews: Claude Opus high-risk-reviewer spec + quality (astra out until 17:11) running.
- Review 1 (Claude Opus): spec Needs changes (I1 GBA sharedGrids untested; I2 overlay/generation path untested; M1 GBC sharedGrids not compared; M2 types not in types.ts; M3 GBA files shape-only; M4 no border-hit fixtures); quality Approved (7 Minor: per-map border on shared .blk, GBA shared-blockdata targets, primary==secondary, raw-path files echo, unknown GBA symbol throws, per-call disk cost [no change], tidy). **Rulings R2a/R6a/R8a/R9a/R9b/R11** appended to task-5-rulings.md (border summed per map; per-use GBA targets; empty usage for unknown input; types in types.ts). Fix round 1 → DeepSeek V4.1 Flash fresh run.
- Fix round 1 DeepSeek: `provider.free-limit` 429 at once (no edits); DeepSeek skipped for the rest of 2026-11-12. → Nemotron 3 Ultra.
- Fix round 1 Nemotron 3 Ultra: finished (~33 min), claimed 16/16. Diff read: impl mostly per R2a/R8a/R9a/R9b/R11 but R6a not applied to GBC `files`, stale MapUse docs, redundant R8a branch; tests had 3 silent `return` skips on missing fixtures, secondary test hard-coded `gTileset_Building`/id 0 and dropped its non-empty check, pairedWith oracle read from the project, generation check `>0`, GBA files oracle computed but never compared, shared-grid fixture chosen through the function under test. Conductor inline fixes (reason: tightening asserts is smaller than a fix brief; next free hop same pool): all of the above, plus staged lookup over every map on a GBA file (R3) and a backslash-path `files` test. Typecheck pass. Mutations M1-M11 running.
- Conductor baseline found 2 GBA fails: Nemotron had renamed the oracle key `raw.secondary_tileset` → `raw.secondaryTileset` (always "undefined") and hid it by reading pairedWith from the project. Fixed. Baseline 16/16, 0 skipped; mutations M1-M11 (M6 GBA sharedGrids dropped, M7 overlay/generation ignored, M8 GBA border uncounted, M9 R7 border branch, M10 raw files path, M11 unknown symbol throws) all KILLED by their target tests. Not coverable on corpus: R2a differing borders on one .blk; R8a/R9a multi-target files. Committed `37a1524`. Scoped re-reviews (same Opus reviewers) running.
- Re-review 1 (same Opus reviewers): spec Approved (3 Minor: pin R2a, stale comment, no-op fixture filter); quality Approved (4 Minor: dead field, stale comment, per-call layouts filter, no guard for R2a/R8a/R9a; noted the first mutation log had a red baseline). Conductor inline minors `3c96d8d` (tiny each; PortPassage border-0 assertion pins R2a, synthetic stub layouts pin R8a/R9a, static blockdata→maps relation). Final mutation run (scratchpad `mut_t5c.out`): baseline 17/17 green; M1-M14 all KILLED (M12 R2a representative-only, M13 R9a first target only, M14 R8a primary-only added). Merged `--no-ff` as `b0b697e`.
