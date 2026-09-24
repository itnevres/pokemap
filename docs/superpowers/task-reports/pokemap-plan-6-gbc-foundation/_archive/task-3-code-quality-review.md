# Plan 6 Task 3 — code-quality review (GBC map/layout loader)

Diff `d97cb07..bbaad40` — `packages/core/src/gbc/model/types.ts`, `packages/core/src/gbc/load/map.ts` (379 lines, new), `packages/core/test/gbc/load/map.test.ts` (710 lines, new). Spec compliance already approved separately (`task-3-spec-review.md`, 2 fix rounds, now clean).

**Verdict: CHANGES_REQUIRED (1 Important)**

`npm test`: 78 files / 802 tests pass. `npm run typecheck`: clean (both tsconfigs). No lint script configured.

## Compared against
- GBA siblings: `src/load/maps.ts`, `src/project.ts`, `src/load/layouts.ts` — refusal style, doc-comment density, exposed-surface shape.
- Task 2: `src/gbc/load/incbin.ts`, `src/gbc/load/blocks.ts` — regex/comment conventions, doc density.
- Test helper: `test/gbc/helpers/corpus.ts`, and `test/family.test.ts` for temp-dir cleanup convention.

## Important

**I1 — `loadGbcMaps` has no root-validation guard; first error to a bad `--project` path is a bare ENOENT.** `map.ts:250-253`. `project.ts:94-96` (GBA) explicitly guards this case and says why: *"Task 15 passes `--project` straight through from user input, so this is the first error most users will ever see from this tool. Every other read below would otherwise fail as a bare ENOENT naming neither the root nor what was expected to be there."* `loadGbcMaps` will hit the exact same situation once Task 10's CLI wires up `--project` for GBC roots, but has no analogous check — a wrong/missing root throws Node's raw `ENOENT: no such file or directory, open '<path>'`, naming neither the root nor what a GBC project root looks like.

  The canonical check already exists, just not in production code: `test/gbc/helpers/corpus.ts:16` — `hasGbcProject = (root) => existsSync(\`${root}/data/maps/attributes.asm\`)`.

  Fix — add at the top of `loadGbcMaps`:
  ```ts
  if (!existsSync(`${root}/data/maps/attributes.asm`)) {
    throw new Error(`${root} does not look like a pokecrystal-family project root: missing data/maps/attributes.asm`);
  }
  ```
  (mirrors `project.ts`'s message shape). Needs `existsSync` added to the `node:fs` import at `map.ts:1`.

## Minor

**M1 — Duplicated orphan-check shape.** `map.ts:271-286`. `orphanConsts`/`orphanHeaders` are the same three steps (build `Set` of present keys, `filter` for misses, throw naming count + joined keys) written out twice. Extract a helper alongside `assertNoDuplicates` (`map.ts:224-233`):
  ```ts
  function assertNoOrphans<T>(entries: T[], keyFn: (e: T) => string, present: Set<string>, sourceFile: string, label: string): void {
    const orphans = entries.filter((e) => !present.has(keyFn(e)));
    if (orphans.length > 0) {
      throw new Error(`${sourceFile}: ${orphans.length} ${label}(s) have no map_attributes entry: ${orphans.map(keyFn).join(", ")}`);
    }
  }
  ```
  Cuts ~10 lines, keeps the two call sites one-liners.

**M2 — `root` isn't normalized before path-building, unlike the GBA loader.** `map.ts:250-254,336,354`. Every path is `${root}/...` raw. GBA's `project.ts`/`config/paths.ts` always run the root through `norm()` first (`config/paths.ts:34`: strips a trailing slash, converts `\` to `/`) before building any `${r}/...` path. Right now this is harmless — `pokemap.config.json` and every test root are already clean forward-slash strings with no trailing slash — but it's a latent inconsistency: once Task 10's CLI accepts a raw `--project` value (which on Windows may well arrive with a trailing `\` or backslashes), `loadGbcMaps`/`loadLayout` will build paths GBA's loader would have normalized first. No GBC equivalent of `config/paths.ts` exists yet, so there's nowhere natural to put `norm()` today — flagging for whoever adds that module (or for Task 10) rather than asking for one now.

**M3 — `LoadedGbcMaps` exposes both a guarded `map()` and a raw `byName` a caller can silently miss on.** `map.ts:235-240,330-339`. `map(name)` throws naming the miss (matches `project.ts`'s refusal convention, explicitly called out in the doc comment at `map.ts:238`). `byName.get(name)` returns `undefined` on the same miss with no refusal at all — a future caller (Task 9/11) reaching for `byName.get(x)!` instead of `map(x)` quietly reintroduces the exact guess-instead-of-refuse failure mode this module otherwise takes care to avoid (G4/I7). `maps` (array, for iteration) + `map()` (for checked lookup) already cover every need; `byName` is redundant surface area. Not a hard rule violation — GBA's `MapGroups.groups` (`load/maps.ts:64-68`) sets a precedent for exposing a raw lookup structure alongside a safe enumerator — but there `groups` has no guarded twin serving the identical purpose the way `byName`/`map()` do here. Recommend dropping `byName` from the public interface (compute it internally only, as today, just don't return it) unless a concrete future caller needs O(1) access without the refusal. Non-blocking.

**M4 — Shared asm-line helpers are private to `map.ts`; Task 5/7 will want the identical primitives.** `map.ts:13-55` (`stripComment`, `stripMacroDefs`, `splitArgs`, `matchCall`). Task 5 (collision/palette asm) and Task 7 (event parser on `maps/*.asm`) parse the same RGBDS asm dialect — MACRO/ENDM bodies, `;` comments, comma-split keyword-args — and will need exactly this logic. Not extracting now is the right call (YAGNI, no second caller yet, and the task brief says not to demand speculative abstraction). Concrete recommendation for when that second caller shows up: move these four functions verbatim into a new `packages/core/src/gbc/load/asm.ts` rather than either (a) re-deriving them in Task 5/7, or (b) importing them from `map.ts`, which is a map-domain module and a confusing import source for a collision/event parser. `parseNum` is more map-specific (only `map.ts`'s own numeric fields use it) and doesn't need to move.

**M5 — No unit test pins CRLF handling directly.** `stripMacroDefs` (`map.ts:26`) splits on `/\r\n|\n/`, so CRLF is handled, and the corpus tests exercise whatever line endings the real PerfPlus checkout uses — but no inline-string unit test explicitly feeds `"...\r\n..."` the way the "no trailing newline" tests (e.g. `map.test.ts:64-67`) pin that edge. Cheap to add, optional — corpus coverage plus the shared split regex make an actual regression unlikely.

## Not flagged (checked, no issue)

- Regexes: `matchCall`'s `^\s*${keyword}\s+(.*)$` is properly anchored per-line and requires whitespace immediately after the literal keyword, so `"map"` never falsely matches `"map_attributes ..."` or `"map_const ..."` lines (verified: no whitespace follows `map` in either). Label-vs-call regexes in `parseMapHeaders` (`map.ts:189,196`) require the *entire* stripped line to be an identifier, so `dw`/`table_width`/`assert_table_length`/`map ...` lines never falsely match as labels.
- Comment stripping vs quoted strings: irrelevant here — none of `map_constants.asm`/`attributes.asm`/`maps.asm` contain string literals (unlike `incbin.ts`'s `INCBIN "path"`), correctly noted in the `stripComment` doc comment (`map.ts:9-11`) and independently confirmed by the spec review's corpus scan.
- MACRO/ENDM: only the shapes present in the real corpus (no nesting in RGBDS) are handled; spec review's mutation M7 confirms the skip is load-bearing.
- Error messages: every throw names the offending value and its source file (map name, const name, byte counts, direction token) — consistent with `project.ts`/`layouts.ts` style.
- Duplication elsewhere: `assertNoDuplicates` is a clean, single generic helper reused 3x — good.
- Types: plain data interfaces throughout `types.ts`, no classes; doc comments explain *why* (axis-reversal footnote, `DataDefect` never-throws contract, `.blk`-not-1:1-with-map) rather than restating the field list — matches `layouts.ts`/`project.ts` density.
- Tests: `map.test.ts`'s temp-dir pattern (`roots` array + single `afterAll` cleanup) exactly matches the established convention in `test/family.test.ts`; corpus tests are properly `itWithGbcCorpus`-guarded (skip, not fail, when PerfPlus isn't checked out) and include a vacuous-pass guard (raw regex line counts vs parser output, `map.test.ts:703-709`). Not brittle beyond the norm already set by sibling corpus tests elsewhere in the suite (hardcoded counts like "391 maps" match the style of "1,209 maps" in `load/maps.test.ts`). No over-mocking — everything is real file I/O against temp dirs or the real corpus.
- Function size: `loadGbcMaps` (~90 lines) is dense but reads linearly (parse → dedup-guard → orphan-guard → per-map join) and is comparable to `project.ts`'s `openProject`; not splitting further beyond M1 above.

---

## Re-review 1

Diff `bbaad40..222e2f7` — `packages/core/src/gbc/load/map.ts` (+59/-25), `packages/core/test/gbc/load/map.test.ts` (+26/-1). `npm test`: 78 files / 805 pass (802 + 3 new). `npm run typecheck`: clean. No regressions.

| # | Requested | | Evidence |
|---|---|---|---|
| I1 | Root guard + test | ✅ | `map.ts:243-249`: `existsSync(attributesAsm)` check before any read, message names `root` and the missing path, doc comment cites Task 10 CLI + mirrors `project.ts`'s guard. `map.ts:353` (the `map()` closure) and error path now say `${attributesAsm}` (the resolved path) instead of raw `${root}/...`, still naming the same file. Test: `map.test.ts:351-356`, empty temp dir, asserts `toThrow(root)` and `toThrow("attributes.asm")`. |
| M1 | Orphan helper | ✅ | `assertNoOrphans` (`map.ts:236-246`), doc comment explains it's the mirror-direction refusal. Both call sites (`map.ts:297,299`) now one-liners; behavior-preserving (same message shape: count + joined keys, `"has no map_attributes entry"`). |
| M2 | `norm()` root + test | ✅ | `loadGbcMaps` (`map.ts:263`) and `loadLayout` (`map.ts:366`) both call `norm(root)` (imported from `../../config/paths.js`, the exact GBA helper flagged in M2) before building any path. Test: `map.test.ts:359-367`, exercises both a trailing-slash root and a root with backslashes-plus-trailing-backslash, through both `loadGbcMaps` and `loadLayout`. Confirmed `norm`'s regex (`s.replace(/\\/g,"/").replace(/\/+$/,"")`) handles both forms correctly. |
| M3 | Drop `byName` from return | ✅ | `LoadedGbcMaps` interface (`map.ts:249-253`) now only `{ maps, map(name) }`. `byName` is still built internally (`map.ts:346`) purely as the backing store for `map()`'s closure — correct, matches the review's ask (compute internally, don't expose). Existing test at old `map.test.ts:350` (`byName.get(...)` assertion) removed cleanly, no leftover reference; grepped test file, no other `byName` use survives. |
| M5 | CRLF unit test | ✅ | `map.test.ts:68-71`: `parseMapConstants` fed a `\r\n`-joined string, asserts the same parsed record as the LF version. Doesn't add a second test per parser (headers/attributes), but `stripMacroDefs`'s line-split is the single shared code path all three go through, so one direct pin is sufficient — consistent with "cheap regression test," not asking for three. |
| M4 | Deferred | — | No `asm.ts` extraction attempted, as instructed (YAGNI until Task 5/7 land). Confirmed no incidental extraction snuck in. |

No new issues introduced by this round: `assertNoOrphans`'s generic signature is used identically at both call sites (no drift between the two orphan checks); `norm(root)` is applied consistently everywhere a path is built in both exported functions (no stray un-normalized `${root}/...` left — checked every remaining occurrence in the file); the `map()` closure's error message still names a real, resolved path.

**Verdict: APPROVED.**
