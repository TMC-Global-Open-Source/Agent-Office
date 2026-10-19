import { expect, test } from "@playwright/test";

test("office canvas fills the available desktop height on resize", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const scene = page.locator(".scene-wrap");
  const canvas = scene.locator("canvas");
  await expect(canvas).toBeVisible();

  for (const height of [900, 1440, 768]) {
    await page.setViewportSize({ width: 1600, height });
    await expect
      .poll(async () => {
        const footer = await page.locator(".office-footer").boundingBox();
        return footer ? Math.abs(footer.y + footer.height - (height - 24)) : Infinity;
      })
      .toBeLessThan(2);
    await expect
      .poll(async () => {
        const bounds = await scene.boundingBox();
        const rendered = await canvas.boundingBox();
        return bounds && rendered ? Math.abs(rendered.height - (bounds.height - 2)) : Infinity;
      })
      .toBeLessThan(2);
    const bounds = await scene.boundingBox();
    expect(bounds!.height).toBeGreaterThan(height - 350);
  }

  await page.getByRole("button", { name: "Show agent list" }).click();
  await expect(page.locator(".accessible-agent-list")).toBeVisible();
  const listBounds = await scene.boundingBox();
  expect(listBounds!.y + listBounds!.height).toBeLessThan(768);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBounds = await scene.boundingBox();
  expect(mobileBounds!.height).toBeGreaterThanOrEqual(330);
  expect(mobileBounds!.width).toBeLessThanOrEqual(390);
  const rail = await page.locator(".right-rail").boundingBox();
  expect(rail!.y).toBeGreaterThan(mobileBounds!.y + mobileBounds!.height);
});
