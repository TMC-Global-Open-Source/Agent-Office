import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, SRGBColorSpace, type MeshBasicMaterial } from "three";
import { homeTimeline } from "@agent-office/shared";
import type { OfficeActivity } from "@agent-office/shared";
import { drawScreen } from "./screen-activity.js";

export function MonitorScreen({
  activity,
  reducedMotion,
  bossing = false,
  homeStartedAt = null,
}: {
  activity: OfficeActivity;
  reducedMotion: boolean;
  bossing?: boolean;
  homeStartedAt?: number | null;
}) {
  const material = useRef<MeshBasicMaterial>(null);
  const screen = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 144;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Monitor screen drawing context is unavailable.");
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return { context, texture };
  }, []);
  const lastFrame = useRef(-1);
  useEffect(() => {
    drawScreen(screen.context, bossing ? "typing" : activity, 0);
    screen.texture.needsUpdate = true;
    lastFrame.current = -1;
  }, [screen, activity, reducedMotion, bossing]);
  useEffect(() => () => screen.texture.dispose(), [screen]);
  useFrame(({ clock }) => {
    const off =
      homeStartedAt !== null && Date.now() >= homeStartedAt + homeTimeline.shutdown * 1000;
    if (material.current) {
      const map = off ? null : screen.texture;
      if (material.current.map !== map) {
        material.current.map = map;
        material.current.needsUpdate = true;
      }
      material.current.color.set(off ? "#10171a" : "#ffffff");
    }
    if (off) return;
    if (reducedMotion) return;
    const frame = Math.floor(clock.elapsedTime * 12);
    if (frame === lastFrame.current) return;
    lastFrame.current = frame;
    drawScreen(screen.context, bossing ? "typing" : activity, bossing ? frame : frame / 12);
    if (bossing) {
      // A slow, low-contrast glow avoids rapid strobing.
      screen.context.fillStyle = `rgba(255, 220, 130, ${0.12 + Math.sin(clock.elapsedTime * Math.PI * 2) * 0.08})`;
      screen.context.fillRect(0, 0, 256, 144);
    }
    screen.texture.needsUpdate = true;
  });
  return (
    <mesh position={[0, 1.19, -0.172]}>
      <planeGeometry args={[0.59, 0.36]} />
      <meshBasicMaterial ref={material} map={screen.texture} toneMapped={false} />
    </mesh>
  );
}
