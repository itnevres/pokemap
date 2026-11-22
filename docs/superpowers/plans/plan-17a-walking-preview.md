# Plan 17A: Walking preview

A shared 2D player walking preview using each engine's movement/collision rules and connected-map transitions. Unsupported rules are surfaced; the preview does not replace in-game testing. 3D rendering and full game emulation are outside this plan.

## Status

Open. Not started; needs a spec first.

## Depends on

- Plans 12, 14, 14B, 14C and 17 (D18); it may move up to any point after Plan 14C (D24e). It needs collision data, Plan 14C's connection maths and, for cliffs only, Plan 14B's later phase.
- Risk: high (movement correctness may look plausible while wrong).

## Binding decisions

- D18, D24e (text in [decisions.md](decisions.md)).

## Traps and pitfalls

1. **The walk grid differs by family.** GBA collision and elevation are per cell in the blockdata and the behaviour comes from the metatile (the map payload already resolves it per block, `server/src/index.ts:407-414`). GBC collision is four quadrants per block from the tileset's `*_collision.asm`, so the player steps on a grid twice as fine as the block grid (LESSONS, GBA / Porymap Quirks: "GBC event steps divide by two into block units").
2. **The fixtures are the oracle, and they are hand-derived.** That is a High trigger. Follow the encounter atlas: every rule cites the engine source by file and line (RESUME, GBC facts: "every probability is derived from engine asm"). The sources are PerfPlus `engine/overworld/player_movement.asm` with `constants/collision_constants.asm` and `data/collision/collision_permissions.asm`, and the GBA engine's player-avatar and object-movement code.
3. **A plausible stepper passes a casual look.** GBA elevation has special values and bridges; ledges are one-way; water needs Surf. The spec lists each rule as supported or shown as unsupported, and the acceptance names a map in each subject for each supported rule.
4. **An animated preview does not fit the redraw-on-change surfaces.** Player position kept in shell state re-renders everything under it (LESSONS, React). The preview draws on its own overlay canvas from a ref.
5. **Arrow keys are wanted twice.** Plan 14A's keyboard model may give them to a cell cursor. The preview is a mode that owns them while it is on.
6. **No code here depends on Plan 17.** It needs collision data, connections (Plan 14C's maths) and, for cliffs only, Plan 14B's later phase. Its place after Plan 17 is D18's order, not a dependency.

## Questions

**Open, for the spec interview:** which player states can be switched (walking, running, bike, Surf); whether object events block the player; whether a warp is followed or only shown; Map view only, or the world view too; an animated step or an instant move. Recommendation for the first version: walking and Surf, objects block, warps shown and not followed, Map view only, instant move.

## Subtasks

Provisional phases:

- 17A-1 the rule list with citations and the fixtures, per family (High, oracle).
- 17A-2 a pure GBA stepper in core (High).
- 17A-3 a pure GBC stepper (High).
- 17A-4 crossing a connection, both families (High).
- 17A-5 the preview mode on the map surface (High, canvas core).
- 17A-6 live acceptance.
- 17A-7 final review.

## Acceptance

- Walkable and blocked terrain, supported ledges and elevation, and crossings agree with independently checked engine fixtures in both families.
- Representative terrain and map seams are verified, including the later cliff phase when supported.
- Live acceptance (17A-6).
