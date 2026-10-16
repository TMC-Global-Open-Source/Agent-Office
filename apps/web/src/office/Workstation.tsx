import { memo, useRef } from "react";
import { Text } from "@react-three/drei";
import { OfficeLabel } from "./OfficeLabel.js";
import type { OfficeView } from "./camera-views.js";
import { coffeeSip } from "./desk-animation.js";
import { MonitorScreen } from "./MonitorScreen.js";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Agent } from "@agent-office/shared";
import { getOfficeActivity, officeActivityLabels } from "@agent-office/shared";
import { statusColors, statusLabels } from "../store.js";

export interface DeskData {
  id: string;
  agentId: string;
  row: number;
  column: number;
  active: boolean;
}

function darkenHex(hex: string, factor: number): string {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const channel = (shift: number) => Math.round(((value >> shift) & 0xff) * factor);
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

export const Workstation = memo(function Workstation({
  agent,
  desk,
  selected,
  onSelect,
  labels,
  reducedMotion,
  view,
}: {
  agent: Agent;
  desk: DeskData;
  selected: boolean;
  onSelect: () => void;
  labels: boolean;
  reducedMotion: boolean;
  view: OfficeView;
}) {
  const root = useRef<THREE.Group>(null);
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const deskCup = useRef<THREE.Mesh>(null);
  const x = (desk.column - 2) * 3.15;
  const z = desk.row * 3.15;
  const sideView = view === "left" || view === "right";
  useFrame(({ clock }) => {
    if (deskCup.current)
      deskCup.current.visible = !(
        agent.status === "working" &&
        ["working", "typing", "reading", "researching", "monitoring"].includes(
          getOfficeActivity(agent),
        ) &&
        coffeeSip(agent.id, clock.elapsedTime, reducedMotion) > 0
      );
    if (root.current && agent.status === "spawning" && !reducedMotion) {
      root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, 0, 0.07);
    }
    if (glow.current && agent.status === "needs_attention") {
      glow.current.emissiveIntensity = 0.4 + Math.sin(clock.elapsedTime * 4) * 0.25;
    }
  });
  return (
    <group
      ref={root}
      position={[x, agent.status === "spawning" && !reducedMotion ? 0.55 : 0, z]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <mesh position={[0, 0.78, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.45, 0.14, 0.8]} />
        <meshStandardMaterial color="#bf9973" roughness={0.84} />
      </mesh>
      {[-0.57, 0.57].map((legX) =>
        [-0.27, 0.27].map((legZ) => (
          <mesh key={`${legX}:${legZ}`} position={[legX, 0.38, legZ]} castShadow>
            <boxGeometry args={[0.09, 0.68, 0.09]} />
            <meshStandardMaterial color="#8b6d54" />
          </mesh>
        )),
      )}
      <mesh position={[0, 1.19, -0.23]} castShadow>
        <boxGeometry args={[0.7, 0.48, 0.08]} />
        <meshStandardMaterial color="#263b42" />
      </mesh>
      <mesh position={[0, 1.19, -0.178]}>
        <planeGeometry args={[0.59, 0.36]} />
        <meshStandardMaterial
          color={
            agent.status === "offline"
              ? "#26343a"
              : agent.status === "failed"
                ? "#8e3941"
                : "#315a68"
          }
          emissive={agent.status === "working" ? "#1b8294" : "#152a31"}
          emissiveIntensity={agent.status === "working" ? 0.35 : 0.08}
        />
      </mesh>
      <mesh position={[0, 0.87, 0.13]}>
        <boxGeometry args={[0.34, 0.025, 0.18]} />
        <meshStandardMaterial color="#384b50" />
      </mesh>
      <MonitorScreen activity={getOfficeActivity(agent)} reducedMotion={reducedMotion} />
      {[-0.105, -0.035, 0.035, 0.105].map((keyX) =>
        [-0.04, 0.02, 0.08].map((keyZ) => (
          <mesh key={`${keyX}:${keyZ}`} position={[keyX, 0.886, 0.13 + keyZ]}>
            <boxGeometry args={[0.045, 0.008, 0.035]} />
            <meshStandardMaterial color="#a9b7b7" />
          </mesh>
        )),
      )}
      {agent.status === "idle" && (
        <group position={[-0.36, 0.87, 0.18]}>
          <mesh rotation={[-0.08, 0, -0.12]}>
            <boxGeometry args={[0.23, 0.025, 0.18]} />
            <meshStandardMaterial color="#f0dfc4" />
          </mesh>
          <mesh position={[-0.13, 0.012, 0]} rotation={[-0.08, 0, -0.12]}>
            <boxGeometry args={[0.025, 0.035, 0.18]} />
            <meshStandardMaterial color="#6b928b" />
          </mesh>
        </group>
      )}
      <mesh ref={deskCup} position={[0.51, 0.92, 0.18]} castShadow>
        <cylinderGeometry args={[0.07, 0.08, 0.14, 8]} />
        <meshStandardMaterial color="#f0d1ac" />
      </mesh>
      <mesh position={[-0.5, 1.04, 0.1]}>
        <cylinderGeometry args={[0.025, 0.04, 0.48, 6]} />
        <meshStandardMaterial color="#d6b875" />
      </mesh>
      <mesh position={[-0.5, 1.27, 0.1]}>
        <coneGeometry args={[0.14, 0.12, 6]} />
        <meshStandardMaterial color="#e5c982" emissive="#bd9141" emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[0, 1.51, -0.35]}>
        <boxGeometry args={[0.62, 0.04, 0.04]} />
        <meshStandardMaterial color="#d8c3a0" />
      </mesh>
      <mesh position={[0, 1.55, -0.35]}>
        <sphereGeometry args={[0.065, 8, 6]} />
        <meshStandardMaterial
          ref={glow}
          color={statusColors[agent.status]}
          emissive={statusColors[agent.status]}
          emissiveIntensity={agent.status === "needs_attention" ? 0.55 : 0.22}
        />
      </mesh>
      <group position={[0, 0.15, 0.95]} rotation={[0, Math.PI, 0]}>
        <mesh position={[0, 0.9, -0.2]} rotation={[-0.08, 0, 0]} castShadow>
          <boxGeometry args={[0.5, 0.5, 0.07]} />
          <meshStandardMaterial color="#536a68" />
        </mesh>
        <mesh position={[0, 0.6, -0.2]}>
          <boxGeometry args={[0.08, 0.2, 0.05]} />
          <meshStandardMaterial color="#33403f" />
        </mesh>
        <mesh position={[0, 0.54, 0.02]} castShadow>
          <boxGeometry args={[0.54, 0.09, 0.48]} />
          <meshStandardMaterial color="#536a68" />
        </mesh>
        <mesh position={[0, 0.21, 0.02]}>
          <cylinderGeometry args={[0.035, 0.035, 0.58, 8]} />
          <meshStandardMaterial color="#9aa6a5" metalness={0.4} roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.08, 0.02]}>
          <cylinderGeometry args={[0.06, 0.06, 0.05, 8]} />
          <meshStandardMaterial color="#33403f" />
        </mesh>
        {[0, 1, 2, 3].map((leg) => (
          <group
            key={leg}
            position={[0, -0.08, 0.02]}
            rotation={[0, Math.PI / 4 + (leg * Math.PI) / 2, 0]}
          >
            <mesh position={[0.16, 0, 0]}>
              <boxGeometry args={[0.32, 0.035, 0.05]} />
              <meshStandardMaterial color="#33403f" />
            </mesh>
            <mesh position={[0.31, -0.035, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.035, 0.035, 0.04, 10]} />
              <meshStandardMaterial color="#1f2827" />
            </mesh>
          </group>
        ))}
      </group>
      {labels && (
        <OfficeLabel position={[0, 1.2, 0]} offset={sideView ? 0 : 1} offsetX={sideView ? 1.8 : 0}>
          <Text
            position={[0, 0.18, 0]}
            fontSize={0.2}
            color="#263c42"
            anchorX="center"
            outlineWidth={0.008}
            outlineColor="#f3eee4"
            maxWidth={1.9}
            anchorY="bottom"
            textAlign="center"
          >
            {agent.displayName}
          </Text>
          <Text
            position={[0, 0, 0]}
            fontSize={0.19}
            color={darkenHex(statusColors[agent.status], 0.65)}
            anchorX="center"
            maxWidth={1.9}
            outlineWidth={0.01}
            outlineColor="#f3eee4"
          >
            {agent.status === "working"
              ? officeActivityLabels[getOfficeActivity(agent)]
              : agent.status === "offline"
                ? "Away"
                : statusLabels[agent.status]}
          </Text>
        </OfficeLabel>
      )}
      {agent.status === "needs_attention" && (
        <OfficeLabel position={[0, 1.2, 0]} offset={sideView ? 0 : 1} offsetX={sideView ? 1.8 : 0}>
          <Text position={[1.05, 0, 0]} fontSize={0.3} color="#d34f55" anchorX="center">
            ?
          </Text>
        </OfficeLabel>
      )}
      {agent.status === "queued" && (
        <OfficeLabel position={[0, 1.2, 0]} offset={sideView ? 0 : 1} offsetX={sideView ? 1.8 : 0}>
          <Text position={[1.05, 0, 0]} fontSize={0.2} color="#3979b7" anchorX="center">
            ◷
          </Text>
        </OfficeLabel>
      )}
      {agent.status === "failed" && (
        <OfficeLabel position={[0, 1.2, 0]} offset={sideView ? 0 : 1} offsetX={sideView ? 1.8 : 0}>
          <Text position={[1.05, 0, 0]} fontSize={0.22} color="#c44848" anchorX="center">
            !
          </Text>
        </OfficeLabel>
      )}
      {agent.status === "offline" && (
        <OfficeLabel position={[0, 0.96, 0.25]} offset={0.3}>
          <Text fontSize={0.12} color="#526b72" anchorX="center">
            AWAY
          </Text>
        </OfficeLabel>
      )}
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.15, 1.2, 32]} />
          <meshBasicMaterial color="#d69431" />
        </mesh>
      )}
    </group>
  );
});
