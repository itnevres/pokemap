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
## Review session (Fable, 2026-11-15; no code, no gate)

- Scope: review of the unfinished plans for an implementer below Fable. Plans read inline (delegate skip: the review
  judgment is the task itself). Second opinion: `ask.py gemini` as a cold implementer, on this plan (it agreed on the
  Task 11/13/14 splits) and on Plan H, the roadmap and Plans 3-4 (its line numbers were off by 5-10; its claims were
  checked against the plan text only).
- Findings, checked against `plan-14-2-block-editor` at `21bf0b9`: the Save plan body drops `tilesetEffects`
  (`index.ts:255`, `gbcEditRoutes.ts:248`); `post` parses JSON only, so a PNG preview cannot go through it; the dialog
  had no path to the session's `post` (the family session hooks were in no task); no hub code builds `StagedGrids`
  (keyed by map name); a GBA tile has no palette for the sheet route; `MetatilePalette.tsx:207` starts a drag on a
  right press.
- Written: `task-11-rulings.md` (B1-B13, traps T1-T5), `task-12-rulings.md` (M1-M8), `task-13-rulings.md` (D1-D12),
  `task-14-rulings.md` (N1-N10) in `.superpowers/sdd/2026-11-10-pokemap-plan-14-2-block-editor/`; the plan's "Rulings
  addendum (2026-11-15)"; Plan H edits (in-flight list, verify lines, Tasks A, C, E, F, I); one RESUME line.
- Not checked: branch `p14-2-t10` beyond its overlay API; every item marked "confirm at vet" in the rulings.
- These rulings are Claude's calls. The user approved writing them, not each one: B8 preview as base64 JSON, B7
  `tileIds` and GBA `?pal=`, M5 `BlockEditSession`, D1 constant spec, N1 reuse of `WorldContextMenu`, Plan H Task C's
  barrier design, Plan H Task F's `DataDefect` recommendation (still the user's to confirm).

## Execution (conductor s9, 2026-11-17)

- Launch mismatch: the master started this session as "conductor s7" with `s7-launch-prompt.md` and an s6-era state
  (Tasks 6-8 open). The repo was ahead: Tasks 0-9 merged, handoff s8 → s9 above, `a533694` on top (docs: plan
  granularization, roadmap D24-D33). Repo taken as truth; this session is **s9**. Checked at start: no vitest,
  mutation or chain process alive; main checkout clean apart from the review session's uncommitted ledger entry and
  plan "Rulings addendum (2026-11-15)" (committed with this entry) and `.claude/settings.json` (not ours, left).
  s9 scratchpad: `C:\Users\Serve\AppData\Local\Temp\claude\8fd0350c313cb955\009f4107-2463-46ca-a327-683443f8da86\scratchpad\`.

### Task 10a (High) — s9
- V8 mutations: `<s9>/mut_t10a.py` on `wt-t10` (s8 scratchpad) at `b9b74f2`, 18 mutants (V8's six plus own), test
  file `tilesetOverlay.test.ts` only (~2 min a mutant). Anchors checked (each matches once).
- Reviews: Codex `gpt-6-astra`, spec and quality as separate runs, static on detached `<s9>/rv-t10` at `b9b74f2`,
  brief `task-10a-review-brief.md` (scope `6656148..b9b74f2`), reports `task-10a-{spec,quality}-review.md`.
- Mutations: **13 of 18 KILLED** (`<s9>/mut_t10a.out`), incl. V8's skip `metatileCache.clear()` (M1), payload
  version without sync (M2/M3), one owner only (M4), always changed (M7), GBA `pngCache` (M8). Survivors: M5/M6
  (commit `finally` sync removed; every read route syncs first, so only a spy inside the commit request sees it →
  fix-1 B), M10 (GBC `coverageCache` not cleared: no coverage case → fix-1 D), M13 (last owner wins: no
  same-path unit → fix-1 E), M18 (GBC `warpCache` not cleared): **equivalent**, `gbcWarpLinks`
  (`core/src/world/nearWarpAdapters.ts`) reads map events only, no tileset file; V3 lists it, clearing it is harmless.
- Reviews (astra): spec **Needs changes 0/2/0** (I1 case 4 does not pin commit-time sync, writer failure never
  reached; I2 cases 3-4 use staged output as expected pixels); quality **Needs changes 0/2/0** (I1 **real defect**:
  event create `structuredClone`s the session (`addEventRoutes.ts:278,348`), the pushed snapshot replaces the
  session's `tilesetEdits` with `Uint8Array`s, the next sync installs them in the overlay and GBA rendering throws
  (`readUInt16LE`); I2 = spec I1). Checked against the code: all four hold. V1-V6 otherwise implemented exactly.
- Fix round 1: tests hop `task-10a-fix1-tests-brief.md` (A independent `replacementPng` oracle, B sync spy inside the
  commit request + injected writer failure, C stage → event create → render/undo/redo/save with Buffers kept, D GBC
  coverage after a staged collision edit, E owner precedence unit), `chain.py --tier opus`. Then the conductor fixes
  `addEventRoutes.ts` (outside the File map → added to Plan H's in-flight list in the same commit).
- Fix-1 tests hop: `chain.py --tier opus` RESULT **parked** (Codex usage limit; message "try again at 5:14 AM";
  chain.py had set a 12 h cooldown, corrected by hand to 05:15). Per the user ruling of 2026-11-13 (free models or
  Anthropic while Codex is out) → `--tier sonnet --no-codex`: deepseek-v4.1-flash-free done first hop (`f611c9f`,
  +240 lines). Vetted (oracles: hub bytes before staging, disk, literals; spy results read before any later request).
  Red run: 14/16, both 4c red; GBA 4c first failed on a fixture gap (the tileset temp copy has no `charmap.txt`, BAD_OPTION
  on script text) → test copies it into the temp root, then both 4c red on `Buffer.isBuffer`.
- Fix `42fbf39` (inline, 4 lines + 1 test line; reason: smaller than a brief): `addEventRoutes.ts` create (both
  families) sets `candidate.tilesetEdits = entry.session.tilesetEdits` after `structuredClone`. Verify at `42fbf39`:
  typecheck pass, **296/296** (9 files). Plan H in-flight list gains `addEventRoutes.ts` at merge time (editing Plan H
  on the task branch would conflict with `a533694`).
- Re-reviews (astra, same reviewer): `task-10a-rereview-brief.md`, static on `<s9>/rv-t10` at `42fbf39`.
- Round-2 mutations (`<s9>/mut_t10a_r2.out`, 16 tests): **6 of 6 KILLED** (M5, M6 by cases 4/4b; M10 by 2b; M13 by
  the precedence unit; M19/M20, the fix removed per family, by 4c). Task 10a total: 19 of 20 KILLED, M18 equivalent.
- Re-reviews (astra): spec **Approved 0/0/1** (minor: 4b did not assert the writer ran) → `6310725` (4b asserts the
  writer's single result is a throw and the reply carries the injected message; 2/2 green); quality **Approved 0/0/0**.
- Task 10a merged **`d1b7eee`** (`--no-ff`, clean). Plan H in-flight list gains `addEventRoutes.ts` (main checkout).

### Power outage (2026-11-17 ~08:30) — s9
- The PC lost power during the first gate at `d1b7eee`, with the 11a impl hop (Codex, `--tier opus`) and the 10b impl
  hop (`--tier sonnet`, deepseek-v4.1-flash-free) both waiting behind a vitest lock (`<s9>/lockrun.py`: a directory lock
  every verify takes, so two chains never run vitest at once). All six background jobs died; no completion records.
- Recovery (master's checklist): no vitest/tinypool/chain/codex/opencode process left; stale `<s9>/vitest.lock`
  removed; 14 `%LOCALAPPDATA%\Temp\pokemap-test-roots-*` folders (11-10 to 11-17) deleted. Main checkout clean at
  `d1b7eee` (docs edits only). `wt-t11` and `wt-t10b`: each hop had written a complete, uncommitted diff (stubs
  replaced, mounts and B12 in place; 10b: store + URL builders + loaders + reset) and died waiting on the lock for its
  verify. Kept, read against B1-B13 / U1-U5, and verified by the conductor instead of re-hopping (cheaper than a rerun).
- Reran: full gate at `d1b7eee`, then the 11a and 10b verify lists on the leftover diffs, one vitest at a time.
- **Gate at `d1b7eee`: 4,746 pass / 2 fail / 266 files; typecheck pass, UI build pass; subjects unchanged.** Fails:
  the known environmental `core/test/config/engine.test.ts` (RESUME) and `packages/ui/test/WorldCanvas.test.tsx`
  "drag pans the world by the mouse delta" (`FakeImage.instances[0]` undefined at :497 under full-suite load; the file
  passes alone, 103/103; not on a known-flake list: recorded here as a load flake, 10a changed no UI code).
- Leftover verifies: 10b typecheck pass, `packages/ui` **2311/2311** → committed as the hop's output `f6cedeb`
  (deepseek-v4.1-flash-free). 11a 310/311: the GBA case 7 invalid-tile fixture was the conductor's (pair.a's layout
  fills all 1024 tile ids, so no representable id lies outside its sheet) → vet `9a51768` takes the first map whose
  sheet has a gap; case 7 green. Impl committed as the hop's output `e1d84aa` (Codex gpt-6.1-sol).
- 10a reports archived to `_archive/`.

### Task 11a (High) — s9, after the outage
- Impl vetted against B1-B13: B13 reads `store.entries()`/`has()` only; GET planner refusals → 409 (`GetConflict`),
  structural/`BAD_VALUE` → 400; sheet per B7/B7a; preview through the family renderer (GBA `renderMetatile` with
  `overrideEntries`, GBC `renderGbcMapMetatile` with a patched tileset); B12 in both `signPlan` bodies. Noted for the
  quality review: `blockEditRoutes.ts` imports `readBody` from `index.ts` (cycle).
- Mutations `<s9>/mut_t11a.py` (16: the rulings' six per family plus own) and reviews (astra spec + quality on
  `<s9>/rv-t11` at `9a51768`, brief `task-11a-review-brief.md`) running.

### Task 10b (High) — s9, after the outage
- Impl vetted against U1-U5. Mutations `<s9>/mut_t10b.py` (12, incl. the map GET loader gap N1/N2) and reviews (astra
  spec + quality on `<s9>/rv-t10b` at `f6cedeb`, brief `task-10b-review-brief.md`) running.
- Subjects at the gate: GBA HEAD moved to `590fdf303` with a clean tree since s8 (`97ac21d4b`, 10 porcelain lines): the
  user's own change, not touched.

### Task 11a (High) — s9
- Worktree `<s9>/wt-t11`, branch `p14-2-t11` from `b9b74f2` (10a head; merge the plan branch in after 10a merges).
- Confirmed at vet before the brief: B3 GBA mask = `project.profile.blockMetatileIdMask` (`core/src/config/engine.ts`,
  used by `load/blocks.ts`); B10 `stageTilesetPlan` calls `requireTilesetOwnership` (`blockEditOwnership.ts:119`).
- Tests hop: `chain.py --tier opus`, brief `task-11a-tests-brief.md`, verify typecheck only.
- Tests hop: Codex `gpt-6.1-sol` done first hop (`f2065c6`; it ran its own spec/quality sub-reviews and fixed
  most findings). Conductor vet `5ab718c` (inline: oracle rulings, a brief would cost more): the two 410-line family
  files were duplicates → one module `test/helpers/blockEditRoutesSuite.ts` + two 4-line test files; GBC fixture
  chosen by disk sheet size (was chosen by the route's own `tileCount`); sheet `tileCount` checked against the tile
  PNGs on disk; GBA invalid tile derived from disk (was from the route's `tileIds`); GBA preview block must use a
  nonzero palette (from disk bytes), so "preview ignores map palettes" can fail. **Ruling B7a (s9):** GBA
  `tileCount = split.tiles + secondary tile count`; `tileIds[i] = i` for primary tiles and for `i >= split.tiles`,
  `null` for the gap between the primary tiles and the split. GBC `tileCount` = tiles in the tileset PNG.
  Stub `blockEditRoutes.ts` starts with a BOM (cosmetic; the impl replaces it).
- Reviews (astra, 2026-11-17): **11a** spec Needs changes 0/3/1 (I1 GBA preview mask checks use 32-bit `&`, so
  `2**32` passes; I2 GBA `limits.cap` from the current layout only, not the file's minimum over consumers; I3 contract
  coverage gaps: staged content in GET, cap refusal, `tv`/`time` values, changed-draft preview, malformed drafts; m1
  layer options hardcoded) and quality Needs changes 0/1/1 (= spec I1; m1 short grid → 500 with no diagnostic; trailing
  blank line in the suite). **10b** spec Needs changes 0/2/1 and quality Needs changes 0/2/0 (I1 discard never notes
  the version; I2 a late reply after a project switch pushes an old, higher version past the reset (max-only); m1 world
  `imageUrl` identity does not change on a bump; works through `visible`). All checked against the code: they hold.
  Rulings written: **B14a-d** in `task-11a-fix1-brief.md`, **U6a-d** in `task-10b-fix1-brief.md` (same folder as the
  rulings), each with a tests list and the impl files.

### Handoff s9 → s10 (2026-11-17, session-length rule)
- Plan branch at the s9 close-out commit: Tasks 0-10a merged (`d1b7eee`); gate above. Not pushed.
- `<s9>/wt-t11` (branch `p14-2-t11`, `9a51768`, contains `d1b7eee`): 11a impl + tests. `<s9>/rv-t11` detached `9a51768`.
- `<s8>/wt-t10b` (branch `p14-2-t10b`, `f6cedeb`, contains `d1b7eee`): 10b impl + tests. `<s9>/rv-t10b` detached `f6cedeb`.
- Mutation runs started 18:34 in the background, 11a then 10b (`<s9>/mut_t11a.out`, `<s9>/mut_t10b.out`, lines
  `MUT EXIT` at the end); they hold `<s9>/vitest.lock` and remove it at the end. A run left without `MUT EXIT`, no
  `mut_t1` python process and a dirty worktree = died: `git checkout -- <file>` and rerun only the missing mutants.
  Expected survivors: 11a M14 (pair.a's layout has no tile gap), M16 (an array body fails on `request` anyway); 10b N1/N2
  (no loader test; the fix round's late-reply tests cover the loaders).
- Removable: `wt-t10`, `rv-t10` (merged), `rv-t9`, `wt-t9`, `wt-t5` (unlink `node_modules` junctions first).

## Execution (conductor s10, 2026-11-17)

- Start (19:00): repo matched the s10 launch prompt (`1c9d253` on `d1b7eee`; `wt-t11` `9a51768`, `wt-t10b` `f6cedeb`).
  s9's chained mutation job was alive (11a at M10 of 16, 10b queued behind it in the same shell, holding
  `<s9>/vitest.lock`); left running. s10 scratchpad:
  `C:\Users\Serve\AppData\Local\Temp\claude\8fd0350c313cb955\3d225916-0a42-4209-a3b3-8f4afc71a35c\scratchpad\`.
- **Ruling B14c′ (s10):** GBA `METATILE_LAYER_TYPE_*` are C `enum` members in `include/global.fieldmap.h`, not
  `#define`s, so the define reader cannot see them. Read the enum (implicit increment, explicit `= n`) or defines from
  that header; fallback NORMAL/COVERED/SPLIT = 0/1/2. Added to `task-11a-fix1-brief.md`.
- Hop briefs written: `task-11a-fix1-tests-hop-brief.md`, `task-10b-fix1-tests-hop-brief.md` (10b allows one stub
  edit in `tilesetVersion.ts`: `tilesetGeneration()` returning 0 and an unused `generation?` parameter, so the
  typecheck-only verify can pass). Both chains (`--tier opus`, verify typecheck) wait in the background for their
  task's `MUT EXIT` and a clean worktree.

### Task 11a (High) — s10
- s9's mutations (`<s9>/mut_t11a.out`, MUT EXIT 0): **13 of 16 KILLED**. Survivors: M14 (GBA `tileIds` no gap:
  expected, pair.a's layout has no gap), M16 (array preview body accepted: expected, an array fails on `request`
  anyway), and **M15 (GBC sheet draws every tile in palette 0 instead of its palette-map palette): a real gap**, not
  on s9's expected list; no case checks sheet pixels. Fix: a test that crops the sheet cell of a block's square-0 tile
  whose palette-map palette is not 0 and compares it with the top-left 8×8 of the hub's metatile image of that block
  (same time). Added to the fix round after the tests hop.
- Tests hop 1: `chain.py --tier opus` RESULT failed, `gpt-6.2-sol failed (no diff)`: Codex answered
  `model_not_found` ("not supported when using Codex with a ChatGPT account"); chain.py's DEAD regex matched only
  "model not found", so it took this for a real failure and stopped before `gpt-6.1-sol`. Fixed in
  `~/.claude/skills/offload/chain.py` (DEAD gains `model_not_found|not supported when using Codex`; `classify` of the
  message now says `dead`). Rerun launched.
- Tests hop rerun: RESULT done, `gpt-6.1-sol done` → `99f0ac5` (+202 suite lines, report
  `task-11a-fix1-tests-report.md`). Vetted line by line: case 3 content (GBA entries decoded from the staged 16 bytes,
  GBC tiles from the staged buffer; replacement = first different disk block); cap (GBA consumers and roles from the
  core project + the planner rule, file minimum; GBC staged appends to 256 with collision lines); sheet `tv` from the
  map payload before/after a stage; GBC day/nite sheets on the first map whose `/api/render` differs by time; changed
  draft preview vs the hub metatile PNG of B (same primary file, same layer bits); B14a guards with masks from the
  profile; B14c′ enum parsed from disk. No expectation reads the route under test. B14d short grid not tested (hop
  deferred it; optional in the brief). Conductor `3c12b60` (inline, one test, smaller than a brief): GBC sheet cells
  vs the top-left 8×8 of the hub metatile image for blocks whose top-left tile has palette-map palette ≠ 0 (M15).
  Typecheck pass.
- Mutation results (finished after the handoff note, 2026-11-17 ~19:30): **11a 13/16 KILLED** (M1-M13: revision from
  disk, grids empty, sheet `pal`, preview palettes/time, `tilesetEffects` per family, GET opens a session, owner, 404 on
  a malformed name); survivors M14, M16 equivalent, **M15 GBC sheet ignores the palette map: test gap** → added to
  `task-11a-fix1-brief.md` item 7. **10b 10/12 KILLED** (N2-N10, N12); survivors **N1** (GBA loader note, no test) and
  **N11** (no reset on unmount, no test) → added to `task-10b-fix1-brief.md` item 5. Both worktrees clean after the
  runs; `s9\vitest.lock` removed.
- s10 note on s9's post-handoff overlaps (s9's message 19:5x): s9 deleted and recreated `<s9>/vitest.lock` at 19:46
  while s10's red-run lockrun held it; no other vitest ran in that minute (the 10b tests chain verifies typecheck
  only). s9's commit `e897a93` swept in this section unchanged. Brief item 7 (M15) is covered by `3c12b60`.
- Red run (`<s9>/t11a-fix1-red.out`, the two block-edit suites): **3 failed / 27 passed (30)**, all GBA, right reasons:
  cap `640` vs file minimum `512` (B14b), behavior and layerType at `2**32` answer 200 (B14a). Every other new case
  green on today's code, incl. the M15 sheet test.
- Impl hop: `chain.py --tier opus`, brief `task-11a-fix1-impl-hop-brief.md`, verify = typecheck + the 11-file 11a list
  through `<s9>/lockrun.py`, `--min-tests 320`, `--protect "packages/server/test/**"`.

### Task 10b (High) — s10
- s9's mutations (`<s9>/mut_t10b.out`): **10 of 12 KILLED**; survivors N1 (GBA map GET loader does not note) and N11
  (FamilyApp does not reset on unmount): test gaps (s9's brief item 5).
- Tests hop: `chain.py --tier opus` RESULT done, `gpt-6.2-sol failed (dead: no diff) -> gpt-6.1-sol done` → `cac902f`
  (+231 lines over 6 test files + the authorised `tilesetVersion.ts` stub; report `task-10b-fix1-tests-report.md`).
  Vetted: literals and mocked replies only; discard notes into a mounted URL builder; late post/discard reply after a
  reset ignored, a new-generation reply noted; both map loaders keep the first hook mounted across the reset (so
  cancellation cannot hide a missing guard) and then note a new-generation reply (pins N1); GBA cancelled same-generation
  reply not noted; store unit for generations and the max rule; both world surfaces pass a new `imageUrl` after a bump
  (`useWorldTiles` spied through `vi.mock` that delegates to the real hook). Conductor `4d8991b` (inline, one test):
  `App.test.tsx` FamilyApp unmount resets the store (N11). Typecheck pass.
- Red run (`<s9>/t10b-fix1-red.out`, 7 files): **9 failed / 98 passed (107)**, right reasons (late replies note 20
  after a reset; discard leaves `tv=5`; generation never changes; `imageUrl` identity unchanged after a bump). N11 test
  green (kills a mutant, not a fix). Impl hop: `chain.py --tier opus`, `task-10b-fix1-impl-hop-brief.md`, verify
  typecheck + `packages/ui` through lockrun, `--min-tests 2320`, `--protect "packages/ui/test/**"`.

### Task 11a fix round (cont.) — s10
- Impl hop: RESULT done, `gpt-6.2-sol failed (dead: no diff) -> gpt-6.1-sol done` → `e2658b1` (+58/-6 in
  `blockEditRoutes.ts` only; `gbaConsumingLayouts` imported from `usage.ts` unchanged, no core edit). Vetted: B14a `>`
  before `&`; B14b cap = minimum over every consuming layout of every symbol aliasing the canonical metatile file,
  `nextId` null at that cap; B14c′ enum/define parser with fallback; B14d `BadGrid` → 409 `BAD_GRID` (both families)
  plus a new GBC cell bound check (400). Codex's sandbox could not start vitest (esbuild access), so it ran none.
- Re-reviews (astra) launched on `<s9>/rv-t11` at `e2658b1` (brief `task-11a-rereview-brief.md`): both died on the
  **Codex usage limit** ("try again at 10:41 PM"). `chain_state.json` codex cooldown set to 22:42. Ruling (s10, cost):
  wait for the reset and keep the same reviewer rather than fall back to Claude Opus; meanwhile verify and other work.
- 11a verify at `e2658b1` (conductor, lockrun): **326/326, 11 files**; typecheck pass. Round-2 mutants
  `<s9>/mut_t11a_r2.py` (M15 again; R1/R2 drop the `>` checks; R3 cap from the current layout; R4 `nextId` ignores the
  file cap) running.

### Task 10b fix round (cont.) — s10
- Impl hop: RESULT done, `gpt-6.1-sol failed (infra: verify exit 1) -> gpt-6-sol done` → `94ddb40` (+68/-29 over the
  six allowed files). Vetted against U6a-c: generation counter, reset bumps it; capture before `fetch` in `post`,
  `discard` (reads JSON; both hubs answer JSON with `tilesetVersion`), both map loaders (`useMapLayout` notes inside
  `!cancelled`; `useGbcMap` inlines `useGuardedFetch`'s effect to capture per request; `reload` captures too). U6c
  done as a **getter on the world adapters that calls `useTilesetVersion()` + `useCallback`**; works because
  WorldSurface reads `adapter.imageUrl` exactly once per render (`WorldSurface.tsx:252`), but a hook inside a getter
  is fragile: asked the quality re-review to judge it.
- Verify (typecheck + `packages/ui`) and round-2 mutants `<s9>/mut_t10b_r2.py` (N11; G1 loader no note; G2 no guard;
  G3 discard no note; G4/G5 loader generation read at reply; G6 world deps `[]`; G7 post generation at reply) queued
  behind the lock. Re-reviews (astra, `task-10b-rereview-brief.md`, `<s9>/rv-t10b` at `94ddb40`) queued after 11a's.
- 11a round-2 mutants (`<s9>/mut_t11a_r2.out`, baseline 30/30): **4 of 5 KILLED** (M15 by the sheet-cell test; R1, R2
  by the `2**32` guards; R3 by the file-cap case). R4 (`nextId` skips the route's file-cap shortcut) survives:
  **equivalent for this subject**: the planner already refuses `BLOCK_CAP` at 512 for `gTileset_General` (all its
  consumers share one symbol); the shortcut only matters when another symbol aliases the same metatile file. Task 11a
  total: 17 of 20 mutants killed, M14/M16/R4 equivalent, none open.
- 10b verify at `94ddb40` (conductor, lockrun): typecheck pass, **`packages/ui` 2321/2321, 133 files**. Round-2
  mutants first run died on a POSIX worktree path given to Windows Python (`NotADirectoryError`); rerun with `C:/`.

### Task 11b (High) — s10
- Started early to use the Codex outage: worktree `<s10>/wt-t11b`, branch `p14-2-t11b` from `e2658b1` (11a fix head;
  rebase/merge onto the plan branch after 11a merges; if the 11a re-review changes the suite, merge `p14-2-t11` in).
  s10 scratchpad = `C:\Users\Serve\AppData\Local\Temp\claude\8fd0350c313cb955\3d225916-0a42-4209-a3b3-8f4afc71a35c\scratchpad\`.
- Tests hop: brief `task-11b-tests-brief.md` (11 cases: check happy/confirm/cross-half/STALE/read-only; apply
  saveAsNew-on-cell + undo, in place + undo, NOT_OWNER, STALE after disk change and after paint, no-op, 400 guards),
  `chain.py --tier sonnet --no-codex` (user ruling 2026-11-13: free models while Codex is out), verify typecheck.
- 10b round-2 mutants (`<s9>/mut_t10b_r2.out`, baseline 2321/2321): **8 of 8 KILLED** (N11, G1-G7). Task 10b total:
  all 18 distinct mutants killed (N2-N10, N12 in round 1; N11, G1 = N1 on the new code, G2-G7 in round 2); none open.
- 11b tests hop 1: RESULT done `opencode/deepseek-v4.1-flash-free` → `aab8353`, but the hop **timed out** (1200 s)
  after adding only helpers (+202 lines, 0 `it(` cases); chain.py counted it done because typecheck passed (gap:
  chain.py does not treat a TIMEOUT hop with a passing verify as failed). Hop 2 continues on top
  (`task-11b-tests-hop2-brief.md`, `--timeout 3000`).
- 11b tests hop 2: RESULT done `opencode/deepseek-v4.1-flash-free` → `0fd00bf` (11 cases, +474/-56 over hop 1's
  helpers; pure additions vs 11a). The hop hit the OpenCode free usage cap at the end (no report; the pool now rests).
  Vetted: oracles from GET bodies captured before the action, disk recomputation of both `confirm` predicates, the
  planner's warning text, literals. **Defect found:** `copiedRequest` read `source.block` while `findChangedSource`
  returns `{ id, data, png }` (runtime TypeError; typecheck passed through `any`) → fixed in `9ff58fc`.
- **Ruling B10a (s10):** a no-op apply answers `deps.sessionBody(map)`; both builders open a session, so "no session
  opened" in B10 is read as: no undo entry, no staged bytes, `isDirty` and `canUndo` false. 11b.10 asserts that.
  **B9 vs B11:** check answers 400 for structural and `BAD_VALUE` drafts (B11), 200 + `refusal` for every other
  planner refusal (B9). Conductor wrote `task-11b-tests-report.md`; commit `9ff58fc`. Red run queued.
- 11b red run (`<s10>/t11b-red.out`): **23 failed / 30 passed (53)**: every 11b case red, every 11a case green. All
  on the missing routes (404) except GBA 11b.2: `fetch failed` / ECONNRESET. Probe (`<s10>/probe-11b2.mts`, tsx, temp
  copy): GET `block=0` on all 1,209 GBA maps answers 200, so no route crash; cause = fetch reusing a keep-alive socket
  the server closed after Node's 5 s `keepAliveTimeout` during long synchronous fixture scans. `00cbc23`: suite server
  `keepAliveTimeout = 120_000`; GBA 11b.2 alone now red on the 404.
- Impl brief `task-11b-impl-hop-brief.md` written. Impl hop waits for Codex (reset 22:42; OpenCode free pool capped
  ~19 h after hop 2) and goes after the 11a/10b re-reviews.

### Power loss (2026-11-17 night) and handoff s10 → s11 — s10
- The PC lost power between ~21:35 and 22:43 (before the queued re-reviews started). Died, never ran: the 11a
  re-reviews (`<s10>/t11a_rereview_after_reset.sh`), the 10b re-reviews (`t10b_rereview_after_11a.sh`) and the 11b
  impl chain (`t11b_impl_after_reviews.sh`). No completion records; no `codex-t10b-re-*.log`, no
  `chain-T11b-impl.log`; `codex-t11a-re-*.log` are the 20:06 usage-limit runs. Inventory 2026-11-18 09:26: no vitest,
  tinypool, chain, codex or opencode process; no `<s9>/vitest.lock`; no uncommitted hop output anywhere.
- Committed state: `<s8>/wt-t10b` `94ddb40` (10b fix round complete: tests `cac902f` + `4d8991b`, impl `94ddb40`,
  verify 2321/2321, 18/18 mutants killed; re-review pending). `<s9>/wt-t11` `e2658b1` (11a fix round complete: tests
  `99f0ac5` + `3c12b60`, impl `e2658b1`, verify 326/326, M15 + R1-R3 killed; re-review pending).
  `<s10>/wt-t11b` `00cbc23` (branch `p14-2-t11b` from `e2658b1`: 11b tests vetted, red 23/30 on the missing routes;
  impl not started). Review checkouts `<s9>/rv-t11` at `e2658b1`, `<s9>/rv-t10b` at `94ddb40`. Main checkout: this
  ledger only (committed with this entry).
- Delegation state: Codex cooldown in `chain_state.json` expired (22:42); `gpt-6.2-sol` marked dead (ChatGPT account);
  OpenCode free pool capped by Zen ~21:00 (`retryAfterMs` ≈ 19 h → about 16:00 on 11-18). chain.py fixed this session
  (DEAD regex). Known chain.py gap: a TIMEOUT hop whose verify passes counts as done (11b hop 1).
- **User ruling (2026-11-18, via the master):** conductor sessions stay at 200k-250k context. Hand off at about 200k
  context or after two task merges, whichever comes first; the next prompt names only the next one or two tasks.

## Execution (conductor s11, 2026-11-18)

- Start (~09:30): repo matched the s11 launch prompt (`2367541`; `p14-2-t10b` `94ddb40`, `p14-2-t11` `e2658b1`,
  `p14-2-t11b` `00cbc23`). Inventory: no vitest/tinypool/chain process; running `codex.exe` are the Codex desktop
  app's (started 07:39), not ours; no `<s9>/vitest.lock`. Deleted 188 `%LOCALAPPDATA%\Temp\pokemap-*` roots.
  s11 scratchpad: `C:\Users\Serve\AppData\Local\Temp\claude\8fd0350c313cb955\83bae35f-190d-441b-9341-b76d1bc8f31d\scratchpad\`.
- 11a astra re-reviews (`<s9>/codex-t11a-re2-*.log`): both died at once on the **Codex usage limit, "try again at Nov
  20th, 2026 3:45 PM"**. `chain_state.json` codex cooldown set to 2026-11-20 15:46. Per the launch prompt's fallback,
  re-reviews go to Claude Opus `high-risk-reviewer` (two at once), each told to read astra's round-1 report and judge
  every finding itself (a 2-day wait would block the plan).

### Task 11a re-review (Claude Opus fallback) — s11
- Spec `task-11a-spec-rereview.md`: **Approved** (0/0/5 Minor + escalation E1). Quality `task-11a-quality-rereview.md`:
  **Needs changes** (0/2/2). Conductor checked each against `e2658b1`:
  - quality I1 / spec m5 **real**: `gbaLayerTypes` throws `bad()` on an unreadable enum member; `options()` runs in every
    GBA block GET → 400 on every map of such a project (not hit by the six corpora).
  - quality I2 / spec m1 **real**: the layer test equals the old literals (red run had no layer failure).
  - quality m1 / spec m4b **real**: B14d untested; GBC short `.blk` gives 500 for cells inside the data (loader refuses
    the whole grid).
  - spec m2 **real**: alias cap untested (the case-5 fixture's 512 consumer shares the symbol).
  - Out of fix scope but cheap: `options.behaviors` is define-only, empty on upstream pokeemerald (enum).
- **E1 (escalation, confirmed):** GBA usage/planner are keyed by tileset *symbol* (`core/src/blockEdit/usage.ts:349`
  `consumingBySymbol`; `gbaOps.ts` cap loop), but spec §Identity requires the resolved file path. The subject has real
  aliases: 10 `gTileset_Building*` headers share `gMetatiles_InsideBuilding` (`primary/building/metatiles.bin`), 6
  SecretBase secondaries share `gMetatiles_SecretBaseSecondary`. An edit through a `gTileset_Building_Dome` map misses
  the `gTileset_Building` maps in `usage.maps` (wrong `confirm`). Not caught by any test. Ruling: a separate High
  core fix (Tasks 5-7 code, file-keyed GBA consumers/usage/structural/cap), scheduled before Task 12 (the UI that
  shows `confirm`); 11b must not copy the symbol scope.
- Fix round 2 rulings **B15a-d** in `.superpowers/sdd/.../task-11a-fix2-brief.md` (options never refuse; behaviors read
  the enum too; GBC short `.blk` → 409 for every cell; route cap follows the file, planner side is E1). Deferred to
  Task 16: spec m4a, quality m2a, m2c.
- Delegation: Codex out → tests hop `chain.py --tier sonnet --no-codex` (free lane; user ruling 2026-11-13).

### Task 10b re-review (Claude Opus fallback) — s11
- Spec `task-10b-spec-rereview.md`: **Approved** (0/0/2: `useGbcMap.reload` generation unpinned; world `imageUrl`
  identity stability between bumps unpinned). Quality `task-10b-quality-rereview.md`: **Needs changes** (0/1/3).
  I-1 **real**: `get imageUrl()` calls `useTilesetVersion()` + `useCallback` behind an interface typed as a plain
  method; any read outside render (effect, spread, event) is an invalid hook call, and a fake→real adapter swap changes
  WorldSurface's hook count. m-1 (inline guarded fetch lost its URL-switch coverage), m-2 (`await r.json()` on a 2xx
  non-JSON discard leaves the client dirty), m-3 (stale docs) all real and small.
- Fix round 2 rulings **U7a-c** in `.superpowers/sdd/.../task-10b-fix2-brief.md` (adapter hook member `useImageUrl()`
  called at WorldSurface top level; best-effort discard body; docs) and 4 test cases.
- **Delegation lesson:** OpenCode hops cannot read `.superpowers/` (outside the worktree: permission-denied), so a hop
  brief that points there gets a guess. 11a tests hop 1 (`603aa2b`, OpenRouter inkling-2-small) added 1 of 9 cases;
  the 10b hop was stopped before it produced anything. Both relaunched with the rulings inlined into the hop brief
  (`task-11a-fix2-tests-hop2-brief.md`, `task-10b-fix2-tests-hop-brief.md`). Hop briefs must be self-contained.

### Fix round 2 tests (both tasks) — s11
- 11a tests hop 2 (inlined brief): RESULT done, OpenRouter `inkling-2-small:free` → `2acdce9` (+192 over `603aa2b`;
  9 cases + hop 1's B15a case + case-5 else branch). Vetted: every expectation a literal or a file the test writes
  (temp root, `restoreBytes` in `finally`); alias case finds the aliased primary file on disk with the literal role
  rule. Red run (`<s9>/t11a-fix2-red.out`): **4 failed / 35 passed (39)**, right reasons (two B15a 400s, B15b only
  `MB_INVALID`, GBC short `.blk` 500 `INTERNAL_ERROR`). B14c′ offset, fallback, define override, alias cap, GBA
  short grid green on today's code (pin existing behaviour; mutants to follow).
- 10b tests hop (inlined brief): RESULT done, OpenRouter `inkling-2-small:free` → `7721a21` (+140 over 4 files: reload
  late reply, URL-switch sticky error / stale payload / cancelled same-generation, identity stable without a bump in
  both world surfaces, non-JSON discard). Vetted: literals and mocked replies. Red run (`<s9>/t10b-fix2-red.out`):
  **1 failed / 58 passed (59)**: only U7b, as expected.
- Impl hops: both `chain.py --tier sonnet --no-codex` (free lane; Codex out), verify through `<s9>/lockrun.py`
  (11a: typecheck + the 11-file list, `--min-tests 335`; 10b: typecheck + `packages/ui`, `--min-tests 2328`).

### Fix round 2 impl, mutants, re-review 2 — s11
- 11a impl hop: RESULT done, OpenRouter `inkling-2-small:free` → `e28bf13` (+28/-17 `blockEditRoutes.ts`): one
  `cPrefixedValues(root, path, prefix)` enum-or-define reader (skip rule, defines override, sorted by value, never
  throws) for layer types (fallback 0/1/2) and behaviors; GBC `requireWholeGrid`. Conductor verify (lockrun): 11-file
  list **335/335**. Round-3 mutants (`<s9>/mut_t11a_r3.out`): 7 of 8 killed; **R6** (a literal never ends the skip)
  survived → conductor test `297439b` (inline, one test: hex/octal/suffix/sign, bad octal and unsafe skip, skip ended
  by a literal, exact subject behaviors list parsed from the header; stale hop comment dropped; covers both 11a r2
  Minors) → R6 KILLED, two suites 40/40. Task 11a round 3: 8 of 8 killed.
- 10b impl hop: RESULT done, OpenRouter `inkling-2-small:free` → `041c362` (+24/-20 over 9 files; test edits only the
  fake-adapter `useImageUrl: () => fakeImageUrl` swap). Conductor verify: typecheck pass, **`packages/ui` 2328/2328
  (133 files)**. Round-3 mutants (`<s9>/mut_t10b_r3.out`): **6 of 6 killed** (H1 reload without generation, H2 note
  before cancelled, H3 no reset on URL change, H4/H5 URL builder fresh per render, H6 strict discard JSON).
- Re-review 2 (same Opus reviewers, resumed): 11a spec **Approved** (0/0/2), quality **Approved** (0/0/2) — both pairs
  of Minors covered by `297439b`. 10b spec **Approved** (0/0/0), quality **Approved** (0/0/1: identity tests do not
  prove a rerender happened) → conductor `0cb5e3d` (inline, 2 lines per file: assert `useWorldTiles` saw a new call);
  the two files 40/40.

### Task 10b merged; handoff s11 → s12 — s11
- Merged `p14-2-t10b` (`0cb5e3d`) `--no-ff` → **`ed3b657`**. **Gate at `ed3b657`: 4,776 pass / 1 fail / 267 files;
  typecheck pass, UI build pass; subjects unchanged** (fail: the known `engine.test.ts` env fail). 10b reports archived
  to `_archive/`.
- 10b live check: not run. The hub bumps `tilesetVersion` only when a session's `tilesetEdits` change
  (`server/src/tilesetOverlay.ts`), and no HTTP route stages tileset edits until 11b's `apply`, so the staged-edit
  `tv=` path cannot be driven from the real app yet. s12 runs the smoke (both families, no `tv=` at version 0, project
  switch) and folds the staged-edit half into 11b's live check.
- 11a (`p14-2-t11` `297439b`) approved, **not merged** (user asked for a handoff at the context limit).
- Delegation: user reset the OpenAI usage on 2026-11-18; s11 cleared `cooldown.codex` and checked `gpt-6-astra`
  answers. OpenRouter free lane did all four s11 hops. OpenCode Zen pool rests to ~21:39 2026-11-18.
- Handoff: `.superpowers/sdd/2026-11-10-pokemap-plan-14-2-block-editor/s12-launch-prompt.md` (scope: merge 11a + gate,
  10b live smoke, Task 11b).

## Execution (conductor s12, 2026-11-18)

- Start: repo matched the s12 launch prompt (`6df2eac`; `p14-2-t11` `297439b`, `p14-2-t11b` `00cbc23`). Inventory: no
  vitest/chain process (node = Playwright MCP; `codex.exe` and OpenCode = the desktop apps); no `<s9>/vitest.lock`;
  1 `%LOCALAPPDATA%\Temp\pokemap-*` root deleted. s12 scratchpad:
  `C:\Users\Serve\AppData\Local\Temp\claude\8fd0350c313cb955\354aaab1-e129-40c0-ba11-94ff97ca4c7a\scratchpad\`.
- **Task 11a merged:** `p14-2-t11` (`297439b`) `--no-ff` → **`59d630f`** (merge-tree clean). **Gate at `59d630f`:
  4,816 pass / 1 fail / 269 files; typecheck pass, UI build pass; subjects unchanged** (fail: the known
  `engine.test.ts` env fail, "expected 96 to be 98"). 11a reports archived to `_archive/`.
- 11b worktree: merged the plan branch in (`a54941c`); auto-merged, no conflict in `blockEditRoutesSuite.ts`.
- 11b impl hop brief rewritten self-contained (rulings B1-B15d inlined): `.superpowers/sdd/.../task-11b-impl-hop2-brief.md`.
- **10b live smoke (built-in browser, `server` + `ui` at `2eaeffc`): pass.** GBA (`Pokemon Game/game`): map
  NewBarkTown render `/api/render/NewBarkTown.png?border=1` and palette `/api/metatile/NewBarkTown_Layout/<n>.png`
  load, world view draws `/api/render/<map>.png` (NewBarkTown, Route29, Route27, …); project switch to PerfPlus: map
  OlivineGym `/api/render/OlivineGym.png?border=1&time=day`, palette `/api/metatile/OlivineGym/<n>.png?time=day`, world
  renders; switch back to GBA. **No request in the session carried `tv=`** (network log filter), no console errors. The
  staged-edit `tv=` half runs in 11b's live check.
- 11b red run after the merge (`<s12>/t11b-red2.out`, 11-file list): **23 failed / 336 passed (359)**; every 11b case
  red with 404 (`{"error":"not found"}`, missing routes), every 11a case green.
- 11b impl: `chain.py --tier opus` (Codex lane), brief `task-11b-impl-hop2-brief.md`, verify through `<s9>/lockrun.py`
  (typecheck + 11-file list, `--min-tests 359`), `--protect "packages/server/test/**"`. Hop 1 `gpt-6.2-sol`: dead (no
  diff), as expected.
- Impl chain: `RESULT failed` — `gpt-6.2-sol` dead (no diff); `gpt-6.1-sol` rejected "touched files outside --allow"
  for `blockEditRoutes.ts`. **Conductor error, not the hop's:** chain.py's `--allow`/`--protect` are `nargs="*"`, so
  repeating `--allow` keeps only the last value (the report path). Pass every glob after one `--allow`. Conductor
  popped the stash and verified: typecheck pass; 11-file list **355 pass / 4 fail** (11b.6, 11b.7 both families:
  the suite's `edit(name, "undo")` sent GET without a body, undo is POST-only → 404; a test bug the red run could not
  show). Conductor test fix `35049c1` (2 lines, inline: tiny) → two block-edit suites **63/63**; impl committed as
  `4c56e75` (`delegate(gpt-6.1-sol)`, +73/-26 `blockEditRoutes.ts`: shared `validate` per family for preview and
  writes, `write` planner callback, check/apply in the shared POST path).
- Reviews (Codex `gpt-6-astra`, brief `task-11b-review-brief.md`): quality **Approved** (0/0/0); spec **Needs
  changes** (0/1/3). Conductor checked each: I1 **real** (GBA `cell: null` → `gbaOps.ts:322` checks only `undefined`,
  reads `cell.x` → TypeError → 500); m2 (no real planner refusal in check), m3 (no planner-thrown `BAD_VALUE`, no B14a
  ranges in check/apply), m4 (11b.6 append oracle against a staged "before") real and cheap. Rulings **B16a-d** in
  `.superpowers/sdd/.../task-11b-fix1-tests-brief.md`. Fix round 1: tests hop `chain.py --tier opus` (Codex), then
  the route guard inline (B16a, a few lines in `request()`).
- Mutants round 1 (`<s12>/mut_t11b.out`, two block-edit suites, on `4c56e75` in a separate detached worktree
  `<s12>/mut-t11b` so reviewers read an unchanged tree): K1-K8, K10 killed; **K9** (check planner refusal → 409),
  **K11** (body `map` wins), **K12** (no overlay resync after the body arrives) survived.
- Fix round 1: tests hop `chain.py --tier opus`: `gpt-6.2-sol` dead → **`gpt-6.1-sol` done `a768f07`** (11b.12
  malformed cell ×5 shapes, 11b.13 outside-map planner BAD_VALUE, 11b.14 real planner refusal (GBC
  `ALL_WITH_SAVE_AS_NEW`, GBA `SHARED_GRID` from a disk-shared layout), 11b.15 GBA attribute ranges incl. `2**32`,
  11b.6 append oracles from disk). Vetted: literals, disk reads, earlier GETs. Red run (`<s12>/t11b-fix1-red.out`):
  **10 failed / 71 passed (81)**, only 11b.12 (GBA `cell: null` TypeError, planner message prefix). Conductor (inline,
  tiny): test `b515a8c` 11b.16 (body `map` ignored, for K11); fix `177bb21` (`request()` guard, B16a, 4 lines).
  Verify: typecheck pass, 11-file list **379/379**.
- Mutants round 2 (`<s12>/mut_t11b_r2.out`, on `177bb21`): K9, K11, K13 (null cell passes the guard), K14 (no guard)
  **killed**. Task 11b total 13 of 14 killed; **K12 accepted** (the route also syncs before reading the body; only a
  race during upload tells them apart).
- Spec re-review (astra, `task-11b-spec-rereview.md`): **Approved** (0/0/0); I1, m2, m3, m4 resolved. Quality round 1
  was already Approved; the round changed 4 route lines (a guard), no quality re-review.

### Task 11b merged; handoff s12 → s13 — s12
- Merged `p14-2-t11b` (`177bb21`) `--no-ff` → **`ff08190`** (merge-tree clean). **Gate at `ff08190`: 4,858 pass /
  2 fail / 269 files; typecheck pass, UI build pass; subjects unchanged.** Fails: the known `engine.test.ts` env fail,
  and **new load flake** `packages/ui/test/WorldCanvasContext.test.tsx` "a plain double-click on a map body calls
  onEditHere…" (spy called 0 times under the 4-worker run; passes alone 3/3, 37/37; 11b's diff is server-only).
  Added to RESUME's known-flake list.
- **11b live check (built-in browser, `server` + `ui` at `ff08190`, GBA subject; staged only, never saved): pass.**
  `POST /api/edit/NewBarkTown/block/apply` (metatile 1, mode `ok`, entry 0 `xFlip` toggled, GET revision) → 200
  session body, `tilesetVersion: 1`, `isDirty`/`canUndo` true. After a page reload the map render, all palette images
  (785) and the world renders carry `tv=1` (`/api/render/NewBarkTown.png?border=1&tv=1`,
  `/api/metatile/NewBarkTown_Layout/1.png?tv=1`, world `/api/render/Route29.png?tv=1`). This closes **10b's staged-edit
  `tv=` half**. Undo → `tilesetVersion: 2`, metatile 1 PNG bytes changed back; discard → clean; block 1 back to its
  original entry; subject `git status` clean. Limit: the edit was staged by a fetch outside the UI, so the UI picked
  up the new version on reload, not live (no UI calls apply until Task 12).
- 11b reports archived to `_archive/`. Task 11b done.
- Worktrees: `<s12>/mut-t11b` (detached, mutants) and `<s10>/wt-t11b`, `<s9>/wt-t11`, `<s8>/wt-t10b` are on merged
  work and can be removed (unlink `node_modules` junctions first; never `--force`).
- Handoff: `.superpowers/sdd/2026-11-10-pokemap-plan-14-2-block-editor/s13-launch-prompt.md` (scope: E1 core fix
  plan + implementation; then Task 12 if room).

## Execution (conductor s13, 2026-11-18)

- Start: main checkout `cabb5bb`, matches the s13 prompt. No vitest/chain running; no `<s9>/vitest.lock`; one
  `%LOCALAPPDATA%\Temp\pokemap-gbc-*` root left (delete before the gate). s13 scratchpad:
  `C:\Users\Serve\AppData\Local\Temp\claude\d93d7db49a2946f0\1a87ccae-990c-4c99-9b8b-c7ccba2eb307\scratchpad\`.
- **E1 ruled (conductor, no user question needed):** spec §Identity "E1 rulings" E1a-E1f, plan "Task E1"
  (`bdbf4d8`). Consumers of the symbol-keyed index checked: `gbaConsumingLayouts` / `gbaBlockUsage` (usage.ts),
  planner `consumingUses` → append limit, `assertStructural`, `gbaCrossHalfWarnings`, `usedElsewhere` (`confirm`):
  all change. `consumingUses` also took the halves from S (`primary: symbol`), so an alias consumer would be judged by
  S's tiles: E1c. Unchanged: `revision` inputs, hub ownership/overlay (canonical path), route cap (already file-keyed,
  `blockEditRoutes.ts:253`), GBC (`tilesetsByPath`). Subject check: metatiles and attributes alias together in every
  header (9× InsideBuilding, 6× SecretBaseSecondary); E1a still takes the union.
- Worktree `<s13>/wt-e1` branch `p14-2-e1` from `bdbf4d8`. Tests hop: `chain.py --tier opus`, brief
  `<s13>/e1-tests-brief.md` (self-contained), verify typecheck only.
- Tests hop: `RESULT done` `gpt-6.2-sol` dead → **`gpt-6.1-sol` done `34f77fa`** (+269/-8: fixture `aliases` opt-in
  adds `gTileset_A2` (A's metatiles+attributes, own 8-tile sheet, layout J frlg / B) and `gTileset_A3` (A's
  attributes only, layout K emerald / B); E1.1-E1.8). Vetted: fixture unchanged with `aliases` false; oracles list
  consumers from `proj.layouts` + `tilesetPaths` and count `u16 & 0x3ff` from disk; E1.4 message from the literal
  limit (layout E, 8); E1.5 tile 9 checked against each sheet's PNG size; E1.8 searches the real subject for a
  shared-file block drawn only through another alias. Red run (`<s13>/e1-red.out`): **10 failed / 81 passed (91)**,
  every failure a missing alias consumer (confirm false, no SPLIT_LIMIT, no warning, symbol-only lists).
- Impl hop: `chain.py --tier opus`, brief `<s13>/e1-impl-brief.md`, verify `<s13>/e1-verify.txt` (typecheck + core
  `blockEdit` dir + 4 server block-edit suites), `--protect` core and server tests.
- Impl hop 1: `gpt-6.1-sol` "no diff" (Codex "Selected model is at capacity", transient). Hop 2 (`TE1-impl2`):
  **`gpt-6.1-sol` done `e3f0799`** (verify failed try 1, passed on retry). +52/-24: usage.ts relations keyed by
  canonical metatiles and attributes files (`pathsBySymbol`, `consumingByMetatiles`, `consumingByAttributes`,
  `gbaConsumingUses` = direct union, de-duped, sorted id then role), `tileset` field, `tilesets` from consumers;
  gbaOps `consumingUses` halves from the layout (E1c). Conductor verify: typecheck pass, core `blockEdit` + 4 server
  block-edit suites **410/410**.
- Reviews (Codex `gpt-6-astra`, `task-e1-spec-review.md`, `task-e1-quality-review.md`): both **Needs changes**.
  Conductor checked each: **I1 real (both reviewers):** the route cap looped every metatiles alias and called the
  now alias-complete `gbaConsumingLayouts` per alias → transitive expansion (A~B by metatiles, B~C by attributes pulls
  C into A's cap). Fixed inline (tiny, 3 lines): cap = min over `gbaConsumingLayouts(project, symbol)` `2d446c4`,
  unused import dropped `70b7173`. Ruling **E1g**: E1a is direct, never transitive; the route-level partial-chain
  regression is pinned at core level (consumer set) because route tests use the real subject, which has no partial
  alias. **m1 real:** E1.8 `common` fallback skips `confirm`. **m2 real:** no layout with two distinct alias slots.
  Fix round 1 tests hop (`<s13>/e1-fix1-tests-brief.md`, `chain.py --tier opus`, typecheck verify).
- Mutants round 1 (`<s13>/mut_e1.py` on `e3f0799` in detached `<s13>/mut-e1`): N1-N10 (symbol key, halves from S
  ×2, metatiles-only set, `tilesets` = [S], confirm / append / structural over own uses, primary slot only, usage
  over own uses).
- Mutants round 1 result (`<s13>/mut_e1.out`): **9 of 10 killed**; **N3 survived** (secondary half from S): no
  fixture alias sat in a secondary slot. Fix round 1 tests hop: **`gpt-6.1-sol` done `5207f0a`** (fixture A4 =
  A3's metatiles + own attributes on layout L; layout M = A primary + A2 secondary; E1a direct-only case, E1b two
  distinct slots (border literal 4 = four zero cells), E1.8 requires an exclusive candidate, Building groups first,
  confirm unconditional). Vetted. Conductor (inline, tiny): E1c case on layout M (tile 9 → `M -> gTileset_A2[1]`,
  never `gTileset_A[1]`) for N3.
- **Trap found (new):** worktree `node_modules` is a junction to the main checkout, and
  `node_modules/@pokemap/core` links to the **main checkout's** `packages/core`. Server suites run in a worktree
  therefore import main's core, not the worktree's. Tell: 11a's B14b ("aliased primary file caps block=0 at the
  all-symbol minimum") failed 640 vs 512 after the route fix, while the worktree core gave 512 via tsx. Earlier
  tasks were server-only or core-only, so no earlier result is affected that a merge gate did not re-check. Fix:
  untracked `vitest.wt.config.ts` in the worktree aliasing `@pokemap/core` / `@pokemap/server` to the worktree's
  packages (`<s13>/e1-verify2.txt`). Carry into later prompts.
- Verify fix round 1 (worktree core aliased, `<s13>/e1-verify2.txt`): typecheck pass, **413/413**.
- Re-reviews (astra): quality **Approved** (I1 and m resolved, no new); spec **Needs changes** (I1, m2 resolved; m1
  partly: E1.8 preferred but did not require the Building group). Conductor fix (inline, tiny, test filter only)
  `0b76ed0`: E1.8 searches only `gTileset_Building*` groups; E1.8 passes on the subject. No third spec pass: a
  one-line test filter that closes the only open Minor (precedent: s12 11b quality).
- Mutants round 2 (`<s13>/mut_e1_r2.out`, on `d1f2fb5`): N2, N3 **killed**. **Task E1 total: 10 of 10 killed.**
- **Merged** `p14-2-e1` (`0b76ed0`) `--no-ff` → **`6c185bf`**. Spec ruling E1g added (direct, not transitive).
- **Gate at `6c185bf`: 4,872 pass / 1 fail / 269 files; typecheck pass, UI build pass; subjects unchanged** (GBA
  `590fdf303`, PerfPlus `81ededbe3`, both clean). Fail: the known `engine.test.ts` env fail ("expected 96 to be
  98"). E1 reports archived to `_archive/` (`task-e1-{spec,quality}-{review,rereview}.md`). **Task E1 done.**
- Handoff s13 → s14 (size rule: E1 was one merge, but Task 12 is a full High UI task and this session's context is
  large). Worktrees `<s13>/wt-e1` (branch `p14-2-e1`, merged; holds untracked `vitest.wt.config.ts`) and
  `<s13>/mut-e1` (detached) can be removed (unlink junctions first). Launch prompt:
  `.superpowers/sdd/2026-11-10-pokemap-plan-14-2-block-editor/s14-launch-prompt.md`.
