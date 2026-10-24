import type React from "react";
import { LensLegend, LensPanel, type LensId } from "../components/LensPanel.js";

/** The world toolbar's encounter-fetch alert, the lens picker (or its coverage error) and the lens legend, shared by
 *  both world canvases. */

export function EncounterFetchAlert({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="world-canvas__toolbar-group">
      <span className="world-canvas__toolbar-error" role="alert">
        Encounter data unavailable for {count} map{count === 1 ? "" : "s"}
      </span>
    </div>
  );
}

export function WorldLensControl({ error, lens, onChange }: { error: string | null; lens: LensId | null; onChange(lens: LensId | null): void }) {
  return error ? (
    <span className="world-canvas__toolbar-error" role="alert">
      Coverage lenses unavailable: {error}
    </span>
  ) : (
    <LensPanel active={lens} onChange={onChange} />
  );
}

/** The lens legend under the toolbar; hidden while coverage failed. The family passes its method key and copy. */
export function WorldLensLegend({ error, lens, coverage, onJumpToMap, methodKey, legendCopy }: {
  error: string | null;
  lens: LensId | null;
  coverage: { mapsWithoutEncounters: string[]; unusedSpecies: string[] } | null | undefined;
  onJumpToMap: React.ComponentProps<typeof LensLegend>["onJumpToMap"];
  methodKey?: React.ComponentProps<typeof LensLegend>["methodKey"];
  legendCopy?: React.ComponentProps<typeof LensLegend>["legendCopy"];
}) {
  if (error) return null;
  return (
    <LensLegend
      active={lens}
      summary={
        coverage
          ? { emptyMapNames: coverage.mapsWithoutEncounters, unusedSpeciesNames: coverage.unusedSpecies }
          : null
      }
      onJumpToMap={onJumpToMap}
      methodKey={methodKey}
      legendCopy={legendCopy}
    />
  );
}
