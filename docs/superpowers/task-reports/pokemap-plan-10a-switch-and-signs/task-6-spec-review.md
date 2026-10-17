# Task 6 spec-compliance review (6a GBC 736ae86 + 6b GBA uncommitted)

Reviewer: Opus, read-only. Scope: diff 7aa569e..working tree (packages/), plus the actual source/test files, brief, dispatch rulings, spec S1-S10/B4-B8, plan Review Focus 4, Task 7 (plan 281-304).

Check run: `node node_modules/vitest/vitest.mjs run packages/server/test/signRoutes.test.ts packages/server/test/gbcSignRoutes.test.ts` -> 2 files, 31 passed, 0 failed (15 new GBA + 4 legacy GBA + 12 GBC). Note: the 4 legacy `sign routes` tests in signRoutes.test.ts are pre-existing and write-then-restore the real GBA SUBJECT_ROOT; they passed (restored) in this run. All new cases use temp copies.

### Spec Compliance

- ❌ Issues found: 1 Important (GBC plan/commit failure wire shape differs from GBA and from the brief), 0 Critical.
- ⚠️ Cannot verify from diff: B6 "complex-shape sign opens read-only with its reason (one real example per family)" is not exercised at the route level (sign/at passes `editable`/`reason` straight from findGbaSign/findGbcSign; presumably covered by Task 3/4 core tests). Live B8 is Task 8.

Verified as met:
- Routes, both families, same sub-paths and shapes (R-f): `GET sign/at` -> empty / other(eventKind) / sign{scriptLabel, editable, reason, mode|null, text (lines `\n`, paragraphs `\n\n`), handEdited} — GBA index.ts:1062-1081, GBC gbcEditRoutes.ts:199-210. `POST sign/put` -> session body or 400 `{refusals}` — index.ts:1084-1166, gbcEditRoutes.ts:211-241. `POST sign/resolve` refresh|unlink, one undoable command — index.ts:1110-1116, gbcEditRoutes.ts:242-253.
- Place = event add + block insert in ONE snapshot `"place sign"`; update = `"update sign"`: GBA index.ts:1162-1163 (one snapshotOf covering map, insertOps, scriptAppends, scriptReplaces — editSessions.ts:127-133); GBC stageSign gbcEditRoutes.ts:185-190 (eventsText + events).
- Linked modes ignore `text`: gbaSignParagraphs / gbcSignParagraphs regenerate when mode != free (signRefresh.ts:23-35, 75-86).
- Session-open baselines `Map<scriptLabel, hash>` for editable sign-shaped blocks: editSessions.ts:62-70, gbcEditSessions.ts:46-50; passed as `baselineHash` on update (index.ts:1128, gbcEditRoutes.ts:228); marker hash wins in core (gbaSign.ts:103).
- refresh pure over a copy, deterministic, notice text exact: signRefresh.ts:38-53, 89-108. Plan and commit both call it via one `signPlan` per family (index.ts:192-196, 922-940; gbcEditRoutes.ts:191-195, 314-329) and commit writes `planSave(refreshed.session)`. Equality tests: gbcSignRoutes.test.ts:85-103, signRoutes.test.ts:144-158 (also asserts entry.session unchanged and refresh idempotent).
- R-e: effective text = last replace.after else disk, then appends in commitSave order (signRefresh.ts:56-61 vs save.ts:261-270); update/refresh store ONE ScriptReplace {before: original disk, after} and drop that path's appends (signRefresh.ts:68-73). Test folds pending appends: signRoutes.test.ts:132-142.
- M2: `applyScriptAppend` exported once (save.ts:21-26), used by commitSave (save.ts:268), effectiveGbaScripts (signRefresh.ts:59) and placement (index.ts:1149-1156). No copy.
- EOL: GBA placement joins with file EOL and keeps final-newline state (index.ts:1137-1138); CRLF/LF + absent-final-newline byte fixtures both families (signRoutes.test.ts:107-119, gbcSignRoutes.test.ts:45-60).
- M3: GBA N reserves session `bg_events[].script` names (including pending adds) without changing nextGbaSignNumber (index.ts:1131-1132); test signRoutes.test.ts:174-179 (map-only Sign1 + orphan Text Sign2 -> Sign3). GBC reserves orphan Text labels (gbcEditRoutes.ts:232-235; test :146-151).
- S10 located refusals, no partial write: source/charmap/missing scripts.inc errors become `{refusals}` with subject + message + fix; pending paint is not written when refresh fails (gbcSignRoutes.test.ts:130-145, signRoutes.test.ts:186-197, 225-238).
- B4 (one change after source edit, zero when unchanged), B5 (leave/refresh/unlink, notice, undo restores notice, `hand-edited` refusal on plain Update), B6 (adopt writes only the marker line; paint-only commit leaves file byte-identical), B8-discard, Review Focus 4 (undo after place -> plan empty, next place N=1): all present for both families.
- Scope: 6b touched only the five allowed files; coordinator's 4 gbcEditRoutes.test.ts assertion updates are the plan-mandated `signNotices: []` addition.

### Strengths

- One `signPlan` helper per family makes plan == commit structural rather than test-only; mutation evidence in the ledger confirms both refresh-skip and hash-ignore are killed.
- Every write path works on a session copy and stages only after all core calls succeed (index.ts:1102-1105, gbc stageSign), so a refusal leaves the undo stack and session untouched (tested: "without staging").
- Unlink keeps body bytes because updateGbaSign/updateGbcSign skip the body rewrite when paragraphs are unchanged (gbaSign.ts:105-106), matching S7 "keep the body".
- GBA tests build their own temp copy with a guarded rmSync (signRoutes.test.ts:89-104).

### Issues

#### Critical (Must Fix)

None.

#### Important (Should Fix)

1. GBC plan/commit refusal path does not return the plan wire shape — gbcEditRoutes.ts:316 and :328. When refresh throws (located source/charmap error), GBC returns `signFailure` = HTTP 400 `{ refusals }` with no `changes` and no `signNotices`, for both `GET plan` and `POST commit`. GBA returns `{ changes: [], refusals, signNotices: [] }` (index.ts:927 with 200, :936 with 400). Brief: "Both plan routes ... return `{ changes, refusals, signNotices }`"; dispatch: wire shapes identical across families. Consequence in the shared SaveDialog (packages/ui/src/components/SaveDialog.tsx:63-73, 88-92): `isDiffPlan` requires `changes`, and plan also requires `r.ok`, so on GBC the located refusal (S10) is dropped and the user sees only "Failed to load pending changes (status 400)" / "Failed to save (status 400)". The GBC test (gbcSignRoutes.test.ts:139) only reads `.refusals` and never asserts status or shape, so this is not caught. Fix: in both GBC catches return `{ code: <200 for plan, 400 for commit>, body: { changes: [], ...signFailure(...).body, signNotices: [] } }`, matching GBA; add a shape/status assertion in gbcSignRoutes.test.ts:139-142.

#### Minor (Nice to Have)

1. Refusal `subject` is always the map's scripts.inc (index.ts:186) / `.asm` (gbcEditRoutes.ts:181), even when the failing file is charmap.txt / landmarks.asm / region_map_entries.h. The real file is in `message` (signRefresh.ts:32, 83; linked.ts errors), so it is still located, but `subject` misnames the file S10 asks for.
2. A refresh failure on any linked sign blocks every save of that map, including paint-only (by design per tests :130-145 / :186-197). Also, a GBA map with sign bg_events but no scripts.inc now refuses all saves (signRefresh.ts:94-95; asserted at signRoutes.test.ts:235-237). Defensible under S10 "never a partial write", but it is a new save-blocking condition worth a line in RESUME/spec so it is a recorded decision.
3. GBA EOF hash fragility: the body of a last block with no final newline is hashed without a trailing EOL; only `sign/put` placement re-hashes the preceding clean marked sign (index.ts:1150-1159). The legacy `/sign/add` append (or any other append) after such a sign changes its body bytes and produces a false "edited outside PokeMap" notice later. Rare (files without final newline), visible, not destructive.
4. save.ts:21-26 changed the separator rule (now CRLF-aware) rather than only exporting it; dispatch said "M2 helper export only". The change matches the EOL ruling and is an improvement for CRLF files, but it alters legacy `/sign/add` commit bytes on CRLF scripts.inc and has no CRLF separator test in core/test/write.
5. Brief test list "B6: hash all sign blocks before/after" is met with whole-file equality on maps that hold only unmarked originals; no paint-only commit test with a committed marked linked sign present. The B4 "unchanged data -> zero changes" checks (gbcSignRoutes.test.ts:88, signRoutes.test.ts:146) cover the same property indirectly.
6. No route test for an UNMARKED original sign changed on disk after session open (S6 in-tool baseline -> `handEdited: true`, Update refused). Logic is there (index.ts:1076-1078, gbcEditRoutes.ts:206-209); coverage only exercises marked signs.
7. GBA new test block has no `describe.skipIf(!hasProject(SUBJECT_ROOT))` (signRoutes.test.ts:76), so a machine without the GBA subject fails rather than skips; imports are placed mid-file (:67-73). editSessions.ts:1 and :5 import node:fs twice.
8. index.ts:180-183: edit sessions now re-parse map.json on every open, bypassing Project's map cache. Needed and correct (originalMap now matches originalMapJson after a commit), but it also shows that other `project.map(name)` readers can still serve pre-commit map data after an event/sign commit; pre-existing, not fixed here.
9. Brief names one `refreshLinkedSigns(entry)`; built as `refreshGbaLinkedSigns(proj, entry)` / `refreshGbcLinkedSigns(proj, entry)`. Same contract plus the project; acceptable.

### Task 7 consumability (plan 281-304)

- SignEditor can consume `sign/at` as built: every S1 branch has a field (`kind`, `eventKind`, `editable`, `reason`, `mode`, `text`, `handEdited`). `sign/put` takes `{x,y,mode,text,scriptLabel?,force?}` and returns the session body or 400 `{refusals}` in both families.
- handEdited branch: "Overwrite" = put with `force:true` works. "Free text" must send `force:true` too (or use `sign/resolve` unlink); a plain mode-free put on a hand-edited sign is refused `hand-edited` (gbaSign.ts:104). Task 7 brief should say so.
- S9a "object event on the tile is shown as a note" is not in `sign/at`; Task 7 must take it from the map events it already has.
- SaveDialog notices + Refresh/Unlink -> `sign/resolve` then refetch `plan`: works on GBA. On GBC it works for notices, but refresh/source refusals are lost until Important 1 is fixed. SaveDialog disables Save when `changes` is empty (SaveDialog.tsx:111), so a plan with only notices shows them with nothing to save, which matches S7 ("the notice is the warning").

### Assessment

**Task quality:** Needs fixes

**Reasoning:** Both families implement the routes, baselines, R-e/M2/M3/EOL rulings and the deterministic plan == commit refresh correctly, with strong temp-copy tests. One cross-family wire-shape gap on the GBC plan/commit refusal path breaks S10 surfacing in the shared Save dialog and should be fixed (small change plus a status/shape assertion) before Task 7.
