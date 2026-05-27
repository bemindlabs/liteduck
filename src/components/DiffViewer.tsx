import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileMinus,
  FileEdit,
  FileSymlink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GitDiffResult, GitDiffFile, GitDiffHunk, GitDiffLine } from "@/lib/git";

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: GitDiffFile["status"] }) {
  const config = {
    modified: { label: "M", className: "bg-yellow-950 text-yellow-400 border-yellow-800" },
    added: { label: "A", className: "bg-green-950 text-green-400 border-green-800" },
    deleted: { label: "D", className: "bg-red-950 text-red-400 border-red-800" },
    renamed: { label: "R", className: "border-info/30 text-info" },
    untracked: { label: "U", className: "bg-purple-950 text-purple-400 border-purple-800" },
  } as const;

  const { label, className } = config[status];
  return (
    <span
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded border text-[10px] font-bold",
        className,
      )}
    >
      {label}
    </span>
  );
}

function FileIcon({ status }: { status: GitDiffFile["status"] }) {
  const cls = "h-4 w-4 shrink-0";
  switch (status) {
    case "added":
      return <FilePlus className={cn(cls, "text-green-400")} />;
    case "deleted":
      return <FileMinus className={cn(cls, "text-red-400")} />;
    case "renamed":
      return <FileSymlink className={cn(cls, "text-info")} />;
    default:
      return <FileEdit className={cn(cls, "text-yellow-400")} />;
  }
}

// ── Line number cell ──────────────────────────────────────────────────────────

function LineNo({ value }: { value: number | null }) {
  return (
    <td className="w-10 select-none pr-2 text-right font-mono text-[11px] text-[var(--color-muted-foreground)]">
      {value ?? ""}
    </td>
  );
}

// ── Diff line row ─────────────────────────────────────────────────────────────

function DiffLineRow({ line }: { line: GitDiffLine }) {
  const isAdd = line.origin === "+";
  const isDel = line.origin === "-";

  return (
    <tr className={cn("group", isAdd && "bg-green-950", isDel && "bg-red-950")}>
      <LineNo value={line.old_lineno} />
      <LineNo value={line.new_lineno} />
      <td
        className={cn(
          "w-4 select-none text-center font-mono text-[11px]",
          isAdd && "text-green-400",
          isDel && "text-red-400",
          !isAdd && !isDel && "text-[var(--color-muted-foreground)]",
        )}
      >
        {line.origin}
      </td>
      <td
        className={cn(
          "whitespace-pre-wrap break-all font-mono text-[12px] pl-2",
          isAdd && "text-green-300",
          isDel && "text-red-300",
          !isAdd && !isDel && "text-[var(--color-foreground)]",
        )}
      >
        {line.content || " "}
      </td>
    </tr>
  );
}

// ── Hunk section ──────────────────────────────────────────────────────────────

function HunkSection({ hunk }: { hunk: GitDiffHunk }) {
  return (
    <div className="border-b border-[var(--color-border)] last:border-b-0">
      {/* Hunk header */}
      <div className="border-b border-info/30 px-3 py-1 font-mono text-[11px] text-info bg-info-subtle">
        {hunk.header}
      </div>
      {/* Lines */}
      <table className="w-full border-collapse">
        <tbody>
          {hunk.lines.map((line, i) => (
            <DiffLineRow key={i} line={line} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── File section ──────────────────────────────────────────────────────────────

function FileSection({
  file,
  hunks,
  defaultOpen,
}: {
  file: GitDiffFile;
  hunks: GitDiffHunk[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const displayPath =
    file.old_path && file.old_path !== file.path ? `${file.old_path} → ${file.path}` : file.path;

  const hunkCount = hunks.length;
  const lineStats = hunks.reduce(
    (acc, hunk) => {
      for (const line of hunk.lines) {
        if (line.origin === "+") acc.added++;
        else if (line.origin === "-") acc.deleted++;
      }
      return acc;
    },
    { added: 0, deleted: 0 },
  );

  return (
    <div className="rounded-md border border-[var(--color-border)] overflow-hidden">
      {/* File header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 bg-[var(--color-card)] px-3 py-2 text-left hover:bg-[var(--color-accent)] transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
        )}

        <FileIcon status={file.status} />

        <span className="flex-1 truncate font-mono text-[12px] text-[var(--color-foreground)]">
          {displayPath}
        </span>

        <StatusBadge status={file.status} />

        {hunkCount > 0 && (
          <span className="text-[11px] text-[var(--color-muted-foreground)]">
            <span className="text-green-400">+{lineStats.added}</span>
            {" / "}
            <span className="text-red-400">-{lineStats.deleted}</span>
          </span>
        )}
      </button>

      {/* Diff content */}
      {open && (
        <div className="overflow-x-auto border-t border-[var(--color-border)]">
          {hunks.length === 0 ? (
            <div className="px-4 py-3 text-[12px] text-[var(--color-muted-foreground)] italic">
              {file.status === "deleted"
                ? "File deleted"
                : file.status === "added"
                  ? "New file"
                  : "No diff available"}
            </div>
          ) : (
            hunks.map((hunk, i) => <HunkSection key={i} hunk={hunk} />)
          )}
        </div>
      )}
    </div>
  );
}

// ── DiffViewer ────────────────────────────────────────────────────────────────

interface DiffViewerProps {
  diff: GitDiffResult;
  /** When set, only show diffs for this file path */
  filterPath?: string;
  className?: string;
}

export default function DiffViewer({ diff, filterPath, className }: DiffViewerProps) {
  const files = filterPath ? diff.files.filter((f) => f.path === filterPath) : diff.files;

  if (files.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center py-12 text-sm text-[var(--color-muted-foreground)]",
          className,
        )}
      >
        No changes to display
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {files.map((file, i) => (
        <FileSection
          key={file.path}
          file={file}
          hunks={diff.hunks[file.path] ?? []}
          defaultOpen={i === 0}
        />
      ))}
    </div>
  );
}
