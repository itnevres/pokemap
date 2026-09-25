import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignComposer } from "../src/components/SignComposer.js";

// No @testing-library/jest-dom in this repo (confirmed by SaveDialog.test.tsx
// and Toolbar.test.tsx's own comments on this) -- toBeInTheDocument/
// toHaveValue/toBeDisabled/toBeEnabled are not real matchers here. Every
// assertion below reads the DOM directly instead: `.getAttribute(...)`,
// `(el as HTMLInputElement).value`/`.disabled`, plain truthy queries.

afterEach(() => vi.unstubAllGlobals());

const SUGGESTIONS = {
  species: [
    { species: "SPECIES_RATTATA", percent: 40, method: "land_mons", minLevel: 3, maxLevel: 5 },
    { species: "SPECIES_PIDGEY", percent: 20, method: "land_mons", minLevel: 3, maxLevel: 4 },
  ],
  placement: { x: 5, y: 6 },
};

describe("SignComposer", () => {
  it("fetches suggestions on open and lists ranked species with their percent, pre-filling x/y from the suggested placement", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(SUGGESTIONS) }));
    render(<SignComposer mapName="Route101" onAdded={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/SPECIES_RATTATA/)).toBeTruthy());
    expect(screen.getByText(/40%/)).toBeTruthy();
    expect((screen.getByLabelText("X") as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText("Y") as HTMLInputElement).value).toBe("6");
  });

  it("when placement is null (no grass on this map), X/Y default to 0 and are still editable, not disabled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ species: SUGGESTIONS.species, placement: null }) }));
    render(<SignComposer mapName="PalletTown" onAdded={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/SPECIES_RATTATA/)).toBeTruthy());
    expect((screen.getByLabelText("X") as HTMLInputElement).value).toBe("0");
    expect((screen.getByLabelText("X") as HTMLInputElement).disabled).toBe(false);
  });

  it("selecting a species and submitting POSTs /sign/add with x/y/elevation/species/dialogue, and calls onAdded with the returned scriptLabel", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(SUGGESTIONS) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ map: {}, isDirty: true, scriptLabel: "Route101_EventScript_WildSign_Rattata" }) });
    vi.stubGlobal("fetch", fetchMock);
    const onAdded = vi.fn();
    render(<SignComposer mapName="Route101" onAdded={onAdded} onCancel={vi.fn()} />);
    await waitFor(() => screen.getByText(/SPECIES_RATTATA/));
    fireEvent.click(screen.getByText(/SPECIES_RATTATA/));
    fireEvent.change(screen.getByLabelText("Dialogue"), { target: { value: "RATTATA: Skreee!" } });
    fireEvent.click(screen.getByRole("button", { name: /add sign/i }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith("Route101_EventScript_WildSign_Rattata"));
    const [, addCall] = fetchMock.mock.calls;
    expect(addCall![0]).toBe("/api/edit/Route101/sign/add");
    expect(JSON.parse(addCall![1].body)).toEqual({ x: 5, y: 6, elevation: 0, species: "SPECIES_RATTATA", dialogue: "RATTATA: Skreee!" });
  });

  it("a 400 refusal response shows the refusal's fix text and does not call onAdded", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(SUGGESTIONS) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: () => Promise.resolve({ refusals: [{ code: "SIGN_LABEL_EXISTS", message: "already exists", fix: "pick a different species", subject: "x" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const onAdded = vi.fn();
    render(<SignComposer mapName="Route101" onAdded={onAdded} onCancel={vi.fn()} />);
    await waitFor(() => screen.getByText(/SPECIES_RATTATA/));
    fireEvent.click(screen.getByText(/SPECIES_RATTATA/));
    fireEvent.change(screen.getByLabelText("Dialogue"), { target: { value: "..." } });
    fireEvent.click(screen.getByRole("button", { name: /add sign/i }));
    await waitFor(() => expect(screen.getByText("pick a different species")).toBeTruthy());
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("the Add Sign button is disabled until both a species is selected and dialogue is non-empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(SUGGESTIONS) }));
    render(<SignComposer mapName="Route101" onAdded={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => screen.getByText(/SPECIES_RATTATA/));
    expect((screen.getByRole("button", { name: /add sign/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText(/SPECIES_RATTATA/));
    expect((screen.getByRole("button", { name: /add sign/i }) as HTMLButtonElement).disabled).toBe(true); // dialogue still empty
    fireEvent.change(screen.getByLabelText("Dialogue"), { target: { value: "hi" } });
    expect((screen.getByRole("button", { name: /add sign/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  // Code-review-anticipated fix (same bug class as SaveDialog's own Critical
  // fix, see that component's doc comment): a genuine 500 from either route
  // sends `{ error: string }`, not `{ refusals: [...] }` -- casting the body
  // unconditionally would crash this component on exactly the failure path
  // it most needs to surface reliably.
  it("a 500 from GET /suggestions with { error } shows an error state instead of crashing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({ error: "project is mid-reload" }) }));
    expect(() => render(<SignComposer mapName="Route101" onAdded={vi.fn()} onCancel={vi.fn()} />)).not.toThrow();
    await waitFor(() => expect(screen.getByText(/project is mid-reload/)).toBeTruthy());
    expect((screen.getByRole("button", { name: /add sign/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a 500 from POST /sign/add with { error } (not { refusals }) shows the error, doesn't crash, and doesn't call onAdded", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(SUGGESTIONS) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({ error: "disk write failed" }) });
    vi.stubGlobal("fetch", fetchMock);
    const onAdded = vi.fn();
    render(<SignComposer mapName="Route101" onAdded={onAdded} onCancel={vi.fn()} />);
    await waitFor(() => screen.getByText(/SPECIES_RATTATA/));
    fireEvent.click(screen.getByText(/SPECIES_RATTATA/));
    fireEvent.change(screen.getByLabelText("Dialogue"), { target: { value: "hi" } });
    expect(() => fireEvent.click(screen.getByRole("button", { name: /add sign/i }))).not.toThrow();
    await waitFor(() => expect(screen.getByText(/disk write failed/)).toBeTruthy());
    expect(onAdded).not.toHaveBeenCalled();
  });

  // Mirrors SaveDialog.test.tsx's own "focuses ... on mount and calls
  // onCancel on Escape" regression test -- SignComposer owns its own modal
  // shell (Step 10's design correction), so it needs the identical
  // autoFocus + onKeyDown wiring for Escape to ever reach it at all.
  it("focuses the Cancel button on mount and calls onCancel on Escape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(SUGGESTIONS) }));
    const onCancel = vi.fn();
    render(<SignComposer mapName="Route101" onAdded={vi.fn()} onCancel={onCancel} />);

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
