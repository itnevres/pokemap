CHANGES REQUESTED

# Plan 14.1 final whole-branch review (Task 10)

Reviewer: Claude Opus (read-only). Range: `git diff 7c68fc19..5d92095 -- packages` (77 files). Read end to end:
`server/src/addEventRoutes.ts`, the GBA/GBC hub wiring (`index.ts`, `gbcEditRoutes.ts`, `gbcRoutes.ts`,
`editSessions.ts`, `gbcEditSessions.ts`, `signRefresh.ts`), core `write/save.ts`, `gbc/write/save.ts`,
`gbc/write/guards.ts`, `addEvent/{gbaBuild,gbcBuild,gbaCopy,gbcCopy,gbaOptions,gbcOptions,entryPoints,names,sources}.ts`,
`gbc/load/constCounter.ts`, `defects/symbols.ts`, UI `useEditSessionCore.ts`, `useEventOptions.ts`, `AddEventDialog.tsx`,
`AddEventBar.tsx`, `MapEditingWorkspace.tsx`, `GbcMapEditing.tsx`, `FamilyApp.tsx`, `SaveDialog.tsx`, both
`addEventFields.ts`, `MapSurface.tsx` diff. Vitest not run, per the brief. I ran two read-only `tsx` probes against the
real GBA subject. They call only the pure builder and option loaders and write nothing. The scripts are in the session
scratchpad `t10/probe.ts` and `t10/probe2.ts`.

What holds up across tasks (verified by reading):
- Build-then-publish. Both `create` paths clone the session, build, re-parse (GBA `parseMap` of the real save candidate;
  GBC `parseMapEvents`), re-check names, and only then `stack.push`. Any throw before the push leaves the session and
  the undo history alone.
- Undo snapshots carry everything a create stages: GBA `newNames`, `scriptAppends`, `scriptReplaces`, `insertOps`,
  `map`; GBC `eventsText`, `events`, `constEdits`, `newNames`. `Object.assign` restores them.
- Plan and commit both use a fresh symbol index (`freshCheck` → `buildGba/GbcSymbolIndex`). Commit re-plans through
  `signPlan`, and `commitSave` / `commitGbcSave` re-run the check before `writeFilesAtomically`.
- `signRefresh.replaceGbaScripts` filters only the map's own `scripts.inc` path, so a staged `flags.h` / `vars.h`
  replace survives the sign refresh at plan.
- Index invalidation runs on commit, in the `finally`, so it also runs after a failed commit.
- Client barriers. Undo/redo (`post`), Discard, the SaveDialog plan load and commit, `resolveNotice`, and the switch
  path (`FamilyApp.guardedLeave`) all wait on `eventCreateBarrier`. Late results are dropped through `ticket.isCurrent`
  / `visit.isCurrent`.

## Critical

None.

## Important

### I1. A GBA "New" flag/var can rename a `FLAG_UNUSED_*` / `VAR_UNUSED_*` that the same session (or another) already references as "Existing". The saved map.json then names a flag that no longer exists.

- **Where:**
  - `core/src/addEvent/gbaOptions.ts:128`: `flags: names("FLAG_")`, `vars: names("VAR_")` include every `*_UNUSED_*` define. The subject offers 148 UNUSED flags in the Existing dropdown.
  - `core/src/addEvent/gbaBuild.ts:132`: Existing accepts any option.
  - `gbaBuild.ts:119`: `slot()` picks the first `ctx.freeFlags` entry that is still `#define`d in the staged header. It never looks at the session's staged `map.json`, its `scriptAppends`, or other sessions.
  - `server/src/addEventRoutes.ts:135`: the free-slot list is computed from disk only and cached until save/discard.
  - `gbaOptions.ts:74-90`: "free" counts disk references only.
- **Failure scenario (single tab, one map):**
  1. On Route101, Add Object (NPC) with Flag = Use existing → `FLAG_UNUSED_0x299`. A common hack habit: "grab an unused flag".
  2. On the same map, Add Object (item ball). The default is Flag = New → `FLAG_..._POKEMAP_OBJECT1`.
  3. `slot()` renames `#define FLAG_UNUSED_0x299` to the new name in the staged `flags.h`. The NPC's staged map.json entry still says `FLAG_UNUSED_0x299`.
  4. Save plans clean and commits. `make` then fails: the generated events reference an undefined `FLAG_UNUSED_0x299`.
  - The reverse order fails the same way: New first, then Existing `FLAG_UNUSED_0x299`, which is still in the cached disk option list.
  - VAR has the same bug: a coord Existing `VAR_UNUSED_0x40B8`, then a coord New var.
  - Cross-session variant: B stages Existing `FLAG_UNUSED_0x299` while A owns the header and renames it.
  - Nothing at plan or commit catches any of these.
- **Verified:** yes. Code read end to end. Probe `t10/probe.ts` on the real subject printed:
  - `first free slot FLAG_UNUSED_0x299 offered as existing: true`
  - `NPC existing flag accepted: FLAG_UNUSED_0x299`
  - item ball New renamed `#define FLAG_UNUSED_0x299 0x299` → `#define FLAG_PROBE_BALL 0x299`
  - `after text still defines FLAG_UNUSED_0x299 : false`
  - `t10/probe2.ts`: `VAR_UNUSED_0x40B8` is both the first free var slot and an Existing option.
- **Fix direction (smallest):** drop the free slots, or all `*_UNUSED_*` names, from the Existing flag/var option lists. Make the builder refuse an Existing name that is a free slot. As a backstop, have `slot()` skip any candidate named in the session's staged map text or `scriptAppends`, and in other sessions' staged text.
- **Missing test:** "Existing `FLAG_UNUSED_x` then New flag in one session never renames x", and the reverse order.

### I2. Project options offer another session's unsaved new flag/var as "Existing", and nothing tracks that cross-session dependency at save.

- **Where:** `server/src/addEventRoutes.ts:138-140`. `get()` merges `newNames` from every open session into `flags` / `vars`. `/api/event-options` has no map context, so it cannot limit this to the caller's own session. The builder then accepts the name (`gbaBuild.ts:132`, `gbcBuild.ts:82`).
- **Failure scenario (two open sessions, e.g. two tabs on one hub):**
  1. Map A adds an NPC with New flag `EVENT_A_FOO` (GBC: staged `constEdits`).
  2. Map B adds an NPC with Existing `EVENT_A_FOO`, which is now in B's dropdown.
  3. B saves first. Its `.asm` references a constant that exists only in A's unsaved `event_flags.asm` edit, so the project no longer builds.
  4. If A then undoes or discards, the reference dangles for good.
  - Plan and commit check only the session's own `newNames`, so no refusal fires.
  - GBA is the same for object/NPC flags and coord vars. GBA hidden items happen to refuse, because `hiddenItemFlag` reads the disk header.
- **Reach:** needs two open sessions with staged constants. In one tab the switch prompt forces Save/Discard of a dirty map first, so this mostly affects multi-client use. The spec explicitly covers "every open edit session".
- **Verified:** by reading `get()`, the builders' `option()` paths, and the save checks. Not probed at runtime.
- **Fix direction:** merge only the requesting map's own `newNames`. Either move them into the map-local options, or have the client pass the map. Or refuse at plan any reference to a name that exists only in another session's staged text.

## Minor

- **M1. Redo bypasses header ownership.**
  - `requireHeaderOwnership` runs only in `create` (`addEventRoutes.ts:250-253, 316-318`). Redo (`index.ts:963-968`, `gbcEditRoutes.ts:366-370`) re-applies a snapshot with a header edit without checking.
  - Scenario:
    1. A: create with a New flag, then undo. A is clean, and its session and redo stay open.
    2. Switch to B, create with a New flag (it takes the same slot), save.
    3. Return to A and redo. A again stages a `flags.h` replace whose `before` is stale.
  - The save backstop holds: `script-changed-on-disk` / `file-changed-on-disk` refuses the stale save, so nothing wrong is written. But the ruling's "one owner" invariant is broken, and the user sees "Reopen the map before saving" instead of the ownership message. Verified by reading.
- **M2. Parity: GBC does not check the destination warp index against the destination's warp count.**
  - `gbcBuild.ts:164` accepts any value from -1 to 255 except 0. GBA checks it (`gbaBuild.ts:209-212`).
  - A stale dialog, or a direct API call, can stage `warp_event x, y, MAP, 7` to a map with 2 warps. In game that warps to garbage coordinates.
  - The UI dropdown hides it in normal use. Verified by reading.
- **M3. GBA trainer "Beaten flag" is really the object's visibility flag.**
  - `ui/src/gba/addEventFields.ts:9` labels it "Beaten flag", and `:48` defaults trainers to New. `gbaBuild.ts:243,257` writes it to `map.json` `flag`, which hides the object when set. The GBA beaten flag comes from the trainer id.
  - Effect: by default every GBA trainer uses up a `FLAG_UNUSED_*` slot and takes the `flags.h` ownership lock for nothing.
  - If the user picks a story flag as "Existing" believing it is the beaten flag, the trainer disappears once that flag is set. GBC is correct (`gbcBuild.ts:200,216`). Verified by reading.
- **M4. Parity: the GBC UI offers `ObjectEvent` for coord/bg scripts.**
  - `ui/src/gbc/addEventFields.ts:10` offers it there. GBA filters `0x0` for non-objects (`ui/src/gba/addEventFields.ts:10`).
  - The server refuses with a clear message (`gbcBuild.ts:104`), so this only costs the user a refusal round trip.
- **M5. Discard throws away disk-derived caches although the disk did not change.**
  - `addEventRoutes.ts:133` resets the entry-point index and the free-slot cache. Discard calls it (`index.ts` discard route, `gbcEditRoutes.ts:416`).
  - The next options load (GBA) pays the full rescan, about 3 s per the L2 measurements, which L2 was meant to avoid. Only the merged project options depend on sessions, and they are recomputed per call anyway. Perf only.
- **M6. The GBC event-gap math ignores counter moves between the last `EVENT_` and `const_next`.**
  - `gbc/load/constCounter.ts:27-33`: `remaining = boundary - last.value - 1` does not count a `const_skip n` or a non-`EVENT_` `const` sitting between them.
  - The insert goes after the last `EVENT_`, so the following skip shifts up. With little room left, `const_next` would then move backwards and the build fails.
  - Not reachable in PerfPlus today: its tail is the last `EVENT_`, a comment, then `const_next 2048`. Verified against the file.
- **M7. The free-slot cache is not refreshed for external edits.**
  - `addEventRoutes.ts:135` caches `freeGbaSlots` (disk reference counts) until save/discard.
  - If a script outside PokeMap starts using `FLAG_UNUSED_0x299` while the hub is open, the next New flag still renames it.
  - The `flags.h` `before` guard does not cover edits to other files. Same root as I1; the I1 backstop fixes both.
- **M8. Tests: none of the new suites assemble the output.**
  - A wrong-but-well-formed write passes every check. I1 is an example: the names are valid, the header text is valid, but the symbol is dangling.
  - Acceptance 6 (`make` on scratch copies, Task 9) is the only backstop. Record its result before closing the plan.

## Deferred minors: dispositions

| Item | Still present? | Disposition |
|---|---|---|
| Task 6 spec M2 / quality M1: placement Escape `stopImmediatePropagation` swallows text-field and context-menu Escape | Yes, `ui/src/shared/AddEventBar.tsx:41-52` | Defer. Only while placing; one extra Esc. |
| Task 6 spec M3: a cancelled Discard confirm still clears placement | Yes, `GbcMapEditing.tsx` `onDiscard`, `MapEditingWorkspace.tsx` Toolbar `onDiscard` | Defer. Harmless and the same in both families. |
| Task 6 spec M4: "after a pan" injected via the `view` prop | Yes, test only | Defer. The hit math is covered. |
| Task 6 quality M3: `onMouseUp` returns early while placing and can strand a stroke or drag | Yes, `canvas/MapSurface.tsx` (`if (placing) return;` in `onMouseUp`) | Defer. Needs keyboard activation in the middle of a drag; mouseleave or a map change recovers. |
| Task 6 quality M4: a kind that becomes disabled during placement does not cancel it | Yes | Defer. The server refuses `OBJECT_CAP` inside the dialog with the reason. |
| Task 6 quality M5: hard-coded 15 | Yes, `GbcMapEditing.tsx` bar and also `gbcBuild.ts:181` | Defer. Trivial; fold into the next touch of either file. |
| Task 6 quality M6: test-hygiene gaps | Yes | Defer. |
| Task 1: malformed events arrays throw outside the filename wrapper | Yes, `entryPoints.ts:55-58` (only `JSON.parse` is inside `inFile`; the iteration, and a `null` root, are not) | **Fix now (cheap, optional).** Every GBA options/create call uses every map.json's references (cached or not), so one bad map.json anywhere blocks Add Event in every map. The message then does not say which file. One-line fix: move the loop inside `inFile`. |
| GBA N2: `# ifdef` refused | Yes. `gbaCopy.ts:90` `^#\s*(?!…)` lets `\s*` backtrack to zero, so the lookahead sees ` ifdef` | Defer. A conservative refusal. Fix with `^#(?!\s*(?:if\|ifdef\|…)\b)` when touched. |
| `gbcCopy.ts` excludes `next` | Yes, `gbcCopy.ts:67-69` (text-block grammar) | Defer. A conservative refusal; nothing unsafe is staged. |
| Task 8: default names may collide with undisclosed data labels | Yes, `ui/src/{gba,gbc}/addEventFields.ts` `taken` sets | Defer. The server refuses `LABEL_TAKEN` before staging and keeps the form. Needs a labels API follow-up. |
