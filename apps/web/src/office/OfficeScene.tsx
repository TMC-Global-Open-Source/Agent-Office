import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
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
import { GameCorner } from "./GameCorner.js";
import {
  advanceGameRoom,
  gameMachines,
  gameStandingPositions,
  gameVisitors,
  initialGameRoom,
  type GameRoomState,
} from "./game-room.js";
import { advanceWaterBreak, coolerStandingPosition, type WaterBreakState } from "./water-cooler.js";
import { loungePersonality } from "./lounge-animation.js";
import { officeViews, type OfficeView } from "./camera-views.js";
import { useOfficeStore } from "../store.js";
import { agentDisplayName } from "../agent-name.js";
import { belongsInLounge } from "./lounge-eligibility.js";
import { partyElapsed, partyStartedAt } from "./party-animation.js";
import { useSecretParty } from "./secret-party.js";

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
  view,
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
  view: OfficeView;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const [loungeNow, setLoungeNow] = useState(Date.now);
  useEffect(() => {
    const update = () => {
      const now = Date.now();
      setLoungeNow((previous) =>
        allAgents.some((agent) => belongsInLounge(agent, previous) !== belongsInLounge(agent, now))
          ? now
          : previous,
      );
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [allAgents]);
  const loungeAssignments = useRef(new Map<string, number>());
  const waterClock = useRef(0);
  const waterState = useRef<WaterBreakState>({ visit: null, nextAt: null, variants: {} });
  const [waterBreak, setWaterBreak] = useState(waterState.current);
  const gameState = useRef<GameRoomState>(initialGameRoom());
  const [gameRoom, setGameRoom] = useState(gameState.current);
  const saveCamera = () => {
    const camera = controls.current?.object;
    if (!controls.current || !(camera instanceof OrthographicCamera)) return;
    useOfficeStore.getState().setCameraState({
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.current.target.x, controls.current.target.y, controls.current.target.z],
      zoom: camera.zoom,
    });
  };
  resetRef.current = () => {
    if (!controls.current) return;
    controls.current.target.set(0, 0, 0);
    controls.current.object.position.set(...officeViews[view].position);
    controls.current.object.up.set(...officeViews[view].up);
    if (controls.current.object instanceof OrthographicCamera) {
      controls.current.object.zoom = officeViews[view].zoom;
      controls.current.object.updateProjectionMatrix();
    }
    controls.current.update();
    saveCamera();
  };
  useEffect(() => {
    const saved = useOfficeStore.getState().cameraState;
    if (!saved || !controls.current) {
      resetRef.current?.();
      return;
    }
    const camera = controls.current.object;
    camera.position.set(...saved.position);
    camera.up.set(...officeViews[view].up);
    controls.current.target.set(...saved.target);
    if (camera instanceof OrthographicCamera) {
      camera.zoom = saved.zoom;
      camera.updateProjectionMatrix();
    }
    controls.current.update();
  }, [view, resetRef]);
  const layout = useMemo(() => subagentLayout(allAgents, desks), [allAgents, desks]);
  const byDesk = useMemo(() => new Map(layout.desks.map((desk) => [desk.agentId, desk])), [layout]);
  const selectedDesk = selectedId ? byDesk.get(selectedId) : undefined;
  const loungeIndexByAgent = useMemo(() => {
    const idleAgents = allAgents.filter((agent) => belongsInLounge(agent, loungeNow));
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
  }, [allAgents, byDesk, loungeNow]);
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
  const partyHosts = useMemo(
    () => allAgents.filter((agent) => partyStartedAt(agent) !== null),
    [allAgents],
  );
  useFrame((_, delta) => {
    waterClock.current += Math.min(delta, 0.1);
    const now = Date.now();
    const partiers = new Set(
      partyHosts.filter((agent) => partyElapsed(agent, now) !== null).map((agent) => agent.id),
    );
    const withoutPartiers = (seats: Map<string, number>) =>
      partiers.size ? new Map([...seats].filter(([id]) => !partiers.has(id))) : seats;
    const gamers = gameVisitors(gameState.current);
    const next = advanceWaterBreak(
      waterState.current,
      waterClock.current,
      withoutPartiers(
        gamers.size ? new Map([...fullIdleSeats].filter(([id]) => !gamers.has(id))) : fullIdleSeats,
      ),
      reducedMotion,
      (id) => loungePersonality(id).variant,
    );
    if (next !== waterState.current) {
      waterState.current = next;
      setWaterBreak(next);
    }
    const water = waterState.current.visit?.agentId;
    const nextGame = advanceGameRoom(
      gameState.current,
      waterClock.current,
      withoutPartiers(loungeIndexByAgent),
      reducedMotion,
      new Set(water ? [water] : []),
    );
    if (nextGame !== gameState.current) {
      gameState.current = nextGame;
      setGameRoom(nextGame);
    }
  });
  useFrame(({ camera }, delta) => {
    if ((!selectedDesk && selectedLoungeIndex === undefined) || reducedMotion || !controls.current)
      return;
    const selectedGame = gameMachines.find(
      (machine) => gameRoom.visits[machine]?.agentId === selectedId,
    );
    const [x, , z] =
      waterBreak.visit?.agentId === selectedId
        ? coolerStandingPosition
        : selectedGame
          ? gameStandingPositions[selectedGame]
          : selectedLoungeIndex !== undefined
            ? livingRoomSeat(selectedLoungeIndex)
            : [(selectedDesk!.column - 2) * 3.15, 0, selectedDesk!.row * 3.15];
    const amount = Math.min(1, delta * 1.6);
    const dx = (x - controls.current.target.x) * amount;
    const dz = (z - controls.current.target.z) * amount;
    controls.current.target.x += dx;
    controls.current.target.z += dz;
    camera.position.x += dx;
    camera.position.z += dz;
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
    saveCamera();
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
        </>
      )}
      <LivingRoom seatCount={allAgents.length} />
      <WaterCooler />
      <GameCorner
        arcadePlaying={gameRoom.visits.arcade?.phase === "playing"}
        pinballPlaying={gameRoom.visits.pinball?.phase === "playing"}
        reducedMotion={reducedMotion}
      />
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
            view={view}
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
            gameVisit={
              gameMachines
                .map((machine) => gameRoom.visits[machine])
                .find((visit) => visit?.agentId === agent.id) ?? null
            }
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
        onEnd={saveCamera}
        ref={controls}
        makeDefault
        target={[0, 0, 0]}
        enableRotate={false}
        enablePan
        minZoom={18}
        maxZoom={100}
        zoomSpeed={0.75}
      />
    </>
  );
}

export function OfficeScene(props: {
  view: OfficeView;
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
  const showSource = useOfficeStore((state) => state.showAgentSource);
  const allAgentsRef = useRef(props.allAgents);
  allAgentsRef.current = props.allAgents;
  const [officeParty, setOfficeParty] = useState<{ at: string; guests: Set<string> } | null>(null);
  useSecretParty(() => {
    const now = Date.now();
    const guests = allAgentsRef.current.filter((agent) => belongsInLounge(agent, now));
    if (guests.length)
      setOfficeParty({
        at: new Date(now).toISOString(),
        guests: new Set(guests.map((agent) => agent.id)),
      });
  });
  const displayAgents = (agents: Agent[]) =>
    agents.map((agent) => ({
      ...agent,
      displayName: agentDisplayName(agent, showSource),
      metadata: officeParty?.guests.has(agent.id)
        ? { ...agent.metadata, officeParty: officeParty.at }
        : agent.metadata,
    }));
  return (
    <Canvas
      orthographic
      camera={{ position: [12, 14, 12], zoom: defaultZoom, near: 0.1, far: 100 }}
      dpr={props.performanceMode ? 1 : [1, 1.5]}
      shadows={!props.performanceMode && props.shadows}
      gl={{ antialias: !props.performanceMode }}
    >
      <Suspense fallback={null}>
        <Scene
          {...props}
          agents={displayAgents(props.agents)}
          allAgents={displayAgents(props.allAgents)}
        />
      </Suspense>
    </Canvas>
  );
}
