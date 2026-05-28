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
      args: ["jql", "max_results"],
      view: "table",
      default: true,
    },
    { id: "jira.view", title: "Jira: View Issue", run: "sh jira.sh view", args: ["issue"] },
  ],
};

describe("PluginsPanel param form", () => {
  beforeEach(() => {
    pluginRunCommand.mockReset();
    pluginRunCommand.mockResolvedValue({ stdout: "{}", stderr: "", exit_code: 0 });
    pluginList.mockReset();
    pluginList.mockResolvedValue([jiraPlugin]);
  });

  it("renders one labeled input per command arg", async () => {
    render(<PluginsPanel initialPluginId="jira" />);
    // The view command's `issue` input, and the list command's `jql`/`max_results`.
    expect(await screen.findByLabelText("Issue")).toBeInTheDocument();
    expect(screen.getByLabelText("Jql")).toBeInTheDocument();
    expect(screen.getByLabelText("Max Results")).toBeInTheDocument();
  });

  it("passes filled arg values as params to the run call", async () => {
    const user = userEvent.setup();
    render(<PluginsPanel initialPluginId="jira" />);

    const issueInput = await screen.findByLabelText("Issue");
    await user.type(issueInput, "PROJ-123");

    // Submit the `view` command's form via its Run button.
    await user.click(screen.getByRole("button", { name: /Jira: View Issue/ }));

    await waitFor(() => {
      expect(pluginRunCommand).toHaveBeenCalledWith(
        "jira",
        "jira.view",
        { issue: "PROJ-123" },
        undefined,
      );
    });
  });

  it("drops empty args so the script's own defaults apply", async () => {
    const user = userEvent.setup();
    render(<PluginsPanel initialPluginId="jira" />);

    await screen.findByLabelText("Issue");
    // Submit the list command with nothing filled → empty params object.
    await user.click(screen.getByRole("button", { name: /Jira: List Issues/ }));

    await waitFor(() => {
      expect(pluginRunCommand).toHaveBeenCalledWith("jira", "jira.list", {}, undefined);
    });
  });
});
