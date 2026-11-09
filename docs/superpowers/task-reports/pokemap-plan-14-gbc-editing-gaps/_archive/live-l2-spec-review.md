FAIL

**Important — `packages/core/src/addEvent/entryPoints.ts:82`:** The index parses the current GBC map’s disk references before the staged overlay replaces them. The uncached path substitutes `mapText` before parsing that file. Concrete failure: prime the index, externally change `maps/Own.asm` to contain `bg_event 0,, BGEVENT_READ, Foo` and bump its mtime, while retaining valid staged text. Indexed lookup throws from `splitArgs`; uncached lookup succeeds using staged text. This violates equivalence and staged-reference replacement. Add a regression covering this case and preserve deferred parsing errors for maps whose disk references actually participate.

**Minor — `packages/core/test/addEvent/entryPointIndex.test.ts:23`:** The GBA snapshot cases append/remove `call` instructions, which do not contribute entry-point references. Consequently, those cases do not exercise the requested staged eligibility addition/removal. Use a disk-referenced label whose staged executable definition is added or made non-executable, and assert the corresponding eligibility changes plus cached/uncached equality.

Otherwise verified: five-file scope, no new routes, retained save/discard/reload invalidation, both create paths using the cache, signature refresh and unchanged-file reuse, and external-change tests in core and both server suites. Existing assertions remain untouched; committed files retain LF, ASCII, and no BOM.

Vitest was not run. The conductor’s reported 612/612, typecheck pass, and mutation failures are acknowledged.