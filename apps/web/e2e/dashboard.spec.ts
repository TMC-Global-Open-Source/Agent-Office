import { expect, test } from "@playwright/test";

test("mock office loads agents, creates a desk, and shows details", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Good work happens together." })).toBeVisible();
  await expect(page.getByText("Aria Chen").first()).toBeVisible({ timeout: 20_000 });
  const deskCount = await page.evaluate(async () => {
    const response = await fetch("/api/v1/desks");
    const result = (await response.json()) as { data: unknown[] };
    return result.data.length;
  });
  await page.getByRole("button", { name: "Open demo controls" }).click();
  await page.getByRole("button", { name: "New agent joins" }).click();
  await expect(page.getByText("Kai Morgan").first()).toBeVisible();
  await expect
    .poll(async () => {
      const response = await page.request.get("/api/v1/desks");
      const result = (await response.json()) as { data: unknown[] };
      return result.data.length;
    })
    .toBe(deskCount + 1);
  await page.getByRole("button", { name: "Close details" }).click();
  await page.getByRole("button", { name: "Show agent list" }).click();
  await page.locator(".accessible-agent-list .agent-row").filter({ hasText: "Aria Chen" }).click();
  await expect(page.getByRole("complementary", { name: "Aria Chen details" })).toBeVisible();
});
