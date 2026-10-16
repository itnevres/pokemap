# Task 2 spec-compliance review (Plan 10a, commit d92c5b1)

Verdict: **Spec ❌**. One Critical GBA parser bug that the tests miss, plus Important width gaps against S9a.

Method: I read the brief, the report, spec S3/S9a/S10/B2/B9, all 4 files, and both real charmaps (GBC
`constants/charmap.asm`, 431 lines; GBA `charmap.txt`, 1459 lines). I ran a temporary probe test against the real files.
It was deleted afterwards, and `git status --short` shows only the quality reviewer's untracked report, nothing from me.

## Critical

**C1. The GBA parser drops lowercase `l` and `p`, so ordinary text like "Hello" is refused.** In `charmap.ts:26`,
`new Set(["$", "\n", "\l", "\p"])` is JS source. `"\l"` and `"\p"` are not valid escapes, so they evaluate to `"l"` and
`"p"`. The real lines `'l' = E0` and `'p' = E4` are then skipped. The `'\l'`/`'\p'` lines unescape to `l`/`p` and are
skipped too. Probe on the real file: `has("l") === false`, `has("p") === false`,
`wrapSign("Hello people", gba, 36)` → `{refusal: 'Character "l" is not in the charmap.'}`.

The same line also has two smaller problems. The `"\n"` entry never fires, because `'\n'` unescapes to `n`. The
disallowed set is matched against unescaped characters, so it cannot tell escape lines apart from plain letters.
Fix: skip on the raw quoted body (`\l`, `\p`, `\n`, `$`) before unescaping. Add a real-file test that asserts
`has("l")`, `has("p")`, `has("n")` and `has("=")`.

**C2 (same parser). GBA `'='` is lost and an empty-string token is added.** `trimmed.indexOf("=")` finds the `=` inside
`'='         = 35`, so `left` becomes `'`, `slice(1,-1)` gives `""`, and `has("")` is true. Probe: `has("=") === false`
and `wrapSign("A=B", gba, 36)` is refused. Fix: match `^'((?:\\.|[^'\\])*)'\s*=` (or split on the last `=` before the
hex bytes) instead of the first `=`.

The existing GBA tests (`A`, `{UP_ARROW}`, `{PLAYER}`, `$`, `\n`) cannot catch either bug.

## Important

**I1. GBC fixed-expansion and runtime-name tokens are counted as width 1, which breaks S9a.** S9a says "a token counts
as its fixed expansion width where it has one" and runtime names count at their maximum. The brief's table ends in
"…", so it is open-ended. The real charmap has these tokens, which all come out as 1 (probe-confirmed):

| Token | Should be | Source |
|---|---|---|
| `<POKE>` | 2 | `"<PO><KE>"`, line 11 |
| `<TM>` | 2 | line 34 |
| `<TRAINER>` | 7 | line 35 |
| `<ROCKET>` | 6 | line 36 |
| `<PLAY_G>` | 7 | runtime player name, "same as `<PLAYER>` in English", line 6 |

Undercounting overflows the 18-wide box at runtime, and no automatic check catches it. Add these to `GBC_TOKEN_WIDTHS`.

**I2. GBA tokens get width 1 for everything except `{PLAYER}`/`{RIVAL}`, which also breaks S9a.** The brief says
"others 1", but the spec, which is binding, needs expansion widths. The real file's undercounted tokens are:

- `{PKMN}` = `53 54`: 2 tiles.
- `{POKEBLOCK}` = 5 bytes: 5 tiles.
- `{TALL_PLUS}`: 1 printed tile, so 1 is fine there.
- Runtime/fixed strings: `{STR_VAR_1..3}`, `{KUN}`, `{VERSION}` ("EMERALD", 7), `{AQUA}`, `{MAGMA}`, `{ARCHIE}`,
  `{MAXIE}`, `{KYOGRE}` (6), `{GROUDON}` (7), and the `B_*` battle placeholders.

The brief contradicts the spec here, so the coordinator should rule on it. At minimum, give multi-tile tokens their
byte count. Runtime string placeholders could be refused or counted conservatively.

## Minor

- **M1.** Brief Step 1 runs GBC `"A~B"` against the real charmap ("if `~` absent from charmap"). The test only uses
  the inline minimal map. I confirmed the real map lacks `~` (it appears only in the ASCII `PRINTABLE_ASCII` string)
  and refuses it, so this is a coverage gap only.
- **M2.** The GBC parser ignores `pushc`/`newcharmap ascii`/`popc` (lines 422-431) and parses entries from the ASCII
  map as well. Today this is harmless: those entries are `"\t"`, `"\n"` and `"\r"`, which `tokenize` never asks for,
  and the `STRSUB` loop is not matched. Stopping at `newcharmap` would be more robust.
- **M3.** The GBC apostrophe contractions `'d 'l 'm 'r 's 't 'v` (1 tile each, lines 169-175) tokenize as `'` + letter
  and count as 2. This overcounts, which is safe (conservative), but worth noting.
- **M4.** Control-like tokens outside the brief's list are allowed in user text at width 1: GBC `<NULL> <SCROLL> <NEXT>
  <_CONT> <DEXEND> <WBR> <TARGET> <USER> <ENEMY>`, and GBA argument-taking `{COLOR} {HIGHLIGHT} {SHADOW} {FONT}
  {PAUSE} {STRING} {PALETTE}`. The brief allows this ("any token the charmap defines"). Flagging it for a later ruling.
- **M5.** The spec's S10 asks for a located refusal on an unreadable charmap. The parsers return an empty map silently
  when they recognise no lines. This is probably the caller's job in a later task; note it there.
- **M6.** The brief's B9 mutation was "width 18→19". The report instead mutated the three comparison operators to
  `+1`, and all three were killed. That is equivalent or stronger. I accept it.

## Verified correct (my own arithmetic or probe)

- `"CHERRYGROVE CITY - NEW BARK TOWN"` at 18: 11+1+4+1+1 = 18 fits, and adding ` NEW` makes 22, so the result is
  `["CHERRYGROVE CITY -", "NEW BARK TOWN"]` (13). ✓
- Paragraph fixture: `ROUTE 29` (8) stands alone. `CHERRYGROVE CITY -` is 18, which is ≤ 18, so it is kept as-is.
  `NEW BARK TOWN` is 13. ✓
- `"ABCDEFGHIJKLMNOPQRS"` is 19 > 18. Probe refusal is `"ABCDEFGHIJKLMNOPQRS" is longer than one line (18).`, which
  matches the brief verbatim. ✓
- **Coordinator ruling on `"HI <PLAYER> HOW ARE YOU"`: correct.**
  - The whole line is 2+1+7+1+3+1+3+1+3 = 22 > 18, so it wraps.
  - Greedy: `HI` 2 → +`<PLAYER>` 10 → +`HOW` 14 → +`ARE` 18 (≤ 18) → `YOU` would be 22, so it breaks.
  - The result is `["HI <PLAYER> HOW ARE", "YOU"]`. The plan's value was wrong.
  - This fixture does not tell width 7 apart from width 1, but the added `"<PLAYER> ABCDEFGHIJK"` does:
    7+1+11 = 19 > 18 wraps, while width 1 gives 13, which fits.
- Refusal strings match the brief verbatim (probe on the real GBC map):
  - `Character """ is not in the charmap.`
  - `Character "~" is not in the charmap.`
  - `Unknown token <FOO>.`
  - An unterminated token gives `Unknown token <PLAY.`
- `"` is refused before any charmap lookup. ✓
- GBC `@`, `<LF>`, `<PARA>`, `<LINE>`, `<CONT>`, `<DONE>` and `<PROMPT>` give `has` → false. `<BSP>` is 1, `<PKMN>` is
  2, `<PK>` and `<MN>` are 1. ✓
- GBC line shapes: every main-map entry is `charmap "<x>", $nn` with an optional `; comment`, and the regex handles it.
  There are no escaped quotes and no multi-byte values in the main map. Duplicate byte values (for example `<DO>`/`<PO>`
  at $70) are harmless because the map is keyed by token.
- GBA: `'\''` unescapes to `'` correctly. `'$'` is excluded. Trailing `@ comment` on name lines is harmless.
- Interfaces match the brief's signatures exactly. Corpus helpers are reused (`itWithCorpus`, `itWithGbcCorpus`). The
  tests use vitest only.
