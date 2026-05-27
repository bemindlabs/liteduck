import { useState, useEffect, useCallback } from "react";
import { GitBranch, FileEdit, History, LayoutGrid, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { gitCurrentBranch, gitScanRepos, gitStatus, type ScannedRepo } from "@/lib/git";
import { getSetting } from "@/lib/settings";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { ChangesTab } from "./git/ChangesTab";
import { HistoryTab } from "./git/HistoryTab";
import { WorktreesTab } from "./git/WorktreesTab";

// ── Types ─────────────────────────────────────────────────────────────────────

type TabId = "changes" | "history" | "worktrees";

// ── GitPage ───────────────────────────────────────────────────────────────────

export default function GitPage() {
  const { workspace } = useWorkspace();
  const [tab, setTab] = useState<TabId>("changes");
  const [branch, setBranch] = useState("");
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [repoError, setRepoError] = useState<string | null>(null);

  // Multi-repo state
  const [repos, setRepos] = useState<ScannedRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<ScannedRepo | null>(null);
  const [dirtyRepos, setDirtyRepos] = useState(new Set<string>());
  const [scanning, setScanning] = useState(false);

  const repoPath = selectedRepo?.path ?? null;

  const checkDirtyStatus = useCallback(async (foundRepos: ScannedRepo[]) => {
    const dirty = new Set<string>();
    await Promise.allSettled(
      foundRepos.map(async (repo) => {
        try {
          const status = await gitStatus(repo.path);
          const isDirty =
            status.modified.length > 0 ||
            status.added.length > 0 ||
            status.deleted.length > 0 ||
            status.renamed.length > 0 ||
            status.untracked.length > 0;
          if (isDirty) dirty.add(repo.path);
        } catch {
          // ignore per-repo errors
        }
      }),
    );
    setDirtyRepos(dirty);
  }, []);

  /** Load user-configured exclude patterns from settings. */
  const loadExcludes = useCallback(async (): Promise<string[]> => {
    try {
      const raw = await getSetting("git_scan_exclude_patterns");
      if (!raw) return [];
      return raw
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }, []);

  // Scan for repos when workspace changes
  useEffect(() => {
    if (!workspace) return;
    void (async () => {
      setRepoError(null);
      setScanning(true);
      try {
        const excludes = await loadExcludes();
        const found = await gitScanRepos(workspace, undefined, excludes);
        setRepos(found);
        if (found.length === 0) {
          setRepoError("No git repositories found in this workspace.");
          setSelectedRepo(null);
        } else {
          setSelectedRepo((prev) => {
            if (prev && found.some((r) => r.path === prev.path)) return prev;
            return found[0];
          });
          void checkDirtyStatus(found);
        }
      } catch (err) {
        setRepoError(`Failed to scan repos: ${String(err)}`);
        setRepos([]);
        setSelectedRepo(null);
      } finally {
        setScanning(false);
      }
    })();
  }, [workspace, loadExcludes, checkDirtyStatus]);

  // Load current branch when selected repo changes
  useEffect(() => {
    if (!repoPath) return;
    gitCurrentBranch(repoPath)
      .then(setBranch)
      .catch(() => setBranch("unknown"));
  }, [repoPath, refreshSignal]);

  // Auto-refresh on page focus
  const handleFocus = useCallback(() => {
    setRefreshSignal((n) => n + 1);
  }, []);

  useEffect(() => {
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [handleFocus]);

  const handleRefresh = () => setRefreshSignal((n) => n + 1);

  const handleRescan = () => {
    if (!workspace) return;
    setScanning(true);
    loadExcludes()
      .then((excludes) => gitScanRepos(workspace, undefined, excludes))
      .then((found) => {
        setRepos(found);
        if (found.length === 0) {
          setRepoError("No git repositories found in this workspace.");
          setSelectedRepo(null);
        } else {
          setSelectedRepo((prev) => {
            if (prev && found.some((r) => r.path === prev.path)) return prev;
            return found[0];
          });
          setRepoError(null);
          void checkDirtyStatus(found);
        }
      })
      .catch((err: unknown) => setRepoError(`Failed to scan repos: ${String(err)}`))
      .finally(() => setScanning(false));
  };

  const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    {
      id: "changes",
      label: "Changes",
      icon: <FileEdit className="h-3.5 w-3.5" />,
    },
    {
      id: "history",
      label: "History",
      icon: <History className="h-3.5 w-3.5" />,
    },
    {
      id: "worktrees",
      label: "Worktrees",
      icon: <LayoutGrid className="h-3.5 w-3.5" />,
    },
  ];

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {/* Page header */}
      <div className="flex items-center gap-2">
        <GitBranch className="h-5 w-5 text-[var(--color-primary)]" />
        <h2 className="text-base font-semibold text-[var(--color-foreground)]">Git</h2>

        {/* Rescan button */}
        <button
          type="button"
          onClick={handleRescan}
          disabled={scanning}
          className="rounded p-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-accent)] transition-colors disabled:opacity-50"
          title="Rescan workspace for git repos"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", scanning && "animate-spin")} />
        </button>
      </div>

      {repoError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 px-3 py-2 text-[13px] text-destructive bg-destructive-subtle">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {repoError}
        </div>
      )}

      {/* Repo tab bar */}
      {repos.length > 0 && (
        <div
          role="tablist"
          aria-label="Repositories"
          className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-border)]"
        >
          {repos.map((repo) => (
            <button
              key={repo.path}
              role="tab"
              aria-selected={selectedRepo?.path === repo.path}
              type="button"
              onClick={() => {
                setSelectedRepo(repo);
                setRefreshSignal((n) => n + 1);
              }}
              title={repo.relative_path}
              className={cn(
                "relative shrink-0 flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
                selectedRepo?.path === repo.path
                  ? "border-[var(--color-foreground)] text-[var(--color-foreground)]"
                  : "border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
              )}
            >
              {repo.name}
              {selectedRepo?.path === repo.path && branch && (
                <span className="text-[10px] font-mono text-[var(--color-muted-foreground)] ml-1">
                  ({branch})
                </span>
              )}
              {dirtyRepos.has(repo.path) && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] shrink-0"
                  aria-label="uncommitted changes"
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Changes / History / Worktrees tabs */}
      <div
        role="tablist"
        aria-label="Git views"
        className="flex gap-1 border-b border-[var(--color-border)]"
      >
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 pb-2 text-[13px] font-medium transition-colors",
              tab === id
                ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                : "border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Empty state when no repo is selected */}
      {!repoPath && repos.length > 0 && (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
          Select a repository above to view its details.
        </div>
      )}

      {/* Tab panels */}
      <div className="flex flex-1 min-h-0">
        {repoPath && tab === "changes" && (
          <ChangesTab
            repoPath={repoPath}
            branch={branch}
            onRefresh={handleRefresh}
            refreshSignal={refreshSignal}
          />
        )}
        {repoPath && tab === "history" && (
          <HistoryTab
            repoPath={repoPath}
            branch={branch}
            onRefresh={handleRefresh}
            refreshSignal={refreshSignal}
          />
        )}
        {repoPath && tab === "worktrees" && (
          <WorktreesTab repoPath={repoPath} refreshSignal={refreshSignal} />
        )}
      </div>
    </div>
  );
}
