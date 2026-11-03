export type EventKind = "object" | "warp" | "coord" | "bg";
export type ObjectType = "npc" | "itemball" | "trainer";
export type TrainerRef = { id: string; label: string };
export type GbaBehaviors = Record<string, number>;
export interface EventOptions {
  family: "gba" | "gbc";
  sprites: string[]; movements: string[]; flags: string[]; vars: string[];
  items: string[]; trainers: TrainerRef[]; bgTypes: string[]; facings: string[];
  secretBases: string[]; palettes: string[]; maps: string[];
  objectCap: number; freeFlagSlots: number; freeVarSlots: number;
}
export interface MapEventOptions {
  entryPoints: string[]; localScripts: string[]; localTexts: string[]; scenes: string[];
  warps: { n: number; x: number; y: number }[];
  tileInfo?: { x: number; y: number; warpCapable: boolean }; returnsTo?: boolean;
}
export interface CopyPreview { label: string; body: string; texts: Record<string, string> }
export interface TextPreview { label: string; text: string }
/** Whole-file replacements; accumulate one entry per path, retaining the original before. */
export type FileReplace = { path: string; before: string; after: string };
export type ScriptChoice = { mode: "existing"; label: string }
  | { mode: "copy"; from: string; label: string; body: string; texts: Record<string, string> }
  | { mode: "new"; label: string; text: string };
export type TextChoice = { mode: "copy"; from: string; text: string } | { mode: "new"; text: string };
export type NameChoice = { mode: "existing"; name: string } | { mode: "new"; name: string };
export interface AddEventForm {
  kind: EventKind; x: number; y: number; objectType?: ObjectType;
  fields: Record<string, string>; script?: ScriptChoice;
  texts?: Record<"seen" | "beaten" | "after", TextChoice>; flag?: NameChoice; varName?: NameChoice;
}
export type RefusalCode = "NAME_INVALID" | "LABEL_TAKEN" | "OBJECT_CAP" | "NO_SCENES"
  | "NO_FLAG_SLOT" | "NO_VAR_SLOT" | "NO_SCRIPTS_INC" | "COPY_UNBOUNDED"
  | "COPY_FALLTHROUGH" | "COPY_FOREIGN_LOCAL" | "COPY_NOT_SCRIPT" | "BAD_OPTION";
export class AddEventRefusal extends Error {
  constructor(public code: RefusalCode, message: string, public path?: string) {
    super(message); this.name = "AddEventRefusal";
  }
}
export type NameCheck = (name: string) => { taken: boolean; where?: string };
