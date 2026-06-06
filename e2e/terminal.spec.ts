import { test, expect } from "@playwright/test";
import { mockTauri } from "./tauri-mock";

test.describe("Terminal", () => {
  test.beforeEach(async ({ page }) => {
    await mockTauri(page);
  });

  // The terminal needs a native PTY, so its tab lifecycle can't be exercised in
  // a plain browser. We only smoke-test that the page renders without crashing
  // and shows its split controls.
  test("renders without crash @smoke", async ({ page }) => {
    await page.goto("/terminal");
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
    await expect(page.getByTitle(/split/i).first()).toBeVisible();
  });
});
