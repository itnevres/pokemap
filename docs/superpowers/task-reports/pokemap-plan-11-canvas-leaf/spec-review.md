## Critical

None.

## Important

1. **F1/F3 conflate POST settlement with permission to discard an override.**  
   Evidence: spec `docs/superpowers/specs/2026-10-23-pokemap-plan-11-canvas-leaf-extractions-design.md:71` says success settles a version; `:73` permits dropping any settled override. Currently success and failure use different bookkeeping (`packages/ui/src/gbc/GbcWorldCanvas.tsx:1032`, `:1037`). Combining those rules permits an earlier GET to discard a successfully saved override before observing that save. Coordinate equality alone also fails for A→B→A: an older GET showing A can discard the final A override while B remains in flight.  
   **Change:** distinguish successful acknowledgement, failed/no-op settlement, and server observation. Require version-qualified reconciliation and specify which pending writes prevent removal. Add deferred-response tests for stale GETs after success and A→B→A.

2. **F2 does not specify how a no-op edit eventually settles after the outstanding POST finishes.**  
   Evidence: spec `:72` leaves settlement to that POST. GBA increments versions even for movement that rounds to the same tile (`packages/ui/src/components/WorldCanvas.tsx:1687`); the POST captures an earlier version (`:1521`) and settles only that version (`:1532`, `:1536`). Its reload preserves any later version (`:537`, `:544`). Merely skipping no-op settlement can therefore leave the newer no-op version permanently pinned—even after failure.  
   **Change:** define how no-op versions inherit the outstanding save’s outcome without settling genuinely newer movement. Test success and failure, then a subsequent server-position change; include unchanged group members.

3. **F5’s rollback timing and protection against newer edits are underspecified.**  
   Evidence: spec `:75` requires an immediate reload-based revert, but `:118` also allows local restoration and requires the server position when the error appears. Existing failures expose errors synchronously (`packages/ui/src/components/WorldCanvas.tsx:1542`; `packages/ui/src/gbc/GbcWorldCanvas.tsx:1038`), whereas reloads are asynchronous. GBA already protects edits made after a GET starts (`WorldCanvas.tsx:537`, `:544`); GBC reconciles through separate override state (`GbcWorldCanvas.tsx:494`).  
   **Change:** specify immediate restoration versus eventual reconciliation, behavior when rollback GET fails, and removal of failed placements originally absent from the server. Check edit ownership again when applying rollback, not only when the POST fails. Test a newer drag beginning between failure and GET completion; mutation-check that protection.

4. **F12’s “while any POST is in flight” rule does not define safe failure or final-reload behavior.**  
   Evidence: spec `:85`; both failure handlers currently clear pending state unconditionally (`packages/ui/src/components/WorldCanvas.tsx:590`; `packages/ui/src/gbc/GbcWorldCanvas.tsx:1052`), and unrelated world responses also clear it (`WorldCanvas.tsx:563`; `GbcWorldCanvas.tsx:528`). Once the last POST finishes, an older GET can still arrive before the final authoritative reload. If the latest POST fails, retaining its optimistic value would be incorrect.  
   **Change:** define toggle generations, ownership of pending state, and reconciliation after all outstanding writes settle. Specify older-failure/newer-pending, latest-failure/older-success, reverse completion, and failed final GET outcomes. Mutation tests must cover failures and the interval after POST completion, not just two successful toggles.

5. **E10’s listed run crosses the protected draw-path boundary.**  
   Evidence: spec `:60` lists GBA `1432–1439` / GBC `958–965`; those ranges include `drawDiamond`, canvas styling, and `fillText` inside redraw effects (`packages/ui/src/components/WorldCanvas.tsx:1434`; `packages/ui/src/gbc/GbcWorldCanvas.tsx:960`). They omit the x-coordinate calculation and `BADGE_SIZE` declarations (`WorldCanvas.tsx:1431`, `:46`; `GbcWorldCanvas.tsx:957`, `:141`). Binding P11-2 leaves redraw effects in place (`docs/superpowers/plans/2026-10-14-pokemap-roadmap-unified-ui.md:132`).  
   **Change:** explicitly extract only the constant and pure centre calculation; leave drawing, badge iteration, filtering, and hit-target recording in each canvas. Likewise limit E9 to small-image construction, excluding the composite-version bump.

6. **F11 contradicts the unconditional DOM anti-goal.**  
   Evidence: spec `:25` permits only P11-4 DOM changes, while `:84` adds a dismissible toolbar alert and changes placeholder conditions. Existing placeholders render whenever an error exists (`packages/ui/src/components/WorldCanvas.tsx:1998`; `packages/ui/src/gbc/GbcWorldCanvas.tsx:1337`); both retain world data on reload failure (`WorldCanvas.tsx:565`; `packages/ui/src/gbc/hooks/useGbcWorld.ts:30`).  
   **Change:** explicitly exempt F11’s error presentation from the anti-goal. Specify dismissal lifetime and test successful load → failed reload → continued interaction → dismissal/recovery, separately from initial-load failure.

## Minor

1. **Several extraction ranges are matching fragments, not complete semantic units.**  
   Evidence: spec `:46–63` versus current code:
   - E1 truncates `updateView`: it ends at GBA `368` / GBC `349`.
   - E2 includes the beginning of `hoverAt`; wheel effects end at `629` / `582`.
   - E5 includes viewport/canvas markup; legends end at `958` / `828`.
   - E7 includes spotlight JSX and truncates both entry-building memos.
   - E8 stops inside cache insertion; E9 omits canvas creation/dimensions.
   - E12 includes tooltip, context menu, and conflict-error JSX beyond the actual mount at `2116` / `1436`.

   **Change:** replace raw matching ranges with complete symbol/block boundaries and separate adjacent extractions.

2. **E13 should explicitly cover both pairs and name omitted shared lifecycle runs.**  
   Evidence: E13 sits under “World canvases” (spec `:53`, `:63`), but map auto-fit lifecycle is shared (`packages/ui/src/components/MapCanvas.tsx:470`; `packages/ui/src/gbc/GbcMapCanvas.tsx:452`). World viewport measurement is identical (`packages/ui/src/components/WorldCanvas.tsx:511`; `packages/ui/src/gbc/GbcWorldCanvas.tsx:588`). Neither is explicitly listed.  
   **Change:** make E13 apply to both pairs; enumerate these candidates and require an extraction-or-retention decision for each.

3. **The accessible-name migration needs a broader test inventory.**  
   Evidence: spec `:96` mentions Tools-scoped tests, but current names also appear in `packages/ui/test/Toolbar.test.tsx:36`, `:121`, `:134`, `:144`; `packages/ui/test/MapCanvas.test.tsx:295`, `:336`, `:713`; and `packages/ui/test/gbc/GbcMapCanvas.test.tsx:357`, `:458`, `:508`. The toolbar test couples accessible name, visible text, and title (`Toolbar.test.tsx:144–146`).  
   **Change:** list these migrations and separate name assertions from unchanged text/title assertions. Update the GBC absence assertion at `packages/ui/test/gbc/ToolbarGbc.test.tsx:19` so it remains meaningful.

4. **F7’s verification must distinguish visibility refreshes from canvas reloads.**  
   Evidence: GBA already reloads its canvas once per completed group, then calls the adapter once per successful name (`packages/ui/src/components/WorldCanvas.tsx:1545`); the adapter independently refreshes visibility (`packages/ui/src/gba/adapter.tsx:90`). Existing group coverage mounts only the canvas (`packages/ui/test/world/placementResync.test.tsx:126`).  
   **Change:** require an adapter-level assertion: all successful names marked, failed names excluded, one visibility refresh, plus the separate canvas reload. Include partial and total failure; counting only canvas GETs cannot prove F7.

## Checked, no finding

- **Coverage mapping:** every deferred item is represented: T7b → F7–F12/process note; Final fix → F3–F5/F13; N1 → F1/F2/F6. Sources: Plan 10b spec `:247–266`; Plan 11 spec `:71–90`. Correctness qualifications are above.
- **Accessible-name mechanism:** explicit `aria-label` preserves visible text/title; toolbar currently derives its name from content (`packages/ui/src/components/Toolbar.tsx:94–104`), as do both overlay buttons (`MapCanvas.tsx:900`; `GbcMapCanvas.tsx:771`).
- **F9/F10 wiring:** GBA dungeon callback is absent; GBC’s shell world hook is disabled outside World mode (`packages/ui/src/gba/adapter.tsx:138`; `packages/ui/src/gbc/adapter.tsx:31`, `:146`).
- **E11’s conditional retention is appropriate:** tooltip texts differ (`packages/ui/src/components/WorldCanvas.tsx:1447`; `packages/ui/src/gbc/GbcWorldCanvas.tsx:261`).
- **F13 targets the actual leak:** both root and raw exception text enter the incomplete entry (`packages/server/src/projectSymbols.ts:29–31`).

Read-only review; no tests run, edits, or sub-agents.