import { expect, it } from "vitest";
import { deskTravelStep } from "./desk-travel.js";

it("walks at a steady pace facing the destination instead of easing across the room", () => {
  const first = deskTravelStep(0, 0, 10, 0, 0.1, false);
  const second = deskTravelStep(first.x, first.z, 10, 0, 0.1, false);
  expect(first.x).toBeCloseTo(0.28);
  expect(second.x - first.x).toBeCloseTo(0.28);
  expect(first.walking).toBe(true);
  expect(first.rotation).toBeCloseTo(Math.PI / 2);
});

it("arrives without overshooting and stops walking", () => {
  expect(deskTravelStep(0, 0, 0, 0.1, 0.1, false)).toMatchObject({
    x: 0,
    z: 0.1,
    walking: false,
  });
  expect(deskTravelStep(2, 3, 2, 3, 0.1, false)).toMatchObject({
    x: 2,
    z: 3,
    walking: false,
  });
});

it("skips locomotion when reduced motion is enabled", () => {
  expect(deskTravelStep(0, 0, 10, 20, 0.016, true)).toMatchObject({
    x: 10,
    z: 20,
    walking: false,
  });
});
