# Plan H F1c (core half): adversarial path-escape review

Reviewer: Claude Opus subagent, read-only. Diff: `git diff origin/master...HEAD` on `plan-h-f1c-b`
(`packages/core/src/render/layout.ts`, `packages/core/src/defects/gba.ts`, plus two test files).
I re-derived everything from the code and did not use the earlier review's conclusions. I ran no vitest, typecheck or build. Path behaviour was
probed on Windows 11 / Node 24 with standalone scripts in the session scratchpad, which replicate `insideRoot`, `dirOf`, and
`canonicalTilesetPath` verbatim and do real `readFileSync` calls against a throwaway `esc/root` tree. No repo imports were used.

## Verdict: CHANGES NEEDED

The two guards in the diff are correct and in the right places. Containment still fails in one place: `renderLayout` can read a
file outside the project, `<root>/../tiles.png`, through a tileset path that F1b never marks as broken (Important 1). The fix is
a few lines in `load/tilesets.ts`. Several other read sites that the Task F finding names are still unguarded, and no F row
assigns them (Important 2). That is a plan-scope gap, not a defect in this diff.

## Where `brokenPaths` comes from

- `config/paths.ts:4-7` `insideRoot`: replace `\` with `/`, `posix.normalize`, then reject `..`, `../*`, `/*`, and `^[A-Za-z]:`.
  The check is purely lexical. No `resolve` or `realpath` is used, and no root string is compared.
- `load/layouts.ts:15-26`: `border_filepath` and `blockdata_filepath` are checked, giving `brokenPaths` on the `Layout`.
- `load/tilesets.ts:91-110`: `.metatiles`, `.metatileAttributes`, the derived `tiles.png` **only when a `.tiles` field exists**
  (line 96), and every `.palettes` INCBIN.
- `project.ts:165-171`: `getTileset` throws a plain `Error` when `tp.brokenPaths` is set, before `loadTileset`.
- Every consumer builds its read as the string `${root}/${rel}` (`render/layout.ts:66,112`, `defects/gba.ts:84,94`,
  `tilesetData.ts:43`). Because of that concatenation, an absolute, drive, or UNC `rel` cannot redirect a read. It only produces a
  garbage path under the root. The only lexical escape is `..` climbing.

## Variant table (insideRoot result, plus what Windows really reads through `${root}/${rel}`)

The probe was `probe.js` in the scratchpad. "Caught" means `insideRoot` returns false.

| Input | Result | Evidence |
|---|---|---|
| `../secret.txt`, `data/../../secret.txt`, `./../x`, `data//../../x`, `data/./../../x` | caught. Each one would really read the outside file (SECRET) without the guard | paths.ts:5-6 |
| `..\secret.txt`, `data\..\..\x`, mixed `data/..\../x` | caught (backslash folded) | paths.ts:5 |
| `..` alone, `../` | caught | paths.ts:6 |
| `/etc/passwd` (POSIX absolute) | caught. Even uncaught it would be `root//etc/passwd`, giving ENOENT | paths.ts:6 |
| `C:\x`, `C:foo`, `c:foo` (drive-relative) | caught by the regex. Uncaught, they give ENOENT under the root | paths.ts:6 |
| `\\server\share\x`, `//server/share`, `\\?\C:\x`, `\\.\C:\x` | caught (normalized to leading `/`) | paths.ts:6 |
| Case variants or a sibling `<root>-evil` | not applicable. There is no prefix comparison, and reaching a sibling needs `../<root>-evil/...`, which is caught. The test `gbaBrokenPaths.test.ts:174-186` uses exactly such a sibling sentinel | - |
| Trailing dots or spaces: `.. /x`, `... /x`, `.. ./x`, `..\t/x`, `..../x`, `data/.. /../x`, `data/../.. /x` | not caught, but **not an escape**. Windows keeps intermediate `.. ` and `...` as literal names, so every probe read gave ENOENT and none reached the outside file. posix.normalize and Win32 agree on where `..` lands in every case I tried | probe output |
| Unicode lookalikes (`‥`, `．．`, `／`, `∕`, ideographic space) | not caught, not an escape (ENOENT) | probe output |
| `%2e%2e` | not caught, not an escape (no URL decoding on this path) | probe output |
| `""`, `.`, `data/..` | inside. The read hits the root directory and gives EISDIR (a thrown error, not an escape) | paths.ts:6 |
| NUL: `..\0/x` (inside), `a\0/../../x` (caught) | Node refuses both with `ERR_INVALID_ARG_VALUE` before any syscall | probe output |
| ADS `data/x.bin:../../x` | inside after normalize, and the read gives ENOENT | probe output |
| Symlink or junction inside the project | **not caught, and out of F1c scope.** No `realpath` anywhere in this chain. Plan H Task F (`plan-h-hardening.md:322-358`) defines containment lexically, and nothing in F1, F1b, F1c, F2 or F3 mentions links. A link that ships inside the project, e.g. `data/layouts/X/map.bin -> /home/u/.ssh/id_rsa`, makes render and defects read the target, and Save (`binary.ts:57` and then the write) would write through it. On a POSIX clone git creates symlinks by default. On Windows it needs `core.symlinks` plus a privilege, and git never creates junctions. Recorded so the orchestrator can decide whether a follow-up row is wanted. Plan 14-2 Task 0 already has a realpath idiom for scratch copies | - |
| Layout tileset symbol **missing** vs **broken** | Broken symbol: reported and the reads are skipped (`gba.ts:73-77,83`). Missing symbol with nothing else broken: still throws `Unknown tileset` (`gba.ts:92`), as before. Missing symbol together with a broken path elsewhere: the unknown symbol is masked until the path is fixed (Minor 2) | - |
| **Metatiles INCBIN with no `/` and no `.tiles` field, e.g. `"..a"`** | **not caught, real escape**, see Important 1 | tilesets.ts:85,90,95-96 |

## Findings

### Important 1: the derived `tiles.png` escapes when a tileset has no `.tiles` field (renderLayout reads outside the project)

`load/tilesets.ts:85` `dirOf = p.slice(0, p.lastIndexOf("/"))`. When `p` has no forward slash, `lastIndexOf` is -1 and the
slice drops only the last character. Line 90 then builds `tilesPng = dir + "/tiles.png"`. Line 95-96 skip checking it when there is no
`.tiles` field, because it "shares the `.metatiles` directory, already checked". That assumption is false:

- `.metatiles` INCBIN `"..a"` (a legal file name in the project root) passes `insideRoot`. `dirOf("..a")` is `".."`, so `tilesPng = "../tiles.png"`.
- `.metatiles` INCBIN `"a\..\..a"` normalizes to `..a` (inside), but `dirOf` gives `a\..\..`, so `tilesPng` canonicalizes to `../tiles.png`.

Probe result (`probe2.js`, a verbatim replica of tilesets.ts:85-100, project.ts:188 and tilesetData.ts:43):
`"..a" broken=false tilesPng="../tiles.png" ... metatiles read: METATILES | tiles read: OUTSIDE-TILES-PNG`.

Failing input: headers.h `gTileset_X` with `.metatiles`/`.metatileAttributes` only, metatiles.h
`INCBIN_U16("..a")`, a file `..a` and an attributes file in the root, and any layout using `gTileset_X`. Then
`renderLayout` (layout.ts:63-64) calls `proj.tileset`, which calls `loadTileset`, which reads `readIndexedPng(readFile("../tiles.png"))` (tilesetData.ts:56).
The tileset has no `brokenPaths`, so neither the F1c guard nor project.ts:169 fires, and the defects check reports nothing.
The bytes outside the root are decoded and rendered into the map (information disclosure). This is the exact D25 property: "nothing outside
the project is ever read".

The fix belongs in F1b code but blocks F1c's guarantee. (a) Make `dirOf` split on both separators and return `"."` when there is
no separator. (b) Always check the derived `tilesPng`: drop the `tilesBin ?` condition on line 96 and keep the message text
choice. (b) alone without (a) would turn a slashless `"x"` metatiles path into a false "leaves the project" defect, because `dirOf("x")` is
`""` and `tilesPng` becomes `"/tiles.png"`. Add a test with `.metatiles` = `"..a"` and no `.tiles`, expecting a broken tileset. It is red on the current code.

### Important 2: decomp-path read sites named by Task F that no F row covers (plan-scope gap, not this diff)

After F1c core, these still read `layout.blockdataFilepath`, `borderFilepath` or tileset paths with no `brokenPaths` check:
- `signs/suggest.ts:79` (named in Task F's finding at plan-h-hardening.md:326)
- `cli/src/writeCommands.ts:25-26` (named there)
- `write/binary.ts:57,76` (named there; the read happens before F2's write refusal)
- `validate/metatileRange.ts:56` (`validateMetatileRange` loops over every layout from the CLI. `proj.tileset` refuses a broken tileset first, but a broken layout's border and blockdata are read)
- `blockEdit/gbaOps.ts:63` (`effectiveBytes` on `proj.tilesetPaths(...)`, which returns paths without the broken check), `gbaOps.ts:91,216` and `blockEdit/usage.ts:415` (`gbaCells` over every layout sharing a tileset, broken ones included)
- server `blockEditRoutes.ts:257`, plus `editSessions.ts:45-46` and `index.ts:426` (the last two belong to F1c's server half)

Failing input: `blockdata_filepath: "../outside.bin"` where that file exists, then `pokemap` sign suggestion or CLI `validate` on that layout.
The bytes outside the root are read and parsed. The F1c row (`plan-h-hardening.md:130`) lists only render, edit-session open, save and
defects. The orchestrator should either widen F1c or F1d, or record these as accepted. `proj.tilesetPaths` is the cheapest single choke
point for the tileset half: throw there on `brokenPaths`, as `getTileset` does.

### Minor 1: a broken tileset reaches renderLayout callers as a plain `Error`, not a `PathEscapeError`

`render/layout.ts:60` throws `PathEscapeError` for a broken layout. A broken tileset throws `new Error(...)` from `project.ts:170` at
layout.ts:63. A server route that maps `instanceof PathEscapeError` to a defect or 4xx answer would treat the tileset case as a 500. No core
test renders a layout whose only broken part is a tileset. Check this in the server half.

### Minor 2: an unknown tileset symbol is masked while any path is broken

`defects/gba.ts:83-97`: when `broken.length > 0`, `count` never runs, so a second, independent error (an unknown symbol) is silent until
the path is fixed. The comment at gba.ts:71-72 documents this. It is acceptable, but it is a hidden-second-defect case.

### Minor 3: test gaps (the guards are right, but a narrower mutation would survive)

- `brokenLayout.test.ts` breaks only `blockdata_filepath`. A mutation that checks just the blockdata key, e.g.
  `brokenPaths?.some(b => b.key === "blockdata_filepath")`, stays green, even though `{ border: 1 }` would then read a broken
  `border_filepath` at layout.ts:112. Add a broken-border-only fixture with `border: 1`.
- No defects test has only `border_filepath` broken. Current behaviour is one build defect plus skipped blockdata checks, which is right but unpinned.

## Consumer trace (both entry points)

`renderLayout` (layout.ts):
1. `layoutByName` makes no fs call.
2. **Guard, line 60.**
3. `splitFor` makes no fs call.
4. `proj.tileset` ×2 goes through project.ts:169, which refuses a marked tileset. Otherwise `loadTileset` reads metatiles, attributes, tilesPng and every `.pal` (tilesetData.ts:46,49,56,68). The `.pal` read is the checked `.gbapal` path with only its extension rewritten, which cannot escape. tilesPng can escape (Important 1).
5. Blockdata read at line 67, which the guard covers. It is skipped with `blocksOverride`, which still refuses (test line 33).
6. Border read at line 112 when `border > 0`, which the guard covers because both keys feed `brokenPaths`.

`checkGbaMapDefects` (gba.ts):
1. Reads map_groups, the map's map.json, layouts.json, headers.h, metatiles.h, graphics.h and graphics.c. All are fixed root paths, not decomp-sourced.
2. `broken` collects the layout plus the primary and secondary tilesets, de-duplicated by message.
3. When anything is broken, the blockdata read at line 84 and the metatiles reads at line 94 are skipped. The attributes, tiles and palettes files are never read here.
4. Every other map's map.json is read through `paths.mapJson(name)`, where `name` comes from map_groups. That is outside this task's scope (an entry like `"../../x"` in map_groups would escape, but it is not a layout or tileset path).

With the current diff, both entry points refuse correctly on everything F1 and F1b mark. The only remaining escape is the tileset path that F1b fails to mark (Important 1).

## Mutation reasoning for the new tests (derived from the code, not run, per the read-only brief)

| Mutation | Test that goes red | Why |
|---|---|---|
| Delete layout.ts:60 | brokenLayout tests 1-3 | the stub's `splitFor` throws "should not be called", which is not a `PathEscapeError` (stubProject.ts:15,25) |
| Move the guard after `splitFor` or `tileset` | the same | the stub throws first |
| Drop `if (broken.length === 0)` in gba.ts | first broken-layout test, broken-tileset test | ENOENT from reading `../../outside.bin`, so `gbaMapDefects` throws |
| Read, but catch errors and still size-check | sentinel test (gbaBrokenPaths:174) | the 3-byte sentinel outside would add a size defect, giving length 2 |
| Omit the tileset `brokenPaths` from `broken` | broken-tileset and secondary tests | ENOENT, then a throw |
| Scan all tilesets instead of this layout's | "tileset this map does not use" test | an extra defect, and the size defect is suppressed |
| Remove the de-dup filter | "same broken tileset as primary and secondary" | 2 defects instead of 1 |
| Append path defects after the other checks | "path defects come first" | order assertion |
| Check only blockdata in the render guard | **none** | Minor 3 |
| Leave tilesPng unchecked (the current code) | **none** | Important 1 |

## Left undone

Nothing within the brief. Mutations were derived and not executed, because the brief forbids vitest.
Probe scripts: `C:\Users\Serve\AppData\Local\Temp\claude\1bbe7cb521d10f09\360489ad-ad98-4445-93c5-652fa662ae64\scratchpad\probe.js`, `...\probe2.js`.
