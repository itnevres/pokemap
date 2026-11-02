# Plan 13 Task 4a brief: shared popup pieces (implementer)

Repo: PokeMap, a React 19 + TypeScript map editor (two engine families, GBA and GBC, sharing one UI). You work in this
git worktree only. Binding docs (read first):
- Plan `docs/superpowers/plans/2026-10-28-pokemap-plan-13-warp-popups.md`, section "Task 4" (Interfaces, bullets on
  `WarpPopup`, `trapDialogFocus`, shortcut ownership) and "Review Focus" 1-2.
- Spec `docs/superpowers/specs/2026-10-28-pokemap-plan-13-warp-popups-design.md`, design item 5.

Task 4 is split. THIS run (4a) builds only the shared pieces below. Do NOT create `shell/useWarpPopup.ts`, do NOT edit
`shell/FamilyApp.tsx`, `shell/adapter.ts`, `shared/useContextEditing.ts` or the family adapters: that is 4b.

## Build
1. `packages/ui/src/shared/dialogFocus.ts`: `trapDialogFocus(event: React.KeyboardEvent<HTMLElement>)`. On Tab /
   Shift+Tab it wraps focus between the first and last focusable control inside `event.currentTarget` (buttons, inputs,
   selects, textareas, `[tabindex]` with tabIndex >= 0, not disabled, not hidden). It acts ONLY when the event target's
   nearest `[aria-modal="true"]` ancestor is `event.currentTarget` itself, so an outer dialog's trap defers to a nested
   dialog (the nested one handles its own Tab). Reference (WIP, to port and fix the nesting rule):
   ```ts
   export function trapDialogFocus(event: KeyboardEvent<HTMLDivElement>) {
     if (event.key !== "Tab") return;
     const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]")]
       .filter((element) => !element.matches(":disabled") && element.tabIndex >= 0 && !element.hidden);
     const first = controls[0]; const last = controls.at(-1);
     if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
     else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
   }
   ```
2. `packages/ui/src/shared/WarpPopup.tsx`: `WarpPopup({ mapName, onClose, children })`. Markup: reuse the existing
   `warp-modal__backdrop` / `warp-modal__panel` / `warp-modal__header` / `warp-modal__title` / `warp-modal__close` /
   `warp-modal__body` classes from `packages/ui/src/components/WarpDestinationModal.tsx` (read it; do not change or
   delete it). Panel: `role="dialog" aria-modal="true" data-warp-popup aria-label={`${mapName} (warp destination)`}`,
   `onKeyDown={trapDialogFocus}`. Close button (`aria-label="Close"`) focused on mount. On unmount, focus returns to the
   element that was focused when the popup mounted, if it is still connected. Escape (keydown on the panel) calls
   `onClose` unless: `e.defaultPrevented`; the target is a text field (use `isTextTarget` from
   `shared/shortcutGuard.ts`); or another `[aria-modal="true"]` element other than this panel exists in the document.
   Backdrop click does NOTHING (no close).
3. `packages/ui/src/shared/shortcutGuard.ts`: `shortcutBlocked(e: KeyboardEvent, owner?: Element | null)`. Blocked when
   `e.defaultPrevented`, a text target, or an `[aria-modal="true"]` element exists that is NOT a warp popup panel
   (`[data-warp-popup]`). Additionally, while a warp popup panel exists, blocked when `owner` is missing or not inside it.
   With no warp popup open the rule must equal today's exactly.
4. Callers pass their own root element as `owner`: `packages/ui/src/components/Toolbar.tsx:71` (tool keys, undo/redo)
   and `packages/ui/src/shared/useFitShortcut.ts:16` (Fit). Grep for any other `shortcutBlocked(` caller and pass its
   root. If a caller has no root element ref yet, add a minimal ref on its existing root element (or accept the root as
   a hook argument for `useFitShortcut` and update its callers). Keep behaviour identical when no popup is open.
5. Attach `onKeyDown={trapDialogFocus}` to the `aria-modal` panels of `components/SaveDialog.tsx`,
   `shared/SwitchPromptDialog.tsx`, `components/PokemonIndicatorDialog.tsx` and `shared/SignEditor.tsx` (~line 83). If a
   panel already has an onKeyDown, call both. Do not change their other behaviour.

## Tests (write first, see them fail, then implement)
New file `packages/ui/test/shared/warpPopup.test.tsx` (create the folder if needed; copy imports/setup style from an
existing UI test such as `packages/ui/test/shell/switchPrompt.test.tsx`). The repo has NO jest-dom: use plain DOM reads
(`document.activeElement`, `getAttribute`, `textContent`, `querySelector`), not `toBeInTheDocument`/`toHaveAttribute`.
- WarpPopup: close button focused on mount; focus returns to the opener on unmount; opener removed meanwhile -> no throw.
- Escape on the panel calls onClose; Escape with `defaultPrevented`, from an `<input>` inside, or while a second
  `aria-modal` dialog is rendered inside it -> onClose not called. Backdrop click -> onClose not called.
- Tab on the last control wraps to the first, Shift+Tab on the first wraps to the last; with a nested `aria-modal`
  panel (also using trapDialogFocus) inside the popup, Tab inside the nested panel wraps within the nested panel only.
- shortcutBlocked: no modal -> false for a plain keydown; any non-popup `aria-modal` -> true; popup open + owner inside
  popup -> false; popup open + owner outside / missing -> true; popup open + a SaveDialog-like `aria-modal` inside it
  -> true; text target -> true.
- Tab cycle on SaveDialog, SwitchPromptDialog and SignEditor panels: Tab on last wraps to first (render each with the
  minimum props; read their prop types; mock fetch if one fetches on mount).
Existing tests must keep passing unchanged. Do not edit any existing test or fixture.

## Verify (you can run these; they are allowed)
- `npx vitest run packages/ui/test/shared/warpPopup.test.tsx` -> all pass.
- `npx vitest run packages/ui` -> 0 failed (baseline 2,014 passed in 123 files; yours adds a file). Takes a few
  minutes. Run vitest from the repo root only, one run at a time.
- `npx tsc --noEmit -p packages/ui/tsconfig.json` -> no errors.

## Rules
- Files use CRLF line endings: keep CRLF in every file you edit or create; added lines <= 140 characters. Prefer small
  edits over rewriting whole files.
- Match surrounding style and comment density; never delete existing comments. ASCII only, no BOM.
- Touch only the files named here (plus strictly needed support files; list them in the report). No new dependencies.
- Do not fix unrelated failing tests or bugs; report them. Never weaken an assertion to make it pass.
- You cannot commit; the conductor commits.

## Report
Write `docs/superpowers/task-reports/pokemap-plan-13-warp-popups/task-4a-report.md` (CRLF, lines <= 140): files
changed, tests added, how each caller got its `owner`, verify output (test counts, tsc), anything unresolved.
