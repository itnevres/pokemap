No Critical findings.

1. **Important — Edited copies silently lose additional definitions.**  
   `packages/core/src/addEvent/gbcBuild.ts:116` reparses the synthetic file but accepts only the first script scope. Reproduced with body `scall AddedHelper / end / AddedHelper: / faceplayer / return`: creation succeeds, emits `scall AddedHelper`, and drops the helper definition. This leaves an unresolved assembly symbol. **Fix:** validate that the entire edited body was consumed; refuse additional top-level definitions unless explicitly supported and copied. Add a regression asserting refusal without staging.

2. **Important — Valid subject dialogue cannot be copied unchanged.**  
   `packages/core/src/addEvent/gbcBuild.ts:28` substitutes a hard-coded alphabet for the project charmap. The real `maps/Route29.asm:294` dialogue contains `#MON`, and `constants/charmap.asm` defines `#`. Passing that dialogue through the trainer text-copy path produces `BAD_OPTION: Character "#" is not in the charmap.` **Fix:** supply the project’s parsed charmap through the builder context and reuse it for wrapping/validation. Test unchanged Route29 dialogue, rather than replacing it with ASCII-only text.

3. **Important — Unsupported macro definitions disappear before copy validation.**  
   `packages/core/src/addEvent/gbcCopy.ts:19` uses `codeLines`, which removes `MACRO … ENDM` blocks. Consequently, the later directive rejection cannot detect them. Reproduced an edited body containing a `helper` macro definition, its invocation, and `end`: preview succeeds and returns only `helper / end`. The new definition disappears, leaving an undefined invocation. **Fix:** inspect skipped source spans and refuse unsupported constructs before extracting the body, as `gbc/signs.ts` already does for skipped text content. Cover this in both preview and edited-copy validation.

4. **Minor — Prepared constants validation misses removed replacements.**  
   `packages/core/src/gbc/write/save.ts:188` checks only replacements currently present in `session.constEdits`. Reproduced using memory-only `AtomicIo`: prepare a constants edit, clear `constEdits`, then commit the old prepared entries. The fresh plan is empty, yet commit still writes the removed constants replacement. The current server’s fresh preparation/fingerprint path mitigates this, but the exported core API accepts stale entries. **Fix:** compare the complete prepared target/byte set against the current candidate, including unexpected entries and replacements changed back to no-ops.

Verification used source inspection, real-subject reads, in-memory execution, and mock-only writes. No files were edited; Vitest was not run. Conductor test and mutation results were treated as supplied evidence.

Quality: CHANGES REQUESTED