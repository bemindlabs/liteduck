import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/settings";
import { createLogger } from "@/lib/logger";

const logger = createLogger("WorkspaceContext");

// ── Constants ─────────────────────────────────────────────────────────────────

export const MAX_RECENT_WORKSPACES = 5;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RemoteInfo {
  connectionId: string;
  profileId: string;
  profileName: string;
  host: string;
  username: string;
}

export interface RecentWorkspace {
  path: string;
  remote?: RemoteInfo;
}

interface WorkspaceContextValue {
  workspace: string;
  remoteInfo: RemoteInfo | null;
  recentWorkspaces: RecentWorkspace[];
  /** True while the initial settings load is in flight. */
  isLoading: boolean;
  setWorkspace: (path: string, remote?: RemoteInfo) => Promise<void>;
  removeFromRecent: (path: string) => Promise<void>;
  /**
   * Clear the in-memory workspace state without touching the settings DB.
   *
   * Intended for the post-reset flow: when `reset_all_settings` has already
   * wiped the SQLite `settings` table on the backend, the frontend's
   * in-memory workspace would otherwise still point at the old path until a
   * full reload, allowing `WorkspaceGate` to re-enter the stale workspace.
   * Resetting via `setWorkspace("")` would also re-write the empty path back
   * to the freshly-emptied DB and leak an empty entry into recent history,
   * which is why this is a separate method.
   */
  clearWorkspace: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspace, setWorkspaceState] = useState("");
  const [remoteInfo, setRemoteInfo] = useState<RemoteInfo | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load persisted values on mount
  useEffect(() => {
    void Promise.all([
      getSetting("workspace_directory").then((val) => {
        if (val) setWorkspaceState(val);
      }),
      getSetting("workspace_remote_info").then((val) => {
        if (val) {
          try {
            setRemoteInfo(JSON.parse(val) as RemoteInfo);
          } catch {
            // ignore
          }
        }
      }),
      getSetting("workspace_history").then((val) => {
        if (val) {
          try {
            const parsed: unknown = JSON.parse(val);
            if (Array.isArray(parsed)) {
              // Migrate old string[] format to RecentWorkspace[]
              const migrated: RecentWorkspace[] = (parsed as (string | RecentWorkspace)[]).map(
                (entry) => (typeof entry === "string" ? { path: entry } : entry),
              );
              setRecentWorkspaces(migrated);
            }
          } catch {
            // ignore malformed history
          }
        }
      }),
    ])
      .catch((err: unknown) => {
        logger.warn("Failed to load workspace settings", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const removeFromRecent = useCallback((path: string): Promise<void> => {
    setRecentWorkspaces((prev) => {
      const updated = prev.filter((w) => w.path !== path);
      void saveSetting("workspace_history", JSON.stringify(updated));
      return updated;
    });
    return Promise.resolve();
  }, []);

  const setWorkspace = useCallback(async (path: string, remote?: RemoteInfo) => {
    setWorkspaceState(path);
    setRemoteInfo(remote ?? null);
    await saveSetting("workspace_directory", path);
    await saveSetting("workspace_remote_info", remote ? JSON.stringify(remote) : "");

    setRecentWorkspaces((prev) => {
      const entry: RecentWorkspace = { path, remote };
      const updated = [entry, ...prev.filter((w) => w.path !== path)].slice(
        0,
        MAX_RECENT_WORKSPACES,
      );
      void saveSetting("workspace_history", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearWorkspace = useCallback(() => {
    // In-memory only — see clearWorkspace JSDoc on WorkspaceContextValue
    // for why we don't write through to the settings DB.
    setWorkspaceState("");
    setRemoteInfo(null);
    setRecentWorkspaces([]);
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        remoteInfo,
        recentWorkspaces,
        isLoading,
        setWorkspace,
        removeFromRecent,
        clearWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  }
  return ctx;
}
