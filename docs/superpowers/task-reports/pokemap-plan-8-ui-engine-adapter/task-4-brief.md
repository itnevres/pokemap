### Task 4: Paired small data hooks. Risk: low (merged review)

Pairs (line counts at `580c710`):
- `hooks/useCoverage.ts` 55 / `gbc/hooks/useGbcCoverage.ts` 19;
- `useDungeons.ts` 97 / `useGbcDungeons.ts` 53;
- `useMapGroups.ts` 39 / `useGbcGroups.ts` 19;
- `useMapLayout.ts` 78 / `useGbcMap.ts` 39.

- [ ] **Step 1:** For each pair, diff the logic. **Stop rule:** a pair is merged only when the two differ solely in endpoint, response type and family-only fields. Record any other difference in the coordinator report and leave that pair alone.
- [ ] **Step 2:** For each pair that qualifies, create `shared/useFetched<T>.ts` or a pair-specific generic. It gets a test of loading, error, and the stale-response guard on a key change. Run the test and confirm it fails.
- [ ] **Step 3:** Implement it. Both family hooks become thin wrappers that keep their exported names and types, so no consumer or test changes.
- [ ] **Step 4:** Teeth-proof: remove the stale-response guard; it must kill tests in both families.
- [ ] **Step 5:** Gate, then commit.

