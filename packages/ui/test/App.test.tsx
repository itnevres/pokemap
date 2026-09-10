import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
