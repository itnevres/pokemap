export type DefectKind = "build" | "gameplay" | "size";

export interface DataDefect {
  file: string;
  message: string;
  kind: DefectKind;
  fix: string;
}

export const DEFECT_KIND_LABEL: Record<DefectKind, string> = {
  build: "Build error",
  gameplay: "Gameplay",
  size: "Size mismatch",
};
