import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import {
  noteTilesetVersion,
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
