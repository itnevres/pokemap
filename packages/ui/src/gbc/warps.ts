import type { GbcWarpEvent } from "@pokemap/core/src/gbc/model/types.js";

export interface GbcWarpsPayload {
  family: "gbc";
  mapName: string;
  warps: Array<GbcWarpEvent & { destMapName?: string; destEvent?: GbcWarpEvent }>;
}
