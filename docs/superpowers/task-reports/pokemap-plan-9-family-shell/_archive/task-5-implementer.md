# Task 5 implementer report (Codex gpt-5.6-terra; orchestrator ported + committed 98aa5ea)
Implemented Task 5; no commit created.

Changed:
- `packages/ui/src/shell/FamilyApp.tsx` — unified shell
- `packages/ui/src/App.tsx` — GBA wrapper
- `packages/ui/src/gbc/GbcApp.tsx` — GBC wrapper
- `packages/ui/src/Root.tsx` — keyed `FamilyApp` + adapter routing
- `packages/ui/test/gbc/Root.test.tsx` — appended supplied regression test

Verification:
- `npm.cmd run typecheck`: passed clean.
- Vitest: blocked before collection. esbuild cannot read the sandboxed worktree ancestor/config path. No test files ran.

Reconciliation:
- `<main>` always has four sibling slots: banners, content, SaveDialog, modals. Both adapters retain their `key="world-host"` world hosts, preserving them through in-context toggles.
- `git diff --check` passed; only `Root.test.tsx` changed under `packages/ui/test`.

Old shell vs FamilyApp differences:
- No behavior differences requiring a FamilyApp or adapter fix. The family-specific policies from old `App.tsx:75-134, 156-180, 293-363` and `GbcApp.tsx:113-245, 287-352` are retained behind the existing runtime adapters: dirty-switch behavior, selection side effects, time controls, manual placements, banners, map reload after save, and world-host rendering.
## Orchestrator verification
- App.tsx, GbcApp.tsx wrappers: identical to brief. FamilyApp.tsx: code identical to brief except (a) <copy> placeholders filled with the App.tsx/GbcApp.tsx comments, (b) JSX for DungeonSidebar, MapTree, the content ternary and SaveDialog compressed onto fewer lines (same props/branches), (c) Codex wrote two ellipses as mojibake 'â€¦' ('Loading map groups…', 'Loading {selected}…'); orchestrator replaced with '…' before commit. No test caught (c): GbcApp.test.tsx:221 matches /Loading map groups/ only.
- Shell tests unedited: npx vitest run packages/ui/test/App packages/ui/test/gbc/GbcApp packages/ui/test/gbc/Root.test.tsx -> 14 files, 143 pass (before and after the ellipsis fix). git diff --stat -- packages/ui/test: only Root.test.tsx +23.
- Full gate: 2721 pass / 0 fail / 173 files; typecheck clean; build ok.
- Behaviour difference noted by Codex (world-visibility error shown regardless of groups load) is the plan's Decision 'World-visibility load error placement follows GBC'.
