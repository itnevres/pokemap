Needs changes

1. **Minor — Resolved: undefined spacing token.** `packages/ui/src/styles.css:3256` now uses `calc(var(--space-6) * 2)` for both dimensions; `--space-6` is defined at `:129`. All variables referenced by the block-editor rules have stylesheet definitions. Computed browser dimensions remain unverified.

2. **Important — Not resolved completely: modal coverage.** Added tests cover initial focus (`packages/ui/test/shared/BlockEditorDialog.test.tsx:525`), pending-apply Escape consumption (`:532`), already-prevented Escape (`:544`), and disabled actions during checking/applying (`:554`). Confirmation focus transitions also have assertions (`:512`, `:701`). **Opener restoration remains untested:** the mounting helper at `:75` creates no focused opener, and no unmount case asserts restored focus. Removing `useRestoreFocus()` from `packages/ui/src/shared/BlockEditorDialog.tsx:42` would still escape this suite. Add a focused opener, mount/unmount the dialog, await restoration, and assert focus returns to that opener.

3. **Important — Resolved: preview rendering coverage.** `packages/ui/test/shared/BlockEditorDialog.test.tsx:569` asserts the accessible image name, exact PNG source, and absence for null replies. Browser verification of pixelated scaling remains outstanding; the declaration exists at `packages/ui/src/styles.css:3243`.

4. **Important — Resolved: picker coverage.** Tests now assert offset coordinates (`packages/ui/test/shared/BlockEditorDialog.test.tsx:581`), deselection and overlay removal (`:590`), doubled natural dimensions (`:600`), out-of-range preservation (`:610`), and palette-dependent sheet URLs (`:617`).

5. **Important — Resolved: square controls and typed boundaries.** Added cases protect nonzero-square GBC palettes (`packages/ui/test/shared/BlockEditorDialog.test.tsx:628`), preserved square selection across GBA layers (`:617`), Y flip and layer type (`:639`), empty selections (`:655`), and invalid numeric text (`:661`). D25 is implemented using loaded values at `packages/ui/src/shared/BlockEditorDialog.tsx:159`; the known-value typing regression is covered at test `:670`.

6. **Important — Resolved: usage and confirmation counting.** `packages/ui/test/shared/BlockEditorDialog.test.tsx:681` covers block-0 borders, exact-map precedence, duplicate affected-map expansion, and distinct counts. Assertions at `:697` and `:698` protect the complete filtered confirmation list and literal CHECK-derived summary.

No new issues found in the fix diff.

Reviewed `0c3243f..0567a41`. No files edited. `git diff --check` passed. Vitest was not run, as instructed; typecheck, build, and live browser checks were not run.