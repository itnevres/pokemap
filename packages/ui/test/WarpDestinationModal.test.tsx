import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WarpDestinationModal } from "../src/components/WarpDestinationModal.js";

afterEach(() => vi.unstubAllGlobals());

describe("WarpDestinationModal", () => {
  it("shows a loading state, then the destination map's own canvas once its data arrives", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            map: { id: "MAP_B", name: "B", layout: "LAYOUT_B" },
            layout: { id: "LAYOUT_B", name: "B_Layout", width: 5, height: 5, borderWidth: 2, borderHeight: 2, primaryTileset: "gTileset_1", secondaryTileset: "gTileset_2" },
            split: { version: "hns", metatiles: 512, tiles: 512, pals: 12 },
            blocks: Array.from({ length: 25 }, () => ({ metatileId: 0, collision: 0, elevation: 0, behavior: 0 })),
          }),
      } as Response),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<WarpDestinationModal mapName="B" onClose={() => {}} />);
    expect(screen.getByText(/Loading B/)).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText("B canvas")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/map/B");
  });

  it("calls onClose when the close button is clicked", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("network down")));
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();
    render(<WarpDestinationModal mapName="B" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an error state rather than hanging forever on a failed fetch", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 404 } as Response)));
    render(<WarpDestinationModal mapName="NoSuchMap" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Could not load NoSuchMap/)).toBeTruthy());
  });

  // Review fix (I2): no focus management previously meant the underlying
  // world canvas kept keyboard focus while the modal was open, so Escape
  // reached WorldCanvas's own onCanvasKeyDown (clearing the map selection)
  // instead of this modal, and the close button was the LAST tab stop after
  // ~1,030 other elements. Two things pinned here: the close button
  // actually receives focus on mount (autoFocus), and Escape -- dispatched
  // from inside the dialog, the same way a real keypress would bubble up
  // from wherever focus landed -- calls onClose via the backdrop's own
  // handler.
  it("focuses the close button on mount and calls onClose on Escape", () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));
    const onClose = vi.fn();
    render(<WarpDestinationModal mapName="B" onClose={onClose} />);

    expect(document.activeElement).toBe(screen.getByLabelText("Close"));

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
