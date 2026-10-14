import { expect, test } from "@playwright/test";

test("office activities and parent grouping remain available in the accessible view", async ({
  page,
  request,
}) => {
  const payload = await (
    await request.get(`http://127.0.0.1:${process.env.E2E_API_PORT ?? 4400}/api/v1/agents`)
  ).json();
  const template = payload.data[0];
  const activities = ["reading", "typing", "researching", "monitoring", "organizing", "puzzled"];
  const agents = activities.map((officeActivity, index) => ({
    ...template,
    id: `activity-${index}`,
    displayName: index === 0 ? "Parent session" : `Child ${index}`,
    source: "local",
    status: "working",
    metadata: { officeActivity, ...(index ? { parentAgentId: "activity-0" } : {}) },
  }));
  const desks = agents.map((agent, index) => ({
    id: `desk-${index}`,
    agentId: agent.id,
    column: index % 5,
    row: Math.floor(index / 5),
    active: true,
  }));
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.route("**/api/v1/agents", (route) => route.fulfill({ json: { data: agents } }));
  await page.route("**/api/v1/desks", (route) => route.fulfill({ json: { data: desks } }));
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "Show agent list", exact: true }).click();
  const list = page.getByLabel("Accessible agent list");
  await expect(list.getByText("Activity: Reading documents")).toBeVisible();
  await expect(list.getByText("Activity: Typing", { exact: true })).toBeVisible();
  await expect(list.getByText("Activity: Researching & taking notes")).toBeVisible();
  await expect(list.getByText("Activity: Watching a task run")).toBeVisible();
  await expect(list.getByText("Activity: Organizing context")).toBeVisible();
  await expect(list.getByText("Activity: Checking a problem")).toBeVisible();
  await list.getByRole("button", { name: /Child 1/ }).click();
  const profile = page.getByRole("complementary", { name: "Child 1 details" });
  await expect(profile.getByText("Parent session", { exact: true }).last()).toBeVisible();
  await expect(profile.getByText("Typing", { exact: true })).toBeVisible();
});
