import type { DeskData } from "./Workstation.js";
import { coolerPosition } from "./water-cooler.js";
import { machinePositions } from "./game-room.js";

export type FloorPoint = [number, number];
export interface FurnitureBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const clearance = 0.3;
function bounds(x: number, z: number, width: number, depth: number): FurnitureBounds {
  return {
    minX: x - width / 2 - clearance,
    maxX: x + width / 2 + clearance,
    minZ: z - depth / 2 - clearance,
    maxZ: z + depth / 2 + clearance,
  };
}

export function homeObstacles(
  desks: DeskData[],
  seats: number,
  decorations: boolean,
): FurnitureBounds[] {
  const obstacles = desks.flatMap((desk) => {
    const x = (desk.column - 2) * 3.15;
    const z = desk.row * 3.15;
    return [bounds(x, z, 1.45, 0.8), bounds(x, z + 0.82, 0.8, 0.8)];
  });
  for (let bay = 0; bay < Math.max(1, Math.ceil(seats / 8)); bay++) {
    const z = -5.5 - bay * 5.2;
    obstacles.push(
      bounds(-2.05, z - 0.95, 3.65, 1.12),
      bounds(2.05, z - 0.95, 3.65, 1.12),
      bounds(0, z + 1.17, 2.05, 0.82),
    );
  }
  obstacles.push(bounds(coolerPosition[0], coolerPosition[2], 0.65, 0.65));
  obstacles.push(
    bounds(machinePositions.arcade[0], machinePositions.arcade[2], 1.2, 1.1),
    bounds(machinePositions.pinball[0], machinePositions.pinball[2], 1.65, 0.9),
  );
  if (decorations) obstacles.push(bounds(7, -4, 1.6, 0.55));
  return obstacles;
}

function contains(rect: FurnitureBounds, [x, z]: FloorPoint) {
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
}

/** Slab intersection includes the avatar's clearance, not just furniture geometry. */
export function crossesFurniture(a: FloorPoint, b: FloorPoint, rect: FurnitureBounds): boolean {
  let low = 0;
  let high = 1;
  const slabs: Array<[number, number, number, number]> = [
    [a[0], b[0], rect.minX, rect.maxX],
    [a[1], b[1], rect.minZ, rect.maxZ],
  ];
  for (const [start, end, min, max] of slabs) {
    const delta = end - start;
    if (Math.abs(delta) < 1e-9) {
      if (start < min || start > max) return false;
    } else {
      const first = (min - start) / delta;
      const last = (max - start) / delta;
      low = Math.max(low, Math.min(first, last));
      high = Math.min(high, Math.max(first, last));
      if (low > high) return false;
    }
  }
  return true;
}

/** Shortest clear route through furniture corners; standing up from a seat exits forward first. */
export function clearHomeRoute(
  from: FloorPoint,
  to: FloorPoint,
  obstacles: FurnitureBounds[],
): FloorPoint[] {
  let start: FloorPoint = [...from];
  const prefix: FloorPoint[] = [start];
  for (const obstacle of [...obstacles].sort((a, b) => a.maxZ - b.maxZ)) {
    if (contains(obstacle, start)) {
      start = [start[0], obstacle.maxZ + 0.02];
      prefix.push(start);
    }
  }
  const nodes: FloorPoint[] = [
    start,
    to,
    ...obstacles
      .flatMap((rect): FloorPoint[] => [
        [rect.minX - 0.02, rect.minZ - 0.02],
        [rect.minX - 0.02, rect.maxZ + 0.02],
        [rect.maxX + 0.02, rect.minZ - 0.02],
        [rect.maxX + 0.02, rect.maxZ + 0.02],
      ])
      .filter((point) => !obstacles.some((rect) => contains(rect, point))),
  ];
  const distance = nodes.map(() => Infinity);
  const previous = nodes.map(() => -1);
  const visited = new Set<number>();
  distance[0] = 0;
  while (visited.size < nodes.length) {
    let current = -1;
    for (let index = 0; index < nodes.length; index++)
      if (!visited.has(index) && (current < 0 || distance[index]! < distance[current]!))
        current = index;
    if (current < 0 || !Number.isFinite(distance[current]!)) break;
    if (current === 1) {
      const path: FloorPoint[] = [];
      for (let index = 1; index !== 0; index = previous[index]!) path.unshift(nodes[index]!);
      return [...prefix, ...path];
    }
    visited.add(current);
    for (let next = 0; next < nodes.length; next++) {
      if (
        visited.has(next) ||
        obstacles.some((rect) => crossesFurniture(nodes[current]!, nodes[next]!, rect))
      )
        continue;
      const candidate =
        distance[current]! +
        Math.hypot(nodes[current]![0] - nodes[next]![0], nodes[current]![1] - nodes[next]![1]);
      if (candidate < distance[next]!) {
        distance[next] = candidate;
        previous[next] = current;
      }
    }
  }
  throw new Error("No clear route to the office exit is available.");
}

export function sampleHomeRoute(route: FloorPoint[], progress: number) {
  const lengths = route
    .slice(1)
    .map((point, index) => Math.hypot(point[0] - route[index]![0], point[1] - route[index]![1]));
  let remaining =
    lengths.reduce((sum, length) => sum + length, 0) * Math.max(0, Math.min(1, progress));
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]!;
    if (remaining <= length || index === lengths.length - 1) {
      const from = route[index]!;
      const to = route[index + 1]!;
      const blend = length > 0 ? remaining / length : 1;
      return {
        x: from[0] + (to[0] - from[0]) * blend,
        z: from[1] + (to[1] - from[1]) * blend,
        rotation: Math.atan2(to[0] - from[0], to[1] - from[1]),
      };
    }
    remaining -= length;
  }
  return { x: route[0]![0], z: route[0]![1], rotation: 0 };
}
