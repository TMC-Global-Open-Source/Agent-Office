import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { OfficeLabel } from "./OfficeLabel.js";
import * as THREE from "three";
import type { Agent } from "@agent-office/shared";
import type { DeskData } from "./Workstation.js";
import { AgentAvatar } from "./AgentAvatar.js";
import { livingRoomSeat } from "./LivingRoom.js";
import { coolerDrinkingRotation, waterVisitPosition, type WaterVisit } from "./water-cooler.js";
import { gameVisitPosition, playerRotation, type GameVisit } from "./game-room.js";
import {
  mergePartyActive,
  officePartyActive,
  partyDuration,
  partyElapsed,
  partyStartedAt,
} from "./party-animation.js";
import { Confetti } from "./Confetti.js";
import { bossActive } from "./boss-mode.js";
import { deskTravelStep } from "./desk-travel.js";
import { homeDeparture, homeElapsed, homeTimeline } from "@agent-office/shared";
import {
  clearHomeRoute,
  sampleHomeRoute,
  type FloorPoint,
  type FurnitureBounds,
} from "./home-route.js";

const gameLabels = {
  arcade: { outbound: "Heading to the arcade", playing: "Playing arcade" },
  pinball: { outbound: "Heading to pinball", playing: "Playing pinball" },
};

export function AgentPresence({
  agent,
  desk,
  loungeIndex,
  selected,
  reducedMotion,
  onSelect,
  waterVisit = null,
  gameVisit = null,
  waterClock,
  loungeVariant,
  labels,
  departureFurniture,
}: {
  agent: Agent;
  desk: DeskData;
  loungeIndex: number | undefined;
  selected: boolean;
  reducedMotion: boolean;
  onSelect: () => void;
  waterVisit?: WaterVisit | null;
  gameVisit?: GameVisit | null;
  waterClock: MutableRefObject<number>;
  loungeVariant?: number;
  labels: boolean;
  departureFurniture: FurnitureBounds[];
}) {
  const root = useRef<THREE.Group>(null);
  const initialized = useRef(false);
  const [running, setRunning] = useState(false);
  const [travelling, setTravelling] = useState(false);
  const [homeClock, setHomeClock] = useState(Date.now);
  const homeStart = homeDeparture(agent);
  const leaving = homeStart !== null;
  const homeTime = homeElapsed(agent, homeClock) ?? -1;
  const homeOrigin = useRef<THREE.Vector3 | null>(null);
  const furnitureVersion = useMemo(() => JSON.stringify(departureFurniture), [departureFurniture]);
  const homeRoutes = useRef<{
    inbound: FloorPoint[];
    outbound: FloorPoint[];
    plannedAt: number;
    furnitureVersion: string;
  } | null>(null);
  useEffect(() => {
    homeOrigin.current = null;
    homeRoutes.current = null;
    if (homeStart === null) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setHomeClock(now);
      if (now >= homeStart + homeTimeline.gone * 1000) window.clearInterval(timer);
    }, 100);
    return () => window.clearInterval(timer);
  }, [homeStart]);
  const [partyClock, setPartyClock] = useState(Date.now);
  const partyStart = partyStartedAt(agent);
  useEffect(() => {
    if (partyStart === null) return;
    const now = Date.now();
    const end = partyStart + partyDuration * 1000;
    const next = now < partyStart ? partyStart : now < end ? end : null;
    if (next === null) return;
    const timer = window.setTimeout(() => setPartyClock(Date.now()), next - now + 20);
    return () => window.clearTimeout(timer);
  }, [partyStart, partyClock]);
  const now = Math.max(partyClock, Date.now());
  const bossing = !leaving && bossActive(agent, now);
  const partying = !leaving && !bossing && partyElapsed(agent, now) !== null;
  const officeParty = officePartyActive(agent, now) && !mergePartyActive(agent, now);
  const atLounge =
    !leaving &&
    !bossing &&
    (!partying || officeParty) &&
    (agent.status === "idle" || agent.status === "completed") &&
    loungeIndex !== undefined;
  const visit = atLounge && !partying && !reducedMotion ? waterVisit : null;
  const game = atLounge && !partying && !reducedMotion && !visit ? gameVisit : null;
  const isRelaxing = atLounge && !partying && !visit && !game;
  const playing = game?.phase === "playing" ? game.machine : null;
  const seat = atLounge ? livingRoomSeat(loungeIndex) : null;
  const targetX = seat?.[0] ?? (desk.column - 2) * 3.15;
  const targetY = partying ? 0 : (seat?.[1] ?? 0.17);
  // Celebrations happen standing: in front of the couch seat, or behind the desk chair.
  const targetZ = seat ? seat[2] + (partying ? 1.1 : 0) : desk.row * 3.15 + (partying ? 1.6 : 0.65);
  const targetRotation = seat || partying ? 0 : Math.PI;
  const pullRequestNumber = (agent.metadata?.pullRequest as { number?: unknown } | undefined)
    ?.number;

  useFrame((_, delta) => {
    if (!root.current) return;
    if (leaving) {
      const elapsed = homeElapsed(agent, Date.now())!;
      const deskPoint = new THREE.Vector3((desk.column - 2) * 3.15, 0, desk.row * 3.15 + 0.65);
      if (!initialized.current) root.current.position.copy(deskPoint);
      if (!homeOrigin.current)
        homeOrigin.current = initialized.current
          ? root.current.position.clone()
          : deskPoint.clone();
      if (!homeRoutes.current || homeRoutes.current.furnitureVersion !== furnitureVersion) {
        if (homeRoutes.current) homeOrigin.current = root.current.position.clone();
        const front: FloorPoint = [deskPoint.x, deskPoint.z + 1];
        const left = Math.min(-9.5, ...departureFurniture.map((rect) => rect.minX)) - 0.5;
        const right = Math.max(8.5, ...departureFurniture.map((rect) => rect.maxX)) + 0.5;
        const exitX = Math.abs(front[0] - left) < Math.abs(front[0] - right) ? left : right;
        homeRoutes.current = {
          plannedAt: elapsed,
          furnitureVersion,
          inbound: clearHomeRoute(
            [homeOrigin.current.x, homeOrigin.current.z],
            front,
            departureFurniture,
          ),
          outbound: clearHomeRoute(
            elapsed >= homeTimeline.coffee
              ? [root.current.position.x, root.current.position.z]
              : [deskPoint.x, deskPoint.z],
            [exitX, front[1]],
            departureFurniture,
          ),
        };
      }
      if (elapsed < homeTimeline.desk) {
        const progress = reducedMotion
          ? 1
          : THREE.MathUtils.clamp(
              (elapsed - homeRoutes.current.plannedAt) /
                Math.max(0.001, homeTimeline.desk - homeRoutes.current.plannedAt),
              0,
              1,
            );
        const point = sampleHomeRoute(homeRoutes.current.inbound, progress);
        root.current.position.set(point.x, 0, point.z);
        root.current.rotation.y = point.rotation;
      } else if (elapsed < homeTimeline.coffee) {
        root.current.position.copy(deskPoint);
        root.current.position.y = 0.17;
        root.current.rotation.y = Math.PI;
      } else {
        const progress = reducedMotion
          ? 1
          : THREE.MathUtils.clamp(
              (elapsed - Math.max(homeTimeline.coffee, homeRoutes.current.plannedAt)) /
                Math.max(
                  0.001,
                  homeTimeline.exit - Math.max(homeTimeline.coffee, homeRoutes.current.plannedAt),
                ),
              0,
              1,
            );
        const point = sampleHomeRoute(homeRoutes.current.outbound, progress);
        root.current.position.set(point.x, 0, point.z);
        root.current.rotation.y = point.rotation;
      }
      root.current.visible = elapsed < homeTimeline.exit;
      initialized.current = true;
      return;
    }
    root.current.visible = true;
    if (bossActive(agent, Date.now())) {
      if (travelling) setTravelling(false);
      const dx = targetX - root.current.position.x;
      const dz = targetZ - root.current.position.z;
      const distance = Math.hypot(dx, dz);
      const moving = !reducedMotion && distance > 0.08;
      if (moving !== running) setRunning(moving);
      const step = reducedMotion
        ? 1
        : Math.min(1, (Math.min(delta, 0.1) * 8) / Math.max(distance, 0.001));
      root.current.position.x += dx * step;
      root.current.position.z += dz * step;
      root.current.position.y = targetY;
      root.current.rotation.y = moving ? Math.atan2(dx, dz) : Math.PI;
      initialized.current = true;
      return;
    }
    if (running) setRunning(false);
    if (game) {
      if (travelling) setTravelling(false);
      const position = gameVisitPosition(game, waterClock.current);
      const ahead = gameVisitPosition(game, waterClock.current + 0.05);
      root.current.position.set(...position);
      if (game.phase === "playing") root.current.rotation.y = playerRotation;
      else if (Math.hypot(ahead[0] - position[0], ahead[2] - position[2]) > 0.001)
        root.current.rotation.y = Math.atan2(ahead[0] - position[0], ahead[2] - position[2]);
      initialized.current = true;
      return;
    }
    if (visit) {
      if (travelling) setTravelling(false);
      const position = waterVisitPosition(visit, waterClock.current);
      const ahead = waterVisitPosition(visit, waterClock.current + 0.05);
      root.current.position.set(...position);
      if (visit.phase === "drinking") root.current.rotation.y = coolerDrinkingRotation;
      else if (Math.hypot(ahead[0] - position[0], ahead[2] - position[2]) > 0.001)
        root.current.rotation.y = Math.atan2(ahead[0] - position[0], ahead[2] - position[2]);
      initialized.current = true;
      return;
    }
    if (!initialized.current) {
      root.current.position.set(targetX, targetY, targetZ);
      root.current.rotation.y = targetRotation;
      initialized.current = true;
      return;
    }
    const step = deskTravelStep(
      root.current.position.x,
      root.current.position.z,
      targetX,
      targetZ,
      Math.min(delta, 0.1),
      reducedMotion,
    );
    if (step.walking !== travelling) setTravelling(step.walking);
    root.current.position.set(step.x, step.walking ? 0 : targetY, step.z);
    root.current.rotation.y = THREE.MathUtils.damp(
      root.current.rotation.y,
      step.walking ? step.rotation : targetRotation,
      reducedMotion ? 100 : 3.2,
      delta,
    );
  });

  if (agent.status === "offline" && !leaving) return null;
  return (
    <group
      ref={root}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <AgentAvatar
        agent={leaving ? { ...agent, status: "idle" } : agent}
        selected={selected}
        reducedMotion={reducedMotion}
        relaxing={isRelaxing}
        loungeVariant={loungeVariant}
        walking={Boolean(
          (leaving &&
            !reducedMotion &&
            (homeTime < homeTimeline.desk || homeTime >= homeTimeline.coffee)) ||
          (!leaving && travelling) ||
          (!leaving && bossing && running) ||
          (visit && visit.phase !== "drinking") ||
          (game && game.phase !== "playing"),
        )}
        bossing={bossing}
        homeDesk={leaving && homeTime >= homeTimeline.desk && homeTime < homeTimeline.coffee}
        carryingCoffee={leaving && homeTime >= homeTimeline.shutdown}
        playing={playing}
        partying={partying && !travelling}
        drinkingWater={visit?.phase === "drinking"}
      />
      {leaving && labels && (
        <OfficeLabel position={[0, 1, 0]} offset={1.1}>
          <Text fontSize={0.17} color="#263c42" outlineWidth={0.01} outlineColor="#f3eee4">
            {homeTime < homeTimeline.desk
              ? "Heading home"
              : homeTime < homeTimeline.shutdown
                ? "Shutting down"
                : homeTime < homeTimeline.coffee
                  ? "Coffee to go!"
                  : "See you next time!"}
          </Text>
        </OfficeLabel>
      )}
      {bossing && labels && (
        <OfficeLabel position={[0, 1, 0]} offset={1.1}>
          <Text fontSize={0.17} color="#b11f4b" outlineWidth={0.01} outlineColor="#f3eee4">
            {running ? "Boss! Look busy!" : "Definitely working!"}
          </Text>
        </OfficeLabel>
      )}
      {partying && !reducedMotion && partyStart !== null && (
        <Confetti seed={`${agent.id}:${partyStart}`} startedAt={partyStart} />
      )}
      {partying && labels && (
        <OfficeLabel position={[0, 1, 0]} offset={1.1}>
          <Text
            fontSize={0.17}
            color="#b11f4b"
            outlineWidth={0.01}
            outlineColor="#f3eee4"
            maxWidth={2.8}
            textAlign="center"
          >
            {officeParty
              ? "Party time!"
              : typeof pullRequestNumber === "number"
                ? `PR #${pullRequestNumber} merged!`
                : "PR merged!"}
          </Text>
        </OfficeLabel>
      )}
      {game && labels && (
        <OfficeLabel position={[0, 1, 0]} offset={1.1}>
          <Text
            fontSize={0.15}
            color="#526b72"
            outlineWidth={0.008}
            outlineColor="#f3eee4"
            maxWidth={2.8}
            textAlign="center"
          >
            {agent.displayName}
            {"\n"}
            {game.phase === "returning"
              ? "Back to the couch"
              : gameLabels[game.machine][game.phase]}
          </Text>
        </OfficeLabel>
      )}
      {visit && labels && (
        <OfficeLabel position={[0, 1, 0]} offset={1.1}>
          <Text
            fontSize={0.15}
            color="#526b72"
            outlineWidth={0.008}
            outlineColor="#f3eee4"
            maxWidth={2.8}
            textAlign="center"
          >
            {agent.displayName}
            {"\n"}
            {visit.phase === "drinking"
              ? "Having a drink"
              : visit.phase === "outbound"
                ? "Water break"
                : "Back to the couch"}
          </Text>
        </OfficeLabel>
      )}
    </group>
  );
}
