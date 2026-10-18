# Task 3: GBC Indicator writer and recogniser

Status: Implementation and tests written. Coordinator Vitest/full gate, UI build, and mutation verification pending. No commits or other git writes; subject source was read only.

## Scope and routing

High risk: source writer and external ASM shape boundary. Followed the supplied task brief directly as its assigned implementer, with tests written before production code. Read the delegate skill before the scoped reads and implementation; retained this already-dispatched task in this Codex worker rather than dispatching another worker. Verification command: `npx vitest run packages/core/test/indicator/gbc.test.ts packages/core/test/gbc/write/writeGate.test.ts`. User instructions supersede the brief's commit step: no commit made.

## Files

- Created `packages/core/src/indicator/gbc.ts`: insert, recognise, and update functions with the exact brief interfaces.
- Created `packages/core/test/indicator/gbc.test.ts`: golden insertion, lowest-unused numbering (including comments/strings and real references), cap and paired-const refusals, missing/duplicate anchors, recognition and ownership refusals, canonical layout, species/text updates, no-op, stale script/target, both EOLs, no final newline, text-before-script, preserved cry comments, and invalid input.
- Modified `packages/core/test/gbc/write/writeGate.test.ts`: additive B8 Place/line-diff undo over every corpus map; cap/out-of-step maps assert the existing refusal. Existing gate assertions and pins unchanged. An unterminated final line can gain exactly the required separator when the object is appended; undo removes it, while preserving an untouched unterminated trailing whitespace line. Final-newline state is independently asserted.
- Created six `packages/core/test/fixtures/indicator/gbc-*.asm` files: Route29 source and GEODUDE/SENTRET expected outputs, each in LF and real CRLF.

## Independent fixture derivation

Read the real read-only PerfPlus `maps/Route29.asm`. Trimmed it to the original ROUTE29_YOUNGSTER const, MapScripts header, youngster jumptext/text, original warp, and youngster object line. Removed unrelated events and their paired consts. Retained original spacing, tabs and comments on those lines. Expected files were written as independent literals before implementation, without calling the production writer: append ROUTE29_GEODUDE or ROUTE29_MONSTER after the youngster const; place the seven-command C4 script, blank line and canonical text/done body immediately above Route29_MapEvents; append the literal 13-argument object_event with x=5/y=7, width-two coordinate padding. Species/sprite pairs are GEODUDE/SPRITE_GEODUDE and SENTRET/SPRITE_MONSTER. All fixtures are ASCII. Byte checks confirmed all three CRLF files contain only CRLF and all three LF files contain no CR.

## Shape and update rules

- No actual cry command in the object's script section means null, even if another script has a cry.
- Exactly one script label and the seven C4 commands in order are required; duplicate labels, extra commands, invalid cry/writetext arguments, sprite/cry disagreement, missing/duplicate text labels and real shared text references refuse editing.
- Numbering and ownership scans ignore quoted strings and semicolon comments. Either script or text identifier reserves a number, including references without a definition.
- Text grammar is round-tripped through renderGbcBody and compared line-for-line to the original body with only line terminators removed. Indentation, comments, blank-line placement, command choices and trailing whitespace must match. Noncanonical layout returns exactly `text layout changed outside PokeMap`. Commands after done refuse.
- Updates re-locate the indexed object, verify its script and re-inspect the source. They splice only sprite argument 2, replace the cry line preserving its indentation/comments, and replace the text body only if paragraphs changed. Descending line replacements support either script/text ordering. Labels and object_const_def stay untouched. Identical inputs return identical bytes.
- Insert uses addGbcEvent and the same replaceLines insertion primitive as insertGbcSign. New errors name maps/<Map>.asm and known lines with a fix. Existing addGbcEvent errors are propagated unchanged as explicitly required by the brief.

## Verification evidence

- Initial requested targeted Vitest invocation: blocked by absent worktree node_modules; npx attempted registry access and failed EACCES. This is infrastructure failure, not an observed red test assertion. No package installation or dependency/config edits made.
- TypeScript transpile diagnostics for all three touched TS files: zero syntax errors.
- Core/CLI/test semantic TypeScript check using the main checkout's installed TypeScript/dependencies, read only: zero diagnostics, including after final test edits. This used the repository tsconfig with external dependency resolution; it is not the exact npm typecheck command and does not include UI typecheck.
- Read-only in-memory transpilation smoke: 10 checks passed (four golden outputs, recognition, exact no-op and species-only updates in LF/CRLF).
- Read-only PerfPlus corpus smoke using the real source writer/parser: 389 Place/line-diff undo cases passed, 2 expected guarded refusals, 391 total maps. Every successful placement gained one parsed object, had the exact expected added-line count, preserved final-newline state and restored exact original bytes. No source files were written.
- Fixture ASCII and LF/CRLF byte validation passed for all six files.
- git diff --check passed.

## Open concerns / coordinator actions

- Run the actual new Vitest suite and complete corpus gate, full test suite, normal typecheck and UI build. The smoke checks do not substitute for those gates. No UI code changed, so live UI acceptance belongs to the integration task.
- Run the brief's sprite-agreement and CRLF mutation checks; mutations intentionally left to coordinator.
- updateGbcIndicator has no own-sprite-set parameter by design. It relies on the caller's previously validated IndicatorBlock and supplied sprite choice; its local re-inspection infers the prior own-sprite membership from the current object sprite. The API cannot independently reload/verify the subject sprite table. Likewise the pure writer validates species syntax; subject species existence is the caller's data-layer guard.
- Existing addGbcEvent cap/out-of-step errors retain their original wording, which names the map but does not always provide a maps/<Map>.asm path or line. They were intentionally not wrapped to satisfy the explicit unchanged-refusal requirement.
