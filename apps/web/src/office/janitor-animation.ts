import type { Agent } from "@agent-office/shared";

export const janitorActions = [
  "Disco dance",
  "Moonwalk",
  "Slippery-floor tumble",
  "Mop air guitar",
  "Pirouette",
  "Bucket stumble",
  "Robot dance",
  "Tap shuffle",
  "Comic sneeze",
  "Mop baton twirl",
  "Victory hops",
  "Dramatic bow",
] as const;

export function everyoneIdle(agents: Pick<Agent, "status">[]) {
  return agents.length > 0 && agents.every((agent) => agent.status === "idle");
}

export interface JanitorEncounter {
  phase: "waiting" | "entering" | "performing" | "leaving";
  elapsed: number;
  delay: number;
  action: number;
}

export function createJanitorEncounter(): JanitorEncounter {
  return { phase: "waiting", elapsed: 0, delay: 0, action: -1 };
}

export function advanceJanitor(
  encounter: JanitorEncounter,
  delta: number,
  allIdle: boolean,
  random: () => number = Math.random,
) {
  if (!allIdle) {
    if (encounter.phase === "waiting") {
      encounter.elapsed = 0;
      encounter.delay = 0;
      return;
    }
    if (encounter.phase !== "leaving") {
      encounter.phase = "leaving";
      encounter.elapsed = 0;
    }
  }
  if (encounter.phase === "waiting" && encounter.delay === 0) {
    encounter.delay = 10 + random() * 15;
  }
  encounter.elapsed += Math.min(delta, 0.1);
  const duration =
    encounter.phase === "waiting" ? encounter.delay : encounter.phase === "performing" ? 8 : 3;
  if (encounter.elapsed < duration) return;
  encounter.elapsed = 0;
  if (encounter.phase === "waiting") {
    // Pick uniformly among the other routines so consecutive visits never repeat.
    const choice = Math.floor(random() * (janitorActions.length - (encounter.action < 0 ? 0 : 1)));
    encounter.action = encounter.action >= 0 && choice >= encounter.action ? choice + 1 : choice;
    encounter.phase = "entering";
  } else if (encounter.phase === "entering") {
    encounter.phase = "performing";
  } else if (encounter.phase === "performing") {
    encounter.phase = "leaving";
  } else {
    encounter.phase = "waiting";
    encounter.delay = allIdle ? 45 + random() * 45 : 0;
  }
}

export function janitorPose(action: number, time: number, reducedMotion: boolean) {
  const pose = {
    x: 0,
    y: 0,
    yaw: 0,
    lean: 0,
    bend: 0,
    leftArm: 0.1,
    rightArm: -0.3,
    leftLeg: 0,
    rightLeg: 0,
    mopSpin: 0,
    mopTilt: 0,
    bucketTilt: 0,
  };
  if (reducedMotion) return pose;
  const beat = Math.sin(time * 6);
  const sway = Math.sin(time * 3);
  const envelope = Math.sin(Math.PI * Math.min(1, time / 8)) ** 2;
  switch (action) {
    case 0:
      pose.leftArm = -1.3 - sway;
      pose.rightArm = -1.3 + sway;
      pose.lean = sway * 0.12;
      pose.yaw = sway * 0.3;
      break;
    case 1:
      pose.x = -Math.sin(time * 0.8) * 1.1;
      pose.leftLeg = beat * 0.35;
      pose.rightLeg = -beat * 0.35;
      pose.bend = -0.12;
      break;
    case 2: {
      const fall = Math.sin(Math.PI * Math.min(1, Math.max(0, (time - 1) / 5))) ** 4;
      pose.lean = -fall * 1.45;
      pose.y = fall * 0.12;
      pose.leftArm = -fall * 2;
      pose.rightArm = -fall * 2;
      pose.leftLeg = -fall * 0.5;
      pose.mopTilt = fall * 0.8;
      break;
    }
    case 3:
      pose.mopTilt = 1.1;
      pose.rightArm = -0.7 + beat * 0.2;
      pose.leftArm = -0.8;
      pose.bend = sway * 0.08;
      break;
    case 4:
      pose.yaw = time * Math.PI;
      pose.leftArm = -1.4;
      pose.rightArm = -1.4;
      pose.y = Math.abs(sway) * 0.08;
      break;
    case 5:
      pose.x = sway * 0.25;
      pose.lean = sway * 0.4 * envelope;
      pose.leftLeg = Math.max(0, sway) * 0.7;
      pose.rightLeg = Math.max(0, -sway) * 0.7;
      pose.bucketTilt = sway * 0.55;
      break;
    case 6:
      pose.yaw = Math.round(Math.sin(time * 2) * 2) * 0.35;
      pose.leftArm = Math.round(sway) * 0.8 - 0.8;
      pose.rightArm = -Math.round(sway) * 0.8 - 0.8;
      pose.bend = Math.round(Math.sin(time * 2)) * 0.1;
      break;
    case 7:
      pose.leftLeg = Math.max(0, beat) * 0.5;
      pose.rightLeg = Math.max(0, -beat) * 0.5;
      pose.x = sway * 0.3;
      pose.y = Math.abs(beat) * 0.05;
      break;
    case 8: {
      const sneeze = Math.max(0, Math.sin(time * 2)) ** 12;
      pose.bend = sneeze * 0.55;
      pose.rightArm = -0.3 - sneeze * 1.8;
      pose.y = sneeze * 0.08;
      break;
    }
    case 9:
      pose.mopSpin = time * 7;
      pose.leftArm = -1.2;
      pose.rightArm = -1.1;
      break;
    case 10:
      pose.y = Math.max(0, sway) * 0.38;
      pose.leftArm = -2.4;
      pose.rightArm = -2.4;
      pose.leftLeg = Math.max(0, sway) * 0.25;
      pose.rightLeg = -pose.leftLeg;
      break;
    case 11:
      pose.bend = envelope * 0.9;
      pose.leftArm = -envelope * 0.7;
      pose.rightArm = -envelope * 0.7;
      pose.mopTilt = envelope * 0.5;
      break;
  }
  return pose;
}
