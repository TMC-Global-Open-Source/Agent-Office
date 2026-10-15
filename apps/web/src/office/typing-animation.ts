import { loungePersonality } from "./lounge-animation.js";

export function typingPose(id: string, time: number, reducedMotion: boolean) {
  const { phase } = loungePersonality(id);
  const cycle = (time + phase) % 6;
  const typing = !reducedMotion && cycle < 4.6;
  const tap = (offset: number) =>
    typing ? Math.max(0, Math.sin(time * 12 + phase + offset)) ** 2 * 0.09 : 0;
  const reach = typing ? Math.sin(time * 3.2 + phase) : 0;
  return {
    left: { x: -0.09 + reach * 0.035, y: 0.74 + tap(0), z: 0.37 + reach * 0.035 },
    right: { x: 0.09 + reach * 0.035, y: 0.74 + tap(Math.PI), z: 0.37 - reach * 0.035 },
    headX: reducedMotion ? 0.08 : typing ? 0.1 + Math.sin(time * 2.4 + phase) * 0.035 : -0.04,
  };
}
