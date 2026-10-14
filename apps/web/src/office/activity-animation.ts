import type { OfficeActivity } from "@agent-office/shared";
import { typingPose } from "./typing-animation.js";
import { loungePersonality } from "./lounge-animation.js";

export function activityPose(
  id: string,
  activity: OfficeActivity,
  time: number,
  reducedMotion: boolean,
) {
  if (activity === "typing") return { ...typingPose(id, time, reducedMotion), headY: 0 };
  const phase = loungePersonality(id).phase;
  const sway = reducedMotion ? 0 : Math.sin(time * 1.3 + phase);
  const pose = {
    left: { x: -0.19, y: 0.76, z: 0.25 },
    right: { x: 0.19, y: 0.76, z: 0.25 },
    headX: -0.04,
    headY: sway * 0.06,
  };
  switch (activity) {
    case "reading":
      pose.left = { x: -0.14, y: 1.03, z: 0.32 };
      pose.right = { x: 0.14, y: 1.03, z: 0.32 };
      pose.headX = 0.17;
      break;
    case "researching":
      pose.left = { x: -0.2, y: 0.83, z: 0.35 };
      pose.right = { x: 0.14 + sway * 0.025, y: 0.84, z: 0.37 };
      pose.headX = reducedMotion ? 0.06 : sway > 0 ? 0.14 : -0.04;
      break;
    case "monitoring":
      pose.headY = sway * 0.1;
      pose.right.y += reducedMotion ? 0 : Math.max(0, Math.sin(time * 2 + phase)) * 0.012;
      break;
    case "delegating":
    case "attention":
      pose.right = { x: 0.43, y: 1.43 + sway * 0.04, z: 0.12 };
      pose.headY = 0.12;
      break;
    case "organizing":
      pose.left = { x: -0.24 + sway * 0.04, y: 0.82, z: 0.35 };
      pose.right = { x: 0.24 - sway * 0.04, y: 0.86, z: 0.35 };
      pose.headX = 0.15;
      break;
    case "puzzled":
      pose.right = { x: 0.22, y: 1.5, z: 0.14 };
      pose.headY = sway * 0.14;
      pose.headX = 0.1;
      break;
  }
  return pose;
}
