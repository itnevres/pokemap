# F2 quality review (Claude Opus, read-only), diff f66b254..38f240b

Verdict: no blockers or important findings; tests mutation-sensitive for the guard itself.

- N1 containment check written out in 3 places (`write/atomic.ts`, `gbc/write/guards.ts:137`, `addEvent/sources.ts:14`) with slightly different semantics; a shared `isWithin(root, abs, {allowRoot})` would stop drift (left).
- N2 (fixed) "before any IO" ordering not pinned; added throwing-io tests in `test/write/atomic.test.ts`.
- N3 (fixed) `rel === ".."` and `isAbsolute(rel)` clauses had no test; added parent-directory, climb and (win32-only) other-drive/UNC cases.
- N4 error text "Refusing to write ..." differs from the "save refused: ..." prefix of other commit refusals (left; F1c/hub may normalise).
- N5 (fixed) doc comment of `writeFilesAtomically` now mentions the root refusal; `commitSave` doc not updated (left).
