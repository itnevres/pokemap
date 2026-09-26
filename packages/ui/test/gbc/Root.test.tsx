import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Root } from "../../src/Root.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const GBA_GROUPS = { groupOrder: ["Kanto"], groups: { Kanto: ["Route1"] } };
const GBC_GROUPS = { groupOrder: ["OLIVINE"], groups: { OLIVINE: ["OlivineCity"] } };

/** Every route App's full tree can reach in Map mode, mirroring
 *  App.test.tsx's own makeFetchMock -- Root must never let a GBC project
 *  cause any of the GBA-only ones (/api/world, /api/dungeons, /api/species,
 *  /api/coverage) to be called at all, so this records every call made. */
function makeFetchMock(project: { family: "gba" | "gbc"; root: string } | "fail" | { bad: true }) {
  const calls: string[] = [];
  const mock = vi.fn((url: string) => {
    calls.push(url);
    if (url === "/api/project") {
      if (project === "fail") {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
      }
      if (typeof project === "object" && "bad" in project) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ family: "n64" }) } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(project) } as Response);
    }
    if (url === "/api/groups") {
      const groups = typeof project === "object" && "family" in project && project.family === "gbc" ? GBC_GROUPS : GBA_GROUPS;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(groups) } as Response);
    }
    if (url === "/api/dungeons") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch in test: ${url}`));
  });
  return { mock, calls };
}

describe("Root", () => {
  it("shows a loading placeholder before /api/project resolves", () => {
    const { mock } = makeFetchMock({ family: "gba", root: "/x" });
    vi.stubGlobal("fetch", mock);
    render(<Root />);
    expect(screen.getByText("Loading project…")).toBeTruthy();
  });

  it("gba renders App -- proven by App's own Dungeon button", async () => {
    const { mock } = makeFetchMock({ family: "gba", root: "/x" });
    vi.stubGlobal("fetch", mock);
    render(<Root />);

    await waitFor(() => expect(screen.getByText("Dungeon")).toBeTruthy());
  });

  it("gbc renders GbcApp -- proven by the Time of day group", async () => {
    const { mock } = makeFetchMock({ family: "gbc", root: "/root/pokemap-corpus/pokecrystal-PerfPlus" });
    vi.stubGlobal("fetch", mock);
    render(<Root />);

    await waitFor(() => expect(screen.getByRole("group", { name: "Time of day" })).toBeTruthy());
  });

  it("a 500 response shows the alert", async () => {
    const { mock } = makeFetchMock("fail");
    vi.stubGlobal("fetch", mock);
    render(<Root />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/^Could not open project: /);
    expect(alert.textContent).toMatch(/500/);
  });

  it("a bad shape ({ family: 'n64' }) shows the alert naming the bad value", async () => {
    const { mock } = makeFetchMock({ bad: true });
    vi.stubGlobal("fetch", mock);
    render(<Root />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/^Could not open project: /);
    expect(alert.textContent).toMatch(/n64/);
  });

  it("a gbc project's fetch is never called with a GBA-only path", async () => {
    const { mock, calls } = makeFetchMock({ family: "gbc", root: "/root/pokemap-corpus/pokecrystal-PerfPlus" });
    vi.stubGlobal("fetch", mock);
    render(<Root />);

    await waitFor(() => expect(screen.getByRole("group", { name: "Time of day" })).toBeTruthy());

    expect(calls).not.toContain("/api/world");
    expect(calls).not.toContain("/api/dungeons");
    expect(calls.some((u) => u.startsWith("/api/warps/"))).toBe(false);
    expect(calls.some((u) => u.startsWith("/api/species"))).toBe(false);
    expect(calls).not.toContain("/api/coverage");
  });
});
