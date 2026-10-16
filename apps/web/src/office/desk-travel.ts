export function deskTravelStep(
  x: number,
  z: number,
  targetX: number,
  targetZ: number,
  delta: number,
  reducedMotion: boolean,
) {
  const dx = targetX - x;
  const dz = targetZ - z;
  const distance = Math.hypot(dx, dz);
  const step = reducedMotion ? distance : Math.min(distance, Math.max(0, delta) * 2.8);
  const fraction = distance > 0 ? step / distance : 1;
  return {
    x: x + dx * fraction,
    z: z + dz * fraction,
    walking: !reducedMotion && distance - step > 0.01,
    rotation: Math.atan2(dx, dz),
  };
}
