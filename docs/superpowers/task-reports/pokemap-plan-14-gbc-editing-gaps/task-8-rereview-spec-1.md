- **PARTIAL — occupied generated names.** `packages/ui/src/gbc/addEventFields.ts:29–41` now checks generated flags and trainer companions. Undisclosed data labels remain invisible: create an item ball using an existing flag, then reopen Add—the same data label can still be proposed and refused with `LABEL_TAKEN`. The optional `labels` extension has no current producer. Server refusal protects correctness but does not satisfy lowest-unused defaults.
- **ADDRESSED — request disabling.** Both workspaces track move/delete/duplicate/undo/redo requests; deferred-request tests cover both families and the disabled reason.
- **ADDRESSED — fallback identifier validation.** Existing script/var fallback inputs reject invalid identifiers.
- **ADDRESSED — adapter contract.** Both methods are required; the test adapter supplies them.
- **ADDRESSED — Copy → New clearing.** Switching to New clears copied text and requires fresh content.
- **ADDRESSED — overstated tests.** The fixture includes `BGEVENT_COPY`; batched form submissions exercise the synchronous latch.

**New findings:** No Critical, Important, or Minor findings identified.

Reviewed `5c94a4e..c6a7bb1` read-only; HEAD verified. Tests, typecheck, build, and mutation results are conductor-supplied, not independently rerun.