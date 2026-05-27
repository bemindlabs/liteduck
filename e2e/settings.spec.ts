import { test, expect } from "@playwright/test";
import { mockTauri } from "./tauri-mock";

test.describe("Wizard OpenClaw Step", () => {
  test.beforeEach(async ({ page }) => {
    await mockTauri(page);
    await page.goto("/wizard");
  });

  test("should show OpenClaw step in wizard @smoke", async ({ page }) => {
    // Click through Welcome step
    await page.getByText("Let's get started").click();
    // Should show OpenClaw Gateway step with mascot
    await expect(page.getByText("OpenClaw Gateway").first()).toBeVisible();
    await expect(page.locator('img[alt="OpenClaw"]').first()).toBeVisible();
  });

  test("should show Gateway URL input", async ({ page }) => {
    await page.getByText("Let's get started").click();
    await expect(page.getByPlaceholder("http://localhost:18789")).toBeVisible();
  });
});

test.describe("Settings Plugins Panel", () => {
  test.beforeEach(async ({ page }) => {
    await mockTauri(page);
    await page.addInitScript(() => {
      const plugins = [
        {
          id: "plugin-github",
          name: "GitHub Integration",
          description: "Connects to GitHub API for issues and PRs",
          enabled: true,
          version: "1.2.0",
          plugin_type: "integration",
        },
        {
          id: "plugin-slack",
          name: "Slack Notifications",
          description: "Send notifications to Slack channels",
          enabled: false,
          version: "0.9.1",
          plugin_type: "channel",
        },
      ];

      const tauri = (
        window as Window & {
          __TAURI_INTERNALS__: {
            invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__;
      const baseInvoke = tauri.invoke.bind(tauri);

      tauri.invoke = async (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === "get_setting") {
          if (args?.key === "workspace_directory") return "/tmp/mock-workspace";
          if (args?.key === "wizard_completed") return "true";
          if (args?.key === "openclaw_gateway_url") return "http://127.0.0.1:18789";
          if (args?.key === "openclaw_token") return "test-token";
          return null;
        }

        if (cmd === "get_settings") {
          return {
            workspace_directory: "/tmp/mock-workspace",
            openclaw_gateway_url: "http://127.0.0.1:18789",
          };
        }

        if (cmd === "get_secrets") {
          return { openclaw_token: "test-token" };
        }

        if (cmd === "openclaw_list_plugins") {
          return plugins.map((plugin) => ({ ...plugin }));
        }

        if (cmd === "openclaw_toggle_plugin") {
          const plugin = plugins.find((entry) => entry.id === args?.pluginId);
          if (plugin) {
            plugin.enabled = Boolean(args?.enabled);
          }

          return {
            success: true,
            message: plugin?.enabled ? "Plugin enabled" : "Plugin disabled",
          };
        }

        return baseInvoke(cmd, args);
      };
    });

    await page.goto("/settings");
  });

  test("lists installed plugins and updates plugin state after toggling", async ({ page }) => {
    await expect(page.getByText("Settings").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Plugins" })).toBeVisible();
    await expect(page.getByText("GitHub Integration")).toBeVisible();
    await expect(page.getByText("Slack Notifications")).toBeVisible();
    await expect(page.getByText("v1.2.0")).toBeVisible();
    await expect(page.getByText("channel", { exact: true })).toBeVisible();

    const slackToggle = page.getByRole("switch", { name: /enable slack notifications/i });
    await expect(slackToggle).toHaveAttribute("aria-checked", "false");

    await slackToggle.click();

    await expect(
      page.getByRole("switch", { name: /disable slack notifications/i }),
    ).toHaveAttribute("aria-checked", "true");
  });
});
