import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { FamilyApp } from "../src/shell/FamilyApp.js";
import { gbaAdapter } from "../src/gba/adapter.js";
import { restoreViewport, stubViewport, withViewport } from "./viewport.js";

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
    if (url.startsWith("/api/defects/")) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ defects: [], incomplete: [] }) } as Response);
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("App", () => {
  it("remounts WorldCanvas fresh when switching from Dungeon mode back to World mode", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    render(<FamilyApp adapter={gbaAdapter} />);

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
    render(<FamilyApp adapter={gbaAdapter} />);

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
      if (url.startsWith("/api/defects/")) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ defects: [], incomplete: [] }) } as Response);
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<FamilyApp adapter={gbaAdapter} />);
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
    render(<FamilyApp adapter={gbaAdapter} />);

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
function makeEditFetchMock(paintApplyBodies?: unknown[], opts: { failEventAdd?: boolean } = {}) {
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
    // Follow-up 5 fix-round: lets a test populate the eventOpError banner
    // (a failed event op) before exercising discard, to prove discard()
    // clears a STALE error left over from an earlier, unrelated failure.
    if (url === "/api/edit/PalletTown/event/add" && method === "POST") {
      if (opts.failEventAdd) {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: "boom" }) } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ map: PALLET_TOWN_LAYOUT.map, isDirty: true }) } as Response);
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
    if (url.startsWith("/api/defects/")) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ defects: [], incomplete: [] }) } as Response);
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
  const utils = render(<FamilyApp adapter={gbaAdapter} />);
  // `getByRole("button", ...)`, not `getByText` -- once PalletTown is
  // selected, App.tsx's own `.app__status` header span ALSO renders the
  // map name as plain text, so a text-only query would match two elements.
  await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));

  await within(await screen.findByRole("group", { name: "Tools" })).findByRole("button", { name: "Collision" });
  fireEvent.click(within(screen.getByRole("group", { name: "Tools" })).getByRole("button", { name: "Collision" }));

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
  it("in Map mode with a dirty session, attempting to switch maps shows the switch prompt, and does not switch on cancel", async () => {
    vi.stubGlobal("fetch", makeEditFetchMock());

    await renderAppInEditModeWithDirtySession();

    fireEvent.click(screen.getByRole("button", { name: "Route1" }));

    expect(screen.getByRole("dialog", { name: "Unsaved changes" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // Cancelled (confirm -> false): still on PalletTown, not silently
    // switched to Route1.
    expect(screen.getByRole("button", { name: "PalletTown" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: "Route1" }).getAttribute("aria-current")).not.toBe("true");

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

    render(<FamilyApp adapter={gbaAdapter} />);
    await waitFor(() => expect(screen.getByText("PalletTown")).toBeTruthy());
    fireEvent.click(screen.getByText("PalletTown"));
    await within(await screen.findByRole("group", { name: "Tools" })).findByRole("button", { name: "Collision" }); // MapCanvas is mounted, nothing painted

    expect(addSpy).not.toHaveBeenCalledWith("beforeunload", expect.any(Function));

    addSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  // Plan 9 characterisation: App.tsx:96-102 -- selectMap -> changeSelection -> leave, so even the
  // ALREADY-selected map prompts while dirty. GBA never calls the server's discard before a switch.
  // Plan 10a R2 supersedes the historical behavior above: same-map never prompts in either family.
  it("re-clicking the selected map in the tree while dirty neither prompts nor discards", async () => {
    const fetchMock = makeEditFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    await renderAppInEditModeWithDirtySession();

    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).toBeNull();
    expect(screen.getByTestId("dirty-indicator")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).toBeNull();
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/discard"))).toBe(false);
    expect(screen.getByTestId("dirty-indicator")).toBeTruthy();

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
    render(<FamilyApp adapter={gbaAdapter} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));

    await screen.findByRole("button", { name: "Pencil" });
    fireEvent.click(screen.getByRole("button", { name: "Pencil" }));

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

  // Follow-up 6: proves currentStamp really flows DOWN into MetatilePalette's
  // own `selected` prop after a real pick, not just that onSelect fires (the
  // tests above already cover onSelect/paint wiring) -- the actual
  // end-to-end round trip App.tsx's `selected={currentStamp}` line adds.
  it("highlights the picked metatile in the palette itself after a real click, via currentStamp flowing back into selected", async () => {
    vi.stubGlobal("fetch", makeEditFetchMock());
    render(<FamilyApp adapter={gbaAdapter} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));

    await screen.findByRole("button", { name: "Pencil" });
    fireEvent.click(screen.getByRole("button", { name: "Pencil" }));
    await waitFor(() => expect(screen.getByPlaceholderText(/search/i)).toBeTruthy());

    const picked = screen.getByRole("button", { name: /metatile 0x1\b/i }) as HTMLButtonElement;
    expect(picked.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(picked);

    await waitFor(() => expect(picked.getAttribute("aria-pressed")).toBe("true"));

    vi.unstubAllGlobals();
  });

  // Plan 9 characterisation: useMapEditing lives at shell level (App.tsx:70), so the chosen tool and stamp
  // survive a mode round trip. FamilyApp keeps it in the GBA runtime, which lives as long as the shell.
  it("characterisation (Plan 9): the chosen tool and stamp survive a Map -> World -> Map round trip", async () => {
    const base = makeEditFetchMock();
    vi.stubGlobal("fetch", vi.fn((u: string, i?: RequestInit) => u === "/api/world"
      ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(makeWorld()) } as Response)
      : base(u, i)));
    render(<FamilyApp adapter={gbaAdapter} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));
    fireEvent.click(await screen.findByRole("button", { name: "Pencil" }));
    fireEvent.click(await screen.findByRole("button", { name: /metatile 0x1\b/i }));

    fireEvent.click(screen.getByRole("button", { name: "World" }));
    fireEvent.click(screen.getByRole("button", { name: "Map" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Pencil" }).getAttribute("aria-pressed")).toBe("true"));
    expect(screen.getByRole("button", { name: /metatile 0x1\b/i }).getAttribute("aria-pressed")).toBe("true");
    vi.unstubAllGlobals();
  });

  it("keeps the chosen stamp when switching tools -- pencil/rect/bucket deliberately share one stamp (Porymap parity), no re-pick needed", async () => {
    const paintApplyBodies: unknown[] = [];
    vi.stubGlobal("fetch", makeEditFetchMock(paintApplyBodies));
    render(<FamilyApp adapter={gbaAdapter} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));

    await screen.findByRole("button", { name: "Pencil" });
    fireEvent.click(screen.getByRole("button", { name: "Pencil" }));
    await waitFor(() => expect(screen.getByPlaceholderText(/search/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /metatile 0x1\b/i }));

    // Switch straight to bucket -- deliberately no fresh metatile pick here.
    fireEvent.click(screen.getByRole("button", { name: "Bucket" }));
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
    render(<FamilyApp adapter={gbaAdapter} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));

    await screen.findByRole("button", { name: "Pencil" });
    fireEvent.click(screen.getByRole("button", { name: "Pencil" }));
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

  // Plan 9 (R1, Review Focus 1): shortcuts work in Map view; typing in the rail's palette search never switches tools.
  it("P selects Pencil in Map view; typing p in the palette search box does not", async () => {
    vi.stubGlobal("fetch", makeEditFetchMock());
    render(<FamilyApp adapter={gbaAdapter} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));
    const search = await screen.findByPlaceholderText(/search/i);

    fireEvent.keyDown(search, { key: "p" });
    expect(screen.getByRole("button", { name: "Pencil" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.keyDown(window, { key: "p" });
    expect(screen.getByRole("button", { name: "Pencil" }).getAttribute("aria-pressed")).toBe("true");
    vi.unstubAllGlobals();
  });

  it("hovering the canvas highlights the matching palette cell (Plan 9 R2)", async () => {
    const layout = {
      ...PALLET_TOWN_LAYOUT,
      blocks: PALLET_TOWN_LAYOUT.blocks.map((block, index) => index === 1 ? { ...block, metatileId: 1 } : block),
    };
    const base = makeEditFetchMock();
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => url === "/api/map/PalletTown"
      ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(layout) } as Response)
      : base(url, init)));
    render(<FamilyApp adapter={gbaAdapter} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));
    await screen.findByPlaceholderText(/search/i);

    const canvas = document.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 64, bottom: 64, width: 64, height: 64, x: 0, y: 0, toJSON() {} });
    // jsdom's unmeasured viewport makes Fit use the 64x64 composite: zoom 1, pan (0,0).
    fireEvent.click(screen.getByRole("button", { name: "Fit" }));
    expect(screen.getByRole("button", { name: "1\u00d7" }).getAttribute("aria-pressed")).toBe("true");
    // Origin (16,16): (40,20) maps to block (1,0), index 1, locally set to rendered primary id 1.
    fireEvent.mouseMove(canvas, { clientX: 40, clientY: 20 });

    await waitFor(() => {
      const hovered = document.querySelector(".metatile-palette__cell--hovered");
      expect(hovered?.getAttribute("aria-label")).toBe("metatile 0x1");
    });

    // A same-map selection calls onSelected without triggering MapCanvas's redundant mapName reset.
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));
    expect(document.querySelector(".metatile-palette__cell--hovered")).toBeNull();
  });

  it("the palette highlight clears when switching to a different map (Plan 9 R2)", async () => {
    const layout = {
      ...PALLET_TOWN_LAYOUT,
      blocks: PALLET_TOWN_LAYOUT.blocks.map((block, index) => index === 1 ? { ...block, metatileId: 1 } : block),
    };
    const base = makeEditFetchMock();
    const route1 = { ...ROUTE1_LAYOUT, layout: { ...ROUTE1_LAYOUT.layout, name: "Route1_Layout" } };
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/map/PalletTown" || url === "/api/map/Route1") {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(url === "/api/map/PalletTown" ? layout : route1) } as Response);
      }
      return base(url, init);
    }));
    render(<FamilyApp adapter={gbaAdapter} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));
    await screen.findByPlaceholderText(/search/i);

    const canvas = document.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 64, bottom: 64, width: 64, height: 64, x: 0, y: 0, toJSON() {} });
    // Fit falls back to the native 64x64 composite in jsdom: zoom 1, pan (0,0).
    fireEvent.click(screen.getByRole("button", { name: "Fit" }));
    expect(screen.getByRole("button", { name: "1\u00d7" }).getAttribute("aria-pressed")).toBe("true");
    // Subtract origin (16,16), divide by 16: (40,20) is block (1,0), index 1, metatile id 1.
    fireEvent.mouseMove(canvas, { clientX: 40, clientY: 20 });
    await waitFor(() => expect(document.querySelector(".metatile-palette__cell--hovered")?.getAttribute("aria-label")).toBe("metatile 0x1"));

    // Prove onSelected clears independently of MapCanvas's mapName-change reset, then hover again.
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));
    expect(document.querySelector(".metatile-palette__cell--hovered")).toBeNull();
    fireEvent.mouseLeave(canvas);
    fireEvent.mouseMove(canvas, { clientX: 40, clientY: 20 });
    await waitFor(() => expect(document.querySelector(".metatile-palette__cell--hovered")?.getAttribute("aria-label")).toBe("metatile 0x1"));

    fireEvent.click(screen.getByRole("button", { name: "Route1" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Route1" }).getAttribute("aria-current")).toBe("true");
      expect(screen.getByRole("region", { name: "Route1 canvas" })).toBeTruthy();
      expect(document.querySelector('.metatile-palette__thumb[src="/api/metatile/Route1_Layout/1.png"]')).toBeTruthy();
      expect(document.querySelector(".metatile-palette__cell--hovered")).toBeNull();
    });
  });
});

describe("App -- Plan 9 shell characterisation", () => {
  it("Plan 10b: a dungeon rename keeps the GBA dungeon canvas pan (the filter cache is on for both families)", async () => {
    stubViewport(100);
    try {
      const world = {
        placements: {
          Route1: { map: "Route1", x: 0, y: 0, width: 10, height: 10, component: 0 },
          Route2: { map: "Route2", x: 30, y: 0, width: 10, height: 10, component: 1 },
        },
        components: [], conflicts: [], verticalLinks: [], sidecar: { dungeonAutoLayout: true },
      };
      const base = makeFetchMock();
      let dungeon = { id: "d1", name: "Tower", maps: ["Route1"] };
      vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
        if (url === "/api/dungeons" && !init) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([{ ...dungeon, maps: [...dungeon.maps] }]) } as Response);
        if (url === "/api/dungeons/d1" && init?.method === "PATCH") {
          dungeon = { ...dungeon, ...JSON.parse(String(init.body)) };
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(dungeon) } as Response);
        }
        if (url === "/api/world") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(world) } as Response);
        return base(url, init);
      }));
      const { container } = render(<FamilyApp adapter={gbaAdapter} />);
      fireEvent.click(screen.getByRole("button", { name: "Dungeon" }));
      await waitFor(() => expect(screen.getByRole("button", { name: /Tower/ })).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: /Tower/ }));
      const stage = container.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
      await waitFor(() => expect(container.querySelector(".world-canvas__status")?.textContent).toContain("placed 2"));
      fireEvent.click(screen.getByRole("button", { name: "Fit" }));
      fireEvent.click(stage, { clientX: 50, clientY: 50 });
      const outline = () => container.querySelector(".world-canvas__selection-outline:not(.world-canvas__jump-highlight)") as HTMLElement;
      const position = () => [outline().style.left, outline().style.top];
      const fitPosition = position();
      const fitZoom = container.querySelector(".world-canvas__zoom-readout")!.textContent;
      fireEvent.mouseDown(stage, { button: 0, clientX: 0, clientY: 0 });
      fireEvent.mouseMove(stage, { clientX: 20, clientY: 10 });
      fireEvent.mouseUp(stage);
      expect(position()).not.toEqual(fitPosition);
      const pannedPosition = position();
      fireEvent.change(screen.getByRole("textbox", { name: "Dungeon name" }), { target: { value: "New Tower" } });
      fireEvent.blur(screen.getByRole("textbox", { name: "Dungeon name" }));
      await waitFor(() => expect(screen.getByRole("button", { name: /New Tower/ })).toBeTruthy());
      expect(position()).toEqual(pannedPosition);
      expect(container.querySelector(".world-canvas__zoom-readout")!.textContent).toBe(fitZoom);
      fireEvent.mouseDown(stage, { button: 0, clientX: 0, clientY: 0 });
      fireEvent.mouseMove(stage, { clientX: 20, clientY: 10 });
      fireEvent.mouseUp(stage);
      const panBeforeMembershipChange = position();
      expect(panBeforeMembershipChange).not.toEqual(fitPosition);
      fireEvent.change(screen.getByPlaceholderText("Add map…"), { target: { value: "Route2" } });
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Remove Route2" })).toBeTruthy());
      await waitFor(() => expect(position()).not.toEqual(panBeforeMembershipChange));
      const membershipFitPosition = position();
      const membershipFitZoom = container.querySelector(".world-canvas__zoom-readout")!.textContent;
      // The canvas's explicit fit is the oracle for the new membership's automatic fit.
      fireEvent.mouseDown(stage, { button: 0, clientX: 0, clientY: 0 });
      fireEvent.mouseMove(stage, { clientX: 20, clientY: 10 });
      fireEvent.mouseUp(stage);
      expect(position()).not.toEqual(membershipFitPosition);
      fireEvent.click(screen.getByRole("button", { name: "Fit" }));
      expect(position()).toEqual(membershipFitPosition);
      expect(container.querySelector(".world-canvas__zoom-readout")!.textContent).toBe(membershipFitZoom);
    } finally {
      restoreViewport();
    }
    expect(Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Follow-up 3: dropper (click-to-pick, no currentStamp needed to activate)
// and shift (drag-to-shift, no currentStamp needed either) wired end-to-end.
// ---------------------------------------------------------------------------
describe("App -- dropper/shift tool wiring", () => {
  it("dropper and shift render enabled (not 'Not yet available')", async () => {
    vi.stubGlobal("fetch", makeEditFetchMock());
    render(<FamilyApp adapter={gbaAdapter} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));

    const dropperBtn = await screen.findByRole("button", { name: "Dropper" });
    const shiftBtn = await screen.findByRole("button", { name: "Shift" });
    expect(dropperBtn.hasAttribute("disabled")).toBe(false);
    expect(shiftBtn.hasAttribute("disabled")).toBe(false);
    expect(dropperBtn.getAttribute("title")).not.toBe("Not yet available");
    expect(shiftBtn.getAttribute("title")).not.toBe("Not yet available");

    vi.unstubAllGlobals();
  });

  it("dropper activates with no currentStamp needed -- a picked block immediately becomes what pencil paints with next, no palette click required", async () => {
    const paintApplyBodies: unknown[] = [];
    vi.stubGlobal("fetch", makeEditFetchMock(paintApplyBodies));
    render(<FamilyApp adapter={gbaAdapter} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));

    await screen.findByRole("button", { name: "Dropper" });
    fireEvent.click(screen.getByRole("button", { name: "Dropper" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Pencil" }));

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
    render(<FamilyApp adapter={gbaAdapter} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));

    await screen.findByRole("button", { name: "Shift" });
    fireEvent.click(screen.getByRole("button", { name: "Shift" }));

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

  // Fix-round: handleDiscard used to only wire the FAILURE half of the
  // eventOpError banner convention (setEventOpError on .catch, never
  // cleared on success) -- unlike onCanvasMoveEvent/onMoveEventFromInspector/
  // onDeleteEvent, which all clear it on success too. A stale error from an
  // earlier, unrelated failed op would otherwise linger on screen after a
  // later successful discard, describing a problem that no longer applies
  // to the just-reverted session.
  it("a successful discard clears a stale eventOpError banner left over from an earlier failed event op", async () => {
    vi.stubGlobal("fetch", makeEditFetchMock(undefined, { failEventAdd: true }));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<FamilyApp adapter={gbaAdapter} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));

    // Fail an event add first -- populates the eventOpError banner.
    const addEventBtn = await screen.findByRole("button", { name: "Add Event" });
    await act(async () => { fireEvent.click(addEventBtn); });
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());

    // Dirty the session via a real paint so Discard Changes is enabled.
    await within(await screen.findByRole("group", { name: "Tools" })).findByRole("button", { name: "Collision" });
    fireEvent.click(within(screen.getByRole("group", { name: "Tools" })).getByRole("button", { name: "Collision" }));
    const canvas = document.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
    await act(async () => {
      fireEvent.mouseDown(canvas, { clientX: 20, clientY: 20, button: 0 });
    });
    await act(async () => {
      fireEvent.mouseUp(canvas, { clientX: 20, clientY: 20, button: 0 });
    });
    await waitFor(() => expect(screen.getByTestId("dirty-indicator")).toBeTruthy());
    expect(screen.getByRole("alert")).toBeTruthy(); // still stale from the earlier failure

    fireEvent.click(screen.getByRole("button", { name: "Discard Changes" }));

    // The successful discard clears the stale banner, not just the dirty
    // state.
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());

    confirmSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe("App -- coverage lens list jump (Plan 6c C1)", () => {
  /** Per-test override of makeFetchMock's empty /api/coverage: Route1 and Route2 are empty maps. */
  function stubEmptyCoverage() {
    const base = makeFetchMock();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) =>
        url === "/api/coverage"
          ? Promise.resolve({
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({
                  mapsWithEncounters: 0, encounterTables: 0, mapsWithoutEncounters: ["Route2", "Route1"],
                  levelByMap: [], unusedSpecies: [],
                  byMethod: { land_mons: 0, water_mons: 0, rock_smash_mons: 0, fishing_mons: 0 },
                }),
            } as Response)
          : base(url, init),
      ),
    );
  }

  it("clicking an Empty maps list entry in World mode selects that map and jumps the canvas there, like a tree click", async () => {
    stubEmptyCoverage();
    render(<FamilyApp adapter={gbaAdapter} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Route2" })).toBeTruthy());
    const currentTreeRow = () => screen.getAllByRole("button", { name: "Route2" }).find((b) => b.getAttribute("aria-current") === "true");
    expect(currentTreeRow()).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: "World" }));
    // A first jump (tree click on Route1) so the next one has to bump the token: the highlight is keyed on
    // jumpToken, so a second jump remounts it, while a selection that does not bump leaves the same node.
    fireEvent.click(screen.getByRole("button", { name: "Route1" }));
    await waitFor(() => expect(document.querySelector(".world-canvas__jump-highlight")).toBeTruthy());
    const firstJump = document.querySelector(".world-canvas__jump-highlight");

    fireEvent.click(await screen.findByLabelText(/empty maps lens/i));
    fireEvent.click(screen.getByRole("button", { name: "List them" }));
    const ul = screen.getByRole("list", { name: "Maps with no encounters" });
    fireEvent.click(ul.querySelector("button")!); // "Route2": the first entry in payload order

    await waitFor(() => expect(currentTreeRow()).toBeTruthy());
    await waitFor(() => {
      const now = document.querySelector(".world-canvas__jump-highlight");
      expect(now).toBeTruthy();
      expect(now).not.toBe(firstJump);
    });
  });

  it("in Dungeon mode (no jump target) the Empty maps lens offers no List them button", async () => {
    stubEmptyCoverage();
    render(<FamilyApp adapter={gbaAdapter} />);
    fireEvent.click(screen.getByRole("button", { name: "Dungeon" }));
    await waitFor(() => expect(screen.getByText("Mt Moon")).toBeTruthy());
    fireEvent.click(screen.getByText("Mt Moon"));
    fireEvent.click(await screen.findByLabelText(/empty maps lens/i));
    expect(document.querySelector(".world-canvas__legend-row")!.textContent).toMatch(/2 maps have no encounters/);
    expect(screen.queryByRole("button", { name: "List them" })).toBeNull();
  });
});

describe("App -- world click selects the map in the tree (Plan 6c C2)", () => {
  // withViewport (test/viewport.ts): WorldCanvas measures its viewport once on mount, so it must be in
  // force before the World button is clicked.
  const zoomReadout = () => document.querySelector(".world-canvas__zoom-readout")!.textContent;
  /** Enters World mode and waits for `readout` (the world has loaded and any jump on entry has applied).
   *  WorldCanvas never auto-fits on load: a fresh view is zoom 1, pan 0 ("6%"); entering World mode with a map
   *  already selected jumps to it (zoom 10, "63%"). */
  async function worldCanvasReady(readout: string, width = 100) {
    fireEvent.click(screen.getByRole("button", { name: "World" }));
    await waitFor(() => expect(zoomReadout()).toBe(readout));
    const canvas = document.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: width, bottom: 100, width, height: 100, x: 0, y: 0, toJSON() {} });
    return canvas;
  }
  function clickAt(canvas: HTMLCanvasElement, [x, y]: readonly [number, number]) {
    fireEvent.mouseDown(canvas, { clientX: x, clientY: y, button: 0 });
    fireEvent.mouseUp(canvas, { clientX: x, clientY: y });
    fireEvent.click(canvas, { clientX: x, clientY: y });
  }
  const currentRow = () => document.querySelector<HTMLElement>('.map-tree__map[aria-current="true"]');

  /** Route1 at world x 0, Route2 at x 11. In a 200x100 viewport a jump to either fills its own 100px (zoom 10,
   *  "63%"): Route1 at screen x [50,150) with Route2 showing at [160,200); at the default zoom 1 / pan 0 they sit
   *  at [0,10) and [11,21). */
  function stubTwoMapWorld() {
    const base = makeFetchMock();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) =>
        url === "/api/world"
          ? Promise.resolve({
              ok: true, status: 200,
              json: () => Promise.resolve({
                placements: {
                  Route1: { map: "Route1", x: 0, y: 0, width: 10, height: 10, component: 0 },
                  Route2: { map: "Route2", x: 11, y: 0, width: 10, height: 10, component: 1 },
                },
                components: [
                  { index: 0, maps: ["Route1"], bounds: { x: 0, y: 0, width: 10, height: 10 } },
                  { index: 1, maps: ["Route2"], bounds: { x: 11, y: 0, width: 10, height: 10 } },
                ],
                conflicts: [], verticalLinks: [], sidecar: { dungeonAutoLayout: true },
              }),
            } as Response)
          : base(url, init),
      ),
    );
  }

  // "A tree click in World mode still jumps" is already pinned by the C1 test above: "clicking an Empty maps
  // list entry ..." starts with a tree click on Route1 and waits for .world-canvas__jump-highlight.

  it("a canvas click on a map highlights its tree row and scrolls it into view, without jumping the view (GBA mirror of GbcApp's F1 test)", async () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    try {
      await withViewport(async () => {
        vi.stubGlobal("fetch", makeFetchMock());
        render(<FamilyApp adapter={gbaAdapter} />);
        await waitFor(() => expect(screen.getByRole("button", { name: "Route1" })).toBeTruthy());
        const canvas = await worldCanvasReady("6%");
        await waitFor(() => expect(screen.queryByText(/Loading world/)).toBeNull());
        expect(currentRow()).toBeNull();
        spy.mockClear();

        clickAt(canvas, [5, 5]); // Route1 is [0,10)x[0,10): the very first selection, jumpToMap still null beforehand

        await waitFor(() => expect(currentRow()?.textContent).toBe("Route1"));
        expect(spy.mock.contexts).toContain(currentRow());
        expect(spy).toHaveBeenCalledWith({ block: "nearest" });
        await act(async () => {});
        expect(document.querySelector(".world-canvas__jump-highlight")).toBeNull(); // no jump fired
        expect(zoomReadout()).toBe("6%"); // view untouched
      });
    } finally {
      spy.mockRestore();
    }
  });

  it("a canvas click after a tree jump selects the new map but does not re-jump (no new jump highlight, view kept)", async () => {
    await withViewport(async () => {
      stubTwoMapWorld();
      render(<FamilyApp adapter={gbaAdapter} />);
      await waitFor(() => expect(screen.getByRole("button", { name: "Route1" })).toBeTruthy());
      const canvas = await worldCanvasReady("6%", 200);
      await waitFor(() => expect(screen.queryByText(/Loading world/)).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: "Route1" })); // a tree click: jumps
      await waitFor(() => expect(zoomReadout()).toBe("63%"));
      const firstJump = document.querySelector(".world-canvas__jump-highlight");
      expect(firstJump).toBeTruthy();

      clickAt(canvas, [180, 50]); // Route2

      await waitFor(() => expect(currentRow()?.textContent).toBe("Route2"));
      await act(async () => {});
      // A re-jump would mount a fresh highlight (it is keyed on jumpToken); the original may have faded, never been replaced.
      const now = document.querySelector(".world-canvas__jump-highlight");
      expect(now === null || now === firstJump).toBe(true);
      expect(zoomReadout()).toBe("63%");
    }, 200);
  });

  const clickMode = (name: "Map" | "World" | "Dungeon") => fireEvent.click(screen.getByRole("button", { name }));
  const jumpHighlight = () => document.querySelector(".world-canvas__jump-highlight");

  it("entering World after tree-click A, world-click B, Map view centres on B, not on the stale tree target A", async () => {
    await withViewport(async () => {
      stubTwoMapWorld();
      render(<FamilyApp adapter={gbaAdapter} />);
      await waitFor(() => expect(screen.getByRole("button", { name: "Route1" })).toBeTruthy());
      const canvas = await worldCanvasReady("6%", 200);
      await waitFor(() => expect(screen.queryByText(/Loading world/)).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: "Route1" })); // A: a tree click, jumpTarget = Route1
      await waitFor(() => expect(zoomReadout()).toBe("63%"));
      clickAt(canvas, [180, 50]); // B = Route2: a world click, selects only
      await waitFor(() => expect(currentRow()?.textContent).toBe("Route2"));

      clickMode("Map");
      clickMode("World");

      await waitFor(() => expect(jumpHighlight()).toBeTruthy());
      await waitFor(() => expect(zoomReadout()).toBe("63%"));
      const fresh = document.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
      fresh.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100, x: 0, y: 0, toJSON() {} });
      clickAt(fresh, [100, 50]); // the centre: Route2 if the view centred on B, Route1 if it jumped to the stale A
      await act(async () => {});
      expect(currentRow()?.textContent).toBe("Route2");
    }, 200);
  });

  it("entering World after only a world click on B (no tree click ever) jumps to B", async () => {
    await withViewport(async () => {
      stubTwoMapWorld();
      render(<FamilyApp adapter={gbaAdapter} />);
      await waitFor(() => expect(screen.getByRole("button", { name: "Route1" })).toBeTruthy());
      const canvas = await worldCanvasReady("6%", 200);
      await waitFor(() => expect(screen.queryByText(/Loading world/)).toBeNull());
      clickAt(canvas, [15, 5]); // Route2 at the default zoom-1 view is [11,21)x[0,10)
      await waitFor(() => expect(currentRow()?.textContent).toBe("Route2"));
      expect(zoomReadout()).toBe("6%");

      clickMode("Map");
      clickMode("World");

      await waitFor(() => expect(zoomReadout()).toBe("63%")); // jumped; before, jumpTarget was null and the view stayed at 6%
      await waitFor(() => expect(jumpHighlight()).toBeTruthy());
    }, 200);
  });

  it("pressing World while already in World does not re-jump (no new highlight, view kept)", async () => {
    await withViewport(async () => {
      stubTwoMapWorld();
      render(<FamilyApp adapter={gbaAdapter} />);
      await waitFor(() => expect(screen.getByRole("button", { name: "Route1" })).toBeTruthy());
      await worldCanvasReady("6%", 200);
      await waitFor(() => expect(screen.queryByText(/Loading world/)).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: "Route1" }));
      await waitFor(() => expect(zoomReadout()).toBe("63%"));
      const first = jumpHighlight();
      expect(first).toBeTruthy();

      clickMode("World");
      await act(async () => {});

      const now = jumpHighlight(); // a re-jump would mount a fresh node (keyed on jumpToken); the first may have faded
      expect(now === null || now === first).toBe(true);
      expect(zoomReadout()).toBe("63%");
    }, 200);
  });

  it("in Dungeon mode a canvas click on a map does not change the app's selection (the dungeon canvas gets no onSelectMap)", async () => {
    await withViewport(async () => {
      vi.stubGlobal("fetch", makeFetchMock()); // dungeon "Mt Moon" holds Route1
      render(<FamilyApp adapter={gbaAdapter} />);
      clickMode("Dungeon");
      await waitFor(() => expect(screen.getByText("Mt Moon")).toBeTruthy());
      fireEvent.click(screen.getByText("Mt Moon"));
      // The dungeon view fits its member map: Route1 fills the 100x100 viewport (zoom 10, "63%").
      await waitFor(() => expect(zoomReadout()).toBe("63%"));
      const canvas = document.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON() {} });

      clickAt(canvas, [50, 50]);

      // Control: the canvas did take the click (its own selection outline), so the click landed on Route1.
      expect(document.querySelector('.world-canvas__selection-outline[data-map="Route1"]')).toBeTruthy();
      // The dungeon sidebar has no tree, so check the selection-driven UI after returning to Map mode.
      clickMode("Map");
      expect(currentRow()).toBeNull();
      expect(document.querySelector(".app__status")).toBeNull();
    });
  });

  describe("with a dirty edit session on PalletTown", () => {
    // Entering World mode jumps to the selected PalletTown: zoom 10 in a 200x100 viewport, pan {50, 0}, so
    // PalletTown fills screen x [50,150) and Route1 (placed at x 11) shows at [160,200).
    const PALLET = [100, 50] as const;
    const ROUTE1 = [180, 50] as const;
    /** Edit routes for PalletTown/Route1, and a world placing both, everything else from the default mock. */
    function stubDirtyWorld() {
      const edit = makeEditFetchMock();
      const rest = makeFetchMock();
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string, init?: RequestInit) => {
          if (url === "/api/world") {
            return Promise.resolve({
              ok: true, status: 200,
              json: () => Promise.resolve({
                placements: {
                  PalletTown: { map: "PalletTown", x: 0, y: 0, width: 10, height: 10, component: 0 },
                  Route1: { map: "Route1", x: 11, y: 0, width: 10, height: 10, component: 1 },
                },
                components: [
                  { index: 0, maps: ["PalletTown"], bounds: { x: 0, y: 0, width: 10, height: 10 } },
                  { index: 1, maps: ["Route1"], bounds: { x: 11, y: 0, width: 10, height: 10 } },
                ],
                conflicts: [], verticalLinks: [], sidecar: { dungeonAutoLayout: true },
              }),
            } as Response);
          }
          return url === "/api/groups" || url.startsWith("/api/map/") || url.startsWith("/api/edit/") ? edit(url, init) : rest(url, init);
        }),
      );
    }

    it("a world click on another map asks to discard first; cancelling leaves the tree on the original map", async () => {
      stubDirtyWorld();
      await renderAppInEditModeWithDirtySession();
      await withViewport(async () => {
        const canvas = await worldCanvasReady("63%", 200);
        expect(currentRow()?.textContent).toBe("PalletTown");

        clickAt(canvas, ROUTE1);

        expect(screen.getByRole("dialog", { name: "Unsaved changes" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(currentRow()?.textContent).toBe("PalletTown");
      }, 200);
    });

    it("choosing Discard switches the tree to the clicked map", async () => {
      stubDirtyWorld();
      await renderAppInEditModeWithDirtySession();
      await withViewport(async () => {
        const canvas = await worldCanvasReady("63%", 200);
        clickAt(canvas, ROUTE1);
        fireEvent.click(screen.getByRole("button", { name: "Discard" }));
        await waitFor(() => expect(currentRow()?.textContent).toBe("Route1"));
      }, 200);
    });

    it("re-clicking the already-selected map in the world does not raise the prompt", async () => {
      stubDirtyWorld();
      await renderAppInEditModeWithDirtySession();
      await withViewport(async () => {
        const canvas = await worldCanvasReady("63%", 200);
        clickAt(canvas, PALLET); // already selected and dirty
        expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).toBeNull();
        expect(currentRow()?.textContent).toBe("PalletTown");

        // Positive control: the canvas is live, so a click on another map does ask.
        clickAt(canvas, ROUTE1);
        expect(screen.getByRole("dialog", { name: "Unsaved changes" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      }, 200);
    });
  });

});
