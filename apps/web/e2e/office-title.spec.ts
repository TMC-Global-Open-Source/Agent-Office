import { expect, test } from "@playwright/test";

test("office title changes immediately and survives a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Office title", exact: true });
  const original = await input.inputValue();
  await input.fill("Our agents at work.");
  await page.getByRole("button", { name: "Save provider settings" }).click();
  await expect(page.getByText("Provider settings saved.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Our agents at work.");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Our agents at work.");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(input).toHaveValue("Our agents at work.");
  await input.fill(original);
  await page.getByRole("button", { name: "Save provider settings" }).click();
  await expect(page.getByText("Provider settings saved.")).toBeVisible();
});
