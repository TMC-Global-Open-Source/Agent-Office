import { expect, test } from "@playwright/test";
import type { Agent } from "@agent-office/shared";

test("janitor uses the full roster, visits the idle office, and leaves when work resumes", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let allIdle = false;
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.route("**/api/v1/agents", async (route) => {
    const response = await route.fetch();
    const snapshot = (await response.json()) as { data: Agent[] };
    snapshot.data = snapshot.data.map((agent, index) => ({
      ...agent,
      status: allIdle || index > 0 ? "idle" : "working",
    }));
    await route.fulfill({ response, json: snapshot });
  });
  await page.goto("/");
  await expect(page.getByText("Aria Chen").first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Idle", exact: true }).click();
  const visitor = page.getByRole("status").filter({ hasText: "Janitor visitor:" });
  // Filtering out the working agent must not trigger a visit.
  await page.waitForTimeout(26_000);
  await expect(visitor).toHaveCount(0);
  allIdle = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(visitor).toContainText("Arriving", { timeout: 30_000 });
  await expect(visitor).not.toContainText("Arriving", { timeout: 5_000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(visitor).toContainText("Quiet visit");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  allIdle = false;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(visitor).toContainText("Heading out");
  await expect(visitor).toHaveCount(0, { timeout: 5_000 });
  expect(errors).toEqual([]);
});
