import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getSetting, saveSetting } from "@/lib/settings";
import {
  getCurrentWindowLabel,
  listWindows,
  readUrlWindowLabel,
  readUrlWorkspace,
  setWindowWorkspace,
} from "@/lib/window";
import { hasNativeCapabilities } from "@/lib/platform";
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

  // The Tauri label of this window. Used to scope workspace persistence so
  // each window can point at a different workspace without overwriting the
  // others. Falls back to "main" on web / first-window-before-IPC-resolves.
  const windowLabelRef = useRef(readUrlWindowLabel() ?? "main");

  // Snapshot the `?workspace=` query at render time so a BrowserRouter
  // catch-all `<Navigate replace>` (e.g. when the entry URL is
  // `/index.html?workspace=...`) can't drop the query before `useEffect`
  // gets to read it.
  const initialUrlWorkspaceRef = useRef(readUrlWorkspace());

  // Whether this is a secondary window (opened via `window_open`, so the entry
  // URL carries `?window=<label>`). Only the bundled main window lacks it.
  // Secondary windows must NOT inherit the legacy global `workspace_directory`
  // setting — a "New Window with Workspace…" is opened with no workspace
  // precisely so the user can pick one, and falling back to the global setting
  // would silently reopen the previous workspace and skip the picker entirely.
  const isSecondaryWindowRef = useRef(readUrlWindowLabel() !== null);

  // Load persisted values on mount.
  //
  // Resolution order for THIS window's workspace:
  //   1. `?workspace=` URL query param (new windows opened via window_open)
  //   2. `~/.liteduck/windows.json` entry for this window's label
  //   3. Legacy global `workspace_directory` setting — ONLY for the main
  //      window. Secondary windows stop at (2): an empty result there means
  //      "show the workspace picker" (WorkspaceGate → /landing), not "reuse
  //      the last global workspace".
  useEffect(() => {
    const native = hasNativeCapabilities();

    const resolveWindowLabel = native
      ? getCurrentWindowLabel()
          .then((label) => {
            windowLabelRef.current = label;
            return label;
          })
          .catch(() => windowLabelRef.current)
      : Promise.resolve(windowLabelRef.current);

    const resolveWorkspace = (async () => {
      // (1) URL param wins (captured at render time — see ref comment above).
      const fromUrl = initialUrlWorkspaceRef.current;
      if (fromUrl) {
        setWorkspaceState(fromUrl);
        return;
      }

      if (!native) {
        // Web / iOS: only the global setting exists.
        const val = await getSetting("workspace_directory");
        if (val) setWorkspaceState(val);
        return;
      }

      // (2) Per-window registry.
      const label = await resolveWindowLabel;
      try {
        const windows = await listWindows();
        const entry = windows.find((w) => w.label === label);
        if (entry?.workspace) {
          setWorkspaceState(entry.workspace);
          return;
        }
      } catch (err: unknown) {
        logger.warn("Failed to read windows registry", err);
      }

      // Secondary window with no workspace → leave empty so WorkspaceGate
      // routes to the /landing picker. Do NOT fall through to the global
      // setting, or "New Window with Workspace…" would silently reopen the
      // previous workspace.
      if (isSecondaryWindowRef.current) {
        return;
      }

      // (3) Legacy fallback — main window only.
      const val = await getSetting("workspace_directory");
      if (val) setWorkspaceState(val);
    })();

    const remoteInfoLoad = getSetting("workspace_remote_info").then((val) => {
      if (val) {
        try {
          setRemoteInfo(JSON.parse(val) as RemoteInfo);
        } catch {
          // ignore
        }
      }
    });

    const historyLoad = getSetting("workspace_history").then((val) => {
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
    });

    void Promise.all([resolveWorkspace, remoteInfoLoad, historyLoad])
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

    // Per-window persistence (multi-window). Best-effort: a failure here
    // shouldn't block the in-memory switch — the legacy global setting below
    // still preserves a usable single-window fallback.
    if (hasNativeCapabilities()) {
      try {
        await setWindowWorkspace(windowLabelRef.current, path);
      } catch (err: unknown) {
        logger.warn("Failed to persist per-window workspace", err);
      }
    }

    // Legacy global setting. Kept until WizardPage / migration flows are
    // moved to per-window state. The last-writer-wins risk across multiple
    // open windows is acceptable in Phase 1 — the per-window registry is the
    // authoritative source on next launch.
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
