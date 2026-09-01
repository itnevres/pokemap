import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SpeciesSpotlight } from "../src/components/SpeciesSpotlight.js";

describe("SpeciesSpotlight", () => {
  it("dims every map except the hits", async () => {
    const onHits = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ([{ mapName: "Route29", percent: 20, minLevel: 3, maxLevel: 5, method: "land_mons" }]),
    }) as never;

    render(<SpeciesSpotlight onHits={onHits} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "PIKACHU" } });
    await waitFor(() => expect(onHits).toHaveBeenCalled());
    expect(onHits.mock.calls.at(-1)![0]).toEqual([expect.objectContaining({ mapName: "Route29" })]);
  });

  it("says so plainly when a species appears nowhere", async () => {
    global.fetch = vi.fn().mockResolvedValue({ json: async () => [] }) as never;
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
    global.fetch = vi.fn().mockResolvedValue({ json: async () => [] }) as never;
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
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => [] });
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
});
