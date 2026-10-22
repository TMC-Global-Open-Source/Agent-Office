import { expect, test } from "@playwright/test";
import type { RootState } from "@react-three/fiber";

test("agents stand before leaving the couch and settle smoothly on return", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const payload = await (
    await request.get(`http://127.0.0.1:${process.env.E2E_API_PORT ?? 4400}/api/v1/agents`)
  ).json();
  const agent = {
    ...payload.data[0],
    id: "couch-test",
    status: "idle",
    metadata: {},
  };
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.route("**/api/v1/agents", (route) => route.fulfill({ json: { data: [agent] } }));
  await page.route("**/api/v1/desks", (route) =>
    route.fulfill({
      json: { data: [{ id: "couch-desk", agentId: agent.id, row: 0, column: 0, active: true }] },
    }),
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("canvas")).toBeVisible();
  const pose = () =>
    page.evaluate(async () => {
      const modulePath = "/node_modules/.vite/deps/@react-three_fiber.js";
      const fiber = (await import(modulePath)) as {
        _roots: Map<Element, { store: { getState(): RootState } }>;
      };
      const canvas = document.querySelector("canvas");
      const group =
        canvas &&
        fiber._roots.get(canvas)?.store.getState().scene.getObjectByName("agent-couch-test");
      const thigh = group?.getObjectByName("left-thigh");
      return group && thigh
        ? { x: group.position.x, z: group.position.z, thigh: thigh.rotation.x }
        : null;
    });
  await expect.poll(pose, { timeout: 20_000 }).toEqual({ x: -3.34, z: -6.31, thigh: -Math.PI / 2 });
  await page.keyboard.type("boss");
  const samples = await page.evaluate(async () => {
    const modulePath = "/node_modules/.vite/deps/@react-three_fiber.js";
    const fiber = (await import(modulePath)) as {
      _roots: Map<Element, { store: { getState(): RootState } }>;
    };
    const canvas = document.querySelector("canvas")!;
    const group = fiber._roots
      .get(canvas)!
      .store.getState()
      .scene.getObjectByName("agent-couch-test")!;
    const body = group.getObjectByName("avatar-body")!;
    const thigh = group.getObjectByName("left-thigh")!;
    const samples: Array<{ time: number; x: number; z: number; lean: number; thigh: number }> = [];
    const start = performance.now();
    await new Promise<void>((resolve) => {
      function sample() {
        const time = performance.now() - start;
        samples.push({
          time,
          x: group.position.x,
          z: group.position.z,
          lean: body.rotation.x,
          thigh: thigh.rotation.x,
        });
        if (time >= 25_000) resolve();
        else requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    return samples;
  });
  const rising = samples.filter((sample) => sample.time < 800 && sample.lean > 0.15);
  expect(rising.length).toBeGreaterThan(3);
  expect(rising.every((sample) => Math.hypot(sample.x + 3.34, sample.z + 6.31) < 0.01)).toBe(true);
  expect(
    rising.some((sample) => sample.lean > 0.2 && sample.thigh > -1.4 && sample.thigh < -0.2),
  ).toBe(true);
  expect(samples.some((sample) => Math.hypot(sample.x + 6.3, sample.z - 0.65) < 0.1)).toBe(true);
  expect(
    samples.some(
      (sample) =>
        Math.abs(Math.abs(sample.x + 6.3) - 1.1) < 0.06 &&
        Math.abs(sample.z - 0.65) < 0.06 &&
        sample.time < 15_000,
    ),
  ).toBe(true);
  const returning = samples.filter((sample) => sample.time > 15_000);
  expect(
    returning.some(
      (sample) =>
        Math.abs(Math.abs(sample.x + 6.3) - 1.1) < 0.06 && Math.abs(sample.z - 0.65) < 0.06,
    ),
  ).toBe(true);
  expect(
    samples.every((sample) => !(Math.abs(sample.x + 6.3) < 0.95 && Math.abs(sample.z) < 0.55)),
  ).toBe(true);
  expect(returning.some((sample) => Math.abs(sample.z + 5.11) < 0.1)).toBe(true);
  expect(
    returning.some(
      (sample) =>
        Math.hypot(sample.x + 3.34, sample.z + 6.31) < 0.08 &&
        sample.thigh < -0.2 &&
        sample.thigh > -1.4 &&
        sample.lean > 0.15,
    ),
  ).toBe(true);
  const last = samples.at(-1)!;
  expect(last.x).toBeCloseTo(-3.34);
  expect(last.z).toBeCloseTo(-6.31);
  expect(last.thigh).toBeCloseTo(-Math.PI / 2);
  expect(errors).toEqual([]);
});
