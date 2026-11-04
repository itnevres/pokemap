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
