import { expect, test } from "@playwright/test";

test("built office renders under the production security policy", async ({ page }) => {
  test.skip(
    !process.env.PRODUCTION_RENDER_TEST,
    "Runs with the production Playwright configuration.",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const response = await page.goto("/");
  const policy = response?.headers()["content-security-policy"] ?? "";
  expect(policy).toContain("worker-src 'self' blob:");
  expect(policy).not.toContain("upgrade-insecure-requests");
  await expect(page.locator("canvas")).toBeVisible();
  // Suspense leaves only the clear color until the font worker finishes.
  await expect(async () => {
    const screenshot = await page.locator("canvas").screenshot();
    const colors = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image inspection context is unavailable.");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const values = new Set<string>();
      for (let i = 0; i < pixels.length; i += 400)
        values.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      return values.size;
    }, screenshot.toString("base64"));
    expect(colors).toBeGreaterThan(30);
    expect(errors).toEqual([]);
  }).toPass({ timeout: 30_000 });
});
