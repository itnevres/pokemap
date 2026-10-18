import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { EventInspector } from "../src/components/EventInspector.js";
import { GbcEventInspector } from "../src/gbc/GbcEventInspector.js";
import { PokemonIndicatorDialog } from "../src/components/PokemonIndicatorDialog.js";

// No @testing-library/jest-dom in this repo (confirmed by SaveDialog.test.tsx
// and Toolbar.test.tsx's own comments on this) -- toBeInTheDocument/
// toHaveValue/toBeDisabled/toBeEnabled are not real matchers here. Every
// assertion below reads the DOM directly instead: `.getAttribute(...)`,
// `(el as HTMLInputElement).value`/`.disabled`, plain truthy queries.

afterEach(() => vi.unstubAllGlobals());

const SUGGESTIONS = {
  species: [
    { species: "RATTATA", name: "Rattata", percent: 40 },
    { species: "PIDGEY", name: "Pidgey", percent: 20 },
  ],
  placement: { x: 5, y: 6 },
};

describe("PokemonIndicatorDialog", () => {
  it("fetches suggestions on open and lists ranked species with their percent, pre-filling x/y from the suggested placement", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(SUGGESTIONS) }));
    render(<PokemonIndicatorDialog mapName="Route101" onDone={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Rattata/)).toBeTruthy());
    expect(screen.getByText(/40%/)).toBeTruthy();
    expect((screen.getByLabelText("X") as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText("Y") as HTMLInputElement).value).toBe("6");
  });

  it("when placement is null (no grass on this map), X/Y default to 0 and are still editable, not disabled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ species: SUGGESTIONS.species, placement: null }) }));
    render(<PokemonIndicatorDialog mapName="PalletTown" onDone={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Rattata/)).toBeTruthy());
    expect((screen.getByLabelText("X") as HTMLInputElement).value).toBe("0");
    expect((screen.getByLabelText("X") as HTMLInputElement).disabled).toBe(false);
  });

  it("selecting a species and submitting POSTs /indicator/add with x/y/species/text, and calls onDone with the returned scriptLabel", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(SUGGESTIONS) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ map: {}, isDirty: true, scriptLabel: "Route101_EventScript_WildSign_Rattata" }) });
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();
    render(<PokemonIndicatorDialog mapName="Route101" onDone={onDone} onCancel={vi.fn()} />);
    await waitFor(() => screen.getByText(/Rattata/));
    fireEvent.click(screen.getByText(/Rattata/));
    fireEvent.change(screen.getByLabelText("Dialogue"), { target: { value: "RATTATA: Skreee!" } });
    fireEvent.click(screen.getByRole("button", { name: /Place/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Route101_EventScript_WildSign_Rattata", expect.objectContaining({ isDirty: true })));
    const [, addCall] = fetchMock.mock.calls;
    expect(addCall![0]).toBe("/api/edit/Route101/indicator/add");
    expect(JSON.parse(addCall![1].body)).toEqual({ x: 5, y: 6, species: "RATTATA", text: "RATTATA: Skreee!" });
  });

  it("a 400 refusal response shows the refusal's fix text and does not call onDone", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(SUGGESTIONS) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: () => Promise.resolve({ refusals: [{ code: "SIGN_LABEL_EXISTS", message: "already exists", fix: "pick a different species", subject: "x" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();
    render(<PokemonIndicatorDialog mapName="Route101" onDone={onDone} onCancel={vi.fn()} />);
    await waitFor(() => screen.getByText(/Rattata/));
    fireEvent.click(screen.getByText(/Rattata/));
    fireEvent.change(screen.getByLabelText("Dialogue"), { target: { value: "..." } });
    fireEvent.click(screen.getByRole("button", { name: /Place/i }));
    await waitFor(() => expect(screen.getByText("pick a different species")).toBeTruthy());
    expect(onDone).not.toHaveBeenCalled();
  });

  it("the Pok\u00e9mon Indicator button is disabled until both a species is selected and dialogue is non-empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(SUGGESTIONS) }));
    render(<PokemonIndicatorDialog mapName="Route101" onDone={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => screen.getByText(/Rattata/));
    expect((screen.getByRole("button", { name: /Place/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText(/Rattata/));
    expect((screen.getByRole("button", { name: /Place/i }) as HTMLButtonElement).disabled).toBe(true); // dialogue still empty
    fireEvent.change(screen.getByLabelText("Dialogue"), { target: { value: "hi" } });
    expect((screen.getByRole("button", { name: /Place/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  // Code-review-anticipated fix (same bug class as SaveDialog's own Critical
  // fix, see that component's doc comment): a genuine 500 from either route
  // sends `{ error: string }`, not `{ refusals: [...] }` -- casting the body
  // unconditionally would crash this component on exactly the failure path
  // it most needs to surface reliably.
  it("a 500 from GET /suggestions with { error } shows an error state instead of crashing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({ error: "project is mid-reload" }) }));
    expect(() => render(<PokemonIndicatorDialog mapName="Route101" onDone={vi.fn()} onCancel={vi.fn()} />)).not.toThrow();
    await waitFor(() => expect(screen.getByText(/project is mid-reload/)).toBeTruthy());
    expect((screen.getByRole("button", { name: /Place/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a 500 from POST /indicator/add with { error } (not { refusals }) shows the error, doesn't crash, and doesn't call onDone", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(SUGGESTIONS) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({ error: "disk write failed" }) });
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();
    render(<PokemonIndicatorDialog mapName="Route101" onDone={onDone} onCancel={vi.fn()} />);
    await waitFor(() => screen.getByText(/Rattata/));
    fireEvent.click(screen.getByText(/Rattata/));
    fireEvent.change(screen.getByLabelText("Dialogue"), { target: { value: "hi" } });
    expect(() => fireEvent.click(screen.getByRole("button", { name: /Place/i }))).not.toThrow();
    await waitFor(() => expect(screen.getByText(/disk write failed/)).toBeTruthy());
    expect(onDone).not.toHaveBeenCalled();
  });

  // Mirrors SaveDialog.test.tsx's own "focuses ... on mount and calls
  // onCancel on Escape" regression test -- PokemonIndicatorDialog owns its own modal
  // shell (Step 10's design correction), so it needs the identical
  // autoFocus + onKeyDown wiring for Escape to ever reach it at all.
  it("focuses the Cancel button on mount and calls onCancel on Escape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(SUGGESTIONS) }));
    const onCancel = vi.fn();
    render(<PokemonIndicatorDialog mapName="Route101" onDone={vi.fn()} onCancel={onCancel} />);

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

const BLOCK = { scriptLabel: "MapPokemonIndicator1", textLabel: "MapPokemonIndicator1Text", species: "RATTATA", text: "Hello", editable: true };
const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe("Indicator editing and response ordering", () => {
  it("prefills an edit, hides coordinates and posts update with the unchanged label", async () => {
    const payload = { map: {}, isDirty: true };
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(SUGGESTIONS)).mockResolvedValueOnce(reply(payload));
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();
    render(<PokemonIndicatorDialog mapName="Map" edit={{ index: 2, block: BLOCK }} onDone={onDone} onCancel={vi.fn()} />);
    await screen.findByText(/Pidgey/);
    expect(screen.queryByLabelText("X")).toBeNull();
    expect(screen.queryByLabelText("Y")).toBeNull();
    expect((screen.getByLabelText("Dialogue") as HTMLInputElement).value).toBe("Hello");
    expect(screen.getByRole("button", { name: /Rattata/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByText(/Pidgey/));
    fireEvent.change(screen.getByLabelText("Dialogue"), { target: { value: "New text" } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(BLOCK.scriptLabel, payload));
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/edit/Map/indicator/update");
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ index: 2, scriptLabel: BLOCK.scriptLabel, species: "PIDGEY", text: "New text" });
  });
  it.each([null, {}, { scriptLabel: 7 }, { refusals: [null] }])("malformed add body %j is an error", async body => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(SUGGESTIONS)).mockResolvedValueOnce(reply(body)));
    const onDone = vi.fn();
    render(<PokemonIndicatorDialog mapName="Map" onDone={onDone} onCancel={vi.fn()} />);
    fireEvent.click(await screen.findByText(/Rattata/));
    fireEvent.change(screen.getByLabelText("Dialogue"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    await screen.findByRole("alert");
    expect(onDone).not.toHaveBeenCalled();
  });
  it("ignores suggestions from a previous map", async () => {
    let resolve!: (r: ReturnType<typeof reply>) => void;
    vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce(reply({ species: [], placement: null })));
    const props = { onDone: vi.fn(), onCancel: vi.fn() };
    const view = render(<PokemonIndicatorDialog mapName="A" {...props} />);
    view.rerender(<PokemonIndicatorDialog mapName="B" {...props} />);
    await screen.findByText("No wild encounters on this map to base an Indicator on.");
    await act(async () => resolve(reply(SUGGESTIONS)));
    expect(screen.queryByText(/Rattata/)).toBeNull();
  });
  it("ignores a submit response after the map changes", async () => {
    let resolve!: (r: ReturnType<typeof reply>) => void;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(SUGGESTIONS)).mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce(reply(SUGGESTIONS)));
    const onDone = vi.fn();
    const props = { onDone, onCancel: vi.fn() };
    const view = render(<PokemonIndicatorDialog mapName="A" {...props} />);
    fireEvent.click(await screen.findByText(/Rattata/));
    fireEvent.change(screen.getByLabelText("Dialogue"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    view.rerender(<PokemonIndicatorDialog mapName="B" {...props} />);
    await act(async () => resolve(reply({ scriptLabel: "Old", map: {}, isDirty: true })));
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe.each(["gba", "gbc"])("%s Indicator inspector", family => {
  const object = { kind: "object" as const, index: 0, x: 1, y: 2, elevation: 0, graphicsId: "MON", movementType: "FACE" };
  const events = { warps: [], coords: [], bgs: [], objects: [0, 1].map(i => ({ x: i, y: 2, sprite: "SPRITE_MONSTER", moveData: "SPRITEMOVEDATA_POKEMON", radiusX: 0, radiusY: 0, hour1: "-1", hour2: "-1", palette: "0", objectType: "OBJECTTYPE_SCRIPT", sightRange: 0, script: "Indicator" + i, eventFlag: "-1", lineIndex: i })), sceneScripts: [], callbacks: [], objectConsts: [] };
  function inspector(index: number, onEditIndicator = vi.fn()) {
    return family === "gba"
      ? <EventInspector mapName="Map" selected={{ ...object, index }} onEditIndicator={onEditIndicator} onMove={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} />
      : <GbcEventInspector mapName="Map" selected={{ kind: "object", index }} events={events} stepsW={10} stepsH={10} onEditIndicator={onEditIndicator} onMove={vi.fn()} onDelete={vi.fn()} onDuplicate={vi.fn()} warnings={[]} onDismissWarnings={vi.fn()} />;
  }
  it("opens Edit Indicator with its block and index", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ indicator: BLOCK }));
    vi.stubGlobal("fetch", fetchMock);
    const onEdit = vi.fn();
    render(inspector(0, onEdit));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Indicator" }));
    expect(onEdit).toHaveBeenCalledWith({ index: 0, block: BLOCK });
    expect(fetchMock).toHaveBeenCalledWith("/api/edit/Map/indicator/at?index=0");
  });
  it("disables changed scripts with their reason", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ indicator: { ...BLOCK, editable: false, reason: "shared script" } })));
    render(inspector(0));
    const button = await screen.findByRole("button", { name: "Edit Indicator" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain("shared script");
    expect(screen.getByText(/shared script/)).toBeTruthy();
  });
  it("omits Edit Indicator for plain NPCs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ indicator: null })));
    render(inspector(0));
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Edit Indicator" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it.each([{}, { indicator: {} }, { indicator: { ...BLOCK, editable: "yes" } }])("rejects malformed lookup %j", async body => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(body)));
    render(inspector(0));
    await screen.findByText("Could not load Indicator: unexpected response.");
    expect(screen.queryByRole("button", { name: "Edit Indicator" })).toBeNull();
  });
  it("ignores A resolving after B, including when B is a plain NPC", async () => {
    let resolve!: (r: ReturnType<typeof reply>) => void;
    vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce(reply({ indicator: null })));
    const view = render(inspector(0));
    view.rerender(inspector(1));
    await act(async () => {});
    await act(async () => resolve(reply({ indicator: BLOCK })));
    expect(screen.queryByRole("button", { name: "Edit Indicator" })).toBeNull();
  });
  it("keeps B's disabled state when A's valid Indicator lookup resolves last", async () => {
    let resolve!: (r: ReturnType<typeof reply>) => void;
    const changed = { ...BLOCK, editable: false, reason: "B changed outside PokeMap" };
    vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce(reply({ indicator: changed })));
    const view = render(inspector(0));
    view.rerender(inspector(1));
    await screen.findByText(/B changed outside PokeMap/);
    await act(async () => resolve(reply({ indicator: BLOCK })));
    const button = screen.getByRole("button", { name: "Edit Indicator" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain("B changed outside PokeMap");
  });

});

describe("Indicator suggestions validation", () => {
  it.each([{ species: [null], placement: null }, { species: [{ species: "X", percent: 20 }], placement: null }, { species: [], placement: {} }])("rejects malformed suggestions %j", async body => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(body)));
    render(<PokemonIndicatorDialog mapName="Map" onDone={vi.fn()} onCancel={vi.fn()} />);
    await screen.findByText(/Could not load suggestions/);
    expect((screen.getByRole("button", { name: "Place" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Indicator text round trip", () => {
  it("preserves wrapped lines and paragraphs when only the species changes", async () => {
    const text = "First line\nSecond line\n\nNext paragraph";
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(SUGGESTIONS)).mockResolvedValueOnce(reply({ map: {}, isDirty: true }));
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();
    render(<PokemonIndicatorDialog mapName="Map" edit={{ index: 0, block: { ...BLOCK, text } }} onDone={onDone} onCancel={vi.fn()} />);
    await screen.findByText(/Pidgey/);
    expect((screen.getByLabelText("Dialogue") as HTMLTextAreaElement).value).toBe(text);
    fireEvent.click(screen.getByText(/Pidgey/));
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).text).toBe(text);
  });
});
