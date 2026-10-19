import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { homeTimeline } from "@agent-office/shared";

export function DepartureSmoke({
  startedAt,
  reducedMotion,
}: {
  startedAt: number;
  reducedMotion: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!root.current) return;
    const t = (Date.now() - startedAt) / 1000 - homeTimeline.exit;
    root.current.visible = t >= 0 && t < homeTimeline.gone - homeTimeline.exit;
    root.current.children.forEach((child, index) => {
      const progress = Math.max(0, t) / (homeTimeline.gone - homeTimeline.exit);
      const angle = index * 2.399;
      const radius = reducedMotion ? 0.65 : 0.3 + progress * 1.3;
      child.position.set(
        Math.cos(angle) * radius,
        0.4 + (index % 3) * 0.3 + (reducedMotion ? 0 : progress * 0.8),
        Math.sin(angle) * radius,
      );
      child.scale.setScalar((0.45 + (index % 3) * 0.13) * (reducedMotion ? 1 : 1 + progress));
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial)
        child.material.opacity = (1 - progress) * 0.75;
    });
  });
  return (
    <group ref={root} visible={false}>
      {Array.from({ length: 12 }, (_, index) => (
        <mesh key={index}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshStandardMaterial color="#d2d0c7" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
