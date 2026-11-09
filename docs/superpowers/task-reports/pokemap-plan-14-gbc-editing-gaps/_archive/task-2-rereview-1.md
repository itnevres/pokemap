- **S1 — ADDRESSED:** `packages/core/src/addEvent/gbcBuild.ts:195` emits trainer visibility `-1`; the beaten flag remains in the trainer header at line 179.
- **S2 — ADDRESSED:** `packages/core/src/addEvent/gbcCopy.ts:42` checks the final significant line for an empty local block and refuses `COPY_FALLTHROUGH`. Edited copies use this validation without remapping the error at `gbcBuild.ts:114`.
- **S3/Q2 — ADDRESSED:** `packages/core/src/addEvent/gbcBuild.ts:15` requires `charmap: Charmap`; line 67 passes it to `wrapSign`. The fabricated alphabet is removed.
- **S4 — ADDRESSED:** `packages/core/src/gbc/write/save.ts:185` formats guard refusals as `save refused: <Map>: <code> (<file>)`. Corresponding save and guard assertions include the map.
- **S5 — ADDRESSED:** `packages/core/test/addEvent/gbcBuild.test.ts:56` selects `r.events.objects[r.created.index]` and asserts its type, script target, and flag.
- **Q1 — ADDRESSED:** `packages/core/src/addEvent/gbcBuild.ts:107` rejects extra top-level definitions in edited script/text bodies; line 115 rejects unused text definitions. Candidate constants edits are cloned at line 35, so refusal does not stage changes.
- **Q3 — ADDRESSED:** `packages/core/src/addEvent/gbcCopy.ts:22` detects non-comment content skipped by `codeLines`; calls at lines 34 and 65 cover script and dialogue scopes. Edited copies invoke the same parser.

**NEW Critical/Important breakage in the fix diff:** None found.

Deferred (out of scope): Q4 remains parked under the prepared-buffer contract; the final save diff introduces no behavioral change beyond refusal wording.

No files edited; Vitest not run. Runtime, mutation, and typecheck evidence is conductor-supplied.

All findings addressed: YES