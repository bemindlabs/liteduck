import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

import type { InstalledPlugin } from "@/lib/plugins";

// Keep an open workspace out of the picture — assert the param plumbing only.
vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({ workspace: "" }),
}));

// OutputView pulls in Markdown/mermaid; stub it so we test the form, not the renderer.
vi.mock("./views/OutputView", () => ({
  OutputView: ({ raw }: { raw: string }) => <div data-testid="output">{raw}</div>,
}));

// Mock the plugins lib so we can spy on the run call + control the installed list.
const pluginRunCommand = vi.fn();
const pluginList = vi.fn();
vi.mock("@/lib/plugins", () => ({
  pluginRunCommand: (...args: unknown[]) => pluginRunCommand(...args),
  pluginList: () => pluginList(),
  pluginInstall: vi.fn(),
  pluginInstallFromRegistry: vi.fn(),
  pluginUninstall: vi.fn(),
  pluginRegistryFetch: vi.fn(),
  pluginUiUrl: (id: string) => `plugin://localhost/${id}/`,
  pluginOpenExternal: vi.fn(),
}));

import { PluginsPanel } from "./PluginsPanel";

/** A jira-shaped plugin: a `list` (default, has args) + a `view` (has `issue` arg). */
const jiraPlugin: InstalledPlugin = {
  id: "jira",
  name: "Jira Cloud",
  version: "0.1.0",
  description: "Read-only Jira",
  kind: "integration",
  network: true,
  paths: [],
  dir: "/tmp/jira",
  surface: "page",
  commands: [
    {
      id: "jira.list",
      title: "Jira: List Issues (JQL)",
      run: "sh jira.sh list",
      args: ["assignee", "project", "jql", "max_results"],
      view: "table",
      default: true,
    },
    { id: "jira.view", title: "Jira: View Issue", run: "sh jira.sh view", args: ["issue"] },
  ],
};

describe("PluginsPanel command toolbar", () => {
  beforeEach(() => {
    pluginRunCommand.mockReset();
    pluginRunCommand.mockResolvedValue({ stdout: "{}", stderr: "", exit_code: 0 });
    pluginList.mockReset();
    pluginList.mockResolvedValue([jiraPlugin]);
  });

  it("auto-runs the default command on open (lands on data, not an empty prompt)", async () => {
    render(<PluginsPanel initialPluginId="jira" />);
    await waitFor(() => {
      expect(pluginRunCommand).toHaveBeenCalledWith("jira", "jira.list", undefined, undefined);
    });
  });

  it("shows short command labels and keeps arg inputs hidden until expanded", async () => {
    render(<PluginsPanel initialPluginId="jira" />);
    // Toolbar uses the compact label (no "Jira:" prefix).
    expect(await screen.findByRole("button", { name: /View Issue/ })).toBeInTheDocument();
    // The `issue` input is not rendered until its command is expanded.
    expect(screen.queryByLabelText("Issue")).not.toBeInTheDocument();
  });

  it("expands a command's inline form on click", async () => {
    const user = userEvent.setup();
    render(<PluginsPanel initialPluginId="jira" />);
    await user.click(await screen.findByRole("button", { name: /View Issue/ }));
    expect(await screen.findByLabelText("Issue")).toBeInTheDocument();
  });

  it("passes filled arg values as params to the run call", async () => {
    const user = userEvent.setup();
    render(<PluginsPanel initialPluginId="jira" />);

    await user.click(await screen.findByRole("button", { name: /View Issue/ }));
    await user.type(await screen.findByLabelText("Issue"), "PROJ-123");
    await user.click(screen.getByRole("button", { name: /^Run$/ }));

    await waitFor(() => {
      expect(pluginRunCommand).toHaveBeenCalledWith(
        "jira",
        "jira.view",
        { issue: "PROJ-123" },
        undefined,
      );
    });
  });

  it("seeds the Assignee filter with 'me' by default and submits it", async () => {
    const user = userEvent.setup();
    render(<PluginsPanel initialPluginId="jira" />);

    // Expanding the list command shows the Assignee filter pre-filled with "me".
    await user.click(await screen.findByRole("button", { name: /List Issues/ }));
    expect(await screen.findByLabelText("Assignee")).toHaveValue("me");

    // Submitting with only the seeded default → just { assignee: "me" } (the
    // empty project/jql/max_results are dropped so the script's defaults apply).
    await user.click(screen.getByRole("button", { name: /^Run$/ }));
    await waitFor(() => {
      expect(pluginRunCommand).toHaveBeenCalledWith(
        "jira",
        "jira.list",
        { assignee: "me" },
        undefined,
      );
    });
  });

  it("passes a project (board) filter alongside the assignee default", async () => {
    const user = userEvent.setup();
    render(<PluginsPanel initialPluginId="jira" />);

    await user.click(await screen.findByRole("button", { name: /List Issues/ }));
    await user.type(await screen.findByLabelText("Project"), "ALE");
    await user.click(screen.getByRole("button", { name: /^Run$/ }));

    await waitFor(() => {
      expect(pluginRunCommand).toHaveBeenCalledWith(
        "jira",
        "jira.list",
        { assignee: "me", project: "ALE" },
        undefined,
      );
    });
  });

  it("renders the executable-UI host frame when the plugin declares `ui`", async () => {
    const jiraUiPlugin: InstalledPlugin = {
      ...jiraPlugin,
      ui: { entry: "ui.js", fallback: "declarative" },
    };
    pluginList.mockResolvedValue([jiraUiPlugin]);
    render(<PluginsPanel initialPluginId="jira" />);

    // The plugin's own UI iframe is shown instead of the declarative toolbar,
    // sandboxed to scripts-only (opaque origin — no host/Tauri access).
    const frame = await screen.findByTitle("Jira Cloud UI");
    expect(frame).toBeInTheDocument();
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(screen.queryByRole("button", { name: /View Issue/ })).not.toBeInTheDocument();
  });

  it("notifies the host when the installed set changes (uninstall)", async () => {
    const user = userEvent.setup();
    const onPluginsChanged = vi.fn();
    render(<PluginsPanel initialPluginId="jira" onPluginsChanged={onPluginsChanged} />);

    // Page mode exposes an Uninstall control in the detail header.
    await user.click(await screen.findByRole("button", { name: /Uninstall/ }));

    await waitFor(() => expect(onPluginsChanged).toHaveBeenCalled());
  });
});
