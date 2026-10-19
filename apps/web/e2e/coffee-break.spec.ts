import { expect, test } from "@playwright/test";
import type { RootState } from "@react-three/fiber";

test("lounge agents brew coffee and carry a mug back to the couch", async ({ page, request }) => {
  test.setTimeout(120_000);
  const payload = await (
    await request.get(`http://127.0.0.1:${process.env.E2E_API_PORT ?? 4400}/api/v1/agents`)
  ).json();
  const agents = Array.from({ length: 8 }, (_, index) => ({
    ...payload.data[0],
    id: `coffee-${index}`,
    status: "idle",
    metadata: {},
  }));
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.route("**/api/v1/agents", (route) => route.fulfill({ json: { data: agents } }));
  await page.route("**/api/v1/desks", (route) =>
    route.fulfill({
      json: {
        data: agents.map((agent, index) => ({
          id: `desk-${index}`,
          agentId: agent.id,
          column: index % 5,
          row: Math.floor(index / 5),
          active: true,
        })),
      },
    }),
  );
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const inspect = () =>
    page.evaluate(async () => {
      const modulePath = "/node_modules/.vite/deps/@react-three_fiber.js";
      const fiber = (await import(modulePath)) as {
        _roots: Map<Element, { store: { getState(): RootState } }>;
      };
      const canvas = document.querySelector("canvas");
      const scene = canvas && fiber._roots.get(canvas)?.store.getState().scene;
      if (!scene) return null;
      const maker = scene.getObjectByName("coffee-station");
      const agents = scene.children.filter((child) => child.name.startsWith("agent-coffee-"));
      return {
        maker: maker ? [maker.position.x, maker.position.z] : null,
        rotation: maker?.rotation.y,
        kitchenette: !!maker?.getObjectByName("kitchenette"),
        sink: !!maker?.getObjectByName("kitchenette-sink"),
        returnCounter: !!maker?.getObjectByName("kitchenette-return"),
        machine: maker?.getObjectByName("coffee-machine")?.position.toArray(),
        brewing: !!scene.getObjectByName("coffee-stream"),
        agents: agents.map((agent) => ({
          id: agent.name,
          x: agent.position.x,
          z: agent.position.z,
          mug: !!agent.getObjectByName("coffee-mug"),
          thigh: agent.getObjectByName("left-thigh")?.rotation.x,
        })),
      };
    });
  await expect
    .poll(async () => (await inspect())?.maker, { timeout: 20_000 })
    .toEqual([8, -7.4]);
  expect((await inspect())?.rotation).toBeCloseTo(-Math.PI / 2);
  expect((await inspect())?.kitchenette).toBe(true);
  expect((await inspect())?.sink).toBe(true);
  expect((await inspect())?.returnCounter).toBe(true);
  expect((await inspect())?.machine).toEqual([-0.175, 0, 0.95]);
  await expect
    .poll(async () => (await inspect())?.brewing, { timeout: 75_000, intervals: [250] })
    .toBe(true);
  const brewing = await inspect();
  const guest = brewing!.agents.find((agent) => Math.hypot(agent.x - 7.05, agent.z + 6.6) < 0.1)!;
  expect(guest).toBeDefined();
  await expect
    .poll(
      async () => {
        const state = await inspect();
        const agent = state?.agents.find((agent) => agent.id === guest.id);
        return !!agent?.mug && !state?.brewing && Math.hypot(agent.x - 7.05, agent.z + 6.6) > 0.15;
      },
      { timeout: 15_000, intervals: [200] },
    )
    .toBe(true);
  await expect
    .poll(
      async () => {
        const agent = (await inspect())?.agents.find((agent) => agent.id === guest.id);
        return (
          !!agent?.mug &&
          Math.abs(agent.z + 6.31) < 0.08 &&
          Math.abs((agent.thigh ?? 0) + Math.PI / 2) < 0.01
        );
      },
      { timeout: 20_000, intervals: [250] },
    )
    .toBe(true);
  expect(errors).toEqual([]);
});
