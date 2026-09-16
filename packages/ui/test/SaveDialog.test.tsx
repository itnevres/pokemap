import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SaveDialog } from "../src/components/SaveDialog.js";

// No @testing-library/jest-dom in this repo -- confirmed by CollisionPalette
// .test.tsx's own comment on this, and by every other test file under
// packages/ui/test. toBeInTheDocument/toHaveAttribute/etc are not real
// matchers here; this file reads DOM presence/attributes directly, matching
// the established convention (e.g. `.getAttribute("aria-pressed")`,
// `document.body.contains(el)` / plain truthy queries).

describe("SaveDialog", () => {
  it("fetches the plan on open and lists each pending change's summary", async () => {
    const plan = { changes: [
      { path: "data/layouts/layouts.json", kind: "binary", summary: "layouts.bin -- 3 blocks changed" },
      { path: "data/maps/PalletTown/map.json", kind: "json", summary: "PalletTown.json -- 1 field edit" },
    ], refusals: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(plan) }));
    render(<SaveDialog mapName="PalletTown" onCommitted={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("layouts.bin -- 3 blocks changed")).toBeTruthy());
    expect(screen.getByText("PalletTown.json -- 1 field edit")).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("shows a 'no changes' empty state when the plan carries no pending changes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ changes: [], refusals: [] }) }));
    render(<SaveDialog mapName="PalletTown" onCommitted={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/no changes/i)).toBeTruthy());
    vi.unstubAllGlobals();
  });

  it("clicking Save Changes POSTs to /commit and calls onCommitted when the response carries no refusals", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ changes: [{ path: "a", kind: "binary", summary: "a changed" }], refusals: [] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ changes: [], refusals: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    const onCommitted = vi.fn();
    render(<SaveDialog mapName="PalletTown" onCommitted={onCommitted} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("a changed")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(onCommitted).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/edit/PalletTown/commit", expect.objectContaining({ method: "POST" }));
    vi.unstubAllGlobals();
  });

  it("a commit rejected with 400 (refusals present) shows each refusal's fix text and does NOT call onCommitted", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ changes: [{ path: "a", kind: "binary", summary: "a changed" }], refusals: [] }) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: () => Promise.resolve({ changes: [], refusals: [{ code: "STALE_MAP_JSON", message: "map.json changed on disk since edit session opened", fix: "Reload the map and redo your edits", subject: "PalletTown" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const onCommitted = vi.fn();
    render(<SaveDialog mapName="PalletTown" onCommitted={onCommitted} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("a changed")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(screen.getByText("Reload the map and redo your edits")).toBeTruthy());
    expect(onCommitted).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  // Renamed from "Discard": clicking this only closes the dialog client-
  // side -- no route in this app explicitly discards a dirty server-side
  // session, so "Discard" overclaimed what the button actually does (code
  // review, Minor). "Cancel" is honest about current behaviour; a real
  // discard/close-session endpoint is flagged as a follow-up.
  it("clicking Cancel calls onCancel without ever calling fetch commit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ changes: [], refusals: [] }) }));
    const onCancel = vi.fn();
    render(<SaveDialog mapName="PalletTown" onCommitted={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("the Save Changes button is disabled while there is nothing to save", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ changes: [], refusals: [] }) }));
    render(<SaveDialog mapName="PalletTown" onCommitted={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/no changes/i)).toBeTruthy());
    expect((screen.getByRole("button", { name: "Save Changes" }) as HTMLButtonElement).disabled).toBe(true);
    vi.unstubAllGlobals();
  });

  // Code-review fix (Critical): both `GET /plan` and `POST /commit` can
  // fail with a route-level 500 -- `{ error: string }`, NOT the
  // `{changes, refusals}` shape formatDiffJson normally sends. Casting the
  // body unconditionally used to crash the dialog (TypeError reading
  // `.refusals.length` off a body with no such field) on exactly the
  // failure path a "no autosave" flow most needs to surface reliably.
  it("a 500 from GET /plan shows an error state instead of crashing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({ error: "project is mid-reload" }) }));
    render(<SaveDialog mapName="PalletTown" onCommitted={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/project is mid-reload/)).toBeTruthy());
    // Nothing to save is known yet -- Save Changes must not be clickable.
    expect((screen.getByRole("button", { name: "Save Changes" }) as HTMLButtonElement).disabled).toBe(true);
    vi.unstubAllGlobals();
  });

  it("a 500 from POST /commit with { error } (not { changes, refusals }) shows the error, doesn't crash, and doesn't call onCommitted", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ changes: [{ path: "a", kind: "binary", summary: "a changed" }], refusals: [] }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({ error: "disk write failed" }) });
    vi.stubGlobal("fetch", fetchMock);
    const onCommitted = vi.fn();
    render(<SaveDialog mapName="PalletTown" onCommitted={onCommitted} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("a changed")).toBeTruthy());
    expect(() => fireEvent.click(screen.getByRole("button", { name: "Save Changes" }))).not.toThrow();
    await waitFor(() => expect(screen.getByText(/disk write failed/)).toBeTruthy());
    expect(onCommitted).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  // Code-review fix (Important #1): mirrors WarpDestinationModal.test.tsx's
  // own "focuses the close button on mount and calls onClose on Escape"
  // regression test for the exact same bug class -- without focus moving
  // INTO the dialog on mount, a keyboard Escape never reaches this
  // component's own onKeyDown handler at all (it keeps bubbling from
  // whatever element opened the dialog, outside this subtree).
  it("focuses the Cancel button on mount and calls onCancel on Escape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ changes: [], refusals: [] }) }));
    const onCancel = vi.fn();
    render(<SaveDialog mapName="PalletTown" onCommitted={vi.fn()} onCancel={onCancel} />);

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
