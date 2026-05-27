import { test, expect } from "@playwright/test";
import { mockTauri } from "./tauri-mock";

test.describe("App Landing UI", () => {
  test.beforeEach(async ({ page }) => {
    await mockTauri(page);
    await page.goto("/landing");
  });

  test("should render without crash @smoke", async ({ page }) => {
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("should show LiteDuck branding", async ({ page }) => {
    await expect(page.getByText("LiteDuck").first()).toBeVisible();
  });

  test("should show workspace action buttons", async ({ page }) => {
    await expect(page.getByText("Open Workspace")).toBeVisible();
    await expect(page.getByText("Create New")).toBeVisible();
  });
});
