import { livingRoomSeat } from "./LivingRoom.js";
import { couchRiseDuration, couchTravelTime } from "./couch-motion.js";

/** The cooler stands beside the left sofa in the lounge, with its taps facing the room (+z). */
export const coolerPosition: [number, number, number] = [-4.75, 0, -6.6];
export const coolerStandingPosition: [number, number, number] = [-4.75, 0, -5.85];
export const coolerDrinkingRotation = Math.PI;
export interface BreakStation {
  standing: [number, number, number];
  initialDelay: [number, number];
  repeatDelay: [number, number];
  serviceDuration: number;
  returnVariant?: number;
  laneX?: number;
}
const waterStation: BreakStation = {
  standing: coolerStandingPosition,
  initialDelay: [20, 25],
  repeatDelay: [30, 40],
  serviceDuration: 5,
};
export const coffeePosition: [number, number, number] = [8, 0, -7.4];
export const coffeeRotation = -Math.PI / 2;
export const coffeeGuestRotation = Math.PI;
export const coffeeStation: BreakStation = {
  standing: [7.05, 0, -6.6],
  initialDelay: [25, 25],
  repeatDelay: [45, 45],
  serviceDuration: 6,
  returnVariant: 1,
  laneX: 5.9,
};
export type VisitPhase = "outbound" | "drinking" | "returning";
export interface WaterVisit {
  agentId: string;
  seatIndex: number;
  phase: VisitPhase;
  startedAt: number;
  duration: number;
}
export interface WaterBreakState {
  visit: WaterVisit | null;
  nextAt: number | null;
  variants: Record<string, number>;
}
export function waterRoute(
  seatIndex: number,
  station = waterStation,
): Array<[number, number, number]> {
  const [x, , z] = livingRoomSeat(seatIndex);
  if (station.laneX !== undefined)
    return [
      [x, 0, z],
      [x, 0, z + 1.2],
      [station.laneX, 0, z + 1.2],
      [station.laneX, 0, station.standing[2]],
      station.standing,
    ];
  return [[x, 0, z], [x, 0, z + 1.2], [station.standing[0], 0, z + 1.2], station.standing];
}
function distance(a: number[], b: number[]) {
  return Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);
}
export function waterTravelDuration(seatIndex: number, station = waterStation) {
  const route = waterRoute(seatIndex, station);
  return (
    couchRiseDuration +
    route.slice(1).reduce((total, point, i) => total + distance(route[i]!, point), 0) / 1.5
  );
}
export function waterVisitPosition(
  visit: WaterVisit,
  now: number,
  station = waterStation,
): [number, number, number] {
  if (visit.phase === "drinking") return [...station.standing];
  const route = waterRoute(visit.seatIndex, station);
  if (visit.phase === "returning") route.reverse();
  if (now - visit.startedAt >= visit.duration - 1e-9) return [...route[route.length - 1]!];
  let remaining =
    couchTravelTime(Math.min(visit.duration, now - visit.startedAt), visit.phase === "outbound") *
    1.5;
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
export function advanceWaterBreak(
  state: WaterBreakState,
  now: number,
  idleSeats: Map<string, number>,
  reducedMotion: boolean,
  initialVariant: (id: string) => number,
  random = Math.random,
  station = waterStation,
): WaterBreakState {
  if (reducedMotion || !idleSeats.size)
    return state.visit || state.nextAt !== null ? { ...state, visit: null, nextAt: null } : state;
  if (state.visit) {
    const visit = state.visit;
    if (!idleSeats.has(visit.agentId))
      return { ...state, visit: null, nextAt: now + 25 + random() * 30 };
    if (now < visit.startedAt + visit.duration) return state;
    if (visit.phase === "outbound")
      return {
        ...state,
        visit: { ...visit, phase: "drinking", startedAt: now, duration: station.serviceDuration },
      };
    if (visit.phase === "drinking")
      return {
        ...state,
        visit: {
          ...visit,
          phase: "returning",
          startedAt: now,
          duration: waterTravelDuration(visit.seatIndex, station),
        },
      };
    const previous = state.variants[visit.agentId] ?? initialVariant(visit.agentId);
    return {
      ...state,
      visit: null,
      nextAt: now + station.repeatDelay[0] + random() * station.repeatDelay[1],
      variants: {
        ...state.variants,
        [visit.agentId]: station.returnVariant ?? (previous + 1 + Math.floor(random() * 2)) % 3,
      },
    };
  }
  if (state.nextAt === null)
    return { ...state, nextAt: now + station.initialDelay[0] + random() * station.initialDelay[1] };
  if (now < state.nextAt) return state;
  const ids = [...idleSeats.keys()].sort();
  const agentId = ids[Math.min(ids.length - 1, Math.floor(random() * ids.length))]!;
  const seatIndex = idleSeats.get(agentId)!;
  return {
    ...state,
    visit: {
      agentId,
      seatIndex,
      phase: "outbound",
      startedAt: now,
      duration: waterTravelDuration(seatIndex, station),
    },
  };
}
