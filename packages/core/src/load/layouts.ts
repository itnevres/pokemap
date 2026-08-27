import type { FieldmapConstants } from "../config/fieldmap.js";
import type { Layout, LayoutVersion, Split } from "../model/types.js";

export function parseLayouts(text: string): { tableLabel: string; layouts: Layout[] } {
  const raw = JSON.parse(text) as {
    layouts_table_label: string;
    layouts: Record<string, unknown>[];
  };
  return {
    tableLabel: raw.layouts_table_label,
    layouts: raw.layouts.map((l) => ({
      id: String(l.id),
      name: String(l.name),
      width: Number(l.width),
      height: Number(l.height),
      borderWidth: l.border_width === undefined ? 2 : Number(l.border_width),
      borderHeight: l.border_height === undefined ? 2 : Number(l.border_height),
      primaryTileset: String(l.primary_tileset),
      secondaryTileset: String(l.secondary_tileset),
      borderFilepath: String(l.border_filepath),
      blockdataFilepath: String(l.blockdata_filepath),
      layoutVersion: l.layout_version as LayoutVersion | undefined,
    })),
  };
}

/**
 * Invariant I1. Every render, validate and write path takes its boundary from
 * here and never from an ambient constant.
 *
 * A layout with no `layout_version` resolves to emerald, matching the
 * `default:` branch of the engine's GetNumMetatilesInPrimary().
 */
export function resolveSplit(layout: Pick<Layout, "layoutVersion">, c: FieldmapConstants): Split {
  const version: LayoutVersion = layout.layoutVersion ?? "emerald";
  return version === "emerald"
    ? { version, tiles: c.tilesInPrimaryEmerald, metatiles: c.metatilesInPrimaryEmerald, pals: c.palsInPrimaryEmerald }
    : { version, tiles: c.tilesInPrimary, metatiles: c.metatilesInPrimary, pals: c.palsInPrimary };
}
