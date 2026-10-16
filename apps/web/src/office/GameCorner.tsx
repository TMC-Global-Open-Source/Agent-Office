import { memo, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line, Text } from "@react-three/drei";
import * as THREE from "three";
import { arcadeInput, machinePositions, machineRotation, pinballFlips } from "./game-room.js";

const invaderColumns = [-0.16, -0.08, 0, 0.08, 0.16];
const invaderRows = [0.12, 0.06];

/** Classic upright side profile as (z, y): kick-out control panel, recessed screen, marquee hood. */
const cabinetProfile: Array<[number, number]> = [
  [-0.37, 0],
  [0.38, 0],
  [0.38, 0.98],
  [0.45, 1.04],
  [0.41, 1.16],
  [0.17, 1.24],
  [0.12, 1.86],
  [0.19, 1.9],
  [0.19, 2.13],
  [-0.2, 2.13],
  [-0.37, 1.95],
];
const sideThickness = 0.035;
const sideX = 0.415;
const stripeAngle = (50 * Math.PI) / 180;
const sideStripes: Array<[number, string]> = [
  [-0.12, "#ff3e9a"],
  [0.0, "#ff9f1c"],
  [0.12, "#22d3ee"],
];
const sideInvader = ["00100100", "00111100", "01011010", "11111111", "10111101", "10100101"];

function CabinetSide({ side }: { side: 1 | -1 }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(cabinetProfile.map(([z, y]) => new THREE.Vector2(z, y)));
    return new THREE.ExtrudeGeometry(shape, { depth: sideThickness, bevelEnabled: false });
  }, []);
  const trim = useMemo(
    () =>
      [...cabinetProfile, cabinetProfile[0]!].map(
        ([z, y]) => [0, y, z] as [number, number, number],
      ),
    [],
  );
  const face = side * (sideX + sideThickness + 0.002);
  // Art planes face outward; their local x runs toward the back on the right side and the front on the left.
  const u = (z: number) => (side === 1 ? -z : z);
  return (
    <group>
      <mesh
        geometry={geometry}
        position={[side === 1 ? sideX + sideThickness : -sideX, 0, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#14121c" roughness={0.55} />
      </mesh>
      <Line points={trim} position={[face, 0, 0]} color="#22d3ee" lineWidth={2} />
      <group position={[face, 0, 0]} rotation={[0, (side * Math.PI) / 2, 0]}>
        {sideStripes.map(([z, color]) => (
          <mesh
            key={color}
            position={[u(z), 0.56, 0]}
            rotation={[0, 0, side === 1 ? Math.PI - stripeAngle : stripeAngle]}
          >
            <planeGeometry args={[0.72, 0.055]} />
            <meshBasicMaterial color={color} />
          </mesh>
        ))}
        {sideInvader.flatMap((row, y) =>
          [...row].map((bit, x) =>
            bit === "1" ? (
              <mesh
                key={`${x}:${y}`}
                position={[u(-0.12 + (x - 3.5) * 0.028), 1.68 - y * 0.028, 0]}
              >
                <planeGeometry args={[0.026, 0.026]} />
                <meshBasicMaterial color="#c084fc" />
              </mesh>
            ) : null,
          ),
        )}
      </group>
    </group>
  );
}

function ArcadeCabinet({ playing, reducedMotion }: { playing: boolean; reducedMotion: boolean }) {
  const invaders = useRef<THREE.Group>(null);
  const ship = useRef<THREE.Mesh>(null);
  const shot = useRef<THREE.Mesh>(null);
  const blast = useRef<THREE.Mesh>(null);
  const stick = useRef<THREE.Group>(null);
  const marquee = useRef<THREE.MeshStandardMaterial>(null);
  const buttons = useRef<Array<THREE.MeshStandardMaterial | null>>([]);
  const coin = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const time = reducedMotion ? 0 : clock.elapsedTime;
    const input = playing ? arcadeInput(time) : { stickX: Math.sin(time * 0.9) * 0.6, button: 0 };
    const speed = playing ? 1 : 0.4;
    if (invaders.current) {
      invaders.current.position.x = Math.sin(time * 0.9 * speed) * 0.05;
      invaders.current.position.y = -((time * 0.02 * speed) % 0.06);
    }
    if (ship.current) ship.current.position.x = input.stickX * 0.2;
    if (shot.current) {
      const travel = (time * (playing ? 1.6 : 0.6)) % 1;
      shot.current.position.set(input.stickX * 0.2, -0.13 + travel * 0.3, 0.002);
      shot.current.visible = travel < 0.85;
      if (blast.current) {
        blast.current.visible = travel >= 0.85 && playing;
        blast.current.position.x = shot.current.position.x;
        blast.current.scale.setScalar(1 + (travel - 0.85) * 8);
      }
    }
    if (stick.current) stick.current.rotation.z = playing ? -input.stickX * 0.45 : 0;
    if (marquee.current)
      marquee.current.emissiveIntensity = 0.55 + Math.sin(time * (playing ? 6 : 1.6)) * 0.35;
    buttons.current.forEach((material, index) => {
      if (!material) return;
      material.emissiveIntensity = playing
        ? index === 0
          ? input.button * 1.4
          : ((time * 2.7) % 1 < 0.3 ? 1 : 0) * 1.2
        : 0.25 + Math.sin(time * 2 + index) * 0.2;
    });
    if (coin.current) coin.current.visible = !playing && Math.floor(time * 1.5) % 2 === 0;
  });

  return (
    <group position={machinePositions.arcade} rotation={[0, machineRotation, 0]}>
      <mesh position={[0, 0.53, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.82, 1.06, 0.72]} />
        <meshStandardMaterial color="#1f1b2e" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.47, -0.12]} castShadow>
        <boxGeometry args={[0.82, 0.86, 0.48]} />
        <meshStandardMaterial color="#1f1b2e" roughness={0.6} />
      </mesh>
      <CabinetSide side={1} />
      <CabinetSide side={-1} />
      <mesh position={[0, 0.06, 0.365]}>
        <boxGeometry args={[0.8, 0.12, 0.012]} />
        <meshStandardMaterial color="#c9ced6" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.48, 0.366]}>
        <boxGeometry args={[0.34, 0.34, 0.012]} />
        <meshStandardMaterial color="#2a2a33" metalness={0.5} roughness={0.45} />
      </mesh>
      {[-0.07, 0.07].map((x) => (
        <mesh key={x} position={[x, 0.53, 0.374]}>
          <boxGeometry args={[0.05, 0.08, 0.008]} />
          <meshStandardMaterial color="#ff9f1c" emissive="#ff7a00" emissiveIntensity={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 1.08, 0.24]} rotation={[0.35, 0, 0]} castShadow>
        <boxGeometry args={[0.82, 0.07, 0.34]} />
        <meshStandardMaterial color="#1d2a3b" />
      </mesh>
      <group ref={stick} position={[-0.18, 1.13, 0.26]}>
        <mesh position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.12, 6]} />
          <meshStandardMaterial color="#d7dde0" />
        </mesh>
        <mesh position={[0, 0.13, 0]}>
          <sphereGeometry args={[0.035, 10, 8]} />
          <meshStandardMaterial color="#b11f4b" />
        </mesh>
      </group>
      {[0.1, 0.22].map((x, index) => (
        <mesh key={x} position={[x, 1.12, 0.27]} rotation={[0.35, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.03, 12]} />
          <meshStandardMaterial
            ref={(material) => {
              buttons.current[index] = material;
            }}
            color={index === 0 ? "#f59e0b" : "#16a34a"}
            emissive={index === 0 ? "#f59e0b" : "#16a34a"}
          />
        </mesh>
      ))}
      <group position={[0, 1.5, 0.125]} rotation={[-0.12, 0, 0]}>
        <mesh>
          <planeGeometry args={[0.66, 0.52]} />
          <meshBasicMaterial color="#0d1822" />
        </mesh>
        <group ref={invaders} position={[0, 0, 0.001]}>
          {invaderRows.flatMap((y, row) =>
            invaderColumns.map((x) => (
              <mesh key={`${x}:${y}`} position={[x, y, 0]}>
                <planeGeometry args={[0.045, 0.03]} />
                <meshBasicMaterial color={row === 0 ? "#fd8ea1" : "#4ade80"} />
              </mesh>
            )),
          )}
        </group>
        <mesh ref={ship} position={[0, -0.17, 0.001]}>
          <planeGeometry args={[0.07, 0.03]} />
          <meshBasicMaterial color="#4da6ff" />
        </mesh>
        <mesh ref={shot}>
          <planeGeometry args={[0.01, 0.035]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>
        <mesh ref={blast} position={[0, 0.14, 0.003]} visible={false}>
          <circleGeometry args={[0.025, 10]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.85} />
        </mesh>
        <mesh ref={coin} position={[0, -0.03, 0.004]}>
          <planeGeometry args={[0.3, 0.035]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>
      </group>
      <mesh position={[0, 2.0, 0.0]} castShadow>
        <boxGeometry args={[0.82, 0.24, 0.3]} />
        <meshStandardMaterial ref={marquee} color="#b11f4b" emissive="#fd8ea1" />
      </mesh>
      <Text
        position={[0, 2.0, 0.155]}
        fontSize={0.1}
        color="#fff7ea"
        anchorX="center"
        anchorY="middle"
      >
        ARCADE
      </Text>
    </group>
  );
}

const bumpers: Array<[number, number, string]> = [
  [-0.14, -0.32, "#fd8ea1"],
  [0.14, -0.32, "#4da6ff"],
  [0, -0.08, "#fbbf24"],
];

function PinballTable({ playing, reducedMotion }: { playing: boolean; reducedMotion: boolean }) {
  const ball = useRef<THREE.Mesh>(null);
  const leftFlipper = useRef<THREE.Group>(null);
  const rightFlipper = useRef<THREE.Group>(null);
  const bumperMaterials = useRef<Array<THREE.MeshStandardMaterial | null>>([]);
  const lights = useRef<Array<THREE.MeshStandardMaterial | null>>([]);
  const backglass = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const time = reducedMotion ? 0 : clock.elapsedTime;
    const flips = playing ? pinballFlips(time) : { left: 0, right: 0 };
    const x = playing ? Math.sin(time * 2.3) * 0.24 + Math.sin(time * 5.1) * 0.04 : 0.3;
    const z = playing ? Math.cos(time * 1.7) * 0.4 - 0.02 : 0.52;
    if (ball.current) ball.current.position.set(x, 0.2, z);
    if (leftFlipper.current) leftFlipper.current.rotation.y = -0.45 + flips.left * 0.8;
    if (rightFlipper.current) rightFlipper.current.rotation.y = 0.45 - flips.right * 0.8;
    bumpers.forEach(([bx, bz], index) => {
      const material = bumperMaterials.current[index];
      if (!material) return;
      const hit = playing && Math.hypot(x - bx, z - bz) < 0.13;
      material.emissiveIntensity = hit ? 1.6 : 0.2 + (playing ? 0.15 : 0);
    });
    const step = Math.floor(time * (playing ? 9 : 2.5));
    lights.current.forEach((material, index) => {
      if (material) material.emissiveIntensity = (step + index) % 5 === 0 ? 1.4 : 0.1;
    });
    if (backglass.current)
      backglass.current.emissiveIntensity = playing
        ? 0.6 + (Math.floor(time * 4) % 2) * 0.5
        : 0.35 + Math.sin(time * 1.4) * 0.15;
  });

  return (
    <group position={machinePositions.pinball} rotation={[0, machineRotation, 0]}>
      {(
        [
          [-0.32, -0.62],
          [0.32, -0.62],
          [-0.32, 0.62],
          [0.32, 0.62],
        ] as const
      ).map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, 0.38, z]} castShadow>
          <boxGeometry args={[0.06, 0.76, 0.06]} />
          <meshStandardMaterial color="#1d2a3b" />
        </mesh>
      ))}
      <group position={[0, 0.82, 0]} rotation={[0.1, 0, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.78, 0.22, 1.45]} />
          <meshStandardMaterial color="#b11f4b" roughness={0.65} />
        </mesh>
        <mesh position={[0, 0.112, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.68, 1.35]} />
          <meshStandardMaterial color="#21364a" roughness={0.5} />
        </mesh>
        {bumpers.map(([x, z, color], index) => (
          <mesh key={`${x}:${z}`} position={[x, 0.16, z]}>
            <cylinderGeometry args={[0.065, 0.065, 0.08, 14]} />
            <meshStandardMaterial
              ref={(material) => {
                bumperMaterials.current[index] = material;
              }}
              color={color}
              emissive={color}
            />
          </mesh>
        ))}
        {[-0.24, -0.12, 0, 0.12, 0.24].map((x, index) => (
          <mesh key={x} position={[x, 0.125, 0.2]}>
            <sphereGeometry args={[0.022, 8, 6]} />
            <meshStandardMaterial
              ref={(material) => {
                lights.current[index] = material;
              }}
              color="#fbbf24"
              emissive="#fbbf24"
            />
          </mesh>
        ))}
        <group ref={leftFlipper} position={[-0.17, 0.14, 0.5]}>
          <mesh position={[0.08, 0, 0]}>
            <boxGeometry args={[0.17, 0.04, 0.04]} />
            <meshStandardMaterial color="#f0dfc4" />
          </mesh>
        </group>
        <group ref={rightFlipper} position={[0.17, 0.14, 0.5]}>
          <mesh position={[-0.08, 0, 0]}>
            <boxGeometry args={[0.17, 0.04, 0.04]} />
            <meshStandardMaterial color="#f0dfc4" />
          </mesh>
        </group>
        <mesh ref={ball} position={[0.3, 0.2, 0.52]} castShadow>
          <sphereGeometry args={[0.035, 12, 10]} />
          <meshStandardMaterial color="#e6ecef" metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[0.74, 0.012, 1.4]} />
          <meshStandardMaterial
            color="#cfe3ea"
            transparent
            opacity={0.18}
            roughness={0.1}
            depthWrite={false}
          />
        </mesh>
      </group>
      <group position={[0, 1.3, -0.68]}>
        <mesh castShadow>
          <boxGeometry args={[0.78, 0.66, 0.16]} />
          <meshStandardMaterial color="#1d2a3b" />
        </mesh>
        <mesh position={[0, 0.03, 0.082]}>
          <planeGeometry args={[0.66, 0.5]} />
          <meshStandardMaterial ref={backglass} color="#4da6ff" emissive="#4da6ff" />
        </mesh>
        <Text
          position={[0, 0.03, 0.09]}
          fontSize={0.1}
          color="#fff7ea"
          anchorX="center"
          anchorY="middle"
        >
          PINBALL
        </Text>
      </group>
    </group>
  );
}

export const GameCorner = memo(function GameCorner({
  arcadePlaying,
  pinballPlaying,
  reducedMotion,
}: {
  arcadePlaying: boolean;
  pinballPlaying: boolean;
  reducedMotion: boolean;
}) {
  return (
    <>
      <ArcadeCabinet playing={arcadePlaying} reducedMotion={reducedMotion} />
      <PinballTable playing={pinballPlaying} reducedMotion={reducedMotion} />
    </>
  );
});
