# Task 3 coordinator record

- Final code commit: `560735e`. Report commit: `b315462`.
- Reviews:
  - spec review (Opus): COMPLIANT 0/0/4; one survivor, R6;
  - quality review (Sonnet): APPROVED 0/0/11.
  One fix round from the same implementer addressed SR1-SR4 and m1-m5, m7-m11. m6 was skipped at the coordinator's request.
- Accepted deviations:
  - extra numeric validation of object args 4, 5 and 10;
  - exported `eventInsertAnchor` (used by lineIdentity);
  - the E7 literal mutant is equivalent (`>= k+1` already excludes `-1`); its semantic form is red;
  - `scanObjectConsts` now shared from `load/events.ts` (m1), replacing the duplicated rule.
- Independent corpus re-verification (spec reviewer, read-only):
  - 391 maps; 1,564 insert+remove and 1,000 remove+reinsert, all identical;
  - anchors match an independent rule: 1,000 last-call, 564 marker, 1 EOF;
  - 1,562 adds (skips: GoldenrodCity at the 15-object cap, MoveDeletersHouse 1/2);
  - 0 of 1,211 deletable paired object consts are referenced in another file, so the same-file reference-scan ceiling holds today.

## Coordinator mutation re-run on `b315462` (code = `560735e`)

Harness: `mutate.mjs`. The anchor is asserted to match exactly once. SR1's first JSON anchor was mangled by shell escaping; the harness refused it (`ANCHOR x0`), and it was re-run from a JSON file written directly. In-memory restore, byte compare, IDs cross-checked.

| ID | Mutation | Result | Red test |
|---|---|---|---|
| R6 | drop the same-coordinate early return | red | 7b (`$06, 03` no-op) |
| SR1 | a lone `\r` accepted as a terminator | red | lone CR refuses |
| SR3 | `objectConst` on an unpaired map silently ignored | red | 11d |
| E1x | `removeLine` never drops the preceding terminator | red | 2, 3, 17b |

`git status` was clean afterwards.

## Full gate after Task 3 (HEAD `b315462`, 2026-10-07)

- `npm test`: **2,290 pass / 2 fail** (135 files). The 2 failures are the known local-state `world.test.ts` pair.
- Typecheck is clean and the UI build passes.
- External state is unchanged: GBA subject 7 porcelain lines, `world.json` `b285bbf…`, `dungeons.json` `f73f9b7…`; PerfPlus clean, with no `.pokemap`.
