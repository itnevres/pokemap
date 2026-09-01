import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SpeciesSpotlight } from "../src/components/SpeciesSpotlight.js";

describe("SpeciesSpotlight", () => {
  it("dims every map except the hits", async () => {
    const onHits = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([{ mapName: "Route29", percent: 20, minLevel: 3, maxLevel: 5, method: "land_mons" }]),
    }) as never;

    render(<SpeciesSpotlight onHits={onHits} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "PIKACHU" } });
    await waitFor(() => expect(onHits).toHaveBeenCalled());
    expect(onHits.mock.calls.at(-1)![0]).toEqual([expect.objectContaining({ mapName: "Route29" })]);
  });

  // Added after review (Critical): whereSpecies returns one hit per
  // (map, method, rod, variant) combination, not one per map -- 125 of the
  // corpus's 227 encounter-carrying maps have more than one table. Route29
  // here has TWO hits (day/night variants, both land_mons), so a naive
  // `hits.length` would read "2 maps" for a species found on exactly one
  // map. Measured against the real corpus before this fix: MAGIKARP showed
  // "614 maps" here while only 114 distinct maps actually lit up on the
  // canvas.
  it("counts DISTINCT maps, not hits -- a map with two variant tables is one map, not two", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([
        { mapName: "Route29", percent: 80, minLevel: 3, maxLevel: 5, method: "land_mons", variant: "gRoute29" },
        { mapName: "Route29", percent: 20, minLevel: 4, maxLevel: 6, method: "land_mons", variant: "gRoute29_Night" },
      ]),
    }) as never;
    render(<SpeciesSpotlight onHits={() => {}} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "HOOTHOOT" } });
    await waitFor(() => expect(screen.getByText(/1 map\b/i)).toBeTruthy());
    expect(screen.queryByText(/2 maps/i)).toBeNull();
  });

  it("says so plainly when a species appears nowhere", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as never;
    render(<SpeciesSpotlight onHits={() => {}} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "MISSINGNO" } });
    await waitFor(() => expect(screen.getByText(/appears in no encounter table/i)).toBeTruthy());
  });

  // Added after review: the two tests above prove onHits fires with the
  // right payload EVENTUALLY, but nothing in the original suite pinned the
  // three-state contract (null / [] / hits) this component's whole design
  // rests on -- SpeciesSpotlight's own doc comment on `onHits`, and
  // WorldCanvas's undimming behaviour, both depend on it. Confirmed by
  // teeth proof: removing the startedRef mount-guard (so an empty query on
  // mount fires onHits(null) immediately) breaks the FIRST test above --
  // waitFor resolves on that premature call before the real debounced
  // fetch lands -- but nothing explicitly asserted "never called on mount"
  // on its own, so a differently-shaped regression (e.g. firing on mount
  // with something other than null) could still slip through undetected.

  it("never calls onHits before the user has typed anything", async () => {
    const onHits = vi.fn();
    const fetchMock = vi.fn();
    global.fetch = fetchMock as never;
    render(<SpeciesSpotlight onHits={onHits} />);
    // Long enough to clear DEBOUNCE_MS (250ms) even though nothing should
    // be scheduled -- if a regression fired a fetch on mount, this window
    // gives it time to resolve and call onHits before the assertion below.
    await new Promise((r) => setTimeout(r, 400));
    expect(onHits).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls onHits with an empty array (not null) when a search genuinely finds nowhere", async () => {
    const onHits = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as never;
    render(<SpeciesSpotlight onHits={onHits} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "MISSINGNO" } });
    await waitFor(() => expect(onHits).toHaveBeenCalled());
    // Distinct from "no active search" (null, see the next test) -- a
    // caller (WorldCanvas) needs to tell "cleared the box" from "searched
    // and it really is nowhere" apart, and both would look identical if
    // this were ever [] === null in disguise.
    expect(onHits).toHaveBeenCalledWith([]);
  });

  it("calls onHits(null) when the box is cleared after a real search, not [] again", async () => {
    const onHits = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([{ mapName: "Route29", percent: 20, minLevel: 3, maxLevel: 5, method: "land_mons" }]),
    }) as never;
    render(<SpeciesSpotlight onHits={onHits} />);
    const box = screen.getByRole("searchbox");

    fireEvent.change(box, { target: { value: "PIKACHU" } });
    await waitFor(() => expect(onHits).toHaveBeenCalled());
    onHits.mockClear();

    fireEvent.change(box, { target: { value: "" } });
    await waitFor(() => expect(onHits).toHaveBeenCalledWith(null));
  });

  it("debounces: several rapid keystrokes collapse into a single fetch", async () => {
    const onHits = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as never;
    render(<SpeciesSpotlight onHits={onHits} />);
    const box = screen.getByRole("searchbox");

    fireEvent.change(box, { target: { value: "P" } });
    fireEvent.change(box, { target: { value: "PI" } });
    fireEvent.change(box, { target: { value: "PIK" } });
    fireEvent.change(box, { target: { value: "PIKA" } });

    await waitFor(() => expect(onHits).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("PIKA"));
  });

  // Added after review: a 404/500 response body still parses as valid JSON
  // (the server's own `{ error: "..." }` shape -- packages/server/src/
  // index.ts's outer catch and final "not found" fallback), so without an
  // `r.ok` gate this would have reached `onHits` typed as `SpeciesHit[]`
  // while actually being `{ error: string }` -- WorldCanvas's own
  // `for (const h of spotlightHits)` is not Array.isArray-guarded, so that
  // would throw "not iterable" mid-render. Pins the gate the previous
  // round's review added.
  it("surfaces a non-ok response as an error instead of forwarding it to onHits as if it were hits", async () => {
    const onHits = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    }) as never;
    render(<SpeciesSpotlight onHits={onHits} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "PIKACHU" } });
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(onHits).not.toHaveBeenCalled();
  });
});
