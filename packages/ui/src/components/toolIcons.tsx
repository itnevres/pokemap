import type { ReactElement } from "react";
import type { ToolKind } from "./Toolbar.js";
import type { EventKind } from "@pokemap/core/src/addEvent/types.js";

// Plan 9 (D5): one 16px line icon per tool, inline so there is no icon dependency. Decorative: the label names the tool.
const svg = (children: ReactElement | ReactElement[]) => (
  <svg className="toolbar__icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>
);

export const TOOL_ICONS: Record<ToolKind, ReactElement> = {
  pencil: svg(<path d="M11 2.5l2.5 2.5L5 13.5H2.5V11z" />),
  rect: svg(<rect x="2.5" y="3.5" width="11" height="9" />),
  bucket: svg([<path key="a" d="M3 7l5-5 5 5-5 5z" />, <path key="b" d="M13.5 10.5c0 1-.7 2-1.5 2s-1.5-1-1.5-2l1.5-2z" />]),
  dropper: svg([<path key="a" d="M10 2.5l3.5 3.5-1.5 1.5-3.5-3.5z" />, <path key="b" d="M9 6l-6 6v1.5h1.5l6-6" />]),
  shift: svg(<path d="M8 1.5v13M1.5 8h13M6 3.5l2-2 2 2M6 12.5l2 2 2-2M3.5 6l-2 2 2 2M12.5 6l2 2-2 2" />),
  collision: svg([<rect key="a" x="2.5" y="2.5" width="11" height="11" />, <path key="b" d="M2.5 13.5l11-11" />]),
  sign: svg([<path key="a" d="M3 2.5h10v8H7l-3 3v-11z" />, <path key="b" d="M5.5 5.5h5M5.5 7.5h3" />]),
};

export const ADD_EVENT_ICONS: Record<EventKind, ReactElement> = {
  object: svg([<circle key="head" cx="6" cy="4" r="2" />, <path key="body" d="M2 13v-2a4 4 0 018 0v2M12 3v6M9 6h6" />]),
  warp: svg(<path d="M2 14V2h8v4M5 14V5h3M8 10h7M12 7l3 3-3 3" />),
  coord: svg([<rect key="grid" x="2" y="2" width="12" height="12" />, <path key="trigger" d="M2 6h12M6 2v12M10 8v4M8 10h4" />]),
  bg: svg([<path key="sign" d="M2 3h9v7H2zM6.5 10v4M11 12h4M13 10v4" />, <path key="text" d="M4 5.5h5M4 7.5h3" />]),
};
