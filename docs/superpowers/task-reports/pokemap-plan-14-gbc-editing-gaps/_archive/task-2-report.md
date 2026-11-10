# Plan 14.1 Task 2 implementer report

Status: DONE_WITH_CONCERNS under the conductor's sandbox override. Typecheck
passes and every Step 1 case has a dedicated test. No Vitest, mutations, git
commands, commits, sub-agents, SDD loop, or independent/self-review pass ran.

Tier: High, because this task parses and emits assembly and extends an atomic
save boundary. Direct implementation is required by this specific implementer
brief; its no-delegation rule overrides the repository's delegation workflow.
The delegate and Ponytail guidance was read and used for scope and reuse.

## Files changed

- Created `packages/core/src/addEvent/gbcBuild.ts`: pure candidate builder,
  generated scripts and dialogue, constants staging, defaults and refusals.
- Created `packages/core/src/addEvent/gbcCopy.ts`: bounded same-file script and
  dialogue preview with local-target and fall-through checks.
- Modified `packages/core/src/gbc/write/save.ts`: optional `constEdits` session
  metadata; plan summaries; constants included in the same atomic entries;
  prepared saves must contain the matching constants before/after bytes.
- Modified `packages/core/src/gbc/write/guards.ts`: constants disk baseline,
  duplicate/reserved targets, and paths escaping the project are refused.
- Created `packages/core/test/addEvent/gbcBuild.test.ts`.
- Created `packages/core/test/addEvent/gbcCopy.test.ts`.
- Extended `packages/core/test/gbc/write/save.test.ts`, adding cases only.
- Created this report. No other support files or source files were changed.

Builder and copy tests use private subject copies through
`copyGbcSubjectToTemp`. The four new save tests each make their own subject copy
and operate on Route29 plus its event_flags file. Existing tests/fixtures were
not weakened or removed. Existing save/guards/save-test files retain CRLF; new
source/test files use ASCII, LF, and no BOM.

## Exported API

New exports:

```ts
type GbcAddCtx = {
  options: EventOptions;
  mapOptions: MapEventOptions;
  mapConsts: Set<string>;
  eventFlagsDisk: string;
  constEdits: FileReplace[];
  check: NameCheck;
};

function defaultGbcLabel(
  mapName: string, kind: EventKind, check: NameCheck
): string;

function buildGbcAddEvent(
  text: string, mapName: string, form: AddEventForm, ctx: GbcAddCtx
): {
  text: string;
  events: GbcMapEvents;
  constEdits: FileReplace[];
  newNames: string[];
  created: { kind: EventKind; index: number };
};

function copyGbcScriptBody(text: string, label: string): CopyPreview;
```

Changed existing interface: `GbcEditSession` gains
`constEdits?: FileReplace[]`; all its existing fields are unchanged.
`GbcSavePlan` remains `{ session: GbcEditSession; changes: PendingChange[];
refusals: Refusal[] }`.

Existing exported function signatures in the modified save/guards modules are
unchanged:

```ts
function openGbcEditSession(proj: GbcProject, mapName: string): GbcEditSession;
function planGbcSave(proj: GbcProject, session: GbcEditSession): GbcSavePlan;
function prepareGbcSave(proj: GbcProject, session: GbcEditSession): AtomicEntry[];
function commitGbcSave(
  proj: GbcProject, plan: GbcSavePlan, prepared?: AtomicEntry[], io?: AtomicIo
): void;
function blkFilePath(
  proj: Pick<GbcProject, "root">, layout: Pick<Layout, "blkPath">
): string;
function eventsFilePath(proj: Pick<GbcProject, "root">, mapName: string): string;
function changedBlockIndices(original: Block[], current: Block[]): number[];
function guardGbcSave(proj: GbcProject, session: GbcEditSession): Refusal[];
```

The three path/diff helpers remain re-exported by save.ts.

## Tests written

`gbcBuild.test.ts`:

1. `npc new`
2. `itemball`
3. `trainer existing`
4. `bg item`
5. `bg ifset`
6. `coord`
7. `coord scene -1 accepted`
8. `NO_SCENES on a map with no scene_script`
9. `NAME_INVALID (1abc)`
10. `LABEL_TAKEN (check says taken)`
11. `object const is checked against the injected namespace`
12. `OBJECT_CAP at 15`
13. `NO_FLAG_SLOT (gap-full fixture)`
14. `BAD_OPTION (sprite not in options)`
15. `two new flags`
16. `text provenance`
17. `text provenance rejects a stale localTexts entry that is not dialogue`
18. `trainer accepts copied dialogue from this map`
19. `copy re-validation`
20. `failed create leaves context byte-identical`
21. `default label skips collisions in script and text namespaces`

`gbcCopy.test.ts`:

1. `copy of a jumptextfaceplayer script -> body + its text`
2. `fall-through fixture -> COPY_FALLTHROUGH`
3. `local .Foo inside the body kept`
4. `jump to a local outside -> COPY_FOREIGN_LOCAL`
5. `itemball label -> COPY_NOT_SCRIPT`
6. `a staged copy renames self, local and text references consistently`

Added to `save.test.ts`:

1. `constEdits + .asm written together`
2. `constEdits disk != before -> refusal, nothing written`
3. `constEdits atomic rename failure rolls back .asm and constants`
4. `duplicate constEdits paths refuse without writing`

Total: 31 new tests. These have not been executed here.

Trainer order is independently pinned to the subject's
`maps/Route30.asm:40` (TrainerYoungsterJoey1) and
`macros/scripts/maps.asm:134-145`: group, id, event flag, seen text, beaten
text, loss text, after-battle script. The generated after-battle body uses
`endifjustbattled` and `jumptext`, defined in scripts/events.asm.

## Verification commands and results

1. `npx tsc --noEmit -p tsconfig.base.json`
   - Exit 1 before TypeScript starts.
   - Result: `npx.ps1 cannot be loaded because running scripts is disabled on this system.`
2. `npx.cmd tsc --noEmit -p tsconfig.base.json`
   - Exit 0, stdout/stderr empty, after initial implementation.
3. `npx.cmd tsc --noEmit -p tsconfig.base.json`
   - Exit 0, stdout/stderr empty, after final implementation/test edits.
4. File-format verification (PowerShell here-string piped to `python -`):

```python
from pathlib import Path
paths = [
'packages/core/src/addEvent/gbcBuild.ts', 'packages/core/src/addEvent/gbcCopy.ts',
'packages/core/src/gbc/write/save.ts', 'packages/core/src/gbc/write/guards.ts',
'packages/core/test/addEvent/gbcBuild.test.ts', 'packages/core/test/addEvent/gbcCopy.test.ts',
'packages/core/test/gbc/write/save.test.ts']
for name in paths:
    b=Path(name).read_bytes()
    assert not b.startswith(b'\xef\xbb\xbf'), name
    if '/addEvent/' in name:
        assert b'\r' not in b, name
        assert all(v < 128 for v in b), name
    else:
        assert b.count(b'\n') == b.count(b'\r\n'), name
    print(f'PASS {name}: no BOM; '+('LF; ASCII' if '/addEvent/' in name else 'CRLF retained'))
```

Result: exit 0, seven PASS lines (all seven source/test files named above).
No new-file mojibake is possible in the verified ASCII files. Existing non-ASCII
comments in save/guards were retained.

Conductor focused command, NOT run here per sandbox override:

```text
npx vitest run packages/core/test/addEvent/gbcBuild.test.ts packages/core/test/addEvent/gbcCopy.test.ts packages/core/test/gbc/write/save.test.ts
```

Full gate, UI build, ROM assembly, and mutation checks were not run. This task
does not change UI. No passing runtime/full-gate result is claimed.

## Required conductor mutations

- Remove the copy fall-through check: `fall-through fixture -> COPY_FALLTHROUGH`
  must turn red.
- Skip the injected check for the emitted object constant:
  `object const is checked against the injected namespace` must turn red.
- Write constants outside the shared atomic set:
  `constEdits + .asm written together` checks that both targets are staged
  before the first rename, and `constEdits atomic rename failure rolls back
  .asm and constants` checks rollback. These are the named negative controls.

## Deviations and open concerns

- The brief's sandbox override replaces red/green execution and commit with
  test authoring and clean typecheck. The conductor must execute all 31 new
  tests plus existing focused tests and the mutations before accepting.
- `GbcAddCtx` has no charmap/root input. To keep the requested pure, exact API,
  generated dialogue uses `parseGbcCharmap`, `wrapSign`, and `renderGbcBody`
  with a conservative common English GBC alphabet and common player/Pokemon
  tokens. Project-specific glyphs are rejected. Supplying an actual project
  charmap requires a subsequent context contract decision; it is not silently
  read from a live subject inside the pure builder.
- The actual trainer macro is in `macros/scripts/maps.asm`, not the brief's
  suggested `macros/scripts/events.asm`; actual definition and map usage win.
- Builder/preview refusals are `AddEventRefusal` with map and file. Save-plan
  refusals retain the existing `Refusal[]` API, with map/file in the new
  messages, rather than changing every existing save caller to thrown
  `AddEventRefusal`. Commit refuses before any write when these are present.
- Standalone copy previews infer map/file from MapScripts/MapEvents labels;
  synthetic inputs without these markers fall back to the source label.
  The builder normalizes edited-copy refusals to its known map/file.
- Macro-generated symbol definitions outside the symbol index remain the
  spec's stated name-check limit. Injected name checking at save plan/commit
  and session undo ownership belong to Task 4, not this task.

No review or commit was performed.

## Fix round 1 (review round 1)

Status: implemented S1-S5 and Q1-Q3 findings. Q4: reverted per conductor
ruling. Typecheck is clean.
Vitest and mutation execution remain conductor-owned under the sandbox override.
No sub-agents, review passes, or commits ran in this fix round. Read-only
`git show HEAD:<path>` was used to restore Q4 exactly per the conductor ruling.

### Finding -> change -> regression

- **S1:** trainer objects now emit visibility flag `-1`; the beaten event flag
  remains exclusively in the `trainer` header. Extended `trainer existing`
  to assert the new object's parsed `eventFlag` separately from the complete
  header argument assertion. The source comment cites Route30.asm:413-415.
- **S2:** the copy parser checks the final significant line before discarding
  label-only lines. An empty final local block refuses `COPY_FALLTHROUGH`,
  including at EOF. Edited copies retain that refusal code instead of remapping
  it. Regressions: `empty trailing local block before Next refuses
  COPY_FALLTHROUGH` (the reviewer's exact Probe/.Tail/Next fixture),
  `empty trailing local block at EOF refuses COPY_FALLTHROUGH`, and
  `edited copy with an empty trailing local block refuses COPY_FALLTHROUGH`.
- **S3/Q2:** removed the fabricated alphabet entirely. `GbcAddCtx` now has
  REQUIRED `charmap: Charmap`, imported from signs/charmap.ts. The builder
  passes that value to `wrapSign`; test contexts use `parseGbcCharmap` on their
  private subject copy's `constants/charmap.asm`. Regressions:
  `unchanged Route29 dialogue containing #MON copies with the project charmap`
  extracts the actual quoted dialogue at Route29.asm:294 and asserts all
  generated quoted lines match unchanged; `project charmap accepts #MON
  ampersand and TM tokens`; and `project charmap refuses absent characters
  naming map and file`. The refusal case uses both an intentionally restricted
  injected charmap and a glyph absent from the real project charmap. This
  resolves the original report's conservative-alphabet concern. Task 5 must
  supply the project charmap through the required field.
- **S4:** guard refusals thrown by commit now include `session.mapName` before
  the refusal code/file list. Extended `constEdits disk != before -> refusal,
  nothing written` to require Route29 AND constants/event_flags.asm in the
  commit error. Updated the existing exact metatile-refusal string assertion
  to include Testmap, preserving its exact-error check.
- **S5:** extended `itemball` with assertions on
  `r.events.objects[r.created.index]`: `objectType` is OBJECTTYPE_ITEMBALL,
  `script` is Route29PokemapObject1, and `eventFlag` is EVENT_POKEMAP_POTION.
  The earlier whole-file assertion remains, with these stricter checks added.
- **Q1:** edited script bodies and edited text bodies refuse additional
  top-level declarations with `COPY_UNBOUNDED`. The parser also requires all
  supplied text definitions to be consumed rather than dropping unused ones.
  Regression: `edited copy refuses extra top-level helper definitions without
  staging`, using the reviewer's scall AddedHelper/end/AddedHelper/faceplayer/
  return fixture and asserting the entire context and constEdits stay unchanged.
- **Q3:** preview validation compares raw source lines within the selected
  script and each referenced dialogue block against the line indices retained
  by `codeLines`. Non-comment content in skipped spans refuses COPY_NOT_SCRIPT
  before an output body can be returned. Regressions: `macro definitions in a
  preview body refuse before extraction`, `macro definitions hidden in copied
  dialogue refuse before extraction`, and `edited copy refuses macro
  definitions before extraction without staging`. The edited case also stages
  a candidate flag before failure and proves the context remains unchanged.
- **Q4: reverted per conductor ruling.** The contract from commit 99ffdab
  remains "commitGbcSave writes exactly the prepared buffers"; the server
  re-plans/re-prepares before committing. Removed the complete fresh-set
  comparison and its seven parameterized memory-AtomicIo cases. Restored the
  pre-existing HEAD constEdits/prepared consistency check, which checks each
  currently staged non-no-op constants replacement against its prepared entry.
  Restored `writes exactly the prepared buffers on success` to its original
  HEAD text, including the later session edit and assertions on prepared after
  bytes. The entire preparedSave.test.ts text matches HEAD; CRLF is retained.
  The map name added to commit refusal messages (S4) is retained.

This round now adds 10 runtime test cases (six builder cases and four copy
cases), plus strengthened existing S1/S4/S5 assertions. They are authored and
typechecked, not runtime-verified here. The seven Q4 cases were removed per the
binding ruling; no stale-prepared refusal behavior is claimed.

### Scope and API changes

Changed gbcBuild.ts, gbcCopy.ts, save.ts, gbcBuild.test.ts, gbcCopy.test.ts,
save.test.ts, and this report. The temporary supporting change to
`packages/core/test/gbc/write/preparedSave.test.ts` was fully restored to HEAD
text per the conductor ruling. guards.ts needed no further changes this round.

Only exported type change this round: `GbcAddCtx` adds required
`charmap: Charmap`. All exported function signatures remain unchanged.
`commitGbcSave` retains the original prepared-buffer contract and the HEAD
consistency check for still-present constEdits; the proposed Q4 contract change
was reverted.

### Verification

Commands run this round:

```text
npx.cmd tsc --noEmit -p tsconfig.base.json
```

First run: exit 0, stdout/stderr empty.
Final run after the last test edit: exit 0, stdout/stderr empty.
After the Q4 revert, the same command was run again: exit 0, stdout/stderr empty.
`npx.cmd` invokes the requested npx TypeScript check while avoiding the
PowerShell script-execution restriction recorded above.

The Python format assertions recorded above were rerun for this round's seven
source/test files (including preparedSave.test.ts): exit 0, seven
`PASS format: <path>` lines. New addEvent files remain ASCII/LF/no BOM;
save.ts and both save test files retain CRLF/no BOM.

Vitest, mutations, full gate, UI build, and ROM assembly were not run.
The conductor's previous passing results are not claimed as validation of this
fix round. The required next step is the focused runtime suite (also including
gbc/write/preparedSave.test.ts) and the conductor's mutation checks.


### S4 assertion compatibility follow-up (conductor ruling)

Updated ONLY the three specified assertions in
`packages/core/test/gbc/write/guards.test.ts` from
`/save refused: file-changed-on-disk/` to
`/save refused: Testmap: file-changed-on-disk/`. A byte-level replacement check
confirmed exactly three replacements and all other bytes unchanged. This keeps
the map-bearing commit error format and strengthens the assertions.

The affected cases under `15. file-changed-on-disk` cover externally changed
blk bytes, externally changed asm text, and a deleted blk file.

Repository-wide test search command:

```text
rg -n -C 2 'save refused' packages -g '**/test/**'
```

All eleven matching assertions across packages/*/test were:

| Test path | Line | Assertion on error text | Action |
| --- | --- | --- | --- |
| core/test/write/preparedSave.test.ts | 221 | `toThrow("save refused")` for commitSave without entries | Unchanged; substring still matches, GBA |
| core/test/write/preparedSave.test.ts | 222 | `toThrow("save refused")` for commitSave with entries | Unchanged; substring still matches, GBA |
| core/test/gbc/write/save.test.ts | 107 | `/save refused: Route29:.*constants\/event_flags.asm/` | Unchanged; already checks new format |
| core/test/gbc/write/save.test.ts | 127 | `/save refused/` for duplicate constEdits | Unchanged; substring still matches |
| core/test/gbc/write/save.test.ts | 219 | Exact `save refused: Testmap: metatile-out-of-range (maps/TestLayout.blk)` Error | Unchanged; already checks new format |
| core/test/gbc/write/save.test.ts | 261 | `/save refused/` for a stale plan's invalid current block | Unchanged; substring still matches |
| core/test/gbc/write/preparedSave.test.ts | 87 | `toThrow("save refused")` without entries | Unchanged; substring still matches |
| core/test/gbc/write/preparedSave.test.ts | 88 | `toThrow("save refused")` with entries | Unchanged; substring still matches |
| core/test/gbc/write/guards.test.ts | 148 | External blk: `/save refused: Testmap: file-changed-on-disk/` | Updated as ruled |
| core/test/gbc/write/guards.test.ts | 160 | External asm: `/save refused: Testmap: file-changed-on-disk/` | Updated as ruled |
| core/test/gbc/write/guards.test.ts | 182 | Deleted blk: `/save refused: Testmap: file-changed-on-disk/` | Updated as ruled |

Paths in the table are relative to packages/. No matches occurred in the other
packages' tests. No other assertion conflicts with the new message format, so
no other test/source file was changed in this follow-up.

Verification: `npx.cmd tsc --noEmit -p tsconfig.base.json` exited 0 with empty
stdout/stderr. Vitest was not run under the implementer sandbox restriction.
No commit was made.
