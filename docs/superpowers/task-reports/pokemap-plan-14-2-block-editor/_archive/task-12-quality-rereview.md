Needs changes

- **Resolved — Important**, `packages/ui/test/shared/useEditSessionCore.blockEdit.test.tsx:227`: Two deferred applies now verify undo stays blocked after A settles while B remains pending.
- **Not resolved — Minor**, `packages/ui/test/shared/useEditSessionCore.blockEdit.test.tsx:264,377`: All three failure paths now assert rejection and registry release. However, non-JSON and malformed-success cases omit subsequent undo progress; the non-JSON case also omits unchanged-blocks verification. Network rejection coverage is complete at line 246.

No new issues identified. Static review only; Vitest not run. `git diff --check` passed.