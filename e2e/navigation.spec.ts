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

  test("should show landing page with workspace options", async ({ page }) => {
    await page.goto("/landing");
    await expect(page.getByText("Open Workspace")).toBeVisible();
    await expect(page.getByText("Create New")).toBeVisible();
    await expect(page.getByText("Connect Remote")).toBeVisible();
  });

  test("should show wizard page", async ({ page }) => {
    await page.goto("/wizard");
    await expect(page.getByText("Welcome to LiteDuck")).toBeVisible();
    await expect(page.getByText("Let's get started")).toBeVisible();
  });

  test("should show OpenClaw ready feature on wizard", async ({ page }) => {
    await page.goto("/wizard");
    await expect(page.getByText("OpenClaw ready")).toBeVisible();
  });
});
