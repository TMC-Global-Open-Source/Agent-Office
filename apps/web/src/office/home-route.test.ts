import { expect, it } from "vitest";
import {
  clearHomeRoute,
  crossesFurniture,
  homeObstacles,
  sampleHomeRoute,
  type FloorPoint,
} from "./home-route.js";
import { livingRoomSeat } from "./LivingRoom.js";

const desks = Array.from({ length: 10 }, (_, index) => ({
  id: `desk-${index}`,
  agentId: `agent-${index}`,
  row: Math.floor(index / 5),
  column: index % 5,
  active: true,
}));

it("walks around every desk, chair, sofa, table, cooler and game cabinet on departure", () => {
  const obstacles = homeObstacles(desks, 16, true);
  for (const desk of desks) {
    const x = (desk.column - 2) * 3.15;
    const z = desk.row * 3.15 + 1.65;
    const route = clearHomeRoute([x, z], [9, z], obstacles);
    for (let index = 1; index < route.length; index++)
      expect(
        obstacles.some((rect) => crossesFurniture(route[index - 1]!, route[index]!, rect)),
      ).toBe(false);
    expect(sampleHomeRoute(route, 1)).toMatchObject({ x: 9, z });
  }
});

it("steps forward out of a sofa seat before following a clear route to the desk", () => {
  const obstacles = homeObstacles(desks, 16, true);
  for (let seat = 0; seat < 16; seat++) {
    const [x, , z] = livingRoomSeat(seat);
    const route = clearHomeRoute([x, z], [-6.3, 1.65], obstacles);
    expect(route[1]![0]).toBe(x);
    expect(route[1]![1]).toBeGreaterThan(z);
    for (let index = 2; index < route.length; index++)
      expect(
        obstacles.some((rect) => crossesFurniture(route[index - 1]!, route[index]!, rect)),
      ).toBe(false);
  }
});

it("samples the route at constant distance and clamps to the office boundary", () => {
  const route: FloorPoint[] = [
    [0, 0],
    [0, 2],
    [4, 2],
  ];
  expect(sampleHomeRoute(route, 0.5)).toMatchObject({ x: 1, z: 2, rotation: Math.PI / 2 });
  expect(sampleHomeRoute(route, 5)).toMatchObject({ x: 4, z: 2 });
});
