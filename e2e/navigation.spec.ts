import { test, expect } from "@playwright/test";
import { mockTauri } from "./tauri-mock";

test.describe("App Landing & Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockTauri(page);
  });

  test("should load without crash @smoke", async ({ page }) => {
    await page.goto("/");
    // Should NOT show error boundary
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
    // Should show landing page or app
    await expect(page.getByText("LiteDuck").first()).toBeVisible();
  });

  test("should show wizard page", async ({ page }) => {
    await page.goto("/wizard");
    await expect(page.getByText("Welcome to LiteDuck")).toBeVisible();
    await expect(page.getByText("Let's get started")).toBeVisible();
  });
});
