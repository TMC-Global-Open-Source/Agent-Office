import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { coffeePosition, coffeeRotation } from "./water-cooler.js";

export function CoffeeMaker({
  brewing,
  reducedMotion,
}: {
  brewing: boolean;
  reducedMotion: boolean;
}) {
  const steam = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!steam.current) return;
    steam.current.position.y = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 2) * 0.035;
  });
  return (
    <group name="coffee-station" position={coffeePosition} rotation={[0, coffeeRotation, 0]}>
      <group name="kitchenette">
        <mesh position={[0.6, 0.42, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.35, 0.84, 0.8]} />
          <meshStandardMaterial color="#668b82" roughness={0.85} />
        </mesh>
        <mesh position={[0.6, 0.07, 0.41]}>
          <boxGeometry args={[2.25, 0.12, 0.035]} />
          <meshStandardMaterial color="#526b72" />
        </mesh>
        {[-0.27, 0.31, 0.89, 1.47].map((x) => (
          <group key={x} position={[x, 0.46, 0.415]}>
            <mesh castShadow>
              <boxGeometry args={[0.54, 0.64, 0.035]} />
              <meshStandardMaterial color="#8296a0" roughness={0.8} />
            </mesh>
            <mesh position={[0.16, 0.19, 0.035]}>
              <boxGeometry args={[0.04, 0.14, 0.04]} />
              <meshStandardMaterial color="#eee1cb" metalness={0.4} />
            </mesh>
          </group>
        ))}
        <group name="kitchenette-return">
          <mesh position={[-0.175, 0.42, 0.9]} castShadow receiveShadow>
            <boxGeometry args={[0.8, 0.84, 1]} />
            <meshStandardMaterial color="#668b82" roughness={0.85} />
          </mesh>
          <mesh position={[-0.175, 0.86, 0.95]} castShadow>
            <boxGeometry args={[0.9, 0.08, 1]} />
            <meshStandardMaterial color="#e5d7c2" />
          </mesh>
          {[0.65, 1.15].map((z) => (
            <group key={z} position={[0.24, 0.46, z]}>
              <mesh castShadow>
                <boxGeometry args={[0.035, 0.64, 0.46]} />
                <meshStandardMaterial color="#8296a0" roughness={0.8} />
              </mesh>
              <mesh position={[0.035, 0.19, 0.13]}>
                <boxGeometry args={[0.04, 0.14, 0.04]} />
                <meshStandardMaterial color="#eee1cb" metalness={0.4} />
              </mesh>
            </group>
          ))}
        </group>
        <group name="kitchenette-sink" position={[1.45, 0.91, 0]}>
          <mesh>
            <boxGeometry args={[0.75, 0.025, 0.59]} />
            <meshStandardMaterial color="#c7c6bc" metalness={0.65} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.015, 0]}>
            <boxGeometry args={[0.59, 0.012, 0.43]} />
            <meshStandardMaterial color="#526b72" metalness={0.35} />
          </mesh>
          <mesh position={[0, 0.025, 0.03]}>
            <cylinderGeometry args={[0.04, 0.04, 0.008, 10]} />
            <meshStandardMaterial color="#c7c6bc" metalness={0.6} />
          </mesh>
          <mesh position={[0, 0.18, -0.24]} castShadow>
            <cylinderGeometry args={[0.025, 0.025, 0.34, 10]} />
            <meshStandardMaterial color="#c7c6bc" metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.34, -0.14]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.2, 10]} />
            <meshStandardMaterial color="#c7c6bc" metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.3, -0.04]}>
            <cylinderGeometry args={[0.025, 0.025, 0.08, 10]} />
            <meshStandardMaterial color="#c7c6bc" metalness={0.7} />
          </mesh>
        </group>
      </group>
      <mesh position={[0.6, 0.86, 0]} castShadow>
        <boxGeometry args={[2.45, 0.08, 0.9]} />
        <meshStandardMaterial color="#e5d7c2" />
      </mesh>
      <group name="coffee-machine" position={[-0.175, 0, 0.95]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 1.2, -0.12]} castShadow>
          <boxGeometry args={[0.68, 0.6, 0.48]} />
          <meshStandardMaterial color="#526b72" metalness={0.35} roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.28, 0.13]}>
          <boxGeometry args={[0.46, 0.25, 0.025]} />
          <meshStandardMaterial color="#24343a" />
        </mesh>
        <mesh position={[0.17, 1.39, 0.15]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color={brewing ? "#38b984" : "#b11f4b"} />
        </mesh>
        <mesh position={[0, 1.2, 0.21]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.14, 8]} />
          <meshStandardMaterial color="#c7c6bc" metalness={0.6} />
        </mesh>
        <group position={[0, 0.99, 0.27]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.09, 0.075, 0.17, 12]} />
            <meshStandardMaterial color="#eee1cb" />
          </mesh>
          <mesh position={[0.09, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.045, 0.014, 6, 10]} />
            <meshStandardMaterial color="#eee1cb" />
          </mesh>
          <mesh position={[0, 0.087, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.006, 12]} />
            <meshStandardMaterial color="#775a45" />
          </mesh>
        </group>
        {brewing && (
          <group>
            <mesh name="coffee-stream" position={[0, 1.12, 0.27]}>
              <cylinderGeometry args={[0.012, 0.012, 0.1, 8]} />
              <meshStandardMaterial color="#775a45" />
            </mesh>
            <group ref={steam}>
              {[-0.06, 0, 0.06].map((x) => (
                <mesh key={x} position={[x, 1.18 + x, 0.3]}>
                  <sphereGeometry args={[0.035, 8, 8]} />
                  <meshStandardMaterial color="#eee1cb" transparent opacity={0.45} />
                </mesh>
              ))}
            </group>
          </group>
        )}
      </group>
    </group>
  );
}
