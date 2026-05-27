import { useCallback, useEffect, useState } from "react";
import {
  Folder,
  GitBranch,
  Trash2,
  AlertTriangle,
  FolderOpen,
  MonitorSmartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace, type RecentWorkspace } from "@/contexts/WorkspaceContext";
import { gitCurrentBranch } from "@/lib/git";
import { invoke } from "@tauri-apps/api/core";

// ── Types ────────────────────────────────────────────────────────────────────

interface WorkspaceMeta {
  path: string;
  folderName: string;
  exists: boolean;
  gitBranch: string | null;
  loading: boolean;
  remote?: RecentWorkspace["remote"];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function folderName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

async function checkPathExists(path: string): Promise<boolean> {
  try {
    return await invoke<boolean>("path_exists", { path });
  } catch {
    return false;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function RecentWorkspaces() {
  const { recentWorkspaces, setWorkspace, removeFromRecent } = useWorkspace();
  const [metas, setMetas] = useState<WorkspaceMeta[]>([]);

  // Resolve metadata for each workspace path
  useEffect(() => {
    if (recentWorkspaces.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMetas([]);
      return;
    }

    // Initialize with loading state
    setMetas(
      recentWorkspaces.map((w) => ({
        path: w.path,
        folderName: folderName(w.path),
        exists: true,
        gitBranch: null,
        loading: true,
        remote: w.remote,
      })),
    );

    // Fetch metadata in parallel (fire-and-forget per item is intentional)
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    recentWorkspaces.forEach(async (w, idx) => {
      // Skip existence check for remote workspaces
      if (w.remote) {
        setMetas((prev) => {
          const next = [...prev];
          if (next[idx]?.path === w.path) {
            next[idx] = { ...next[idx], exists: true, loading: false };
          }
          return next;
        });
        return;
      }

      const exists = await checkPathExists(w.path);
      let gitBranch: string | null = null;

      if (exists) {
        try {
          gitBranch = await gitCurrentBranch(w.path);
        } catch {
          // Not a git repo — that's fine
        }
      }

      setMetas((prev) => {
        const next = [...prev];
        if (next[idx]?.path === w.path) {
          next[idx] = {
            ...next[idx],
            exists,
            gitBranch,
            loading: false,
          };
        }
        return next;
      });
    });
  }, [recentWorkspaces]);

  const handleOpen = useCallback(
    (meta: WorkspaceMeta) => {
      if (!meta.exists) return;
      void setWorkspace(meta.path, meta.remote ?? undefined);
    },
    [setWorkspace],
  );

  const handleRemove = useCallback(
    (path: string) => {
      void removeFromRecent(path);
    },
    [removeFromRecent],
  );

  // ── Empty state ──────────────────────────────────────────────────────────

  if (recentWorkspaces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center">
        <FolderOpen className="h-10 w-10 text-[var(--color-muted-foreground)] opacity-40" />
        <div>
          <p className="text-sm font-medium text-[var(--color-muted-foreground)]">
            No recent workspaces
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)] opacity-70">
            Open a workspace to get started. It will appear here for quick access.
          </p>
        </div>
      </div>
    );
  }

  // ── Card list ────────────────────────────────────────────────────────────

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {metas.map((meta) => (
        <div
          key={meta.path}
          className={cn(
            "group relative flex flex-col gap-2 rounded-lg border border-[var(--color-border)] p-4",
            "transition-colors",
            meta.exists
              ? "cursor-pointer hover:border-[var(--color-accent-foreground)] hover:bg-[var(--color-accent)]"
              : "cursor-default opacity-50",
          )}
          onClick={() => handleOpen(meta)}
          role="button"
          tabIndex={meta.exists ? 0 : -1}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleOpen(meta);
            }
          }}
        >
          {/* Remove button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRemove(meta.path);
            }}
            className={cn(
              "absolute right-2 top-2 rounded-md p-1",
              "text-[var(--color-muted-foreground)] opacity-0 transition-opacity",
              "hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]",
              "group-hover:opacity-100 focus:opacity-100",
            )}
            aria-label={`Remove ${meta.folderName} from recent`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          {/* Folder name + icon */}
          <div className="flex items-center gap-2">
            {meta.remote ? (
              <MonitorSmartphone className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
            ) : meta.exists ? (
              <Folder className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-500" />
            )}
            <span className="truncate text-sm font-semibold text-[var(--color-foreground)]">
              {meta.folderName}
            </span>
          </div>

          {/* Full path */}
          <p className="truncate text-xs text-[var(--color-muted-foreground)]">{meta.path}</p>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-3 text-[10px] text-[var(--color-muted-foreground)]">
            {meta.loading ? (
              <span className="animate-pulse">Loading...</span>
            ) : (
              <>
                {meta.remote && (
                  <span className="flex items-center gap-1 text-[var(--color-primary)]">
                    <MonitorSmartphone className="h-3 w-3" />
                    {meta.remote.username}@{meta.remote.host}
                  </span>
                )}
                {meta.gitBranch && (
                  <span className="flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    <span className="max-w-[120px] truncate">{meta.gitBranch}</span>
                  </span>
                )}
                {!meta.exists && (
                  <span className="flex items-center gap-1 text-yellow-500">
                    <AlertTriangle className="h-3 w-3" />
                    Directory not found
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
