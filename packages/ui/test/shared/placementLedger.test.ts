import { describe, it, expect } from "vitest";
import { createPlacementLedger } from "../../src/shared/placementLedger.js";

// Plan 11 Task 4: the spec's placement reconciliation model ("Placement saves", F1-F4). Versions decide, never
// coordinates: the ledger holds no positions at all. `serverShows(map, snap)` answers, when a world GET issued at
// `snap` lands, whether that map shows the server's position (true) or keeps its local one (false).

describe("placementLedger (Plan 11 Task 4)", () => {
  it("a map nobody moved always shows the server", () => {
    const l = createPlacementLedger();
    const snap = l.snapshot();
    expect(l.serverShows("A", snap)).toBe(true);
    expect(l.serverShows("A", l.snapshot())).toBe(true);
  });

  it("moved -> ack -> a GET issued after the ack shows the server", () => {
    const l = createPlacementLedger();
    const v = l.begin("A");
    l.moved("A", v);
    expect(l.serverShows("A", l.snapshot())).toBe(false); // in flight
    l.resolve("A", v, true);
    expect(l.serverShows("A", l.snapshot())).toBe(true);
  });

  it("a GET issued before the ack that lands after it keeps the local position (stale GET)", () => {
    const l = createPlacementLedger();
    const v = l.begin("A");
    l.moved("A", v);
    const stale = l.snapshot();
    l.resolve("A", v, true);
    expect(l.serverShows("A", stale)).toBe(false);
    expect(l.serverShows("A", l.snapshot())).toBe(true);
  });

  it("a GET issued before a gesture began keeps the local position while that gesture is unresolved", () => {
    const l = createPlacementLedger();
    const before = l.snapshot();
    const v = l.begin("A");
    expect(l.serverShows("A", before)).toBe(false);
    l.moved("A", v);
    l.resolve("A", v, true);
    // Still false: the map's latest version is not the one the snapshot recorded (it recorded none).
    expect(l.serverShows("A", before)).toBe(false);
  });

  it("a gesture still in progress (begun, not ended) keeps the local position", () => {
    const l = createPlacementLedger();
    l.begin("A");
    expect(l.serverShows("A", l.snapshot())).toBe(false);
  });

  it("A -> B -> A with B in flight: only a GET issued after both acks shows the server", () => {
    const l = createPlacementLedger();
    const v1 = l.begin("A"); // drag to B
    l.moved("A", v1);
    const v2 = l.begin("A"); // drag back to A (its original tile: still a move relative to B)
    l.moved("A", v2);
    const bothInFlight = l.snapshot();
    l.resolve("A", v1, true);
    const afterFirstAck = l.snapshot();
    expect(l.serverShows("A", bothInFlight)).toBe(false);
    expect(l.serverShows("A", afterFirstAck)).toBe(false);
    l.resolve("A", v2, true);
    expect(l.serverShows("A", afterFirstAck)).toBe(false);
    expect(l.serverShows("A", l.snapshot())).toBe(true);
  });

  it("A -> B -> A after an acknowledged move to A: a GET issued before B lands after the return to A keeps local", () => {
    // The server says A and the canvas shows A, so a coordinate check would hand the map to the server here; the
    // version check must not (v2 is unresolved: a later failure of v1 or v2 would still need the local position).
    const l = createPlacementLedger();
    const v0 = l.begin("A"); // moved to A
    l.moved("A", v0);
    l.resolve("A", v0, true);
    const atA = l.snapshot(); // a GET issued now would report A
    const v1 = l.begin("A"); // A -> B
    l.moved("A", v1);
    const v2 = l.begin("A"); // B -> A
    l.moved("A", v2);
    expect(l.serverShows("A", atA)).toBe(false);
  });

  it("a late failure of v1 after v2 began changes nothing: v2 is still local", () => {
    const l = createPlacementLedger();
    const v1 = l.begin("A");
    l.moved("A", v1);
    const v2 = l.begin("A");
    l.resolve("A", v1, false);
    expect(l.serverShows("A", l.snapshot())).toBe(false);
    l.moved("A", v2);
    expect(l.serverShows("A", l.snapshot())).toBe(false);
    l.resolve("A", v2, true);
    expect(l.serverShows("A", l.snapshot())).toBe(true);
  });

  it("an older version's late success never resolves the newer one", () => {
    const l = createPlacementLedger();
    const v1 = l.begin("A");
    l.moved("A", v1);
    const v2 = l.begin("A");
    l.moved("A", v2);
    l.resolve("A", v1, true);
    expect(l.serverShows("A", l.snapshot())).toBe(false);
  });

  it("a no-op with no POST in flight is settled at once", () => {
    const l = createPlacementLedger();
    const v = l.begin("A");
    l.noop("A", v);
    expect(l.serverShows("A", l.snapshot())).toBe(true);
  });

  it("a no-op during an in-flight POST waits for that POST, then takes its success", () => {
    const l = createPlacementLedger();
    const v1 = l.begin("A");
    l.moved("A", v1);
    const v2 = l.begin("A");
    l.noop("A", v2); // ended on its start tile, i.e. v1's target
    const during = l.snapshot();
    expect(l.serverShows("A", during)).toBe(false);
    l.resolve("A", v1, true);
    expect(l.serverShows("A", during)).toBe(false); // issued before the outcome
    const after = l.snapshot();
    expect(l.serverShows("A", after)).toBe(true);
    // A later server-position change (another tab) is shown by any later GET.
    expect(l.serverShows("A", l.snapshot())).toBe(true);
  });

  it("a no-op during an in-flight POST takes that POST's failure (the server position wins on the next GET)", () => {
    const l = createPlacementLedger();
    const v1 = l.begin("A");
    l.moved("A", v1);
    const v2 = l.begin("A");
    l.noop("A", v2);
    expect(l.serverShows("A", l.snapshot())).toBe(false);
    l.resolve("A", v1, false);
    expect(l.serverShows("A", l.snapshot())).toBe(true);
    expect(l.dropAbsent("A", l.snapshot())).toBe(true);
  });

  it("a no-op inherits the LATEST in-flight POST when several are in flight", () => {
    const l = createPlacementLedger();
    const v1 = l.begin("A");
    l.moved("A", v1);
    const v2 = l.begin("A");
    l.moved("A", v2);
    const v3 = l.begin("A");
    l.noop("A", v3);
    l.resolve("A", v1, true);
    expect(l.serverShows("A", l.snapshot())).toBe(false); // v3 follows v2, still in flight
    l.resolve("A", v2, true);
    expect(l.serverShows("A", l.snapshot())).toBe(true);
  });

  it("a no-op after the in-flight POST already landed is settled at once", () => {
    const l = createPlacementLedger();
    const v1 = l.begin("A");
    l.moved("A", v1);
    l.resolve("A", v1, false);
    const v2 = l.begin("A");
    l.noop("A", v2);
    expect(l.serverShows("A", l.snapshot())).toBe(true);
  });

  it("a failure then a newer gesture before the rollback GET lands: the newer gesture keeps its position", () => {
    const l = createPlacementLedger();
    const v1 = l.begin("A");
    l.moved("A", v1);
    l.resolve("A", v1, false);
    const rollback = l.snapshot(); // the reload issued right after the failure
    expect(l.serverShows("A", rollback)).toBe(true); // nothing newer yet: it would revert
    const v2 = l.begin("A");
    l.moved("A", v2);
    expect(l.serverShows("A", rollback)).toBe(false); // lands after v2 began: v2 keeps its position
    expect(l.dropAbsent("A", rollback)).toBe(false);
  });

  it("a failed save whose map the server does not place leaves the world (a failed rail drop)", () => {
    const l = createPlacementLedger();
    const v = l.begin("R");
    l.moved("R", v);
    expect(l.dropAbsent("R", l.snapshot())).toBe(false); // in flight: stays
    l.resolve("R", v, false);
    expect(l.dropAbsent("R", l.snapshot())).toBe(true);
  });

  it("an acknowledged save never drops its map, even if the server does not place it", () => {
    const l = createPlacementLedger();
    const v = l.begin("R");
    l.moved("R", v);
    l.resolve("R", v, true);
    const snap = l.snapshot();
    expect(l.serverShows("R", snap)).toBe(true);
    expect(l.dropAbsent("R", snap)).toBe(false);
  });

  it("a failed save leaves the world only on a GET issued after the failure", () => {
    const l = createPlacementLedger();
    const v = l.begin("R");
    l.moved("R", v);
    const before = l.snapshot();
    l.resolve("R", v, false);
    expect(l.dropAbsent("R", before)).toBe(false);
  });

  it("group members are independent maps with their own versions and mixed outcomes", () => {
    const l = createPlacementLedger();
    const a = l.begin("A");
    const b = l.begin("B");
    const c = l.begin("C");
    l.moved("A", a);
    l.moved("B", b);
    l.noop("C", c); // unchanged member: nothing in flight for C, settled at once
    expect(l.serverShows("C", l.snapshot())).toBe(true);
    l.resolve("A", a, true);
    const s = l.snapshot();
    expect(l.serverShows("A", s)).toBe(true);
    expect(l.serverShows("B", s)).toBe(false);
    l.resolve("B", b, false);
    expect(l.serverShows("B", l.snapshot())).toBe(true);
    expect(l.serverShows("B", s)).toBe(false);
  });

  it("each begin returns a new version, distinct across maps", () => {
    const l = createPlacementLedger();
    const vs = [l.begin("A"), l.begin("B"), l.begin("A")];
    expect(new Set(vs).size).toBe(3);
  });

  it("a snapshot is a value: later calls never change what it recorded", () => {
    const l = createPlacementLedger();
    const v = l.begin("A");
    l.moved("A", v);
    const snap = l.snapshot();
    l.resolve("A", v, true);
    l.snapshot();
    expect(l.serverShows("A", snap)).toBe(false);
  });
});

it("versionedMaps returns every map with a version once, including resolved maps, as a fresh array", () => {
  const l = createPlacementLedger();
  expect(l.versionedMaps()).toEqual([]);
  const a = l.begin("A");
  l.moved("A", a);
  l.resolve("A", a, true);
  const b = l.begin("B");
  l.noop("B", b);
  const c = l.begin("C");
  l.moved("C", c);
  l.resolve("C", c, false);
  l.begin("A");
  const names = l.versionedMaps();
  expect(names).toEqual(["A", "B", "C"]);
  names.pop();
  expect(l.versionedMaps()).toEqual(["A", "B", "C"]);
});
