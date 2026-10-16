import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Agent } from "@agent-office/shared";
import { getOfficeActivity } from "@agent-office/shared";
import { loungePersonality, loungePose } from "./lounge-animation.js";
import { TypingArms } from "./TypingArms.js";
import { activityPose } from "./activity-animation.js";
import { statusPose } from "./status-animation.js";
import { arcadeInput, pinballFlips, type GameMachine } from "./game-room.js";
import { partyElapsed, partyPose } from "./party-animation.js";

export function AgentAvatar({
  agent,
  selected,
  reducedMotion,
  relaxing = false,
  loungeVariant,
  walking = false,
  drinkingWater = false,
  playing = null,
  partying = false,
}: {
  agent: Agent;
  selected: boolean;
  reducedMotion: boolean;
  relaxing?: boolean;
  loungeVariant?: number;
  walking?: boolean;
  drinkingWater?: boolean;
  playing?: GameMachine | null;
  partying?: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const leftFoot = useRef<THREE.Group>(null);
  const rightFoot = useRef<THREE.Group>(null);
  const offline = agent.status === "offline";
  const isRelaxing =
    !partying && relaxing && (agent.status === "idle" || agent.status === "completed");
  const isWorking = !partying && agent.status === "working";
  const activity = getOfficeActivity(agent);
  const idleVariant = loungeVariant ?? loungePersonality(agent.id).variant;

  useFrame(({ clock }) => {
    const elapsed = Math.max(0, (Date.now() - Date.parse(agent.updatedAt)) / 1000);
    if (root.current && agent.status === "spawning" && !reducedMotion) {
      const progress = THREE.MathUtils.clamp(elapsed / 1.4, 0, 1);
      root.current.position.x = 0.25 - (1 - progress) * 0.55;
      root.current.scale.setScalar(0.1 + progress * 0.9);
    }
    if (leftArm.current) leftArm.current.rotation.set(0.12, 0, 0);
    if (rightArm.current) rightArm.current.rotation.set(0.12, 0, 0);
    if (head.current) head.current.rotation.set(0, 0, 0);
    if (body.current) {
      body.current.rotation.set(0, 0, 0);
      body.current.position.y = 0.7;
    }
    if (leftFoot.current) leftFoot.current.rotation.x = 0;
    if (rightFoot.current) rightFoot.current.rotation.x = 0;
    if (partying) {
      const partyAt = partyElapsed(agent, Date.now());
      const pose = partyPose(partyAt ?? 0, reducedMotion);
      if (leftArm.current) leftArm.current.rotation.set(pose.leftX, 0, pose.leftZ);
      if (rightArm.current) rightArm.current.rotation.set(pose.rightX, 0, pose.rightZ);
      if (head.current) head.current.rotation.set(pose.headX, pose.headY, 0);
      if (body.current) {
        body.current.position.y += pose.bodyY;
        body.current.rotation.set(pose.bodyX, 0, pose.bodyZ);
      }
      if (leftFoot.current) leftFoot.current.rotation.x = pose.leftFoot;
      if (rightFoot.current) rightFoot.current.rotation.x = pose.rightFoot;
      return;
    }
    if (playing) {
      const time = reducedMotion ? 0 : clock.elapsedTime;
      if (playing === "arcade") {
        const input = arcadeInput(time);
        if (leftArm.current) leftArm.current.rotation.set(-1.05, 0, -input.stickX * 0.18);
        if (rightArm.current) rightArm.current.rotation.set(-1.05 + input.button * 0.18, 0, 0.05);
        if (body.current) body.current.rotation.z = input.stickX * 0.05;
        if (head.current) head.current.rotation.set(-0.08, input.stickX * 0.06, 0);
      } else {
        const flips = pinballFlips(time);
        if (leftArm.current) leftArm.current.rotation.set(-0.95 + flips.left * 0.22, 0, 0.12);
        if (rightArm.current) rightArm.current.rotation.set(-0.95 + flips.right * 0.22, 0, -0.12);
        if (body.current) {
          body.current.rotation.x = 0.12 + (flips.left + flips.right) * 0.03;
          body.current.rotation.z = (flips.right - flips.left) * 0.06;
        }
        if (head.current) head.current.rotation.set(0.3, Math.sin(time * 2.3) * 0.15, 0);
      }
      if (!reducedMotion && body.current)
        body.current.position.y += Math.abs(Math.sin(time * 4)) * 0.015;
      return;
    }
    if (walking || drinkingWater) {
      const stride = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 7) * 0.3;
      if (leftFoot.current) leftFoot.current.rotation.x = walking ? stride : 0;
      if (rightFoot.current) rightFoot.current.rotation.x = walking ? -stride : 0;
      if (leftArm.current) leftArm.current.rotation.x = walking ? -stride : 0.12;
      if (rightArm.current) rightArm.current.rotation.x = drinkingWater ? -1.8 : stride;
      if (head.current && drinkingWater) head.current.rotation.x = -0.08;
      return;
    }
    if (isRelaxing) {
      const pose = loungePose(agent.id, clock.elapsedTime, reducedMotion, idleVariant);
      if (body.current) {
        body.current.rotation.x = pose.bodyX;
        body.current.position.y += pose.bodyY;
      }
      if (head.current) head.current.rotation.set(pose.headX, pose.headY, 0);
      if (leftArm.current) leftArm.current.rotation.set(pose.leftArmX, 0, pose.leftArmZ);
      if (rightArm.current) rightArm.current.rotation.set(pose.rightArmX, 0, pose.rightArmZ);
      if (leftFoot.current) leftFoot.current.rotation.x = pose.footX;
      if (rightFoot.current) rightFoot.current.rotation.x = -pose.footX;
      return;
    }
    if (isWorking) {
      if (body.current && activity === "typing" && !reducedMotion) {
        body.current.rotation.x = 0.035 + Math.sin(clock.elapsedTime * 2.4) * 0.015;
        body.current.rotation.z = Math.sin(clock.elapsedTime * 3.2) * 0.018;
      }
      if (head.current) {
        const pose = activityPose(agent.id, activity, clock.elapsedTime, reducedMotion);
        head.current.rotation.set(pose.headX, pose.headY, 0);
      }
      return;
    }
    if (agent.status === "needs_attention" || agent.status === "completed") {
      const timestamp =
        agent.status === "completed" ? agent.completedAt : agent.metadata.waitingForPromptSince;
      const started = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
      const statusElapsed = Number.isFinite(started)
        ? Math.max(0, (Date.now() - started) / 1000)
        : elapsed;
      const pose = statusPose(agent.status, statusElapsed, reducedMotion);
      if (leftArm.current) leftArm.current.rotation.z = pose.leftZ;
      if (rightArm.current) rightArm.current.rotation.z = pose.rightZ;
      if (head.current) head.current.rotation.set(pose.headX, pose.headY, 0);
      if (body.current) {
        body.current.position.y += pose.bodyY;
        body.current.rotation.z = pose.bodyZ;
      }
      return;
    }
    if (reducedMotion) {
      if (leftArm.current) leftArm.current.rotation.set(0.12, 0, 0);
      if (rightArm.current) rightArm.current.rotation.set(0.12, 0, 0);
      if (head.current) head.current.rotation.set(0, 0, 0);
      if (body.current) body.current.rotation.set(0, 0, 0);
      return;
    }
    const time = clock.elapsedTime;
    if (leftArm.current && rightArm.current) {
      if (agent.status === "idle" && idleVariant === 0) {
        leftArm.current.rotation.x = Math.sin(time * 0.5) * 0.12 + 0.12;
      } else if (agent.status === "idle" && idleVariant === 1) {
        const sip = Math.max(0, Math.sin(time * 0.55 + agent.id.length) ** 10);
        rightArm.current.rotation.x = 0.15 + sip * 0.9;
      } else {
        leftArm.current.rotation.x = 0.12;
        rightArm.current.rotation.x = 0.12;
        leftArm.current.rotation.z = Math.sin(time * 0.5) * 0.03;
        rightArm.current.rotation.z = -Math.sin(time * 0.5) * 0.03;
      }
    }
    if (head.current) head.current.rotation.y = Math.sin(time * 0.55 + agent.id.length) * 0.08;
    if (body.current && agent.status === "idle")
      body.current.rotation.x = Math.sin(time * 0.8) * 0.025;
  });

  const accent = offline ? "#899397" : agent.avatarColor;
  const limbMaterial = (
    <meshStandardMaterial color={offline ? "#8c9699" : "#526b72"} roughness={0.88} />
  );
  return (
    <group
      ref={root}
      position={[
        isWorking || walking || drinkingWater || playing || partying ? 0 : 0.25,
        agent.status === "needs_attention" && !partying ? 0.32 : 0,
        walking || drinkingWater || playing || partying ? 0 : 0.15,
      ]}
      scale={agent.status === "spawning" ? 0.92 : 1}
    >
      <group ref={body} position={[0, 0.7, 0]}>
        <group position={[0, -0.7, 0]}>
          <mesh position={[0, 0.93, 0]} castShadow>
            <boxGeometry args={[0.38, 0.48, 0.25]} />
            <meshStandardMaterial color={accent} roughness={0.82} />
          </mesh>
          <group ref={head} position={[0, 1.49, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.32, 0.32, 0.3]} />
              <meshStandardMaterial color={offline ? "#aab1b2" : "#e5bd97"} roughness={0.9} />
            </mesh>
            <mesh position={[-0.075, 0.025, 0.17]}>
              <boxGeometry args={[0.025, 0.035, 0.012]} />
              <meshStandardMaterial color="#24343a" />
            </mesh>
            <mesh position={[0.075, 0.025, 0.17]}>
              <boxGeometry args={[0.025, 0.035, 0.012]} />
              <meshStandardMaterial color="#24343a" />
            </mesh>
            <mesh position={[0, 0.17, 0]}>
              <boxGeometry args={[0.34, 0.07, 0.34]} />
              <meshStandardMaterial color={accent} />
            </mesh>
          </group>
          {isWorking && (
            <TypingArms id={agent.id} reducedMotion={reducedMotion} activity={activity} />
          )}
          {isWorking && ["reading", "researching", "organizing"].includes(activity) && (
            <group
              position={[0, activity === "reading" ? 1.02 : 0.81, 0.35]}
              rotation={[-0.25, 0, 0]}
            >
              {(activity === "organizing" ? [0, 1, 2] : [0]).map((page) => (
                <mesh key={page} position={[page * 0.035, page * 0.02, 0]}>
                  <boxGeometry args={[0.28, 0.012, 0.25]} />
                  <meshStandardMaterial color="#f0dfc4" />
                </mesh>
              ))}
              {[0, 1, 2].map((line) => (
                <mesh
                  key={line}
                  position={[0, activity === "organizing" ? 0.051 : 0.008, -0.07 + line * 0.05]}
                >
                  <boxGeometry args={[0.17, 0.003, 0.006]} />
                  <meshStandardMaterial color="#526b72" />
                </mesh>
              ))}
            </group>
          )}
          <group ref={leftArm} position={[-0.24, 1.12, 0]} visible={!isWorking}>
            <mesh position={[-0.02, -0.18, 0]} castShadow>
              <boxGeometry args={[0.13, 0.38, 0.15]} />
              {limbMaterial}
            </mesh>
            <mesh position={[-0.02, -0.39, 0.02]}>
              <boxGeometry args={[0.11, 0.13, 0.13]} />
              <meshStandardMaterial color="#e5bd97" />
            </mesh>
          </group>
          <group ref={rightArm} position={[0.24, 1.12, 0]} visible={!isWorking}>
            <mesh position={[0.02, -0.18, 0]} castShadow>
              <boxGeometry args={[0.13, 0.38, 0.15]} />
              {limbMaterial}
            </mesh>
            <mesh position={[0.02, -0.39, 0.02]}>
              <boxGeometry args={[0.11, 0.13, 0.13]} />
              <meshStandardMaterial color="#e5bd97" />
            </mesh>
            {(drinkingWater || (isRelaxing && idleVariant === 1)) && (
              <group position={[0.02, -0.41, 0.08]}>
                <mesh castShadow>
                  <cylinderGeometry args={[0.075, 0.06, 0.13, 10]} />
                  <meshStandardMaterial color="#eee1cb" />
                </mesh>
                <mesh position={[0.075, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
                  <torusGeometry args={[0.035, 0.012, 6, 10]} />
                  <meshStandardMaterial color="#eee1cb" />
                </mesh>
              </group>
            )}
          </group>
          {isRelaxing && idleVariant === 0 && (
            <group position={[0, 0.82, 0.36]} rotation={[-0.3, 0, 0]}>
              {[-1, 1].map((side) => (
                <group key={side} position={[side * 0.12, 0, 0]} rotation={[0, 0, side * 0.15]}>
                  <mesh castShadow>
                    <boxGeometry args={[0.24, 0.035, 0.28]} />
                    <meshStandardMaterial color="#668b82" />
                  </mesh>
                  <mesh position={[0, 0.023, 0]}>
                    <boxGeometry args={[0.21, 0.015, 0.25]} />
                    <meshStandardMaterial color="#f0dfc4" />
                  </mesh>
                </group>
              ))}
            </group>
          )}
          {[-0.11, 0.11].map((x) => (
            <group key={x} position={[x, 0.55, 0]}>
              {isRelaxing || isWorking ? (
                <>
                  <mesh position={[0, 0.02, 0.16]} castShadow>
                    <boxGeometry args={[0.14, 0.16, 0.38]} />
                    {limbMaterial}
                  </mesh>
                  <group ref={x < 0 ? leftFoot : rightFoot} position={[0, 0.02, 0.34]}>
                    <mesh position={[0, -0.18, 0]} castShadow>
                      <boxGeometry args={[0.14, 0.36, 0.16]} />
                      {limbMaterial}
                    </mesh>
                    <mesh position={[0, -0.38, 0.06]}>
                      <boxGeometry args={[0.15, 0.08, 0.23]} />
                      {limbMaterial}
                    </mesh>
                  </group>
                </>
              ) : (
                <group ref={x < 0 ? leftFoot : rightFoot}>
                  <mesh position={[0, -0.14, 0]} castShadow>
                    <boxGeometry args={[0.14, 0.38, 0.16]} />
                    {limbMaterial}
                  </mesh>
                  <mesh position={[0, -0.37, 0.06]}>
                    <boxGeometry args={[0.15, 0.08, 0.23]} />
                    {limbMaterial}
                  </mesh>
                </group>
              )}
            </group>
          ))}
        </group>
      </group>
      {selected && (
        <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.53, 0.58, 24]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>
      )}
    </group>
  );
}
