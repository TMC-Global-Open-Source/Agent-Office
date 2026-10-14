import { loungePersonality } from "./lounge-animation.js";

export function coffeeSip(id: string, time: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  const phase = (time + loungePersonality(id).phase * 4) % 30;
  if (phase < 22 || phase >= 27) return 0;
  return Math.min(1, (phase - 22) / 1.2, (27 - phase) / 1.2);
}
