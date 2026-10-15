import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { GbcWorldCanvasProps } from "../../src/gbc/GbcWorldCanvas.js";
import { FamilyApp } from "../../src/shell/FamilyApp.js";
import { gbcAdapter } from "../../src/gbc/adapter.js";

// Isolate the public World callbacks to exercise the safety fallback, independently of tree/mode exit handlers.
// Ordinary pointer input is covered by the overlay; this is an App callback invariant, not a live pointer scenario.
vi.mock("../../src/gbc/GbcWorldCanvas.js", () => ({
  GbcWorldCanvas: (props: GbcWorldCanvasProps) => <div>
    <button onClick={() => props.onEditHere?.("A")}>Enter A callback</button>
    <button onClick={() => props.onSelectMap?.("B")}>Select B callback</button>
    <output data-testid="context-name">{props.context?.map ?? "none"}</output>
  </div>,
}));
vi.mock("../../src/gbc/hooks/useGbcMap.js", () => ({ useGbcMap: () => ({ data: null, error: null, reload: vi.fn() }) }));
vi.mock("../../src/gbc/hooks/useGbcWorld.js", () => ({ useGbcWorld: () => ({ data: null, error: null }) }));

afterEach(() => vi.unstubAllGlobals());

describe("GbcApp isolated context selection invariant", () => {
  it("a World selection callback moving off the context map exits without a tree or mode handler", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ groupOrder: ["G"], groups: { G: ["A", "B"] } }) })));
    render(<FamilyApp adapter={gbcAdapter} />);
    await screen.findByRole("button", { name: "B" });
    fireEvent.click(screen.getByRole("button", { name: "World" }));
    fireEvent.click(screen.getByRole("button", { name: "Enter A callback" }));
    expect(screen.getByTestId("context-name").textContent).toBe("A");
    fireEvent.click(screen.getByRole("button", { name: "Select B callback" }));
    await waitFor(() => expect(screen.getByTestId("context-name").textContent).toBe("none"));
    expect(screen.getByRole("button", { name: "B" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: "World" }).getAttribute("aria-pressed")).toBe("true");
  });
});
