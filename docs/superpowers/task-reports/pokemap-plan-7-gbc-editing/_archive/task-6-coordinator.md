# Task 6 coordinator record

- Final code commit: `17ffe91`. Report commit: `cba3e23`.
- NEEDS_CONTEXT on the first pass. An existing test asserted that GBC `paint`/`diff` refuse, which contradicts the spec. The coordinator approved removing exactly those 2 `cases` entries as a named U1 exception (U1 grep = 2).
- **Incident:** mutation C1 (a dry run commits) ran through that old spawned test, which dry-runs against the **real** PerfPlus, and wrote byte 0 of `maps/NewBarkTown.blk` (5 → 1).
  - The implementer detected it via `git status`, restored it by file copy from `git show HEAD:`, and reported it.
  - The coordinator verified `cmp` against `git show HEAD:maps/NewBarkTown.blk`: IDENTICAL, porcelain empty, no `.pokemap`.
  - The leak path was removed with the U1 edit. Every later mutation run checked the PerfPlus porcelain: empty each time.
- Reviews:
  - spec review (Opus): ISSUES 0/1/3. The important finding: the `index.ts` wiring and stderr had no teeth (M10-M13 survived), and bucket/rect x/y swaps survived (M3, M5);
  - quality review (Sonnet): APPROVED 0/2/8.
  One fix round added spawned dry-run/diff/event/stderr tests, non-square off-diagonal rect and bucket index assertions, warnings kept on a `--yes` refusal (appended to the thrown message), help units, a crash-proof `gbaRoot` helper, and a "mirrors `dryRunOrCommit`" comment (GBA `writeCommands.ts` untouched).
- Accepted: the GBA `--help` text for the shared `paint`/`diff` now mentions gbc units; GBA behaviour is unchanged.

## Coordinator mutation re-run on `cba3e23` (code = `17ffe91`)

| ID | Mutation | Result | Red test |
|---|---|---|---|
| M10 | GBC `paint` action passes `yes: true` | red | 12, 13 |
| M11 | `event add` action passes `yes: false` | red | 12 |

PerfPlus porcelain was empty afterwards.

## Full gate after Tasks 4 and 6 (HEAD `cba3e23`, 2026-10-07)

- `npm test`: **2,340 pass / 2 fail** (136 files). The 2 failures are the known local-state `world.test.ts` pair.
- Typecheck is clean and the UI build passes.
- External state is unchanged:
  - GBA subject: 7 porcelain lines, `world.json` `b285bbf…`, `dungeons.json` `f73f9b7…`;
  - PerfPlus: clean, no `.pokemap`.
- No leaked temp corpus copies: the OS temp `pokemap-*` dirs are older small fixtures, none containing `data/maps/attributes.asm`.
