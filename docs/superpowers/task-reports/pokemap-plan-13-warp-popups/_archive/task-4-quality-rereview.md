# Task 4 quality re-review (fix bf9ee64), Codex gpt-6-astra

Quality: Needs rework

- **Important - `packages/ui/src/shared/dialogFocus.ts:14-20`: StrictMode replay moves focus outside the open dialog.** Cleanup restores the opener, but effect setup only pushes the entry back. The four secondary dialogs rely on React `autoFocus`, which isn't replayed during StrictMode's layout-effect replay. Opening a switch prompt or SaveDialog therefore leaves focus behind it, breaking keyboard Escape/Tab handling. The real app enables StrictMode; the new tests don't. **Smallest fix:** make focus acquisition replay-safe alongside restoration, and run the focus regressions with StrictMode enabled.

- **Important - `packages/ui/src/shared/dialogFocus.ts:15-20`: Removing an older dialog steals focus from a later dialog.** Cleanup restores focus unconditionally, even when the removed entry isn't the stack's top entry. If dialog A unmounts while B remains open, A focuses its background opener; B's mount autofocus won't run again. The retained `previous` chain supports B's eventual return but doesn't protect its current focus. **Smallest fix:** remove every departing entry, but restore focus only when it owned the top position. Add an out-of-order unmount regression.

The ordinary dismissal and dirty-open paths address I1/M1, and the new regression cases don't manually refocus after dismissal. Stack removal appears balanced; no independent leak finding. Supplied verification evidence accepted; suites not rerun.