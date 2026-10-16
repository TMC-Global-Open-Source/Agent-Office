import { useEffect, useRef, useState, type MutableRefObject } from "react";
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
import { partyDuration, partyElapsed, partyStartedAt } from "./party-animation.js";
import { Confetti } from "./Confetti.js";

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
}) {
  const root = useRef<THREE.Group>(null);
  const initialized = useRef(false);
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
  const partying = partyElapsed(agent, Math.max(partyClock, Date.now())) !== null;
  const atLounge =
    !partying &&
    (agent.status === "idle" || agent.status === "completed") &&
    loungeIndex !== undefined;
  const visit = atLounge && !reducedMotion ? waterVisit : null;
  const game = atLounge && !reducedMotion && !visit ? gameVisit : null;
  const isRelaxing = atLounge && !visit && !game;
  const playing = game?.phase === "playing" ? game.machine : null;
  const seat = atLounge ? livingRoomSeat(loungeIndex) : null;
  const targetX = seat?.[0] ?? (desk.column - 2) * 3.15;
  const targetY = seat?.[1] ?? (partying ? 0 : 0.17);
  // Celebrations happen standing behind the chair, facing the room.
  const targetZ = seat?.[2] ?? desk.row * 3.15 + (partying ? 1.6 : 0.65);
  const targetRotation = seat || partying ? 0 : Math.PI;
  const pullRequestNumber = (agent.metadata?.pullRequest as { number?: unknown } | undefined)
    ?.number;

  useFrame((_, delta) => {
    if (!root.current) return;
    if (game) {
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
    const blend = reducedMotion ? 1 : 1 - Math.exp(-delta * 2.4);
    root.current.position.x = THREE.MathUtils.lerp(root.current.position.x, targetX, blend);
    root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, targetY, blend);
    root.current.position.z = THREE.MathUtils.lerp(root.current.position.z, targetZ, blend);
    root.current.rotation.y = THREE.MathUtils.damp(
      root.current.rotation.y,
      targetRotation,
      reducedMotion ? 100 : 3.2,
      delta,
    );
  });

  if (agent.status === "offline") return null;
  return (
    <group
      ref={root}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <AgentAvatar
        agent={agent}
        selected={selected}
        reducedMotion={reducedMotion}
        relaxing={isRelaxing}
        loungeVariant={loungeVariant}
        walking={Boolean(
          (visit && visit.phase !== "drinking") || (game && game.phase !== "playing"),
        )}
        playing={playing}
        partying={partying}
        drinkingWater={visit?.phase === "drinking"}
      />
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
            {typeof pullRequestNumber === "number"
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
