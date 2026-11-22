# Plan H ledger: stream A h-session (Q1, Q6, Q7, C1, C2)

Branch `claude/plan-h-session-8a4cd6`, base `29ee130`.

| Task | Tier | Reason |
|---|---|---|
| Q1 | High | save/discard ownership + async ordering (a reply can race a mutation reply) |
| Q6 | High | shared render caches |
| Q7 | High | async ordering |
| C1 | High | async ordering, discard/save ownership |
| C2 | High | live check, report only |

## Hops
- Q1 server: chain.py --tier opus, gpt-6.1-sol done `e8f9d41` (try 1 verify exit 124 then done). Verify 60 pass (paintRoutes + gbcEditRoutes). Mutants (route opens a session unconditionally, both families): 4 Q1 tests killed.
- Q1 UI: chain.py --tier opus, gpt-6.1-sol, chain reported failed ("touched files outside --allow" server files; likely its diff base) and stashed; I applied the stash (`stash@{0}` "delegate: gpt-6.1-sol failed Q1S" holds the UI work) and finished by hand: 4 App-level test mocks answered the new GET with a dirty session; made them answer nothing-open (`switchPrompt`, `warpPopup`, `GbcAppContext`, `GbcAppEditing`) = `4fc799e`. Verify: full `packages/ui` 2,616+ pass after fix (shell+gbc 724/724). Mutants M1-M5 (effects off in either hook, nothing-open accepted, load ticket skipped, load throws) all killed.
- Q1 reviews: Codex astra unavailable (`gpt-6.2-astra` not offered on the ChatGPT account; `gpt-6-astra` hit the usage limit until 3:20 AM) -> Claude Opus (`high-risk-reviewer`), spec and quality as separate passes. Reports: `overnight/q1-review-{spec,quality}.md` in the notes folder.
