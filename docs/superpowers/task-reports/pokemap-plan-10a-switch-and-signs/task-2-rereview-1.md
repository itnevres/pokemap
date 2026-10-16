# Task 2 re-review 1 (fix 196e329)
- C1 ADDRESSED: real charmap probe: has("l"), has("p") true; "\n","\l","\p","$" false.
- C2 NOT ADDRESSED (partially): '=' now kept and "" never added, BUT the quote-toggling '=' finder treats the escaped quote in
  `'\''         = B4` (charmap.txt line 88) as a closing quote, so the real "=" is seen as inside quotes, the line is skipped,
  and the apostrophe is DROPPED. Probe on the real GBA charmap: has("'") === false. The old code had it. This is a regression
  (signs like "DON'T" would be refused). Fix: find the separator by scanning the quoted token with escape awareness
  (skip a backslash + next char), or regex /^('(?:\.|[^'\])+'|\S+)\s*=\s*(.*)$/. Add a test: has("'") on real GBA charmap.
- I1 ADDRESSED: widths via GBC_TOKEN_WIDTHS[t] ?? 1 with exact table; <NULL>, <SCROLL> rejected; <PK> 1.
- I2 ADDRESSED: PKMN 2, POKEBLOCK 5, KYOGRE (FD 0C) 7 with ponytail comment, FC-prefixed and bare FD excluded (probe: COLOR false).
- M5 ADDRESSED: both parsers throw the specified messages on empty text.
- Minors ADDRESSED: single widthOfLine helper in wrap.ts, import type Charmap. (Small nit: unreachable throw guard on undefined word/width.)
- Tests: all requested tests present; 3-line test has a 43-char sentence not 50 (comment says 50), values hand-verified correct.
Focused tests pass. Temp probe removed; git status clean except pre-existing untracked files.
