import { expect, test } from "@playwright/test";

test("profile picker saves a color across refresh and page reload", async ({ page }) => {
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.goto("/");
  const aria = page.locator(".roster-item").filter({ hasText: "Aria Chen" });
  await aria.click();
  const profile = page.getByRole("complementary", { name: "Aria Chen details" });
  const picker = profile.getByLabel("Avatar color");
  const initialColor = await picker.inputValue();
  const chosen = initialColor === "#ad42ef" ? "#43b7d9" : "#ad42ef";
  await picker.fill(chosen);
  await profile.getByRole("button", { name: "Save color", exact: true }).click();
  await expect(profile.getByRole("status")).toHaveText("Agent color saved.");
  await expect(aria.locator(".roster-avatar")).toHaveCSS(
    "background-color",
    chosen === "#ad42ef" ? "rgb(173, 66, 239)" : "rgb(67, 183, 217)",
  );
  await profile.getByRole("button", { name: "Close details" }).click();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.reload();
  await aria.click();
  await expect(picker).toHaveValue(chosen);
});
