import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignEditor } from "../../src/shared/SignEditor.js";

const anchor = new DOMRect(10, 20, 16, 16);

describe("SignEditor", () => {
  it("places a free-text sign and keeps the editor open on a refusal", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ kind: "empty" }) })
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ refusals: [{ message: "bad character" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SignEditor mapName="Route29" x={2} y={3} anchor={anchor} onDone={vi.fn()} onCancel={vi.fn()} onSessionUpdated={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Place" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "HELLO" } });
    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    await waitFor(() => expect(screen.getByText("bad character")).toBeTruthy());
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/edit/Route29/sign/put", expect.objectContaining({ method: "POST", body: JSON.stringify({ x: 2, y: 3, mode: "free", text: "HELLO" }) }));
    vi.unstubAllGlobals();
  });

  it("opens below a tile in the upper half, above a tile in the lower half, inside the window", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const h = window.innerHeight, w = window.innerWidth;
    const { unmount } = render(<SignEditor mapName="Route29" x={2} y={3} anchor={anchor} onDone={vi.fn()} onCancel={vi.fn()} onSessionUpdated={vi.fn()} />);
    let style = screen.getByRole("dialog").style;
    expect([style.top, style.bottom, style.left]).toEqual(["44px", "", "10px"]);
    unmount();
    render(<SignEditor mapName="Route29" x={2} y={3} anchor={new DOMRect(w - 20, h - 40, 16, 16)} onDone={vi.fn()} onCancel={vi.fn()} onSessionUpdated={vi.fn()} />);
    style = screen.getByRole("dialog").style;
    expect([style.top, style.bottom, style.left]).toEqual(["", "48px", `${w - 308}px`]);
    vi.unstubAllGlobals();
  });

  it.each([
    [{ kind: "other", eventKind: "hidden_item" }, "This tile already has a hidden_item event"],
    [{ kind: "sign", scriptLabel: "Complex", editable: false, reason: "jumpstd", mode: null, text: "", handEdited: false }, "This sign's script is too complex to edit here: jumpstd"],
  ])("renders server branch text", async (reply, expected) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(reply) }));
    render(<SignEditor mapName="Route29" x={2} y={3} anchor={anchor} onDone={vi.fn()} onCancel={vi.fn()} onSessionUpdated={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(expected)).toBeTruthy());
    vi.unstubAllGlobals();
  });

  it("updates editable text and renders a modal object-event note", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ kind: "sign", scriptLabel: "Route29Sign", editable: true, mode: "free", text: "OLD", handEdited: false }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ map: {}, isDirty: true }) });
    const onDone = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<SignEditor mapName="Route29" x={2} y={3} anchor={anchor} hasObjectEvent onDone={onDone} onCancel={vi.fn()} onSessionUpdated={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Update" })).toBeTruthy());
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("An object event is on this tile.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "NEW" } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenLastCalledWith("/api/edit/Route29/sign/put", expect.objectContaining({ method: "POST", body: JSON.stringify({ x: 2, y: 3, mode: "free", text: "NEW", scriptLabel: "Route29Sign" }) }));
    vi.unstubAllGlobals();
  });

  it("forces both hand-edited recovery choices", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ kind: "sign", scriptLabel: "Route29Sign", editable: true, mode: "name", text: "", handEdited: true }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ map: {}, isDirty: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<SignEditor mapName="Route29" x={2} y={3} anchor={anchor} onDone={vi.fn()} onCancel={vi.fn()} onSessionUpdated={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Overwrite" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Overwrite" }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/edit/Route29/sign/put", expect.objectContaining({ method: "POST", body: JSON.stringify({ x: 2, y: 3, mode: "name", text: "", scriptLabel: "Route29Sign", force: true }) })));
    unmount();
    fetchMock.mockReset()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ kind: "sign", scriptLabel: "Route29Sign", editable: true, mode: "name", text: "", handEdited: true }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ map: {}, isDirty: true }) });
    render(<SignEditor mapName="Route29" x={2} y={3} anchor={anchor} onDone={vi.fn()} onCancel={vi.fn()} onSessionUpdated={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Free text" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Free text" }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/edit/Route29/sign/put", expect.objectContaining({ method: "POST", body: JSON.stringify({ x: 2, y: 3, mode: "free", text: "", scriptLabel: "Route29Sign", force: true }) })));
    vi.unstubAllGlobals();
  });

  it("closes on Escape", async () => {
    const onCancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ kind: "empty" }) }));
    render(<SignEditor mapName="Route29" x={2} y={3} anchor={anchor} onDone={vi.fn()} onCancel={onCancel} onSessionUpdated={vi.fn()} />);
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
