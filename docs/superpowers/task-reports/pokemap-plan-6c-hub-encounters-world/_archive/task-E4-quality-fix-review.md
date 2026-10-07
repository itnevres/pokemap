# E4 quality fix-round re-review

Scope `git diff 39edbe2 c890755` (code `f1068f6`, `0206047`, `bcfb9f7`), committed state only. Read-only: no tests run. Rulings honoured: P3-4 and P3-9 skipped; P3-1 bound `Math.max(MAX_ZOOM, zoom)`.

**Verdict: APPROVED.** All findings resolved correctly. 0 x P1, 0 x P2, 3 new P3 (optional, none blocking).

## Per-finding status

- **P1-1 RESOLVED.** `pngCache.clear()` at `index.ts:928`, after the `try { commitSave } catch { return 500 }`, so it runs on success only. It sits before `editSessions.close(name)`, so there is no window where the session bypass has ended and the cache is still stale. Both `pngCache` users (`:342` and `:375`) are covered because the clear is total. No other `pngCache` writer or `delete` exists.
  - Server test: real write to CianwoodCity. It primes both border keys, asserts cache identity, paints and commits (asserts 200), then asserts both keys differ.
  - Restore: `finally { if (!readFileSync(binPath).equals(before)) writeFileSync(binPath, before) }` is read-guarded. `git grep CianwoodCity` over `packages/server/test` and `packages/ui/test` finds only this test, so nothing races it for that layout.
  - Teeth: the implementer reports red before the fix and red with the clear mutated out.
  - Brittleness only: the paint picks metatile 1 or 2 and relies on it rendering differently from the current one. A false pass is impossible; a false red is unlikely.
- **P1-2 RESOLVED.**
  - Removal uses `true`, matching the add (`WorldCanvas.tsx:1493-1494`).
  - Capture runs before the React root listeners and before the menu's bubble `window` listener (`WorldContextMenu.tsx:60`). So `menuOpenRef` (set in render) is still true and the `[aria-modal]` node is still mounted at check time. Both guards are now order-independent.
  - The new test removes the modal from a `document` bubble listener. That sits between React's root listener and a window bubble listener, so it faithfully models the flush. It would be red with the old bubble registration, and it matches the reported mutation.
  - `SwitchConfirmDialog` (`role="alertdialog"`, no `aria-modal`) is safe: it only renders inside `ProjectSwitcher`'s `aria-modal` panel.
  - Text-field selector is right for its purpose: `closest()` also catches descendants of a contenteditable. A `window` target (the `fireEvent` default) is not an `Element`, so it falls through to exit, as intended. See N2 for over-breadth.
  - The `defaultPrevented` test was rewritten to register its capture listener before mount; this is correct, because registration order decides among window capture listeners.
- **P2-1 RESOLVED.**
  - Gate: `hasContextOrigin` is in the deps and the guard, and it is read in the same commit that mounts the chrome. `getBoundingClientRect()` in an effect forces layout, so the box is the post-chrome box.
  - Pointer: client px at all three record sites. The ContextMenu key point is `box.left/top + at`, with a null-safe fallback.
  - Conversion: `client - box.left/top`. Page scroll is a non-issue, since both sides are viewport-relative and the app has no scrolling page. Canvas CSS size versus bitmap size: the existing convention is `clientX - rect.left` in CSS px (the wheel handler does the same), and the fallback uses `clientWidth/Height` (CSS px, not the bitmap), so it is consistent.
  - A late `origin` is correct: the point is fixed in the viewport and the box is read at snap time. The pointer is cleared after read.
  - Tests: moving-rect stubs for dblclick, right-click, ContextMenu key and "waits for origin". Derivations are in the comments and are plausible.
  - Residual nit: if `origin` never arrives and the context exits, `snapPointerRef` is not cleared. Every entry route overwrites it, so it is harmless.
- **P3-1 RESOLVED.** `min(max(MAX_ZOOM, zoom), ...)` never jumps, and wheel-out works from 64 (53.33). A zoom of 16 or less is unchanged. `CONTEXT_MAX_ZOOM` and the `inContext` dep are deleted; `inContext` still feeds the Escape effect. Tests: wheel-in at 64 stays "400%", wheel-out gives "333%", and a leftover 64 after exit survives a wheel-in.
- **P3-2 RESOLVED** (cleared after read; the test shows the next entry falls back to the centre).
- **P3-3 RESOLVED, with one new caveat (N1).** Labels are right: bar `role="group"` plus `aria-label`, Done `aria-label="Done editing <map>"` (the visible text "Done" is inside the name, so label-in-name holds), dim `aria-hidden`. Refocus is placed in the null branch, gated on `snappedForRef.current !== null`: no focus on mount or StrictMode (the ref is null), and none for a canvas that never had a context.
  - SaveDialog: the dirty exit keeps the context, and `onCommitted` closes only the dialog and stays in context. So a context exit never coincides with the dialog, and focus cannot be stolen from it.
- **Spec F1** (App pencil paint through the overlay) has value. It pins `editSession` and `activeTool` pass-through (R5 and R5b were red on mutation), and it asserts the begin/apply/end order plus the pencil body.
- **Spec F2** (re-entry at 4x) has value. It kills the fixed-1x snap mutation.
- **Spec F3** (selection change exits) has value as a defence-in-depth pin, dispatching a click directly to the canvas. The implementer is honest that a real pointer cannot reach it.
- **Spec F4** is covered by the P2-1 tests.

## New findings (all P3)

- **N1 (P3). The refocus can steal focus from a non-Done exit.**
  - Cause: the null branch focuses the canvas whenever a context was snapped. Exits via a keyboard tree select (`selectMap` then `setContextMap(null)`, with the world canvas still mounted) or a mode switch to a mode that keeps `WorldCanvas` (for example dungeon) also take that path.
  - Impact: focus jumps from the tree item or mode button to the canvas, so a keyboard user loses their place.
  - Fix (1 line): refocus only when focus was lost with the unmounting Done button, e.g. `if (snappedForRef.current !== null && (!document.activeElement || document.activeElement === document.body)) canvasRef.current?.focus();`. This also covers the Escape-from-body case. The existing focus test (focus Done, then unmount it) stays green; optionally add a case where a sibling button holds focus and must keep it.
- **N2 (P3). The text-field guard is broader than text entry.** `closest('input, ...')` also skips Escape from checkbox, range and button-type inputs and from a `<select>`. Optional narrowing to `input:not([type=checkbox],[type=radio],[type=range],[type=button],[type=submit])`. A focused palette search also blocks keyboard exit until blur (intended per the P1-2 suggestion; Done still works).
- **N3 (P3). `defaultPrevented` is now nearly vestigial and its docs overstate it.** In the capture phase it sees only earlier capture-phase handlers, and no GBA handler fits that. The comment, the DESIGN line "ignored when another handler took it", and `WorldContextMenu.tsx:56` ("so another Escape listener skips it") all imply bubble semantics. The menu is really handled by `menuOpenRef`. Keep the check (cheap, and the M7 test pins it); reword so it names capture-phase handlers only.
- Non-issue: `WorldCanvas.onCanvasKeyDown` (Escape clears multi-select) now runs after the exit request when the world canvas holds focus. It is harmless: the overlay is up and the selection is cosmetic.

## Hygiene

- No existing test lines removed beyond the Done renames and the two intentionally rewritten Escape and clamp tests (reasons documented).
- DESIGN entry matches the code except for N3's wording.
- Tokens and CSS unchanged. The paint chain is untouched.
