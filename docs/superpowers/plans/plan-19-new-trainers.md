# Plan 19: Create new trainers

Create a trainer and its party from the Add Object popup, in both families (user, 2026-11-02). A trainer is created by copying an existing one and editing the copy. Add Event places existing trainers only today (`specs/2026-11-02-pokemap-plan-14-1-add-event-design.md`, ruling A8).

## Status

Open. Not started; needs a measurement step and a spec first.

## Depends on

- Plan 14A, and Plan 18's table before this plan is specced (D24d, D24f).
- Risk: high (C and asm parsing, shared files, subject writes).

## Binding decisions

- D23, D24d, D24f, D29 (text in [decisions.md](decisions.md)).

## Traps and pitfalls

1. **The GBA subject keeps trainers in three C files.** `src/data/trainers.h` (one struct per `[TRAINER_X]`), `src/data/trainer_parties.h` and `include/constants/opponents.h`; there is no `trainers.party`. PokeMap's only C writer splices `#define` lines (`core/src/addEvent/gbaBuild.ts:38,112-129`), so struct and array insertion is new, and a new id also moves the trainer count and the trainer flags that follow from it. The spec measures how ids are allocated before any writer is planned.
2. **PerfPlus parties are not pret's format.** A party starts `db "FALKNER@", TRAINERTYPE_VARIABLE` and holds one sub-party per badge count, ended by `db $fe` (`data/trainers/parties.asm:23-31`). The reference corpus is pret (`3bc8daa`), so a parser proven on one is unproven on the other.
3. **A GBC trainer's id is its position.** The name in `constants/trainer_constants.asm` and the party in `parties.asm` must sit at the same place inside the class group. A new class also needs a row in ten more tables under `data/trainers/` (attributes, class names, DVs, music, genders, palettes, pointers, pics, sprites).
4. **The dialog already has the seam.** The trainer field is a plain select (`ui/src/gba/addEventFields.ts:27`, `gbc/addEventFields.ts:22`); flags, scripts and texts use the "Use existing / Copy from / New" modes (`shared/AddEventDialog.tsx:266-273`). "New trainer" adds modes to that field and a party editor under it; it is not a second dialog.
5. **A party editor needs lists the options payload lacks.** Moves and items are parsed nowhere yet; trainers come from `opponents.h` (`core/src/addEvent/gbaOptions.ts:129-130`) and `trainer_constants.asm` (`gbcOptions.ts:16-24`). The payload grows, and it is cached per entry point (the event-options index behind `GET /api/event-options/:map`), which the new lists must respect.
6. **These are shared files with one owner at a time** (one owning session per constants header; one per tileset file, `server/src/blockEditOwnership.ts`). A staged new name must not rebuild the merged options on every load: `ui/src/shared/useEventOptions.ts` once froze the page that way.
7. **The tests do not assemble generated C and asm,** so a struct with a syntax error passes every test. The build check in WSL (D29) is what catches it.

## Questions

**Rulings (user, 2026-11-16).** A trainer is created by copying an existing one and editing the copy; editing existing trainers is a later phase. No new trainer class. On PerfPlus, one fixed party in the first version, with the variable form shown as unsupported (trap 2). The build check runs here (D29; trap 7).

**Open, for the spec interview:**

1. GBA: which party features the form offers (held items, custom moves). Recommendation: what the copied trainer's own struct uses.
2. Rematch sets (`JOEY1` to `JOEY5`). Recommendation: out of scope.

## Subtasks

Provisional phases:

- T-0 measure both subjects and the reference engines (docs).
- T-1 GBA readers for the three files, lossless (High, parsing).
- T-2 GBA id allocation and patchers (High, subject writes).
- T-3 GBC readers (High).
- T-4 GBC patchers (High).
- T-5 moves and items in the options payload, both families (Medium).
- T-6 the new files in the save set under the owner rule (High, save ownership).
- T-7 the dialog field and party editor (Medium).
- T-8 live acceptance.
- T-9 final review.

## Acceptance

- A trainer copied and edited in each family saves, and the game still builds on a scratch copy (D29; trap 7).
- Live acceptance (T-8).
