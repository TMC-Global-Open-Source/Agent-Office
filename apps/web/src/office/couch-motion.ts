export const couchRiseDuration = 0.8;
export const couchSitDuration = 1;

export function advanceCouch(
  seated: number,
  shouldSit: boolean,
  delta: number,
  reducedMotion: boolean,
) {
  if (reducedMotion) return shouldSit ? 1 : 0;
  const step = Math.max(0, delta) / (shouldSit ? couchSitDuration : couchRiseDuration);
  return shouldSit ? Math.min(1, seated + step) : Math.max(0, seated - step);
}

export function couchPose(seated: number) {
  const amount = Math.max(0, Math.min(1, seated));
  const blend = amount * amount * (3 - 2 * amount);
  return { blend, lean: Math.sin(Math.PI * blend) * 0.4 };
}

export function couchTravelTime(elapsed: number, outbound: boolean) {
  return Math.max(0, elapsed - (outbound ? couchRiseDuration : 0));
}

export function turnToward(current: number, target: number, delta: number) {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-8 * Math.max(0, delta)));
}
