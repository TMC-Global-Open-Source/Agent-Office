import { memo } from "react";

const sofaColors = ["#668b82", "#8296a0"];
const seatOffsets = [-1.29, -0.43, 0.43, 1.29];

export function livingRoomSeat(index: number): [number, number, number] {
  const bay = Math.floor(index / 8);
  const sofa = Math.floor((index % 8) / seatOffsets.length);
  const seat = index % seatOffsets.length;
  return [(sofa === 0 ? -2.05 : 2.05) + seatOffsets[seat]!, 0.1, -6.31 - bay * 5.2];
}

export const LivingRoom = memo(function LivingRoom({ seatCount }: { seatCount: number }) {
  const bayCount = Math.max(1, Math.ceil(seatCount / 8));
  return (
    <>
      {Array.from({ length: bayCount }, (_, bay) => (
        <group key={bay} position={[0, 0, -5.5 - bay * 5.2]}>
          <mesh position={[0, 0.012, 0]} receiveShadow>
            <boxGeometry args={[8.2, 0.025, 4.8]} />
            <meshStandardMaterial color="#d2c6ae" roughness={0.98} />
          </mesh>
          {sofaColors.map((color, sofaIndex) => {
            const x = sofaIndex === 0 ? -2.05 : 2.05;
            return (
              <group key={color} position={[x, 0, -0.95]}>
                <mesh position={[0, 0.34, 0]} castShadow receiveShadow>
                  <boxGeometry args={[3.65, 0.68, 1.05]} />
                  <meshStandardMaterial color={color} roughness={0.9} />
                </mesh>
                <mesh position={[0, 0.84, -0.37]} castShadow>
                  <boxGeometry args={[3.65, 0.9, 0.28]} />
                  <meshStandardMaterial color={color} roughness={0.9} />
                </mesh>
                {[-1.68, 1.68].map((armX) => (
                  <mesh key={armX} position={[armX, 0.67, 0.02]} castShadow>
                    <boxGeometry args={[0.3, 0.7, 1.12]} />
                    <meshStandardMaterial color={color} roughness={0.88} />
                  </mesh>
                ))}
                {seatOffsets.map((offset, seatIndex) => (
                  <mesh key={offset} position={[offset, 0.55, 0.29]} castShadow receiveShadow>
                    <boxGeometry args={[0.78, 0.13, 0.82]} />
                    <meshStandardMaterial
                      color={seatIndex % 2 === 0 ? "#e5d7c2" : "#d8c6ad"}
                      roughness={0.94}
                    />
                  </mesh>
                ))}
              </group>
            );
          })}
          <mesh position={[0, 0.36, 1.17]} castShadow>
            <boxGeometry args={[2.05, 0.12, 0.82]} />
            <meshStandardMaterial color="#9a7658" roughness={0.8} />
          </mesh>
          {(
            [
              [-0.82, 1.17],
              [0.82, 1.17],
            ] as const
          ).map(([x, z]) => (
            <mesh key={x} position={[x, 0.19, z]} castShadow>
              <cylinderGeometry args={[0.045, 0.06, 0.3, 8]} />
              <meshStandardMaterial color="#775a45" />
            </mesh>
          ))}
          <mesh position={[-0.66, 0.49, 1.17]} castShadow>
            <cylinderGeometry args={[0.11, 0.13, 0.18, 12]} />
            <meshStandardMaterial color="#eee1cb" />
          </mesh>
        </group>
      ))}
    </>
  );
});
