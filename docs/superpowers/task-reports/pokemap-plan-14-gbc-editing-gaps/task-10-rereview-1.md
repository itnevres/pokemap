APPROVED

# Plan 14.1 Task 10: scoped re-review of fix round 1 (`7ce95b5..645131c`)

Reviewer: Claude Opus. Read-only. I read the full source diff and the test diff. For context I also read `gbaBuild.ts` (`slot`, `flag`, the trainer path), `gbaOptions.ts` `unusedSlots`, `addEventRoutes.ts` (`requireHeaderOwnership`, `optionsHandler`, both `mapOptions`, `stagedText`), `editSessions.ts` `snapshotCommand`, `commands.ts`, `useEventOptions.ts`, `useEditSessionCore.ts` `post`, and the redo callers in both workspaces. I did not run vitest, as the brief asked. I treated the implementer notes as claims and checked them against the code.

## Fixed findings

| Finding | Verdict | Where |
|---|---|---|
| I1 (Existing `*_UNUSED_*` then New renames the slot, or the reverse order) | ADDRESSED | `core/src/addEvent/gbaOptions.ts:128` drops `_UNUSED_` names from the flag/var options. Because the builder's `option()` validates against those lists (`gbaBuild.ts:133`; coord var at the coord branch), an Existing UNUSED name is now refused in both orders and across sessions. The backstop is at `gbaBuild.ts:119-122`: `slot()` skips any candidate named in the candidate `map` JSON, the map's staged `scripts.inc`, non-header `scriptReplaces`, or `ctx.stagedTexts`. `server/src/addEventRoutes.ts:182-191` `stagedGbaTexts` supplies every open session's `map`/`jsonEdits`/`insertOps`, its appends, and its replaces, with the define names stripped from headers. Tests cover both orders (server `it.each FLAG/VAR`), own-session sources (core, 6 cases), and other-session sources (server, 6 cases). |
| I2 (other session's unsaved names offered as Existing) | ADDRESSED | `addEventRoutes.ts:127-129` `ownNewNames`. `get(mapName)` merges only the caller's names. The project route calls `projectOptions()` with no argument (`:218`), so no session names appear there. Both builders receive `cache.get(name)` (`:286`, `:353`), so a direct API call naming another session's constant is refused with BAD_OPTION. Map options expose `stagedFlags`/`stagedVars` (`:249-251`, `:321-323`). The UI merges them on every load path, cached or fetched (`ui/src/shared/useEventOptions.ts:65-67`). The raw project object stays in the cache unmerged, so names cannot leak between maps on the client. |
| M1 (redo bypasses header ownership) | ADDRESSED, with a residual noted below | `core/src/edit/commands.ts:60-72` validates a clone before consuming history. The hooks are `server/src/index.ts:968` and `server/src/gbcEditRoutes.ts:370`. `requireStagedHeaderOwnership` (`addEventRoutes.ts:193-201`) covers both GBA headers and the GBC `event_flags.asm`. |
| M2 (GBC destination warp index unchecked) | ADDRESSED | `core/src/addEvent/gbcBuild.ts:167-171` and `addEventRoutes.ts:354-358`. Off-by-one check: GBC indices are 1-based (`mapOptions` emits `n: i + 1`), so with N warps the valid values are 1..N. The code refuses `0` (`:166`) and `> count`, and accepts `count` itself, which is correct. `-1` skips the check. The count comes from the destination's staged text, the same source the `?dest=` dropdown uses (`:332-337`), so the UI and the builder agree. For a self-warp the count excludes the warp being added, so a warp cannot point at itself by index. That matches the dropdown. |
| M3 (GBA trainer flag is the visibility flag) | ADDRESSED | `ui/src/gba/addEventFields.ts:9` is now labelled "Hide flag". The trainer field now uses the full `flag` spec, whose options include `"0"` (`:27`). The default is `flagMode: existing`, `flag: "0"` (`:48`). The builder's trainer path calls `flag(false)` (`gbaBuild.ts:236`), which accepts `"0"`. Default and builder agree: optional, none by default, no slot or header lock consumed. |
| M4 (GBC offers `ObjectEvent` for coord/bg) | ADDRESSED | `ui/src/gbc/addEventFields.ts:10` filters it from the options. `:43` picks the first non-`ObjectEvent` default for non-objects. The server refusal remains as a backstop. |
| Task 1 filename wrapper | ADDRESSED | `core/src/addEvent/entryPoints.ts:54-63` moves the whole iteration inside `inFile`. A `null` root and a non-iterable collection both now report the path. The test covers the uncached and indexed paths. |

M5 was withdrawn by the conductor. M6-M8 and the table items are deferred. I did not re-check them.

## Probes of the areas the brief named

- **Staged-text matching, the slot's own `#define`.** In the builder, the session's own header replaces are excluded from `staged` (`gbaBuild.ts:120`). In `stagedGbaTexts`, the header `after` texts have every define name blanked (`addEventRoutes.ts:188-189`). Without that blanking, the first New flag would put a full `flags.h` into `stagedTexts`, and every later slot would match its own define (NO_FLAG_SLOT on the second allocation). The existing two-creates-one-session tests (`server/test/addEventRoutes.test.ts:269-270`, `:280`) would catch that regression. RHS references survive the blanking (`#define  0x29A`), and none of them name an UNUSED slot. Path matching uses `resolve()` on both sides, so slash style does not matter. No false negatives found: every GBA session field that can carry a symbol reference (`map`, `jsonEdits`, `insertOps`, `scriptAppends`, `scriptReplaces`) is included. The false positives are a slot named in a comment or a string in staged text. That is conservative (the slot is skipped) and harmless.
- **`stagedGbaTexts` cost.** It runs on every GBA create, even when no New flag or var is requested. The work is one `JSON.stringify` per open session (map plus ops, tens of KB each) and, only inside `slot()`, one `RegExp` per (candidate, text) pair until the first free slot. That is negligible at realistic session counts. A ceiling exists, but it is not worth a finding.
- **Redo validate cloning.** Every command in the server is a `snapshotCommand` (`server/src/editSessions.ts:139-145`, `Object.assign(s, next)`). `apply` touches only its argument, so applying to the clone cannot mutate the live session, and a validation throw leaves both the session and the redo stack intact. The core test and both server redo tests assert this. `structuredClone` copies the whole session (blocks included) on every redo. That is a small per-click cost; a shallow spread would do for snapshot commands, but this is not worth a change.
- **UI merge.** Covered under I2. The merge also adds `stagedVars` for GBC, which is always empty there, so it is harmless.
- **GBA trainer default vs the builder.** Covered under M3. They are consistent.

## New issues

### Minor

- **N1. A GBA redo refusal shows a raw HTTP status instead of the ownership reason.**
  - `ui/src/shared/useEditSessionCore.ts:84` reads the error body only when `readServerError` is set (GBC only, `ui/src/gbc/hooks/useGbcEditSession.ts:97`) or the path is `/event/create`. The GBA `useEditSession` (`ui/src/hooks/useEditSession.ts:205`) does not set it.
  - The new 400 from `server/src/index.ts:969` therefore reaches `MapEditingWorkspace.tsx:169` as `POST /api/edit/<map>/redo -> 400`.
  - Scenario: Route101 creates a New flag and undoes. Route102 creates a New flag. The user returns to Route101 and clicks Redo. The banner shows the HTTP status instead of "Route102 has an unsaved new constant in this file; save or undo it there first".
  - Server state is correct; the user just isn't told why.
  - Fix: add `path === "/redo"` to the `structured` condition.
- **N2. Residual of M1: redo after the competing session has saved.**
  - The ownership check only finds unsaved owners. Example: A creates a New flag and undoes. B creates one (same slot) and saves, which closes B's session. A redoes. A's redo passes the check and re-stages a `flags.h` replace whose `before` is stale.
  - The save backstop (`file-changed-on-disk`) still refuses, so nothing wrong is written. The message is still "Reopen the map before saving".
  - This was already the case before the fix. M1 as scoped (the one-owner invariant) is met. Record only.
- **N3. `includes("_UNUSED_")` is broader than the free-slot set.**
  - `gbaOptions.ts:128` also hides UNUSED-named flags/vars that the project already references (use count > 1), and any name with `_UNUSED_` in the middle.
  - A user who wants to share such an already-used flag cannot pick it as Existing.
  - It is conservative and matches the "drop all `*_UNUSED_*`" direction. Record only.

## Mutation evidence

The conductor reports these mutations went red: I1 options (2), I1 slot (7), I2 own names (5), I1 stagedTexts (7), M1 check (4), M2 count (2), and M4 (1). The tests I read match them:
- the core and server unused-refusal tests;
- the own and cross-session slot-skip tests;
- the "belongs only to their own session" tests;
- the redo-ownership tests in both families;
- the GBC warp bound tests at count and count+1;
- the UI field tests.

I ran no mutations of my own, because the brief said not to run vitest. Two areas have no dedicated mutation:
- The header-name blanking in `stagedGbaTexts` is guarded indirectly by the two-creates tests.
- M3 is guarded only by the UI field/default tests.

Neither gap is blocking.

## Counts

0 Critical, 0 Important, 3 Minor (N1 actionable; N2 and N3 record only). Fixed findings: 7 ADDRESSED (M1 with the noted residual).
