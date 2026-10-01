import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { GbcEncounterSource } from "@pokemap/core/src/gbc/analyse/atlas.js";
import {
  EncounterBorder,
  tooltipLines,
  type EncounterBorderEntry,
  type EncounterBorderProps,
} from "../../src/components/EncounterBorder.js";
import { summariseGba, summariseGbc, type SpeciesSummary } from "../../src/encounters/summary.js";
import type { BorderSide } from "../../src/encounters/borderSide.js";

// The real Route30 sources (gbcEncounterSources(openGbcProject(PerfPlus), "Route30"),
// measured 2026-09-30), the same fixture B1's summary.test.ts pins -- pasted
// verbatim so this file never reads the corpus.
const ROUTE30: GbcEncounterSource[] = [
  { method: "grass", time: "morn", encounterRate: 9.765625, chances: [{ species: "CATERPIE", percent: 45, minLevel: 3, maxLevel: 8 }, { species: "LEDYBA", percent: 25, minLevel: 3, maxLevel: 7 }, { species: "PIDGEY", percent: 10, minLevel: 4, maxLevel: 8 }, { species: "WEEDLE", percent: 10, minLevel: 3, maxLevel: 7 }, { species: "HOPPIP", percent: 10, minLevel: 4, maxLevel: 8 }] },
  { method: "grass", time: "day", encounterRate: 9.765625, chances: [{ species: "CATERPIE", percent: 45, minLevel: 3, maxLevel: 8 }, { species: "PIDGEY", percent: 35, minLevel: 3, maxLevel: 8 }, { species: "WEEDLE", percent: 10, minLevel: 3, maxLevel: 7 }, { species: "HOPPIP", percent: 10, minLevel: 4, maxLevel: 8 }] },
  { method: "grass", time: "nite", encounterRate: 9.765625, chances: [{ species: "HOOTHOOT", percent: 45, minLevel: 3, maxLevel: 8 }, { species: "SPINARAK", percent: 25, minLevel: 3, maxLevel: 7 }, { species: "POLIWAG", percent: 20, minLevel: 4, maxLevel: 8 }, { species: "ZUBAT", percent: 10, minLevel: 3, maxLevel: 7 }] },
  { method: "water", encounterRate: 1.953125, chances: [{ species: "POLIWAG", percent: 75, minLevel: 15, maxLevel: 24 }, { species: "POLIWHIRL", percent: 25, minLevel: 20, maxLevel: 24 }] },
  { method: "fish", rod: "old", biteChance: 50, chances: [{ species: "MAGIKARP", percent: 85.15625, minLevel: 10, maxLevel: 10 }, { species: "POLIWAG", percent: 14.84375, minLevel: 10, maxLevel: 10 }] },
  { method: "fish", rod: "good", time: "day", biteChance: 50, chances: [{ species: "POLIWAG", percent: 64.84375, minLevel: 20, maxLevel: 20 }, { species: "MAGIKARP", percent: 35.15625, minLevel: 20, maxLevel: 20 }] },
  { method: "fish", rod: "good", time: "nite", biteChance: 50, chances: [{ species: "POLIWAG", percent: 64.84375, minLevel: 20, maxLevel: 20 }, { species: "MAGIKARP", percent: 35.15625, minLevel: 20, maxLevel: 20 }] },
  { method: "fish", rod: "super", time: "day", biteChance: 50, chances: [{ species: "POLIWAG", percent: 79.6875, minLevel: 40, maxLevel: 40 }, { species: "MAGIKARP", percent: 20.3125, minLevel: 40, maxLevel: 40 }] },
  { method: "fish", rod: "super", time: "nite", biteChance: 50, chances: [{ species: "POLIWAG", percent: 79.6875, minLevel: 40, maxLevel: 40 }, { species: "MAGIKARP", percent: 20.3125, minLevel: 40, maxLevel: 40 }] },
  { method: "headbutt", list: "common", chances: [{ species: "HOOTHOOT", percent: 50, minLevel: 10, maxLevel: 10 }, { species: "EXEGGCUTE", percent: 20, minLevel: 10, maxLevel: 10 }, { species: "SPINARAK", percent: 15, minLevel: 10, maxLevel: 10 }, { species: "LEDYBA", percent: 15, minLevel: 10, maxLevel: 10 }] },
  { method: "headbutt", list: "rare", chances: [{ species: "HOOTHOOT", percent: 50, minLevel: 10, maxLevel: 10 }, { species: "PINECO", percent: 30, minLevel: 10, maxLevel: 10 }, { species: "EXEGGCUTE", percent: 20, minLevel: 10, maxLevel: 10 }] },
];

const route30 = summariseGbc(ROUTE30);
const byName = (list: SpeciesSummary[], species: string) => list.find((s) => s.species === species)!;

// Espeon's 37.5 is not derivable from its slot count (2) -- a tooltip showing
// `slots.length` where it should show `percent` is caught by the exact strings.
const GBA_ROWS = [
  { method: "land_mons" as const, chances: [{ species: "SPECIES_ESPEON", percent: 37.5, minLevel: 2, maxLevel: 4, slots: [0, 1] }, { species: "SPECIES_RATTATA", percent: 12.5, minLevel: 3, maxLevel: 3, slots: [2] }] },
];
const gba = summariseGba(GBA_ROWS);

// ---------------------------------------------------------------------------
// tooltipLines (pure)
// ---------------------------------------------------------------------------

describe("tooltipLines (pure)", () => {
  it("POLIWAG on Route30: name, one line per row in row order, the + note; percent one decimal with a trailing .0 dropped", () => {
    expect(tooltipLines(byName(route30, "POLIWAG"))).toEqual([
      "Poliwag",
      "Grass · nite 20% Lv 4-8+ · rate 9.8%",
      "Surf 75% Lv 15-24+ · rate 2%",
      "Fish · Old Rod 14.8% Lv 10 · bite 50%",
      "Fish · Good Rod · day 64.8% Lv 20 · bite 50%",
      "Fish · Good Rod · nite 64.8% Lv 20 · bite 50%",
      "Fish · Super Rod · day 79.7% Lv 40 · bite 50%",
      "Fish · Super Rod · nite 79.7% Lv 40 · bite 50%",
      "+ = level can roll up to 4 higher",
    ]);
  });

  it("a GBA row: no rate, no +, no note", () => {
    expect(tooltipLines(byName(gba, "SPECIES_ESPEON"))).toEqual(["Espeon", "Land 37.5% Lv 2-4"]);
  });

  it("equal levels print as one level ('Lv 3', not 'Lv 3-3')", () => {
    expect(tooltipLines(byName(gba, "SPECIES_RATTATA"))).toEqual(["Rattata", "Land 12.5% Lv 3"]);
  });

  it("headbutt: list in the label, no rate, no bite, no + note", () => {
    expect(tooltipLines(byName(route30, "PINECO"))).toEqual(["Pineco", "Headbutt · rare 30% Lv 10"]);
  });

  it("the + note appears iff some row carries levelBuff (surf-only species has it, headbutt-only does not)", () => {
    expect(tooltipLines(byName(route30, "POLIWHIRL"))).toContain("+ = level can roll up to 4 higher");
    expect(tooltipLines(byName(route30, "PINECO")).some((l) => l.startsWith("+ ="))).toBe(false);
  });

  it("the time word stays in the row label (grass is three distinct tables)", () => {
    const lines = tooltipLines(byName(route30, "CATERPIE"));
    expect(lines).toContain("Grass · morn 45% Lv 3-8+ · rate 9.8%");
    expect(lines).toContain("Grass · day 45% Lv 3-8+ · rate 9.8%");
  });

  it("'Not encountered at <time>' appears iff the species is unavailable at the given time", () => {
    const zubat = byName(route30, "ZUBAT"); // nite only
    expect(tooltipLines(zubat, "morn").at(-1)).toBe("Not encountered at morn");
    expect(tooltipLines(zubat, "day").at(-1)).toBe("Not encountered at day");
    expect(tooltipLines(zubat, "nite").some((l) => l.startsWith("Not encountered"))).toBe(false);
    expect(tooltipLines(zubat).some((l) => l.startsWith("Not encountered"))).toBe(false); // no time given
    expect(tooltipLines(byName(route30, "POLIWAG"), "morn").some((l) => l.startsWith("Not encountered"))).toBe(false);
    expect(tooltipLines(byName(gba, "SPECIES_ESPEON"), "morn").some((l) => l.startsWith("Not encountered"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const RECT = { x: 100, y: 100, width: 80, height: 60 };

function entry(map: string, summaries: SpeciesSummary[] | undefined, side: BorderSide = "left", rect = RECT): EncounterBorderEntry {
  return { map, rect, side, summaries };
}

function mount(entries: EncounterBorderEntry[], props: Partial<EncounterBorderProps> = {}) {
  const defaults: EncounterBorderProps = { entries, zoom: 8, lodZoom: 4, band: 2 };
  const utils = render(<EncounterBorder {...defaults} {...props} />);
  const rerender = (next: Partial<EncounterBorderProps>) => utils.rerender(<EncounterBorder {...defaults} {...props} {...next} />);
  return { ...utils, rerender };
}

const toggleBtn = () => screen.getByRole("button", { name: "Encounters" });
const on = () => fireEvent.click(toggleBtn());
const sprite = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const strips = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(".encounter-border__strip")];
const px = (el: HTMLElement) => ({ x: el.style.left, y: el.style.top, w: el.style.width, h: el.style.height });

describe("EncounterBorder: toggle and legend", () => {
  it("is off by default: toggle unpressed, no legend, no sprites, no badge", () => {
    const { container } = mount([entry("Route101", gba)]);
    expect(toggleBtn().getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByRole("button", { name: "Espeon" })).toBeNull();
    expect(container.querySelector(".encounter-border__strip")).toBeNull();
    expect(container.querySelector(".encounter-border__badge")).toBeNull();
  });

  it("on: pressed, the legend appears with its explanations; off again removes it", () => {
    mount([entry("Route101", gba)]);
    on();
    expect(toggleBtn().getAttribute("aria-pressed")).toBe("true");
    const legend = screen.getByRole("note");
    expect(legend.textContent).toMatch(/one sprite per species/i);
    expect(legend.textContent).toMatch(/free side/i);
    expect(legend.textContent).toMatch(/count/i);
    on();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("with a time (GBC) the legend also explains dimming + dashed outline and the + level buff; without (GBA) it does not", () => {
    const { unmount } = mount([entry("Route30", route30)], { time: "day" });
    on();
    expect(screen.getByRole("note").textContent).toMatch(/dimmed/i);
    expect(screen.getByRole("note").textContent).toMatch(/dashed/i);
    expect(screen.getByRole("note").textContent).toMatch(/\+0-4/);
    unmount();
    mount([entry("Route101", gba)]);
    on();
    expect(screen.getByRole("note").textContent).not.toMatch(/dimmed/i);
    expect(screen.getByRole("note").textContent).not.toMatch(/\+0-4/);
  });
});

describe("EncounterBorder: strip geometry", () => {
  it("occupies bandRect(rect, side, bandPx) in screen px on all four sides (zoom 8, band 2 -> bandPx 16)", () => {
    const { container } = mount([
      entry("L", gba, "left"),
      entry("T", gba, "top"),
      entry("R", gba, "right"),
      entry("B", gba, "bottom"),
    ]);
    on();
    const at = (side: string) => px(container.querySelector<HTMLElement>(`.encounter-border__strip--${side}`)!);
    expect(at("left")).toEqual({ x: "84px", y: "100px", w: "16px", h: "60px" });
    expect(at("top")).toEqual({ x: "100px", y: "84px", w: "80px", h: "16px" });
    expect(at("right")).toEqual({ x: "180px", y: "100px", w: "16px", h: "60px" });
    expect(at("bottom")).toEqual({ x: "100px", y: "160px", w: "80px", h: "16px" });
  });

  it("sprites are spritePx square: bandPx at zoom 8, capped at 32 at zoom 20 (bandPx 40)", () => {
    const { rerender } = mount([entry("L", gba, "left", { ...RECT, height: 600 })]);
    on();
    expect(sprite("Espeon").querySelector("img")!.getAttribute("width")).toBe("16");
    expect(sprite("Espeon").querySelector("img")!.getAttribute("height")).toBe("16");
    rerender({ zoom: 20 });
    expect(sprite("Espeon").querySelector("img")!.getAttribute("width")).toBe("32");
    expect(sprite("Espeon").querySelector("img")!.getAttribute("height")).toBe("32");
  });

  it("the sprite image is the summary's iconUrl", () => {
    mount([entry("L", gba)]);
    on();
    expect(sprite("Espeon").querySelector("img")!.getAttribute("src")).toBe("/api/species/SPECIES_ESPEON/icon.png");
  });

  it("gives each of several maps its own strip, at its own rect", () => {
    const { container } = mount([
      entry("Route101", gba, "left"),
      entry("Route102", summariseGba([{ method: "water_mons", chances: [{ species: "SPECIES_MARILL", percent: 95, minLevel: 10, maxLevel: 35, slots: [0] }] }]), "top", { x: 500, y: 40, width: 80, height: 60 }),
    ]);
    on();
    const [a, b] = strips(container);
    expect(px(a!)).toEqual({ x: "84px", y: "100px", w: "16px", h: "60px" });
    expect(px(b!)).toEqual({ x: "500px", y: "24px", w: "80px", h: "16px" });
    expect(a!.contains(sprite("Espeon"))).toBe(true);
    expect(b!.contains(sprite("Marill"))).toBe(true);
  });
});

describe("EncounterBorder: capacity", () => {
  const five = summariseGba([
    { method: "land_mons", chances: ["A", "B", "C", "D", "E"].map((s, i) => ({ species: `SPECIES_${s}`, percent: 20 - i, minLevel: 2, maxLevel: 3, slots: [i] })) },
  ]);

  it("left side, height 60, spritePx 16 -> k 3: 5 species show 2 sprites and a '+3' chip", () => {
    const { container } = mount([entry("L", five, "left")]);
    on();
    const s = strips(container)[0]!;
    expect(s.querySelectorAll(".encounter-border__sprite").length).toBe(2);
    expect(s.querySelector(".encounter-border__more")!.textContent).toBe("+3");
    expect(screen.getByRole("button", { name: "A" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "B" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "C" })).toBeNull();
  });

  it("exactly k species show all k sprites and no chip; k+1 shows k-1 and '+2'", () => {
    const three = five.slice(0, 3);
    const { container, rerender } = mount([entry("L", three, "left")]);
    on();
    expect(container.querySelectorAll(".encounter-border__sprite").length).toBe(3);
    expect(container.querySelector(".encounter-border__more")).toBeNull();
    rerender({ entries: [entry("L", five.slice(0, 4), "left")] });
    expect(container.querySelectorAll(".encounter-border__sprite").length).toBe(2);
    expect(container.querySelector(".encounter-border__more")!.textContent).toBe("+2");
  });

  it("top/bottom use the width: width 80 / spritePx 16 -> k 5 fits 5 species with no chip", () => {
    const { container } = mount([entry("T", five, "top")]);
    on();
    expect(container.querySelectorAll(".encounter-border__sprite").length).toBe(5);
    expect(container.querySelector(".encounter-border__more")).toBeNull();
  });

  it("k is at least 1: a side shorter than one sprite with several species shows only the '+N' chip carrying the full count", () => {
    const { container } = mount([entry("L", five, "left", { ...RECT, height: 10 })]);
    on();
    expect(container.querySelectorAll(".encounter-border__sprite").length).toBe(0);
    expect(container.querySelector(".encounter-border__more")!.textContent).toBe("+5");
  });
});

describe("EncounterBorder: nothing for loading / none", () => {
  it("renders nothing for a map still loading (summaries undefined) and for a map with none ([])", () => {
    const { container } = mount([entry("Loading", undefined), entry("None", [])]);
    on();
    expect(container.querySelector(".encounter-border__strip")).toBeNull();
    expect(container.querySelector(".encounter-border__badge")).toBeNull();
  });
});

describe("EncounterBorder: LOD", () => {
  it("at lodZoom-1 a single badge replaces the strip; at lodZoom the sprites are back", () => {
    const { container, rerender } = mount([entry("Route101", gba)], { zoom: 3, lodZoom: 4 });
    on();
    expect(container.querySelector(".encounter-border__badge")).toBeTruthy();
    expect(container.querySelector(".encounter-border__strip")).toBeNull();
    expect(screen.queryByRole("button", { name: "Espeon" })).toBeNull();
    rerender({ zoom: 4 });
    expect(container.querySelector(".encounter-border__strip")).toBeTruthy();
    expect(container.querySelector(".encounter-border__badge")).toBeNull();
    expect(screen.getByRole("button", { name: "Espeon" })).toBeTruthy();
  });

  it("the badge names its map in visible text and the species count, with no dead title attribute", () => {
    const { container } = mount([entry("Route101", gba)], { zoom: 1 });
    on();
    const badge = container.querySelector(".encounter-border__badge")!;
    expect(badge.textContent).toBe("Route101 · 2 species");
    expect(badge.hasAttribute("title")).toBe(false);
  });

  it("the badge count is every species, dimmed or not", () => {
    const { container } = mount([entry("Route30", route30)], { zoom: 1, time: "morn" });
    on();
    expect(container.querySelector(".encounter-border__badge")!.textContent).toBe("Route30 · 13 species");
  });

  it("the badge sits in the same band rect as the strip would", () => {
    const { container } = mount([entry("Route101", gba, "top")], { zoom: 2, lodZoom: 4, band: 2 });
    on();
    // bandPx = 4: top band of {100,100,80,60} at zoom 2 is {100,96,80,4}.
    expect(px(container.querySelector<HTMLElement>(".encounter-border__badge")!)).toEqual({ x: "100px", y: "96px", w: "80px", h: "4px" });
  });
});

describe("EncounterBorder: dimming by time of day", () => {
  const wide = { ...RECT, height: 900 }; // room for all 13 Route30 species
  const dimmed = (name: string) => sprite(name).classList.contains("encounter-border__sprite--dimmed");

  it("morn: ZUBAT (nite only) is dimmed; POLIWAG and CATERPIE are not", () => {
    mount([entry("Route30", route30, "left", wide)], { time: "morn" });
    on();
    expect(dimmed("Zubat")).toBe(true);
    expect(dimmed("Poliwag")).toBe(false);
    expect(dimmed("Caterpie")).toBe(false);
  });

  it("nite: CATERPIE (morn/day only) is dimmed; ZUBAT is not", () => {
    mount([entry("Route30", route30, "left", wide)], { time: "nite" });
    on();
    expect(dimmed("Caterpie")).toBe(true);
    expect(dimmed("Zubat")).toBe(false);
  });

  it("a dimmed species still renders (dimming replaced the old time filter)", () => {
    mount([entry("Route30", route30, "left", wide)], { time: "morn" });
    on();
    expect(sprite("Zubat")).toBeTruthy();
  });

  it("no time -> nothing is dimmed, even for species that carry availableAt", () => {
    const { container } = mount([entry("Route30", route30, "left", wide)]);
    on();
    expect(container.querySelectorAll(".encounter-border__sprite--dimmed").length).toBe(0);
  });

  it("GBA summaries (no availableAt) are never dimmed, whatever time is passed", () => {
    const { container } = mount([entry("Route101", gba)], { time: "morn" });
    on();
    expect(container.querySelectorAll(".encounter-border__sprite--dimmed").length).toBe(0);
  });
});

describe("EncounterBorder: tooltip", () => {
  const wide = { ...RECT, height: 900 };

  it("hover shows the tooltip with the species' lines, one element per line; mouseleave hides it", () => {
    mount([entry("Route101", gba)]);
    on();
    fireEvent.mouseEnter(sprite("Espeon"));
    const tip = screen.getByRole("tooltip");
    expect([...tip.children].map((c) => c.textContent)).toEqual(["Espeon", "Land 37.5% Lv 2-4"]);
    expect(tip.textContent).not.toMatch(/slot/i);
    fireEvent.mouseLeave(sprite("Espeon"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("focus (not just hover) shows it for keyboard users; blur hides it", () => {
    mount([entry("Route101", gba)]);
    on();
    fireEvent.focus(sprite("Espeon"));
    expect(screen.getByRole("tooltip").textContent).toMatch(/37\.5%/);
    fireEvent.blur(sprite("Espeon"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("leaving a different sprite does not clear this sprite's tooltip (hide only clears its own key)", () => {
    mount([entry("Route101", gba)]);
    on();
    fireEvent.mouseEnter(sprite("Espeon"));
    fireEvent.mouseLeave(sprite("Rattata"));
    expect(screen.getByRole("tooltip")).toBeTruthy();
  });

  it("a dimmed species' tooltip ends with 'Not encountered at morn'; the GBC time is in its row labels", () => {
    mount([entry("Route30", route30, "left", wide)], { time: "morn" });
    on();
    fireEvent.mouseEnter(sprite("Zubat"));
    const lines = [...screen.getByRole("tooltip").children].map((c) => c.textContent);
    expect(lines).toEqual(["Zubat", "Grass · nite 10% Lv 3-7+ · rate 9.8%", "+ = level can roll up to 4 higher", "Not encountered at morn"]);
  });

  // The tooltip must be a sibling of the control/strips, not nested in a
  // strip: nested inside a strip it sits in the strip's stacking context and
  // can never paint above the legend (the original gutter's first review fix).
  it("is a top-level sibling of the strips, not nested inside any strip", () => {
    const { container } = mount([entry("Route101", gba)]);
    on();
    fireEvent.mouseEnter(sprite("Espeon"));
    const tip = screen.getByRole("tooltip");
    expect(tip.parentElement).toBe(container.querySelector(".encounter-border"));
    expect(container.querySelector(".encounter-border__strip")!.contains(tip)).toBe(false);
  });

  it("toggling off clears an open tooltip (and it does not come back on re-enabling)", () => {
    mount([entry("Route101", gba)]);
    on();
    fireEvent.focus(sprite("Espeon"));
    expect(screen.getByRole("tooltip")).toBeTruthy();
    on(); // off
    expect(screen.queryByRole("tooltip")).toBeNull();
    on(); // on again
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("zooming across the LOD threshold clears an open tooltip", () => {
    const { rerender } = mount([entry("Route101", gba)], { zoom: 8, lodZoom: 4 });
    on();
    fireEvent.focus(sprite("Espeon"));
    expect(screen.getByRole("tooltip")).toBeTruthy();
    rerender({ zoom: 2 });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("zooming without crossing the threshold still clears a stale tooltip (the sprite moved anyway)", () => {
    const { rerender } = mount([entry("Route101", gba, "left", { ...RECT, height: 600 })], { zoom: 16, lodZoom: 4 });
    on();
    fireEvent.focus(sprite("Espeon"));
    expect(screen.getByRole("tooltip")).toBeTruthy();
    rerender({ zoom: 10 });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("a changed time clears an open tooltip (the dimmed line may no longer hold)", () => {
    const { rerender } = mount([entry("Route30", route30, "left", wide)], { time: "morn" });
    on();
    fireEvent.focus(sprite("Zubat"));
    expect(screen.getByRole("tooltip")).toBeTruthy();
    rerender({ time: "nite" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("new entries (the map moved or its data changed) clear an open tooltip", () => {
    const { rerender } = mount([entry("Route101", gba)]);
    on();
    fireEvent.focus(sprite("Espeon"));
    rerender({ entries: [entry("Route101", gba, "left", { ...RECT, x: 120 })] });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("EncounterBorder: broken image", () => {
  it("hides a sprite whose icon 404s instead of showing the broken-image glyph", () => {
    mount([entry("Route101", gba)]);
    on();
    const img = sprite("Espeon").querySelector("img")!;
    fireEvent.error(img);
    expect(img.style.visibility).toBe("hidden");
  });
});
