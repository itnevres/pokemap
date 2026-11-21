Needs changes

- **Important — `packages/ui/src/shared/blockEditor/useBlockEditor.ts:155`:** `cancelConfirm()` unconditionally resets the busy ref to `"ready"`, including during apply. With an apply pending, `cancelConfirm(); ok();` starts another check and potentially another apply. The first apply remains valid and can close the editor while the second operation is pending. Ignore cancellation while applying.

- **Important — `packages/ui/src/shared/blockEditor/useBlockEditor.ts:112`:** Apply rebuilds its request from the latest draft instead of the checked draft. Start a deferred check for draft A, call `setDraft(B)`, then resolve A’s check successfully: B is applied without being checked. Likewise, editing while confirming makes `confirm()` apply data the confirmation never covered. Snapshot the checked request or invalidate approval when the draft changes.

- **Important — `packages/ui/test/shared/useBlockEditor.test.tsx:384`:** The busy-guard test flushes a render after the first `ok()` before attempting further actions. A mutant using captured React status instead of the synchronous busy ref can survive. Add same-event `ok(); ok();`, duplicate confirmation, `ok()` while confirming, and cancellation during a deferred apply.

- **Important — `packages/ui/test/shared/useBlockEditor.test.tsx:183`:** Lifecycle coverage exercises only a stale GET after target change. No tests settle pending checks/applies after map, target, or time changes or unmount; removing apply’s generation guards would survive. Preview coverage also never unmounts with a pending timer or reply. Add deferred success/rejection cases asserting no stale apply, callbacks, or preview updates.

Static review only; Vitest was not run.