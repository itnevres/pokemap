Code and tests written in 8 files:

- `src/shared/useEventOptions.ts`
- `src/shared/useEditSessionCore.ts`
- `src/hooks/useEditSession.ts`
- `src/gbc/hooks/useGbcEditSession.ts`
- `src/components/SaveDialog.tsx`
- `src/shell/FamilyApp.tsx`
- `test/shared/useEventOptions.test.tsx`
- `test/shared/createEvent.test.tsx`

All paths are under `packages/ui/`. Existing tests were untouched.

| Plan requirement | New test name |
|---|---|
| Cache invalidation, both families | `both caches refetch after %s` |
| Create result | `posts once and resolves created` |
| Structured refusal | `rejects a 400 with the server error text and code` |
| Undo/redo/Discard ordering | `%s waits for pending create before its POST` |
| Save ordering | `Save waits for create before loading its plan and sending commit` |
| Switch ordering | `map switch waits for create, then prompts using its new dirty state before discard` |
| Stale success/failure | `delayed success…resolves null…` and `delayed %s…rejects with a stale marker` |

Verification results:

- Encoding audit: **PASS**, 8 files; CRLF preserved, no BOM or suspicious encoding.
- Focused Vitest, UI suite, typecheck, UI build: **NOT RUN**, per sandbox instructions.
- Full gate, mutations, independent reviews and live check: **pending conductor**.
- No commits made. Intended commit message: `feat(plan-14.1): create path, barriers and event options hook`.