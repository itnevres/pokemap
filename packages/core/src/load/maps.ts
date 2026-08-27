export type ConnectionDirection = "up" | "down" | "left" | "right" | "dive" | "emerge";

export interface Connection {
  map: string;
  offset: number;
  direction: ConnectionDirection;
}

export interface ObjectEvent {
  graphicsId: string;
  x: number;
  y: number;
  elevation: number;
  movementType: string;
  movementRangeX: number;
  movementRangeY: number;
  trainerType: string;
  trainerSightOrBerryTreeId: string;
  script: string;
  flag: string;
}

export interface WarpEvent {
  x: number;
  y: number;
  elevation: number;
  destMap: string;
  destWarpId: string;
}

export interface CoordEvent {
  type?: string;
  x: number;
  y: number;
  elevation: number;
  [k: string]: unknown;
}

export interface BgEvent {
  type: string;
  x: number;
  y: number;
  elevation: number;
  [k: string]: unknown;
}

export interface MapData {
  id: string;
  name: string;
  layout: string;
  music: string;
  regionMapSection: string;
  mapType: string;
  weather: string;
  floorNumber?: number;
  region?: string;
  connections: Connection[];
  objectEvents: ObjectEvent[];
  warpEvents: WarpEvent[];
  coordEvents: CoordEvent[];
  bgEvents: BgEvent[];
}

export interface MapGroups {
  groupOrder: string[];
  groups: Record<string, string[]>;
  allMapNames(): string[];
}

export function parseMapGroups(text: string): MapGroups {
  const raw = JSON.parse(text) as Record<string, unknown>;
  const groupOrder = raw.group_order as string[];
  const groups: Record<string, string[]> = {};
  for (const g of groupOrder) groups[g] = (raw[g] as string[]) ?? [];
  return { groupOrder, groups, allMapNames: () => groupOrder.flatMap((g) => groups[g] ?? []) };
}

export function parseMap(text: string): MapData {
  const r = JSON.parse(text) as Record<string, any>;
  return {
    id: r.id,
    name: r.name,
    layout: r.layout,
    music: r.music,
    regionMapSection: r.region_map_section,
    mapType: r.map_type,
    weather: r.weather,
    floorNumber: r.floor_number,
    region: r.region,
    connections: (r.connections ?? []).map((c: any) => ({
      map: c.map,
      offset: Number(c.offset),
      direction: c.direction,
    })),
    objectEvents: (r.object_events ?? []).map((o: any) => ({
      graphicsId: o.graphics_id,
      x: Number(o.x),
      y: Number(o.y),
      elevation: Number(o.elevation),
      movementType: o.movement_type,
      movementRangeX: Number(o.movement_range_x),
      movementRangeY: Number(o.movement_range_y),
      trainerType: o.trainer_type,
      trainerSightOrBerryTreeId: String(o.trainer_sight_or_berry_tree_id),
      script: o.script,
      flag: String(o.flag),
    })),
    warpEvents: (r.warp_events ?? []).map((w: any) => ({
      x: Number(w.x),
      y: Number(w.y),
      elevation: Number(w.elevation),
      destMap: w.dest_map,
      destWarpId: String(w.dest_warp_id),
    })),
    coordEvents: r.coord_events ?? [],
    bgEvents: r.bg_events ?? [],
  };
}
