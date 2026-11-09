# Plan 14.1 Task 3: scoped re-review, fix round 1

Reviewer: Claude Opus, read-only. Fix commit `0b0ae2d` on `bbeb725`. Subject: `C:/Programming Projects/Pokemon Game/game` (read-only).
I edited only this file. All probe scripts are in the scratchpad `rr3/`, outside the worktree.

## What I ran

- Focused tests: `gbaBuild.test.ts`, `gbaCopy.test.ts` and `gbaOptions.test.ts` gave 3 files and 44/44 passed. I did not run the full suite.
- **Corpus sweep** (`rr3/sweep.mts`). For every `*_EventScript_*::` label in every subject map, I ran `copyGbaScriptBody` and then
  `buildGbaAddEvent` with an **unedited** copy (bg sign). Result: copyOk 10414, the same count the round-1 quality sweep found,
  so the new `;` and `#` refusals cause no corpus regression. buildOk was 10412, with 2 refusals (see N1).
- **Values check** (`rr3/vals.mts`). I evaluated `gbaDefineValues` on the subject `flags.h` and checked the results by hand:
  - The derivation: `MAX_TRAINERS_COUNT` 1408 = 0x580, so `TRAINER_FLAGS_END` = 0x500+0x580-1 = 0xA7F and `SYSTEM_FLAGS` = 0xA80.
    `FLAG_UNUSED_0x91F` = 0xA80+0xBF = 0xB3F, and `DAILY_FLAGS_START` = 0xB3F + (8 - 0xB3F%8 = 7) = 0xB40.
    `FLAGS_COUNT` = `HOENN_FLAGS_END`+1 = 0x1380.
  - The evaluator's output matched every value above. No `FLAG_*` define in flags.h is left unevaluated.
  - There are 77 free flags. The first is `FLAG_UNUSED_0x299`. `0x297` and `0x298` are named non-UNUSED flags. The last is `FLAG_UNUSED_0x91E` = 0xB3E.
  - All 77 free flags lie inside the hidden-item range `[0x1F4, 0x1380)`.
  - All 113 subject `hidden_item` flags lie in range and appear in `options.flags`, so the new existing-flag check refuses no real data.
  - The free vars are unchanged: `VAR_UNUSED_0x40B8` and `0x40BB`.
- **Edge probes** (`rr3/edge.mts`):
  - Evaluator: `0x10u` gives undefined, `0X1F` gives 31, `-(B)` gives -31, `(B*2%5)` gives 2, and a `/* */` comment is stripped. A define that depends on an undefined define is undefined.
  - Grammar: `# ifdef` (with a space) is refused, an unbalanced `#if 0` is accepted, and a `;` inside an `@` comment is accepted.
- **Mutations.** The brief was read-only, so I ran none of my own and instead traced each R2 exclusion against the hand-written fixture
  (gbaOptions.test.ts:107). If the ranges check is dropped, 0x1, 0x3A and 0x4001 enter the list. If the owners check is dropped,
  0x30 enters. If `uses===1` is dropped, 0x32 and 0x33 enter. If the octal guard is dropped, 0x42 (value 42) enters. Each of
  these breaks the exact `toEqual(["FLAG_UNUSED_0x31","FLAG_UNUSED_0x41"])`, so every exclusion is guarded. The conductor's
  mutations and the implementer's 15 named mutations cover the rest.

## Round-1 findings

### Spec review

| Finding | Status | Evidence |
|---|---|---|
| I1 hidden-item flag range (R1) | ADDRESSED | gbaBuild.ts:103-108 `hiddenItemFlag` checks `START <= v < FLAGS_COUNT` against the staged header. New flags: :117-118 takes the first in-range free slot, and :119-123 returns NO_FLAG_SLOT at `include/constants/flags.h`. Existing flags: :132-134 returns BAD_OPTION. Tests at gbaBuild.test.ts:197 and :208. The `.2byte`/u16 bound is not sized to 0xFF. Subject check: 113/113 real hidden items are accepted. |
| I2 aliasing, header-referenced and daily slots (R2) | ADDRESSED | gbaOptions.ts:83-91. A slot must have exactly one occurrence across src/include/data (header included), an evaluable value, a single owner of that value in the header, and lie outside TEMP/DAILY/SPECIAL (FLAG) and TEMP/SPECIAL (VAR). On the subject, `0x296` (alias of `FLAG_SHINY_STARTER_3`), `0x91F` and `0x95F` (named in `DAILY_FLAGS_*`) and all daily flags are excluded. Tests at gbaOptions.test.ts:107, :148 and :160. |
| M1 coord New body test | ADDRESSED | gbaBuild.test.ts:213 pins `lockall/msgbox MSGBOX_DEFAULT/releaseall/end`. |
| M2 `0x0` only for NPC | ADDRESSED (GBA) | gbaBuild.ts:143, test gbaBuild.test.ts:219. The GBC sibling still has the gap; see Deferred. |
| M3 `;` and `\"` escapes | ADDRESSED | gbaCopy.ts:4 `GBA_STRING` handles escapes and is used in gbaCode, DIALOGUE, the ref scan and the builder rename. gbaCopy.ts:50 refuses `;` outside strings. Tests at gbaCopy.test.ts:91 and :98. |
| M4 report wording | ADDRESSED | task-3-report.md "Concerns" now says `.2byte` / u16. |

### Quality review

| Finding | Status | Evidence |
|---|---|---|
| I1 `#define`/`#undef`/`#include` in an edited copy | ADDRESSED | gbaCopy.ts:14 and :48 apply to the source and to the synthetic re-parse. Text bodies holding a directive fail DIALOGUE, and then the count check at gbaBuild.ts:166-168 refuses them. Tests at gbaCopy.test.ts:82 and :87. |
| I2 tests for the text-count and header-word guards | ADDRESSED | gbaCopy.test.ts:103: if the count check is dropped, T is no longer in `preview.texts` and the build succeeds, so the test goes red. gbaBuild.test.ts:226: if the header clause in `taken` is dropped (gbaBuild.ts:56-57), the default `check` misses and the test goes red. |
| M1 default sprite | ADDRESSED | gbaBuild.ts:224, test gbaBuild.test.ts:229. |
| M2 item-ball citation | ADDRESSED | gbaBuild.ts:234 and the test comment. |
| M3 edited text charmap and width | ADDRESSED | gbaBuild.ts:94-101 and :172-175. It introduces N1 below. |
| M4 warp destination | ADDRESSED | gbaBuild.ts:194-204: non-object, missing id and self-warp are handled. Cross-session warps are left for Task 4 with a ponytail note. Test gbaBuild.test.ts:234. |
| M5 dead exports | ADDRESSED | gbaCopy.ts:6 and :9 are no longer exported. The duplicate stripper in gbaSign.ts remains (export dropped, as the finding allowed). |
| M6 test hygiene | ADDRESSED | The warp index uses `map.warpEvents.length`. The new staged-failure test is at gbaBuild.test.ts:246, and its trainer failure comes after `flag()` stages, as required. |
| M7 | Deferred by the conductor. Not re-raised. |

## New breakage introduced by the fix diff

**Critical: none. Important: none.**

**Minor (new):**

- **N1. The width/charmap check refuses unedited copies whose source text uses a control code.**
  - Location: gbaBuild.ts:172. `lineWidths` runs `tokenize` over the **original** texts to set the limit.
  - Cause: the GBA charmap model drops every `FC`-prefixed control token (charmap.ts:131), so `{PAUSE 0x0F}`, `{CLEAR_TO 0x0a}`,
    `{COLOR ...}` and `{PAUSE_UNTIL_PRESS}` are "Unknown token".
  - Corpus impact: 2 of 10414 scripts can no longer be copied at all, even unchanged.
    - `GoldenrodCity_RadioTower_1F_EventScript_LotteryClerk` fails on `{PAUSE 0x0F}`.
    - `Route124_DivingTreasureHuntersHouse_EventScript_ShardTradeBoard` fails on `{CLEAR_TO 0x0a}`.
    - Before the fix, both built.
  - The message names no text, so the user cannot tell that the source is the problem.
  - User impact: the refusal is explicit, so nothing is lost silently. A user also cannot keep a control code from the original in an edited copy.
  - Fix: skip tokens the charmap lacks when measuring the original texts, and in the edited text allow any `{...}` token
    that already occurs in the original. Alternatively, accept FC tokens with width 0.
- **N2. `DEFINING_DIRECTIVE` refuses a spaced conditional.**
  - Location: gbaCopy.ts:14.
  - Cause: `#\s*(?!...)` can backtrack `\s*` to zero width, so `# ifdef X` and `# endif` are refused.
  - The refusal is conservative and no subject script uses the spaced form, as the sweep shows. To fix it, anchor the whole whitespace run: `/^#(?!\s*(?:if|ifdef|ifndef|elif|else|endif)\b)/`.

The define evaluator (`gbaDefineValues`) showed no defects:
- Precedence and unary minus are right, and C and JS agree on `%`.
- Octal, suffixed literals, `/`, shifts, casts, unknown names and cycles all give undefined.
- A cycle cannot poison a non-cyclic name in the memo.
- Function-like macros are never captured by `cDefines`.

## Deferred (out of scope)

- GBC sibling: `0x0` is still accepted for non-NPC kinds (gbcBuild.ts). This needs a conductor ruling, as spec M2 said.
- An edited copy may contain unbalanced `#if`/`#endif` (gbaCopy.ts:14 allows conditionals). cpp fails the build, so the build catches it.
- `gbaDefineValues` ignores `#if` branches: the last define of a name wins, and includes are followed one level, `constants/` only. The subject has no duplicated defines. Projects that do may pick the wrong branch.
- The width limit counts characters, not glyph pixels, and floors at `SIGN_WIDTH` 18. This is a ponytail note already in the code.

All findings addressed: YES
