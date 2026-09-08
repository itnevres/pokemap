import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SpeciesSpotlight } from "../src/components/SpeciesSpotlight.js";

const ALL_SPECIES = ["SPECIES_MAGIKARP", "SPECIES_MAREEP", "SPECIES_MARILL", "SPECIES_PIKACHU", "SPECIES_ESPEON"];

function fetchMockWithSpecies(whereImpl: (url: string) => Promise<Response>) {
  return vi.fn((url: string) => {
    if (url === "/api/species") return Promise.resolve({ ok: true, json: async () => ALL_SPECIES } as Response);
    return whereImpl(url);
  });
}

describe("SpeciesSpotlight", () => {
  it("dims every map except the hits", async () => {
    const onHits = vi.fn();
    global.fetch = fetchMockWithSpecies(() =>
      Promise.resolve({
        ok: true,
        json: async () => ([{ mapName: "Route29", percent: 20, minLevel: 3, maxLevel: 5, method: "land_mons" }]),
      } as Response),
    ) as never;

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
    global.fetch = fetchMockWithSpecies(() =>
      Promise.resolve({
        ok: true,
        json: async () => ([
          { mapName: "Route29", percent: 80, minLevel: 3, maxLevel: 5, method: "land_mons", variant: "gRoute29" },
          { mapName: "Route29", percent: 20, minLevel: 4, maxLevel: 6, method: "land_mons", variant: "gRoute29_Night" },
        ]),
      } as Response),
    ) as never;
    render(<SpeciesSpotlight onHits={() => {}} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "HOOTHOOT" } });
    await waitFor(() => expect(screen.getByText(/1 map\b/i)).toBeTruthy());
    expect(screen.queryByText(/2 maps/i)).toBeNull();
  });

  it("says so plainly when a species appears nowhere", async () => {
    global.fetch = fetchMockWithSpecies(() => Promise.resolve({ ok: true, json: async () => [] } as Response)) as never;
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
    // Tracks only the real /api/where/:species lookup -- the dropdown's own
    // /api/species prefetch DOES legitimately fire on mount now, so this
    // can no longer assert "fetch was never called at all", only that the
    // search-triggering endpoint specifically was not.
    const fetchMock = vi.fn();
    global.fetch = fetchMockWithSpecies((url) => {
      fetchMock(url);
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    }) as never;
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
    global.fetch = fetchMockWithSpecies(() => Promise.resolve({ ok: true, json: async () => [] } as Response)) as never;
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
    global.fetch = fetchMockWithSpecies(() =>
      Promise.resolve({
        ok: true,
        json: async () => ([{ mapName: "Route29", percent: 20, minLevel: 3, maxLevel: 5, method: "land_mons" }]),
      } as Response),
    ) as never;
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
    // fetchMockWithSpecies wraps fetchMock so the mount-time /api/species
    // prefetch is answered separately and does not itself count toward
    // fetchMock's own call count below.
    global.fetch = fetchMockWithSpecies((url) => fetchMock(url)) as never;
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
    global.fetch = fetchMockWithSpecies(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({ error: "boom" }),
      } as Response),
    ) as never;
    render(<SpeciesSpotlight onHits={onHits} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "PIKACHU" } });
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(onHits).not.toHaveBeenCalled();
  });

  describe("type-ahead", () => {
    it("shows a dropdown of species starting with the typed prefix, case-insensitively", async () => {
      global.fetch = fetchMockWithSpecies(() => Promise.resolve({ ok: true, json: async () => [] } as Response)) as never;
      render(<SpeciesSpotlight onHits={() => {}} />);
      const box = screen.getByRole("searchbox");
      await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("/api/species"));

      fireEvent.change(box, { target: { value: "ma" } });

      // Starts with "ma": MAGIKARP, MAREEP, MARILL. PIKACHU and ESPEON
      // don't start with "ma" (a substring-match bug would also catch
      // neither of those here, so this alone doesn't discriminate --
      // that's why the next test targets a genuine near-miss).
      await waitFor(() => {
        expect(screen.getByText("Magikarp")).toBeTruthy();
        expect(screen.getByText("Mareep")).toBeTruthy();
        expect(screen.getByText("Marill")).toBeTruthy();
      });
      expect(screen.queryByText("Pikachu")).toBeNull();
    });

    it("does not show a species that merely CONTAINS the prefix, only ones that START with it", async () => {
      global.fetch = fetchMockWithSpecies(() => Promise.resolve({ ok: true, json: async () => [] } as Response)) as never;
      render(<SpeciesSpotlight onHits={() => {}} />);
      const box = screen.getByRole("searchbox");
      await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("/api/species"));

      // "rill" is a substring of MARILL but not a prefix -- a
      // substring-match implementation would wrongly include it.
      fireEvent.change(box, { target: { value: "rill" } });
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByText("Marill")).toBeNull();
    });

    it("clicking a dropdown entry fills the box and fires the search immediately, no debounce wait", async () => {
      const onHits = vi.fn();
      let resolveWhere: (v: Response) => void = () => {};
      const wherePromise = new Promise<Response>((resolve) => { resolveWhere = resolve; });
      global.fetch = fetchMockWithSpecies((url) => {
        if (url.startsWith("/api/where/")) return wherePromise;
        return Promise.resolve({ ok: true, json: async () => [] } as Response);
      }) as never;
      render(<SpeciesSpotlight onHits={onHits} />);
      const box = screen.getByRole("searchbox") as HTMLInputElement;
      await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("/api/species"));

      fireEvent.change(box, { target: { value: "ma" } });
      await waitFor(() => expect(screen.getByText("Marill")).toBeTruthy());
      fireEvent.click(screen.getByText("Marill"));

      expect(box.value).toBe("MARILL");
      resolveWhere({ ok: true, json: async () => [{ mapName: "Route1", percent: 10, minLevel: 1, maxLevel: 2, method: "land_mons" }] } as Response);
      await waitFor(() => expect(onHits).toHaveBeenCalled());
    });

    it("ArrowDown/ArrowUp move a highlighted entry and Enter selects it", async () => {
      global.fetch = fetchMockWithSpecies(() => Promise.resolve({ ok: true, json: async () => [] } as Response)) as never;
      render(<SpeciesSpotlight onHits={() => {}} />);
      const box = screen.getByRole("searchbox") as HTMLInputElement;
      await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("/api/species"));

      fireEvent.change(box, { target: { value: "ma" } });
      await waitFor(() => expect(screen.getByText("Magikarp")).toBeTruthy());

      fireEvent.keyDown(box, { key: "ArrowDown" });
      fireEvent.keyDown(box, { key: "ArrowDown" });
      fireEvent.keyDown(box, { key: "Enter" });

      // First option is Magikarp, second is Mareep (ALL_SPECIES order,
      // filtered) -- two ArrowDowns highlights the second.
      expect(box.value).toBe("MAREEP");
    });

    it("the dropdown never appears with an empty box", async () => {
      global.fetch = fetchMockWithSpecies(() => Promise.resolve({ ok: true, json: async () => [] } as Response)) as never;
      render(<SpeciesSpotlight onHits={() => {}} />);
      await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("/api/species"));
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    // Added after review: pick() sets skipQueryRef.current AND calls
    // setQuery(bare) to guard against the debounced-search effect below
    // redoing pick()'s own eager fetch 250ms later. When the box already
    // holds the EXACT bare/uppercase form pick() is about to set (typed
    // "MARILL", then click the Marill option -- bare is also "MARILL"),
    // setQuery("MARILL") is a same-value no-op: React bails out of the
    // re-render, so the debounced effect never re-runs, so its cleanup
    // (which normally cancels the pending timer) never fires either -- the
    // timer scheduled by the earlier typing is still alive and would fire
    // its own redundant fetch ~250ms later. The fix re-checks the guard
    // inside the timer callback itself (fire time), not just when the
    // timer is scheduled, so this stale timer bails out instead of firing.
    it("exact-match pick fires only one fetch, not two, even past the debounce window", async () => {
      const onHits = vi.fn();
      const whereMock = vi.fn(() => Promise.resolve({ ok: true, json: async () => [] } as Response));
      global.fetch = fetchMockWithSpecies(whereMock) as never;
      render(<SpeciesSpotlight onHits={onHits} />);
      const box = screen.getByRole("searchbox") as HTMLInputElement;
      await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("/api/species"));

      // Type the EXACT bare uppercase form -- pick()'s own normalization
      // produces the same string, so setQuery inside pick() will be a
      // no-op.
      fireEvent.change(box, { target: { value: "MARILL" } });
      await waitFor(() => expect(screen.getByText("Marill")).toBeTruthy());
      fireEvent.click(screen.getByText("Marill"));

      expect(box.value).toBe("MARILL");
      // pick()'s own eager fetch has already fired synchronously.
      expect(whereMock).toHaveBeenCalledTimes(1);

      // Wait well past DEBOUNCE_MS (250ms) to give the *pending* timer from
      // the earlier typing a chance to fire too, if it was never cancelled.
      await new Promise((r) => setTimeout(r, 400));
      expect(whereMock).toHaveBeenCalledTimes(1);
    });

    // Added after review: the flip side of the same stale-ref bug. Left
    // uncleared, skipQueryRef.current would survive a pick() indefinitely,
    // so a LATER, wholly separate search for the exact same species string
    // would be silently swallowed by the `skipQueryRef.current === trimmed`
    // guard -- no fetch, no "Searching...", no error, the world just never
    // updates. The fix clears the ref on the input's very next onChange, so
    // it can never outlive the one render cycle it exists to protect.
    it("retyping the same species after a pick fires a new, real search -- not silently suppressed", async () => {
      const onHits = vi.fn();
      const whereMock = vi.fn(() => Promise.resolve({ ok: true, json: async () => [] } as Response));
      global.fetch = fetchMockWithSpecies(whereMock) as never;
      render(<SpeciesSpotlight onHits={onHits} />);
      const box = screen.getByRole("searchbox") as HTMLInputElement;
      await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("/api/species"));

      fireEvent.change(box, { target: { value: "MARILL" } });
      await waitFor(() => expect(screen.getByText("Marill")).toBeTruthy());
      fireEvent.click(screen.getByText("Marill"));
      await waitFor(() => expect(whereMock).toHaveBeenCalledTimes(1));
      onHits.mockClear();
      whereMock.mockClear();

      // Clear the box, then retype the exact same species -- a brand new,
      // legitimate search the user just asked for.
      fireEvent.change(box, { target: { value: "" } });
      fireEvent.change(box, { target: { value: "MARILL" } });

      await waitFor(() => expect(whereMock).toHaveBeenCalledTimes(1), { timeout: 1000 });
      await waitFor(() => expect(onHits).toHaveBeenCalled());
    });

    // Confirms the ORIGINAL, already-working case is untouched: a pick
    // whose bare form DIFFERS from the just-typed prefix (the common case
    // -- typing a partial prefix like "ma" then clicking a longer option)
    // still collapses to exactly one fetch.
    it("picking an option after typing a mere prefix still fires only one fetch, not two", async () => {
      const onHits = vi.fn();
      const whereMock = vi.fn(() => Promise.resolve({ ok: true, json: async () => [] } as Response));
      global.fetch = fetchMockWithSpecies(whereMock) as never;
      render(<SpeciesSpotlight onHits={onHits} />);
      const box = screen.getByRole("searchbox") as HTMLInputElement;
      await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("/api/species"));

      fireEvent.change(box, { target: { value: "ma" } });
      await waitFor(() => expect(screen.getByText("Marill")).toBeTruthy());
      fireEvent.click(screen.getByText("Marill"));

      expect(box.value).toBe("MARILL");
      expect(whereMock).toHaveBeenCalledTimes(1);

      await new Promise((r) => setTimeout(r, 400));
      expect(whereMock).toHaveBeenCalledTimes(1);
    });

    it("if /api/species fails, plain typed search still works with no dropdown", async () => {
      const onHits = vi.fn();
      global.fetch = vi.fn((url: string) => {
        if (url === "/api/species") return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: "boom" }) } as Response);
        return Promise.resolve({ ok: true, json: async () => [{ mapName: "Route1", percent: 10, minLevel: 1, maxLevel: 2, method: "land_mons" }] } as Response);
      }) as never;
      render(<SpeciesSpotlight onHits={onHits} />);
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "MARILL" } });
      expect(screen.queryByRole("listbox")).toBeNull();
      await waitFor(() => expect(onHits).toHaveBeenCalled());
    });
  });
});
