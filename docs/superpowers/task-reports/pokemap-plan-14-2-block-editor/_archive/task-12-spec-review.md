Needs changes

- **Important — `packages/ui/test/shared/useEditSessionCore.blockEdit.test.tsx:119`:** “a pending block check delays none” exercises only undo, redo, and Discard. It never opens Save, commits, or switches maps while check remains unresolved. A regression blocking those actions would escape the required request-order oracles.
- **Minor — `packages/ui/test/shared/useEditSessionCore.blockEdit.test.tsx:269`:** Registry coverage omits `/paint/*`, and no test checks event-options invalidation for block endpoints. Accidentally registering paint requests (M8) or invalidating options on block requests (M2) would pass these tests.
- **Minor — `packages/ui/test/gbc/useGbcEditSession.test.tsx:179`:** Only successful block application is covered here. M5’s malformed-body rejection and `events === null → false` branches lack blockApply tests; null-map returns for all three new APIs also remain unpinned.

The implementation otherwise matches M1–M9 on inspection: both families use ticketed `apply`; stale-map rejection and structured errors have tests; no await sites were added or moved. Implementation changes touch only the seven allowed files, with no test edits in `c27f3a9`.

Grep found no old-name callers—only negative assertions and stale DESIGN.md prose. The implementation commit message differs from the required message.

Typecheck and diff checks passed. Vitest was not run.