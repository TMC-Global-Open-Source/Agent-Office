import { coolerPosition } from "./water-cooler.js";

export function WaterCooler() {
  return (
    <group position={coolerPosition}>
      <mesh position={[0, 0.58, 0]} castShadow>
        <boxGeometry args={[0.65, 1.16, 0.6]} />
        <meshStandardMaterial color="#eee1cb" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.87, -0.31]}>
        <boxGeometry args={[0.4, 0.35, 0.035]} />
        <meshStandardMaterial color="#526b72" />
      </mesh>
      <mesh position={[0, 1.47, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.22, 0.6, 16]} />
        <meshStandardMaterial color="#8296a0" transparent opacity={0.7} roughness={0.25} />
      </mesh>
      <mesh position={[0, 1.15, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.15, 12]} />
        <meshStandardMaterial color="#526b72" />
      </mesh>
      {[-0.12, 0.12].map((x) => (
        <mesh key={x} position={[x, 0.95, -0.36]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.1, 8]} />
          <meshStandardMaterial color={x < 0 ? "#8296a0" : "#b11f4b"} />
        </mesh>
      ))}
      <mesh position={[0, 0.67, -0.34]}>
        <boxGeometry args={[0.4, 0.035, 0.18]} />
        <meshStandardMaterial color="#526b72" />
      </mesh>
      <mesh position={[0.37, 0.85, 0]}>
        <cylinderGeometry args={[0.075, 0.055, 0.23, 10]} />
        <meshStandardMaterial color="#f0dfc4" />
      </mesh>
    </group>
  );
}
