import { expect, test } from "@playwright/test";

test("built office renders under the production security policy", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(
    !process.env.PRODUCTION_RENDER_TEST,
    "Runs with the production Playwright configuration.",
  );
  const errors: string[] = [];
  await page.emulateMedia({ reducedMotion: "reduce" });
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
  const selector = page.getByRole("combobox", { name: "Office view" });
  await expect(selector).toHaveValue("isometric");
  const screenshots = new Set<string>();
  for (const view of ["isometric", "front", "left", "right", "top"]) {
    await selector.selectOption(view);
    await page.waitForTimeout(250);
    await expect(selector).toHaveValue(view);
    const image = await page
      .locator("canvas")
      .screenshot({ path: testInfo.outputPath(`${view}.png`) });
    await testInfo.attach(`${view}-view`, { body: image, contentType: "image/png" });
    screenshots.add(image.toString("base64"));
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.getByRole("button", { name: "Reset camera", exact: true }).click();
    await page.waitForTimeout(250);
    const resetImage = await page.locator("canvas").screenshot();
    const difference = await page.evaluate(
      async ([before, after]) => {
        const pixels = await Promise.all(
          [before, after].map(async (base64) => {
            const image = new Image();
            image.src = `data:image/png;base64,${base64}`;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Image inspection context is unavailable.");
            context.drawImage(image, 0, 0);
            return context.getImageData(0, 0, canvas.width, canvas.height).data;
          }),
        );
        let total = 0;
        for (let i = 0; i < pixels[0].length; i++) total += Math.abs(pixels[0][i] - pixels[1][i]);
        return total / pixels[0].length;
      },
      [image.toString("base64"), resetImage.toString("base64")],
    );
    expect(difference).toBeLessThan(1);
  }
  expect(screenshots.size).toBe(5);
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const savedCamera = await page.evaluate(
    () => JSON.parse(localStorage.getItem("agent-office-display") ?? "{}").state.cameraState,
  );
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Office view" })).toHaveValue("top");
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("agent-office-display") ?? "{}").state.cameraState,
      ),
    )
    .toEqual(savedCamera);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const sourceToggle = page.getByRole("checkbox", { name: "Show agent source" });
  await expect(sourceToggle).toBeChecked();
  await sourceToggle.uncheck();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Show agent source" })).not.toBeChecked();
});
