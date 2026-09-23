import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { App } from "../src/App.js";

/**
 * Pins the three review-flagged behaviours from Task 15's review, each
 * mapped directly to one fix in App.tsx:
 *
 *  1. Switching Dungeon -> World mode remounts WorldCanvas fresh (fix (a):
 *     distinct `key`s on the two <WorldCanvas> call sites). Proven via an
 *     observable, DOM-visible signal that only a fresh mount could produce:
 *     WorldCanvas's own "Warps" switch (local `useState(false)`) resets to
 *     `aria-checked="false"` after the mode switch, rather than carrying
 *     over the "on" state set while in Dungeon mode.
 *  2. A failed delete does not clear openDungeonId (fix (c)'s surrounding
 *     contract -- handleDeleteDungeon only clears state after `remove()`
 *     actually resolves; the functional-setter fix targets a narrower race
 *     during a still-pending delete that isn't cheaply reproducible under
 *     RTL/jsdom's synchronous microtask flushing -- see the code-inspection
 *     note in the review report instead).
 *  3. A failed /api/groups fetch surfaces its error banner in Dungeon mode
 *     too (fix (b): the error check hoisted above the mode branch).
 *
 * Mirrors this package's established fetch-mocking shape (see
 * WorldCanvas.test.tsx's own `makeFetchMock` and useDungeons.test.tsx) --
 * one `vi.fn` routing every route App.tsx's full tree can reach in Dungeon
 * mode (groups, dungeons CRUD, world, coverage, species, warps, encounters).
 */

const GROUPS = { groupOrder: ["Kanto"], groups: { Kanto: ["Route1", "Route2"] } };

function makeWorld() {
  return {
    placements: {
      Route1: { map: "Route1", x: 0, y: 0, width: 10, height: 10, component: 0 },
      Route2: { map: "Route2", x: 20, y: 0, width: 10, height: 10, component: 1 },
    },
    components: [
      { index: 0, maps: ["Route1"], bounds: { x: 0, y: 0, width: 10, height: 10 } },
      { index: 1, maps: ["Route2"], bounds: { x: 20, y: 0, width: 10, height: 10 } },
    ],
    conflicts: [],
    verticalLinks: [],
    sidecar: { dungeonAutoLayout: true },
  };
}

interface MockOpts {
  groupsFail?: boolean;
  deleteFails?: boolean;
}

function makeFetchMock(opts: MockOpts = {}) {
  let dungeons = [{ id: "d1", name: "Mt Moon", maps: ["Route1"] }];
  const world = makeWorld();
  return vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";

    if (url === "/api/groups") {
      if (opts.groupsFail) {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(GROUPS) } as Response);
    }
    if (url === "/api/dungeons" && method === "GET") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(dungeons) } as Response);
    }
    if (url.startsWith("/api/dungeons/") && method === "DELETE") {
      if (opts.deleteFails) {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
      }
      const id = url.slice("/api/dungeons/".length);
      dungeons = dungeons.filter((d) => d.id !== id);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } as Response);
    }
    if (url.startsWith("/api/world/dungeons") || url.startsWith("/api/world/placement")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } as Response);
    }
    if (url === "/api/world") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(world) } as Response);
    }
    if (url === "/api/coverage") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            mapsWithEncounters: 0,
            encounterTables: 0,
            mapsWithoutEncounters: [],
            levelByMap: [],
            unusedSpecies: [],
            byMethod: { land_mons: 0, water_mons: 0, rock_smash_mons: 0, fishing_mons: 0 },
          }),
      } as Response);
    }
    if (url === "/api/species") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response);
    }
    if (url.startsWith("/api/warps/")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ warps: [] }) } as Response);
    }
    if (url.startsWith("/api/encounters/")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ methods: [] }) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("App", () => {
  it("remounts WorldCanvas fresh when switching from Dungeon mode back to World mode", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Dungeon" }));
    await waitFor(() => expect(screen.getByText("Mt Moon")).toBeTruthy());
    fireEvent.click(screen.getByText("Mt Moon"));

    // WorldCanvas's own "Warps" switch starts off; flip it on while still
    // in Dungeon mode.
    const dungeonWarpsSwitch = await screen.findByRole("switch", { name: "Warps" });
    expect(dungeonWarpsSwitch.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(dungeonWarpsSwitch);
    expect(dungeonWarpsSwitch.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "World" }));

    // A fresh WorldCanvas instance starts its own `warpsOn` state at
    // false again. Without fix (a)'s distinct `key`s, this would still
    // read "true" -- the same component instance carrying its Dungeon-mode
    // state across the mode boundary.
    const worldWarpsSwitch = await screen.findByRole("switch", { name: "Warps" });
    expect(worldWarpsSwitch.getAttribute("aria-checked")).toBe("false");
  });

  it("does not clear the open dungeon when a delete fails", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ deleteFails: true }));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Dungeon" }));
    await waitFor(() => expect(screen.getByText("Mt Moon")).toBeTruthy());
    fireEvent.click(screen.getByText("Mt Moon"));

    await waitFor(() =>
      expect(screen.getByText("Mt Moon").closest("button")!.getAttribute("aria-current")).toBe("true"),
    );

    fireEvent.click(screen.getByText("Delete dungeon"));

    // The rejected DELETE surfaces into DungeonSidebar's own actionError
    // slot...
    await waitFor(() => expect(screen.getByText(/500/)).toBeTruthy());

    // ...and openDungeonId is untouched: the dungeon still shows open, and
    // its scoped WorldCanvas (not the "Select or create a dungeon"
    // placeholder) is still on screen.
    expect(screen.getByText("Mt Moon").closest("button")!.getAttribute("aria-current")).toBe("true");
    expect(screen.queryByText("Select or create a dungeon")).toBeNull();
  });

  it("keeps a newly-opened dungeon open when an earlier dungeon's in-flight delete resolves after the switch", async () => {
    // Deliberately its own inline fetch mock, not `makeFetchMock`: this
    // needs a second dungeon to switch to, and the DELETE route must stay
    // pending under the test's own control (not auto-resolve) so the race
    // fix (c) closes -- open A, click Delete (in flight), switch to open B
    // *before* A's delete resolves, then let it resolve late -- is
    // reproduced deterministically rather than relying on real timing.
    let resolveDelete: (() => void) | null = null;
    let dungeons = [
      { id: "d1", name: "Mt Moon", maps: ["Route1"] },
      { id: "d2", name: "Safari Zone", maps: ["Route2"] },
    ];
    const world = makeWorld();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/groups") {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(GROUPS) } as Response);
      }
      if (url === "/api/dungeons" && method === "GET") {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(dungeons) } as Response);
      }
      if (url.startsWith("/api/dungeons/") && method === "DELETE") {
        return new Promise<Response>((resolve) => {
          resolveDelete = () => {
            const id = url.slice("/api/dungeons/".length);
            dungeons = dungeons.filter((d) => d.id !== id);
            resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } as Response);
          };
        });
      }
      if (url.startsWith("/api/world/dungeons") || url.startsWith("/api/world/placement")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } as Response);
      }
      if (url === "/api/world") {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(world) } as Response);
      }
      if (url === "/api/coverage") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              mapsWithEncounters: 0,
              encounterTables: 0,
              mapsWithoutEncounters: [],
              levelByMap: [],
              unusedSpecies: [],
              byMethod: { land_mons: 0, water_mons: 0, rock_smash_mons: 0, fishing_mons: 0 },
            }),
        } as Response);
      }
      if (url === "/api/species") {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response);
      }
      if (url.startsWith("/api/warps/")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ warps: [] }) } as Response);
      }
      if (url.startsWith("/api/encounters/")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ methods: [] }) } as Response);
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Dungeon" }));
    await waitFor(() => expect(screen.getByText("Mt Moon")).toBeTruthy());

    fireEvent.click(screen.getByText("Mt Moon")); // open A
    await waitFor(() =>
      expect(screen.getByText("Mt Moon").closest("button")!.getAttribute("aria-current")).toBe("true"),
    );

    fireEvent.click(screen.getByText("Delete dungeon")); // fires DELETE for A, left pending
    await waitFor(() => expect(resolveDelete).not.toBeNull());

    fireEvent.click(screen.getByText("Safari Zone")); // switch to open B BEFORE A's delete resolves
    await waitFor(() =>
      expect(screen.getByText("Safari Zone").closest("button")!.getAttribute("aria-current")).toBe("true"),
    );

    // Now let A's delete resolve late.
    resolveDelete!();
    await waitFor(() => expect(screen.queryByText("Mt Moon")).toBeNull()); // A is gone once its own delete lands

    // B must still be open -- not cleared by A's now-resolved delete.
    expect(screen.getByText("Safari Zone").closest("button")!.getAttribute("aria-current")).toBe("true");
    expect(screen.queryByText("Select or create a dungeon")).toBeNull();
  });

  it("surfaces a groups-load failure in Dungeon mode too", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ groupsFail: true }));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Dungeon" }));

    // Previously unreachable in Dungeon mode: the groups error banner only
    // rendered in the Map/World sidebar branch, so a failed /api/groups
    // fetch silently degraded DungeonSidebar's allMapNames to [] with zero
    // feedback (every add-map attempt became a silent no-op).
    await waitFor(() => expect(screen.getByText(/Could not load map groups/)).toBeTruthy());

    // DungeonSidebar itself still renders alongside the error, so dungeon
    // management (create/rename/delete) keeps working even though the map
    // list failed.
    await waitFor(() => expect(screen.getByText("Mt Moon")).toBeTruthy());
  });
});

// ---------------------------------------------------------------------------
// Task 13: Save flow UI -- I6's dirty-session guards (beforeunload, map
// switch), now wired through App.tsx's OWN real useEditSession(selected,
// layout.data?.blocks) call, real Toolbar, and real MapCanvas paint
// dispatch (not a hardcode -- Tasks 11/12 only ever proved painting through
// MapCanvas.test.tsx's own mocked editSession object; this is the first
// suite to drive a paint through the fully-wired app).
//
// Fixture mirrors MapCanvas.test.tsx's own tiny 2x2/border-1 layout (so
// pixel math is easy to predict by hand: originX/Y = 1*16 = 16, so a click
// at (20, 20) lands inside block (0, 0)) -- deliberately NOT reusing that
// file's own DATA constant (it's module-private there), just its shape.
// ---------------------------------------------------------------------------
const PALLET_TOWN_LAYOUT = {
  map: {
    id: "MAP_PALLET_TOWN", name: "PalletTown", layout: "LAYOUT_PALLET_TOWN",
    music: "MUS_DUMMY", regionMapSection: "MAPSEC_NONE", mapType: "MAP_TYPE_TOWN", weather: "WEATHER_NONE",
    connections: [], objectEvents: [], warpEvents: [], coordEvents: [], bgEvents: [],
  },
  layout: {
    id: "LAYOUT_PALLET_TOWN", name: "PalletTown_Layout", width: 2, height: 2, borderWidth: 1, borderHeight: 1,
    primaryTileset: "gTileset_General", secondaryTileset: "gTileset_Petalburg",
    borderFilepath: "data/layouts/PalletTown/border.bin", blockdataFilepath: "data/layouts/PalletTown/map.bin",
  },
  split: { version: "emerald", tiles: 512, metatiles: 512, pals: 6 },
  blocks: [
    { metatileId: 0x10, collision: 0, elevation: 3, behavior: 0 },
    { metatileId: 0x11, collision: 0, elevation: 3, behavior: 0 },
    { metatileId: 0x12, collision: 0, elevation: 3, behavior: 0 },
    { metatileId: 0x13, collision: 0, elevation: 3, behavior: 0 },
  ],
  // Small on purpose (real primary/secondary counts run into the hundreds --
  // MetatilePalette.test.tsx's own fixtures use single digits too, so a test
  // suite doesn't pay to render hundreds of thumbnail buttons per case).
  primaryCount: 4,
  secondaryCount: 2,
};

/** Same shape, a different map -- the switch target for the map-switch
 *  guard test below. Never actually loaded (the guard is expected to block
 *  the switch), but /api/map/Route1 still needs a route in case the guard
 *  fails open and the test would otherwise hang on an unmocked fetch. */
const ROUTE1_LAYOUT = { ...PALLET_TOWN_LAYOUT, map: { ...PALLET_TOWN_LAYOUT.map, id: "MAP_ROUTE1", name: "Route1" } };

const EDIT_GROUPS = { groupOrder: ["Kanto"], groups: { Kanto: ["PalletTown", "Route1"] } };

/** `paintApplyBodies`, when passed, gets every `/paint/apply` request body
 *  pushed onto it (parsed from JSON) -- lets a test inspect what stamp
 *  actually went over the wire without re-deriving it from DOM state. */
function makeEditFetchMock(paintApplyBodies?: unknown[]) {
  return vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "/api/groups") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(EDIT_GROUPS) } as Response);
    }
    if (url === "/api/map/PalletTown") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(PALLET_TOWN_LAYOUT) } as Response);
    }
    if (url === "/api/map/Route1") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(ROUTE1_LAYOUT) } as Response);
    }
    if (url.startsWith("/api/edit/PalletTown/paint/") && method === "POST") {
      if (url.endsWith("/paint/apply") && paintApplyBodies) {
        paintApplyBodies.push(JSON.parse(init!.body as string));
      }
      // /paint/end is the one call that actually marks the session dirty
      // (mirrors the real server: /paint/begin and /paint/apply don't flip
      // isDirty on their own -- see editSessions.ts's own /paint/end
      // handler, which only pushes an undo command, and therefore sets
      // isDirty, once a stroke actually finishes).
      const dirty = url.endsWith("/paint/end");
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ blocks: PALLET_TOWN_LAYOUT.blocks, border: [], isDirty: dirty, canUndo: dirty, canRedo: false }),
      } as Response);
    }
    // Plan 2 follow-up 5: mirrors the real server's own "nothing open"
    // discard response shape (packages/server/src/index.ts).
    if (url === "/api/edit/PalletTown/discard" && method === "POST") {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ blocks: [], border: [], map: null, isDirty: false, canUndo: false, canRedo: false }),
      } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
}

/** Renders App, selects PalletTown, activates the Toolbar's collision tool
 *  (the one paint tool that's live without a MetatilePalette -- see
 *  App.tsx's own `activeTool` doc comment), and paints one cell via a real
 *  mousedown/mouseup on the canvas -- driving editSession.isDirty to true
 *  through the REAL begin/apply/end round trip, not a mocked editSession
 *  object. */
async function renderAppInEditModeWithDirtySession() {
  const utils = render(<App />);
  // `getByRole("button", ...)`, not `getByText` -- once PalletTown is
  // selected, App.tsx's own `.app__status` header span ALSO renders the
  // map name as plain text, so a text-only query would match two elements.
  await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));

  await screen.findByRole("button", { name: "collision" });
  fireEvent.click(screen.getByRole("button", { name: "collision" }));

  const canvas = document.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
  await act(async () => {
    fireEvent.mouseDown(canvas, { clientX: 20, clientY: 20, button: 0 });
  });
  await act(async () => {
    fireEvent.mouseUp(canvas, { clientX: 20, clientY: 20, button: 0 });
  });
  await waitFor(() => expect(screen.getByTestId("dirty-indicator")).toBeTruthy());

  return utils;
}

describe("App -- Task 13 save flow", () => {
  it("in Map mode with a dirty session, attempting to switch maps shows a confirm() guard instead of switching silently, and does not switch on cancel", async () => {
    vi.stubGlobal("fetch", makeEditFetchMock());
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    await renderAppInEditModeWithDirtySession();

    fireEvent.click(screen.getByRole("button", { name: "Route1" }));

    expect(confirmSpy).toHaveBeenCalled();
    // Cancelled (confirm -> false): still on PalletTown, not silently
    // switched to Route1.
    expect(screen.getByRole("button", { name: "PalletTown" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: "Route1" }).getAttribute("aria-current")).not.toBe("true");

    confirmSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("registers a beforeunload handler while the edit session is dirty, and removes it on unmount", async () => {
    vi.stubGlobal("fetch", makeEditFetchMock());
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = await renderAppInEditModeWithDirtySession();
    expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));

    unmount();
    expect(removeSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  // Step 13 teeth-proof: pins the *gate*, not just the dirty-session
  // behaviour above -- a beforeunload effect that attaches unconditionally
  // (dropping the `if (!editSession.isDirty) return;` guard in App.tsx)
  // would still pass every test above, since they only ever check the
  // dirty case. This is the companion assertion that actually fails if
  // that guard is removed.
  it("does NOT register a beforeunload handler while the session is clean", async () => {
    vi.stubGlobal("fetch", makeEditFetchMock());
    const addSpy = vi.spyOn(window, "addEventListener");

    render(<App />);
    await waitFor(() => expect(screen.getByText("PalletTown")).toBeTruthy());
    fireEvent.click(screen.getByText("PalletTown"));
    await screen.findByRole("button", { name: "collision" }); // MapCanvas is mounted, nothing painted

    expect(addSpy).not.toHaveBeenCalledWith("beforeunload", expect.any(Function));

    addSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// Plan 2 follow-up 1: mounting MetatilePalette and wiring real stamps into
// pencil/rect/bucket. Before this, "pencil"/"rect"/"bucket" were selectable
// in the Toolbar but always resolved to a null activeTool (see App.tsx's own
// former comment on the `activeTool` useMemo) -- nothing supplied a Stamp.
// ---------------------------------------------------------------------------
describe("App -- metatile palette wiring", () => {
  it("mounts MetatilePalette once pencil is selected, and a subsequent paint sends the chosen stamp", async () => {
    const paintApplyBodies: unknown[] = [];
    vi.stubGlobal("fetch", makeEditFetchMock(paintApplyBodies));
    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));

    await screen.findByRole("button", { name: "pencil" });
    fireEvent.click(screen.getByRole("button", { name: "pencil" }));

    // MetatilePalette is now mounted -- its own search input is a
    // distinguishing marker, same query MetatilePalette.test.tsx itself uses.
    await waitFor(() => expect(screen.getByPlaceholderText(/search/i)).toBeTruthy());

    // A real, non-zero, non-placeholder id -- distinguishes a genuine
    // user-chosen stamp from a hardcoded one.
    fireEvent.click(screen.getByRole("button", { name: /metatile 0x1\b/i }));

    const canvas = document.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
    await act(async () => {
      fireEvent.mouseDown(canvas, { clientX: 20, clientY: 20, button: 0 });
    });
    await act(async () => {
      fireEvent.mouseUp(canvas, { clientX: 20, clientY: 20, button: 0 });
    });

    await waitFor(() => expect(paintApplyBodies.length).toBeGreaterThan(0));
    expect((paintApplyBodies[0] as any).stamp.cells[0].metatileId).toBe(1);

    vi.unstubAllGlobals();
  });

  it("keeps the chosen stamp when switching tools -- pencil/rect/bucket deliberately share one stamp (Porymap parity), no re-pick needed", async () => {
    const paintApplyBodies: unknown[] = [];
    vi.stubGlobal("fetch", makeEditFetchMock(paintApplyBodies));
    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));

    await screen.findByRole("button", { name: "pencil" });
    fireEvent.click(screen.getByRole("button", { name: "pencil" }));
    await waitFor(() => expect(screen.getByPlaceholderText(/search/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /metatile 0x1\b/i }));

    // Switch straight to bucket -- deliberately no fresh metatile pick here.
    fireEvent.click(screen.getByRole("button", { name: "bucket" }));
    await waitFor(() => expect(screen.getByPlaceholderText(/search/i)).toBeTruthy());

    const canvas = document.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
    await act(async () => {
      fireEvent.mouseDown(canvas, { clientX: 20, clientY: 20, button: 0 });
    });
    await act(async () => {
      fireEvent.mouseUp(canvas, { clientX: 20, clientY: 20, button: 0 });
    });

    // Bucket fired at all (not inert), and used the SAME id 1 chosen back
    // on pencil -- the stamp carried over across the tool switch rather
    // than resetting to null.
    await waitFor(() => expect(paintApplyBodies.length).toBeGreaterThan(0));
    const body = paintApplyBodies[0] as any;
    expect(body.tool).toBe("bucket");
    expect(body.replacement.metatileId).toBe(1);

    vi.unstubAllGlobals();
  });

  it("clears the chosen stamp when a different map is selected -- pencil goes inert until a fresh pick", async () => {
    vi.stubGlobal("fetch", makeEditFetchMock());
    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));

    await screen.findByRole("button", { name: "pencil" });
    fireEvent.click(screen.getByRole("button", { name: "pencil" }));
    await waitFor(() => expect(screen.getByPlaceholderText(/search/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /metatile 0x1\b/i }));

    // Switch to Route1 -- nothing painted yet on PalletTown, so the session
    // is clean and selectMap's confirm() guard never fires.
    fireEvent.click(screen.getByRole("button", { name: "Route1" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Route1" }).getAttribute("aria-current")).toBe("true"));
    await waitFor(() => expect(screen.getByPlaceholderText(/search/i)).toBeTruthy()); // MetatilePalette remounted for Route1

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const callsBefore = fetchMock.mock.calls.length;

    // Still on the pencil tool, but no fresh stamp chosen on Route1 -- a
    // stroke now must be a no-op (activeTool resolves to null): no
    // paint/begin|apply|end call fires at all.
    const canvas = document.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
    await act(async () => {
      fireEvent.mouseDown(canvas, { clientX: 20, clientY: 20, button: 0 });
    });
    await act(async () => {
      fireEvent.mouseUp(canvas, { clientX: 20, clientY: 20, button: 0 });
    });

    expect(fetchMock.mock.calls.length).toBe(callsBefore);

    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// Follow-up 3: dropper (click-to-pick, no currentStamp needed to activate)
// and shift (drag-to-shift, no currentStamp needed either) wired end-to-end.
// ---------------------------------------------------------------------------
describe("App -- dropper/shift tool wiring", () => {
  it("dropper and shift render enabled (not 'Not yet available')", async () => {
    vi.stubGlobal("fetch", makeEditFetchMock());
    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));

    const dropperBtn = await screen.findByRole("button", { name: "dropper" });
    const shiftBtn = await screen.findByRole("button", { name: "shift" });
    expect(dropperBtn.hasAttribute("disabled")).toBe(false);
    expect(shiftBtn.hasAttribute("disabled")).toBe(false);
    expect(dropperBtn.getAttribute("title")).not.toBe("Not yet available");
    expect(shiftBtn.getAttribute("title")).not.toBe("Not yet available");

    vi.unstubAllGlobals();
  });

  it("dropper activates with no currentStamp needed -- a picked block immediately becomes what pencil paints with next, no palette click required", async () => {
    const paintApplyBodies: unknown[] = [];
    vi.stubGlobal("fetch", makeEditFetchMock(paintApplyBodies));
    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));

    await screen.findByRole("button", { name: "dropper" });
    fireEvent.click(screen.getByRole("button", { name: "dropper" }));

    const canvas = document.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
    // Block (1,1) of PALLET_TOWN_LAYOUT (2x2, border 1, origin 16): composite
    // (40,40) lands inside it -- metatileId 0x13, distinct from block (0,0)'s
    // 0x10, so a later paint using 0x13 can only have come from THIS drop.
    await act(async () => {
      fireEvent.mouseDown(canvas, { clientX: 40, clientY: 40, button: 0 });
    });
    await act(async () => {
      fireEvent.mouseUp(canvas, { clientX: 40, clientY: 40, button: 0 });
    });
    // Dropper never opens a paint stroke -- no request fired for the pick itself.
    expect(paintApplyBodies.length).toBe(0);

    // Switch straight to pencil -- no MetatilePalette click, activeTool must
    // already resolve from the stamp the dropper just set.
    fireEvent.click(screen.getByRole("button", { name: "pencil" }));

    await act(async () => {
      fireEvent.mouseDown(canvas, { clientX: 20, clientY: 20, button: 0 }); // block (0,0)
    });
    await act(async () => {
      fireEvent.mouseUp(canvas, { clientX: 20, clientY: 20, button: 0 });
    });

    await waitFor(() => expect(paintApplyBodies.length).toBeGreaterThan(0));
    expect((paintApplyBodies[0] as any).stamp.cells[0].metatileId).toBe(0x13);

    vi.unstubAllGlobals();
  });

  it("shift activates with no currentStamp needed -- a drag sends {tool:'shift', dx, dy} to the server", async () => {
    const paintApplyBodies: unknown[] = [];
    vi.stubGlobal("fetch", makeEditFetchMock(paintApplyBodies));
    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));

    await screen.findByRole("button", { name: "shift" });
    fireEvent.click(screen.getByRole("button", { name: "shift" }));

    const canvas = document.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
    await act(async () => {
      fireEvent.mouseDown(canvas, { clientX: 20, clientY: 20, button: 0 }); // block (0,0)
    });
    await act(async () => {
      fireEvent.mouseUp(canvas, { clientX: 40, clientY: 40, button: 0 }); // block (1,1)
    });

    await waitFor(() => expect(paintApplyBodies.length).toBeGreaterThan(0));
    expect(paintApplyBodies[0]).toEqual({ tool: "shift", dx: 1, dy: 1 });

    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// Plan 2 follow-up 5: Discard Changes -- App.tsx's own handleDiscard, a
// confirm()-gated wrapper around editSession.discard(), wired into Toolbar
// as its own separate action from Save/Cancel.
// ---------------------------------------------------------------------------
describe("App -- discard flow", () => {
  it("clicking Discard Changes with window.confirm() -> true calls editSession.discard() (POSTs to /discard) and reverts the dirty session", async () => {
    vi.stubGlobal("fetch", makeEditFetchMock());
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    await renderAppInEditModeWithDirtySession();
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Discard Changes" }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/edit/PalletTown/discard", expect.objectContaining({ method: "POST" })),
    );
    // The session reverted -- dirty indicator clears, matching
    // useEditSession's own discard() resetting isDirty to false.
    await waitFor(() => expect(screen.queryByTestId("dirty-indicator")).toBeNull());

    confirmSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("clicking Discard Changes with window.confirm() -> false does not call discard, leaving the dirty session (and edits) intact", async () => {
    vi.stubGlobal("fetch", makeEditFetchMock());
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    await renderAppInEditModeWithDirtySession();
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Discard Changes" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/edit/PalletTown/discard", expect.anything());
    // Still dirty -- the cancelled discard changed nothing.
    expect(screen.getByTestId("dirty-indicator")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Save/ }) as HTMLButtonElement).disabled).toBe(false);

    confirmSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
