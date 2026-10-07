# D3 server fix replacement spec review — 848944b

Status: PASS for the explicitly assigned fix scope. No new scoped blocker. This is not acceptance of all full-D3 UI requirements or all previously reported quality concerns.

## Independent inspection

Read task-D3-server-spec.md and task-D3-server-spec-review.md, then inspected the 90aff21..848944b diff and the actual current production/test code. No production edits were made. The initial working tree contained only an unrelated untracked .codex directory.

The production behavior change is the literal `family: "gbc" as const` in buildGbcWarpsPayload. The route test explicitly asserts that wire tag. Destination resolution remains `events.warps[event.destWarp - 1]`, guarded by a known target and positive destWarp. Raw event fields remain spread unchanged and source order remains Array.map order. Thus positive 1-based destination semantics, named unresolved negative destinations, and undefined out-of-range arrivals are unchanged. There is no core adapter diff in this fix range.

The CRUD test now reads afterCreate and assigns written immediately after its first POST resolves, before checking status or parsing response JSON. Subsequent PATCH, seeded POST, and both successful DELETE requests each call capture before their response assertions. A response status or JSON assertion failure after these requests therefore enters finally with the bytes already captured. Finally reads the current bytes and restores/removes the sidecar only when those bytes equal the last capture. Original differing bytes are restored; an originally absent file is unlinked. A later differing write is preserved. The directory removal is nonrecursive rmdirSync, so it can remove only an empty directory, and runs only when that directory was initially absent.

## Focused execution

Command: `npx vitest run packages/server/test/gbcRoutes.test.ts -t 'GET /api/warps/:map|roundtrips explicit and seeded dungeons'`.

Result: 4 passed, 81 skipped; one test file passed. This includes the explicit family tag and destination pins plus the actual CRUD persistence roundtrip. Before and after execution, Test-Path for `C:/Programming Projects/pokecrystal-PerfPlus/.pokemap` returned False; afterward its dungeons.json also returned False. The existing test was the only external-writing operation executed. No full suite or GBA operation ran.

A separate Node in-memory witness extracted the actual finally byte-guard block from the test file using its textual boundaries and executed it with filesystem operations replaced by callbacks. Simulated own writes followed by a thrown first-response assertion restored both original absence and original byte content. A case with different current bytes invoked neither restoration nor removal. Literal output: `PASS: extracted cleanup restores absent/existing state after assertion failure and preserves later foreign bytes`. This witness performed no filesystem writes.

## Boundaries retained for the coordinator

The narrow original SR1 response-assertion ordering bug is fixed. Cleanup does not restore an originally existing file if a request removes it, nor capture a request that rejects before returning. Those broader failure modes were mentioned in the old review but are outside the explicitly assigned post-write-response assertion scope; this report does not claim those paths are protected. The invalid-body test still lacks finally restoration, as previously reported by the quality reviewer. That separate concern is not closed by this scoped verdict. No exported family guard is added; full-D3 consumer typing remains for its own checkpoint.
