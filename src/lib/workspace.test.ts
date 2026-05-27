import { beforeEach, describe, expect, it } from "vitest";
import { mockInvoke, resetTauriMocks } from "@/test/tauri-mocks";
import {
  pathExists,
  workspaceCheckTemplates,
  workspaceInit,
  workspaceInitTemplate,
  type TemplateItemStatus,
  type WorkspaceInitResult,
} from "./workspace";

describe("workspace helpers", () => {
  beforeEach(() => {
    resetTauriMocks();
  });

  it("workspaceInit invokes the workspace_init command with the workspace path", async () => {
    const result: WorkspaceInitResult = {
      copied_dirs: [],
      copied_files: ["CLAUDE.md"],
      skipped: [],
    };
    mockInvoke.mockResolvedValueOnce(result);

    const workspace = "/tmp/demo-workspace";
    const response = await workspaceInit(workspace);

    expect(mockInvoke).toHaveBeenCalledWith("workspace_init", { workspace });
    expect(response).toEqual(result);
  });

  it("pathExists invokes path_exists and returns true for existing paths", async () => {
    mockInvoke.mockResolvedValueOnce(true);

    await expect(pathExists("/tmp/existing-file")).resolves.toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("path_exists", { path: "/tmp/existing-file" });
  });

  it("pathExists invokes path_exists and returns false for missing paths", async () => {
    mockInvoke.mockResolvedValueOnce(false);

    await expect(pathExists("/tmp/missing-file")).resolves.toBe(false);
    expect(mockInvoke).toHaveBeenCalledWith("path_exists", { path: "/tmp/missing-file" });
  });

  it("workspaceCheckTemplates invokes workspace_check_templates and returns template status data", async () => {
    const templates: TemplateItemStatus[] = [
      {
        name: "CLAUDE.md",
        is_dir: false,
        present: true,
      },
    ];
    mockInvoke.mockResolvedValueOnce(templates);

    const workspace = "/tmp/templated-workspace";
    const response = await workspaceCheckTemplates(workspace);

    expect(mockInvoke).toHaveBeenCalledWith("workspace_check_templates", { workspace });
    expect(response).toEqual(templates);
  });

  it("workspaceInitTemplate invokes workspace_init_template with workspace and template name", async () => {
    mockInvoke.mockResolvedValueOnce("Initialized CLAUDE.md");

    const workspace = "/tmp/project";
    const templateName = "CLAUDE.md";
    const response = await workspaceInitTemplate(workspace, templateName);

    expect(mockInvoke).toHaveBeenCalledWith("workspace_init_template", {
      workspace,
      templateName,
    });
    expect(response).toBe("Initialized CLAUDE.md");
  });

  it("propagates Tauri invoke errors from workspace helpers", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("workspace init failed"));

    await expect(workspaceInit("/tmp/project")).rejects.toThrow("workspace init failed");
  });
});
