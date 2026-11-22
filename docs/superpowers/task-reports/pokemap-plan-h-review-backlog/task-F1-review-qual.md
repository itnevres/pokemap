# F1/F1b quality review (Claude Opus, read-only), diff 92cf48e..25397cf

Verdict: no blockers. Shapes for real projects unchanged (conditional spread), spread order safe, insideRoot matches canonicalTilesetPath, implementer's test-literal fixes legitimate (`"C:\x.bin"` was an invalid escape; `"..\..\x.bin"` evaluated to an inside path).

- I1 (fixed): tileset defect `.tiles` showed the derived tiles.png, not the INCBIN text; fix text now names where the INCBIN lives. `file` stays headers.h (test pins it).
- I2 (F1c hand-off): readers that bypass the `getTileset` refusal: `blockEdit/gbaOps.ts:275-279` (reads metatilesBin/attributesBin via effectiveBytes before any proj.tileset), `defects/gba.ts:76-82`, `validate/metatileRange.ts:40-41,99` (one broken tileset throws the whole validate pass). F1c list should add `signs/suggest.ts`, `cli/writeCommands.ts`, `gbaOps.ts`.
- N1 (fixed) rationale comment moved to the tilesPng derivation. N2 (fixed) `.tiles` entry skipped when the tileset has no `.tiles` field. N3 insideRoot duplicates canonicalTilesetPath body (left). N4 BrokenPath lacks `kind` (F1c maps to DataDefect, kind "build"). N5 no D25 comment at project.ts refusal (left). N6 `String(l[key])` twice in layouts.ts (left).
- Mutation note: the `getTileset` refusal is covered only by the `itWithCorpus` test (needs the corpus).
