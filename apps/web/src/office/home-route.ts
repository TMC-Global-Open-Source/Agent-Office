import type { DeskData } from "./Workstation.js";
import { coffeePosition, coolerPosition } from "./water-cooler.js";
import { machinePositions } from "./game-room.js";
import { loungeBayCount } from "./lounge-eligibility.js";

export type FloorPoint = [number, number];
export interface FurnitureBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  seat?: FloorPoint;
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

export function homeObstacles(desks: DeskData[], seats: number): FurnitureBounds[] {
  const obstacles = desks.flatMap((desk) => {
    const x = (desk.column - 2) * 3.15;
    const z = desk.row * 3.15;
    const desktop = bounds(x, z, 1.45, 0.8);
    // Leave the seated approach at z + 0.65 clear of the tabletop's front edge.
    desktop.maxZ = z + 0.6;
    return [desktop, { ...bounds(x, z + 0.82, 0.8, 0.8), seat: [x, z + 0.65] as FloorPoint }];
  });
  for (let bay = 0; bay < loungeBayCount(seats); bay++) {
    const z = -5.5 - bay * 5.2;
    obstacles.push(
      bounds(-2.05, z - 0.95, 3.65, 1.12),
      bounds(2.05, z - 0.95, 3.65, 1.12),
      bounds(0, z + 1.17, 2.05, 0.82),
    );
  }
  obstacles.push(bounds(coolerPosition[0], coolerPosition[2], 0.65, 0.65));
  obstacles.push(bounds(coffeePosition[0], coffeePosition[2] + 0.6, 0.9, 2.45));
  obstacles.push(bounds(coffeePosition[0] - 0.95, coffeePosition[2] - 0.175, 1, 0.9));
  obstacles.push(
    bounds(machinePositions.arcade[0], machinePositions.arcade[2], 1.2, 1.1),
    bounds(machinePositions.pinball[0], machinePositions.pinball[2], 1.65, 0.9),
  );
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
  if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 0.001) return [from, to];
  const startChair = obstacles.find((rect) => rect.seat && contains(rect, from));
  const endChair = obstacles.find((rect) => rect.seat && contains(rect, to));
  const sidePoints = (point: FloorPoint, chair: FurnitureBounds | undefined): FloorPoint[] =>
    chair
      ? [
          [chair.seat![0] - 1.1, point[1]],
          [chair.seat![0] + 1.1, point[1]],
        ]
      : [point];
  const candidates: FloorPoint[][] = [];
  for (const start of sidePoints(from, startChair)) {
    for (const end of sidePoints(to, endChair)) {
      if (
        obstacles.some(
          (rect) =>
            (startChair && rect !== startChair && crossesFurniture(from, start, rect)) ||
            (endChair && rect !== endChair && crossesFurniture(end, to, rect)),
        )
      )
        continue;
      const route = clearFurnitureRoute(start, end, obstacles);
      candidates.push([...(startChair ? [from] : []), ...route, ...(endChair ? [to] : [])]);
    }
  }
  if (!candidates.length)
    throw new Error("No clear side approach to the workstation is available.");
  return candidates.reduce((shortest, route) =>
    routeLength(route) < routeLength(shortest) ? route : shortest,
  );
}

export function routeLength(route: FloorPoint[]) {
  return route
    .slice(1)
    .reduce(
      (total, point, index) =>
        total + Math.hypot(point[0] - route[index]![0], point[1] - route[index]![1]),
      0,
    );
}

function clearFurnitureRoute(
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
