import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ActivityRail } from "./ActivityRail";
import type { InstalledPlugin } from "@/lib/plugins";

function makePlugin(over: Partial<InstalledPlugin>): InstalledPlugin {
  return {
    id: "p",
    name: "P",
    version: "1",
    description: "",
    kind: "integration",
    commands: [],
    network: false,
    paths: [],
    dir: "/x",
    ...over,
  };
}

describe("ActivityRail pinned plugins", () => {
  it("renders a rail icon for each pinned plugin, with the plugin name as tooltip/label", () => {
    const pinned = [
      makePlugin({ id: "bwoc", name: "BWOC Orchestration", icon: "users", pinned: true }),
      makePlugin({ id: "jira", name: "Jira Cloud", icon: "square-kanban", pinned: true }),
    ];
    render(
      <ActivityRail
        active="files"
        onSelect={() => {}}
        pinnedPlugins={pinned}
        activePluginId={null}
        onSelectPlugin={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "BWOC Orchestration" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jira Cloud" })).toBeInTheDocument();
  });

  it("does not render rail icons when there are no pinned plugins", () => {
    render(<ActivityRail active="files" onSelect={() => {}} pinnedPlugins={[]} />);
    expect(screen.queryByRole("button", { name: "BWOC Orchestration" })).not.toBeInTheDocument();
    // The shared Plugins icon is always present.
    expect(screen.getByRole("button", { name: "Plugins" })).toBeInTheDocument();
  });

  it("calls onSelectPlugin with the plugin id when its icon is clicked", () => {
    const onSelectPlugin = vi.fn();
    const pinned = [makePlugin({ id: "bwoc", name: "BWOC", icon: "users", pinned: true })];
    render(
      <ActivityRail
        active="files"
        onSelect={() => {}}
        pinnedPlugins={pinned}
        activePluginId={null}
        onSelectPlugin={onSelectPlugin}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "BWOC" }));
    expect(onSelectPlugin).toHaveBeenCalledWith("bwoc");
  });

  it("highlights the rail icon of the active plugin page (aria-pressed)", () => {
    const pinned = [makePlugin({ id: "bwoc", name: "BWOC", icon: "users", pinned: true })];
    render(
      <ActivityRail
        active={null}
        onSelect={() => {}}
        pinnedPlugins={pinned}
        activePluginId="bwoc"
        onSelectPlugin={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "BWOC" })).toHaveAttribute("aria-pressed", "true");
  });
});
