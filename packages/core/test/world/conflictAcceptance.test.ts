import { describe, expect, it } from "vitest";
import { conflictKey, wireConflicts, updatedAcceptedConflicts, isAcceptConflictBody } from "../../src/world/conflictAcceptance.js";
import type { Conflict } from "../../src/world/connections.js";

const conflict: Conflict = { map: "Route17", viaA: { from: "Route18", x: 30, y: 50 }, viaB: { from: "Route16", x: 30, y: 49 } };

describe("conflict acknowledgement identity", () => {
  it("uses the full ordered tuple and distinguishes shifted origins with equal displacement", () => {
    expect(conflictKey(conflict)).toBe('["Route17","Route18",30,50,"Route16",30,49]');
    const shifted: Conflict = { ...conflict, viaA: { ...conflict.viaA, x: 31 }, viaB: { ...conflict.viaB, x: 31 } };
    expect(conflictKey(shifted)).not.toBe(conflictKey(conflict));
    expect(conflictKey({ ...conflict, viaA: { ...conflict.viaA, from: 'A,\"B' } })).toBe('["Route17","A,\\\"B",30,50,"Route16",30,49]');
  });

  it("returns fresh metadata without changing base geometry or its order", () => {
    const before = JSON.stringify(conflict);
    const accepted = wireConflicts([conflict], [conflictKey(conflict)]);
    expect(accepted[0]).toMatchObject({ key: conflictKey(conflict), accepted: true });
    expect(JSON.stringify(conflict)).toBe(before);
    expect(wireConflicts([conflict], [conflictKey(conflict)])).toEqual(accepted);
  });

  it("deduplicates accept, removes exactly one key, and refuses malformed request bodies", () => {
    expect(updatedAcceptedConflicts(["a", "a", "b"], "a", true)).toEqual(["a", "b"]);
    expect(updatedAcceptedConflicts(["a", "b"], "a", false)).toEqual(["b"]);
    for (const value of [null, [], {}, { key: 4, accepted: true }, { key: "a", accepted: "yes" }]) {
      expect(isAcceptConflictBody(value)).toBe(false);
    }
    expect(isAcceptConflictBody({ key: "a", accepted: false })).toBe(true);
  });
});
