import { test, expect } from "@playwright/test";
import { mockTauri } from "./tauri-mock";

test.describe("Terminal Page", () => {
  test.beforeEach(async ({ page }) => {
    await mockTauri(page);
  });

  test("terminal page renders tab bar and controls @smoke", async ({ page }) => {
    await page.goto("/terminal");
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
    // Tab bar should be visible with at least the new-tab button
    await expect(page.getByTitle("New tab")).toBeVisible();
  });

  test("should create a new terminal tab", async ({ page }) => {
    await page.goto("/terminal");
    // Capture the initial tab count before clicking new tab
    const tabs = page.locator('[role="tab"]');
    const initialCount = await tabs.count();
    // Click the new tab button
    await page.getByTitle("New tab").click();
    // A tab should appear (the mock returns a session_id)
    await expect(tabs).toHaveCount(initialCount + 1);
  });

  test("should show tmux session picker when tmux sessions exist", async ({ page }) => {
    // Override terminal_list_tmux to return sessions
    await page.addInitScript(() => {
      const tauri = (window as Window & {
        __TAURI_INTERNALS__: {
          invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
        };
      }).__TAURI_INTERNALS__;
      const baseInvoke = tauri.invoke.bind(tauri);
      tauri.invoke = async (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === "terminal_list_tmux") {
          return [
            { name: "aidlc-0", windows: 1, created: "1700000000", attached: false },
            { name: "aidlc-1", windows: 2, created: "1700001000", attached: false },
          ];
        }
        return baseInvoke(cmd, args);
      };
    });
    await page.goto("/terminal");
    // Tmux sessions should be shown for restoration
    await expect(page.getByText("aidlc-0").or(page.getByText("Restore"))).toBeVisible({
      timeout: 5000,
    });
  });

  test("should close a terminal tab", async ({ page }) => {
    await page.goto("/terminal");
    // Create a tab first
    await page.getByTitle("New tab").click();
    const tabs = page.locator('[role="tab"]');
    await expect(tabs).toHaveCount(1);

    // Close the tab via the close button on the tab
    const closeBtn = page.locator('[role="tab"]').getByRole("button", { name: /close/i }).first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await expect(tabs).toHaveCount(0);
    }
  });

  test("should display split pane controls", async ({ page }) => {
    await page.goto("/terminal");
    // Split controls should be present (horizontal/vertical split buttons)
    const splitBtn = page.getByTitle(/split/i).first();
    await expect(splitBtn).toBeVisible();
  });

  test("terminal page redirects to scrum on non-native platforms", async ({ page }) => {
    // Override hasNativeCapabilities to return false
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        writable: false,
      });
    });
    await page.goto("/terminal");
    // Should redirect to scrum (catch-all for non-native)
    await page.waitForURL(/\/(scrum|landing)/);
  });
});
