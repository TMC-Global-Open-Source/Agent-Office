import { Billboard } from "@react-three/drei";
import type { ReactNode } from "react";

export function OfficeLabel({
  position,
  offset = 0,
  offsetX = 0,
  children,
}: {
  position: [number, number, number];
  offset?: number;
  offsetX?: number;
  children: ReactNode;
}) {
  return (
    <Billboard position={position}>
      <group position={[offsetX, offset, 0]}>{children}</group>
    </Billboard>
  );
}
