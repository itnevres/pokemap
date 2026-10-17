# Task 4 spec-compliance review (Plan 10a)

Reviewer: spec seat (Opus). Scope: working tree vs 3b72a90 (packages/), read-only.

### Spec Compliance

- ✅ Spec compliant (0 Critical / 0 Important / 4 Minor).
- ⚠️ Cannot verify here (Task 6 owns it): separator rule and EOL for effective text, `nextGbaSignNumber` + map.json union, session-open baselines. See "Task 6 consumption" below.

Checks run:
- Focused run `node node_modules/vitest/vitest.mjs run packages/core/test/signs/gbaSign.test.ts packages/core/test/write/saveScriptReplace.test.ts packages/server/test/editSessions.test.ts packages/core/test/gbc/signs.test.ts`: 4 files, 56 passed, 0 failed. The corpus cases ran and were not skipped (Route101).
- Probe (scratch tsx script, read-only) of `findGbaSign` over every `X:: msgbox Y, MSGBOX_SIGN` script in the real refs:
  - pokeemerald: 211 editable, 11 `script is not a single msgbox sign`, 4 `text label not found in this file`.
  - pokefirered: 218 `text label not found in this file`. FRLG keeps its text in `data/text`, so read-only is the S6-correct result.
  - No real sign is falsely reported as `shared text` under ruling s1.
- Text labels: none of the 232 emerald MSGBOX_SIGN text labels is defined with `::`, so the exact `X:` match in `gbaSign.ts:33` loses nothing.

Requirement-by-requirement:

| Requirement | Evidence | Verdict |
|---|---|---|
| R-c: one `SignBlock`/`SignMode` definition | `gbaSign.ts:2` imports from `signs/marker.ts`; nothing is redefined | ✅ |
| S6 shape: `<label>::` + `msgbox X, MSGBOX_SIGN` + `end` | `gbaSign.ts:23-30` (exactly two code commands; the label must be unique) | ✅ |
| S6 text in the same file | `gbaSign.ts:33-34` -> `text label not found in this file` | ✅ |
| Ruling s1, shared text (GBA) | `gbaSign.ts:36-38`: whole word on any raw line except the definition and the sign's own msgbox. Test `gbaSign.test.ts:39-40` (MSGBOX_DEFAULT, loadword) | ✅ |
| Ruling s1, shared text (GBC) | `gbc/signs.ts:43-45`, same rule. Test `gbc/signs.test.ts:12-14` (jumptextfaceplayer) | ✅ |
| S7 body = `.string` lines through the one ending `$"` | `gbaSign.ts:40-58`. Missing terminator / other command -> refused | ✅ |
| S6 round trip: `\p` paragraph, `\n`/`\l` line, `$` end | `gbaSign.ts:54`, `renderGbaBody` `gbaSign.ts:63-70`. Plan fixture `gbaSign.test.ts:19` is exact; multi-paragraph case `:20-23` | ✅ |
| S3 refuse `"`, `$` (and injection) on output | `gbaSign.ts:66`, test `:76-78` | ✅ |
| S9 script/text shapes + marker `@ pokemap:sign <mode> <hash>` | `gbaSign.ts:77-86`, test `:27-29` | ✅ |
| S9a lowest unused N | `gbaSign.ts:88-96` (scripts.inc only, per the plan signature; see M3) | ✅ |
| R-a baseline / force / hand-edited | `gbaSign.ts:103-104`. Tests `:52-53, :59-60, :65` | ✅ |
| S6 amended: unchanged text keeps body bytes, marker added directly above the text label | `gbaSign.ts:105-109`. Test `:54-55` (odd indentation and trailing comment kept byte-exact); idempotent re-update `:57` | ✅ |
| EOL / final-newline preserved; reuses `replaceLines` (no copy-paste) | `gbaSign.ts:1,106,109`. Test `:68-74` (CRLF, with and without a final newline) | ✅ |
| `ScriptReplace {path, before, after}` | `save.ts:19` | ✅ |
| planSave: one `kind:"text"` change per path, summary `Update sign text in scripts.inc` | `save.ts:174-176`, test `saveScriptReplace.test.ts:43` | ✅ |
| Refusal `script-changed-on-disk` (disk != before; missing too), same shape as the other refusals | `save.ts:128-134`. Tests `:49-55` | ✅ |
| Commit re-validates before any write; writes `after` byte-exact (LF + CRLF) | `commitSave` -> `collectRefusals` before the writes. Tests `:37-47` and `:57-66` (map.json untouched after a late refusal) | ✅ |
| Same-path appends apply on top of `after` | `save.ts:248` comes before the append loop `:255-259`. Test `:68-74` | ✅ |
| S9a/B7: `Snapshot.scriptReplaces`, `snapshotOf`; undo restores the previous array | `editSessions.ts:111,119`. `snapshotCommand` restores every Snapshot key. R-d test `editSessions.test.ts:9-25` (undo, redo, clear) | ✅ |
| Files list / no extras | Only the brief's files, plus the gbc/signs.ts files s1 allows and the R-d server test. No unrelated production edits | ✅ |
| Plan Step 5 mutation | Ledger M1 (on-disk check always passes) KILLED (2), plus M2-M4 | ✅ |

### Task 6 consumption (ruling R-e)

What Task 6 needs is present:
- `findGbaSign` gives `editable`, `reason`, `marker.mode`, `paragraphs` (sign/at `text`), and `body` (session-open baseline via `signHash`).
- `updateGbaSign(..., {force, baselineHash})` covers Update/adopt, Refresh (force + new paragraphs) and Unlink (force + `"free"` + current paragraphs, which keeps the body bytes and re-hashes).
- `gbaSignScript`/`gbaSignText` give the S9 append lines.
- `ScriptReplace` is the single per-path replace R-e describes. The refusal compares against the original-disk `before`, which matches R-e's `{before: disk, after: effective'}`.

The minors below are friction for Task 6, not blockers.

### Strengths

- `findGbaSign` is strict and fails closed: any unrecognised escape, a mid-string `$`, a non-`.string` command or an absent terminator makes the sign read-only. It was validated against real emerald and firered without false shared-text refusals.
- The commit path re-reads the disk before any write and also refuses a missing or unreadable file. The test proves map.json is not written after a late refusal.
- The GBA and GBC update paths mirror each other line for line and share `replaceLines` and the `marker.ts` helpers.

### Issues

#### Critical
None.

#### Important
None.

#### Minor

- **M1, `save.ts:128-134` and `:248`: one replace per path is not enforced.** R-e says one `ScriptReplace` per path, but save.ts does not check it. With two entries for one path:
  - Each entry's `before` must equal the disk, so the entries cannot chain.
  - `planSave` reports one change (it de-duplicates with a Set).
  - `commitSave` writes each `after` in turn, so the last one wins and the earlier edits are silently lost.

  A Task 6 slip would not be caught automatically. Fix: add a refusal for duplicate paths, or have planSave reject them.
- **M2, `save.ts:255-259` (no change in this task): the append separator rule is private.** R-e needs Task 6 to compute the effective text (`after`/disk plus pending appends) the way `commitSave` would. The `sep` rule is inline in `commitSave`, so Task 6 will have to copy it, which the dispatch's "no copy-paste" forbids. Suggest exporting one `applyScriptAppend(text, append)` helper and using it in both places.

  Related, also pre-existing: appends join with LF even in a CRLF `scripts.inc`. Task 6 should join `gbaSignScript`/`gbaSignText` lines with the file's own EOL, per the global EOL constraint.
- **M3, `gbaSign.ts:88-96`: `nextGbaSignNumber` sees only `incText`.** S9a says the lowest unused number across `scripts.inc` and `map.json`, so an orphan bg_event script name must keep its number. The plan signature has no map.json input, so Task 6 must union in the map.json `bg_events[].script` names. Flag this in the Task 6 brief.
- **M4, `gbaSign.ts:103` (mirrors `gbc/signs.ts:122`): the baseline comes from the caller's block.** `block.marker?.hash` is used rather than `current.marker?.hash`, even though the function re-reads `current`. With a stale caller block the result is a safe false "hand-edited" or a check against the stale marker hash. R-a's wording ("marker hash when marked") fits `current` better.

  Also, the `save.ts:225-229` doc comment still lists only "blockdata, border, map.json, scriptAppends" as the non-atomic writes; it should name `scriptReplaces`.

### Assessment

**Task quality:** Approved (spec).

**Reasoning:** Every Task 4 interface, refusal, ordering rule and test in the plan, R-a/R-c/R-d/s1 and S6/S7/S9/S9a is implemented and verified, including against the real corpus. The remaining items are hardening and Task 6 hand-off notes.
