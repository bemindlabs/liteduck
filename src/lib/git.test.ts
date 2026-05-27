import { describe, it, expect, beforeEach } from "vitest";
import { mockInvoke, resetTauriMocks } from "@/test/tauri-mocks";
import {
  gitStatus,
  gitLog,
  gitDiffWorking,
  gitDiffCommit,
  gitCurrentBranch,
  gitListBranches,
  gitWorktreeList,
  gitWorktreeAdd,
  gitWorktreeRemove,
  gitWorktreePrune,
  gitInit,
  shortOid,
  relativeTime,
  statusFileCount,
  type GitStatus,
  type GitCommit,
  type GitDiffResult,
  type WorktreeInfo,
} from "./git";

const repoPath = "/home/user/projects/myapp";

const status: GitStatus = {
  modified: ["src/main.ts", "src/app.ts"],
  added: ["src/new-feature.ts"],
  deleted: ["src/old.ts"],
  renamed: [["src/old-name.ts", "src/new-name.ts"]],
  untracked: ["tmp/scratch.ts"],
};

const commit: GitCommit = {
  oid: "abc1234567890def1234567890def1234567890de",
  message: "feat: add login page",
  author: "Alice Dev",
  author_email: "alice@example.com",
  time: "2024-03-01T12:00:00Z",
  parents: ["def456789"],
};

const diffResult: GitDiffResult = {
  files: [
    { path: "src/main.ts", status: "modified", old_path: null },
    { path: "src/added.ts", status: "added", old_path: null },
    { path: "src/old.ts", status: "deleted", old_path: null },
  ],
  hunks: {
    "src/main.ts": [
      {
        header: "@@ -1,3 +1,4 @@",
        old_start: 1,
        old_lines: 3,
        new_start: 1,
        new_lines: 4,
        lines: [
          { content: " unchanged", origin: " ", old_lineno: 1, new_lineno: 1 },
          { content: "+added line", origin: "+", old_lineno: null, new_lineno: 2 },
          { content: "-removed line", origin: "-", old_lineno: 2, new_lineno: null },
        ],
      },
    ],
  },
};

const worktree: WorktreeInfo = {
  path: "/home/user/projects/myapp-feature",
  branch: "feat/new-feature",
  head: "abc1234",
  is_main: false,
  is_dirty: false,
};

describe("git helpers", () => {
  beforeEach(() => {
    resetTauriMocks();
  });

  // ── gitStatus ──────────────────────────────────────────────────────────────

  describe("gitStatus", () => {
    it("returns repository status", async () => {
      mockInvoke.mockResolvedValueOnce(status);

      const result = await gitStatus(repoPath);

      expect(result).toEqual(status);
      expect(mockInvoke).toHaveBeenCalledWith("git_status", { repoPath });
    });

    it("returns empty status for a clean repo", async () => {
      const clean: GitStatus = {
        modified: [],
        added: [],
        deleted: [],
        renamed: [],
        untracked: [],
      };
      mockInvoke.mockResolvedValueOnce(clean);

      const result = await gitStatus(repoPath);

      expect(result).toEqual(clean);
    });

    it("propagates invoke errors", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("not a git repository"));

      await expect(gitStatus(repoPath)).rejects.toThrow("not a git repository");
    });
  });

  // ── gitLog ─────────────────────────────────────────────────────────────────

  describe("gitLog", () => {
    it("returns commit history", async () => {
      mockInvoke.mockResolvedValueOnce([commit]);

      const result = await gitLog(repoPath);

      expect(result).toEqual([commit]);
      expect(mockInvoke).toHaveBeenCalledWith("git_log", { repoPath, maxCount: null });
    });

    it("passes maxCount when provided", async () => {
      mockInvoke.mockResolvedValueOnce([commit]);

      await gitLog(repoPath, 50);

      expect(mockInvoke).toHaveBeenCalledWith("git_log", { repoPath, maxCount: 50 });
    });

    it("passes null when maxCount is omitted", async () => {
      mockInvoke.mockResolvedValueOnce([]);

      await gitLog(repoPath);

      expect(mockInvoke).toHaveBeenCalledWith("git_log", { repoPath, maxCount: null });
    });

    it("returns empty array for repo with no commits", async () => {
      mockInvoke.mockResolvedValueOnce([]);

      const result = await gitLog(repoPath, 10);

      expect(result).toEqual([]);
    });

    it("propagates invoke errors", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("no commits yet"));

      await expect(gitLog(repoPath)).rejects.toThrow("no commits yet");
    });
  });

  // ── gitDiffWorking ─────────────────────────────────────────────────────────

  describe("gitDiffWorking", () => {
    it("returns working tree diff", async () => {
      mockInvoke.mockResolvedValueOnce(diffResult);

      const result = await gitDiffWorking(repoPath);

      expect(result).toEqual(diffResult);
      expect(mockInvoke).toHaveBeenCalledWith("git_diff_working", { repoPath });
    });

    it("returns empty diff for clean working tree", async () => {
      const emptyDiff: GitDiffResult = { files: [], hunks: {} };
      mockInvoke.mockResolvedValueOnce(emptyDiff);

      const result = await gitDiffWorking(repoPath);

      expect(result).toEqual(emptyDiff);
    });

    it("propagates invoke errors", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("repo locked"));

      await expect(gitDiffWorking(repoPath)).rejects.toThrow("repo locked");
    });
  });

  // ── gitDiffCommit ──────────────────────────────────────────────────────────

  describe("gitDiffCommit", () => {
    it("returns diff for the given commit OID", async () => {
      mockInvoke.mockResolvedValueOnce(diffResult);

      const result = await gitDiffCommit(repoPath, commit.oid);

      expect(result).toEqual(diffResult);
      expect(mockInvoke).toHaveBeenCalledWith("git_diff_commit", { repoPath, oid: commit.oid });
    });

    it("propagates invoke errors", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("commit not found"));

      await expect(gitDiffCommit(repoPath, "badoid")).rejects.toThrow("commit not found");
    });
  });

  // ── gitCurrentBranch ───────────────────────────────────────────────────────

  describe("gitCurrentBranch", () => {
    it("returns the current branch name", async () => {
      mockInvoke.mockResolvedValueOnce("feat/new-feature");

      const result = await gitCurrentBranch(repoPath);

      expect(result).toBe("feat/new-feature");
      expect(mockInvoke).toHaveBeenCalledWith("git_current_branch", { repoPath });
    });

    it("propagates invoke errors", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("HEAD is detached"));

      await expect(gitCurrentBranch(repoPath)).rejects.toThrow("HEAD is detached");
    });
  });

  // ── gitListBranches ────────────────────────────────────────────────────────

  describe("gitListBranches", () => {
    it("returns list of branch names", async () => {
      const branches = ["main", "develop", "feat/new-feature"];
      mockInvoke.mockResolvedValueOnce(branches);

      const result = await gitListBranches(repoPath);

      expect(result).toEqual(branches);
      expect(mockInvoke).toHaveBeenCalledWith("git_list_branches", { repoPath });
    });

    it("returns single branch for new repo", async () => {
      mockInvoke.mockResolvedValueOnce(["main"]);

      const result = await gitListBranches(repoPath);

      expect(result).toEqual(["main"]);
    });

    it("propagates invoke errors", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("invalid repo"));

      await expect(gitListBranches(repoPath)).rejects.toThrow("invalid repo");
    });
  });

  // ── gitWorktreeList ────────────────────────────────────────────────────────

  describe("gitWorktreeList", () => {
    it("returns list of worktrees", async () => {
      const mainWorktree: WorktreeInfo = {
        path: repoPath,
        branch: "main",
        head: "abc1234",
        is_main: true,
        is_dirty: false,
      };
      mockInvoke.mockResolvedValueOnce([mainWorktree, worktree]);

      const result = await gitWorktreeList(repoPath);

      expect(result).toEqual([mainWorktree, worktree]);
      expect(mockInvoke).toHaveBeenCalledWith("git_worktree_list", { repoPath });
    });

    it("propagates invoke errors", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("not a git repo"));

      await expect(gitWorktreeList(repoPath)).rejects.toThrow("not a git repo");
    });
  });

  // ── gitWorktreeAdd ─────────────────────────────────────────────────────────

  describe("gitWorktreeAdd", () => {
    it("adds a worktree for an existing branch", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await expect(
        gitWorktreeAdd(repoPath, "/tmp/worktrees/feature", "feat/login", false),
      ).resolves.toBeUndefined();

      expect(mockInvoke).toHaveBeenCalledWith("git_worktree_add", {
        repoPath,
        path: "/tmp/worktrees/feature",
        branch: "feat/login",
        createBranch: false,
      });
    });

    it("creates a new branch while adding a worktree", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await gitWorktreeAdd(repoPath, "/tmp/worktrees/new", "feat/new", true);

      expect(mockInvoke).toHaveBeenCalledWith("git_worktree_add", {
        repoPath,
        path: "/tmp/worktrees/new",
        branch: "feat/new",
        createBranch: true,
      });
    });

    it("propagates invoke errors", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("branch already checked out"));

      await expect(gitWorktreeAdd(repoPath, "/tmp/worktrees/dup", "main", false)).rejects.toThrow(
        "branch already checked out",
      );
    });
  });

  // ── gitWorktreeRemove ──────────────────────────────────────────────────────

  describe("gitWorktreeRemove", () => {
    it("removes the specified worktree", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await expect(gitWorktreeRemove(repoPath, "/tmp/worktrees/feature")).resolves.toBeUndefined();

      expect(mockInvoke).toHaveBeenCalledWith("git_worktree_remove", {
        repoPath,
        path: "/tmp/worktrees/feature",
      });
    });

    it("propagates invoke errors", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("worktree is dirty"));

      await expect(gitWorktreeRemove(repoPath, "/tmp/dirty")).rejects.toThrow("worktree is dirty");
    });
  });

  // ── gitWorktreePrune ───────────────────────────────────────────────────────

  describe("gitWorktreePrune", () => {
    it("prunes stale worktrees", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await expect(gitWorktreePrune(repoPath)).resolves.toBeUndefined();

      expect(mockInvoke).toHaveBeenCalledWith("git_worktree_prune", { repoPath });
    });

    it("propagates invoke errors", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("permission denied"));

      await expect(gitWorktreePrune(repoPath)).rejects.toThrow("permission denied");
    });
  });

  // ── gitInit ────────────────────────────────────────────────────────────────

  describe("gitInit", () => {
    it("initialises a new repository", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await expect(gitInit("/tmp/new-project")).resolves.toBeUndefined();

      expect(mockInvoke).toHaveBeenCalledWith("git_init", { path: "/tmp/new-project" });
    });

    it("propagates invoke errors", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("directory already a git repo"));

      await expect(gitInit("/existing-repo")).rejects.toThrow("directory already a git repo");
    });
  });

  // ── Utility helpers ────────────────────────────────────────────────────────

  describe("shortOid", () => {
    it("returns first 7 characters of a full OID", () => {
      expect(shortOid("abc1234567890abcdef")).toBe("abc1234");
    });

    it("handles a short OID gracefully", () => {
      expect(shortOid("abc12")).toBe("abc12");
    });

    it("handles exactly 7 characters", () => {
      expect(shortOid("abc1234")).toBe("abc1234");
    });

    it("handles a full 40-char SHA", () => {
      expect(shortOid("a".repeat(40))).toBe("aaaaaaa");
    });
  });

  describe("relativeTime", () => {
    const now = new Date();

    it("returns seconds ago for very recent timestamps", () => {
      const recent = new Date(now.getTime() - 30_000).toISOString();
      expect(relativeTime(recent)).toMatch(/^\d+s ago$/);
    });

    it("returns minutes ago", () => {
      const twoMinsAgo = new Date(now.getTime() - 2 * 60_000).toISOString();
      expect(relativeTime(twoMinsAgo)).toBe("2m ago");
    });

    it("returns hours ago", () => {
      const threeHoursAgo = new Date(now.getTime() - 3 * 3600_000).toISOString();
      expect(relativeTime(threeHoursAgo)).toBe("3h ago");
    });

    it("returns days ago", () => {
      const twoDaysAgo = new Date(now.getTime() - 2 * 86400_000).toISOString();
      expect(relativeTime(twoDaysAgo)).toBe("2d ago");
    });

    it("returns months ago", () => {
      const twoMonthsAgo = new Date(now.getTime() - 65 * 86400_000).toISOString();
      expect(relativeTime(twoMonthsAgo)).toBe("2mo ago");
    });

    it("returns years ago", () => {
      const twoYearsAgo = new Date(now.getTime() - 730 * 86400_000).toISOString();
      expect(relativeTime(twoYearsAgo)).toBe("2y ago");
    });
  });

  describe("statusFileCount", () => {
    it("counts all changed file categories", () => {
      expect(statusFileCount(status)).toBe(6); // 2 modified + 1 added + 1 deleted + 1 renamed + 1 untracked
    });

    it("returns 0 for a clean status", () => {
      const clean: GitStatus = {
        modified: [],
        added: [],
        deleted: [],
        renamed: [],
        untracked: [],
      };
      expect(statusFileCount(clean)).toBe(0);
    });

    it("counts only modified files", () => {
      const onlyModified: GitStatus = {
        modified: ["a.ts", "b.ts", "c.ts"],
        added: [],
        deleted: [],
        renamed: [],
        untracked: [],
      };
      expect(statusFileCount(onlyModified)).toBe(3);
    });

    it("counts only untracked files", () => {
      const onlyUntracked: GitStatus = {
        modified: [],
        added: [],
        deleted: [],
        renamed: [],
        untracked: ["x.ts", "y.ts"],
      };
      expect(statusFileCount(onlyUntracked)).toBe(2);
    });

    it("counts multiple renames", () => {
      const withRenames: GitStatus = {
        modified: [],
        added: [],
        deleted: [],
        renamed: [
          ["a.ts", "b.ts"],
          ["c.ts", "d.ts"],
        ],
        untracked: [],
      };
      expect(statusFileCount(withRenames)).toBe(2);
    });
  });
});
