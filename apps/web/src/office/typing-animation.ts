import { loungePersonality } from "./lounge-animation.js";

export function typingPose(id: string, time: number, reducedMotion: boolean) {
  const { phase } = loungePersonality(id);
  const cycle = (time + phase) % 6;
  const typing = !reducedMotion && cycle < 4.6;
  const tap = (offset: number) =>
    typing ? Math.max(0, Math.sin(time * 15 + phase + offset)) ** 4 * 0.018 : 0;
  return {
    left: { x: -0.09, y: 0.74 + tap(0), z: 0.37 },
    right: { x: 0.09, y: 0.74 + tap(Math.PI), z: 0.37 },
    headX: reducedMotion ? 0.08 : cycle < 4.6 ? 0.08 : -0.04,
  };
}
