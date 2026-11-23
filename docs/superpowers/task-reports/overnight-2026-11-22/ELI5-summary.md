# Overnight run: calls made for you (ELI5)

## Needs your answer

- **Post the Plan 18 issue drafts?** Plan 18 is about turning good ideas from the HexManiacAdvance editor into GitHub issues. Meanwhile the drafts were written into the plan file and nothing was posted. Tell Claude to post them, or to let you reword them first.
- **PR #40, block 0 cell count.** On a GBC map whose border block is 0, the editor's count of cells is smaller than the plan's rule says. The map still shows up and you still get the confirm step. Meanwhile nothing was changed. Tell Claude to read "Open review findings" in #40 and decide before merging.
- **MCP write tools for a running app.** Built and merged (#46): the write tools refuse to run while PokeMap is open (they check for it, and count a slow answer as "open"), and the guide says to close the app first. Tell Claude if you would rather have writes go through the running app instead.
- **Dependency upgrades.** The `npm audit fix` and vitest upgrade were not run tonight, because they change the shared folder every running session tests with. Tell Claude when to run them, when nothing else is running.
- **Which way to fix the "delete then add" save bug.** Deleting an event and then adding one can leave script edits staged for the deleted event. The choice was left open: tie the script edits to the new event, or refuse the delete. Tell Claude which you want.
- **Optional second opinion from Codex.** Several reviews were done by Claude Opus because Codex was out until Nov 25. Tell Claude if you want Codex to re-check them after it comes back, and compare.

Resolved since the logs were written: PRs #38-#41 were merged on your go; PR #44's hands-on check passed in C2 (#48).

## Calls made (no action needed)

### master

- Work sessions merge their own work into `master` only after the tests pass and reviews find nothing left. This was your "merge everything" request, and the plan batches depend on each other. To undo one merge, run `git revert -m 1 <sha>`.
- Four work streams ran at the same time, each on its own files, plus five spare sessions to wake later. Nothing to undo.
- Sonnet ran the work sessions, free models and Codex did most of the coding, Haiku made small edits, and Opus did only the hardest reviews. This stretches your weekly limit furthest. To undo, change the model per session in the app.
- Every test run, typecheck and UI build now waits in one shared line, because two at once crashed the PC. To undo, delete the `C:\Users\Serve\.claude\locks\` folder.
- Old copies of the `.codex/` and `.agents/` folders in the toolchain worktree were not committed, since `master` has newer ones. They were backed up to `C:\Users\Serve\AppData\Roaming\Claude\side-session-notes\local_ab090e70-3147-461c-ba20-33444ce38857\toolchain-worktree-backup\`.
- Shell scripts are forced to keep Unix line endings through a `.gitattributes` line (PR #35), because Windows line endings break them in WSL. To undo, remove that line.
- While Codex was out, reviews went to Claude Opus or Sonnet instead of waiting. Reviews still happen before anything merges. Nothing to undo.

### h-core

- A layout or tileset with a bad file path is marked as broken with a message and a suggested fix, instead of crashing the app. To undo, remove the `brokenPaths` field and its checks.
- A broken tileset refuses to load and names the bad path, so only maps that use it are affected. To undo, remove the throw in `project.ts` (`getTileset`).
- A path-check helper answers yes or no rather than throwing an error. Nothing to undo.
- The loaders for GBC maps refuse any file path that climbs out of the project folder, and the map is marked broken, but the project still opens. To undo, remove `pathGuard.ts` and its calls.
- Small pieces were written by me, and bigger ones by free models in a separate scratch copy of the project. Reviews by Claude Opus found a few problems, which were fixed (a wrong message for the `.tiles` file, a duplicate entry, a comment in the wrong place). The rest was left for the next plan stage. To undo the fixes, revert the `tilesets.ts` edit.
- A bug in the palette file was fixed by hand, and tests were added for Windows-style path spellings. To undo, revert the commit "fix(core): review fixes".

### h-server

- Asking whether a block edit is allowed for a file owned by another map now returns a clear refusal, and does not show the list of affected maps. To undo, remove the ownership call in the check branch of `blockEditRoutes.ts`.
- The GBC block reply now includes the palette name for each tile, so the dialog can show the right palette. GBA is unchanged. To undo, remove `sheet.tilePalettes` from the server reply and the helper in `BlockEditorDialog.tsx`.
- A Q8 check failed for every free model because the worktree's folder shortcuts pointed to a bad path. The shortcuts were rebuilt, and a real browser check was done on both games and written up on PR #41. To undo, revert commit `7589aa2` and edit the PR text.
- A file upload that is too big gets a plain "too large" reply and stays connected, so the uploader can actually read it. To undo, add back the forced close in `refuseOversize`.
- The render shortcut for live paint strokes stays off until a stroke is saved, so mid-stroke pictures are correct. To undo, remove the stroke check in `index.ts` and `gbcEditRoutes.ts`.
- The GBC pre-warm now also warms maps with no unsaved edits. The result matches the disk, so it is harmless. To undo, give the pre-warm its own check.
- One old test posted a made-up map name that the new rule would always refuse. It now uses the real map Route101. To undo, revert that part of `world.test.ts`.
- Two saving fixes (the "delete then add" bug and reordering) were built on the original file positions. Before, a delete followed by an add could corrupt the saved events. The fix also changes which pending edits the editor refuses. To undo, revert the G2+B3 commit, and the old refusal returns.
- Reordering events was written by hand, since it was small. To undo, revert the B2 commit.
- The reviews also caught a double-move bug, which is fixed. Two other problems were left as follow-ups: deleting a pending add can leave script edits staged, and one command still uses the raw position. Both need a design choice (see the needs-answer list).
- Four changes (A1, A2, H-a and Q3) were put into one pull request with one full test run, to save time. To undo, cherry-pick just the smaller branch.
- The GBC placement endpoint still accepts unknown maps and the `__proto__` name. This was left for later, since it is outside this task. Nothing to undo.

### h-session

- The new "session" read route returns the whole staged session, so a reloaded page shows the unsaved edits and not just an enabled Save button. To undo, return only the flags and drop the client merge.
- With no open session, the route returns the same "nothing open" reply that undo already sends, and it never opens a session itself. To undo, return 404 and teach the client to handle it.
- A free model's work on Q1 was reused after its test mocks broke. I fixed the mocks and re-checked. To undo, revert commit `4fc799e`.
- After a hub restart, the page's tile version number jumps above the highest one it used, so old pictures are refetched. Going down could show stale pictures. To undo, revert `noteTilesetStamp` in `packages/ui/src/shared/tilesetVersion.ts`.
- Reloading a map while edits are unsaved keeps the old objects when nothing changed, so the editor no longer forgets unsaved edits. To undo, drop the `keepUnchanged` calls in `useMapLayout.reload` and `useGbcMap.reload`.
- Small comment and test fixes from a review were applied (commit `ac7cc1f`). To undo, revert that commit.
- The Q6 and Q7 work sits on its own branch, built on top of PR #38. Nothing to undo.

### plan-18

- Drafts were written for the "later" items as well as the "keep" items, since the plan says every keeper gets an issue. To undo, delete drafts C, D and E.
- Editing existing trainers was not made a new issue, since Plan 19 already covers it later. To undo, add a trainer-editing issue.
- Script-body editing was dropped (ruling D28), but editing an existing event's own fields was kept as draft A. To undo, reopen D28.
- Backups were kept as copies outside the project, since the app must not need git. To undo, drop draft B.
- ROM-only features (repoint, patches, Thumb, goto) were rated "drop", since PokeMap edits source and those problems do not exist there. To undo, change the rating in the table.
- The log was saved in the plan folder, because a write rule blocked the main overnight folder. Copy it there if you want it.

### plan-4-bench

- The benchmark measures core-only numbers: how long the world takes to build and how long each map takes to draw against a 60-frames-per-second budget. Browser first paint and smooth-scrolling speed were not measured. To undo, add a browser run later.
- The bench scripts use the worktree's core code, but the CLI timing uses `master`'s core through a folder shortcut. To undo, point the CLI's `@pokemap/core` shortcut at the worktree.
- Only a typecheck ran, not the full test gate, since only new bench files changed. To undo, run the gate.
