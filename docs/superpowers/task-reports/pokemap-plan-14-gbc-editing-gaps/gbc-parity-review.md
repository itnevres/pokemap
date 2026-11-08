- **M2 — ADDRESSED.** `ObjectEvent` is accepted for NPCs and refused for coord/bg scripts. Tests assert the specific refusal; the two authorized substitutions preserve their original checks.
- **M3 — PARTIAL.** Charmap and width checks match GBA’s policy, but reject valid unchanged GBC text.

**Important:** `packages/core/src/addEvent/gbcBuild.ts:75,129` tokenizes assembler source without resolving RGBDS interpolation. Reproduced an unchanged `RadioTower2F/Buena` copy failing `BAD_OPTION` on `{d:BLUE_CARD_POINT_CAP}`. Corpus scanning found this problem in seven PerfPlus scripts and eight vanilla scripts. Even removing interpolation from the edited text cannot help: validation fails on the original first.

**Minor:** `packages/core/src/addEvent/gbcCopy.ts:69` excludes `next`, making the new matcher’s `next` support unreachable. A bounded `text "Hi"` / `next "there"` / `done` block fails `COPY_NOT_SCRIPT`. This is pre-existing, but leaves the implementer brief unmet.

Grammar notes: `@` reaches the new tokenizer and is rejected rather than treated as a terminator. `text_ram`, `text_decimal`, and `text_far` are already refused by the copy parser; they cannot bypass width validation.

Tests are non-vacuous for the four supported commands and width boundaries, but miss interpolation, terminators, and `next`. Read-only probes performed; Vitest not rerun.