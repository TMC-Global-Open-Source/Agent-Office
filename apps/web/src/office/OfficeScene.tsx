import { Suspense, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { MutableRefObject } from "react";
import type { Agent } from "@agent-office/shared";
import type { DeskData } from "./Workstation.js";
import { Workstation } from "./Workstation.js";
import { AgentPresence } from "./AgentPresence.js";
import { LivingRoom, livingRoomSeat } from "./LivingRoom.js";
import { JanitorEncounter } from "./JanitorEncounter.js";
import { MathUtils, OrthographicCamera } from "three";
import { subagentLayout } from "./subagent-layout.js";
import { SubagentTeams } from "./SubagentTeams.js";
import { WaterCooler } from "./WaterCooler.js";
import { advanceWaterBreak, coolerStandingPosition, type WaterBreakState } from "./water-cooler.js";
import { loungePersonality } from "./lounge-animation.js";

const defaultZoom = 50;

function Scene({
  agents,
  allAgents,
  allIdle,
  desks,
  selectedId,
  onSelect,
  labels,
  decorations,
  shadows,
  performanceMode,
  reducedMotion,
  resetRef,
  zoomRef,
}: {
  agents: Agent[];
  allAgents: Agent[];
  allIdle: boolean;
  desks: DeskData[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  labels: boolean;
  decorations: boolean;
  shadows: boolean;
  performanceMode: boolean;
  reducedMotion: boolean;
  resetRef: MutableRefObject<(() => void) | null>;
  zoomRef: MutableRefObject<((direction: number) => void) | null>;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const loungeAssignments = useRef(new Map<string, number>());
  const waterClock = useRef(0);
  const waterState = useRef<WaterBreakState>({ visit: null, nextAt: null, variants: {} });
  const [waterBreak, setWaterBreak] = useState(waterState.current);
  resetRef.current = () => {
    if (!controls.current) return;
    controls.current.target.set(0, 0, 0);
    controls.current.object.position.set(12, 14, 12);
    if (controls.current.object instanceof OrthographicCamera) {
      controls.current.object.zoom = defaultZoom;
      controls.current.object.updateProjectionMatrix();
    }
    controls.current.update();
  };
  const layout = useMemo(() => subagentLayout(allAgents, desks), [allAgents, desks]);
  const byDesk = useMemo(() => new Map(layout.desks.map((desk) => [desk.agentId, desk])), [layout]);
  const selectedDesk = selectedId ? byDesk.get(selectedId) : undefined;
  const loungeIndexByAgent = useMemo(() => {
    const idleAgents = allAgents.filter((agent) => agent.status === "idle");
    const idleIds = new Set(idleAgents.map((agent) => agent.id));
    const assignments = new Map([...loungeAssignments.current].filter(([id]) => idleIds.has(id)));
    const occupiedSeats = new Set(assignments.values());
    const newIdleAgents = idleAgents
      .filter((agent) => !assignments.has(agent.id))
      .sort((a, b) => {
        const aDesk = byDesk.get(a.id);
        const bDesk = byDesk.get(b.id);
        return (
          (aDesk?.row ?? 0) - (bDesk?.row ?? 0) ||
          (aDesk?.column ?? 0) - (bDesk?.column ?? 0) ||
          a.id.localeCompare(b.id)
        );
      });
    const capacity = Math.max(8, Math.ceil(allAgents.length / 8) * 8);
    for (const agent of newIdleAgents) {
      let seat = 0;
      while (occupiedSeats.has(seat) && seat < capacity) seat++;
      assignments.set(agent.id, seat);
      occupiedSeats.add(seat);
    }
    loungeAssignments.current = assignments;
    return assignments;
  }, [allAgents, byDesk]);
  const selectedLoungeIndex = selectedId ? loungeIndexByAgent.get(selectedId) : undefined;
  const fullIdleSeats = useMemo(
    () =>
      new Map(
        [...loungeIndexByAgent].filter(([id]) =>
          allAgents.some((agent) => agent.id === id && agent.status === "idle"),
        ),
      ),
    [loungeIndexByAgent, allAgents],
  );
  useFrame((_, delta) => {
    waterClock.current += Math.min(delta, 0.1);
    const next = advanceWaterBreak(
      waterState.current,
      waterClock.current,
      fullIdleSeats,
      reducedMotion,
      (id) => loungePersonality(id).variant,
    );
    if (next !== waterState.current) {
      waterState.current = next;
      setWaterBreak(next);
    }
  });
  useFrame(({ camera }, delta) => {
    if ((!selectedDesk && selectedLoungeIndex === undefined) || reducedMotion || !controls.current)
      return;
    const [x, , z] =
      waterBreak.visit?.agentId === selectedId
        ? coolerStandingPosition
        : selectedLoungeIndex !== undefined
          ? livingRoomSeat(selectedLoungeIndex)
          : [(selectedDesk!.column - 2) * 3.15, 0, selectedDesk!.row * 3.15];
    const amount = Math.min(1, delta * 1.6);
    controls.current.target.x += (x - controls.current.target.x) * amount;
    controls.current.target.z += (z - controls.current.target.z) * amount;
    camera.position.x += (x + 12 - camera.position.x) * amount;
    camera.position.z += (z + 12 - camera.position.z) * amount;
    controls.current.update();
  });
  zoomRef.current = (direction) => {
    if (!controls.current) return;
    const camera = controls.current.object;
    if (camera instanceof OrthographicCamera) {
      camera.zoom = MathUtils.clamp(camera.zoom * (direction > 0 ? 1.2 : 1 / 1.2), 18, 100);
      camera.updateProjectionMatrix();
    }
    controls.current.update();
  };
  const floorSize = Math.max(
    18,
    Math.ceil(Math.sqrt(Math.max(1, agents.length)) / 5) * 18,
    14 + Math.ceil(agents.length / 8) * 5.2,
    ...layout.desks.map(
      (desk) => Math.max(Math.abs((desk.column - 2) * 3.15), Math.abs(desk.row * 3.15)) * 2 + 6,
    ),
  );
  return (
    <>
      <color attach="background" args={["#e9e7df"]} />
      <ambientLight intensity={0.85} />
      <directionalLight
        position={[8, 14, 5]}
        intensity={2.2}
        castShadow={shadows && !performanceMode}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <hemisphereLight args={["#e7f3ee", "#8a8171", 0.45]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <planeGeometry args={[floorSize, floorSize]} />
        <meshStandardMaterial color="#dfddd4" roughness={1} />
      </mesh>
      {!performanceMode && (
        <gridHelper
          args={[floorSize, Math.ceil(floorSize / 1.6), "#c7c6bc", "#d2d0c7"]}
          position={[0, -0.02, 0]}
        />
      )}
      {decorations && !performanceMode && (
        <>
          <mesh position={[7, 0.4, -4]}>
            <boxGeometry args={[1.6, 0.75, 0.55]} />
            <meshStandardMaterial color="#9e886f" />
          </mesh>
          <Text position={[0, 2.3, -8]} fontSize={0.65} color="#81918c" anchorX="center">
            AGENT OFFICE
          </Text>
        </>
      )}
      <LivingRoom seatCount={allAgents.length} />
      <WaterCooler />
      <SubagentTeams
        teams={layout.teams.filter((team) =>
          team.agentIds.some((id) => agents.some((agent) => agent.id === id)),
        )}
        labels={labels}
      />
      <JanitorEncounter allIdle={allIdle} reducedMotion={reducedMotion} labels={labels} />
      {agents.map((agent) => {
        const desk = byDesk.get(agent.id);
        if (!desk) return null;
        return (
          <Workstation
            key={agent.id}
            agent={agent}
            desk={desk}
            selected={selectedId === agent.id}
            onSelect={() => onSelect(agent.id)}
            labels={labels}
            reducedMotion={reducedMotion}
          />
        );
      })}
      {agents.map((agent) => {
        const desk = byDesk.get(agent.id);
        if (!desk) return null;
        return (
          <AgentPresence
            key={agent.id}
            agent={agent}
            desk={desk}
            loungeIndex={loungeIndexByAgent.get(agent.id)}
            waterVisit={waterBreak.visit?.agentId === agent.id ? waterBreak.visit : null}
            waterClock={waterClock}
            loungeVariant={waterBreak.variants[agent.id]}
            labels={labels}
            selected={selectedId === agent.id}
            reducedMotion={reducedMotion}
            onSelect={() => onSelect(agent.id)}
          />
        );
      })}
      <OrbitControls
        ref={controls}
        makeDefault
        target={[0, 0, 0]}
        enableRotate={false}
        enablePan
        maxPolarAngle={Math.PI / 2.12}
        minZoom={18}
        maxZoom={100}
        zoomSpeed={0.75}
      />
    </>
  );
}

export function OfficeScene(props: {
  agents: Agent[];
  allAgents: Agent[];
  allIdle: boolean;
  desks: DeskData[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  labels: boolean;
  decorations: boolean;
  shadows: boolean;
  performanceMode: boolean;
  reducedMotion: boolean;
  resetRef: MutableRefObject<(() => void) | null>;
  zoomRef: MutableRefObject<((direction: number) => void) | null>;
}) {
  return (
    <Canvas
      orthographic
      camera={{ position: [12, 14, 12], zoom: defaultZoom, near: 0.1, far: 100 }}
      dpr={props.performanceMode ? 1 : [1, 1.5]}
      shadows={!props.performanceMode && props.shadows}
      gl={{ antialias: !props.performanceMode }}
    >
      <Suspense fallback={null}>
        <Scene {...props} />
      </Suspense>
    </Canvas>
  );
}
