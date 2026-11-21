Needs changes

1. **Minor — Undefined grid spacing token.** `packages/ui/src/styles.css:3256` uses `--space-12`, but the runtime stylesheet never defines it; it exists only in `DESIGN.md`. Both minimum dimensions consequently become invalid, leaving content-sized rectangular buttons instead of the intended square targets. The size-class test at `packages/ui/test/shared/BlockEditorDialog.test.tsx:150` cannot detect this. **Fix:** express the dimensions using existing tokens, such as `calc(var(--space-6) * 2)`, and verify computed dimensions in the browser.

2. **Important — In-flight modal behavior lacks regression coverage.** `packages/ui/test/shared/BlockEditorDialog.test.tsx:447` exercises ready, confirming, palette-prompt and unrelated-modal Escape, but never holds `blockApply` pending or sends an already-prevented Escape. Removing the applying guard or `defaultPrevented` guard from `BlockEditorDialog.tsx:74` would survive these tests. The suite also never observes disabled OK/Save as new during checking/applying, initial focus, or opener restoration. **Fix:** add deferred check/apply cases and a mounting/unmounting host; assert Escape consumption without closure during apply, ignored prevented Escape, button states, initial focus and restored focus.

3. **Important — Preview rendering is entirely untested.** `packages/ui/test/shared/BlockEditorDialog.test.tsx:70` always resolves previews to `null`. Deleting the preview image at `BlockEditorDialog.tsx:112`, using the wrong source, or rendering an image when no preview exists would not fail this suite. **Fix:** return a non-null preview, await the hook’s debounce, and assert the image’s accessible name and exact source; separately assert its absence for null. Check pixelated scaling in the browser.

4. **Important — Picker tests leave required selection and coordinate behavior unprotected.** At `packages/ui/test/shared/BlockEditorDialog.test.tsx:90`, every image rectangle starts at `(0, 0)`. Tests never deselect an already-selected cell, inspect its selection overlay, trigger image loading to verify 2× natural dimensions, or click outside the sheet’s index range. The GBA sheet URL is checked only for its initial `pal=0`. Omitting rectangle-offset subtraction, removing deselection, or freezing the palette URL would survive. **Fix:** add offset-rectangle, toggle/overlay, out-of-range, natural-size and current-square palette URL cases.

5. **Important — Per-square controls and typed-field boundaries are only partially tested.** `packages/ui/test/shared/BlockEditorDialog.test.tsx:271` tests GBC palette changes exclusively on square 0 with identical initial palettes. At `:309`, only X flip is changed; layer switching never checks preservation of a nonzero current-square index. At `:328`, numeric fallback receives only valid digits. Hardcoding GBC palette edits to square 0, removing the Y-flip handler, resetting the square on layer switches, or accepting invalid numeric text would survive. Empty `Choose...` and edits to `layerType` are also untested. **Fix:** exercise distinct square palettes, nonzero squares on both layers, both flips, layer-type updates, empty selections, and invalid numeric text that remains visible without changing the submitted draft.

6. **Important — Usage and confirmation tests do not protect the complete counting rules.** `packages/ui/test/shared/BlockEditorDialog.test.tsx:431` uses only zero `block0AsBorder` values and does not test exact-map precedence or overlapping affected-map expansion. The confirmation fixture at `:110` has no zero-use entries, and the test at `:346` checks only one list item—not the full list or its summary. Ignoring `block0AsBorder`, displaying zero-use maps, or using `info.usage` for the confirmation summary could survive. **Fix:** use distinct GET/check usage fixtures with border-only, block-0-only and zero-use entries; assert the complete list, exact summary, exact-map precedence and distinct affected-map count.

The rule-by-rule coverage assessment below is static; “covered” means the assertions would detect the relevant behavior changing, not that tests were executed.

| Binding rule | Implementation | Test coverage |
|---|---|---|
| Component signature; hook owns check/apply/preview; GET shapes | Matches; no direct fetch in the view | Both families and session check/apply covered; preview invocation covered, rendering missing |
| Modal classes, labels, `tabIndex`, dimensions and content order | Matches except undefined grid token above | Classes and loaded labels covered; loading label, ordering and computed layout untested |
| Loading-only and error-only states | Matches | Error alert/Close/no OK covered; loading and complete absence of other content untested |
| Block-0 notice | Matches | Exact notice and absence covered |
| Preview | Matches by inspection | Missing; finding 3 |
| Usage line and individual warnings | Matches | Basic counts, sharing, alias fallback, missing own map and one warning covered; finding 6 covers gaps |
| Picker selection, reserved/null cells, hover, sizing and palette URL | Matches | Invalid-cell preservation and both hex formats covered; finding 4 covers gaps |
| Modifier heading | Matches | Ctrl, Ctrl+Shift, GBA fallback, release, blur and status role covered |
| Grid placement through `placeGroup` | Matches, including shown-layer-only tile updates | Plain/2×2/4×4 placement, clipping, null skipping and GBA metadata preservation covered |
| Current square, layer tabs and square controls | Matches | Partial; finding 5 |
| GBC All/Local prompt | Matches; no default scope | All, Local, replacement, Cancel and unchanged pre-choice preview payload covered; nonzero-square behavior missing |
| Block fields, shared `SelectField`, fallback typing | Matches | Rendering, representative numeric/name updates and valid fallback edits covered; finding 5 covers boundaries |
| Message and preserved draft | Matches | STALE check/apply messages and retained draft covered |
| Confirmation section, list, Apply/Cancel, hidden footer | Matches | Apply/Cancel and draft preservation covered; exact list/summary missing; only OK’s disappearance asserted |
| Footer callbacks, ready-only enablement and refusal | Matches | OK and refusal path covered; pending states, footer Cancel and successful Save as new lack direct coverage |
| Focus, Escape and shortcut blocking | Matches specified handlers by inspection | Main bidirectional Tab, prompt forward Tab/autofocus, basic topmost Escape and shortcut blocking covered; finding 2 covers gaps |
| Scope restrictions | Matches | Diff contains only the three view files, stylesheet, tests and `SelectField` export; no hook, session, server, core, adapter or dependency changes |

Every item in the plan’s named 13b test list has a corresponding case, but those cases do not cover every detailed binding requirement.

Reviewed `df34830..0c3243f`. No files edited. Vitest, typecheck, build and live UI checks were not run; `git diff --check` passed.