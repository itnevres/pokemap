import { useState } from "react";
import { DEFECT_KIND_LABEL, type IncompleteDefectCheck, type DataDefect } from "@pokemap/core/src/defects/types.js";

export function DefectsBanner({ defects, error, incomplete = [] }: { defects: DataDefect[]; error?: string | null; incomplete?: IncompleteDefectCheck[] }) {
  const [expanded, setExpanded] = useState(false);
  if (defects.length === 0 && !error && incomplete.length === 0) return null;

  return (
    <div className="app__event-op-error" role="alert">
      {error && <div>Could not check this map for defects: {error}</div>}
      {incomplete.length > 0 && <div>Some defect checks may be incomplete: {incomplete.map((entry) => `${entry.file}: ${entry.reason}`).join(", ")}</div>}
      <ul className="gbc-app__defects-list">
        {(expanded ? defects : defects.slice(0, 5)).map((defect, index) => (
          <li key={index}>
            <strong>{DEFECT_KIND_LABEL[defect.kind]}</strong>{" "}
            <span>{defect.message}</span>{" "}
            <code>{defect.file}</code>{" "}
            <span>{defect.fix}</span>
          </li>
        ))}
      </ul>
      {defects.length > 5 && (
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show fewer" : `Show all ${defects.length}`}
        </button>
      )}
    </div>
  );
}
