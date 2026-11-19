import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { gbaAdapter } from "../../src/gba/adapter.js";
import { gbcAdapter } from "../../src/gbc/adapter.js";
import type { BlockEditorSpec } from "../../src/shell/adapter.js";
import { useBlockEditor, type BlockEditorStatus } from "../../src/shared/blockEditor/useBlockEditor.js";
import { EditSessionError, type BlockCheckReply, type BlockEditSession } from "../../src/shared/useEditSessionCore.js";

const bodies = {
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
    sheet: { url: "/api/block-sheet/A.png?tv=1", tileCount: 8, tileIds: [1, 2, 3, 4, 5, 6, 7, 8], reservedTiles: [] },
    options: {
      behaviors: [{ name: "NORMAL", value: 0 }, { name: "TALL_GRASS", value: 2 }],
      layerTypes: [{ name: "NORMAL", value: 0 }, { name: "COVERED", value: 1 }],
    },
    usage: { thisMap: 3, border: false, otherMaps: 0, mapCount: 0, files: [] },
    owner: null, limits: { nextId: null, cap: 512 },
  },
  gbc: {
    blockId: 5, viaBorder: false, revision: "r1",
    block: {
      tiles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      collision: ["FLOOR", "WALL", "FLOOR", "WATER"],
      tilePalettes: ["GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY"],
    },
    sheet: { url: "/api/block-sheet/A.png?tv=1&time=day", tileCount: 128, tileIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], reservedTiles: [] },
    options: { collision: ["FLOOR", "WALL", "WATER"], palettes: ["GRAY", "RED"] },
    usage: { thisMap: 3, border: false, otherMaps: 0, mapCount: 0, files: [] },
    owner: null, limits: { nextId: 6, cap: 256 },
  },
};

// These oracles are written independently of the GET fixtures and hook output.
const gbaDraft = {
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
};
const gbcDraft = {
  tiles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  collision: ["FLOOR", "WALL", "FLOOR", "WATER"],
  tilePalettes: ["GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY"],
  palettes: [],
};
// The request draft deliberately excludes the GET-only tilePalettes field.
const gbcRequestDraft = {
  tiles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  collision: ["FLOOR", "WALL", "FLOOR", "WATER"], palettes: [],
};
const editedDrafts = {
  gba: {
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
    behavior: 2, layerType: 1,
  },
  gbc: {
    tiles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    collision: ["WALL", "WALL", "FLOOR", "WATER"],
    tilePalettes: ["GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY"],
    palettes: [],
  },
};
const requests = {
  gba: {
    ok: { request: { metatileId: 0x21, mode: "ok", from: "palette", draft: gbaDraft } },
    saveAsNew: { request: { metatileId: 0x21, mode: "saveAsNew", from: "palette", draft: gbaDraft } },
    mapCell: { request: { metatileId: 0x21, mode: "ok", from: "map", cell: { x: 3, y: 4 }, draft: gbaDraft } },
    mapBlock: { request: { metatileId: 0x21, mode: "ok", from: "map", draft: gbaDraft } },
  },
  gbc: {
    ok: { request: { blockId: 5, mode: "ok", from: "palette", draft: gbcRequestDraft } },
    saveAsNew: { request: { blockId: 5, mode: "saveAsNew", from: "palette", draft: gbcRequestDraft } },
    mapCell: { request: { blockId: 5, mode: "ok", from: "map", cell: { x: 3, y: 4 }, draft: gbcRequestDraft } },
    mapBlock: { request: { blockId: 5, mode: "ok", from: "map", draft: gbcRequestDraft } },
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const response = (data: unknown, status = 200) => ({ ok: status === 200, status, json: async () => data }) as Response;
function makeSession() {
  return {
    blockCheck: vi.fn<BlockEditSession["blockCheck"]>().mockResolvedValue({ usage: null, confirm: false, warnings: [] }),
    blockPreview: vi.fn<BlockEditSession["blockPreview"]>().mockResolvedValue(null),
    blockApply: vi.fn<BlockEditSession["blockApply"]>().mockResolvedValue(true),
  } satisfies BlockEditSession;
}
type Target = { block: number } | { x: number; y: number };
interface EditorArgs {
  map: string; target: Target; from: "map" | "palette"; spec: BlockEditorSpec;
  session: BlockEditSession; time?: string; onClose(): void; onApplied(): void;
}
type SentRequest = { request: { cell?: { x: number; y: number }; draft: { behavior?: number; collision?: string[] } } };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

for (const family of ["gba", "gbc"] as const) {
  describe(`${family} useBlockEditor`, () => {
    const spec = family === "gba" ? gbaAdapter.blockEditorSpec : gbcAdapter.blockEditorSpec;
    const initialDraft = family === "gba" ? gbaDraft : gbcDraft;

    async function mount(
      overrides: Partial<EditorArgs> = {},
      session = makeSession(),
      fetcher = vi.fn().mockResolvedValue(response(bodies[family])),
    ) {
      vi.stubGlobal("fetch", fetcher);
      const callbackOrder: string[] = [];
      const onApplied = vi.fn(() => { callbackOrder.push("applied"); });
      const onClose = vi.fn(() => { callbackOrder.push("closed"); });
      const args: EditorArgs = { map: "A", target: { block: 5 }, from: "palette", spec, session, onApplied, onClose, ...overrides };
      const hook = renderHook((props: EditorArgs) => useBlockEditor(props), { initialProps: args });
      const loading: BlockEditorStatus = hook.result.current.status;
      expect(loading).toBe("loading");
      await act(async () => { await Promise.resolve(); });
      return { ...hook, args, session, fetcher, callbackOrder, onApplied, onClose };
    }

    it("loads a block and initializes the family draft", async () => {
      const { result, fetcher } = await mount();
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0]?.[0]).toBe("/api/edit/A/block?block=5");
      expect(result.current.status).toBe("ready");
      expect(result.current.info).toEqual(bodies[family]);
      expect(result.current.draft).toEqual(initialDraft);
    });

    it("encodes the map name in the GET URL", async () => {
      const { fetcher, result } = await mount({ map: "A B" });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0]?.[0]).toBe("/api/edit/A%20B/block?block=5");
      expect(result.current.status).toBe("ready");
    });

    it("loads a cell target with its coordinates", async () => {
      const { fetcher, result } = await mount({ target: { x: 3, y: 4 }, from: "map" });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0]?.[0]).toBe("/api/edit/A/block?x=3&y=4");
      expect(result.current.status).toBe("ready");
    });

    it("reports the GET body's error", async () => {
      const fetcher = vi.fn().mockResolvedValue(response({ error: "block: map edited elsewhere", code: "X" }, 409));
      const { result } = await mount({}, makeSession(), fetcher);
      expect(result.current.status).toBe("error");
      expect(result.current.message).toBe("block: map edited elsewhere");
    });

    it("drops a GET reply for the previous target", async () => {
      const old = deferred<Response>();
      const newer = deferred<Response>();
      const fetcher = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise);
      const { result, rerender, args } = await mount({}, makeSession(), fetcher);
      act(() => { rerender({ ...args, target: { block: 6 } }); });
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher.mock.calls[1]?.[0]).toBe("/api/edit/A/block?block=6");
      await act(async () => { newer.resolve(response({ ...bodies[family], blockId: 6 })); await newer.promise; });
      expect(result.current.status).toBe("ready");
      expect(result.current.info.blockId).toBe(6);
      await act(async () => { old.resolve(response(bodies[family])); await old.promise; });
      expect(result.current.status).toBe("ready");
      expect(result.current.info.blockId).toBe(6);
    });

    it("debounces previews for 150 ms, ignores older replies, and keeps the image after rejection", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const old = deferred<{ png: string } | null>();
      const newer = deferred<{ png: string } | null>();
      const session = makeSession();
      session.blockPreview.mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise)
        .mockRejectedValueOnce(new Error("preview unavailable"));
      const { result } = await mount({}, session);
      expect(result.current.previewSrc).toBeNull();
      await act(async () => { vi.advanceTimersByTime(149); });
      expect(session.blockPreview).not.toHaveBeenCalled();
      await act(async () => { vi.advanceTimersByTime(1); });
      expect(session.blockPreview).toHaveBeenCalledTimes(1);
      expect(session.blockPreview).toHaveBeenNthCalledWith(1, requests[family].ok);
      act(() => { result.current.setDraft(editedDrafts[family]); });
      await act(async () => { vi.advanceTimersByTime(149); });
      expect(session.blockPreview).toHaveBeenCalledTimes(1);
      await act(async () => { vi.advanceTimersByTime(1); });
      expect(session.blockPreview).toHaveBeenCalledTimes(2);
      if (family === "gba") {
        expect(session.blockPreview).toHaveBeenNthCalledWith(2, {
          request: { metatileId: 0x21, mode: "ok", from: "palette", draft: {
            entries: [
              { tile: 1, palette: 0, xFlip: false, yFlip: false },
              { tile: 2, palette: 0, xFlip: true, yFlip: false },
              { tile: 3, palette: 1, xFlip: false, yFlip: true },
              { tile: 4, palette: 1, xFlip: true, yFlip: true },
              { tile: 5, palette: 0, xFlip: false, yFlip: false },
              { tile: 6, palette: 0, xFlip: true, yFlip: false },
              { tile: 7, palette: 1, xFlip: false, yFlip: true },
              { tile: 8, palette: 1, xFlip: true, yFlip: true },
            ], behavior: 2, layerType: 1,
          } },
        });
      } else {
        expect(session.blockPreview).toHaveBeenNthCalledWith(2, {
          request: { blockId: 5, mode: "ok", from: "palette", draft: {
            tiles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
            collision: ["WALL", "WALL", "FLOOR", "WATER"], palettes: [],
          } },
        });
      }
      await act(async () => { newer.resolve({ png: "QUJD" }); await newer.promise; });
      expect(result.current.previewSrc).toBe("data:image/png;base64,QUJD");
      await act(async () => { old.resolve({ png: "T0xE" }); await old.promise; });
      expect(result.current.previewSrc).toBe("data:image/png;base64,QUJD");
      act(() => { result.current.setDraft(initialDraft); });
      await act(async () => { vi.advanceTimersByTime(150); });
      expect(session.blockPreview).toHaveBeenCalledTimes(3);
      expect(result.current.previewSrc).toBe("data:image/png;base64,QUJD");
      expect(result.current.message).toBeNull();
    });

    it("checks and applies ok once, then calls onApplied before onClose", async () => {
      const { result, session, onApplied, onClose, callbackOrder } = await mount();
      await act(async () => { result.current.ok(); });
      expect(session.blockCheck).toHaveBeenCalledTimes(1);
      expect(session.blockCheck).toHaveBeenCalledWith(requests[family].ok, "r1");
      expect(session.blockApply).toHaveBeenCalledTimes(1);
      expect(session.blockApply).toHaveBeenCalledWith(requests[family].ok, "r1");
      expect(onApplied).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(callbackOrder).toEqual(["applied", "closed"]);
    });

    it("can cancel confirmation without changing the draft, then check and confirm", async () => {
      const reply: BlockCheckReply = { usage: { thisMap: 3 }, confirm: true, warnings: ["shared block"] };
      const session = makeSession();
      session.blockCheck.mockResolvedValue(reply);
      const { result } = await mount({}, session);
      await act(async () => { result.current.ok(); });
      expect(result.current.status).toBe("confirming");
      expect(result.current.check).toEqual({ usage: { thisMap: 3 }, confirm: true, warnings: ["shared block"] });
      expect(result.current.check).toBe(reply);
      expect(session.blockApply).not.toHaveBeenCalled();
      act(() => { result.current.cancelConfirm(); });
      expect(result.current.status).toBe("ready");
      expect(result.current.draft).toEqual(initialDraft);
      expect(session.blockCheck).toHaveBeenCalledTimes(1);
      expect(session.blockApply).not.toHaveBeenCalled();
      await act(async () => { result.current.ok(); });
      expect(result.current.status).toBe("confirming");
      expect(session.blockApply).not.toHaveBeenCalled();
      await act(async () => { result.current.confirm(); });
      expect(session.blockCheck).toHaveBeenCalledTimes(2);
      expect(session.blockApply).toHaveBeenCalledTimes(1);
      expect(session.blockApply).toHaveBeenCalledWith(requests[family].ok, "r1");
    });

    it("shows a check refusal without applying", async () => {
      const session = makeSession();
      session.blockCheck.mockResolvedValue({ usage: null, confirm: false, warnings: [], refusal: {
        code: "PALETTE_CONFLICT", error: "tile $05: used with another palette",
      } });
      const { result } = await mount({}, session);
      await act(async () => { result.current.ok(); });
      expect(result.current.status).toBe("ready");
      expect(result.current.message).toBe("tile $05: used with another palette");
      expect(session.blockApply).not.toHaveBeenCalled();
    });

    it("translates a STALE check refusal and keeps the edited draft", async () => {
      const session = makeSession();
      session.blockCheck.mockResolvedValue({ usage: null, confirm: false, warnings: [], refusal: {
        code: "STALE", error: "revision: block edit is stale",
      } });
      const { result } = await mount({}, session);
      act(() => { result.current.setDraft(editedDrafts[family]); });
      await act(async () => { result.current.ok(); });
      expect(result.current.status).toBe("ready");
      expect(result.current.message).toBe("The block changed since this editor opened; reopen it");
      expect(result.current.draft).toEqual(editedDrafts[family]);
      expect(session.blockApply).not.toHaveBeenCalled();
    });

    it("translates a STALE apply error and keeps the edited draft", async () => {
      const session = makeSession();
      session.blockApply.mockRejectedValue(new EditSessionError("revision: block edit is stale", "STALE"));
      const { result, onApplied, onClose } = await mount({}, session);
      act(() => { result.current.setDraft(editedDrafts[family]); });
      await act(async () => { result.current.ok(); });
      expect(result.current.status).toBe("ready");
      expect(result.current.message).toBe("The block changed since this editor opened; reopen it");
      expect(result.current.draft).toEqual(editedDrafts[family]);
      expect(onApplied).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("shows an ordinary apply error and keeps the edited draft", async () => {
      const session = makeSession();
      session.blockApply.mockRejectedValue(new EditSessionError("block: write refused", "BAD_VALUE"));
      const { result, onApplied, onClose } = await mount({}, session);
      act(() => { result.current.setDraft(editedDrafts[family]); });
      await act(async () => { result.current.ok(); });
      expect(result.current.status).toBe("ready");
      expect(result.current.message).toBe("block: write refused");
      expect(result.current.draft).toEqual(editedDrafts[family]);
      expect(onApplied).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("keeps save-as-new refusal separate and clears it after editing", async () => {
      const session = makeSession();
      session.blockCheck.mockResolvedValue({ usage: null, confirm: false, warnings: [], refusal: {
        code: "PALETTE_CONFLICT", error: "tile $05: used with another palette",
      } });
      const { result } = await mount({}, session);
      await act(async () => { result.current.saveAsNew(); });
      expect(session.blockCheck).toHaveBeenCalledWith(requests[family].saveAsNew, "r1");
      expect(result.current.status).toBe("ready");
      expect(result.current.saveAsNewRefusal).toBe("tile $05: used with another palette");
      expect(session.blockApply).not.toHaveBeenCalled();
      act(() => { result.current.setDraft(editedDrafts[family]); });
      expect(result.current.saveAsNewRefusal).toBeNull();
    });

    it("translates a STALE save-as-new refusal", async () => {
      const session = makeSession();
      session.blockCheck.mockResolvedValue({ usage: null, confirm: false, warnings: [], refusal: {
        code: "STALE", error: "revision: block edit is stale",
      } });
      const { result } = await mount({}, session);
      await act(async () => { result.current.saveAsNew(); });
      expect(result.current.status).toBe("ready");
      expect(result.current.saveAsNewRefusal).toBe("The block changed since this editor opened; reopen it");
      expect(session.blockApply).not.toHaveBeenCalled();
    });

    it("applies save-as-new directly even when the check requests confirmation", async () => {
      const pending = deferred<BlockCheckReply | null>();
      const applied = deferred<boolean>();
      const session = makeSession();
      session.blockCheck.mockReturnValue(pending.promise);
      session.blockApply.mockReturnValue(applied.promise);
      const { result } = await mount({}, session);
      act(() => { result.current.saveAsNew(); });
      expect(result.current.status).toBe("checking");
      expect(session.blockCheck).toHaveBeenCalledWith(requests[family].saveAsNew, "r1");
      await act(async () => { pending.resolve({ usage: null, confirm: true, warnings: [] }); await pending.promise; });
      expect(result.current.status).toBe("applying");
      expect(session.blockApply).toHaveBeenCalledTimes(1);
      expect(session.blockApply).toHaveBeenCalledWith(requests[family].saveAsNew, "r1");
      await act(async () => { applied.resolve(true); await applied.promise; });
    });

    it("sends no additional action while checking or applying", async () => {
      const checked = deferred<BlockCheckReply | null>();
      const applied = deferred<boolean>();
      const session = makeSession();
      session.blockCheck.mockReturnValue(checked.promise);
      session.blockApply.mockReturnValue(applied.promise);
      const { result } = await mount({}, session);
      act(() => { result.current.ok(); });
      expect(result.current.status).toBe("checking");
      act(() => { result.current.ok(); result.current.confirm(); result.current.saveAsNew(); });
      expect(session.blockCheck).toHaveBeenCalledTimes(1);
      expect(session.blockApply).not.toHaveBeenCalled();
      await act(async () => { checked.resolve({ usage: null, confirm: false, warnings: [] }); await checked.promise; });
      expect(result.current.status).toBe("applying");
      act(() => { result.current.ok(); result.current.confirm(); result.current.saveAsNew(); });
      expect(session.blockCheck).toHaveBeenCalledTimes(1);
      expect(session.blockApply).toHaveBeenCalledTimes(1);
      await act(async () => { applied.resolve(true); await applied.promise; });
    });

    it("ignores an older check after cancelConfirm invalidates it and a newer check confirms", async () => {
      const a = deferred<BlockCheckReply | null>();
      const b = deferred<BlockCheckReply | null>();
      const bReply: BlockCheckReply = { usage: { thisMap: 3 }, confirm: true, warnings: ["newer check"] };
      const session = makeSession();
      session.blockCheck.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
      const { result } = await mount({}, session);
      act(() => { result.current.ok(); });
      expect(result.current.status).toBe("checking");
      act(() => { result.current.cancelConfirm(); });
      expect(result.current.status).toBe("ready");
      act(() => { result.current.ok(); });
      expect(session.blockCheck).toHaveBeenCalledTimes(2);
      await act(async () => { b.resolve(bReply); await b.promise; });
      expect(result.current.status).toBe("confirming");
      expect(result.current.check).toBe(bReply);
      await act(async () => { a.resolve({ usage: null, confirm: false, warnings: [] }); await a.promise; });
      expect(session.blockApply).not.toHaveBeenCalled();
      expect(result.current.status).toBe("confirming");
      expect(result.current.check).toBe(bReply);
      expect(result.current.check).toEqual({ usage: { thisMap: 3 }, confirm: true, warnings: ["newer check"] });
    });

    it("returns to ready for a null check without applying", async () => {
      const session = makeSession();
      session.blockCheck.mockResolvedValue(null);
      const { result, onApplied, onClose } = await mount({}, session);
      await act(async () => { result.current.ok(); });
      expect(result.current.status).toBe("ready");
      expect(result.current.message).toBeNull();
      expect(session.blockApply).not.toHaveBeenCalled();
      expect(onApplied).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("returns to ready without callbacks or a message when apply resolves false", async () => {
      const session = makeSession();
      session.blockApply.mockResolvedValue(false);
      const { result, onApplied, onClose } = await mount({}, session);
      await act(async () => { result.current.ok(); });
      expect(session.blockApply).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe("ready");
      expect(result.current.message).toBeNull();
      expect(onApplied).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("sends a cell only for a map cell target", async () => {
      const { result, session } = await mount({ from: "map", target: { x: 3, y: 4 } });
      await act(async () => { result.current.ok(); });
      expect(session.blockCheck).toHaveBeenCalledWith(requests[family].mapCell, "r1");
      expect(session.blockApply).toHaveBeenCalledWith(requests[family].mapCell, "r1");
      const sent = session.blockCheck.mock.calls[0]?.[0] as SentRequest;
      expect(sent.request.cell).toEqual({ x: 3, y: 4 });
    });

    it("omits the cell key for a palette block target", async () => {
      const { result, session } = await mount({ from: "palette", target: { block: 5 } });
      await act(async () => { result.current.ok(); });
      expect(session.blockCheck).toHaveBeenCalledWith(requests[family].ok, "r1");
      const sent = session.blockCheck.mock.calls[0]?.[0] as SentRequest;
      expect("cell" in sent.request).toBe(false);
    });

    it("omits the cell key for a map block target", async () => {
      const { result, session } = await mount({ from: "map", target: { block: 5 } });
      await act(async () => { result.current.ok(); });
      expect(session.blockCheck).toHaveBeenCalledWith(requests[family].mapBlock, "r1");
      const sent = session.blockCheck.mock.calls[0]?.[0] as SentRequest;
      expect("cell" in sent.request).toBe(false);
    });

    if (family === "gba") {
      it("sends behavior as a number", async () => {
        const { result, session } = await mount();
        act(() => { result.current.setDraft({ ...result.current.draft, behavior: 2 }); });
        await act(async () => { result.current.ok(); });
        const sent = session.blockCheck.mock.calls[0]?.[0] as SentRequest;
        expect(sent.request.draft.behavior).toBe(2);
      });
    } else {
      it("appends the GBC time to the cell GET URL", async () => {
        const { fetcher, result } = await mount({ from: "map", target: { x: 3, y: 4 }, time: "day" });
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(fetcher.mock.calls[0]?.[0]).toBe("/api/edit/A/block?x=3&y=4&time=day");
        expect(result.current.status).toBe("ready");
      });

      it("sends collision names and exactly tiles, collision, and palettes in the request draft", async () => {
        const { result, session } = await mount();
        act(() => { result.current.setDraft({ ...result.current.draft, collision: ["WALL", "WALL", "FLOOR", "WATER"] }); });
        await act(async () => { result.current.ok(); });
        const sent = session.blockCheck.mock.calls[0]?.[0] as SentRequest;
        expect(sent.request.draft.collision).toEqual(["WALL", "WALL", "FLOOR", "WATER"]);
        expect(Object.keys(sent.request.draft).sort()).toEqual(["collision", "palettes", "tiles"]);
        expect("tilePalettes" in sent.request.draft).toBe(false);
      });
    }
    it("guards two ok calls in the same tick", async () => {
      const checked = deferred<BlockCheckReply | null>();
      const session = makeSession();
      session.blockCheck.mockReturnValue(checked.promise);
      const { result } = await mount({}, session);
      act(() => { result.current.ok(); result.current.ok(); });
      expect(session.blockCheck).toHaveBeenCalledTimes(1);
      await act(async () => { checked.resolve(null); await checked.promise; });
    });

    it("guards two confirm calls in the same tick and applies the checked request object", async () => {
      const applied = deferred<boolean>();
      const session = makeSession();
      session.blockCheck.mockResolvedValue({ usage: null, confirm: true, warnings: [] });
      session.blockApply.mockReturnValue(applied.promise);
      const { result } = await mount({}, session);
      await act(async () => { result.current.ok(); });
      expect(result.current.status).toBe("confirming");
      act(() => { result.current.confirm(); result.current.confirm(); });
      expect(session.blockApply).toHaveBeenCalledTimes(1);
      expect(session.blockApply).toHaveBeenCalledWith(requests[family].ok, "r1");
      expect(session.blockApply.mock.calls[0]?.[0]).toBe(session.blockCheck.mock.calls[0]?.[0]);
      await act(async () => { applied.resolve(true); await applied.promise; });
    });

    it("ignores ok and saveAsNew while confirming", async () => {
      const session = makeSession();
      session.blockCheck.mockResolvedValue({ usage: null, confirm: true, warnings: [] });
      const { result } = await mount({}, session);
      await act(async () => { result.current.ok(); });
      expect(result.current.status).toBe("confirming");
      act(() => { result.current.ok(); result.current.saveAsNew(); });
      expect(result.current.status).toBe("confirming");
      expect(session.blockCheck).toHaveBeenCalledTimes(1);
      expect(session.blockApply).not.toHaveBeenCalled();
    });

    it("ignores cancelConfirm followed by ok in the same tick while applying", async () => {
      const applied = deferred<boolean>();
      const session = makeSession();
      session.blockApply.mockReturnValue(applied.promise);
      const { result, onApplied, onClose } = await mount({}, session);
      await act(async () => { result.current.ok(); });
      expect(result.current.status).toBe("applying");
      act(() => { result.current.cancelConfirm(); result.current.ok(); });
      expect(result.current.status).toBe("applying");
      expect(session.blockCheck).toHaveBeenCalledTimes(1);
      expect(session.blockApply).toHaveBeenCalledTimes(1);
      await act(async () => { applied.resolve(true); await applied.promise; });
      expect(onApplied).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("invalidates a pending check when the draft changes", async () => {
      const checked = deferred<BlockCheckReply | null>();
      const session = makeSession();
      session.blockCheck.mockReturnValue(checked.promise);
      const { result } = await mount({}, session);
      act(() => { result.current.ok(); });
      expect(result.current.status).toBe("checking");
      act(() => { result.current.setDraft(editedDrafts[family]); });
      expect(result.current.status).toBe("ready");
      expect(result.current.draft).toEqual(editedDrafts[family]);
      await act(async () => { checked.resolve({ usage: null, confirm: false, warnings: [] }); await checked.promise; });
      expect(result.current.status).toBe("ready");
      expect(session.blockApply).not.toHaveBeenCalled();
    });

    it("invalidates confirmation when the draft changes", async () => {
      const session = makeSession();
      session.blockCheck.mockResolvedValue({ usage: null, confirm: true, warnings: [] });
      const { result } = await mount({}, session);
      await act(async () => { result.current.ok(); });
      expect(result.current.status).toBe("confirming");
      act(() => { result.current.setDraft(editedDrafts[family]); });
      expect(result.current.status).toBe("ready");
      act(() => { result.current.confirm(); });
      expect(session.blockApply).not.toHaveBeenCalled();
    });

    it("keeps an applying request at its checked draft when the editor draft changes", async () => {
      const applied = deferred<boolean>();
      const session = makeSession();
      session.blockApply.mockReturnValue(applied.promise);
      const { result } = await mount({}, session);
      await act(async () => { result.current.ok(); });
      expect(result.current.status).toBe("applying");
      act(() => { result.current.setDraft(editedDrafts[family]); });
      expect(result.current.status).toBe("applying");
      expect(result.current.draft).toEqual(editedDrafts[family]);
      expect(session.blockApply).toHaveBeenCalledTimes(1);
      expect(session.blockApply).toHaveBeenCalledWith(requests[family].ok, "r1");
      expect(session.blockApply.mock.calls[0]?.[0]).toBe(session.blockCheck.mock.calls[0]?.[0]);
      await act(async () => { applied.resolve(true); await applied.promise; });
    });

    it("drops a pending check after the target changes", async () => {
      const checked = deferred<BlockCheckReply | null>();
      const session = makeSession();
      session.blockCheck.mockReturnValue(checked.promise);
      const fetcher = vi.fn().mockResolvedValueOnce(response(bodies[family]))
        .mockResolvedValueOnce(response({ ...bodies[family], blockId: 6 }));
      const { result, rerender, args } = await mount({}, session, fetcher);
      act(() => { result.current.ok(); });
      expect(result.current.status).toBe("checking");
      await act(async () => { rerender({ ...args, target: { block: 6 } }); });
      expect(result.current.info.blockId).toBe(6);
      expect(result.current.status).toBe("ready");
      await act(async () => { checked.resolve({ usage: null, confirm: false, warnings: [] }); await checked.promise; });
      expect(session.blockApply).not.toHaveBeenCalled();
    });

    it("drops successful apply callbacks after the target changes", async () => {
      const applied = deferred<boolean>();
      const session = makeSession();
      session.blockApply.mockReturnValue(applied.promise);
      const fetcher = vi.fn().mockResolvedValueOnce(response(bodies[family]))
        .mockResolvedValueOnce(response({ ...bodies[family], blockId: 6 }));
      const { result, rerender, args, onApplied, onClose } = await mount({}, session, fetcher);
      await act(async () => { result.current.ok(); });
      expect(result.current.status).toBe("applying");
      await act(async () => { rerender({ ...args, target: { block: 6 } }); });
      expect(result.current.info.blockId).toBe(6);
      await act(async () => { applied.resolve(true); await applied.promise; });
      expect(onApplied).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("drops successful apply callbacks after unmount", async () => {
      const applied = deferred<boolean>();
      const session = makeSession();
      session.blockApply.mockReturnValue(applied.promise);
      const { result, unmount, onApplied, onClose } = await mount({}, session);
      await act(async () => { result.current.ok(); });
      expect(result.current.status).toBe("applying");
      act(() => { unmount(); });
      await act(async () => { applied.resolve(true); await applied.promise; });
      expect(onApplied).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("drops a rejected apply after the target changes", async () => {
      const applied = deferred<boolean>();
      const session = makeSession();
      session.blockApply.mockReturnValue(applied.promise);
      const fetcher = vi.fn().mockResolvedValueOnce(response(bodies[family]))
        .mockResolvedValueOnce(response({ ...bodies[family], blockId: 6 }));
      const { result, rerender, args } = await mount({}, session, fetcher);
      await act(async () => { result.current.ok(); });
      expect(result.current.status).toBe("applying");
      await act(async () => { rerender({ ...args, target: { block: 6 } }); });
      await act(async () => { applied.reject(new EditSessionError("x", "BAD_VALUE")); await applied.promise.catch(() => undefined); });
      expect(result.current.message).not.toBe("x");
      expect(result.current.status).toBe("ready");
      expect(result.current.info.blockId).toBe(6);
    });

    it("drops a GET reply for the previous map", async () => {
      const old = deferred<Response>();
      const newer = deferred<Response>();
      const fetcher = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise);
      const { result, rerender, args } = await mount({}, makeSession(), fetcher);
      act(() => { rerender({ ...args, map: "B" }); });
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher.mock.calls[1]?.[0]).toBe("/api/edit/B/block?block=5");
      await act(async () => { newer.resolve(response({ ...bodies[family], blockId: 6 })); await newer.promise; });
      expect(result.current.status).toBe("ready");
      expect(result.current.info.blockId).toBe(6);
      await act(async () => { old.resolve(response(bodies[family])); await old.promise; });
      expect(result.current.status).toBe("ready");
      expect(result.current.info.blockId).toBe(6);
    });

    if (family === "gbc") {
      it("drops a GET reply for the previous time", async () => {
        const old = deferred<Response>();
        const newer = deferred<Response>();
        const fetcher = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise);
        const { result, rerender, args } = await mount({ time: "day" }, makeSession(), fetcher);
        expect(fetcher.mock.calls[0]?.[0]).toBe("/api/edit/A/block?block=5&time=day");
        act(() => { rerender({ ...args, time: "nite" }); });
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(fetcher.mock.calls[1]?.[0]).toBe("/api/edit/A/block?block=5&time=nite");
        await act(async () => { newer.resolve(response({ ...bodies[family], blockId: 6 })); await newer.promise; });
        expect(result.current.status).toBe("ready");
        expect(result.current.info.blockId).toBe(6);
        await act(async () => { old.resolve(response(bodies[family])); await old.promise; });
        expect(result.current.status).toBe("ready");
        expect(result.current.info.blockId).toBe(6);
      });
    }

    it("does not reload for an equal new target object", async () => {
      const { result, fetcher, rerender, args } = await mount();
      await act(async () => { rerender({ ...args, target: { block: 5 } }); });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe("ready");
    });

    it("uses the GET status fallback when an error response has invalid JSON", async () => {
      const fetcher = vi.fn().mockResolvedValue({
        ...response(null, 500), json: async () => { throw new SyntaxError("bad"); },
      });
      const { result } = await mount({}, makeSession(), fetcher);
      expect(result.current.status).toBe("error");
      expect(result.current.message).toBe("GET /api/edit/A/block?block=5 -> 500");
    });

    it("reports a GET network rejection", async () => {
      const fetcher = vi.fn().mockRejectedValue(new Error("socket hang up"));
      const { result } = await mount({}, makeSession(), fetcher);
      expect(result.current.status).toBe("error");
      expect(result.current.message).toBe("socket hang up");
    });

    it("reports a plain apply error and keeps the edited draft", async () => {
      const session = makeSession();
      session.blockApply.mockRejectedValue(new Error("boom"));
      const { result } = await mount({}, session);
      act(() => { result.current.setDraft(editedDrafts[family]); });
      await act(async () => { result.current.ok(); });
      expect(result.current.message).toBe("boom");
      expect(result.current.status).toBe("ready");
      expect(result.current.draft).toEqual(editedDrafts[family]);
    });

    it("restarts the preview debounce when edited 100 ms after load", async () => {
      vi.useFakeTimers();
      const { result, session } = await mount();
      await act(async () => { vi.advanceTimersByTime(100); });
      act(() => { result.current.setDraft(editedDrafts[family]); });
      await act(async () => { vi.advanceTimersByTime(100); });
      expect(session.blockPreview).not.toHaveBeenCalled();
      await act(async () => { vi.advanceTimersByTime(50); });
      expect(session.blockPreview).toHaveBeenCalledTimes(1);
      if (family === "gba") {
        expect(session.blockPreview).toHaveBeenCalledWith({
          request: { metatileId: 0x21, mode: "ok", from: "palette", draft: {
            entries: [
              { tile: 1, palette: 0, xFlip: false, yFlip: false },
              { tile: 2, palette: 0, xFlip: true, yFlip: false },
              { tile: 3, palette: 1, xFlip: false, yFlip: true },
              { tile: 4, palette: 1, xFlip: true, yFlip: true },
              { tile: 5, palette: 0, xFlip: false, yFlip: false },
              { tile: 6, palette: 0, xFlip: true, yFlip: false },
              { tile: 7, palette: 1, xFlip: false, yFlip: true },
              { tile: 8, palette: 1, xFlip: true, yFlip: true },
            ], behavior: 2, layerType: 1,
          } },
        });
      } else {
        expect(session.blockPreview).toHaveBeenCalledWith({
          request: { blockId: 5, mode: "ok", from: "palette", draft: {
            tiles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
            collision: ["WALL", "WALL", "FLOOR", "WATER"], palettes: [],
          } },
        });
      }
    });

    it("keeps the previous preview image when a later preview resolves null", async () => {
      vi.useFakeTimers();
      const session = makeSession();
      session.blockPreview.mockResolvedValueOnce({ png: "QUJD" }).mockResolvedValueOnce(null);
      const { result } = await mount({}, session);
      await act(async () => { vi.advanceTimersByTime(150); });
      expect(result.current.previewSrc).toBe("data:image/png;base64,QUJD");
      act(() => { result.current.setDraft(editedDrafts[family]); });
      await act(async () => { vi.advanceTimersByTime(150); });
      expect(session.blockPreview).toHaveBeenCalledTimes(2);
      expect(result.current.previewSrc).toBe("data:image/png;base64,QUJD");
    });

    it("clears the pending preview timer on unmount", async () => {
      vi.useFakeTimers();
      const { session, unmount } = await mount();
      act(() => { unmount(); });
      await act(async () => { vi.advanceTimersByTime(200); });
      expect(session.blockPreview).toHaveBeenCalledTimes(0);
    });
  });
}

describe("block editor family specs", () => {
  it("declares the GBA controls and supported modes", () => {
    expect(gbaAdapter.blockEditorSpec.family).toBe("gba");
    expect(gbaAdapter.blockEditorSpec.width).toBe(2);
    expect(gbaAdapter.blockEditorSpec.layers).toBe(2);
    expect(gbaAdapter.blockEditorSpec.squareControls).toEqual(["palette", "flip"]);
    expect(gbaAdapter.blockEditorSpec.blockFields.map((field: BlockEditorSpec["blockFields"][number]) => field.optionsKey)).toEqual(["behaviors", "layerTypes"]);
    expect(gbaAdapter.blockEditorSpec.modes).toEqual(["1x1", "2x2"]);
  });

  it("declares the GBC controls and four collision fields", () => {
    expect(gbcAdapter.blockEditorSpec.family).toBe("gbc");
    expect(gbcAdapter.blockEditorSpec.width).toBe(4);
    expect(gbcAdapter.blockEditorSpec.layers).toBe(1);
    expect(gbcAdapter.blockEditorSpec.squareControls).toEqual(["palette"]);
    expect(gbcAdapter.blockEditorSpec.blockFields).toHaveLength(4);
    expect(gbcAdapter.blockEditorSpec.blockFields.map((field: BlockEditorSpec["blockFields"][number]) => field.optionsKey)).toEqual(["collision", "collision", "collision", "collision"]);
    expect(gbcAdapter.blockEditorSpec.modes).toEqual(["1x1", "2x2", "4x4"]);
  });

  it("declares the exact GBC collision field keys and labels", () => {
    expect(gbcAdapter.blockEditorSpec.blockFields).toEqual([
      { key: "collision0", label: "Collision (top left)", optionsKey: "collision" },
      { key: "collision1", label: "Collision (top right)", optionsKey: "collision" },
      { key: "collision2", label: "Collision (bottom left)", optionsKey: "collision" },
      { key: "collision3", label: "Collision (bottom right)", optionsKey: "collision" },
    ]);
  });

  it("declares the exact GBA behavior and layer fields", () => {
    expect(gbaAdapter.blockEditorSpec.blockFields).toEqual([
      { key: "behavior", label: "Behavior", optionsKey: "behaviors" },
      { key: "layerType", label: "Layer type", optionsKey: "layerTypes" },
    ]);
  });
});
