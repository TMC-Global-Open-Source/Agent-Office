import type { FloorPoint } from "./home-route.js";

export function deskTravelStep(
  x: number,
  z: number,
  targetX: number,
  targetZ: number,
  delta: number,
  reducedMotion: boolean,
  speed = 2.8,
) {
  const dx = targetX - x;
  const dz = targetZ - z;
  const distance = Math.hypot(dx, dz);
  const step = reducedMotion ? distance : Math.min(distance, Math.max(0, delta) * speed);
  const fraction = distance > 0 ? step / distance : 1;
  return {
    x: x + dx * fraction,
    z: z + dz * fraction,
    walking: !reducedMotion && distance - step > 0.01,
    rotation: Math.atan2(dx, dz),
  };
}

export function routeTravelStep(
  x: number,
  z: number,
  route: FloorPoint[],
  waypoint: number,
  delta: number,
  reducedMotion: boolean,
  speed = 2.8,
) {
  const index = reducedMotion ? route.length - 1 : Math.min(waypoint, route.length - 1);
  const target = route[index]!;
  const step = deskTravelStep(x, z, target[0], target[1], delta, reducedMotion, speed);
  const arrived = Math.hypot(step.x - target[0], step.z - target[1]) < 0.001;
  const next = arrived ? Math.min(index + 1, route.length - 1) : index;
  return {
    ...step,
    waypoint: next,
    walking: !reducedMotion && (!arrived || index < route.length - 1),
  };
}
