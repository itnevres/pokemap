import type { ReactNode } from "react";
import type { ToolKind } from "../components/Toolbar.js";
import type { MapGroupsData } from "../components/MapTree.js";
import type { MapVisibilityInfo } from "../world/visibility.js";
import type { UseDungeonsResult } from "../hooks/useDungeons.js";
import type { UseContextEditingArgs, ContextEditing } from "../shared/useContextEditing.js";
import type { useStrokeChainRegistry } from "../shared/useStrokeChain.js";

export type Family = "gba" | "gbc";
export type Mode = "map" | "world" | "dungeon";

/** What only one engine does today (Plan 9). Flags marked "descriptive" have no reader yet; a test pins their values. */
export interface Capabilities {
  collisionTool: boolean;       // read: toolbar tool list (toolsFor)
  elevationOverlay: boolean;    // descriptive (MapCanvas owns the toggle); read from Plan 11
  addEvent: boolean;            // descriptive (the inspector is per family); read from Plan 10
  addSign: boolean;             // read: toolbar "Add Sign"
  timeOfDay: boolean;           // read: header slot
  defectsBanner: boolean;       // descriptive (GBC renderMap owns it); read from Plan 10 (D3)
  manualPlacements: boolean;    // read: tree visibility merge in FamilyApp
  dungeonFilterCache: boolean;  // read: FamilyApp's mapFilter (useDungeonFilter)
  worldBar: { dungeonAutoLayout: boolean; unplacedRail: boolean }; // descriptive (inside the world canvas); read from Plan 10
}

export const GBA_CAPABILITIES: Capabilities = {
  collisionTool: true, elevationOverlay: true, addEvent: true, addSign: true, timeOfDay: false,
  defectsBanner: false, manualPlacements: false, dungeonFilterCache: false,
  worldBar: { dungeonAutoLayout: true, unplacedRail: true },
};

export const GBC_CAPABILITIES: Capabilities = {
  collisionTool: false, elevationOverlay: false, addEvent: false, addSign: false, timeOfDay: true,
  defectsBanner: true, manualPlacements: true, dungeonFilterCache: true,
  worldBar: { dungeonAutoLayout: false, unplacedRail: false },
};

export const ALL_TOOLS: ToolKind[] = ["pencil", "rect", "bucket", "dropper", "shift", "collision"];

/** The toolbar's tool list for a family, in toolbar order. */
export const toolsFor = (caps: Capabilities): ToolKind[] => ALL_TOOLS.filter((k) => k !== "collision" || caps.collisionTool);

/** The runtime hook's only inputs. Everything else reaches the render slots as ShellSlots. */
export interface RuntimeArgs {
  selected: string | null;
  mode: Mode;
}

/** What FamilyApp hands the runtime's render slots on every render (never hook inputs). */
export interface ShellSlots {
  jumpTarget: string | null;
  jumpToken: number;
  selectMap(name: string): void;
  selectMapFromWorld(name: string): void;
  openMapFromWorld(name: string): void;
  enterContext(name: string): void;
  requestExitContext(): void;
  contextMap: string | null;
  tileVersions: ContextEditing["tileVersions"];
  onStrokeChain: ReturnType<typeof useStrokeChainRegistry>["onStrokeChain"];
  markManualPlacement(name: string): void;
}

export interface FamilyRuntime {
  groups: { data: MapGroupsData | null; error: string | null };
  /** The edit session for `selected` (beforeunload guard and context editing). */
  session: UseContextEditingArgs["session"];
  /** The family's switch policy. `sameMap` is true only for a tree click on the selected map. */
  leave(go: () => void, opts: { sameMap: boolean }): void;
  /** Family side effects of every selection change (after setSelected). */
  onSelected(name: string): void;
  /** Family side effects before entering in-context editing on `name`. */
  onEnterContext(name: string): void;
  /** Tree visibility before FamilyApp's manual-placement merge. */
  visibility: { placed: Map<string, MapVisibilityInfo> | null; error: string | null };
  hiddenMapTypes: ReadonlySet<string>;
  dungeons: UseDungeonsResult;
  /** Map view: error for `selected`, and whether its payload is ready to render. */
  map: { error: string | null; ready: boolean };
  renderMap(slots: ShellSlots): ReactNode;
  renderWorld(slots: ShellSlots): ReactNode;
  renderDungeon(mapFilter: Set<string>, slots: ShellSlots): ReactNode;
  headerExtras: ReactNode;
  /** At <main> level in every mode. */
  banners: ReactNode;
  /** Siblings after SaveDialog at <main> level. */
  modals: ReactNode;
  saveDialog: { open: boolean; setOpen(open: boolean): void; onCommitted(): void };
}

export interface EngineAdapter {
  family: Family;
  /** Shown after the title ("Crystal" for GBC); null renders nothing (GBA). */
  label: string | null;
  capabilities: Capabilities;
  /** Called once per render of FamilyApp. The adapter never changes within a mount (Root keys the shell on
   *  family:root:gen), so the hook order inside it is fixed. */
  useRuntime(args: RuntimeArgs): FamilyRuntime;
}
