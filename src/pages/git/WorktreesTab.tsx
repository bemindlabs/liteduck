import { useState, useEffect, useCallback, useRef, type RefObject } from "react";
import {
  GitBranch,
  RefreshCw,
  AlertCircle,
  Loader2,
  LayoutGrid,
  Terminal,
  Star,
  Plus,
  Trash2,
  Scissors,
  Check,
  X,
  FolderOpen,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useFileDrop, FILE_DROP_ACTIVE_CLASS } from "@/hooks";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { PageLoading } from "@/components/ui/skeleton";
import {
  gitListBranches,
  gitWorktreeList,
  gitWorktreeAdd,
  gitWorktreeRemove,
  gitWorktreePrune,
  shortOid,
  type WorktreeInfo,
} from "@/lib/git";
import { useWorkspace } from "@/contexts/WorkspaceContext";

// ── WorktreeCard ──────────────────────────────────────────────────────────────

interface WorktreeCardProps {
  worktree: WorktreeInfo;
  onOpenTerminal: (path: string, branch: string) => void;
  onRemove: (path: string) => void;
}

export function WorktreeCard({ worktree, onOpenTerminal, onRemove }: WorktreeCardProps) {
  const pathParts = worktree.path.replace(/\\/g, "/").split("/");
  const dirName =
    pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2] || worktree.path;
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { setWorkspace } = useWorkspace();

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3">
      {/* Header row */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="truncate font-mono text-[13px] font-medium text-[var(--color-foreground)]"
              title={worktree.path}
            >
              {dirName}
            </span>
            {worktree.is_main && (
              <span className="flex items-center gap-1 rounded-full bg-[var(--color-secondary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]">
                <Star className="h-2.5 w-2.5" />
                Main
              </span>
            )}
          </div>
          <p
            className="mt-0.5 truncate font-mono text-[11px] text-[var(--color-muted-foreground)]"
            title={worktree.path}
          >
            {worktree.path}
          </p>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-4 text-[12px] text-[var(--color-muted-foreground)]">
        <span className="flex items-center gap-1.5 min-w-0">
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
          <span className="truncate font-medium text-[var(--color-foreground)]">
            {worktree.branch || "detached HEAD"}
          </span>
        </span>
        {worktree.head && (
          <span className="font-mono text-[11px] text-[var(--color-muted-foreground)] shrink-0">
            {shortOid(worktree.head)}
          </span>
        )}
        <span
          className={cn(
            "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
            worktree.is_dirty
              ? "bg-yellow-400/15 text-yellow-500"
              : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
          )}
        >
          {worktree.is_dirty ? "dirty" : "clean"}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-0.5">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-[12px]"
          onClick={() => onOpenTerminal(worktree.path, worktree.branch)}
          title={`Open terminal in ${worktree.path}`}
        >
          <Terminal className="h-3.5 w-3.5" />
          Open in Terminal
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-[12px]"
          onClick={() => setWorkspace(worktree.path)}
          title={`Set workspace to ${worktree.path}`}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Open as Workspace
        </Button>

        {!worktree.is_main && !confirmRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-7 w-7 text-[var(--color-muted-foreground)] hover:text-destructive"
            onClick={() => setConfirmRemove(true)}
            title="Remove worktree"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}

        {!worktree.is_main && confirmRemove && (
          <div className="ml-auto flex items-center gap-1">
            <span className="text-[11px] text-[var(--color-muted-foreground)]">Remove?</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={() => {
                setConfirmRemove(false);
                onRemove(worktree.path);
              }}
              title="Confirm remove"
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-[var(--color-muted-foreground)]"
              onClick={() => setConfirmRemove(false)}
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── AddWorktreeDialog ─────────────────────────────────────────────────────────

interface AddWorktreeDialogProps {
  repoPath: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddWorktreeDialog({ repoPath, onClose, onSuccess }: AddWorktreeDialogProps) {
  const [path, setPath] = useState("");
  const { ref: pathDropRef, isDragOver: pathDrag } = useFileDrop((p) => setPath(p));
  const [branchInput, setBranchInput] = useState("");
  const [createBranch, setCreateBranch] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gitListBranches(repoPath)
      .then(setBranches)
      .catch(() => setBranches([])); // Fallback: show empty branches on git error
  }, [repoPath]);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!path.trim() || !branchInput.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await gitWorktreeAdd(repoPath, path.trim(), branchInput.trim(), createBranch);
      onSuccess();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Add Worktree"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[min(420px,95vw)] rounded-xl border border-[var(--color-border)] p-5 shadow-xl"
        style={{ backgroundColor: "var(--color-popover)" }}
      >
        <h3 className="mb-4 text-[14px] font-semibold text-[var(--color-foreground)]">
          Add Worktree
        </h3>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Path */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Path
            </label>
            <input
              ref={pathDropRef as RefObject<HTMLInputElement>}
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/path/to/new/worktree"
              className={cn(
                "rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-[13px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]",
                pathDrag && FILE_DROP_ACTIVE_CLASS,
              )}
              autoFocus
            />
          </div>

          {/* Create new branch toggle */}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={createBranch}
              onChange={(e) => setCreateBranch(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-primary)]"
            />
            <span className="text-[12px] text-[var(--color-foreground)]">Create new branch</span>
          </label>

          {/* Branch */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
              {createBranch ? "New branch name" : "Branch"}
            </label>
            {createBranch ? (
              <input
                type="text"
                value={branchInput}
                onChange={(e) => setBranchInput(e.target.value)}
                placeholder="feature/my-branch"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-[13px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            ) : (
              <Select value={branchInput} onChange={(e) => setBranchInput(e.target.value)}>
                <option value="">Select a branch…</option>
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-1.5 rounded border border-destructive/30 p-2 text-[11px] text-destructive bg-destructive-subtle">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="break-words">{error}</span>
            </div>
          )}

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !path.trim() || !branchInput.trim()}
              className="gap-1.5"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Add Worktree
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── WorktreesTab ──────────────────────────────────────────────────────────────

interface WorktreesTabProps {
  repoPath: string;
  refreshSignal: number;
}

export function WorktreesTab({ repoPath, refreshSignal }: WorktreesTabProps) {
  const navigate = useNavigate();
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [pruneSuccess, setPruneSuccess] = useState(false);
  const pruneTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Clean up prune success timer on unmount
  useEffect(() => () => clearTimeout(pruneTimerRef.current), []);

  const load = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const result = await gitWorktreeList(repoPath);
      setWorktrees(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const handleOpenTerminal = useCallback(
    (cwd: string, branch: string) => {
      const label = branch ? `wt: ${branch}` : (cwd.split("/").pop() ?? cwd);
      window.dispatchEvent(new CustomEvent("aidlc:terminal:open-at", { detail: { cwd, label } }));
      void navigate(ROUTES.TERMINAL);
    },
    [navigate],
  );

  const handleRemove = useCallback(
    async (path: string) => {
      setError(null);
      try {
        await gitWorktreeRemove(repoPath, path);
        await load();
      } catch (err) {
        setError(String(err));
      }
    },
    [repoPath, load],
  );

  const handlePrune = useCallback(async () => {
    setPruning(true);
    setError(null);
    setPruneSuccess(false);
    try {
      await gitWorktreePrune(repoPath);
      setPruneSuccess(true);
      await load();
      clearTimeout(pruneTimerRef.current);
      pruneTimerRef.current = setTimeout(() => setPruneSuccess(false), 2500);
    } catch (err) {
      setError(String(err));
    } finally {
      setPruning(false);
    }
  }, [repoPath, load]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[12px] text-[var(--color-muted-foreground)]">
          {worktrees.length > 0
            ? `${worktrees.length} worktree${worktrees.length !== 1 ? "s" : ""}`
            : ""}
        </span>

        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-7 gap-1.5 text-[12px]"
          onClick={() => setShowAddDialog(true)}
          disabled={loading}
          title="Add worktree"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Worktree
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className={cn("h-7 gap-1.5 text-[12px]", pruneSuccess && "text-success")}
          onClick={handlePrune}
          disabled={pruning || loading}
          title="Prune stale worktrees"
        >
          {pruning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : pruneSuccess ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Scissors className="h-3.5 w-3.5" />
          )}
          {pruneSuccess ? "Pruned" : "Prune Stale"}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={load}
          title="Refresh worktrees"
          disabled={loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-1.5 rounded-md border border-destructive/30 p-3 text-[12px] text-destructive bg-destructive-subtle">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      {loading && worktrees.length === 0 && <PageLoading />}

      {!loading && worktrees.length === 0 && !error && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
          <LayoutGrid className="h-8 w-8 text-[var(--color-muted-foreground)]" />
          <div>
            <p className="text-[13px] font-medium text-[var(--color-foreground)]">
              No additional worktrees
            </p>
            <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">
              Click "Add Worktree" to create one.
            </p>
          </div>
        </div>
      )}

      {worktrees.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {worktrees.map((wt) => (
            <WorktreeCard
              key={wt.path}
              worktree={wt}
              onOpenTerminal={handleOpenTerminal}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      {showAddDialog && (
        <AddWorktreeDialog
          repoPath={repoPath}
          onClose={() => setShowAddDialog(false)}
          onSuccess={load}
        />
      )}
    </div>
  );
}
