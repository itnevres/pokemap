# Plan 14.1 Task 1 implementer report

Status: DONE_WITH_CONCERNS. Code and tests written; TypeScript passes. Vitest,
red/green, full gate, mutations and commits are reserved for the conductor by the
sandbox override. No runtime test pass is claimed.

Tier: High - decomp parsing and external-boundary option scans.
Execution ledger: direct implementation required by the implementer brief, which
forbids subagents, SDD loops, self-review and extra reports. Delegate guidance was
read; no delegation performed. No git or vitest commands run. Existing tests and
fixtures were not edited. Only the named task and required support files changed.

## Files changed

- `vitest.config.ts` (existing; CRLF preserved).
- `packages/core/src/addEvent/types.ts` (new).
- `packages/core/src/addEvent/gbaOptions.ts` (new).
- `packages/core/src/addEvent/gbcOptions.ts` (new).
- `packages/core/src/addEvent/entryPoints.ts` (new).
- `packages/core/src/gbc/load/constCounter.ts` (new).
- `packages/core/src/addEvent/sources.ts` (new).
- `packages/core/test/addEvent/gbaOptions.test.ts` (new).
- `packages/core/test/addEvent/gbcOptions.test.ts` (new).
- `packages/core/test/gbc/load/constCounter.test.ts` (new).
- `packages/core/test/helpers/subjectSnapshot.ts` (new).
- `packages/core/test/helpers/subjectSnapshotSetup.ts` (new).
- This report: docs/superpowers/task-reports/pokemap-plan-14-gbc-editing-gaps/task-1-report.md.

Strictly needed support:
- sources.ts: regular-file-only traversal, C object-macro parsing, sentinel filter;
  reused by both loaders and snapshot setup.
- subjectSnapshotSetup.ts and vitest.config.ts registration: required globalSetup.

## Exported signatures

Contracts in types.ts (exact declarations):

```ts
export type EventKind = "object" | "warp" | "coord" | "bg";
export type ObjectType = "npc" | "itemball" | "trainer";
export type TrainerRef = { id: string; label: string };
export type GbaBehaviors = Record<string, number>;
export interface EventOptions {
  family: "gba" | "gbc";
  sprites: string[]; movements: string[]; flags: string[]; vars: string[];
  items: string[]; trainers: TrainerRef[]; bgTypes: string[]; facings: string[];
  secretBases: string[]; palettes: string[]; maps: string[];
  objectCap: number; freeFlagSlots: number; freeVarSlots: number;
}
export interface MapEventOptions {
  entryPoints: string[]; localScripts: string[]; localTexts: string[]; scenes: string[];
  warps: { n: number; x: number; y: number }[];
  tileInfo?: { x: number; y: number; warpCapable: boolean }; returnsTo?: boolean;
}
export interface CopyPreview { label: string; body: string; texts: Record<string, string> }
export interface TextPreview { label: string; text: string }
/** Whole-file replacements; accumulate one entry per path, retaining the original before. */
export type FileReplace = { path: string; before: string; after: string };
export type ScriptChoice = { mode: "existing"; label: string }
  | { mode: "copy"; from: string; label: string; body: string; texts: Record<string, string> }
  | { mode: "new"; label: string; text: string };
export type TextChoice = { mode: "copy"; from: string; text: string } | { mode: "new"; text: string };
export type NameChoice = { mode: "existing"; name: string } | { mode: "new"; name: string };
export interface AddEventForm {
  kind: EventKind; x: number; y: number; objectType?: ObjectType;
  fields: Record<string, string>; script?: ScriptChoice;
  texts?: Record<"seen" | "beaten" | "after", TextChoice>; flag?: NameChoice; varName?: NameChoice;
}
export type RefusalCode = "NAME_INVALID" | "LABEL_TAKEN" | "OBJECT_CAP" | "NO_SCENES"
  | "NO_FLAG_SLOT" | "NO_VAR_SLOT" | "NO_SCRIPTS_INC" | "COPY_UNBOUNDED"
  | "COPY_FALLTHROUGH" | "COPY_FOREIGN_LOCAL" | "COPY_NOT_SCRIPT" | "BAD_OPTION";
export class AddEventRefusal extends Error {
  constructor(public code: RefusalCode, message: string, public path?: string) {
    super(message); this.name = "AddEventRefusal";
  }
}
export type NameCheck = (name: string) => { taken: boolean; where?: string };
```

Other exported signatures:

```ts
// gbaOptions.ts
loadGbaEventOptions(root: string): EventOptions
freeGbaSlots(root: string, kind: "FLAG" | "VAR"): string[]
gbaWarpBehavior(behavior: number, b: GbaBehaviors): boolean
// gbcOptions.ts
loadGbcEventOptions(root: string): EventOptions
gbcWarpCapable(coll: number, names: Map<number, string>): boolean
gbcEventQuarter(x: number, y: number): number
gbcTileWarpCapable(blockCollisions: readonly number[], x: number, y: number, names: Map<number, string>): boolean
// entryPoints.ts
entryPointsFor(family: "gba" | "gbc", root: string, mapName: string, mapText: string): string[]
// constCounter.ts: line and afterLine are zero-based
constCounter(text: string): { name: string; value: number; line: number }[]
gbcEventGap(text: string): { afterLine: number; remaining: number } | null
// sources.ts (internal support module)
textFiles(root: string, extensions: readonly string[]): string[]
read(p: string): string
optionName(n: string): boolean
cDefines(text: string): { name: string; value: string }[]
// subjectSnapshot.ts
subjectSnapshot(): { gba?: string; gbc?: string }
// subjectSnapshotSetup.ts
setup(): () => void
```

## Test names

`packages/core/test/addEvent/gbaOptions.test.ts`:

- sprites has OBJ_EVENT_GFX_YOUNGSTER
- no option list contains sentinels or function-like header macros
- objectCap is OBJECT_EVENT_TEMPLATES_COUNT 64
- VAR slots equal unused defines with zero outside-header references and exclude referenced names
- facings equals header BG_EVENT_PLAYER_FACING constants
- entry points include Route101 Youngster and exclude Littleroot map table and movement
- GBA warp predicate accepts door, custom stair and arrow but rejects normal

`packages/core/test/addEvent/gbcOptions.test.ts`:

- sprites has SPRITE_YOUNGSTER
- items has POTION
- bgTypes lacks BGEVENT_COPY
- palettes starts with 0
- GBC objectCap is 15
- Route29 entry points include ObjectEvent and NPC but exclude Route29Potion data and MapScripts
- bank rule excludes other map files even in the same SECTION and accepts own file and home
- even x odd y selects bottom-left and tileInfo warpCapable follows only that quarter
- GBC warp predicate accepts door and ladder but rejects floor

`packages/core/test/gbc/load/constCounter.test.ts`:

- counter honors const_def, const_skip and const_next
- PerfPlus event gap is 48 and every const is below its boundary
- gap uses the last event and reports zero-based insertion line

19 test cases written; not executed here.
Corpus cases use subjectSnapshot() and skip only when their family is absent.
The bank fixture writes an independent temp tree. Quarter tests are pure.
The VAR oracle independently reads header defines and greps whole tokens outside
vars.h, asserts available and referenced candidates exist, and compares exact sets.
No placeholder assertions, guarded empty-list passes, async callbacks or jest-dom.

## Snapshot scope and measured performance

One mkdtempSync dir under os.tmpdir(), with gba/ and gbc/ children; env var is set
before workers. Teardown removes the directory. Only regular files are read or
copied; directory entries and symlinks never go to readFileSync. Missing roots skip.

Copied directories and reason:
- GBA src/, include/, data/: .c .h .inc .s .json text only. Complete unused-slot
  reference scope, include/constants option sources, data/maps map.json event
  references and scripts.inc bodies, plus shared data scripts. Binaries excluded.
- GBC constants/, maps/, home/: .asm only. Constants/counters, event references
  and own-map definitions, plus ROM0 home definitions. No engine copies needed.
- No graphics, binaries or .git.

Final actual setup measurement:
`Subject snapshot: 7456 files, 53050730 bytes, 4984.9 ms`
About 50.6 MiB and 5 seconds; teardown completed, command exit 0.
Earlier measurement copied engine/overworld too: 7480 files, 53295980 bytes,
5316.0 ms. Removed that directory because loaders/tests do not read it.

## Verification commands and result lines

- `npx tsc --noEmit -p tsconfig.base.json`: failed before compiler execution;
  PowerShell blocked npx.ps1: `FullyQualifiedErrorId : UnauthorizedAccess`.
- `npx.cmd tsc --noEmit -p tsconfig.base.json`: executed twice, including after
  final source edits. Both `exit_code: 0`; output empty (no diagnostics).
- `npx.cmd tsx -e 'import { setup } from "./packages/core/test/helpers/subjectSnapshotSetup.ts"; const teardown = setup(); teardown();'`:
  exit 1 before setup in tsx startup, with
  `SystemError [ERR_SYSTEM_ERROR]: A system error occurred: uv_os_get_passwd returned ENOMEM (not enough memory)`.
- Snapshot fallback: following exact JS piped as a PowerShell single-quoted
  here-string to `node` (foreground, no files generated). Executed twice; final
  `exit_code: 0`, result `Subject snapshot: 7456 files, 53050730 bytes, 4984.9 ms`.
  This executes the actual setup via in-memory TypeScript transpilation.

```js
const fs = require('fs');
const ts = require('typescript');
function load(path, customRequire = require) {
  const exports = {};
  const js = ts.transpile(fs.readFileSync(path, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 });
  new Function('require', 'exports', js)(customRequire, exports);
  return exports;
}
const sources = load('packages/core/src/addEvent/sources.ts');
const snapshot = load('packages/core/test/helpers/subjectSnapshotSetup.ts', name => name.endsWith('/sources.js') ? sources : require(name));
const teardown = snapshot.setup();
teardown();
```

Pending conductor commands (NOT run):
- `npx vitest run packages/core/test/addEvent packages/core/test/gbc/load/constCounter.test.ts`
- `npx vitest run packages/core`
- `npm test -- --maxWorkers=4 --minWorkers=1`
- Project-required UI typecheck/build.

## Conductor mutation targets

- Drop data-label exclusion: Route29 entry points include ObjectEvent and NPC but exclude Route29Potion data and MapScripts.
- Drop GBC own-file/home restriction: bank rule excludes other map files even in the same SECTION and accepts own file and home.
- Drop freeGbaSlots reference check: VAR slots equal unused defines with zero outside-header references and exclude referenced names.
- Ignore const_skip: counter honors const_def, const_skip and const_next.
- Ignore coordinate parity: even x odd y selects bottom-left and tileInfo warpCapable follows only that quarter.

## Deviations and open concerns

- Sandbox override forbids vitest and git; it supersedes the later done, verify
  and commit instructions. No test collection count, runtime pass, mutations,
  full gate or commit is claimed. Status is DONE_WITH_CONCERNS, not DONE.
- CheckWarpCollision is actually in the subject's engine/overworld/tile_events.asm
  lines 1-16, called from home/map.asm:234-235. That definition was absent from
  .ref; read the real file under the brief's read-only subject permission. Code
  comment cites both locations. Quarter parity cites home/map.asm:1714-1741.
- GBA predicate citations cover field_control_avatar.c:846-946 and relevant
  metatile_behavior.c predicates, including custom stair/regular and arrow warps.
  Predicates describe tile capability; engine still checks direction and events.
- Full engine vocabulary and integration require conductor runtime validation.
  No self-review or extra review passes performed.

## Fix round 1

Status: DONE_WITH_CONCERNS - requested fixes implemented; TypeScript clean.
Vitest and timing confirmation remain with the conductor under the sandbox rule.
Risk remains High (source parsing). Direct implementation follows the brief's
no-subagents/no-review instruction; delegate guidance was read again.

Files changed in this round:
- packages/core/src/addEvent/gbaOptions.ts
- packages/core/src/addEvent/sources.ts
- packages/core/test/addEvent/gbaOptions.test.ts
- packages/core/test/addEvent/gbcOptions.test.ts
- This report (appended; original report retained).

Map-list correction:
- loadGbaEventOptions now reuses parseMapGroups(...).allMapNames() from the
  existing core map loader, reading projectPaths(root).mapGroupsJson.
- maps now uses the existing loader's folder-name form (MarineCave_End,
  Route101), rather than map.json IDs (MAP_MARINE_CAVE_END, MAP_ROUTE101).
- The constants sentinel/macro assertion explicitly excludes maps. Every
  constants-derived list still receives both original assertions.
- Added test: "maps preserves real END names and excludes NUM and COUNT sentinels".
  It requires MarineCave_End and Route101 and rejects /^NUM_|_COUNT$/ in maps.
- Original test names remain intact; total cases written are now 20.

Scan/test performance changes:
- Both option test files load their option set exactly once in beforeAll.
- GBA unusedSlots computes both FLAG and VAR availability in one traversal and
  one combined whole-token regex pass per text file; each header is excluded
  only for its own kind, preserving references in the other header.
- loadGbaEventOptions invokes that shared scan once for both counts.
- sources.ts caches text reads and directory listings only for paths inside
  POKEMAP_SUBJECT_SNAPSHOT, the immutable globalSetup tree. It does not cache
  live project reads; caches clear when the snapshot env path changes/unsets.
  Cached directory arrays are copied on return to prevent caller mutation.
- The independent VAR test oracle uses a single whole-token regex pass per
  text file, collecting references into a Set. It calls freeGbaSlots once and
  reuses that result for exact equality and all referenced-name exclusions.
- Test-local text/list caches also avoid repeated snapshot I/O in macro checks
  and the independent oracle. The oracle does not use production traversal
  or production slot logic.
- No exported signatures changed. Existing maps semantics changed to the
  established loader form as explicitly authorized by the conductor ruling.

Verification:
- Command: npx.cmd tsc --noEmit -p tsconfig.base.json
- Result: exit_code 0; output empty (no TypeScript diagnostics).
- The .cmd shim is used because the earlier npx.ps1 invocation was blocked by
  PowerShell execution policy. This invokes the requested TypeScript command.
- Vitest was NOT run. Under-5-second GBA and under-2-second GBC suite targets
  are unmeasured here and require conductor confirmation. No pass or timing
  claim is made for the revised suites. No mutations, git, commits, self-review,
  extra review passes, or additional report files.
