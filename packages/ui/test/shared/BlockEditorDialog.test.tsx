import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor, within, cleanup } from "@testing-library/react";
import { gbaAdapter } from "../../src/gba/adapter.js";
import { gbcAdapter } from "../../src/gbc/adapter.js";
import { BlockEditorDialog, usageLine } from "../../src/shared/BlockEditorDialog.js";
import { EditSessionError, type BlockEditSession, type BlockCheckReply } from "../../src/shared/useEditSessionCore.js";
import { shortcutBlocked } from "../../src/shared/shortcutGuard.js";

const usage = {
  files: ["blocks.bin"], tilesets: ["A"],
  maps: [
    { map: "X", interior: 3, border: 1, block0AsBorder: 0 },
    { map: "Y", interior: 2, border: 0, block0AsBorder: 0 },
    { map: "Z", interior: 0, border: 0, block0AsBorder: 0 },
  ],
  sharedGrids: [] as { file: string; maps: string[] }[],
};
const bodies = {
  gbc: {
    blockId: 5, viaBorder: false, revision: "r1",
    block: {
      tiles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      collision: ["FLOOR", "WALL", "FLOOR", "WATER"],
      tilePalettes: ["GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY"],
    },
    sheet: {
      url: "/api/block-sheet/A.png?tv=1&time=day", tileCount: 64,
      tileIds: Array.from({ length: 64 }, (_, i) => i === 3 ? null : 0x10 + i),
      reservedTiles: [0x15],
    },
    options: { collision: ["FLOOR", "WALL", "WATER"], palettes: ["GRAY", "RED"] },
    usage, owner: null, limits: { nextId: 6, cap: 256 },
  },
  gba: {
    blockId: 0x21, viaBorder: false, revision: "r1",
    block: {
      entries: [
        { tile: 1, palette: 0, xFlip: false, yFlip: false },
        { tile: 2, palette: 0, xFlip: true, yFlip: false },
        { tile: 3, palette: 1, xFlip: false, yFlip: true },
        { tile: 4, palette: 1, xFlip: true, yFlip: true },
        { tile: 5, palette: 0, xFlip: false, yFlip: false },
        { tile: 6, palette: 0, xFlip: true, yFlip: false },
        { tile: 7, palette: 1, xFlip: false, yFlip: true },
        { tile: 8, palette: 1, xFlip: true, yFlip: true },
      ],
      behavior: 0, layerType: 1,
    },
    sheet: { url: "/api/block-sheet/A.png?tv=1", tileCount: 64, tileIds: Array.from({ length: 64 }, (_, i) => i) },
    options: {
      behaviors: [{ name: "NORMAL", value: 0 }, { name: "TALL_GRASS", value: 2 }],
      layerTypes: [{ name: "NORMAL", value: 0 }, { name: "COVERED", value: 1 }],
    },
    usage, owner: null, limits: { nextId: 0x22, cap: 1024 },
  },
};

type Entry = { tile: number; palette: number; xFlip: boolean; yFlip: boolean };
type Sent = { request: {
  mode: string;
  draft: {
    tiles: number[]; collision: string[];
    palettes: { square: number; palName: string; scope: "all" | "local" }[];
    entries: Entry[]; behavior: number; layerType: number;
  };
} };
function makeSession(reply: BlockCheckReply = { usage, confirm: false, warnings: [] }) {
  return {
    blockCheck: vi.fn<BlockEditSession["blockCheck"]>().mockResolvedValue(reply),
    blockPreview: vi.fn<BlockEditSession["blockPreview"]>().mockResolvedValue(null),
    blockApply: vi.fn<BlockEditSession["blockApply"]>().mockResolvedValue(true),
  } satisfies BlockEditSession;
}
type Session = ReturnType<typeof makeSession>;
async function mount(family: "gbc" | "gba" = "gbc", body: unknown = bodies[family], session = makeSession()) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
  const order: string[] = [];
  const onApplied = vi.fn(() => { order.push("applied"); });
  const onClose = vi.fn(() => { order.push("closed"); });
  const host = render(<BlockEditorDialog map="X" target={{ block: family === "gbc" ? 5 : 0x21 }}
    from="palette" spec={family === "gbc" ? gbcAdapter.blockEditorSpec : gbaAdapter.blockEditorSpec}
    session={session} onApplied={onApplied} onClose={onClose} />);
  await screen.findByRole("button", { name: "OK" });
  return { ...host, session, onApplied, onClose, order };
}
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const square = (n: number) => button(`Square ${n}`);
const select = (name: string) => screen.getByRole("combobox", { name }) as HTMLSelectElement;
const change = (name: string, value: string) => fireEvent.change(select(name), { target: { value } });
function picker() {
  const img = screen.getByRole("img", { name: "Tile sheet" });
  vi.spyOn(img, "getBoundingClientRect").mockReturnValue({
    left: 0, top: 0, x: 0, y: 0, width: 256, height: 256, right: 256, bottom: 256, toJSON() {},
  } as DOMRect);
  return img;
}
// Coordinates describe user input; all expected placement results below are hand-written literals.
const point = (i: number) => ({ clientX: (i % 16) * 16 + 8, clientY: Math.floor(i / 16) * 16 + 8 });
function pick(i: number) { fireEvent.click(picker(), point(i)); }
async function submit(session: Session) {
  const before = session.blockCheck.mock.calls.length;
  await act(async () => { fireEvent.click(button("OK")); });
  await waitFor(() => expect(session.blockCheck).toHaveBeenCalledTimes(before + 1));
  const call = session.blockCheck.mock.calls.at(-1)!;
  expect(call[1]).toBe("r1");
  return call[0] as Sent;
}
const confirmReply = (): BlockCheckReply => ({
  usage: {
    files: ["blocks.bin"], tilesets: ["A"], sharedGrids: [],
    maps: [
      { map: "X", interior: 3, border: 1, block0AsBorder: 0 },
      { map: "Other", interior: 2, border: 0, block0AsBorder: 0 },
    ],
  },
  confirm: true, warnings: [],
});
const confirmation = () => screen.getByRole("region", { name: "Confirm edit" });
const escape = () => fireEvent.keyDown(document, { key: "Escape" });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("BlockEditorDialog", () => {
  it("prevents closing through Cancel or the backdrop while applying", async () => {
    const session = makeSession();
    let resolveApply!: (value: boolean) => void;
    session.blockApply.mockReturnValue(new Promise(resolve => { resolveApply = resolve; }));
    const host = await mount("gbc", bodies.gbc, session);
    fireEvent.click(await screen.findByRole("button", { name: "OK" }));
    await waitFor(() => expect(session.blockApply).toHaveBeenCalledTimes(1));
    expect((await screen.findByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.mouseDown(host.container.querySelector(".warp-modal__backdrop")!);
    expect(host.onClose).not.toHaveBeenCalled();
    await act(async () => { resolveApply(true); });
    expect(host.onApplied).toHaveBeenCalledTimes(1);
    expect(host.onClose).toHaveBeenCalledTimes(1);
  });

  it("combines GBA behavior names that share a value", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = structuredClone(bodies.gba);
    body.block.behavior = 162;
    body.options.behaviors = [{ name: "MB_A", value: 162 }, { name: "MB_B", value: 162 }];
    await mount("gba", body);
    const behavior = await screen.findByRole("combobox", { name: "Behavior" });
    const options = within(behavior).getAllByRole("option").filter(option => (option as HTMLOptionElement).value === "162");
    expect(options).toHaveLength(1);
    expect(options[0]!.textContent).toBe("MB_A / MB_B");
    expect(error.mock.calls.some(args => args.some(arg => String(arg).includes("same key")))).toBe(false);
  });
  it("gbc renders four collision dropdowns and a palette control", async () => {
    await mount();
    const labels = gbcAdapter.blockEditorSpec.blockFields.map(field => field.label);
    expect(labels.map(label => select(label).value)).toEqual(["FLOOR", "WALL", "FLOOR", "WATER"]);
    expect(screen.getAllByRole("combobox")).toHaveLength(5);
    expect(select("Palette").value).toBe("GRAY");
    expect(screen.queryByRole("checkbox", { name: "X flip" })).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Edit block $05" }).getAttribute("aria-modal")).toBe("true");
  });

  it("gba renders layer tabs, palette and flip controls", async () => {
    await mount("gba");
    const tabs = within(screen.getByRole("tablist"));
    expect(tabs.getByRole("tab", { name: "Bottom" }).getAttribute("aria-selected")).toBe("true");
    expect(tabs.getByRole("tab", { name: "Top" }).getAttribute("aria-selected")).toBe("false");
    expect(select("Palette").value).toBe("0");
    expect((screen.getByRole("checkbox", { name: "X flip" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "Y flip" }) as HTMLInputElement).checked).toBe(false);
    const [behavior, layer] = gbaAdapter.blockEditorSpec.blockFields;
    expect(select(behavior!.label).selectedOptions[0]!.textContent).toBe("NORMAL");
    expect(select(layer!.label).selectedOptions[0]!.textContent).toBe("COVERED");
    expect(screen.getByRole("dialog", { name: "Edit metatile $021" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Tile sheet" }).getAttribute("src")).toMatch(/&pal=0$/);
  });

  it("the panel carries the size class", async () => {
    await mount();
    const panel = screen.getByRole("dialog");
    expect(panel.classList.contains("warp-modal__panel")).toBe(true);
    expect(panel.classList.contains("block-editor")).toBe(true);
    expect(panel.parentElement!.classList.contains("warp-modal__backdrop")).toBe(true);
  });

  it("plain click places one tile", async () => {
    const { session } = await mount();
    pick(0); fireEvent.click(square(6));
    expect((await submit(session)).request.draft.tiles).toEqual([
      1, 2, 3, 4, 5, 6, 0x10, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
  });

  it("Ctrl+click places 2x2 through placeGroup", async () => {
    const { session } = await mount();
    pick(16); fireEvent.click(square(5), { ctrlKey: true });
    expect((await submit(session)).request.draft.tiles).toEqual([
      1, 2, 3, 4, 5, 0x20, 0x21, 8, 9, 0x30, 0x31, 12, 13, 14, 15, 16,
    ]);
  });

  it("Ctrl+Shift+click places 4x4 and skips past the edge", async () => {
    const session = makeSession();
    session.blockApply.mockResolvedValue(false);
    await mount("gbc", bodies.gbc, session);
    pick(0); fireEvent.click(square(10), { ctrlKey: true, shiftKey: true });
    expect((await submit(session)).request.draft.tiles).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0x10, 0x11, 13, 14, 0x20, 0x21,
    ]);
    await waitFor(() => expect(button("OK").disabled).toBe(false));
    // At the corner, 2x2 and 4x4 clip identically. Also place at the origin to distinguish them.
    fireEvent.click(square(0), { ctrlKey: true, shiftKey: true });
    expect((await submit(session)).request.draft.tiles).toEqual([
      0x10, 0x11, 0x12, 4, 0x20, 0x21, 0x22, 0x23,
      0x30, 0x31, 0x32, 0x33, 0x40, 0x41, 0x42, 0x43,
    ]);
  });

  it("a group skips a null sheet cell", async () => {
    const { session } = await mount();
    pick(2); fireEvent.click(square(0), { ctrlKey: true });
    expect((await submit(session)).request.draft.tiles).toEqual([
      0x12, 2, 3, 4, 0x22, 0x23, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
  });

  it("gba Ctrl+Shift+click still places 2x2 on the shown layer", async () => {
    const { session } = await mount("gba");
    fireEvent.click(screen.getByRole("tab", { name: "Top" }));
    pick(4); fireEvent.click(square(0), { ctrlKey: true, shiftKey: true });
    expect((await submit(session)).request.draft.entries).toEqual([
      { tile: 1, palette: 0, xFlip: false, yFlip: false },
      { tile: 2, palette: 0, xFlip: true, yFlip: false },
      { tile: 3, palette: 1, xFlip: false, yFlip: true },
      { tile: 4, palette: 1, xFlip: true, yFlip: true },
      { tile: 4, palette: 0, xFlip: false, yFlip: false },
      { tile: 5, palette: 0, xFlip: true, yFlip: false },
      { tile: 20, palette: 1, xFlip: false, yFlip: true },
      { tile: 21, palette: 1, xFlip: true, yFlip: true },
    ]);
  });

  it("mode heading shows while the modifier is held", async () => {
    const host = await mount();
    fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
    expect(screen.getByTestId("block-editor-mode").textContent).toBe("Place 2x2");
    fireEvent.keyDown(window, { key: "Shift", ctrlKey: true, shiftKey: true });
    expect(screen.getByTestId("block-editor-mode").textContent).toBe("Place 4x4");
    fireEvent.keyUp(window, { key: "Shift", ctrlKey: true });
    fireEvent.keyUp(window, { key: "Control" });
    expect(screen.queryByTestId("block-editor-mode")).toBeNull();
    host.unmount();
    await mount("gba");
    fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
    fireEvent.keyDown(window, { key: "Shift", ctrlKey: true, shiftKey: true });
    expect(screen.getByTestId("block-editor-mode").textContent).toBe("Place 2x2");
    expect(screen.getByTestId("block-editor-mode").getAttribute("role")).toBe("status");
    fireEvent.blur(window);
    expect(screen.queryByTestId("block-editor-mode")).toBeNull();
  });

  it("a null or reserved picker cell is not selectable", async () => {
    const session = makeSession();
    session.blockApply.mockResolvedValue(false);
    await mount("gbc", bodies.gbc, session);
    const img = picker();
    expect(screen.getByTitle("Reserved at run time").classList.contains("block-editor__reserved")).toBe(true);
    fireEvent.mouseMove(img, point(5));
    expect(screen.getByTestId("block-editor-hover").textContent).toBe("Reserved at run time");
    fireEvent.mouseMove(img, point(0));
    expect(screen.getByTestId("block-editor-hover").textContent).toBe("Tile: $10");
    fireEvent.mouseMove(img, point(3));
    expect(screen.getByTestId("block-editor-hover").textContent).toBe("");
    for (const index of [3, 5]) {
      fireEvent.click(img, point(index)); fireEvent.click(square(0));
      expect((await submit(session)).request.draft.tiles).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
      ]);
      await waitFor(() => expect(button("OK").disabled).toBe(false));
    }
    // An invalid click must also preserve an existing selection: selecting null would
    // otherwise look identical to ignoring it when there was no selected tile.
    fireEvent.click(img, point(0));
    fireEvent.click(img, point(3)); fireEvent.click(square(0));
    fireEvent.click(img, point(5)); fireEvent.click(square(1));
    expect((await submit(session)).request.draft.tiles).toEqual([
      0x10, 0x10, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
    fireEvent.mouseLeave(img);
    expect(screen.getByTestId("block-editor-hover").textContent).toBe("");
  });

  it("gba hover shows three hex digits", async () => {
    await mount("gba");
    fireEvent.mouseMove(picker(), point(10));
    expect(screen.getByTestId("block-editor-hover").textContent).toBe("Tile: $00A");
  });

  it("palette change asks All/Local and sends the scope", async () => {
    const { session } = await mount();
    change("Palette", "RED");
    const prompt = screen.getByRole("dialog", { name: "Palette scope" });
    expect(prompt.getAttribute("aria-modal")).toBe("true");
    // Let the hook's real 150ms preview debounce run, so this assertion is not vacuous.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 180)); });
    expect(session.blockPreview).toHaveBeenCalled();
    expect(session.blockCheck).not.toHaveBeenCalled();
    for (const [payload] of session.blockPreview.mock.calls) {
      expect((payload as Sent).request.draft.palettes).toEqual([]);
    }
    fireEvent.click(within(prompt).getByRole("button", { name: "Local" }));
    expect((await submit(session)).request.draft.palettes).toEqual([{ square: 0, palName: "RED", scope: "local" }]);
  });

  it("palette change asks All/Local and sends the scope with All and replaces the square entry", async () => {
    const session = makeSession();
    session.blockApply.mockResolvedValue(false);
    await mount("gbc", bodies.gbc, session);
    change("Palette", "RED");
    fireEvent.click(within(screen.getByRole("dialog", { name: "Palette scope" })).getByRole("button", { name: "All" }));
    expect((await submit(session)).request.draft.palettes).toEqual([{ square: 0, palName: "RED", scope: "all" }]);
    await waitFor(() => expect(button("OK").disabled).toBe(false));
    change("Palette", "GRAY");
    fireEvent.click(within(screen.getByRole("dialog", { name: "Palette scope" })).getByRole("button", { name: "All" }));
    expect((await submit(session)).request.draft.palettes).toEqual([{ square: 0, palName: "GRAY", scope: "all" }]);
  });

  it("palette prompt Cancel leaves the draft", async () => {
    const { session } = await mount();
    change("Palette", "RED");
    fireEvent.click(within(screen.getByRole("dialog", { name: "Palette scope" })).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Palette scope" })).toBeNull();
    expect(select("Palette").value).toBe("GRAY");
    expect((await submit(session)).request.draft.palettes).toEqual([]);
  });

  it("gba palette and flip edit numbers and booleans", async () => {
    const { session } = await mount("gba");
    fireEvent.click(square(1)); change("Palette", "5");
    fireEvent.click(screen.getByRole("checkbox", { name: "X flip" }));
    expect((await submit(session)).request.draft.entries[1]).toEqual({ tile: 2, palette: 5, xFlip: false, yFlip: false });
  });

  it("typed values sent as numbers (GBA) and names (GBC)", async () => {
    const gba = await mount("gba");
    const label = gbaAdapter.blockEditorSpec.blockFields[0]!.label;
    const tallGrass = within(select(label)).getByRole("option", { name: "TALL_GRASS" }) as HTMLOptionElement;
    change(label, tallGrass.value);
    expect((await submit(gba.session)).request.draft.behavior).toBe(2);
    gba.unmount();
    const gbc = await mount();
    change(gbcAdapter.blockEditorSpec.blockFields[2]!.label, "WATER");
    expect((await submit(gbc.session)).request.draft.collision).toEqual(["FLOOR", "WALL", "WATER", "WATER"]);
  });

  it("an unknown value falls back to a text box", async () => {
    const gbcBody = structuredClone(bodies.gbc);
    gbcBody.block.collision[0] = "LEDGE";
    const gbc = await mount("gbc", gbcBody);
    const collision = screen.getByRole("textbox", { name: gbcAdapter.blockEditorSpec.blockFields[0]!.label }) as HTMLInputElement;
    expect(collision.value).toBe("LEDGE");
    fireEvent.change(collision, { target: { value: "PIT" } });
    expect((await submit(gbc.session)).request.draft.collision).toEqual(["PIT", "WALL", "FLOOR", "WATER"]);
    gbc.unmount();
    const gbaBody = structuredClone(bodies.gba);
    gbaBody.block.behavior = 7;
    const gba = await mount("gba", gbaBody);
    const behavior = screen.getByRole("textbox", { name: gbaAdapter.blockEditorSpec.blockFields[0]!.label }) as HTMLInputElement;
    expect(behavior.value).toBe("7");
    fireEvent.change(behavior, { target: { value: "9" } });
    expect((await submit(gba.session)).request.draft.behavior).toBe(9);
  });

  it("OK with confirm shows the list; Cancel returns with the draft", async () => {
    const session = makeSession(confirmReply());
    await mount("gbc", bodies.gbc, session);
    pick(0); fireEvent.click(square(6));
    const first = await submit(session);
    expect(within(confirmation()).getByText("Other: 2 interior, 0 border")).toBeTruthy();
    expect(session.blockApply).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "OK" })).toBeNull();
    fireEvent.click(within(confirmation()).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("region", { name: "Confirm edit" })).toBeNull();
    expect(button("OK").disabled).toBe(false);
    expect((await submit(session)).request).toEqual(first.request);
    expect(session.blockApply).not.toHaveBeenCalled();
    expect(first.request.draft.tiles).toEqual([1, 2, 3, 4, 5, 6, 0x10, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it("OK with confirm shows the list; Apply sends the checked request", async () => {
    const session = makeSession(confirmReply());
    const host = await mount("gbc", bodies.gbc, session);
    pick(0); fireEvent.click(square(6));
    const checked = await submit(session);
    expect(session.blockApply).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(within(confirmation()).getByRole("button", { name: "Apply" })); });
    expect(session.blockApply).toHaveBeenCalledTimes(1);
    expect(session.blockApply).toHaveBeenCalledWith(checked, "r1");
    expect(host.onApplied).toHaveBeenCalledTimes(1);
    expect(host.onClose).toHaveBeenCalledTimes(1);
    expect(host.order).toEqual(["applied", "closed"]);
  });

  it("OK with confirm false applies once", async () => {
    const host = await mount();
    const checked = await submit(host.session);
    expect(host.session.blockApply).toHaveBeenCalledTimes(1);
    expect(host.session.blockApply).toHaveBeenCalledWith(checked, "r1");
    expect(host.onApplied).toHaveBeenCalledTimes(1);
    expect(host.onClose).toHaveBeenCalledTimes(1);
    expect(host.order).toEqual(["applied", "closed"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/edit/X/block?block=5");
  });

  it("Save as new refusal text shown and disabled", async () => {
    const session = makeSession({ usage, confirm: false, warnings: [], refusal: { code: "SHARED_GRID", error: "Grid shared by A, B" } });
    await mount("gbc", bodies.gbc, session);
    await act(async () => { fireEvent.click(button("Save as new")); });
    expect((session.blockCheck.mock.calls.at(-1)![0] as Sent).request.mode).toBe("saveAsNew");
    expect(session.blockCheck.mock.calls.at(-1)![1]).toBe("r1");
    expect(screen.getByTestId("block-editor-refusal").textContent).toBe("Grid shared by A, B");
    expect(button("Save as new").disabled).toBe(true);
    expect(button("OK").disabled).toBe(false);
    expect(session.blockApply).not.toHaveBeenCalled();
    pick(0); fireEvent.click(square(0));
    expect(screen.queryByTestId("block-editor-refusal")?.textContent ?? "").toBe("");
    expect(button("Save as new").disabled).toBe(false);
  });

  it("STALE keeps the draft", async () => {
    const session = makeSession({ usage, confirm: false, warnings: [], refusal: { code: "STALE", error: "x" } });
    const host = await mount("gbc", bodies.gbc, session);
    pick(0); fireEvent.click(square(6));
    await submit(session);
    expect(screen.getByRole("alert").textContent).toBe("The block changed since this editor opened; reopen it");
    expect(square(6).textContent).toMatch(/(?:\$|0x)?10/i);
    expect(button("OK").disabled).toBe(false);
    expect(session.blockApply).not.toHaveBeenCalled();
    session.blockCheck.mockResolvedValue({ usage, confirm: false, warnings: [] });
    session.blockApply.mockRejectedValue(new EditSessionError("stale", "STALE"));
    expect((await submit(session)).request.draft.tiles).toEqual([1, 2, 3, 4, 5, 6, 0x10, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(screen.getByRole("alert").textContent).toBe("The block changed since this editor opened; reopen it");
    expect(square(6).textContent).toMatch(/(?:\$|0x)?10/i);
    expect(button("OK").disabled).toBe(false);
    expect(session.blockApply).toHaveBeenCalledTimes(1);
    expect(host.onClose).not.toHaveBeenCalled();
    expect(host.onApplied).not.toHaveBeenCalled();
  });

  it("block-0 notice", async () => {
    const host = await mount("gbc", { ...bodies.gbc, viaBorder: true, blockId: 0x0A });
    expect(screen.getByRole("note").textContent).toBe("This cell is block 0; editing the border block $0A");
    host.unmount();
    await mount();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("usage line", async () => {
    expect(usageLine(usage, "X")).toBe("Used 3 times on this map (+ border), 2 times on 1 other maps; 2 maps affected");
    expect(usageLine({ ...usage, tilesets: ["A", "B"] }, "X")).toBe("Used 3 times on this map (+ border), 2 times on 1 other maps; files shared by tilesets A, B; 2 maps affected");
    expect(usageLine({
      files: ["f"], tilesets: ["A"],
      maps: [{ map: "W", interior: 4, border: 0, block0AsBorder: 0 }],
      sharedGrids: [{ file: "f", maps: ["W", "X"] }],
    }, "X")).toBe("Used 4 times on this map, 0 times on 0 other maps; 2 maps affected");
    expect(usageLine(usage, "Missing")).toBe("Used 0 times on this map, 6 times on 2 other maps; 2 maps affected");
    const session = makeSession({ ...confirmReply(), warnings: ["Crosses the primary/secondary split"] });
    await mount("gbc", bodies.gbc, session);
    expect(screen.getByTestId("block-editor-usage").textContent).toBe("Used 3 times on this map (+ border), 2 times on 1 other maps; 2 maps affected");
    await submit(session);
    expect(screen.getAllByRole("status").some(line => line.textContent === "Crosses the primary/secondary split")).toBe(true);
  });

  it("Escape closes only the topmost layer", async () => {
    const session = makeSession(confirmReply());
    const host = await mount("gbc", bodies.gbc, session);
    change("Palette", "RED");
    escape();
    expect(screen.queryByRole("dialog", { name: "Palette scope" })).toBeNull();
    expect(select("Palette").value).toBe("GRAY");
    expect(host.onClose).not.toHaveBeenCalled();
    await submit(session);
    expect(confirmation()).toBeTruthy();
    escape();
    expect(screen.queryByRole("region", { name: "Confirm edit" })).toBeNull();
    expect(button("OK").disabled).toBe(false);
    expect(host.onClose).not.toHaveBeenCalled();
    expect(session.blockApply).not.toHaveBeenCalled();
    const unrelated = document.createElement("div");
    unrelated.setAttribute("aria-modal", "true");
    document.body.append(unrelated);
    try {
      escape();
      expect(host.onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "Edit block $05" })).toBeTruthy();
    } finally { unrelated.remove(); }
    escape();
    expect(host.onClose).toHaveBeenCalledTimes(1);
  });

  it("Tab stays inside the dialog", async () => {
    await mount();
    const panel = screen.getByRole("dialog", { name: "Edit block $05" });
    const controls = [...panel.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]")]
      .filter(element => !element.matches(":disabled") && element.tabIndex >= 0 && !element.hidden);
    expect(controls.length).toBeGreaterThan(1);
    const first = controls[0]!; const last = controls.at(-1)!;
    last.focus(); fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    change("Palette", "RED");
    const prompt = within(screen.getByRole("dialog", { name: "Palette scope" }));
    const all = prompt.getByRole("button", { name: "All" });
    const cancel = prompt.getByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(all);
    cancel.focus(); fireEvent.keyDown(cancel, { key: "Tab" });
    expect(document.activeElement).toBe(all);
  });

  it("load error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 })));
    const onClose = vi.fn();
    render(<BlockEditorDialog map="X" target={{ block: 5 }} from="palette" spec={gbcAdapter.blockEditorSpec}
      session={makeSession()} onClose={onClose} onApplied={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toBe("boom");
    fireEvent.click(button("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "OK" })).toBeNull();
  });

  it("tool shortcuts are blocked while open", async () => {
    const host = await mount();
    expect(shortcutBlocked(new KeyboardEvent("keydown", { key: "k" }))).toBe(true);
    host.unmount();
    expect(shortcutBlocked(new KeyboardEvent("keydown", { key: "k" }))).toBe(false);
  });

  it("focus follows confirmation and returns after Cancel or Escape", async () => {
    const session = makeSession(confirmReply());
    await mount("gbc", bodies.gbc, session);
    await submit(session);
    expect(document.activeElement).toBe(within(confirmation()).getByRole("button", { name: "Apply" }));
    fireEvent.click(within(confirmation()).getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(button("OK"));
    await submit(session);
    expect(document.activeElement).toBe(within(confirmation()).getByRole("button", { name: "Apply" }));
    escape();
    expect(document.activeElement).toBe(button("OK"));
  });

  it("initial focus is on a control inside the loaded panel", async () => {
    await mount();
    const panel = screen.getByRole("dialog", { name: "Edit block $05" });
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(panel);
  });

  it("consumes Escape without closing while applying", async () => {
    const session = makeSession();
    session.blockApply.mockReturnValue(new Promise(() => {}));
    const host = await mount("gbc", bodies.gbc, session);
    await submit(session);
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(host.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Edit block $05" })).toBeTruthy();
  });

  it("ignores an Escape prevented during window capture", async () => {
    const prevent = (event: KeyboardEvent) => event.preventDefault();
    window.addEventListener("keydown", prevent, true);
    try {
      const host = await mount();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      expect(host.onClose).not.toHaveBeenCalled();
    } finally { window.removeEventListener("keydown", prevent, true); }
  });

  it("disables actions throughout checking and applying", async () => {
    const session = makeSession();
    let resolveCheck!: (value: BlockCheckReply) => void;
    session.blockCheck.mockReturnValue(new Promise(resolve => { resolveCheck = resolve; }));
    session.blockApply.mockReturnValue(new Promise(() => {}));
    await mount("gbc", bodies.gbc, session);
    fireEvent.click(button("OK"));
    expect(button("OK").disabled).toBe(true);
    expect(button("Save as new").disabled).toBe(true);
    await act(async () => { resolveCheck({ usage, confirm: false, warnings: [] }); });
    expect(session.blockApply).toHaveBeenCalledTimes(1);
    expect(button("OK").disabled).toBe(true);
    expect(button("Save as new").disabled).toBe(true);
  });

  it("renders a preview only for a png reply", async () => {
    const session = makeSession();
    session.blockPreview.mockResolvedValue({ png: "AAA" });
    const host = await mount("gbc", bodies.gbc, session);
    expect((await screen.findByRole("img", { name: "Block preview" })).getAttribute("src")).toBe("data:image/png;base64,AAA");
    host.unmount();
    const empty = makeSession();
    await mount("gbc", bodies.gbc, empty);
    await waitFor(() => expect(empty.blockPreview).toHaveBeenCalled());
    expect(screen.queryByRole("img", { name: "Block preview" })).toBeNull();
  });

  it("uses the sheet image offset for picker coordinates", async () => {
    const { session } = await mount();
    const img = screen.getByRole("img", { name: "Tile sheet" });
    vi.spyOn(img, "getBoundingClientRect").mockReturnValue({ left: 100, top: 50, x: 100, y: 50, width: 256, height: 256, right: 356, bottom: 306, toJSON() {} } as DOMRect);
    fireEvent.click(img, { clientX: 140, clientY: 74 });
    fireEvent.click(square(0));
    expect((await submit(session)).request.draft.tiles).toEqual([0x22, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it("deselects a picker cell clicked twice", async () => {
    const { session, container } = await mount();
    pick(0);
    expect(container.querySelector(".block-editor__selected")).not.toBeNull();
    pick(0);
    expect(container.querySelector(".block-editor__selected")).toBeNull();
    fireEvent.click(square(0));
    expect((await submit(session)).request.draft.tiles).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it("sizes the picker image at twice its natural dimensions", async () => {
    await mount();
    const img = screen.getByRole("img", { name: "Tile sheet" }) as HTMLImageElement;
    Object.defineProperty(img, "naturalWidth", { value: 128 });
    Object.defineProperty(img, "naturalHeight", { value: 64 });
    fireEvent.load(img);
    expect(img.style.width).toBe("256px");
    expect(img.style.height).toBe("128px");
  });

  it("ignores picker clicks below the sheet", async () => {
    const { session } = await mount();
    fireEvent.click(picker(), point(64));
    fireEvent.click(square(0));
    expect((await submit(session)).request.draft.tiles).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it("uses the current GBA square palette for the picker URL", async () => {
    await mount("gba");
    fireEvent.click(square(2));
    expect(screen.getByRole("img", { name: "Tile sheet" }).getAttribute("src")).toMatch(/&pal=1$/);
    fireEvent.click(screen.getByRole("tab", { name: "Top" }));
    expect(select("Palette").value).toBe("1");
    expect(screen.getByRole("img", { name: "Tile sheet" }).getAttribute("src")).toMatch(/&pal=1$/);
    change("Palette", "3");
    expect(screen.getByRole("img", { name: "Tile sheet" }).getAttribute("src")).toMatch(/&pal=3$/);
  });

  it("applies a GBC palette locally to a nonzero square", async () => {
    const body = structuredClone(bodies.gbc);
    body.block.tilePalettes[5] = "RED";
    const { session } = await mount("gbc", body);
    fireEvent.click(square(5));
    expect(select("Palette").value).toBe("RED");
    change("Palette", "GRAY");
    fireEvent.click(within(screen.getByRole("dialog", { name: "Palette scope" })).getByRole("button", { name: "Local" }));
    expect((await submit(session)).request.draft.palettes).toEqual([{ square: 5, palName: "GRAY", scope: "local" }]);
  });

  it("edits GBA top-layer Y flip and layer type", async () => {
    const { session } = await mount("gba");
    fireEvent.click(screen.getByRole("tab", { name: "Top" }));
    fireEvent.click(square(3));
    fireEvent.click(screen.getByRole("checkbox", { name: "Y flip" }));
    change(gbaAdapter.blockEditorSpec.blockFields[1]!.label, "0");
    const draft = (await submit(session)).request.draft;
    expect(draft.entries).toEqual([
      { tile: 1, palette: 0, xFlip: false, yFlip: false }, { tile: 2, palette: 0, xFlip: true, yFlip: false },
      { tile: 3, palette: 1, xFlip: false, yFlip: true }, { tile: 4, palette: 1, xFlip: true, yFlip: true },
      { tile: 5, palette: 0, xFlip: false, yFlip: false }, { tile: 6, palette: 0, xFlip: true, yFlip: false },
      { tile: 7, palette: 1, xFlip: false, yFlip: true }, { tile: 8, palette: 1, xFlip: true, yFlip: false },
    ]);
    expect(draft.layerType).toBe(0);
  });

  it("leaves collision unchanged when Choose is selected", async () => {
    const { session } = await mount();
    change(gbcAdapter.blockEditorSpec.blockFields[0]!.label, "");
    expect((await submit(session)).request.draft.collision).toEqual(["FLOOR", "WALL", "FLOOR", "WATER"]);
  });

  it("keeps invalid numeric text visible without sending it", async () => {
    const body = structuredClone(bodies.gba); body.block.behavior = 7;
    const { session } = await mount("gba", body);
    const input = screen.getByRole("textbox", { name: gbaAdapter.blockEditorSpec.blockFields[0]!.label }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "9x" } });
    expect(input.value).toBe("9x");
    expect((await submit(session)).request.draft.behavior).toBe(7);
  });

  it("keeps the fallback textbox while typing through a known value", async () => {
    const body = structuredClone(bodies.gba); body.block.behavior = 7;
    const { session } = await mount("gba", body);
    const label = gbaAdapter.blockEditorSpec.blockFields[0]!.label;
    fireEvent.change(screen.getByRole("textbox", { name: label }), { target: { value: "2" } });
    expect((screen.getByRole("textbox", { name: label }) as HTMLInputElement).value).toBe("2");
    fireEvent.change(screen.getByRole("textbox", { name: label }), { target: { value: "20" } });
    expect((screen.getByRole("textbox", { name: label }) as HTMLInputElement).value).toBe("20");
    expect((await submit(session)).request.draft.behavior).toBe(20);
  });

  it("counts block zero borders, prefers exact map names and filters confirmation usage", async () => {
    expect(usageLine({ files: [], tilesets: ["A"], sharedGrids: [{ file: "f", maps: ["W", "X"] }], maps: [
      { map: "W", interior: 1, border: 0, block0AsBorder: 0 }, { map: "X", interior: 2, border: 0, block0AsBorder: 3 },
      { map: "B", interior: 0, border: 0, block0AsBorder: 4 },
    ] }, "X")).toBe("Used 2 times on this map (+ border), 5 times on 2 other maps; 3 maps affected");
    expect(usageLine({ files: [], tilesets: ["A"], sharedGrids: [], maps: [
      { map: "X", interior: 2, border: 0, block0AsBorder: 3 }, { map: "B", interior: 0, border: 0, block0AsBorder: 4 },
    ] }, "X")).toBe("Used 2 times on this map (+ border), 4 times on 1 other maps; 2 maps affected");
    const checkUsage = { files: [], tilesets: ["A"], sharedGrids: [], maps: [
      { map: "X", interior: 3, border: 1, block0AsBorder: 0 }, { map: "Other", interior: 2, border: 0, block0AsBorder: 0 },
      { map: "Zero", interior: 0, border: 0, block0AsBorder: 0 }, { map: "B0", interior: 0, border: 0, block0AsBorder: 2 },
    ] };
    const session = makeSession({ usage: checkUsage, confirm: true, warnings: [] });
    await mount("gbc", bodies.gbc, session);
    await submit(session);
    const region = within(confirmation());
    expect(region.getAllByRole("listitem").map(item => item.textContent)).toEqual(["X: 3 interior, 1 border", "Other: 2 interior, 0 border", "B0: 0 interior, 2 border"]);
    expect(region.getByText("Used 3 times on this map (+ border), 4 times on 2 other maps; 3 maps affected")).toBeTruthy();
  });

  it("returns focus to the panel when Apply disappears", async () => {
    const session = makeSession(confirmReply());
    session.blockApply.mockReturnValue(new Promise(() => {}));
    await mount("gbc", bodies.gbc, session);
    await submit(session);
    const apply = within(confirmation()).getByRole("button", { name: "Apply" });
    apply.focus();
    fireEvent.click(apply);
    expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "Edit block $05" }));
  });

  it("does not steal focus from a later modal during confirmation", async () => {
    const session = makeSession();
    let resolveCheck!: (value: BlockCheckReply) => void;
    session.blockCheck.mockReturnValue(new Promise(resolve => { resolveCheck = resolve; }));
    await mount("gbc", bodies.gbc, session);
    fireEvent.click(button("OK"));
    const modal = document.createElement("div"); modal.setAttribute("aria-modal", "true");
    const control = document.createElement("button"); modal.append(control); document.body.append(modal); control.focus();
    try {
      await act(async () => { resolveCheck(confirmReply()); });
      expect(document.activeElement).toBe(control);
    } finally { modal.remove(); }
  });

  it("focuses Apply after a palette prompt outlasts the confirmation check", async () => {
    const session = makeSession();
    let resolveCheck!: (value: BlockCheckReply) => void;
    session.blockCheck.mockReturnValue(new Promise(resolve => { resolveCheck = resolve; }));
    await mount("gbc", bodies.gbc, session);
    fireEvent.click(button("OK"));
    change("Palette", "RED");
    const prompt = screen.getByRole("dialog", { name: "Palette scope" });
    const all = within(prompt).getByRole("button", { name: "All" });
    expect(document.activeElement).toBe(all);
    await act(async () => { resolveCheck(confirmReply()); });
    expect(document.activeElement).toBe(all);
    fireEvent.click(within(prompt).getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(within(confirmation()).getByRole("button", { name: "Apply" }));
  });

  it("returns focus to the opener when the dialog closes", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Open block editor";
    document.body.append(opener);
    try {
      opener.focus();
      const host = await mount();
      expect(document.activeElement).not.toBe(opener);
      host.unmount();
      await waitFor(() => expect(document.activeElement).toBe(opener));
    } finally { opener.remove(); }
  });
});
