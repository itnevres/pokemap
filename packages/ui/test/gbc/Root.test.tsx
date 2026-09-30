import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { Root } from "../../src/Root.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const GBA_GROUPS = { groupOrder: ["Kanto"], groups: { Kanto: ["Route1"] } };
const GBC_GROUPS = { groupOrder: ["OLIVINE"], groups: { OLIVINE: ["OlivineCity"] } };
const EMPTY_BROWSE = { dir: null, parent: null, entries: [] };

/**
 * Task A2 (U1 behaviour change): Root now fetches `/api/hub`
 * (`{ current, recent }`), not `/api/project` -- this mock's `project`
 * fixture now seeds `/api/hub`'s `current` field instead of being the whole
 * response. Still records every call App's/GbcApp's full tree can reach in
 * Map mode (mirroring App.test.tsx's own `makeFetchMock`), and now also
 * answers `/api/hub/browse` (an empty listing -- `ProjectPicker`, mounted
 * whenever `current` is null or the header switcher's modal is open, always
 * fetches this once it has a `dir`) and `/api/hub/open` (for the re-key
 * tests below, echoing back whatever `{ family, root }` the test configures
 * for the requested `path`).
 */
function makeFetchMock(
  project: { family: "gba" | "gbc"; root: string } | "fail" | { bad: true } | "empty",
  opts?: { openResponses?: Record<string, { family: "gba" | "gbc"; root: string }> },
) {
  const calls: string[] = [];
  const mock = vi.fn((url: string, init?: RequestInit) => {
    calls.push(url);
    if (url === "/api/hub") {
      if (project === "fail") {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
      }
      if (typeof project === "object" && "bad" in project) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ current: { family: "n64", root: "/x" }, recent: [] }),
        } as Response);
      }
      if (project === "empty") {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ current: null, recent: [] }) } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ current: project, recent: [] }) } as Response);
    }
    if (url === "/api/groups") {
      const groups = typeof project === "object" && "family" in project && project.family === "gbc" ? GBC_GROUPS : GBA_GROUPS;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(groups) } as Response);
    }
    if (url.startsWith("/api/hub/browse")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(EMPTY_BROWSE) } as Response);
    }
    if (url === "/api/hub/open" && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { path: string };
      const info = opts?.openResponses?.[body.path];
      if (!info) return Promise.reject(new Error(`unexpected /api/hub/open path in test: ${body.path}`));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(info) } as Response);
    }
    // No /api/dungeons (or /api/world/etc.) branch here on purpose: every
    // one of App's own GBA-only fetches is gated on `mode` (App's default
    // is "map"), so none of them are ever actually requested by any
    // scenario in this file. An unexpected call to one is exactly what the
    // rejection below is for.
    return Promise.reject(new Error(`unexpected fetch in test: ${url}`));
  });
  return { mock, calls };
}

describe("Root", () => {
  it("shows a loading placeholder before /api/hub resolves", () => {
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

  it("a bad shape (current.family: 'n64') shows the alert naming the bad value", async () => {
    const { mock } = makeFetchMock({ bad: true });
    vi.stubGlobal("fetch", mock);
    render(<Root />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/^Could not open project: /);
    expect(alert.textContent).toMatch(/n64/);
  });

  it("a gbc project never mounts App (its Dungeon button is absent) and its fetch is never called with a GBA-only path", async () => {
    const { mock, calls } = makeFetchMock({ family: "gbc", root: "/root/pokemap-corpus/pokecrystal-PerfPlus" });
    vi.stubGlobal("fetch", mock);
    render(<Root />);

    await waitFor(() => expect(screen.getByRole("group", { name: "Time of day" })).toBeTruthy());

    // Spec review finding 1: the fetch-list assertions below stay green even
    // if Root mounted a hidden <App/> ALONGSIDE <GbcApp/>, since App's own
    // GBA-only fetches are all gated on `mode` (default "map") and never
    // fire at mount regardless. This DOM assertion is what actually proves
    // App isn't mounted at all -- App's header renders its Dungeon button
    // unconditionally, independent of any fetch ever resolving.
    expect(screen.queryByText("Dungeon")).toBeNull();

    expect(calls).not.toContain("/api/world");
    expect(calls).not.toContain("/api/dungeons");
    expect(calls.some((u) => u.startsWith("/api/warps/"))).toBe(false);
    expect(calls.some((u) => u.startsWith("/api/species"))).toBe(false);
    expect(calls).not.toContain("/api/coverage");
  });

  // Task A2 addition: current: null (no project open yet) must show the
  // hub's own picker, not either shell -- and must never touch either
  // shell's own /api/groups (there is no map tree to show for a project
  // that isn't open).
  it("current: null shows ProjectPicker's 'Open a project' heading and never calls /api/groups", async () => {
    const { mock, calls } = makeFetchMock("empty");
    vi.stubGlobal("fetch", mock);
    render(<Root />);

    await waitFor(() => expect(screen.getByText("Open a project")).toBeTruthy());
    expect(calls).not.toContain("/api/groups");
  });

  // Task A2 addition: the switcher button (App.tsx/GbcApp.tsx's own
  // additive `switcher` prop) renders in both shells' headers once a
  // project is open.
  it("the header switcher button renders for both App and GbcApp", async () => {
    const { mock: gbaMock } = makeFetchMock({ family: "gba", root: "/x" });
    vi.stubGlobal("fetch", gbaMock);
    const gba = render(<Root />);
    await waitFor(() => expect(screen.getByRole("button", { name: /switch project/i })).toBeTruthy());
    gba.unmount();
    vi.unstubAllGlobals();

    const { mock: gbcMock } = makeFetchMock({ family: "gbc", root: "/root/pokemap-corpus/pokecrystal-PerfPlus" });
    vi.stubGlobal("fetch", gbcMock);
    render(<Root />);
    await waitFor(() => expect(screen.getByRole("button", { name: /switch project/i })).toBeTruthy());
  });

  // Task A2 addition (re-key remount, spec test 6): opening a DIFFERENT
  // root through the header switcher must remount GbcApp fresh -- proven by
  // its own local `time` state (bumped to "nite" pre-switch) resetting back
  // to the "day" default, since a real new mount always starts there.
  it("re-key remount: opening a different root through the switcher resets GbcApp's own state", async () => {
    const ROOT_A = "/root/pokemap-corpus/pokecrystal-A";
    const ROOT_B = "/root/pokemap-corpus/pokecrystal-B";
    const { mock } = makeFetchMock(
      { family: "gbc", root: ROOT_A },
      { openResponses: { [ROOT_B]: { family: "gbc", root: ROOT_B } } },
    );
    vi.stubGlobal("fetch", mock);
    render(<Root />);

    await waitFor(() => expect(screen.getByRole("group", { name: "Time of day" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Nite" }));
    expect(screen.getByRole("button", { name: "Nite" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /switch project/i }));
    const dialog = await screen.findByRole("dialog", { name: "Switch project" });
    fireEvent.change(within(dialog).getByLabelText("Folder path"), { target: { value: ROOT_B } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Open" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(screen.getByRole("button", { name: "Day" }).getAttribute("aria-pressed")).toBe("true"));
    expect(screen.getByRole("button", { name: "Nite" }).getAttribute("aria-pressed")).toBe("false");
  });

  // Task A2 addition (re-key remount, spec test 6): a FORCED re-open of the
  // SAME root also remounts -- `key`'s own `gen` suffix bumps on every
  // `onOpened` call regardless of whether family/root changed, because the
  // server's own handler swap (hub.ts) drops that root's in-memory sessions
  // even when it's the same root reopened.
  it("re-key remount: re-opening the SAME root through the switcher also remounts (gen bump)", async () => {
    const ROOT_A = "/root/pokemap-corpus/pokecrystal-A";
    const { mock } = makeFetchMock(
      { family: "gbc", root: ROOT_A },
      { openResponses: { [ROOT_A]: { family: "gbc", root: ROOT_A } } },
    );
    vi.stubGlobal("fetch", mock);
    render(<Root />);

    await waitFor(() => expect(screen.getByRole("group", { name: "Time of day" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Nite" }));
    expect(screen.getByRole("button", { name: "Nite" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /switch project/i }));
    const dialog = await screen.findByRole("dialog", { name: "Switch project" });
    fireEvent.change(within(dialog).getByLabelText("Folder path"), { target: { value: ROOT_A } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Open" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(screen.getByRole("button", { name: "Day" }).getAttribute("aria-pressed")).toBe("true"));
    expect(screen.getByRole("button", { name: "Nite" }).getAttribute("aria-pressed")).toBe("false");
  });
});
