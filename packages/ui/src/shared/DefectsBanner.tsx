import { useState } from "react";
import { DEFECT_KIND_LABEL, type DataDefect } from "@pokemap/core/src/defects/types.js";

export function DefectsBanner({ defects }: { defects: DataDefect[] }) {
  const [expanded, setExpanded] = useState(false);
  if (defects.length === 0) return null;

  return (
    <div className="app__event-op-error" role="alert">
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
