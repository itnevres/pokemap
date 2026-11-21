# Task 8 hop A: tests and typed stubs

## Scope and execution

Risk: **High**. These are independently constructed save-format and external-change oracles at the atomic-save boundary. This hop supplies tests and final typed interfaces only; it does not implement Task 8.

Base: `7219c95e3d2b9610714a25fd043a83d991c2d765`; initial tree reported clean by the conductor. Route: native Codex subagent with explicit `gpt-6.1-sol`, following `delegate`; the conductor's preflight found no free-provider credentials and no Codex CLI. The work spans more than three files and needs iterative tools, so it went directly to native Codex. Budget: 35 minutes, one repair round. Provider token/cost usage is not available. No further agents were dispatched by this implementer.

Only the six authorized paths are changed: the new test, new save stubs, block-edit barrel, the two existing save modules, and this report. Each of the four new helper bodies throws exactly `new Error("not implemented (Task 8)")`. Existing save source changes are restricted to type imports, optional session fields, required plan fields, and the `tilesetEffects: []` return placeholders marked `// Task 8 stub`. There is no new dependency or commit.

## Numbered coverage

The file declares **42 cases**: 11 pure unit cases, 15 common contract cases per engine family, and one additional GBC alias case. This is a static declaration count, not a collected or passing Vitest count.

1. **Merge:** `keeps the first baseline` chains three merges, requiring the first `before` Buffer and latest `after` Buffer. Explicit byte assertions protect all three inputs. Other cases cover prior-only and next-only paths, sorted new arrays, undefined prior, untouched arrays/objects/Buffer contents, retained restored entries, inverse edits back to baseline, and duplicate paths independently inside prior and next with exact `BAD_VALUE` messages.
2. **Baselines:** equal disk bytes accepted; differing bytes refused; missing targets refused; unreadable file targets refused using a directory; restored paths skipped even when different or absent; reversed two-path input reports the alphabetically first mismatch. Refusals require the `BlockEditRefusal` class, `FILE_CHANGED`, repo-relative prefix, and complete S4 message. Pure writers use a fresh `mkdtempSync` directory with `afterEach` removal.
3. **Effects:** both families compare independently scanned map lists and sorted paths; restored edits disappear, and an unused changed path remains with `maps: []`. GBA uses a primary metatiles file and secondary attributes file. The GBC extra case scans map-used tileset consts to find `TilesetCave` and `TilesetDarkCave`, requires their shared `*_metatiles.bin` file and nonempty map sets, and compares the effects with all independently scanned consumers, including both aliases.
4. **Plan changes:** each family paints one existing id and stages two whole files. Plans require an absolute-path grid change followed by path-sorted tileset changes, exact summaries and kinds, independently expected effects, no refusals, and unchanged disk bytes. GBC expressly requires one binary tileset change and one `.asm` text change.
5. **External edit before plan:** planning must not throw and must return the full exact S7 refusal. Every potential target is byte-compared afterward. Preparing after that same external edit must still return exactly one target entry with the owner's original baseline and staged output, preventing an implementation from rereading disk into `before`.
6. **Atomic success:** prepares require the grid entry first and one path-sorted entry per changed tileset, with baseline/staged bytes. Independent raw-byte grid oracles verify final disk output. A real-filesystem `AtomicIo` records every call: all temp writes must precede the first rename, then the rename targets must be exactly the grid and staged tilesets. Session array identity, Buffer identities, and byte values remain intact after success.
7. **Plan -> external edit -> commit:** separate cases in each family use supplied prepared entries and omitted prepared entries. Both build plan and prepare first, then change disk. They require the exact S4 `BlockEditRefusal` and `FILE_CHANGED`. An injected IO that throws on every method must receive zero calls, independently pinning the baseline check ahead of atomic staging. Grid and every staged tileset are byte-compared with their immediately pre-commit bytes; temp files are absent; the session remains intact.
8. **Prepared mismatches:** five cases per family remove, duplicate, or stale the tileset entry; replace `before` with wrong bytes; or set `before` to null. `stale prepared entry` stages a later merge after prepare. All require the exact error naming map and repo-relative path, unchanged target bytes, no temps, and intact session ownership and Buffer objects.
9. **Atomic failure:** the IO throws specifically on the second rename after observing that the grid already has its expected staged bytes. There must be exactly two rename attempts. Every original file is restored, no temp remains, and session array/Buffer identities and byte snapshots are unchanged.
10. **Restored edit:** a changed and restored edit coexist while the restored file differs on disk. The restored path must appear in neither changes, effects nor prepared entries, cannot trigger a baseline refusal, and must remain byte-identical to its external bytes through a successful commit. The changed file and grid still save, and the full session remains intact.
11. **Absent/empty session field:** the independently expected painted-grid path is the sole prepared path and has independently patched output bytes. Effects are `[]`; refusals are empty. Explicit `tilesetEdits: []` gives the same plan and prepared entries as absence, without writes.
12. **Fingerprint:** two session states differ only in one tileset edit's `after` Buffer. Prepared paths and all baselines stay equal, grid output stays equal, and the fingerprints must differ. No production helper builds the expected tileset output or grid bytes.

## Oracle decisions and review adjustments

- **S1** says the disk target is `resolve(root, edit.path)`. Tests compare normalized existing grid paths with `resolve` because existing GBC grid paths use forward slashes while Windows `resolve` uses backslashes. Tileset entry paths and pending paths are asserted as the exact S1 absolute target.
- **S2** says a restored edit "stays in the session" and has "no baseline check". Restored test buffers are equal in bytes but separately allocated, so reference equality cannot substitute for `.equals`. A stale restored file is intentionally accepted.
- **S4** includes "missing/unreadable". The ruling is silent on how to simulate unreadability; a directory at a file target is used because permission-bit fixtures can remain readable under elevated runners and on Windows.
- **S5** defines every consuming map, even if a grid never uses a particular block. Expected maps therefore scan map-to-tileset-to-file relations directly, without `usage.ts`, `gbcTilesetsForFile`, or save helpers. An unused changed path tests the explicit `maps: []` rule. The Cave assertion requires both named aliases but permits additional aliases found by the independent scan.
- **S8** says `before` is "the session's baseline, not a fresh disk read". Independent review identified that a drifted-disk prepare assertion was needed to distinguish those implementations; it was added to case 5.
- **S9** requires `checkTilesetBaselines` after entry validation and before atomic IO, and `BlockEditRefusal("FILE_CHANGED")` escapes as is. Case 7 asserts its exact class/code and zero IO so an atomic writer's generic error cannot accidentally satisfy the baseline mutation test. GBC's existing constants behavior is left untouched.
- Fixtures register cleanup immediately after copy. GBA uses `copyGbaTilesetProject`/`removeGbaTemp`; GBC uses `copyGbcSubjectToTemp`/`removeTemp`. GBA's candidate scan stops lazily at the first valid paintable map, uses existing ids, excludes warp cells, and fails loudly if absent. GBC requires Route29 and an existing in-range id. All corpus cases use the required `itWithCorpus`/`itWithGbcCorpus` wrappers and 120-second timeouts.
- Conductor review adjustments also fixed the Windows path-kind filter and strengthened overlapping-merge input-byte assertions. The first/second/third merge input objects are frozen to detect property-reference mutation as well as Buffer-content mutation. The conductor reports an independent quality-review PASS and independent typecheck PASS; full independent reviews will be appended after this implementer relinquishes sole ownership. No tests or shared fixtures outside the authorized new file were changed.

## Verification and remaining conductor work

`npm run typecheck` initially hit PowerShell's disabled-script policy for `npm.ps1`. The same npm script was then invoked using the Windows command shim:

```text
npm.cmd run typecheck
> tsc --noEmit -p tsconfig.base.json && tsc --noEmit -p packages/ui/tsconfig.json
PASS (exit 0)
```

`git diff --check`: PASS; Git only emitted LF-to-CRLF normalization warnings. Source scope inspection confirms no implementation beyond the authorized stubs and type placeholders.

Per the user's explicit instructions, **no Vitest, `npm test`, full gate, UI build, live UI check, or mutation run was executed in this hop**. The conductor must run the red check, then implement and verify the green suite and mutations. This report claims typecheck and static oracle coverage only, not runtime fixture success or a completed Task 8 implementation.

Mutation targets: skipping the commit baseline re-check is caught by both `plan -> external edit -> commit` variants; skipping the prepared-entry match is caught by `stale prepared entry` (and missing/duplicate/wrong-before/null-before cases); keeping the latest merge baseline is caught by `keeps the first baseline`.

## Independent review evidence

Two separate read-only reviews used explicit `gpt-6-astra` models with high reasoning, eight-minute budgets and one attempt each. Opus is not exposed by this runtime; native OpenAI reviewers supplied the high-risk review route. The user's restriction to six writable paths takes precedence over separate reviewer report paths: their reports are preserved below in this sole authorized report. Runtime implementation and mutation reviews remain pending, so this tests-hop report remains at the requested path rather than being archived.

### Spec review, initial findings and final resolution

The reviewer independently read the Task 8 plan, Global Constraints, new tests and stubs, existing save implementations, guards, atomic writer, project methods, corpus-copy helpers, and relevant prepared-save tests.

The Windows path issue is resolved: the GBC kind assertion now normalizes `change.path` before excluding the grid. Existing GBC save code uses forward-slash concatenation, whereas `resolve` produces Windows separators, so that normalization is necessary.

An intermediate draft did not verify overlapping incoming merge objects remained unchanged. A merge assigning `nextEdit.before = priorEdit.before` could otherwise violate S3 while passing disjoint-path immutability assertions. Final recheck: the first-baseline test freezes all three overlapping input objects and checks every original `before`/`after` value after merging. This catches input-field replacement and Buffer-content mutation, closing the S3 purity gap. All findings are resolved; no remaining actionable spec findings.

The remaining requirements were represented correctly:

- Cases 1-2 cover first-baseline retention through three merges, sorted results, retained restored edits, duplicate-path refusal, baseline mismatch/missing/unreadable files, restored-path skipping, and deterministic first refusal.
- Cases 3-5 derive map expectations through independent project scans. GBA covers primary metatiles and secondary attributes. GBC verifies both Cave/DarkCave consumers while permitting other genuine aliases. Planning checks exact summaries, absolute paths, binary/text kinds, effects, refusal objects, and unchanged disk bytes.
- Cases 6-9 check independent grid bytes, complete ordered preparation, session-owned baseline bytes even after external edits, staging before renames, missing/duplicate/stale/wrong/null prepared baselines, and rollback after the second rename fails.
- Case 7's injected IO trap ensures skipping the explicit baseline recheck cannot accidentally pass through the atomic writer's later mismatch refusal: the assertion requires `BlockEditRefusal("FILE_CHANGED")` and zero atomic IO calls.
- Cases 10-12 cover restored-path exclusion despite external changes, absent/empty compatibility, and fingerprint sensitivity to tileset output bytes. Session array and Buffer identities are checked on successful and failed commits.
- All new writes target temporary copies or temporary unit directories, with registered cleanup. Expected grid bytes are patched independently rather than generated by the production writer.
- Source changes remain within the authorized stub surface: four exact throwing bodies, the export, type additions, and empty-effects placeholders. No implementation was introduced.

The three named mutation targets have direct assertions: first-baseline identity, stale prepared-entry refusal, and explicit pre-writer `FILE_CHANGED`. This reviewer performed no Vitest, npm test, typecheck, commits, or file writes. Runtime red/green and mutation results remain for the conductor.

### Quality review: PASS

Reviewed the complete new test file, permitted source diff and throwing stubs, both save funnels and guards, atomic writer, binary encoders, project APIs, canonical-path helper, usage relations, corpus-copy/cleanup helpers, and relevant existing prepared-save tests. Also checked the configured PerfPlus source read-only to confirm Route29's tileset and the Cave/DarkCave file alias.

The Windows path issue is fixed: the GBC kind assertion normalizes the existing grid path before excluding it. Confirmed the draft includes prepare-after-external-edit baseline assertions, lazy GBA fixture selection, overlap-input immutability assertions, and alias expectations permitting additional genuine consumers.

Oracle assessment:

- Grid expectations independently patch original raw bytes, preserving unrelated bits and tail bytes.
- Expected map sets come from project map/tileset scans, without calling usage or save-effects helpers.
- Baseline-race tests require the specific escaping `BlockEditRefusal` and prevent injected atomic I/O, so skipping the commit baseline check cannot pass merely because the atomic writer subsequently refuses.
- Prepared-entry cases check exact refusal wording, map/path identity, unchanged target bytes, session references, and temporary-file cleanup.
- Successful atomic saves observe every temporary write before renames; rollback confirms the grid was written before the injected second-rename failure.
- Session snapshots compare copied bytes and original Buffer/array identities, covering success and failure.
- Fixture discovery fails explicitly when required maps or aliases are unavailable. All writes target disposable copies or dedicated temporary directories, registered for cleanup before subsequent fixture construction.
- Source changes remain within the typed-stub boundary: four exact throwing bodies, barrel export, session/plan fields, and empty-effects placeholders.

No remaining blocking quality findings. This was a static review: the reviewer did not run Vitest, npm test, typecheck, or mutations, and made no edits or commits. Runtime red-check and mutation evidence remain with the conductor. The primary independently ran `npm.cmd run typecheck` successfully (exit 0); the implementer subsequently confirmed it again after freezing the final three input objects.
