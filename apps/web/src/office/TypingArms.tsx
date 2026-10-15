import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { OfficeActivity } from "@agent-office/shared";
import { activityPose } from "./activity-animation.js";
import { coffeeSip } from "./desk-animation.js";

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
  const cup = useRef<THREE.Group>(null);
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
    if (hand.current) {
      hand.current.rotation.x =
        activity === "typing" && !reducedMotion ? -(target.y - 0.74) * 2.5 : 0;
    }
    if (cup.current) {
      const sip = coffeeSip(id, clock.elapsedTime, reducedMotion);
      cup.current.visible =
        sip > 0 && ["working", "typing", "reading", "researching", "monitoring"].includes(activity);
      cup.current.rotation.x = -sip * 0.35;
    }
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
        {side > 0 && (
          <group ref={cup} position={[0, 0.04, 0.05]} visible={false}>
            <mesh>
              <cylinderGeometry args={[0.07, 0.06, 0.13, 10]} />
              <meshStandardMaterial color="#f0d1ac" />
            </mesh>
            <mesh position={[0, 0.066, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.055, 10]} />
              <meshStandardMaterial color="#775a45" side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0.075, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[0.035, 0.012, 6, 10]} />
              <meshStandardMaterial color="#f0d1ac" />
            </mesh>
          </group>
        )}
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
