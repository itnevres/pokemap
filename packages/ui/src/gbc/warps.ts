import type { GbcWarpEvent } from "@pokemap/core/gbc/model/types";

export interface GbcWarpsPayload {
  family: "gbc";
  mapName: string;
  warps: Array<GbcWarpEvent & { destMapName?: string; destEvent?: GbcWarpEvent }>;
}
