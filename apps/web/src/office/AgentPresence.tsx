import { useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import type { Agent } from "@agent-office/shared";
import type { DeskData } from "./Workstation.js";
import { AgentAvatar } from "./AgentAvatar.js";
import { livingRoomSeat } from "./LivingRoom.js";
import { waterVisitPosition, type WaterVisit } from "./water-cooler.js";

export function AgentPresence({
  agent,
  desk,
  loungeIndex,
  selected,
  reducedMotion,
  onSelect,
  waterVisit = null,
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
  waterClock: MutableRefObject<number>;
  loungeVariant?: number;
  labels: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const initialized = useRef(false);
  const atLounge = agent.status === "idle" && loungeIndex !== undefined;
  const visit = atLounge && !reducedMotion ? waterVisit : null;
  const isRelaxing = atLounge && !visit;
  const seat = atLounge ? livingRoomSeat(loungeIndex) : null;
  const targetX = seat?.[0] ?? (desk.column - 2) * 3.15;
  const targetY = seat?.[1] ?? 0.17;
  const targetZ = seat?.[2] ?? desk.row * 3.15 + 0.65;
  const targetRotation = seat ? 0 : Math.PI;

  useFrame((_, delta) => {
    if (!root.current) return;
    if (visit) {
      const position = waterVisitPosition(visit, waterClock.current);
      const ahead = waterVisitPosition(visit, waterClock.current + 0.05);
      root.current.position.set(...position);
      if (visit.phase === "drinking") root.current.rotation.y = 0;
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
        walking={Boolean(visit && visit.phase !== "drinking")}
        drinkingWater={visit?.phase === "drinking"}
      />
      {visit && labels && (
        <Billboard position={[0, 2.05, 0]}>
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
        </Billboard>
      )}
    </group>
  );
}
