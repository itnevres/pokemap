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
});
