import type { Agent } from "@agent-office/shared";

/** Seconds an agent celebrates after one of its pull requests is merged. */
export const partyDuration = 14;
/** Seconds into the party when each confetti burst is thrown. */
export const confettiBursts = [0.2, 2.6, 10.4];

export function partyStartedAt(agent: Agent): number | null {
  const pullRequest = agent.metadata?.pullRequest as { celebrationAt?: unknown } | undefined;
  const started =
    typeof pullRequest?.celebrationAt === "string" ? Date.parse(pullRequest.celebrationAt) : NaN;
  return Number.isFinite(started) ? started : null;
}

/** Seconds into the merge party, or null when the agent is not celebrating. */
export function partyElapsed(agent: Agent, now: number): number | null {
  if (agent.status === "offline") return null;
  const started = partyStartedAt(agent);
  if (started === null) return null;
  const elapsed = (now - started) / 1000;
  return elapsed >= 0 && elapsed < partyDuration ? elapsed : null;
}

export interface PartyPose {
  /** Arm swing forward/back (rotation.x) and out/up (rotation.z); +leftZ / -rightZ raises. */
  leftX: number;
  leftZ: number;
  rightX: number;
  rightZ: number;
  bodyY: number;
  bodyX: number;
  bodyZ: number;
  headY: number;
  headX: number;
  leftFoot: number;
  rightFoot: number;
}

const cycle = (time: number, rate: number) => Math.sin(time * Math.PI * 2 * rate);

/** Jump for joy, wave, floss, then throw confetti; eases in and out of the rest pose. */
export function partyPose(elapsed: number, reduced: boolean): PartyPose {
  const pose: PartyPose = {
    leftX: 0,
    leftZ: 0,
    rightX: 0,
    rightZ: 0,
    bodyY: 0,
    bodyX: 0,
    bodyZ: 0,
    headY: 0,
    headX: 0,
    leftFoot: 0,
    rightFoot: 0,
  };
  if (reduced) {
    pose.leftZ = 2.5;
    pose.rightZ = -2.5;
    return pose;
  }
  const t = Math.max(0, Math.min(partyDuration, elapsed));
  const envelope = Math.min(1, t / 0.35, (partyDuration - t) / 0.6);
  if (t < 2.4) {
    // Three jumps with both arms thrown up.
    const hop = Math.abs(Math.sin((t / 0.8) * Math.PI));
    pose.bodyY = hop * 0.42;
    pose.leftZ = 2.3 + hop * 0.4;
    pose.rightZ = -2.3 - hop * 0.4;
    pose.leftFoot = -hop * 0.5;
    pose.rightFoot = -hop * 0.5;
    pose.headX = -hop * 0.2;
  } else if (t < 5) {
    // Big wave with the right arm, left hand on the hip.
    const local = t - 2.4;
    pose.rightZ = -2.55 + cycle(local, 2.2) * 0.45;
    pose.leftZ = -0.5;
    pose.leftX = -0.35;
    pose.bodyZ = cycle(local, 1.1) * 0.06;
    pose.headY = cycle(local, 0.6) * 0.25;
    pose.bodyY = Math.abs(cycle(local, 2.2)) * 0.04;
  } else if (t < 10) {
    // The floss: both arms swing to one side while the hips swing to the other,
    // and the arms alternate in front of and behind the body.
    const local = t - 5;
    const swing = cycle(local, 1.6);
    const tuck = cycle(local, 3.2);
    pose.leftZ = swing * 0.75;
    pose.rightZ = swing * 0.75;
    pose.leftX = tuck * 0.55;
    pose.rightX = -tuck * 0.55;
    pose.bodyZ = -swing * 0.14;
    pose.bodyY = Math.abs(tuck) * 0.03;
    pose.headY = swing * 0.12;
    pose.leftFoot = -swing * 0.12;
    pose.rightFoot = swing * 0.12;
  } else {
    // Wind up and throw confetti, then one last jump.
    const local = t - 10;
    const windUp = Math.min(1, local / 0.4);
    const toss = local < 0.4 ? 0 : Math.min(1, (local - 0.4) / 0.25);
    pose.leftX = 0.6 * windUp - 3.2 * toss;
    pose.rightX = 0.6 * windUp - 3.2 * toss;
    pose.leftZ = 0.25 + toss * 0.4;
    pose.rightZ = -0.25 - toss * 0.4;
    pose.bodyX = 0.12 * windUp - 0.22 * toss;
    pose.headX = -0.25 * toss;
    if (local > 1.4) {
      const hop = Math.abs(Math.sin(((local - 1.4) / 0.9) * Math.PI));
      pose.bodyY = hop * 0.36;
      pose.leftFoot = -hop * 0.4;
      pose.rightFoot = -hop * 0.4;
    }
  }
  for (const key of Object.keys(pose) as Array<keyof PartyPose>) pose[key] *= envelope;
  return pose;
}

export interface ConfettiPiece {
  burst: number;
  velocity: [number, number, number];
  spin: [number, number, number];
  color: string;
}

const confettiColors = ["#ff3e9a", "#ff9f1c", "#22d3ee", "#4ade80", "#fbbf24", "#c084fc"];

/** Deterministic confetti so every viewer sees the same party. */
export function confettiPieces(seed: string, perBurst = 36): ConfettiPiece[] {
  let state = Array.from(seed).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  return confettiBursts.flatMap((_, burst) =>
    Array.from({ length: perBurst }, (_, index) => {
      const angle = random() * Math.PI * 2;
      const spread = 0.4 + random() * 1.1;
      return {
        burst,
        velocity: [Math.cos(angle) * spread, 3.2 + random() * 2.2, Math.sin(angle) * spread] as [
          number,
          number,
          number,
        ],
        spin: [random() * 9 - 4.5, random() * 9 - 4.5, random() * 9 - 4.5] as [
          number,
          number,
          number,
        ],
        color: confettiColors[index % confettiColors.length]!,
      };
    }),
  );
}

const gravity = 6.5;
const drag = 0.55;
const launchHeight = 2.0;

/** Position of a confetti piece `t` seconds after its burst; it flutters down and settles. */
export function confettiPosition(piece: ConfettiPiece, t: number): [number, number, number] {
  const fall = Math.max(0, t);
  const decay = (1 - Math.exp(-drag * fall)) / drag;
  const x = piece.velocity[0] * decay;
  const z = piece.velocity[2] * decay;
  const y = launchHeight + piece.velocity[1] * decay - 0.5 * gravity * fall * fall * 0.35;
  return [x, Math.max(0.02, y), z];
}
