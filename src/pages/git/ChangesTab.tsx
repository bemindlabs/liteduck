import { useState, useEffect, useCallback } from "react";
import {
  GitBranch,
  RefreshCw,
  FileEdit,
  FilePlus,
  FileMinus,
  FileQuestion,
  FileSymlink,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/ui/skeleton";
import DiffViewer from "@/components/DiffViewer";
import { gitStatus, gitDiffWorking, type GitStatus, type GitDiffResult } from "@/lib/git";
import { Group, Panel } from "react-resizable-panels";
import { ResizeHandle, StatusGroup } from "./shared";

// ── ChangesTab ────────────────────────────────────────────────────────────────

interface ChangesTabProps {
  repoPath: string;
  branch: string;
  onRefresh: () => void;
  refreshSignal: number;
}

export function ChangesTab({ repoPath, branch, onRefresh, refreshSignal }: ChangesTabProps) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [diff, setDiff] = useState<GitDiffResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const [s, d] = await Promise.all([gitStatus(repoPath), gitDiffWorking(repoPath)]);
      setStatus(s);
      setDiff(d);
      // Auto-select first changed file
      setSelectedFile((prev) => {
        const allFiles = [
          ...s.modified,
          ...s.added,
          ...s.deleted,
          ...s.renamed.map(([, n]) => n),
          ...s.untracked,
        ];
        if (prev && allFiles.includes(prev)) return prev;
        return allFiles[0] ?? null;
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const allFileCount = status
    ? status.modified.length +
      status.added.length +
      status.deleted.length +
      status.renamed.length +
      status.untracked.length
    : 0;

  return (
    <Group orientation="horizontal" className="flex h-full min-h-0">
      {/* Left sidebar — file list */}
      <Panel
        defaultSize={50}
        minSize={20}
        className="flex flex-col gap-2 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-2"
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

        {loading && !status && <PageLoading />}

        {status && allFileCount === 0 && (
          <p className="py-4 text-center text-[12px] text-[var(--color-muted-foreground)]">
            Working tree clean
          </p>
        )}

        {status && (
          <div className="space-y-2">
            <StatusGroup
              label="Modified"
              files={status.modified}
              icon={<FileEdit className="h-3.5 w-3.5 shrink-0 text-yellow-400" />}
              selectedFile={selectedFile}
              onSelect={setSelectedFile}
            />
            <StatusGroup
              label="Added"
              files={status.added}
              icon={<FilePlus className="h-3.5 w-3.5 shrink-0 text-success" />}
              selectedFile={selectedFile}
              onSelect={setSelectedFile}
            />
            <StatusGroup
              label="Deleted"
              files={status.deleted}
              icon={<FileMinus className="h-3.5 w-3.5 shrink-0 text-red-400" />}
              selectedFile={selectedFile}
              onSelect={setSelectedFile}
            />
            <StatusGroup
              label="Renamed"
              files={status.renamed.map(([, n]) => n)}
              icon={<FileSymlink className="h-3.5 w-3.5 shrink-0 text-info" />}
              selectedFile={selectedFile}
              onSelect={setSelectedFile}
            />
            <StatusGroup
              label="Untracked"
              files={status.untracked}
              icon={<FileQuestion className="h-3.5 w-3.5 shrink-0 text-primary" />}
              selectedFile={selectedFile}
              onSelect={setSelectedFile}
            />
          </div>
        )}
      </Panel>

      <ResizeHandle />

      {/* Right — diff viewer */}
      <Panel
        defaultSize={50}
        minSize={30}
        className="flex flex-col overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3"
      >
        {!selectedFile && (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
            Select a file to view its diff
          </div>
        )}
        {selectedFile && diff && <DiffViewer diff={diff} filterPath={selectedFile} />}
        {selectedFile && !diff && !loading && (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
            No diff available
          </div>
        )}
      </Panel>
    </Group>
  );
}
