# Task 16 scoped re-review brief (fix round 1)

You wrote `docs/superpowers/task-reports/pokemap-plan-14-2-block-editor/task-16-final-review.md`. The user chose to
fix I1, F5, m2, F2, F3 now (F4 accepted; the rest to Plan H or accepted, see the ledger's s18 section). Re-review
only those five fixes. Read-only: do not edit source, do not run vitest, do not touch subject repos.

Diffs (from `f0ba2f0`, the reviewed HEAD):
- Hop A (I1 + F5): branch `p14-2-t16a`, worktree
  `C:\Users\Serve\AppData\Local\Temp\claude\8fd0350c313cb955\a8042ec4-382d-4d40-a873-1ad0af6550b9\scratchpad\wt-t16a`.
  `git -C <wt> diff f0ba2f0..HEAD`.
- Hop B (m2, F2, F3): branch `p14-2-t16b`, worktree `...\scratchpad\wt-t16b`. `git -C <wt> diff f0ba2f0..HEAD`.
Briefs the implementers got: `...\scratchpad\t16a-brief.md`, `...\scratchpad\t16b-brief.md`.

Evidence so far (conductor): both typecheck clean. Hop B verify (dialog + block route + ownership tests) 4/4 files
pass. Hop A full `packages/ui packages/server` serial run: 3,201 pass / 1 fail of 3,202; the fail is a timeout in
`server/test/gbcAddEventRoutes.test.ts` (untouched), which also times out on base `f0ba2f0` run alone (machine is
slow after power losses), so not attributed to hop A.

Check:
1. Each fix does what the finding asked, in both families, with a test that fails if the fix is reverted (name the
   test; reason about it, no runs).
2. Regressions: the session reply shape change (new optional counts), the `busyRef` reads, the dialog close guards,
   the F3 route-level prefix (redo path must not double-prefix; `requireTilesetOwnership` text unchanged).
3. Conductor's concerns, judge severity: (a) after a Save-as-new that was then Saved, a later Discard drops session
   state, so the palette falls back to the load-time `data` count (smaller) until reload; (b) when another map
   sharing the tileset appends a block, this map's palette keeps its count until this map gets its own session
   reply (canvas and thumbnails redraw via `tilesetVersion`). Fix now, or Plan H?

Write the report to `docs/superpowers/task-reports/pokemap-plan-14-2-block-editor/task-16-final-rereview.md`:
verdict APPROVE / APPROVE WITH FIXES / REJECT; per item (I1, F5, m2, F2, F3) pass/fail with `file:line`; new
findings ranked with failure scenarios. Return one status line plus the path. Budget: at 60 tool calls stop and write
what you have.
