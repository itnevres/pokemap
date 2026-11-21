Approved

All references below are in `packages/ui/test/shared/useEditSessionCore.blockEdit.test.tsx`.

- **Resolved — :276, :291:** Save plan/commit requests and map-switch prompting occur while block check remains unresolved.
- **Resolved — :431, :443:** Pending paint requests remain unregistered; all three block endpoints avoid event-options invalidation, with undo as a positive control.
- **Resolved — :327, :377, :390:** Both families’ null-map returns, GBC malformed-success rejection, and `events === null → false` are covered.

No new issues found in the added cases.

Diff check passed. Tests and typecheck were not run during this read-only re-review. No files edited.