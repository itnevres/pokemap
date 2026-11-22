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
- Q1 gate at d7a49f4 (after merging origin/master): 5,182 pass / 1 fail (engine.test env fail, RESUME-listed) / 273 files; typecheck pass, UI build pass; subjects unchanged. Reviews: Opus spec APPROVED (3 minor), Opus quality APPROVED (4 minor); minor 1 fixed in the markClean commit; others deferred (note-only).
- Q6: chain opus parked (Codex limit); chain sonnet: free hops failed (verify exit 124/2, lock waits), gpt-6.1-terra failed only on a broken node_modules junction (my mklink path); I applied its stash `delegate: gpt-6.1-terra failed Q6` and verified: typecheck pass, server 1,188 + full packages/ui 2,639 pass. Mutants M1-M7 (+M7b after adding a GBC map-payload test) killed. Reviews Opus (`high-risk-reviewer`, codex capped): spec 1 Important (no useGbcMap test) + 2 minor; quality 1 Important (tile-URL key repeats after reset) + 3 minor. Fixed: monotonic key + retired instances (`noteTilesetStamp`), useGbcMap tests, stale comment; mutants M8-M10 killed. Deferred (note only): server stamp sites without a shape assertion (event create/ops/indicator/redo nothing-open); block-editor `?tv=` URL after restart (stream C). Reports: `overnight/q6-review-{spec,quality}.md`.
- Q7: free-model implementer ernie (openrouter/baidu/ernie-5.5-flash-preview:free) `90353f5` (typecheck pass, full packages/ui 2,658 pass, mutants N1-N8 killed). Reviews Opus (high-risk-reviewer, codex capped; overnight/q7-review-{spec,quality}.md): 1 Important (a version-triggered in-place reload gave the edit session a new seed, hiding the dirty view) + minors. Fixed in `9126392`: shared/keepUnchanged.ts (keeps blocks/map/events identities when unchanged) used by useMapLayout.reload and useGbcMap.reload; reloadSeq (newest reload wins); skip while first load in flight; GBA failure banner only if the same map is still selected; new tests. Mutants P1-P6: P1, P2, P4, P5 killed; P3 and P6 (drop keepUnchanged) first survived because the test mocks returned the same shared blocks/map references; fixed by structuredClone of each mocked body, then both killed.
