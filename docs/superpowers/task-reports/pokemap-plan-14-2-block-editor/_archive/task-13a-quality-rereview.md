Needs changes

- **Resolved — cancellation during apply:** `packages/ui/src/shared/blockEditor/useBlockEditor.ts:157` limits cancellation to checking/confirming. Regression at `packages/ui/test/shared/useBlockEditor.test.tsx:552`.
- **Resolved — D18 snapshot:** `useBlockEditor.ts:132` captures the request and revision; `:114` applies that snapshot. `:165` invalidates checking/confirmation on draft changes while preserving an ongoing apply.
- **Resolved — synchronous guards:** `useBlockEditor.test.tsx:515`, `:525`, `:540`, and `:552` cover duplicate same-tick actions, confirming guards, and cancellation during apply. `:427` covers cancellation without a subsequent check.
- **Not resolved completely — Important, lifecycle coverage:** `useBlockEditor.test.tsx:611–670` adds target-change and apply-unmount coverage, but map/time changes still test only GET replies (`:672`, `:689`). Pending checks after unmount and pending preview replies after unmount remain untested; `:788` covers only the preview timer. Add the remaining deferred lifecycle cases requested previously.

No new Critical/Important/Minor issues found in the fix. Static review; Vitest green per conductor.