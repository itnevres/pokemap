# Task B4 spec: a pending add owns its script edits

Tier: High (save ownership; a wrong answer is not caught automatically). User ruling 2026-11-22: "tie the script edits to the new event."

## Behaviour
An event created in a session owns what its creation staged. Deleting that still-pending event removes exactly those things together with the event; nothing else in the session changes. Undo of the delete restores event and script edits together; redo of the delete removes them again.

## GBA (`packages/server/src/{index,addEventRoutes}.ts`, `packages/core/src/{edit/events,write/save,addEvent/gbaBuild}.ts`)
- Ownership record on the pending `InsertOp`: optional `owns?: { appends: ScriptAppend[]; newNames: string[]; slots: { path: string; from: string; to: string }[] }` (data on the op, so `{...op}` copies in `dropPendingInsert`, structuredClone and undo snapshots keep it).
- Stamped by: `/event/create` (built.scriptAppends / built.newNames / header slot renames `from`=`FLAG_UNUSED_x` `to`=new name, from `gbaBuild.slot()`), Indicator add (scriptAppends entry), sign add (scriptAppends entry, plus a folded replace in the unterminated-EOF branch).
- Drop (`event/delete`, `slot.pending` branch): remove each owned append from `scriptAppends` (first equal path+text); if it is not there because a later step folded it into a scripts.inc `scriptReplaces` entry, remove the text from that entry's `after` (drop the entry if `after === before`); remove each owned new name once from `newNames`; reverse each slot rename in the header's `scriptReplaces.after` (`#define to` -> `#define from`), dropping the entry when `after === before`.
- Known limit (logged, follow-up): a later sign/Indicator UPDATE rewrote the owned text, so exact-text removal finds nothing and leaves the block.

## GBC (`packages/server/src/{gbcEditRoutes,addEventRoutes,gbcEditSessions}.ts`, `packages/core/src/addEvent/gbcBuild.ts`)
- Text-based: the add dialog writes script blocks into `eventsText`, new names into `newNames`, a `const EVENT_x` line into a `constEdits` entry. Session gets `ownedAdds: { kind, script, flag?, blocks: string[], newNames: string[], consts: { path, name }[] }[]` (in the GBC snapshot).
- Delete of an event that matches a record (same kind, same `script` label, and for objects the same `eventFlag`) removes the event (as today), then its blocks from `eventsText`, its names from `newNames`, its `const` lines from `constEdits` (entry dropped when `after === before`), and the record.
- Out of scope (follow-up): GBC sign and Indicator adds.

## Acceptance
1. GBA: add NPC/trainer/itemball with new script and new flag, delete before save; `/plan` has no scripts.inc change and no flags.h change; `newNames` empty; map.json insert gone.
2. GBA: two adds, delete only the first; the second's script and flag stay exactly as if the first had never been added (plan bytes equal a session that added only the second).
3. GBA: Indicator add then delete; sign add then delete; plan empty.
4. GBA: undo after delete restores event + scripts; redo drops them again.
5. GBC: add (new script + new flag) then delete; `eventsText`, constEdits and newNames equal the pre-add state; two adds delete one leaves the other intact; undo/redo.
6. Deleting an ORIGINAL (on-disk) event changes no script state.
7. Mutation: keeping appends after the delete (and separately keeping slot renames, keeping newNames) turns a test red.
