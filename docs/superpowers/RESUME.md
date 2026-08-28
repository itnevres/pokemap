# Resuming PokeMap in a new session

Paste the block below as the first message of a fresh Claude Code session started
in `C:\Programming Projects\PokeMap`.

The full handoff lives at `.remember/remember.md`. That directory is gitignored
by the remember plugin, so it is local-only — this file is the committed copy of
how to pick the work back up.

---

## The prompt

> I'm resuming work on PokeMap, a Porymap-parity map editor for pokeemerald-family
> GBA decomp projects. Read `.remember/remember.md` first — it is the handoff from
> the previous session and explains what this is, what has been built, and the
> specific ways the plan has been wrong.
>
> **State:** Tasks 1–12 of 29 in Plan 1 are done, 77 tests passing, all green, on
> branch `plan-1-foundation`. The subject decomp at
> `C:\Programming Projects\Pokemon Game\game` is read-only for all of Plan 1 and
> must stay untouched — verify with `git status` there before and after.
>
> **Next:** Task 13, metatile rendering against the per-layout metatile split.
> This is the task the whole project exists for.
>
> Execute with `superpowers:subagent-driven-development`: a fresh implementer
> subagent per task with the **full task text pasted into the prompt** (never make
> it read the plan file), then a spec-compliance review, then a code-quality
> review, looping fixes back to the same implementer via `SendMessage`.
>
> Before dispatching Task 13, audit its text in
> `docs/superpowers/plans/2026-08-26-pokemap-plan-1-foundation-world.md` against
> the defect classes listed in the handoff and in Plan 0 §7. Roughly thirty
> defects have been found so far and **every one was in the plan, not in an
> implementation** — so auditing the task before dispatch is the highest-value
> thing you can do, and a clean implementer report is not evidence the task was
> right.

---

## Operating rules that are easy to lose

These cost real time to learn. They are in the handoff too, repeated here because
a new session will otherwise rediscover them the hard way.

**Heredocs fail in this environment**, especially containing `/`. Write scripts
and commit messages to a file with the Write tool, then run the file or use
`git commit -F <file>`. A heredoc escaping bug once truncated the plan from 5,535
lines to 240 — recovered from the last commit, but verify line count and
`grep -c "^## Task"` after any scripted plan edit. Prefer the Edit tool.

**Make every check fail on purpose before trusting it.** Two measurement scripts
reported clean results while testing nothing: one had a mangled regex and reported
zero mismatches, nearly killing a correct critical finding; another printed only a
path's last segment, producing a wrong parent directory. This is the same failure
the project exists to prevent.

**Ask every implementer for four things.** They have repeatedly found what the
reviews missed: a tautology audit of each assertion, independent verification of
every count the plan states, a willingness to question the instructions rather
than follow them, and a teeth proof for any test claimed to guard something —
break the thing, watch it go red, restore it.

**Model policy:** implementers on Sonnet; reviews of Tasks 13, 18, 22, 25 and all
UI tasks on Opus. `SendMessage` cannot change a model — a resumed agent keeps the
one it started with, so choose at dispatch.

**Count tests with the script in the handoff**, never by eye. Four hand-counts
were wrong, and scripting it found seven more across the plan.

---

## Where everything is

| Thing | Path |
|---|---|
| Handoff (local-only) | `.remember/remember.md` |
| Design spec | `docs/superpowers/specs/2026-08-26-pokemap-design.md` |
| Plan 0 — roadmap, invariants I1–I8, test-design rules §7 | `docs/superpowers/plans/2026-08-26-pokemap-plan-0-roadmap.md` |
| Plan 1 — 29 tasks, full TDD steps ← executing | `docs/superpowers/plans/2026-08-26-pokemap-plan-1-foundation-world.md` |
| Plans 2–5 | same directory; task-level only, **re-granularise before executing** |
| Subject decomp | `C:\Programming Projects\Pokemon Game\game` |
| Reference engines | `C:\Programming Projects\Pokemon Game\refs\` |

`git log --oneline` tells the real story. Plan corrections are separate commits
with `docs:` prefixes, and their messages record what was wrong and why — they are
the most useful reading in the repo after the plan itself.
