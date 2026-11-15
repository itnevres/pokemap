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

## Execution (conductor s5, 2026-11-13)

- s4 conductor files committed `e2dfa27`.
- **Gate at e2dfa27 (= Task 5 merge `b0b697e` + docs): 4,520 pass / 1 fail / 260 files; typecheck pass, UI build
  pass; subjects unchanged.** The 1 fail is the known env fail (engine.test porymap.project.cfg, "expected 96 to be
  98", same tell as the Task 0 gate). Wall 1,040 s.
- GBA subject HEAD is now `97ac21d4b` with 10 porcelain lines (user's own: adds `M .claude/agents/donor-scout.md`
  to the 9 known); taken as the new subject baseline. PerfPlus `81ededbe3` clean.

### Task 6 (High): GBC edit planner and group placement — s5

- BASE `e2dfa27`; worktree `s5-scratchpad/wt-t6`, branch `p14-2-t6`. Conductor rulings R1-R12
  (`.superpowers/sdd/.../task-6-rulings.md`): effective bytes from `staged` then disk, never the project overlay;
  `req.blockId` is the target, cell only for placement; check order; Local reuse before free slot; free-slot scan over
  map-used tilesets sharing the sheet; confirm per map (not per grid file), false for saveAsNew / no edits; revision
  hash layout; `placeGroup` / `gbcSheetToTileId` edge rules; `BlockEditPlan` in types.ts.
- Delegate (new `chain.py` lane): oracle split. Hop A tests + typed stubs via `chain.py --tier opus` (Codex sol; the
  tests are the oracle, Opus-tier per CLAUDE.md, so not the Haiku test lane), verify `npm run typecheck`. Hop B
  implementation via `chain.py --tier opus` with the tests protected.
- Hop A (tests + stubs): `RESULT done | gpt-6.1-sol done` → `d301a41` (2 test files, 43 tests; stubs; `BlockEditPlan` in
  types.ts; report `task-6-tests-report.md`). Conductor read every line: independent byte/text oracle, all fixtures
  scanned with failing `expect` messages, precedence/confirm/overlay cases present; one interpretation pinned and
  ruled R13 (the palette conflict check runs before no-op entries are dropped). Red run: 43/43 fail, every failure
  "not implemented (Task 6)", every fixture scan found its fixture (89 s).
- Hop B (implementation): `chain.py --tier opus`, tests protected, verify = both files (min 43) + typecheck. Running.

### Task 7 (High): GBA edit planner — s5

- Rulings G1-G9 (`.superpowers/sdd/.../task-7-rulings.md`): target/split resolution, check order, changed entries
  only, structural range per consuming layout (tile sheet bounds, palette < 13 and present), cross-half warning =
  sources differ across consuming layouts, append limits per role, confirm per map, fixture shape; Task 6 R1/R3/R9
  carry over. Smoke cases: an unchanged draft → `edits` `[]` (R1), not "after equals before" as the plan words it.
- Worktree `s5-scratchpad/wt-t7`, branch `p14-2-t7` from `d301a41` (Task 6 tests + stubs: needs `BlockEditPlan`);
  hop A tests + fixture + stubs via `chain.py --tier opus`, running beside Task 6 hop B (no vitest in hop A).
- Task 6 hop B: `RESULT done | gpt-6.1-sol done` → `c4600c7` (gbcOps.ts, placement.ts, report `task-6-report.md`; no
  test edits). Conductor re-ran verify: 43/43 pass, 0 skipped; read the code against R1-R13. Mutations M1-M19
  (scratchpad `mut_t6.py` / `mut_t6.out`) running in `wt-t6`; reviews run in a separate detached checkout `wt-t6r`
  at `c4600c7` so no reviewer reads a mutant. Reviews: Codex `gpt-6-astra` read-only, spec + quality (separate runs).
- Task 7 hop A: `RESULT done | gpt-6.1-sol done` → `4632ed0` (builder fixture `test/blockEdit/gbaFixture.ts` writing
  a tmpdir project — no binary files, no `.gitattributes` change; `gbaOps.test.ts`; stub `gbaOps.ts`; report
  `task-7-tests-report.md`). Conductor hand-checked the expectations: split ids, append limits (F tighter at 20+12),
  structural ranges, cross-half sources per layout, attribute masks (0x0a12 → 0x2a34; clone → 0x3a45), R3 winner.
  Planner must pass `proj.paths.porymapCfg` to `assertNotTripleLayer` (test pins the prefix). Red run pending (waits
  for the Task 6 mutation run: one vitest at a time).
- Review 1 (Codex `gpt-6-astra`, read-only, `wt-t6r`): spec Needs changes (3 Important: Local reuse recoloured by a
  later All entry; mixed-draft expectations built with the production patchers; collision checks parse records only,
  no losslessness; 1 Minor: ALL_WITH_SAVE_AS_NEW message lacks "Local or OK"; coverage gaps: block-0-as-border
  confirm, two Local allocations, reuse vs lower free slot, Local during Save as new, untouched tile without palette
  entry); quality Needs changes (2 Important: the same All/Local bug; native fs errors escape `read()`). All verified
  against the code. Rulings R5a (All before Local), R1a (read failure → BAD_VALUE naming the path), R6a (message).
  Note: the mixed-draft patcher use was allowed by the conductor's tests brief; tightened anyway (cheap).
- Fix round 1 plan: hop A tests (Codex, tests file only) then hop B implementation (Codex, tests protected), after the
  mutation run finishes (it edits `gbcOps.ts` in `wt-t6`).
- **Ruling (user, 2026-11-13, in this session):** "codex limit is hit continue with either free models or anthropic
  modesl". `chain_state.json` shows the Codex cooldown. Implementers from here: `chain.py --tier sonnet --no-codex`
  (free Zen/OpenRouter models) → Claude Sonnet floor; reviews: Claude Opus `high-risk-reviewer`, separate spec and
  quality (as the 2026-11-10 ruling).
- Mutations so far (`mut_t6.out`): M1-M4, M6 KILLED; M5 reuse disabled, M7 free slot ignores reservations, M8 free slot
  ignores draft tiles SURVIVED → fix-round tests items 3, 11, 12.
- Mutation run stopped after M9 (KILLED) on the user's "go": the fix round changes `gbcOps.ts`, so M1-M19 re-run on the
  fixed commit. Worktree restored clean.
- Task 7 red run (`wt-t7` at `4632ed0`): 40/40 fail, every stack at the stub lines (`gbaOps.ts:11/14`) or the test's
  `refusal()` catching the stub error; the fixture builds and opens. `wt-t7` merged `c4600c7` (`cf74410`) so the
  implementation can call `blockEditRevision`.
- Launched in parallel (free lane, `chain.py --tier sonnet --no-codex`): Task 6 fix-round tests hop (`wt-t6`, verify
  typecheck only) and Task 7 implementation hop (`wt-t7`, verify gbaOps.test.ts min 40 + typecheck, tests protected).
- Task 7 hop B: `RESULT done | opencode/deepseek-v4.1-flash-free done` → `4629ca8` (free model; first try). Conductor
  re-ran verify: 40/40, 0 skipped; read the code against G1-G9 (gap noted for review: Save-as-new cell not checked
  against map width/height). Mutations M1-M16 (`mut_t7.py` / `mut_t7.out`) running in `wt-t7`. Reviews: Claude Opus
  `high-risk-reviewer` spec + quality (Codex out) on detached `wt-t7r` at `4629ca8`, no vitest.
- Task 6 fix-round tests: `RESULT done | opencode/deepseek-v4.1-flash-free done` → `e6cd1f2` (+309/−10 in
  gbcOps.test.ts; collision line-level losslessness, All/Local regression both orders, reuse above a lower free
  slot, two Local allocations, Local in Save as new, reserved/draft-referenced slots skipped, read failure,
  ALL_WITH message, untouched tile without palette entry, raw-zero border confirm; mixed draft no longer uses the
  patchers for expectations). Conductor read the diff; inline fix `4154265` (≤10 lines, cheaper than a hop): the
  draft-reference case had the slots swapped (could not kill M8) and compared against a baseline that ignored the
  draft's changed square (would always fail). Typecheck pass.
- Task 6: conductor inline test `57affd8` (unknown map → BAD_VALUE, R1b; 4 lines). Fix-round implementation hop
  launched (`chain.py --tier sonnet --no-codex`, `wt-t6`, verify both files min 53 + typecheck; tests protected;
  brief `task-6-fix1-impl-brief.final.md`; log `s5-scratchpad/chain-T6-fix1-impl.log`).
- Task 7 review 1 (Claude Opus): spec Needs changes (3 Important: Save-as-new cell not bounded; append-limit message
  names neither file nor limit and the tests' regexes match the count; no structural case valid in the edited layout
  but invalid in another; 6 Minor) → `task-7-spec-review.md`; quality Needs changes (1 Important: same cell bounds;
  8 Minor: attribute/metatile count mismatch, native errors from dependencies, per-call cost ~200-360 ms on the real
  subject from duplicate grid reads, limit not stated, surviving hand-traced mutants for secondary confirm target,
  secondary-half tile check and usage index, dead code) → `task-7-quality-review.md`. All verified on read. Rulings
  G2a, G2b, G6a, R1b (both planners), G9 amended (runtime builder), quality items; deferred: primary local index past a
  consuming layout's split.metatiles (usage.ts + confirm; not in the subject) → Task 16.
- Task 7 mutations (`mut_t7.out`): baseline 40/40; M1-M5 KILLED (the four plan-listed + structural removed); run
  stopped after M5 because the fix round rewrites `gbaOps.ts` (M1-M16 re-run on the fixed commit). Fix-round tests hop
  launched (`chain.py --tier sonnet --no-codex`, `wt-t7`, typecheck only; brief `task-7-fix1-tests-brief.final.md`; log
  `s5-scratchpad/chain-T7-fix1-tests.log`).
- Task 6 fix-round implementation: `RESULT done | opencode/deepseek-v4.1-flash-free done` → `891361d` (gbcOps.ts
  +31/−7: R1b wrapper around the planner, R1a guarded `read`, R5a All loop before the Local loop, R6a message; report
  `task-6-fix1-report.md`). Conductor read the diff: matches the rulings. Full mutation rerun M1-M19 on `891361d`
  running → `s5-scratchpad/mut_t6b.out` (its baseline line is the re-verify).
- Task 7 fix-round tests: `RESULT done | opencode/deepseek-v4.1-flash-free done` → `aa0413c` (+258/−12 in
  gbaOps.test.ts; report `task-7-fix1-tests-report.md`). **Not yet vetted by a conductor.**

### Handoff s5 → s6 (2026-11-13, session-length rule)

State (all scratch worktrees under `C:\Users\Serve\AppData\Local\Temp\claude\8fd0350c313cb955\fd52805f-2f40-4daa-9fe0-26bda39faaf2\scratchpad\`, "s5-scratchpad"):
- `wt-t6` branch `p14-2-t6` HEAD `891361d`: Task 6 tests (`d301a41`, fix tests `e6cd1f2`, conductor `4154265`,
  `57affd8`) + implementation (`c4600c7`, fix `891361d`). Mutation rerun M1-M19 was running at handoff →
  `mut_t6b.out` (harness `mut_t6.py`; anchors may report SKIPPED if the fix moved code: re-anchor, never drop).
- `wt-t7` branch `p14-2-t7` HEAD `aa0413c`: Task 7 tests (`4632ed0`) + merge of `c4600c7` (`cf74410`) + implementation
  (`4629ca8`) + fix-round tests (`aa0413c`, unvetted). Fix-round implementation not started; brief to write from
  `task-7-rulings.md` "Fix round 1 rulings" (pattern: `task-6-fix1-impl-brief.md`).
- Review checkouts `wt-t6r` (detached `c4600c7`), `wt-t7r` (detached `4629ca8`): stale; remove or re-point
  (`git worktree remove` without `--force`; they have no node_modules junction).
- Main checkout `plan-14-2-block-editor`: docs only since `e2dfa27`.

Next, in order (one vitest process at a time):
1. Read `mut_t6b.out`: baseline must be green (that is the re-verify of `891361d`); every mutant KILLED or recorded.
2. Task 6 scoped re-reviews (Claude Opus `high-risk-reviewer`, spec + quality, the reviewers' prior findings in
   `task-6-spec-review.md` / `task-6-quality-review.md`) on a fresh detached checkout of `891361d`.
3. On approval: merge `p14-2-t6` `--no-ff` into `plan-14-2-block-editor`, gate, record.
4. Task 7: vet `aa0413c` (oracle: hand-check new expectations against the fixture facts in the tests brief), red run,
   fix-round implementation hop (`chain.py --tier sonnet --no-codex`, tests protected), mutation rerun `mut_t7.py`,
   scoped Opus re-reviews, merge after Task 6, gate.
5. Task 8 onward.

## Execution (conductor s6, 2026-11-14)

- Start check (s5 was cut off by a usage limit after its handoff): main checkout `7219c95`, `wt-t6` `891361d`,
  `wt-t7` `aa0413c`, all clean; no vitest / mutation / chain process alive. The repo matches the s5 handoff; nothing
  to reconcile. Stale review checkouts `wt-t6r` / `wt-t7r` removed (plain `git worktree remove`).
- s6 scratchpad: `C:\Users\Serve\AppData\Local\Temp\claude\8fd0350c313cb955\4f1ff73b-d02e-498f-9436-66e49bb10d5a\scratchpad\`
  ("s6-scratchpad"). `wt-t6` / `wt-t7` stay in the s5 scratchpad.
- Codex cooldown (`chain_state.json`) ran until 2026-11-14 ~09:33 PST; reviews stayed on Claude Opus
  `high-risk-reviewer` (user ruling 2026-11-13).

### Task 6 (High) — s6

- Mutation rerun on `891361d` (`s5-scratchpad/mut_t6b.out`): baseline 53/53 (the re-verify of the fix commit); M1-M19
  plus M2b = 20 mutants, **all KILLED**, none SKIPPED.
- Re-review 1 (Claude Opus `high-risk-reviewer`, detached checkout `s6-scratchpad/rv-t6` at `891361d`, static only):
  - quality: **Approved**, 0 Critical / 0 Important / 3 Minor → `task-6-quality-rereview.md`. Both review-1 findings
    closed. Minors: (1) the R1b wrapper and the guarded reads use `(error as Error).message` (garbles a non-Error
    throw); (2) the new "raw-zero border cells" confirm test passes with the border clause removed (M18 is killed
    only by the older test); (3) the All-loop no-palette-entry guard duplicates the patcher's and prints the tile in
    decimal where the patcher prints `$XX`.
  - spec: **Needs changes**, 0 Critical / 1 Important / 3 Minor → `task-6-spec-rereview.md`. Findings 1, 2, 4 closed;
    finding 3 partly. I1: the planner's own latin1 decode/encode of the collision and palette-map text has no test
    (the corpus has no CR byte and no byte above 0x7F in those files, so a utf8 regression would pass every test and
    corrupt a subject file). M1 = quality Minor 2. M2: R5a refusal precedence (All `BAD_VALUE` before a Local
    refusal) not pinned. M3: the Local-scope no-palette-entry guard is untested.
  - All findings checked against the code at `891361d` (latin1 at `gbcOps.ts:134/137/237/238`; test `:743-760`
    stages only `other`'s grid). Accepted.
- Fix round 2 = tests only (the code already behaves; no implementation finding above Minor): brief
  `task-6-fix2-tests-brief.md` (I1 CRLF + 0xE9 round trip through the planner, M1 rewrite, M2 both entry orders, M3
  Local variant). Hop: `chain.py --tier sonnet --no-codex`, `wt-t6`, verify typecheck only, log
  `s6-scratchpad/chain-T6-fix2-tests.log`.
- Quality Minor 3 (the All-loop no-palette-entry guard duplicates the patcher's; tile printed in decimal there and as
  `$XX` elsewhere) deferred: cosmetic, no behaviour. Candidate for Task 16.
- Fix round 2 tests: `RESULT done | openrouter/thinkingmachines/inkling-2-small:free done` → `b127bb1` (+151/−3 in
  gbcOps.test.ts; report `task-6-fix2-tests-report.md`; the OpenCode pool was capped, so the chain skipped to
  OpenRouter). Conductor read every added line: the I1 test stages CRLF + `0xE9` collision and palette-map text built
  by the test's own string work, asserts `before` = the staged buffer, only record N / the one tile's line changed,
  CR / `0xE9` / `0xFD` byte counts and no `EF BF BD`; M1 now stages a filler grid for every map; M2 runs both entry
  orders and checks the Local-only precondition (`RESERVED_TILE`); M3 is the Local variant. No wrong expectation.
- Conductor inline fix `6287878` (quality Minor 1): `errorText` helper for the R1b wrapper and the two guarded reads
  (+5/−3 in gbcOps.ts; inline because a brief costs more than the edit). Typecheck pass.
- Mutation run on `6287878` (`s6-scratchpad/mut_t6c.py` → `mut_t6c.out`): M1-M19, M2b plus M20-M23 (utf8 decode /
  encode of the collision and palette-map text), M24 (R1a guard removed), M25 (R1b wrapper removed), M26 (R6a
  wording), M27 (Local no-entry guard removed), M28 (Local reuse judged by the pre-All palette), M29 (All loop after
  the Local loop). **Result: baseline 57/57 (the re-verify of `6287878`); 30 mutants, all KILLED, none SKIPPED.**
- Spec re-review 2 (same Opus reviewer, continued; scope `891361d..6287878`, checkout `rv-t6` at `6287878`): started,
  then killed by the Claude 5-hour usage limit (reset 13:30 PST) before it wrote anything. **No
  `task-6-spec-rereview2.md` exists. Open.** A brief for a fresh reviewer is ready: `task-6-rereview2-brief.md`.

### Task 7 (High) — s6

- Fix-round tests `aa0413c` vetted line by line against the fixture facts (`gbaFixture.ts`: splits 8/8/2 vs 12/12/3,
  total 32; A/B 4 blocks 13 palettes, S 3 blocks 5 palettes, T 3 blocks 13 palettes; 16-tile sheets; layouts E, F, O,
  X, H; grids `[1,1,9|13,0]`, borders `[1,0,0,0]`). Every new expectation re-derived by hand: cell bounds; append
  limits (S staged 20/21 → F limit 20 = 32 − 12; A staged 9 → E limit 8); structural cases (tile 25 valid in F,
  invalid in E; palette 5 valid in X/T, invalid in E/S; tile 20 accepted everywhere); SHARED_GRID only from the map;
  boundary ids 8 / 12; read failure; unknown map; border read inside usage; draft shape; secondary confirm (13 only
  in Frlg); secondary usage (targets 9 / 13); warning pairs; R3 winner deciding confirm. No wrong expectation found.
  One weakness: the null-entry and missing-behavior cases would pass through the R1b wrapper alone → conductor
  inline edit `ecbfc14` pins the message prefix (ruling G2c added to `task-7-rulings.md`; 4 lines, inline because
  cheaper than a hop).
- Red run at `aa0413c` (`s6-scratchpad/t7-fix1-red.out`): 61 tests, 14 fail / 47 pass; every failure is the intended
  one (cell bounds ×2, append-limit message ×4, unknown map, border read, null entry, missing behavior, attribute
  word count ×4). The 11 new passing cases pin behaviour the reviews found untested.
- Fix-round implementation brief `task-7-fix1-impl-brief.final.md` (G2a, G2b + G2c, G6a exact, R1b wrapper, quality
  items). Hop: `chain.py --tier sonnet --no-codex`, `wt-t7`, verify `gbaOps.test.ts` min 61 + typecheck, tests
  protected, log `s6-scratchpad/chain-T7-fix1-impl.log`.
- **OpenCode Zen free pool capped 2026-11-14 08:42 PST** ("Free usage limit reached", retry after ~7.7 h; chain
  cooldown until ~20:42 PST). Both chains fell through to OpenRouter `inkling-2-small`, and both hops succeeded.
- Fix-round implementation: `RESULT done | opencode/deepseek-v4.1-flash-free failed (cap: no diff) ->
  openrouter/thinkingmachines/inkling-2-small:free done` → `ecf0eb4` (gbaOps.ts +61/−36; report
  `task-7-fix1-report.md`). Conductor read the diff against G2a/G2b/G2c/G6a/R1b and the quality items: wrapper
  re-throws refusals; id validated before `local`; attribute-count and shape checks in the BAD_VALUE stage; one
  patcher call per file (Save as new validates through its append; the patchers throw `BAD_VALUE` only); cell bounds;
  exact append-limit message; one `cells` cache; layout objects from `proj.layouts`. Re-verify: 61/61, typecheck
  pass (`s6-scratchpad/t7-fix1-green.out`, `t7-fix1-tc.out`).
- Conductor inline test `a27eafc`: missing `layerType` → `BAD_VALUE` naming the attributes file (G2b had a test for
  `behavior` only; 7 lines). Typecheck pass.
  Re-verify at `a27eafc`: 62/62 (`s6-scratchpad/t7-a27eafc-green.out`).
- Scoped re-reviews (Claude Opus `high-risk-reviewer`, fresh, separate spec and quality; detached `rv-t7` at
  `a27eafc`; brief `task-7-rereview-brief.final.md`): started, then killed by the same usage limit before either
  wrote a report. **No `task-7-spec-rereview.md` / `task-7-quality-rereview.md` exists. Open.**
- Mutation harness for the fixed code: `s6-scratchpad/mut_t7b.py`, 33 mutants (M1-M16 re-anchored; M17-M33 from
  the reviews' hand-traced survivors and the fix-round rulings); all 33 anchors match the code at `ecf0eb4` once.
  **Not run yet. Open.**

### Task 8 (High) — s6

- Tier High (silent-corruption save path; plan "Task tiers"). Independent of Tasks 6-7 (consumes Task 1 types and
  Task 5 relations only), so it runs beside their fix rounds. BASE `7219c95`; worktree `s6-scratchpad/wt-t8`, branch
  `p14-2-t8` (node_modules junction to the main checkout).
- Rulings S1-S11 (`.superpowers/sdd/.../task-8-rulings.md`): canonical repo-relative paths resolved against the root;
  "changed" = `after` differs from `before` (a restored edit stays in the session but is no change); merge keeps the
  first baseline; baseline check throws `FILE_CHANGED` at commit and is a `file-changed-on-disk` refusal at plan time;
  effects per family; prepare uses the session baseline as `before`; commit order (fresh refusals → prepared-entry
  match → baseline re-check → atomic write); shared helpers live in `blockEdit/save.ts`.
- Tests brief `task-8-tests-brief.final.md` (oracle split: tests + typed stubs first, verify typecheck).
- Tests hop **not launched**: it waited for the Codex cooldown (ended 09:33 PST) so `gpt-6.1-sol` could write the
  oracle, and the session stopped first. `wt-t8` is at BASE with no change.

### Handoff s6 → s7 (2026-11-14, user: "prepare for next session instead of finishing work")

No full gate ran in s6 (nothing merged); the baseline is still s5's gate at `e2dfa27`. Subjects re-measured
2026-11-14 13:32 PST: GBA `97ac21d4b`, 10 porcelain lines; PerfPlus `81ededbe3`, clean. No vitest, mutation or chain
process is alive.

State. Both scratchpads sit under `C:\Users\Serve\AppData\Local\Temp\claude\8fd0350c313cb955\`: "s5-scratchpad" =
`fd52805f-2f40-4daa-9fe0-26bda39faaf2\scratchpad\`, "s6-scratchpad" = `4f1ff73b-d02e-498f-9436-66e49bb10d5a\scratchpad\`.
- `s5-scratchpad/wt-t6`, branch `p14-2-t6`, HEAD `6287878`, clean. 57 focused tests; 30/30 mutants killed.
  Open: spec re-review 2.
- `s5-scratchpad/wt-t7`, branch `p14-2-t7`, HEAD `a27eafc`, clean. 62 focused tests green. Contains Task 6 only up to
  `c4600c7` (merge `cf74410`). Open: mutation run, spec and quality re-reviews.
- `s6-scratchpad/wt-t8`, branch `p14-2-t8`, HEAD `7219c95` (BASE), clean. Open: everything from the tests hop.
- `s6-scratchpad/rv-t6` (detached `6287878`), `rv-t7` (detached `a27eafc`): review checkouts, no junction.
- `wt-t6`, `wt-t7`, `wt-t8` each hold a `node_modules` junction to the main checkout's.

Next, in order (one vitest process at a time):
1. Task 6 spec re-review 2: fresh Claude Opus `high-risk-reviewer` with `task-6-rereview2-brief.md` → on approval
   merge `p14-2-t6` `--no-ff` into `plan-14-2-block-editor`, gate, record.
2. Task 7: `python -I s6-scratchpad/mut_t7b.py s5-scratchpad/wt-t7 > s6-scratchpad/mut_t7b.out` (~55 min); both
   re-reviews with `task-7-rereview-brief.final.md` (static, may run during the mutation run); fix what they find;
   merge the final `p14-2-t6` into `p14-2-t7`, then `p14-2-t7` `--no-ff` into the plan branch, gate, record.
3. Task 8: tests hop with `task-8-tests-brief.final.md` in `wt-t8`, conductor vets every line, red run, implementation
   hop with the tests protected, mutations (the plan's three plus the conductor's), separate spec and quality
   reviews, merge, gate.
4. Task 9 onward.

## Execution (conductor s7, 2026-11-14)

### Task 6 (High) — s7: closed, merged
- Spec re-review 2 (Claude Opus `high-risk-reviewer`, static on `rv-t6` at `6287878`): **Approved 0/0/0**, I1 and
  M1-M3 closed, 3 non-blocking notes (`task-6-spec-rereview2.md`). Quality was already Approved (re-review 1).
- Merged `p14-2-t6` `--no-ff` → `57f4908`. Deferred (Task 16 candidates): quality Minor 3 (cosmetic), spec-rereview2
  notes 1-3.

### Task 7 (High) — s7: closed, merged
- Mutation run `mut_t7b.py` on `a27eafc` (s6 harness): baseline 62/62, **32 of 33 KILLED**, M11 (`palette < 13`
  guard removed) SURVIVED: every fixture tileset held ≤13 palettes, so `palettes[13]` was undefined anyway.
- Re-reviews (Claude Opus `high-risk-reviewer`, static on `rv-t7`): spec **Approved 0/0/2** (N1 first-layout-only
  structural mutant survives, fixture's E is always strictest; N2 G6a role label unpinned); quality **Approved 0/0/4**
  (N1 fractional attribute-word count in the G2b message; N2 R1b wrapper drops `cause` and planner-local
  `mapsByGridFile` blames the edited map for any other map's missing layout; N3 readability residuals; N4 test residuals).
- Conductor fix `87b4b39` (inline, tiny: 3 files, +25/-1; reason: smaller than a brief): fixture T gets 16 palettes and
  a test "palette 13 is refused even when every consuming secondary holds 16 palettes" (kills M11); spec N2 pinned
  (`layout F (secondary) allows 20 metatiles; cannot append metatile 21`, `layout E (primary) ...`); quality N1:
  non-whole `attributes.bin` → BAD_VALUE `<path>: N bytes is not a whole number of K-byte attribute words` (G2b's
  wording kept for the whole-word case; ruling addendum) + test. Focused 64/64. Mutants M11, M34 (role label
  hard-coded), M35 (non-whole check removed): all KILLED (`mut_t7c.py`, s7 scratchpad).
- Merged final `p14-2-t6` into `p14-2-t7` (`ac38c02`), then `p14-2-t7` `--no-ff` → `7901772`.
- Deferred to Task 16: spec N1 (accepted residual risk, code correct), quality N2 (pass `cause`; reuse usage.ts's
  cached GBA grid index instead of the planner-local `mapsByGridFile`), N3, N4.

Gate at 7901772: 4641 pass / 1 fail / 263 files; typecheck pass, UI build pass; subjects unchanged. The 1 fail is the
known environmental `core/test/config/engine.test.ts` "parses the subject repo's real porymap.project.cfg"
("expected 96 to be 98"). Wall 925 s.

### Task 8 (High) — s7
- Tests hop: `chain.py --tier opus` → Codex `gpt-6.1-sol` done first hop (`9ca5f2f`, 42 tests + typed stubs,
  typecheck pass). Conductor vetted every case against S1-S11: expectations come from independent scans
  (map → tileset → canonical file) and raw-word grid patches, never from the code under test; atomic IO order matches
  `writeFilesAtomically` (all temps, then renames). Red run: 40 failed / 2 passed (the two absent/`[]` compat cases,
  expected to pass on the stub).
- Impl hop: `chain.py --tier opus` with `task-8-impl-brief.final.md`, tests protected.
- Impl hop: `chain.py --tier opus` → Codex `gpt-6.1-sol` done first hop (`fde9ec5`). Conductor re-ran the verify:
  293/293 (`save.test.ts` 42 + `core/test/write` + `core/test/gbc/write`).
- Reviews: Codex astra hit its usage limit (both runs, 0 output) → Claude Opus `high-risk-reviewer`, separate runs on
  detached `rv-t8`. Spec **Approved 0/0/4** (`task-8-spec-review.md`); quality **Needs changes 0/1/6**
  (`task-8-quality-review.md`; I1: the GBC effects cold-alias fallback is reached by no test and pre-empted by
  Task 10's overlay).
- Mutations (`mut_t8.py`, s7 scratchpad): run 1 on `fde9ec5` died after M16 (process gone, `save.ts` left mutated;
  restored). M1-M12, M14, M15 KILLED; **M13** (summary always plural) and **M16** (fallback removed) SURVIVED.
- Fix round 1, conductor inline `1cc405b` (+52/-43, 2 files; reason: smaller than a brief, Codex capped): fallback
  deleted (rulings addendum S7a), canonical-path check in `mergeTilesetEdits` (S3a), aliasing comment, tests:
  `tilesetSaveChanges` singular/plural unit test, exact `file-changed-on-disk` filter, S9 order test (stale entry
  reported before an external edit), non-canonical merge test. 297/297 green. Mutation rerun: M13, M17-M21 and new
  M22 (canonical check removed), M23/M24 (baseline check before prepared match, per family): **all KILLED**.
- Quality re-review (Claude Opus): **Approved 0/0/1** (`task-8-quality-rereview.md`); N1 = absolute or `../` edit paths
  pass S3a: covered by Plan H Task F's root-containment guard in `writeFilesAtomically` (plan Review addendum 3).
- Deferred to Task 16: quality M2 (GBA effects throw on a dangling layout id; reuse usage.ts relations), M4, M6.
- Merged `p14-2-t8` `--no-ff` → `025b8e5` (conflict in `blockEdit/index.ts`: both sides added exports; kept all).

Gate at 025b8e5: 4687 pass / 1 fail / 264 files; typecheck pass, UI build pass; subjects unchanged. The 1 fail is the
known environmental `engine.test.ts` "parses the subject repo's real porymap.project.cfg" ("expected 96 to be 98"). Wall 1,236 s.

### Task 9 (High) — s7
- Rulings O1-O10 written (`task-9-rulings.md`; O5 records the `structuredClone` trap: redo candidates hold
  `Uint8Array`s, not Buffers). Tests brief `task-9-tests-brief.final.md`, impl brief `task-9-impl-brief.final.md`.
- Tests hop: `chain.py --tier opus` parked (Codex usage limit) → `--tier sonnet --no-codex` → OpenRouter
  `inkling-2-small` done (`185d512`, 26 tests, typecheck pass). Conductor vetted every case against O1-O10 (store spy
  pattern = `addEventRoutes.test.ts`; redo FILE_CHANGED case also pins the Buffer trap) and fixed the stub to re-export
  core's `BlockEditPlan` instead of redeclaring it (`a402bd1`). Red run: 26/26 failed for the right reasons
  ("not implemented", and `snapshotOf` lacking `tilesetEdits`).
- Next: impl hop with `task-9-impl-brief.final.md`, tests protected; branch `p14-2-t9` in the s7 scratchpad `wt-t9`
  (based on Task 8 `fde9ec5`; merge the plan branch in before the final verify).

### Handoff s7 → s8 (2026-11-15, session-length rule)

State. Main checkout `plan-14-2-block-editor`, Tasks 0-8 merged; gate at `025b8e5` (above). Not pushed. No vitest,
mutation or chain process alive. The s7 scratchpad is
`C:\Users\Serve\AppData\Local\Temp\claude\8fd0350c313cb955\02bf074c-094f-4bee-97c2-f86eeb7dc935\scratchpad\`.
- `<s7>/wt-t9`, branch `p14-2-t9`, HEAD `a402bd1`, clean, `node_modules` junction to the main checkout's. Based on
  Task 8 `fde9ec5` (does not contain the Task 8 fix `1cc405b` nor Tasks 6-7; merge the plan branch into it before the
  final verify and before merging back).
- Removed: `wt-t6`, `wt-t7`, `wt-t8`, `rv-t6`, `rv-t7`, `rv-t8`. Old `wt-t5` (s4) is still registered; leave it.
- Harnesses for reuse: `<s7>/mut_t8.py` (pattern: name, file, exact old, new; `--anchors` checks anchors only).

Next, in order (one vitest process at a time):
1. Task 9 impl hop in `wt-t9`: `chain.py --tier opus` (Codex; its 2026-11-14 limit reset 20:28 PST) with
   `task-9-impl-brief.final.md`, `--protect "packages/server/test/**"`, `--allow` the five files the brief names,
   verify = the brief's command. Codex parked → `--tier sonnet --no-codex` → Claude Sonnet.
2. Vet the diff against O1-O10 (O5 Buffer rebuild, O6 409 mapping, O8 GBA split arithmetic), merge the plan branch
   into `p14-2-t9`, rerun the brief's verify.
3. Mutations: the plan's three (ownership by bytes; redo skips baseline check; paint guard in one family only) plus
   your own (sorted-path order, owner check skipped on redo, 409 vs 400, shift guarded, Buffer rebuild removed).
4. Separate spec and quality reviews (Codex astra if it answers, else Claude Opus `high-risk-reviewer`, at most two at
   once, static on a detached `rv-t9`), fix round, merge `--no-ff`, gate, ledger.
5. Task 10 onward, same loop. Deferred to Task 16 so far: Task 6 quality Minor 3; Task 7 spec N1, quality N2-N4; Task 8
   quality M2, M4, M6 (all in this ledger above).

Traps seen in s7:
- Codex at its usage limit returns `cap: no diff` per hop and chain.py ends `RESULT parked`; `codex exec` reviews end
  "You've hit your usage limit" with an empty report. Tell: the log's last lines.
- A background mutation run can die without a notice (session teardown). Tell: no `vitest`/`mut_` process and the
  `.out` file stops growing; the working tree is left mutated (`git status` shows the mutated source). Restore with
  `git checkout -- <file>` and rerun only the missing mutants.
- `structuredClone` turns Buffers into `Uint8Array` (no `.equals`): any redo validator over tileset edits must rebuild
  Buffers (Task 9 O5).
- Python heredoc edits: a `\` in a TS string written from a non-raw Python string becomes `\t`/`\a`; use raw strings
  or avoid backslashes in test literals.
- The save-test file copies whole corpora per test: a Task 8 mutant run takes ~5-7 min; budget mutation runs by count.

## Execution (conductor s8, 2026-11-15)

### Task 9 (High) — s8
- Codex chain cooldown in `chain_state.json` was set before Codex's 20:28 reset; cleared by hand.
- Impl hop: `chain.py --tier opus` → Codex `gpt-6.1-sol`. RESULT failed: try 1 and 2 verify exit 1, but the only red
  was a pre-existing `gbcAddEventRoutes` case timing out at 8 s (load flake), and the ownership file was 26/26. Conductor
  popped the stash and re-ran the verify: **157/157**. Committed `a34df03`. Merged the plan branch in (`b1cc25e`):
  157/157 again.
- Vet vs O1-O10: matches (O5 validator order + Buffer rebuild, O6 409 on redo and paint, O8 split arithmetic, shift exempt).
- Mutations (`mut_t9.py`, s8 scratchpad, ownership file only): **17 of 21 KILLED**, incl. the plan's three (M1 ownership
  by bytes, M2/M3 redo skips baseline, M4/M5 paint guard per family). Survivors: M11 (shift guarded) equivalent in
  practice (a non-owner grid cannot hold an unsaved id); M12/M13 (Buffer rebuild removed) equivalent: every hub command
  is a full snapshot, so `apply` puts real Buffers back on the candidate; the rebuild stays as the O5 defence;
  M19 (smallest id not chosen) → test added in fix round 1.
- Reviews (Codex astra `gpt-6-astra`, static on `rv-t9` at `a34df03`): spec **Needs changes 0/2/1** (I1 no interleaved
  tileset/paint history or failed-Save case; I2 paint refusal atomicity and both GBA file roles unpinned; m1 stage
  payload carried raw `tilesetEdits` Buffers, not the family body); quality **Approved 0/0/3** (m1 refused stage
  leaves a newly opened session; m2 = spec m1; m3 `statSync` on a missing metatiles file → 500, deferred to Task 16).
- Fix round 1: conductor inline `ebdb375` (1 file, tiny; reason: smaller than a brief): payload = family body
  (interface field dropped), refused stage closes a session it opened. Tests hop `task-9-fix1-tests-brief.md`
  (cases 1-8: interleaved history, failed Save, mid-stroke refusal, smallest id, no session left, payload keys,
  placement BAD_VALUE, GBA primary role + split file selection).
- Tests hop: `chain.py --tier opus` → Codex `gpt-6.1-sol` wrote 352 lines, then hit the Codex usage limit (reset
  12:32 PST); RESULT parked, the diff stashed. Conductor popped it, ran it (41/42: the GBC mid-stroke case needed a
  5-wide map, the shared GBC map is 4 wide; the brief's fault), moved the stamp to (2,0)-(3,0), vetted every case
  (oracles: disk bytes, literal appends, raw grid decode; expected edit lists built by hand). **42/42**, `ad025c6`.
- Task 10 rulings V1-V8 + U1-U5 written (`task-10-rulings.md`): Task 10 split into **10a server** (overlay sync,
  caches, `tilesetVersion`) and **10b UI** (`tv=` URLs) per delegate §7; sync is lazy and idempotent (identity union).
  10a tests hop (`task-10a-tests-brief.md`): Codex `gpt-6.1-sol` done first hop (`b67400e`, branch `p14-2-t10` in
  the s8 scratchpad `wt-t10`, based on `ebdb375`); conductor vet fix `3676b08` (payload probe = paint begin + end, so
  no stroke stays open across undo/redo).
  10a red run: 10/10 fail for the right reasons. 10a impl hop 1 (`--tier sonnet --no-codex`, free lane): RESULT
  failed: deepseek-v4.1-flash-free (verify) → inkling-2-small-free (wrote a report outside --allow) → openrouter
  inkling-2-small (verify) → ling-3.2-flash (verify); four stashes left in the shared stash list. Hop 2: `--tier opus`
  (Codex) after the 12:32 reset, beside the Task 9 spec re-review (astra, `rv-t9` at `ad025c6`).
- 10b tests hop: deepseek-v4.1-flash-free (`4f2a37c`, branch `p14-2-t10b`, based on `ebdb375`); vetted (literal URLs;
  gap: map GET loaders noting the version have no test, covered by a conductor mutation). Red run: 12 new tests fail,
  all with `not implemented (Task 10b)` from the stub; 82 existing pass.
- Task 9 spec re-review (astra, `ad025c6`): Needs changes 0/1/0. I2, m3 and the refused-stage finding closed; I1
  still open in part (failed Save checked only with a one-command history and `canUndo()`, no grid-on-disk check).
  Fix round 2, tests only (`task-9-fix2-tests-brief.md`): Codex `--tier opus`, typecheck-only verify.
  Fix-2 hop: Codex `gpt-6.1-sol` done first hop (`e8b6aa5`, +118 test lines, one case per family: three-command
  history, failed Save, grid/tileset disk checks, restore, undo×3/redo×3, `canRedo()` false). Vetted (oracles from disk
  and literals). Conductor run: **44/44**. Spec re-review 2 → astra at `e8b6aa5`.
- Task 9 merged `d0082d0` (`--no-ff`, no conflict: `b1cc25e` had already merged the plan branch); reports archived
  `6656148`. Gate at `6656148`: see the next entry.
- 10a impl hop 2 (`--tier opus`, Codex): RESULT failed: gpt-6.1-sol (verify, labelled infra) → gpt-6-sol (verify).
  Both failed on the same two causes, both the conductor's: (1) the Task 9 GBC fixture stages an appended metatile
  with no collision record; once staged bytes are the live overlay, `loadGbcTilesetByName` refuses the tileset (64
  collision records < 65 metatiles), so 3 GBC ownership tests answered 500; (2) the brief allowed only the
  nothing-open assertion near `gbcEditRoutes.test.ts:122`, but case 6 at :228 compares the whole body too.
  gpt-6-sol's own report named both. Conductor took gpt-6.1-sol's stash (the fuller diff), committed it as
  `948556d`, and fixed the fixtures in `fd0b83d`: `beforeAll` gives the GBC temp copy four surplus `tilecoll` records
  under every const that uses the shared file (real repos carry surplus records: forest 40 blocks / 64 records), and
  case 6's `nothing` gains `tilesetVersion: expect.any(Number)`. Inline reason: fixture rulings, 17 lines. Verify at
  `fd0b83d`: typecheck pass, **272/272** (9 files). Diff vetted against V1-V6 (identity union with sorted map-name
  precedence; GBA `pngCache` and GBC render/metatile/warp/coverage caches cleared; sync in both commits' `finally`;
  `tilesetVersion` in every session payload, nothing-open bodies and both map GETs; extra: event-route replies carry it
  too, harmless). Six failed-hop stashes remain in the shared stash list (`delegate: ... T10a-impl*`).
  Open: V8 mutations, spec + quality reviews (astra), merge. wt-t10 lacks the Task 9 fix-2 tests (`e8b6aa5`): merge
  the plan branch into `p14-2-t10` first and re-run, since the fix-2 GBC case also stages an append.
- Gate at `6656148` (Task 9 merged): 4,731 pass / 1 fail / 265 files; typecheck pass, UI build pass; subjects
  unchanged. The 1 fail is the known environmental `core/test/config/engine.test.ts` (baseline).
- `p14-2-t10` merged the plan branch (`b9b74f2`, clean). 10a verify at `b9b74f2`: typecheck pass, **290/290** (9 files;
  +16 fix-1 and +2 fix-2 Task 9 cases, all green under the live overlay).

### Handoff s8 → s9 (2026-11-15)

- Plan branch `plan-14-2-block-editor` at the s8 close-out commit: Tasks 0-9 merged. Gate at `6656148`: 4,731 / 1 /
  265 (env fail only).
- 10a: branch `p14-2-t10`, worktree `wt-t10` in the s8 scratchpad
  (`C:\Users\Serve\AppData\Local\Temp\claude\8fd0350c313cb955\691846b3-528e-43d8-8d84-a3f55fae3e93\scratchpad\wt-t10`),
  HEAD `b9b74f2`, clean, 290/290 on the brief's verify list. Next: V8 mutations (rulings file), astra spec + quality
  reviews on a detached `rv-*` checkout at `b9b74f2` (diff base `3676b08`, plus fixture commit `fd0b83d`), fix round,
  merge `--no-ff`, gate.
- 10b: branch `p14-2-t10b`, worktree `wt-t10b` (same scratchpad), `4f2a37c`, red 12/12 on the stub. Brief ready:
  `.superpowers/sdd/2026-11-10-pokemap-plan-14-2-block-editor/task-10b-impl-brief.md`. Starts after 10a merges (merge
  the plan branch into `p14-2-t10b` first). Gap for a mutation: map GET loaders noting the version have no test.
- Trap (tell: GBC 500 "collision ... has 64 entries, fewer than its 65 metatiles"): a GBC staged plan that appends a
  metatile without a collision record breaks every GBC load once the overlay is live. Real plans (Task 11 saveAsNew)
  append or reuse a surplus record; test fixtures must too (see `fd0b83d`).
- Trap: Task 11's GBC tests must stage complete plans (metatiles + collision), for the same reason.
- `rv-t9` (s8 scratchpad, detached `e8b6aa5`) and `wt-t9` (s7 scratchpad, `p14-2-t9`, merged) can be removed: unlink
  `node_modules` junctions first with `[System.IO.Directory]::Delete`, never `git worktree remove --force`.
- Deferred to Task 16 (added s8): Task 9 quality m3 (`statSync` on a missing metatiles file answers 500).
