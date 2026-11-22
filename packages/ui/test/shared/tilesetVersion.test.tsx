import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import {
  currentTilesetVersion,
  tilesetGeneration,
  noteTilesetVersion,
  noteTilesetStamp,
  resetTilesetVersion,
  useTilesetVersion,
} from "../../src/shared/tilesetVersion.js";
import { useEditSessionCore } from "../../src/shared/useEditSessionCore.js";

// Every new test leaves the store at 0 so no other case (or file) sees a leftover version.
beforeEach(() => { resetTilesetVersion(); });
afterEach(() => {
  resetTilesetVersion();
  vi.unstubAllGlobals();
});

function VersionProbe() {
  return <output data-testid="version">{useTilesetVersion()}</output>;
}

/** Renders one probe that stays mounted for the whole case; later reads see its live re-renders. */
function mountProbe(): HTMLElement {
  return render(<VersionProbe />).container;
}

const versionOf = (container: HTMLElement): number =>
  Number(container.querySelector('[data-testid="version"]')!.textContent);

describe("tileset version store", () => {
  it("keeps maxima within an instance and moves to a fresh key above every used one on a restart", () => {
    const container = mountProbe();
    act(() => noteTilesetStamp({ tilesetVersion: 9, tilesetInstance: "first" }));
    act(() => noteTilesetStamp({ tilesetVersion: 3, tilesetInstance: "first" }));
    expect(versionOf(container)).toBe(9);
    act(() => noteTilesetStamp({ tilesetVersion: 1, tilesetInstance: "restarted" }));
    expect(versionOf(container)).toBe(10);
    act(() => noteTilesetStamp({ tilesetVersion: 2, tilesetInstance: "restarted" }));
    expect(versionOf(container)).toBe(11);
    act(() => noteTilesetStamp({ tilesetVersion: 1, tilesetInstance: "restarted" }));
    expect(versionOf(container)).toBe(11);
    act(() => noteTilesetStamp({ tilesetVersion: 0 }));
    expect(versionOf(container)).toBe(11);
    act(() => noteTilesetStamp({ tilesetVersion: 40 }));
    expect(versionOf(container)).toBe(40);
  });

  it("a restart whose counter equals the stored one still changes the key", () => {
    const container = mountProbe();
    act(() => noteTilesetStamp({ tilesetVersion: 0, tilesetInstance: "a" }));
    expect(versionOf(container)).toBe(0);
    act(() => noteTilesetStamp({ tilesetVersion: 0, tilesetInstance: "b" }));
    expect(versionOf(container)).toBe(1);
  });

  it("ignores a late reply from an instance that was already replaced", () => {
    noteTilesetStamp({ tilesetVersion: 5, tilesetInstance: "a" });
    noteTilesetStamp({ tilesetVersion: 0, tilesetInstance: "b" });
    expect(currentTilesetVersion()).toBe(6);
    noteTilesetStamp({ tilesetVersion: 5, tilesetInstance: "a" });
    expect(currentTilesetVersion()).toBe(6);
    noteTilesetStamp({ tilesetVersion: 1, tilesetInstance: "b" });
    expect(currentTilesetVersion()).toBe(7);
  });

  it("adopts a first instance without lowering and reset clears the instance", () => {
    noteTilesetVersion(9);
    noteTilesetStamp({ tilesetVersion: 2, tilesetInstance: "first" });
    expect(currentTilesetVersion()).toBe(9);
    resetTilesetVersion();
    noteTilesetVersion(7);
    noteTilesetStamp({ tilesetVersion: 1, tilesetInstance: "second" });
    expect(currentTilesetVersion()).toBe(7);
    noteTilesetStamp({ tilesetVersion: 0, tilesetInstance: "third" });
    resetTilesetVersion();
    noteTilesetStamp({ tilesetVersion: 3, tilesetInstance: "second" }); // retired set cleared by reset
    expect(currentTilesetVersion()).toBe(3);
  });

  it("drops a stale generation without changing the stored instance", () => {
    const old = tilesetGeneration();
    resetTilesetVersion();
    noteTilesetStamp({ tilesetVersion: 5, tilesetInstance: "current" });
    noteTilesetStamp({ tilesetVersion: 1, tilesetInstance: "stale" }, old);
    expect(currentTilesetVersion()).toBe(5);
    noteTilesetStamp({ tilesetVersion: 2, tilesetInstance: "current" });
    expect(currentTilesetVersion()).toBe(5);
  });

  it.each([null, undefined, {}, { tilesetVersion: NaN, tilesetInstance: "bad" }, { tilesetVersion: Infinity }, { tilesetVersion: "9" }])("ignores malformed stamps: %j", (body) => {
    noteTilesetStamp({ tilesetVersion: 5, tilesetInstance: "current" });
    noteTilesetStamp(body);
    noteTilesetStamp({ tilesetVersion: 2, tilesetInstance: "current" });
    expect(currentTilesetVersion()).toBe(5);
  });

  it("starts at 0, keeps the largest version, and resets to 0", () => {
    const container = mountProbe();
    expect(versionOf(container)).toBe(0);

    act(() => noteTilesetVersion(3));
    expect(versionOf(container)).toBe(3);

    // Only growth is a change: an older session reply must not roll a newer canvas back.
    act(() => noteTilesetVersion(2));
    expect(versionOf(container)).toBe(3);

    act(() => resetTilesetVersion());
    expect(versionOf(container)).toBe(0);
  });


  it("ignores stale generations while unguarded notes retain the max rule", () => {
    const oldGeneration = tilesetGeneration();
    resetTilesetVersion();
    expect(tilesetGeneration()).not.toBe(oldGeneration);
    noteTilesetVersion(20, oldGeneration);
    expect(currentTilesetVersion()).toBe(0);
    noteTilesetVersion(3);
    noteTilesetVersion(2);
    expect(currentTilesetVersion()).toBe(3);
    noteTilesetVersion(4);
    expect(currentTilesetVersion()).toBe(4);
  });

  it("ignores strings, NaN, undefined, null and Infinity", () => {
    const container = mountProbe();
    act(() => noteTilesetVersion(3));
    expect(versionOf(container)).toBe(3);

    for (const ignored of ["7", Number.NaN, undefined, null, Number.POSITIVE_INFINITY]) {
      act(() => noteTilesetVersion(ignored));
      expect(versionOf(container)).toBe(3);
    }
  });

  it("re-renders a mounted component when the version changes", () => {
    const container = mountProbe();
    expect(versionOf(container)).toBe(0);
    act(() => noteTilesetVersion(5));
    // Same DOM node, no prop change: the only thing that can have moved is the subscribed store.
    expect(versionOf(container)).toBe(5);
    act(() => noteTilesetVersion(6));
    expect(versionOf(container)).toBe(6);
  });
});

const reply = (data: unknown) => ({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue(data),
}) as unknown as Response;

const seed = { n: 1 };

describe("useEditSessionCore announces the tileset version", () => {

  it("discard announces the reverted version to a mounted URL builder", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ blocks: [], tilesetVersion: 6 })));
    let discard: (() => Promise<void>) | null = null;
    function PaletteProbe() {
      const core = useEditSessionCore("/api/edit", "Route101", seed);
      const version = useTilesetVersion();
      discard = core.discard;
      return <img alt="metatile" src={`/api/metatile/Route101/0.png?tv=${version}`} />;
    }
    noteTilesetVersion(5);
    const { getByAltText } = render(<PaletteProbe />);
    expect(getByAltText("metatile").getAttribute("src")).toBe("/api/metatile/Route101/0.png?tv=5");
    await act(async () => { await discard!(); });
    expect(getByAltText("metatile").getAttribute("src")).toBe("/api/metatile/Route101/0.png?tv=6");
  });

  it("U7b: a 200 discard whose body is not JSON still resets local state (store unchanged)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 200 })));
    let discard: (() => Promise<void>) | null = null;
    let markDirty: (() => void) | null = null;
    function CoreProbe() {
      const core = useEditSessionCore("/api/edit", "Route101", seed);
      const { apply } = core;
      discard = core.discard;
      markDirty = () => { apply({ state: () => ({ n: 9 }), isDirty: true }); };
      return <output data-testid="dirty">{String(core.isDirty)}</output>;
    }
    noteTilesetVersion(3);
    const container = render(<CoreProbe />).container;
    const dirtyOf = () => container.querySelector('[data-testid="dirty"]')!.textContent;
    act(() => { markDirty!(); });
    expect(dirtyOf()).toBe("true");
    await act(async () => { await discard!(); });
    expect(dirtyOf()).toBe("false");
    expect(currentTilesetVersion()).toBe(3);
  });

  it.each(["post", "discard"])("ignores a late %s response from before reset", async (operation) => {
    let resolveOld!: (response: Response) => void;
    const oldReply = new Promise<Response>((resolve) => { resolveOld = resolve; });
    const fetchMock = vi.fn()
      .mockReturnValueOnce(oldReply)
      .mockResolvedValueOnce(reply({ tilesetVersion: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    let send: (() => Promise<unknown>) | null = null;
    function CoreProbe() {
      const core = useEditSessionCore("/api/edit", "Route101", seed);
      send = operation === "post" ? () => core.post("/paint/apply", {}) : core.discard;
      return <output data-testid="version">{useTilesetVersion()}</output>;
    }
    const container = render(<CoreProbe />).container;
    let oldRequest!: Promise<unknown>;
    await act(async () => {
      oldRequest = send!();
      await Promise.resolve();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => resetTilesetVersion());
    await act(async () => { resolveOld(reply({ tilesetVersion: 20 })); await oldRequest; });
    expect(versionOf(container)).toBe(0);
    await act(async () => { await send!(); });
    expect(versionOf(container)).toBe(1);
  });

  it("a session reply carrying tilesetVersion 4 sets the store to 4", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ blocks: [], tilesetVersion: 4 })));

    let post: (() => Promise<unknown>) | null = null;
    function CoreProbe() {
      const core = useEditSessionCore("/api/edit", "Route101", seed);
      post = () => core.post("/paint/apply", {});
      return <output data-testid="version">{useTilesetVersion()}</output>;
    }

    const container = render(<CoreProbe />).container;
    expect(versionOf(container)).toBe(0);

    await act(async () => { await post!(); });
    expect(versionOf(container)).toBe(4);
  });
});
