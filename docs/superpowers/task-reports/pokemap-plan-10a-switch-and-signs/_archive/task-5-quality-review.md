Status: Not approved (C=0 I=2 M=0)

## Critical

None.

## Important

- `packages/core/src/signs/linked.ts:62-64`, `packages/core/src/signs/linked.ts:81-83`: Both GBC name parsers pass quoted `db` strings through `stripComment`, which cuts at the first `;` even inside a quoted RGBDS string. A valid landmark such as `db "A;B@"` is rejected as missing, while a species name containing `;` is silently omitted and shifts all subsequent numeric name mappings.

- `packages/core/test/signs/linked.test.ts:8-13`, `packages/core/test/signs/linked.test.ts:74-98`: The test suite mocks `node:fs` and supplies synthetic source text, violating the binding requirement that tests only read real subject files. A parser regression that only appears against genuine decomp formatting can pass these fixture-backed cases without exercising the real input.

## Minor

None.