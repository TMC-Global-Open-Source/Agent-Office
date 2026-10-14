export const completionDuration = 12;
export const attentionCycleDuration = 8;

export function statusPose(
  status: "completed" | "needs_attention",
  elapsed: number,
  reduced: boolean,
) {
  const pose = { leftZ: 0, rightZ: 0, headX: 0, headY: 0, bodyY: 0, bodyZ: 0 };
  if (reduced) {
    if (status === "needs_attention") pose.rightZ = -2.55;
    else {
      pose.leftZ = 2.5;
      pose.rightZ = -2.5;
    }
    return pose;
  }
  const time = Math.max(0, elapsed);
  if (status === "needs_attention") {
    const phase = time % attentionCycleDuration;
    const raise = Math.min(1, phase / 0.6, (attentionCycleDuration - phase) / 0.6);
    pose.rightZ = raise * (-2.55 + (phase < 5 ? Math.sin(phase * 5) * 0.45 : 0));
    pose.headY = phase < 5 ? Math.sin(phase * 1.2) * 0.12 : Math.sin((phase - 5) * 2) * 0.3;
    pose.bodyZ = Math.sin(phase * 1.2) * 0.025 * raise;
    return pose;
  }
  if (time >= completionDuration) return pose;
  const envelope = Math.min(1, time / 0.8, (completionDuration - time) / 2);
  if (time < 4) {
    pose.leftZ = 2.5 * envelope;
    pose.rightZ = -2.5 * envelope;
    pose.bodyY = Math.abs(Math.sin(time * 5)) * 0.1 * envelope;
  } else if (time < 9) {
    pose.leftZ = (2.2 + Math.sin(time * 4) * 0.3) * envelope;
    pose.rightZ = (-2.2 + Math.sin(time * 4) * 0.3) * envelope;
    pose.bodyZ = Math.sin(time * 3) * 0.08 * envelope;
    pose.headY = Math.sin(time * 2) * 0.16;
  } else {
    pose.rightZ = (-2.4 + Math.sin(time * 5) * 0.25) * envelope;
    pose.headX = Math.sin((time - 9) * 3) * 0.12 * envelope;
  }
  return pose;
}
