# Plan 14 ledger (14.1 Add Event, 14.2 Block editor)

Branch `plan-14-gbc-editing-gaps` from master `7c68fc1` (local only).

## Baseline

- Gate at `7c68fc1` (2026-11-02): 3,934 pass / 0 fail / 236 files; typecheck pass, UI build pass; subjects unchanged
  (GBA `26a2e3d1e` + the user's 9 porcelain lines; PerfPlus `81ededbe3` clean; pret `3bc8daa41` clean).

## Decisions (2026-11-02 interview)

- Roadmap D19 (Plan 14 = 14.1 + 14.2, both families), D20 (block editor replaces collision-only editor); new-trainers
  future-plan note. 14.1 spec rulings A1-A8, approved, `1c01653`.
- 14.2 accepted playback (spec pending): Polished-Map Edit Block popup over the map, tile picker + rendered block, GBC
  4x4 + collision dropdowns, GBA 2x2x2 layers + palette/flip + behavior/layer, usage warning, OK = everywhere, Save as
  new block appends an id, pending + undo until Save. Reference: `refs/polished-map` (`8b9bdc2`, cloned 2026-11-02).

- **Naming (user, 2026-11-02, relayed by the master session; binding):** the Plan 14 split is numbered
  **14.1** (Add Event) and **14.2** (Block editor), so it does not collide with roadmap Plans 14A-14C. Files use
  the slug `plan-14-1` / `plan-14-2`.

## Reviews

- 14.1 spec: Codex `gpt-6-astra` builder check + review (12 Important folded in), user approved.
- 14.1 plan: Codex `gpt-6-astra` round 1 (10 Important, 1 Minor), round 2 (1 new Important + partials), round 3 (4 partials), round 4 APPROVED.

## Tasks (14.1)

| # | Tier | State | Hops | Commit |
|---|---|---|---|---|
| 1 | High | done | DeepSeek✗ Nemotron✗ Inkling✗ Dots✗ Codex gpt-6.1-sol✓ | 6c858e6 |
| 2 | High | pending | | |
| 3 | High | pending | | |
| 4 | High | pending | | |
| 5 | High | pending | | |
| 6 | High | pending | | |
| 7 | High | pending | | |
| 8 | High | pending | | |
| 9 | High | pending | | |
| 10 | High | pending | | |

## 14.1 execution (conductor session 2, 2026-11-03)

User go for Task 1: 2026-11-03 (session 2). Baseline gate not re-run: docs-only commits since `7c68fc1` measurement.

Preflight scan (plan vs spec; shared interfaces):

| Pair / task | Produces → consumes | Finding |
|---|---|---|
| T1 → T2/T3 | `EventOptions`, `MapEventOptions`, `FileReplace`, choices, `AddEventRefusal`, `NameCheck` | consistent |
| T1 → T5 | `tileInfo.warpCapable` needs a GBC quarter helper; T1 lists only `gbcWarpCapable` | Ruling: T1 adds a pure quarter helper in `gbcOptions.ts`; T5 calls it — plan's parity test sits in T1 — cost if wrong: helper moves in T5 |
| T2/T3 → T4 | `newNames` on sessions | consistent |
| T4 → T5 | `opts.checkNames` built at call time | consistent |
| T5 → T7 | route paths, `{error, code}` | consistent |
| T6 ↔ T8 | both edit `MapEditingWorkspace.tsx` / `GbcMapEditing.tsx` | sequential, no conflict |
| T1 self | Step 0 snapshot copies GBA text sources for `freeGbaSlots` reference scan | Ruling: snapshot copies text files only (`.c .h .inc .s .json`) — cost if wrong: slower globalSetup |

Hops:
- Task 1: DeepSeek V4.1 Flash (Zen) failed (`provider.free-limit`, no edits) → Nemotron 3 Ultra failed (claimed DONE; conductor verify: globalSetup EISDIR, 10 tsc errors; resume retry hung 5 min with zero output, killed by PID; stash "delegate: nemotron-3-ultra failed T1") → Inkling failed (green + tsc clean, but 8 hollow tests: placeholders asserting `toBeDefined`, length guards, no Route29/bank/parity/warp tests; stash "delegate: inkling failed T1") → Dots3-note failed (`provider.unknown` finish_reason error mid-run; stash "delegate: dots3-note failed T1") → Codex `gpt-6.1-sol` (thread `01a1a3ab-792c-7912-b572-556c8588474b`): 19 tests, tsc clean; conductor run 18/1 (sentinel regex hit real map `MAP_MARINE_CAVE_END`), GBA tests 10-65 s each → same-model retry (fix 1): 20/20 pass, gbaOptions 6.5 s, tsc clean → committed in worktree `84df988` (branch `p14-1-t1`). Conductor mutations M1-M5 all red (data-label, bank rule, VAR ref check, const_skip, parity). Reviews round 1 (astra `gpt-6-astra`): Spec FAIL (4 Important: GBA bgTypes wrong values; items/secret bases include grouping consts; GBC TM/HM missing; scene/callback refs widen entry points; 1 Minor: GBC vars should be []); Quality CHANGES REQUESTED (Important: local label hides data label; backwards `const_next` accepted; TM/HM dup; Minor: parse errors lack file). Conductor spot-checked items.h:522/529, secret_bases.h:26, Route29.asm:13-17, add_tm macro: confirmed.
- Task 1: fix round 1/5 dispatched (Codex sol resume, all 9 findings incl. minors) → `d10662b`: 30/30 pass (gbaOptions 10.4 s), tsc clean, 0 test lines removed, mutations M1-M5 red (M2 anchor re-targeted). Scoped astra re-review running.
- Ruling: `maps` option list comes from the project's real map list and is exempt from the sentinel regex — a real map may end in `_END` — cost if wrong: a sentinel map const could be offered (none exist in map lists)
- Note: globalSetup snapshot measured 50.9 MB GBA + 2.2 MB GBC, 10.3 s per vitest run (Inkling attempt). Cost on every focused run; review should weigh it.

- Task 1: re-review round 1 (astra): all 9 ADDRESSED, no new breakage (`task-1-rereview-1.md`). Deferred minor: `entryPoints.ts:58` valid JSON with malformed event arrays throws outside the filename wrapper.
- Task 1: complete (commits 84df988..250d739, merged `6c858e6`, review clean after fix round 1/5).
- Gate at `6c858e6`: 3,963 pass / 1 fail / 239 files; typecheck pass, UI build pass; subjects unchanged. Failing: `core/test/config/engine.test.ts` "parses the subject repo's real porymap.project.cfg" (expected 0x62 got 0x6E): environmental, not in RESUME/LESSONS flake lists. The subject's `porymap.project.cfg` is gitignored there (`.gitignore:49`) and was rewritten 2026-11-02 21:44 (Porymap reorders `warp_behaviors`); no PokeMap config code changed. Ruling: not a Task 1 regression, does not block — cost if wrong: a real regression hidden (none possible: no diff in `packages/core/src/config`). Follow-up for the user: test pins an order an external tool rewrites.
- Task 2: DeepSeek V4.1 Flash failed (`provider.free-limit` again; 2nd infra fail, skipped for the session) → Nemotron 3 Ultra failed (0 tests collected: wrong import depth, broke existing `save.test.ts` syntax; `--session` resume hung with zero output again, 2nd infra fail, skipped for the session; stash) → Inkling failed (2 red in gbcCopy, 5 tsc errors, gbcBuild 4 tests vs ~12 required; stash) → Dots3-note failed (`provider.unknown` again; 2nd infra, skipped for the session) → Codex `gpt-6.1-sol` done (thread `01a1a3f8-d5b7-7e72-80b4-7b88303e1307`): 47/47 (gbcBuild 21, gbcCopy 6, save 20), tsc clean, only import lines changed in existing tests; committed `60aa650` on `p14-1-t2`. Mutations M1-M3 red (fall-through, object-const check, constEdits outside atomic set). Implementer concern: no charmap in `GbcAddCtx`, conservative alphabet. Astra spec + quality running.
- Task 2 reviews round 1 (astra): Spec FAIL (Important: trainer visibility flag = beaten flag; trailing local label bypasses fall-through; hard-coded charmap; Minor: commit refusal lacks map; weak itemball assert). Quality CHANGES REQUESTED (Important: edited copy drops extra definitions; MACRO blocks vanish before validation; charmap dup; Minor: stale prepared constants entries). Conductor spot-checked Route30.asm:412-414 (trainer objects use -1 / separate visibility flag): confirmed.
- Ruling: `GbcAddCtx` gains REQUIRED `charmap: Charmap` (parseGbcCharmap of the project's constants/charmap.asm), hard-coded alphabet removed; Task 5 supplies it — both reviews flagged it; spec requires the Sign tool's charmap helpers — cost if wrong: one extra ctx field
- Task 2: fix round 1/5 dispatched (Codex sol resume, all 9 findings) → 64/64, tsc clean; but Q4 fix rewrote existing test `preparedSave.test.ts` "writes exactly the prepared buffers on success" (contract from `99ffdab`).
- Task 2: parked — Q4 (commit should compare prepared entries to a fresh prepare) — Ruling: reverted; core contract is "commit writes exactly the prepared buffers" and the GBC hub re-plans and re-prepares at commit (`gbcEditRoutes.ts` signPlan → commitGbcSave), so stale prepared entries never reach commit — cost if wrong: a future direct core caller could commit a removed constants edit
- Lesson candidate: OpenCode `run --standalone --session <id>` hung with zero output twice (T1, T2); resume via a fresh run with the findings instead.

- Ruling: GBC commit refusals now read `save refused: <Map>: <code> (<file>)`; existing assertions in `gbc/write/guards.test.ts` (3) and `save.test.ts` (2) updated to the stricter text — spec: every refusal names map and file; no server/UI code parses the text (grep) — cost if wrong: an external log parser keyed on the old prefix

## Offload log

- Code sweeps: Gemini 503 x3 (high demand) → Nemotron 3.5 Super (ask.py) each time, answers spot-checked.
