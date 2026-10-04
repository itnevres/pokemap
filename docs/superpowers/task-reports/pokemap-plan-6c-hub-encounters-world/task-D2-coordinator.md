# D2 coordinator mutation re-run — 804d6b9

Ran `node C:/Users/Serve/AppData/Local/Temp/pokemap-d2-mutations.mjs` on the final fix commit. The harness is outside the repository. For every mutation it asserts each literal source anchor occurs once, applies the replacement in memory, runs its focused witness, restores original bytes in `finally`, and byte-compares the restored source.

All requested survivors ran and failed as expected: `stop-hidden-gate`, `reverse-edge`, `accept-blocked`, `center-vector-side`, `drop-canonical-sort`, `omit-gbc-half-block`, `symbolic-gba-as-anchor`, `omit-signed-zero`, `null-final-anchor`, plus fix witnesses `ignore-cached-warps`, `sort-output-order`, and `mutate-manual-payload-base`.

No mutation left source bytes changed. The implementer’s focused suite was 93 passed and typecheck passed; final phase gates remain after D3/D4.
