import { expect, test } from "@playwright/test";

test("idle delay can be saved and reloaded in Office settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const delay = page.getByRole("spinbutton", { name: "Idle delay (seconds)", exact: true });
  await expect(delay).toHaveValue("20");
  await delay.fill("35");
  await page.getByRole("button", { name: "Save provider settings" }).click();
  await expect(page.getByText("Provider settings saved.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(delay).toHaveValue("35");
  await delay.fill("20");
  await page.getByRole("button", { name: "Save provider settings" }).click();
  await expect(page.getByText("Provider settings saved.")).toBeVisible();
});
