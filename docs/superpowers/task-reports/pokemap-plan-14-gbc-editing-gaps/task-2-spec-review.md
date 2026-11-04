1. **Important — `packages/core/src/addEvent/gbcBuild.ts:197`: trainer beaten flag also controls object visibility.**  
   The builder puts the same `event` into the trainer header and argument 13 of `object_event`. With `EVENT_BEAT_YOUNGSTER_JOEY`, the added trainer disappears when the map reloads after Joey is beaten—or never appears if that flag is already set. This prevents the intended after-battle interaction. PerfPlus’s `engine/overworld/map_objects_2.asm:33–62` masks objects whose visibility flag is set; `maps/Route30.asm:413–415` uses a separate visibility flag or `-1` for trainers.  
   **Fix:** keep the beaten flag in the `trainer` header and emit `-1` as the trainer object’s visibility flag. Assert both positions separately.

2. **Important — `packages/core/src/addEvent/gbcCopy.ts:28–35`: a trailing local label bypasses fall-through validation.**  
   Verified with an in-memory execution of the actual implementation:
   ```asm
   Probe:
       iftrue .Tail
       end
   .Tail:
   Next:
       end
   ```
   Copy succeeds and includes `.Tail:` but excludes `Next`. The conditional branch therefore falls through outside the copied body. Removing label-only lines before checking the final command leaves `end` as the apparent terminator. PerfPlus’s `iftrue` macro and `Script_iftrue` implement the branch directly. This violates the required bounded-copy grammar.  
   **Fix:** validate the final local block, including empty blocks. Refuse this fixture with `COPY_FALLTHROUGH`; apply the same validation to edited copies.

3. **Important — `packages/core/src/addEvent/gbcBuild.ts:26–31`: fabricated charmap rejects supported project dialogue.**  
   New NPC dialogue and new/copied trainer texts use a hard-coded alphabet instead of the project charmap required by the Sign-helper contract. For example, `#MON & <TM>` is rejected here, although all three omitted tokens exist in PerfPlus’s `constants/charmap.asm`. I verified that the existing `parseGbcCharmap`/`wrapSign` helpers accept this text with the real charmap. The implementer report acknowledges this unresolved deviation.  
   **Fix:** resolve the context-contract omission and supply the actual parsed project charmap to the pure builder. Add coverage for supported project tokens and unsupported characters.

4. **Minor — `packages/core/src/gbc/write/save.ts:185`: constants commit refusals omit the map.**  
   When `constants/event_flags.asm` changes after staging, the guard creates a message containing the map and file, but commit discards that message and throws only `save refused: file-changed-on-disk (constants/event_flags.asm)`. This violates “every refusal names map and file.” The added test checks the map in the plan refusal, but not in the commit error.  
   **Fix:** preserve the guard message or include `session.mapName` in the commit error; assert both map and file there.

5. **Minor — `packages/core/test/addEvent/gbcBuild.test.ts:52`: the itemball type assertion is weaker than Step 1.**  
   `expect(r.text).toContain("OBJECTTYPE_ITEMBALL")` already passes on unchanged Route29: its existing potion object uses that type at subject `maps/Route29.asm:437`. Generating the new object with the wrong type would not fail this assertion.  
   **Fix:** inspect the newly created object or its specific event line and assert its type, generated target label, and flag.

The requested exports/context/result fields and every named Step 1 test are present. Apart from the findings above, the generated macro argument counts/order, `OBJECTTYPE_*` selections, script bodies, text terminators, insertion location, flag-gap accumulation, and atomic constants-save integration match the reviewed requirements. No unrelated feature expansion found.

No files edited or Vitest run. Runtime suite/typecheck/mutation results remain conductor-supplied evidence.

Spec: FAIL