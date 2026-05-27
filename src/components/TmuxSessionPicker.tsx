import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Layers, Pencil, Play, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { TmuxSessionInfo } from "@/hooks/useTerminal";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCreated(created: string): string {
  try {
    const date = new Date(Number(created) * 1000);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return created;
  }
}

// ── SessionRow ────────────────────────────────────────────────────────────────

interface SessionRowProps {
  session: TmuxSessionInfo;
  onAttach: () => void;
  onKill: () => void;
  onRename: (name: string) => void;
}

function SessionRow({ session: sess, onAttach, onKill, onRename }: SessionRowProps) {
  const [renaming, setRenaming] = useState(false);
  // newName is initialised from sess.name; SessionRow is keyed by sess.name in
  // the parent list, so it remounts (and reinitialises) after a successful rename.
  const [newName, setNewName] = useState(sess.name);
  const [confirmKill, setConfirmKill] = useState(false);

  function commitRename() {
    const trimmed = newName.trim();
    if (trimmed && trimmed !== sess.name) onRename(trimmed);
    setRenaming(false);
  }

  return (
    <li className="group">
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3 transition-colors",
          "hover:bg-[var(--color-accent)]",
        )}
      >
        {/* Session info */}
        <div className="min-w-0 flex-1">
          {renaming ? (
            <div className="flex items-center gap-1.5">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") {
                    setNewName(sess.name);
                    setRenaming(false);
                  }
                }}
                className="flex-1 rounded border border-[var(--color-input)] bg-[var(--color-background)] px-2 py-0.5 text-sm text-[var(--color-foreground)] font-mono"
                autoFocus
              />
              <button
                onClick={commitRename}
                className="text-success hover:text-success"
                aria-label="Confirm rename"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-[var(--color-foreground)] font-mono">
                  {sess.name}
                </span>
                {sess.attached && (
                  <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-success bg-success-subtle">
                    attached
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                {sess.windows} {sess.windows === 1 ? "window" : "windows"} &middot; created{" "}
                {formatCreated(sess.created)}
              </p>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onAttach}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-secondary)] transition-colors"
            title="Attach session"
          >
            <Play className="h-3 w-3" />
            Attach
          </button>
          <button
            onClick={() => {
              setRenaming(true);
              setNewName(sess.name);
            }}
            className="rounded p-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-accent)] transition-colors opacity-0 group-hover:opacity-100"
            title="Rename session"
            aria-label={`Rename session ${sess.name}`}
          >
            <Pencil className="h-3 w-3" />
          </button>
          {confirmKill ? (
            <button
              onClick={() => {
                onKill();
                setConfirmKill(false);
              }}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-destructive hover:bg-destructive/10 transition-colors bg-destructive-subtle"
            >
              Confirm
            </button>
          ) : (
            <button
              onClick={() => setConfirmKill(true)}
              onBlur={() => setTimeout(() => setConfirmKill(false), 200)}
              className="rounded p-1 text-[var(--color-muted-foreground)] hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
              title="Kill session"
              aria-label={`Kill session ${sess.name}`}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

// ── TmuxSessionPicker ─────────────────────────────────────────────────────────

export interface TmuxSessionPickerProps {
  /** Whether the dialog is visible. */
  open: boolean;
  /** Called when the dialog should close. */
  onClose: () => void;
  /**
   * Called when the user chooses to attach to an existing session.
   * The dialog closes automatically before this is invoked.
   */
  onAttach: (sessionName: string) => void;
  /**
   * Called when the user clicks "New Session".
   * The dialog closes automatically before this is invoked.
   */
  onNewSession: () => void;
}

/**
 * Modal dialog that lists all existing tmux sessions and lets the user:
 * - Filter/search sessions by name
 * - Attach a session as a new tab
 * - Rename or kill a session
 * - Create a brand-new session
 */
export default function TmuxSessionPicker({
  open,
  onClose,
  onAttach,
  onNewSession,
}: TmuxSessionPickerProps) {
  const [sessions, setSessions] = useState<TmuxSessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // ── Data fetching ───────────────────────────────────────────────────────────

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<TmuxSessionInfo[]>("terminal_list_tmux");
      setSessions(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list tmux sessions");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      void fetchSessions();
    }
  }, [open, fetchSessions]);

  // ── Keyboard handling ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // ── Focus management ────────────────────────────────────────────────────────

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      // Focus the search input so the user can type immediately.
      requestAnimationFrame(() => {
        if (searchRef.current) {
          searchRef.current.focus();
        } else {
          panelRef.current?.focus();
        }
      });
    } else {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    }
  }, [open]);

  // ── Derived state ───────────────────────────────────────────────────────────

  const trimmedQuery = query.trim().toLowerCase();
  const filtered = trimmedQuery
    ? sessions.filter((s) => s.name.toLowerCase().includes(trimmedQuery))
    : sessions;

  // ── Mutation handlers ───────────────────────────────────────────────────────

  async function handleKill(sessionName: string) {
    try {
      await invoke("terminal_kill_tmux", { tmuxSession: sessionName });
      // Refresh the session list after successful kill
      await fetchSessions();
    } catch (err) {
      console.error("Failed to kill tmux session:", err);
      // Still refresh in case the session was partially killed
      void fetchSessions();
    }
  }

  async function handleRename(oldName: string, newName: string) {
    try {
      await invoke("terminal_rename_tmux", { oldName, newName });
      void fetchSessions();
    } catch {
      /* ignore */
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!open) return null;

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="tmux session picker"
        tabIndex={-1}
        className={cn(
          "flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--color-border)]",
          "shadow-2xl outline-none",
          "animate-in fade-in zoom-in-95 duration-150",
        )}
        style={{ backgroundColor: "var(--color-popover)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <Layers className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
          <h2 className="flex-1 text-sm font-semibold text-[var(--color-foreground)]">
            tmux Sessions
          </h2>
          <button
            onClick={() => void fetchSessions()}
            disabled={loading}
            className={cn(
              "shrink-0 rounded p-0.5 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]",
              loading && "animate-spin",
            )}
            aria-label="Refresh sessions"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="shrink-0 rounded p-0.5 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
            aria-label="Close session picker"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search / filter bar */}
        <div className="border-b border-[var(--color-border)] px-3 py-2">
          <div className="flex items-center gap-2 rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter sessions…"
              className="flex-1 bg-transparent text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] outline-none"
              aria-label="Filter tmux sessions"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="shrink-0 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
                aria-label="Clear filter"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Session list */}
        <div className="max-h-72 overflow-y-auto">
          {loading && (
            <p className="px-4 py-6 text-center text-sm text-[var(--color-muted-foreground)]">
              Loading sessions…
            </p>
          )}

          {!loading && error && (
            <p className="px-4 py-6 text-center text-sm text-destructive">{error}</p>
          )}

          {!loading && !error && sessions.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-[var(--color-muted-foreground)]">
              No tmux sessions found.
            </p>
          )}

          {!loading && !error && sessions.length > 0 && filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-[var(--color-muted-foreground)]">
              No sessions match{" "}
              <span className="font-mono text-[var(--color-foreground)]">
                &ldquo;{query}&rdquo;
              </span>
              .
            </p>
          )}

          {!loading && !error && filtered.length > 0 && (
            <ul role="list" className="divide-y divide-[var(--color-border)]">
              {filtered.map((sess) => (
                <SessionRow
                  key={sess.name}
                  session={sess}
                  onAttach={() => {
                    onAttach(sess.name);
                    onClose();
                  }}
                  onKill={() => void handleKill(sess.name)}
                  onRename={(newName) => void handleRename(sess.name, newName)}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-2">
          <p className="text-[10px] text-[var(--color-muted-foreground)]">
            {sessions.length > 0
              ? `${filtered.length} of ${sessions.length} session${sessions.length === 1 ? "" : "s"}`
              : "Click a session to attach it as a new tab."}
          </p>
          <button
            onClick={() => {
              onNewSession();
              onClose();
            }}
            className="flex h-7 items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-2.5 text-xs font-medium text-[var(--color-primary-foreground)] transition-colors hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            New Session
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
