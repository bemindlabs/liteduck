/**
 * StatusBar — VS Code-style strip across the bottom of the workspace shell.
 *
 * Shows: current git branch (if any), problems-count placeholder, encoding,
 * line endings, and a language hint derived from the active file's extension.
 * All values are best-effort; nothing here is interactive yet.
 */

import { useEffect, useState } from "react";
import { GitBranch, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileEntry } from "@/lib/files";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { gitCurrentBranch } from "@/lib/git";
import { createLogger } from "@/lib/logger";

const logger = createLogger("StatusBar");

interface StatusBarProps {
  /** Active editor file (drives the language hint). Null when no file is open. */
  activeEntry: FileEntry | null;
  /** Number of problems/diagnostics. Placeholder — wired to 0 for v1. */
  problemsCount?: number;
}

// Quick map for the most common extensions; falls back to the raw uppercase ext.
const LANG_LABEL: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript React",
  js: "JavaScript",
  jsx: "JavaScript React",
  rs: "Rust",
  go: "Go",
  py: "Python",
  rb: "Ruby",
  md: "Markdown",
  mdx: "MDX",
  json: "JSON",
  toml: "TOML",
  yaml: "YAML",
  yml: "YAML",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  sql: "SQL",
};

function languageLabel(entry: FileEntry | null): string {
  if (!entry || entry.is_dir) return "—";
  const ext = entry.extension?.toLowerCase() ?? "";
  if (!ext) return "Plain Text";
  return LANG_LABEL[ext] ?? ext.toUpperCase();
}

export function StatusBar({ activeEntry, problemsCount = 0 }: StatusBarProps) {
  const { workspace } = useWorkspace();
  const [branch, setBranch] = useState<string | null>(null);

  // Synchronise the branch readout with the external workspace path — the
  // setState calls inside the async chain are correctly inside callbacks.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!workspace) {
      setBranch(null);
      return;
    }
    let cancelled = false;
    gitCurrentBranch(workspace)
      .then((b) => {
        if (!cancelled) setBranch(b || null);
      })
      .catch((err: unknown) => {
        // Not a git repo or git unavailable — silently hide the branch.
        logger.debug("no git branch for workspace", err);
        if (!cancelled) setBranch(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div
      role="status"
      aria-label="Workspace status"
      className={cn(
        "flex h-6 shrink-0 items-center gap-4 border-t border-[var(--color-border)]",
        "bg-[var(--color-sidebar)] px-3 text-[11px] text-[var(--color-muted-foreground)]",
      )}
    >
      {/* Branch (left cluster) */}
      <div className="flex items-center gap-1.5">
        <GitBranch className="h-3 w-3" aria-hidden />
        <span>{branch ?? "—"}</span>
      </div>

      {/* Problems */}
      <div className="flex items-center gap-1">
        <AlertCircle className="h-3 w-3" aria-hidden />
        <span>{problemsCount} problems</span>
      </div>

      {/* Right cluster */}
      <div className="ml-auto flex items-center gap-4">
        <span>UTF-8</span>
        <span>LF</span>
        <span>{languageLabel(activeEntry)}</span>
      </div>
    </div>
  );
}
