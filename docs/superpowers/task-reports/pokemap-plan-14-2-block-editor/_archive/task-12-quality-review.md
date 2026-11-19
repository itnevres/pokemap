Needs changes

- **Important — `packages/ui/test/shared/useEditSessionCore.blockEdit.test.tsx:39`:** No test starts another mutation while a barrier is already awaiting. Replacing the barrier’s `while` with `if` would still pass these tests, yet allow undo/save to proceed after mutation A settles while mutation B remains pending. Add a two-deferred regression asserting the consumer stays blocked until both settle.

- **Minor — `packages/ui/test/shared/useEditSessionCore.blockEdit.test.tsx:187`:** Failure coverage only exercises a JSON refusal. It does not protect registry release after network rejection, a non-JSON error response, or GBC’s successful-response shape check throwing. Add cases asserting rejection, unchanged state, an empty registry, and subsequent undo progress.

No implementation defect identified in the reviewed diff. Static review only; Vitest was not run.