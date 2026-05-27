import { useState, useEffect, useCallback } from "react";
import {
  GitBranch,
  RefreshCw,
  AlertCircle,
  GitCommit as GitCommitIcon,
  User,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/ui/skeleton";
import DiffViewer from "@/components/DiffViewer";
import {
  gitLog,
  gitDiffCommit,
  shortOid,
  relativeTime,
  type GitCommit,
  type GitDiffResult,
} from "@/lib/git";
import { Group, Panel } from "react-resizable-panels";
import { GraphCell } from "@/components/GitGraph";
import { useGitGraph, type GraphRow } from "@/hooks/useGitGraph";
import { ResizeHandle } from "./shared";

// ── CommitRow ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

interface CommitRowProps {
  commit: GitCommit;
  active: boolean;
  onClick: () => void;
  graphRow?: GraphRow;
}

export function CommitRow({ commit, active, onClick, graphRow }: CommitRowProps) {
  const firstLine = commit.message.split("\n")[0];
  const truncated = firstLine.length > 72 ? firstLine.slice(0, 72) + "…" : firstLine;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-row gap-2 rounded px-3 py-2 text-left transition-colors relative min-h-[52px]",
        "hover:bg-[var(--color-accent)]",
        active && "bg-[var(--color-accent)]",
      )}
    >
      {graphRow && <GraphCell row={graphRow} />}
      <div className="flex flex-1 flex-col justify-center gap-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-[11px] text-[var(--color-primary)]">
            {shortOid(commit.oid)}
          </span>
          <span className="flex-1 truncate text-[13px] font-medium text-[var(--color-foreground)]">
            {truncated}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-[var(--color-muted-foreground)]">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {commit.author}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {relativeTime(commit.time)}
          </span>
        </div>
      </div>
    </button>
  );
}

// ── HistoryTab ────────────────────────────────────────────────────────────────

interface HistoryTabProps {
  repoPath: string;
  branch: string;
  onRefresh: () => void;
  refreshSignal: number;
}

export function HistoryTab({ repoPath, branch, onRefresh, refreshSignal }: HistoryTabProps) {
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [diff, setDiff] = useState<GitDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxCount, setMaxCount] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(true);

  const graphRows = useGitGraph(commits);

  const load = useCallback(
    async (count: number) => {
      if (!repoPath) return;
      setLoading(true);
      setError(null);
      try {
        const result = await gitLog(repoPath, count);
        setCommits(result);
        setHasMore(result.length === count);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [repoPath],
  );

  useEffect(() => {
    setMaxCount(PAGE_SIZE);
    void load(PAGE_SIZE);
  }, [load, refreshSignal]);

  const handleLoadMore = () => {
    const next = maxCount + PAGE_SIZE;
    setMaxCount(next);
    void load(next);
  };

  const handleSelectCommit = async (oid: string) => {
    setSelectedCommit(oid);
    setDiff(null);
    setDiffLoading(true);
    try {
      const d = await gitDiffCommit(repoPath, oid);
      setDiff(d);
    } catch (err) {
      setError(String(err));
    } finally {
      setDiffLoading(false);
    }
  };

  return (
    <Group orientation="horizontal" className="flex h-full min-h-0">
      {/* Left — commit list */}
      <Panel
        defaultSize={50}
        minSize={25}
        className="flex flex-col gap-1 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-2"
      >
        {/* Branch header */}
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2">
          <GitBranch className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
          <span className="truncate text-[12px] font-medium text-[var(--color-foreground)]">
            {branch || "…"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-6 w-6"
            onClick={onRefresh}
            title="Refresh"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-1.5 rounded border border-destructive/30 p-2 text-[11px] text-destructive bg-destructive-subtle">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="break-words">{error}</span>
          </div>
        )}

        {loading && commits.length === 0 && <PageLoading />}

        <div className="space-y-0.5">
          {commits.map((commit, i) => (
            <CommitRow
              key={commit.oid}
              commit={commit}
              active={selectedCommit === commit.oid}
              onClick={() => handleSelectCommit(commit.oid)}
              graphRow={graphRows[i]}
            />
          ))}
        </div>

        {hasMore && !loading && (
          <Button variant="outline" size="sm" className="mt-2 w-full" onClick={handleLoadMore}>
            Load more
          </Button>
        )}
      </Panel>

      <ResizeHandle />

      {/* Right — diff viewer */}
      <Panel
        defaultSize={50}
        minSize={30}
        className="flex flex-col overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3"
      >
        {!selectedCommit && (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
            Select a commit to view its diff
          </div>
        )}
        {selectedCommit && diffLoading && <PageLoading />}
        {selectedCommit && diff && !diffLoading && (
          <>
            {/* Commit meta */}
            {(() => {
              const commit = commits.find((c) => c.oid === selectedCommit);
              return commit ? (
                <div className="mb-3 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] p-3">
                  <div className="flex items-start gap-2">
                    <GitCommitIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[var(--color-foreground)] whitespace-pre-wrap break-words">
                        {commit.message}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-muted-foreground)]">
                        <span className="font-mono text-[var(--color-primary)]">
                          {shortOid(commit.oid)}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {commit.author} &lt;{commit.author_email}&gt;
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {relativeTime(commit.time)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null;
            })()}
            <DiffViewer diff={diff} />
          </>
        )}
      </Panel>
    </Group>
  );
}
