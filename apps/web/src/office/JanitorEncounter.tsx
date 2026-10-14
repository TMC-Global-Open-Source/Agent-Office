import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Text } from "@react-three/drei";
import * as THREE from "three";
import {
  advanceJanitor,
  createJanitorEncounter,
  janitorActions,
  janitorPose,
} from "./janitor-animation.js";

export function JanitorEncounter({
  allIdle,
  reducedMotion,
  labels,
}: {
  allIdle: boolean;
  reducedMotion: boolean;
  labels: boolean;
}) {
  const encounter = useRef(createJanitorEncounter());
  const root = useRef<THREE.Group>(null);
  const actor = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const mop = useRef<THREE.Group>(null);
  const bucket = useRef<THREE.Group>(null);
  const [caption, setCaption] = useState<string | null>(null);

  useFrame((_, delta) => {
    const state = encounter.current;
    const previousPhase = state.phase;
    advanceJanitor(state, delta, allIdle);
    if (!root.current || !actor.current) return;
    root.current.visible = state.phase !== "waiting";
    if (previousPhase !== state.phase) {
      setCaption(
        state.phase === "waiting"
          ? null
          : state.phase === "performing"
            ? janitorActions[state.action]!
            : state.phase === "entering"
              ? "Arriving"
              : "Heading out",
      );
    }
    if (state.phase === "waiting") {
      root.current.position.set(-6, 0, -2.65);
      return;
    }
    const performing = state.phase === "performing";
    const pose = janitorPose(performing ? state.action : -1, state.elapsed, reducedMotion);
    if (reducedMotion) {
      root.current.position.set(1.8, 0, -2.65);
    } else {
      root.current.position.x = THREE.MathUtils.damp(
        root.current.position.x,
        state.phase === "leaving" ? -6 : 1.8,
        2,
        Math.min(delta, 0.1),
      );
    }
    actor.current.position.set(pose.x, pose.y, 0);
    actor.current.rotation.set(pose.bend, pose.yaw, pose.lean);
    const walk = !performing && !reducedMotion ? Math.sin(state.elapsed * 9) * 0.3 : 0;
    if (leftArm.current) leftArm.current.rotation.x = pose.leftArm + walk;
    if (rightArm.current) rightArm.current.rotation.x = pose.rightArm - walk;
    if (leftLeg.current) leftLeg.current.rotation.x = pose.leftLeg - walk;
    if (rightLeg.current) rightLeg.current.rotation.x = pose.rightLeg + walk;
    if (mop.current) mop.current.rotation.set(0, 0, pose.mopTilt + pose.mopSpin);
    if (bucket.current) bucket.current.rotation.z = pose.bucketTilt;
  });

  return (
    <group ref={root} visible={false} position={[-6, 0, -2.65]}>
      <group ref={actor}>
        <mesh position={[0, 0.94, 0]} castShadow>
          <boxGeometry args={[0.42, 0.5, 0.28]} />
          <meshStandardMaterial color="#7487ab" />
        </mesh>
        <mesh position={[0, 1.48, 0]} castShadow>
          <boxGeometry args={[0.32, 0.32, 0.3]} />
          <meshStandardMaterial color="#dcb18c" />
        </mesh>
        <mesh position={[0, 1.67, 0.02]} castShadow>
          <boxGeometry args={[0.4, 0.1, 0.42]} />
          <meshStandardMaterial color="#465b7c" />
        </mesh>
        {[-0.07, 0.07].map((x) => (
          <mesh key={x} position={[x, 1.5, 0.157]}>
            <boxGeometry args={[0.025, 0.035, 0.015]} />
            <meshStandardMaterial color="#26343a" />
          </mesh>
        ))}
        <mesh position={[0.11, 1.02, 0.148]}>
          <boxGeometry args={[0.1, 0.07, 0.012]} />
          <meshStandardMaterial color="#eee1cb" />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side} ref={side < 0 ? leftArm : rightArm} position={[side * 0.29, 1.13, 0]}>
            <mesh position={[0, -0.18, 0]} castShadow>
              <boxGeometry args={[0.14, 0.38, 0.16]} />
              <meshStandardMaterial color="#7487ab" />
            </mesh>
            <mesh position={[0, -0.4, 0.02]}>
              <boxGeometry args={[0.12, 0.13, 0.14]} />
              <meshStandardMaterial color="#e3c866" />
            </mesh>
          </group>
        ))}
        {[-1, 1].map((side) => (
          <group key={side} ref={side < 0 ? leftLeg : rightLeg} position={[side * 0.12, 0.7, 0]}>
            <mesh position={[0, -0.26, 0]} castShadow>
              <boxGeometry args={[0.16, 0.52, 0.19]} />
              <meshStandardMaterial color="#465b7c" />
            </mesh>
            <mesh position={[0, -0.6, 0.06]} castShadow>
              <boxGeometry args={[0.19, 0.14, 0.3]} />
              <meshStandardMaterial color="#34434d" />
            </mesh>
          </group>
        ))}
        <group ref={mop} position={[0.48, 0.8, 0.22]}>
          <mesh>
            <cylinderGeometry args={[0.025, 0.025, 1.5, 8]} />
            <meshStandardMaterial color="#b6966f" />
          </mesh>
          <mesh position={[0, -0.7, 0]} castShadow>
            <boxGeometry args={[0.38, 0.13, 0.25]} />
            <meshStandardMaterial color="#e1dbcc" />
          </mesh>
        </group>
      </group>
      <group ref={bucket} position={[-0.9, 0.25, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.21, 0.16, 0.4, 12]} />
          <meshStandardMaterial color="#d5ad4a" />
        </mesh>
        <mesh position={[0, 0.23, 0]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.18, 0.018, 6, 12, Math.PI]} />
          <meshStandardMaterial color="#596a72" />
        </mesh>
      </group>
      {labels && (
        <Text
          position={[0, 2.03, 0]}
          fontSize={0.14}
          color="#465b7c"
          anchorX="center"
          outlineWidth={0.008}
          outlineColor="#f3eee4"
        >
          {reducedMotion ? "JANITOR · QUIET VISIT" : `JANITOR · ${caption ?? "VISITOR"}`}
        </Text>
      )}
      {caption !== null && (
        <Html>
          <span className="sr-only" role="status">
            Janitor visitor: {reducedMotion ? "Quiet visit" : caption}
          </span>
        </Html>
      )}
    </group>
  );
}
