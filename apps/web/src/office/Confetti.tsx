import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  confettiBursts,
  confettiPieces,
  confettiPosition,
  partyDuration,
} from "./party-animation.js";

const dummy = new THREE.Object3D();

/** Confetti thrown by a celebrating agent; `startedAt` is the party start in epoch ms. */
export function Confetti({ seed, startedAt }: { seed: string; startedAt: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const pieces = useMemo(() => confettiPieces(seed), [seed]);
  useLayoutEffect(() => {
    const color = new THREE.Color();
    pieces.forEach((piece, index) => mesh.current?.setColorAt(index, color.set(piece.color)));
    if (mesh.current?.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [pieces]);
  useFrame(() => {
    if (!mesh.current) return;
    const elapsed = (Date.now() - startedAt) / 1000;
    const fade = THREE.MathUtils.clamp((partyDuration + 1.5 - elapsed) / 1.5, 0, 1);
    pieces.forEach((piece, index) => {
      const t = elapsed - confettiBursts[piece.burst]!;
      if (t < 0 || fade <= 0) {
        dummy.scale.setScalar(0);
      } else {
        const [x, y, z] = confettiPosition(piece, t);
        dummy.position.set(x, y, z);
        const settled = y <= 0.03;
        dummy.rotation.set(
          settled ? -Math.PI / 2 : piece.spin[0] * t,
          piece.spin[1] * t,
          settled ? 0 : piece.spin[2] * t,
        );
        dummy.scale.setScalar(fade);
      }
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(index, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, pieces.length]} frustumCulled={false}>
      <planeGeometry args={[0.08, 0.05]} />
      <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} />
    </instancedMesh>
  );
}
