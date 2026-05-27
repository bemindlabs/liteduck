import { describe, it, expect, beforeEach } from "vitest";
import {
  mockInvoke,
  mockInvokeResponse,
  mockInvokeError,
  resetTauriMocks,
} from "@/test/tauri-mocks";
import {
  homeDir,
  homeEnsure,
  homeProfileRead,
  homeProfileWrite,
  homeConfigRead,
  homeConfigWrite,
  homeResolveConfig,
  workspaceConfigRead,
  workspaceConfigWrite,
  homeWorkspacesList,
  homeWorkspacesUpdate,
  homeMemoryList,
  homeMemoryRead,
  homeMemoryWrite,
  homeMemoryDelete,
  homeMemorySearch,
  homeTemplatesList,
  homeMigrationCheck,
  homeMigrationRun,
  type Config,
  type WorkspaceRegistry,
  type HomeMemoryNote,
  type HomeMemoryNoteSummary,
  type NewHomeMemoryNote,
  type TemplateInfo,
  type MigrationStatus,
  type MigrationResult,
} from "./home";

const WS = "/home/user/.LiteDuck";

const makeConfig = (): Config => ({
  appearance: {
    theme: "dark",
    font_family: "monospace",
    font_size: 14,
    sidebar_position: "left",
    sidebar_collapsed: false,
  },
  terminal: {
    shell: "/bin/zsh",
    env: {},
    scrollback: 1000,
  },
  git: {
    auto_fetch: true,
    fetch_interval_secs: 300,
    sign_commits: false,
  },
  telemetry: {
    enabled: true,
    anonymous: true,
  },
});

const makeRegistry = (): WorkspaceRegistry => ({
  version: 1,
  active: "/home/user/project",
  workspaces: [
    {
      path: "/home/user/project",
      name: "My Project",
      last_opened: "2026-04-01T00:00:00Z",
      pinned: true,
      tags: ["rust"],
    },
  ],
});

const makeMemoryNote = (): HomeMemoryNote => ({
  slug: "my-note",
  title: "My Note",
  type: "user",
  tags: ["typescript"],
  related: [],
  created: "2026-04-01T00:00:00Z",
  updated: "2026-04-01T00:00:00Z",
  body: "This is a note.",
});

describe("home IPC wrappers", () => {
  beforeEach(() => {
    resetTauriMocks();
  });

  // ── homeDir ────────────────────────────────────────────────────────────────

  describe("homeDir", () => {
    it("invokes home_dir_path and returns path string", async () => {
      mockInvokeResponse("home_dir_path", WS);

      const result = await homeDir();

      expect(mockInvoke).toHaveBeenCalledWith("home_dir_path");
      expect(result).toBe(WS);
    });

    it("propagates errors", async () => {
      mockInvokeError("home_dir_path", "home dir unavailable");

      await expect(homeDir()).rejects.toThrow("home dir unavailable");
    });
  });

  // ── homeEnsure ─────────────────────────────────────────────────────────────

  describe("homeEnsure", () => {
    it("invokes home_ensure", async () => {
      mockInvokeResponse("home_ensure", undefined);

      await homeEnsure();

      expect(mockInvoke).toHaveBeenCalledWith("home_ensure");
    });

    it("propagates errors", async () => {
      mockInvokeError("home_ensure", "permission denied");

      await expect(homeEnsure()).rejects.toThrow("permission denied");
    });
  });

  // ── homeProfileRead ────────────────────────────────────────────────────────

  describe("homeProfileRead", () => {
    it("invokes home_profile_read and returns markdown content", async () => {
      const md = "# My Profile\n\nI am a developer.";
      mockInvokeResponse("home_profile_read", md);

      const result = await homeProfileRead();

      expect(mockInvoke).toHaveBeenCalledWith("home_profile_read");
      expect(result).toBe(md);
    });

    it("propagates errors", async () => {
      mockInvokeError("home_profile_read", "file not found");

      await expect(homeProfileRead()).rejects.toThrow("file not found");
    });
  });

  // ── homeProfileWrite ───────────────────────────────────────────────────────

  describe("homeProfileWrite", () => {
    it("invokes home_profile_write with content", async () => {
      mockInvokeResponse("home_profile_write", undefined);
      const md = "# Updated Profile";

      await homeProfileWrite(md);

      expect(mockInvoke).toHaveBeenCalledWith("home_profile_write", { content: md });
    });

    it("propagates errors", async () => {
      mockInvokeError("home_profile_write", "write failed");

      await expect(homeProfileWrite("content")).rejects.toThrow("write failed");
    });
  });

  // ── homeConfigRead ─────────────────────────────────────────────────────────

  describe("homeConfigRead", () => {
    it("invokes home_config_read and returns Config", async () => {
      const config = makeConfig();
      mockInvokeResponse("home_config_read", config);

      const result = await homeConfigRead();

      expect(mockInvoke).toHaveBeenCalledWith("home_config_read");
      expect(result).toEqual(config);
    });

    it("propagates errors", async () => {
      mockInvokeError("home_config_read", "parse error");

      await expect(homeConfigRead()).rejects.toThrow("parse error");
    });
  });

  // ── homeConfigWrite ────────────────────────────────────────────────────────

  describe("homeConfigWrite", () => {
    it("invokes home_config_write with config", async () => {
      const config = makeConfig();
      mockInvokeResponse("home_config_write", undefined);

      await homeConfigWrite(config);

      expect(mockInvoke).toHaveBeenCalledWith("home_config_write", { config });
    });

    it("propagates errors", async () => {
      mockInvokeError("home_config_write", "disk full");

      await expect(homeConfigWrite(makeConfig())).rejects.toThrow("disk full");
    });
  });

  // ── homeResolveConfig ──────────────────────────────────────────────────────

  describe("homeResolveConfig", () => {
    it("invokes home_resolve_config with workspace path", async () => {
      const config = makeConfig();
      mockInvokeResponse("home_resolve_config", config);

      const result = await homeResolveConfig("/home/user/project");

      expect(mockInvoke).toHaveBeenCalledWith("home_resolve_config", {
        workspace: "/home/user/project",
      });
      expect(result).toEqual(config);
    });

    it("sends null when workspace is omitted", async () => {
      mockInvokeResponse("home_resolve_config", makeConfig());

      await homeResolveConfig();

      expect(mockInvoke).toHaveBeenCalledWith("home_resolve_config", { workspace: null });
    });

    it("sends null when workspace is explicitly undefined", async () => {
      mockInvokeResponse("home_resolve_config", makeConfig());

      await homeResolveConfig(undefined);

      expect(mockInvoke).toHaveBeenCalledWith("home_resolve_config", { workspace: null });
    });

    it("propagates errors", async () => {
      mockInvokeError("home_resolve_config", "config merge error");

      await expect(homeResolveConfig("/ws")).rejects.toThrow("config merge error");
    });
  });

  // ── workspaceConfigRead ────────────────────────────────────────────────────

  describe("workspaceConfigRead", () => {
    it("returns partial config object when override exists", async () => {
      const partial = { appearance: { theme: "light" } };
      mockInvokeResponse("workspace_config_read", partial);

      const result = await workspaceConfigRead("/home/user/project");

      expect(mockInvoke).toHaveBeenCalledWith("workspace_config_read", {
        workspace: "/home/user/project",
      });
      expect(result).toEqual(partial);
    });

    it("returns null when no workspace override file exists", async () => {
      mockInvokeResponse("workspace_config_read", null);

      const result = await workspaceConfigRead("/home/user/new-project");

      expect(result).toBeNull();
    });

    it("propagates errors", async () => {
      mockInvokeError("workspace_config_read", "permission denied");

      await expect(workspaceConfigRead("/restricted")).rejects.toThrow("permission denied");
    });
  });

  // ── workspaceConfigWrite ───────────────────────────────────────────────────

  describe("workspaceConfigWrite", () => {
    it("invokes workspace_config_write with workspace and config", async () => {
      const partial = { appearance: { theme: "solarized" } };
      mockInvokeResponse("workspace_config_write", undefined);

      await workspaceConfigWrite("/home/user/project", partial);

      expect(mockInvoke).toHaveBeenCalledWith("workspace_config_write", {
        workspace: "/home/user/project",
        config: partial,
      });
    });

    it("propagates errors", async () => {
      mockInvokeError("workspace_config_write", "write error");

      await expect(workspaceConfigWrite("/ws", {})).rejects.toThrow("write error");
    });
  });

  // ── homeWorkspacesList ─────────────────────────────────────────────────────

  describe("homeWorkspacesList", () => {
    it("invokes home_workspaces_list and returns registry", async () => {
      const registry = makeRegistry();
      mockInvokeResponse("home_workspaces_list", registry);

      const result = await homeWorkspacesList();

      expect(mockInvoke).toHaveBeenCalledWith("home_workspaces_list");
      expect(result).toEqual(registry);
    });

    it("propagates errors", async () => {
      mockInvokeError("home_workspaces_list", "registry corrupt");

      await expect(homeWorkspacesList()).rejects.toThrow("registry corrupt");
    });
  });

  // ── homeWorkspacesUpdate ───────────────────────────────────────────────────

  describe("homeWorkspacesUpdate", () => {
    it("invokes home_workspaces_update with registry", async () => {
      const registry = makeRegistry();
      mockInvokeResponse("home_workspaces_update", undefined);

      await homeWorkspacesUpdate(registry);

      expect(mockInvoke).toHaveBeenCalledWith("home_workspaces_update", { registry });
    });

    it("propagates errors", async () => {
      mockInvokeError("home_workspaces_update", "write failed");

      await expect(homeWorkspacesUpdate(makeRegistry())).rejects.toThrow("write failed");
    });
  });

  // ── homeMemoryList ─────────────────────────────────────────────────────────

  describe("homeMemoryList", () => {
    it("invokes home_memory_list and returns summaries", async () => {
      const summaries: HomeMemoryNoteSummary[] = [
        {
          slug: "my-note",
          title: "My Note",
          type: "user",
          tags: ["ts"],
          created: "2026-04-01T00:00:00Z",
        },
      ];
      mockInvokeResponse("home_memory_list", summaries);

      const result = await homeMemoryList();

      expect(mockInvoke).toHaveBeenCalledWith("home_memory_list");
      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe("my-note");
    });

    it("returns empty array when no notes exist", async () => {
      mockInvokeResponse("home_memory_list", []);

      const result = await homeMemoryList();

      expect(result).toEqual([]);
    });

    it("propagates errors", async () => {
      mockInvokeError("home_memory_list", "read error");

      await expect(homeMemoryList()).rejects.toThrow("read error");
    });
  });

  // ── homeMemoryRead ─────────────────────────────────────────────────────────

  describe("homeMemoryRead", () => {
    it("invokes home_memory_read with slug and returns note", async () => {
      const note = makeMemoryNote();
      mockInvokeResponse("home_memory_read", note);

      const result = await homeMemoryRead("my-note");

      expect(mockInvoke).toHaveBeenCalledWith("home_memory_read", { slug: "my-note" });
      expect(result).toEqual(note);
    });

    it("propagates errors when slug not found", async () => {
      mockInvokeError("home_memory_read", "note not found");

      await expect(homeMemoryRead("unknown")).rejects.toThrow("note not found");
    });
  });

  // ── homeMemoryWrite ────────────────────────────────────────────────────────

  describe("homeMemoryWrite", () => {
    it("invokes home_memory_write with note and returns generated slug", async () => {
      const newNote: NewHomeMemoryNote = {
        title: "New Note",
        type: "reference",
        tags: ["rust"],
        related: [],
        body: "Rust notes.",
      };
      mockInvokeResponse("home_memory_write", "new-note");

      const slug = await homeMemoryWrite(newNote);

      expect(mockInvoke).toHaveBeenCalledWith("home_memory_write", { note: newNote });
      expect(slug).toBe("new-note");
    });

    it("propagates errors for duplicate slug", async () => {
      mockInvokeError("home_memory_write", "note already exists");

      const note: NewHomeMemoryNote = {
        title: "Dupe",
        type: "user",
        tags: [],
        related: [],
        body: "",
      };
      await expect(homeMemoryWrite(note)).rejects.toThrow("already exists");
    });
  });

  // ── homeMemoryDelete ───────────────────────────────────────────────────────

  describe("homeMemoryDelete", () => {
    it("invokes home_memory_delete with slug", async () => {
      mockInvokeResponse("home_memory_delete", undefined);

      await homeMemoryDelete("my-note");

      expect(mockInvoke).toHaveBeenCalledWith("home_memory_delete", { slug: "my-note" });
    });

    it("propagates errors", async () => {
      mockInvokeError("home_memory_delete", "delete failed");

      await expect(homeMemoryDelete("my-note")).rejects.toThrow("delete failed");
    });
  });

  // ── homeMemorySearch ───────────────────────────────────────────────────────

  describe("homeMemorySearch", () => {
    it("invokes home_memory_search with query and returns results", async () => {
      const summaries: HomeMemoryNoteSummary[] = [
        {
          slug: "rust-note",
          title: "Rust Tips",
          type: "reference",
          tags: ["rust"],
          created: "2026-04-01T00:00:00Z",
        },
      ];
      mockInvokeResponse("home_memory_search", summaries);

      const result = await homeMemorySearch("rust");

      expect(mockInvoke).toHaveBeenCalledWith("home_memory_search", { query: "rust" });
      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe("rust-note");
    });

    it("returns empty array when no results match", async () => {
      mockInvokeResponse("home_memory_search", []);

      const result = await homeMemorySearch("xyznonexistent");

      expect(result).toEqual([]);
    });
  });

  // ── homeTemplatesList ──────────────────────────────────────────────────────

  describe("homeTemplatesList", () => {
    it("invokes home_templates_list and returns templates", async () => {
      const templates: TemplateInfo[] = [
        { name: "default", source: "bundled", path: "/app/templates/default.md" },
        {
          name: "custom",
          source: "user",
          path: "/home/user/.LiteDuck/templates/workspace/custom.md",
        },
      ];
      mockInvokeResponse("home_templates_list", templates);

      const result = await homeTemplatesList();

      expect(mockInvoke).toHaveBeenCalledWith("home_templates_list");
      expect(result).toHaveLength(2);
      expect(result[0].source).toBe("bundled");
      expect(result[1].source).toBe("user");
    });

    it("propagates errors", async () => {
      mockInvokeError("home_templates_list", "templates dir missing");

      await expect(homeTemplatesList()).rejects.toThrow("templates dir missing");
    });
  });

  // ── homeMigrationCheck ─────────────────────────────────────────────────────

  describe("homeMigrationCheck", () => {
    it("invokes home_migration_check and returns migration status", async () => {
      const status: MigrationStatus = {
        settings_db_exists: true,
        automations_db_exists: false,
        mcp_db_exists: false,
        already_migrated: false,
        settings_count: 5,
        automations_count: 0,
        mcp_servers_count: 0,
      };
      mockInvokeResponse("home_migration_check", status);

      const result = await homeMigrationCheck();

      expect(mockInvoke).toHaveBeenCalledWith("home_migration_check");
      expect(result.settings_db_exists).toBe(true);
      expect(result.already_migrated).toBe(false);
    });

    it("propagates errors", async () => {
      mockInvokeError("home_migration_check", "db read error");

      await expect(homeMigrationCheck()).rejects.toThrow("db read error");
    });
  });

  // ── homeMigrationRun ───────────────────────────────────────────────────────

  describe("homeMigrationRun", () => {
    it("invokes home_migration_run and returns migration result", async () => {
      const migResult: MigrationResult = {
        settings_migrated: 5,
        automations_migrated: 0,
        mcp_servers_migrated: 0,
        workspaces_migrated: 2,
        errors: [],
        archived_files: ["/home/user/.config/settings.db.bak.1234"],
      };
      mockInvokeResponse("home_migration_run", migResult);

      const result = await homeMigrationRun();

      expect(mockInvoke).toHaveBeenCalledWith("home_migration_run");
      expect(result.settings_migrated).toBe(5);
      expect(result.errors).toHaveLength(0);
    });

    it("reports partial errors in result", async () => {
      const migResult: MigrationResult = {
        settings_migrated: 3,
        automations_migrated: 0,
        mcp_servers_migrated: 0,
        workspaces_migrated: 1,
        errors: ["could not read automations row 4"],
        archived_files: [],
      };
      mockInvokeResponse("home_migration_run", migResult);

      const result = await homeMigrationRun();

      expect(result.errors).toHaveLength(1);
    });

    it("propagates errors", async () => {
      mockInvokeError("home_migration_run", "migration failed");

      await expect(homeMigrationRun()).rejects.toThrow("migration failed");
    });
  });
});
