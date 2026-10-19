import { livingRoomSeat } from "./LivingRoom.js";
import { couchRiseDuration, couchTravelTime } from "./couch-motion.js";

export type GameMachine = "arcade" | "pinball";
export const gameMachines: GameMachine[] = ["arcade", "pinball"];
export type GamePhase = "outbound" | "playing" | "returning";
export interface GameVisit {
  agentId: string;
  seatIndex: number;
  machine: GameMachine;
  phase: GamePhase;
  startedAt: number;
  duration: number;
}
export interface GameRoomState {
  visits: Record<GameMachine, GameVisit | null>;
  nextAt: Record<GameMachine, number | null>;
}

/** The game corner sits in the back-left corner, left of the lounge; machines face +x toward the desks. */
export const machinePositions: Record<GameMachine, [number, number, number]> = {
  arcade: [-8.0, 0, -5.9],
  pinball: [-8.1, 0, -7.8],
};
export const machineRotation = Math.PI / 2;
export const playerRotation = -Math.PI / 2;
export const gameStandingPositions: Record<GameMachine, [number, number, number]> = {
  arcade: [-7.25, 0, -5.9],
  pinball: [-6.9, 0, -7.8],
};
const walkSpeed = 1.5;
const laneX = -6.45;
const firstDelay: Record<GameMachine, [number, number]> = { arcade: [12, 20], pinball: [18, 25] };

export const initialGameRoom = (): GameRoomState => ({
  visits: { arcade: null, pinball: null },
  nextAt: { arcade: null, pinball: null },
});

export function gameRoute(
  seatIndex: number,
  machine: GameMachine,
): Array<[number, number, number]> {
  const [x, , z] = livingRoomSeat(seatIndex);
  const [standX, , standZ] = gameStandingPositions[machine];
  return [
    [x, 0, z],
    [x, 0, z + 1.2],
    [laneX, 0, z + 1.2],
    [laneX, 0, standZ],
    [standX, 0, standZ],
  ];
}
function distance(a: number[], b: number[]) {
  return Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);
}
export function gameTravelDuration(seatIndex: number, machine: GameMachine) {
  const route = gameRoute(seatIndex, machine);
  return (
    couchRiseDuration +
    route.slice(1).reduce((total, point, i) => total + distance(route[i]!, point), 0) / walkSpeed
  );
}
export function gameVisitPosition(visit: GameVisit, now: number): [number, number, number] {
  if (visit.phase === "playing") return [...gameStandingPositions[visit.machine]];
  const route = gameRoute(visit.seatIndex, visit.machine);
  if (visit.phase === "returning") route.reverse();
  if (now - visit.startedAt >= visit.duration - 1e-9) return [...route[route.length - 1]!];
  let remaining =
    couchTravelTime(Math.min(visit.duration, now - visit.startedAt), visit.phase === "outbound") *
    walkSpeed;
  for (let i = 1; i < route.length; i++) {
    const start = route[i - 1]!;
    const end = route[i]!;
    const length = distance(start, end);
    if (remaining <= length && length > 0) {
      const t = remaining / length;
      return [start[0] + (end[0] - start[0]) * t, 0, start[2] + (end[2] - start[2]) * t];
    }
    remaining -= length;
  }
  return [...route[route.length - 1]!];
}

function advanceMachine(
  state: GameRoomState,
  machine: GameMachine,
  now: number,
  idleSeats: Map<string, number>,
  busy: Set<string>,
  random: () => number,
): GameRoomState {
  const visit = state.visits[machine];
  const set = (next: GameVisit | null, nextAt: number | null): GameRoomState => ({
    visits: { ...state.visits, [machine]: next },
    nextAt: { ...state.nextAt, [machine]: nextAt },
  });
  if (visit) {
    if (!idleSeats.has(visit.agentId)) return set(null, now + 20 + random() * 30);
    if (now < visit.startedAt + visit.duration) return state;
    if (visit.phase === "outbound")
      return set(
        { ...visit, phase: "playing", startedAt: now, duration: 14 + random() * 10 },
        state.nextAt[machine],
      );
    if (visit.phase === "playing")
      return set(
        {
          ...visit,
          phase: "returning",
          startedAt: now,
          duration: gameTravelDuration(visit.seatIndex, machine),
        },
        state.nextAt[machine],
      );
    return set(null, now + 35 + random() * 45);
  }
  const nextAt = state.nextAt[machine];
  if (nextAt === null) {
    const [base, spread] = firstDelay[machine];
    return set(null, now + base + random() * spread);
  }
  if (now < nextAt) return state;
  const playing = new Set(
    gameMachines.map((other) => state.visits[other]?.agentId).filter(Boolean) as string[],
  );
  const ids = [...idleSeats.keys()].filter((id) => !busy.has(id) && !playing.has(id)).sort();
  if (!ids.length) return set(null, now + 10);
  const agentId = ids[Math.min(ids.length - 1, Math.floor(random() * ids.length))]!;
  const seatIndex = idleSeats.get(agentId)!;
  return set(
    {
      agentId,
      seatIndex,
      machine,
      phase: "outbound",
      startedAt: now,
      duration: gameTravelDuration(seatIndex, machine),
    },
    null,
  );
}

/** Sends idle agents to the arcade cabinet and pinball table, one player per machine. */
export function advanceGameRoom(
  state: GameRoomState,
  now: number,
  idleSeats: Map<string, number>,
  reducedMotion: boolean,
  busy: Set<string> = new Set(),
  random = Math.random,
): GameRoomState {
  if (reducedMotion || !idleSeats.size) {
    const active = gameMachines.some(
      (machine) => state.visits[machine] || state.nextAt[machine] !== null,
    );
    return active ? initialGameRoom() : state;
  }
  return gameMachines.reduce(
    (current, machine) => advanceMachine(current, machine, now, idleSeats, busy, random),
    state,
  );
}

export function gameVisitors(state: GameRoomState): Set<string> {
  return new Set(
    gameMachines.map((machine) => state.visits[machine]?.agentId).filter(Boolean) as string[],
  );
}

/** Shared input timing so the avatar's hands match the machine's flippers and joystick. */
export function pinballFlips(time: number) {
  const pulse = (offset: number, rate: number) => {
    const t = (time * rate + offset) % 1;
    return t < 0.18 ? Math.sin((t / 0.18) * Math.PI) : 0;
  };
  return { left: pulse(0, 1.3), right: pulse(0.47, 1.1) };
}
export function arcadeInput(time: number) {
  return {
    stickX: Math.sin(time * 3.1) * 0.8 + Math.sin(time * 7.3) * 0.2,
    button: (time * 4.2) % 1 < 0.35 ? 1 : 0,
  };
}
