import { expect, test } from "@playwright/test";
import type { RootState } from "@react-three/fiber";
import type { Agent } from "@agent-office/shared";

test("away agents do not add desks or couches and lounge capacity follows active headcount", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const payload = await (
    await request.get(`http://127.0.0.1:${process.env.E2E_API_PORT ?? 4400}/api/v1/agents`)
  ).json();
  const sample: Agent = payload.data[0];
  const active = Array.from({ length: 9 }, (_, index): Agent => ({
    ...sample,
    id: `seating-${index}`,
    displayName: `Seating ${index}`,
    status: "idle",
    metadata: {},
  }));
  const away: Agent[] = [
    { ...sample, id: "offline", status: "offline", metadata: {} },
    { ...sample, id: "away", status: "working", metadata: { officeActivity: "away" } },
  ];
  let agents = [...active.slice(0, 8), ...away];
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.route("**/api/v1/usage/**", (route) => route.fulfill({ json: { data: null } }));
  await page.route("**/api/v1/agents", (route) => route.fulfill({ json: { data: agents } }));
  await page.route("**/api/v1/desks", (route) =>
    route.fulfill({
      json: {
        data: agents.map((agent, index) => ({
          id: `desk-${agent.id}`,
          agentId: agent.id,
          row: Math.floor(index / 5),
          column: index % 5,
          active: true,
        })),
      },
    }),
  );
  await page.route("**/api/v1/refresh", (route) => route.fulfill({ json: { data: [] } }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("canvas")).toBeVisible();
  const seating = () =>
    page.evaluate(async () => {
      const modulePath = "/node_modules/.vite/deps/@react-three_fiber.js";
      const fiber = (await import(modulePath)) as {
        _roots: Map<Element, { store: { getState(): RootState } }>;
      };
      const canvas = document.querySelector("canvas");
      const scene = canvas && fiber._roots.get(canvas)?.store.getState().scene;
      if (!scene) return null;
      let bays = 0;
      let desks = 0;
      const positions: number[] = [];
      scene.traverse((object) => {
        if (object.name.startsWith("lounge-bay-")) bays++;
        if (object.name.startsWith("agent-seating-")) positions.push(object.position.z);
        if (object.name.startsWith("workstation-")) desks++;
      });
      return {
        bays,
        desks,
        occupants: positions.length,
        outsideFirstBay: positions.some((z) => z < -8),
        awayVisible: Boolean(
          scene.getObjectByName("agent-away") || scene.getObjectByName("agent-offline"),
        ),
      };
    });
  await expect
    .poll(seating, { timeout: 30_000 })
    .toEqual({ bays: 1, desks: 8, occupants: 8, outsideFirstBay: false, awayVisible: false });
  agents = [...active, ...away];
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect
    .poll(seating)
    .toEqual({ bays: 2, desks: 9, occupants: 9, outsideFirstBay: true, awayVisible: false });
  agents = [...active.slice(1), ...away];
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect
    .poll(seating)
    .toEqual({ bays: 1, desks: 8, occupants: 8, outsideFirstBay: false, awayVisible: false });
  expect(errors).toEqual([]);
});
