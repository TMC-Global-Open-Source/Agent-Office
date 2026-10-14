import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { OfficeActivity } from "@agent-office/shared";
import { activityPose } from "./activity-animation.js";

function TypingArm({
  side,
  id,
  reducedMotion,
  activity,
}: {
  side: -1 | 1;
  id: string;
  reducedMotion: boolean;
  activity: OfficeActivity;
}) {
  const upper = useRef<THREE.Mesh>(null);
  const lower = useRef<THREE.Mesh>(null);
  const hand = useRef<THREE.Group>(null);
  const vectors = useRef({
    shoulder: new THREE.Vector3(side * 0.24, 1.12, 0),
    elbow: new THREE.Vector3(side * 0.25, 0.79, 0.13),
    wrist: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
  });
  useFrame(({ clock }) => {
    const pose = activityPose(id, activity, clock.elapsedTime, reducedMotion);
    const target = side < 0 ? pose.left : pose.right;
    const { shoulder, elbow, wrist, direction, up } = vectors.current;
    wrist.set(target.x, target.y, target.z);
    elbow.set(side * 0.25, target.y > 1 ? 1.03 : 0.79, target.y > 1 ? 0.17 : 0.13);
    const segment = (mesh: THREE.Mesh | null, start: THREE.Vector3, end: THREE.Vector3) => {
      if (!mesh) return;
      direction.subVectors(end, start);
      mesh.position.copy(start).add(end).multiplyScalar(0.5);
      mesh.scale.y = direction.length();
      mesh.quaternion.setFromUnitVectors(up, direction.normalize());
    };
    segment(upper.current, shoulder, elbow);
    segment(lower.current, elbow, wrist);
    hand.current?.position.copy(wrist);
  });
  return (
    <>
      <mesh ref={upper} castShadow>
        <boxGeometry args={[0.13, 1, 0.15]} />
        <meshStandardMaterial color="#526b72" roughness={0.88} />
      </mesh>
      <mesh ref={lower} castShadow>
        <boxGeometry args={[0.11, 1, 0.12]} />
        <meshStandardMaterial color="#526b72" roughness={0.88} />
      </mesh>
      <group ref={hand}>
        <mesh castShadow>
          <boxGeometry args={[0.1, 0.035, 0.12]} />
          <meshStandardMaterial color="#e5bd97" roughness={0.9} />
        </mesh>
        {activity === "researching" && side > 0 && (
          <mesh position={[0, 0.045, 0.02]} rotation={[0.5, 0, -0.3]}>
            <cylinderGeometry args={[0.012, 0.012, 0.17, 6]} />
            <meshStandardMaterial color="#d6b875" />
          </mesh>
        )}
      </group>
    </>
  );
}

export function TypingArms({
  id,
  reducedMotion,
  activity = "typing",
}: {
  id: string;
  reducedMotion: boolean;
  activity?: OfficeActivity;
}) {
  return (
    <>
      <TypingArm side={-1} id={id} reducedMotion={reducedMotion} activity={activity} />
      <TypingArm side={1} id={id} reducedMotion={reducedMotion} activity={activity} />
    </>
  );
}
