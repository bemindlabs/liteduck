import { useEffect, useState, useRef, useCallback } from "react";
import {
  CheckCircle2,
  ClipboardCopy,
  Columns2,
  Eye,
  Pencil,
  Save,
  Search,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/ui/skeleton";
import {
  type FileEntry,
  filesReadText,
  filesWriteText,
  formatBytes,
  formatModified,
} from "@/lib/files";
import { Markdown } from "@/components/Markdown";
import { ReadingView } from "@/components/ReadingView";
import { CodeEditor, type CodeEditorHandle } from "@/components/editor/CodeEditor";
import { MdToolbar } from "./file-preview/MdToolbar";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_BYTES = 1_048_576; // 1 MiB

// ── Override fn types ────────────────────────────────────────────────────────

export type ReadFileFn = (path: string) => Promise<string>;
export type WriteFileFn = (path: string, content: string) => Promise<void>;

// ── Markdown view modes ─────────────────────────────────────────────────────

type MdViewMode = "preview" | "edit" | "split";

// ── FilePreview / Editor ─────────────────────────────────────────────────────

interface FilePreviewProps {
  entry: FileEntry | null;
  /** When provided, replaces the default local `filesReadText` call. */
  readFile?: ReadFileFn;
  /** When provided, replaces the default local `filesWriteText` call. */
  writeFile?: WriteFileFn;
  /** When true, markdown defaults to Edit mode; non-markdown gets ReadingView. */
  docsMode?: boolean;
}

export function FilePreview({ entry, readFile, writeFile, docsMode }: FilePreviewProps) {
  const [content, setContent] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const [mdViewMode, setMdViewMode] = useState<MdViewMode>(docsMode ? "edit" : "preview");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const editorRef = useRef<CodeEditorHandle>(null);

  const ext = entry?.extension?.toLowerCase() ?? "";
  const isMd = ext === "md" || ext === "markdown" || ext === "mdx";
  // Non-markdown text files are directly editable (VS Code-style), so editing
  // is always on — except for truncated (>1 MB partial) buffers, which stay
  // read-only to avoid clobbering the full file with a partial save.
  const canEditCode = !isTruncated;
  const isEditing = isMd ? mdViewMode === "edit" || mdViewMode === "split" : canEditCode;
  const hasChanges = isEditing && editContent !== originalContent;

  useEffect(() => {
    if (!entry || entry.is_dir) {
      setContent(null);
      setError(null);
      setMdViewMode(docsMode ? "edit" : "preview");
      return;
    }

    let cancelled = false;
    const currentEntry = entry;

    async function load() {
      setLoading(true);
      setError(null);
      setContent(null);
      setIsTruncated(false);
      setMdViewMode(docsMode ? "edit" : "preview");
      setSaved(false);

      try {
        const doRead = readFile ?? ((p: string) => filesReadText(p, MAX_BYTES));
        const text = await doRead(currentEntry.path);
        if (!cancelled) {
          setContent(text);
          setEditContent(text);
          setOriginalContent(text);
          setIsTruncated(currentEntry.size > MAX_BYTES);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [entry, readFile, docsMode]);

  const handleSave = useCallback(async () => {
    if (!entry || editContent === originalContent) return;
    setSaving(true);
    const doWrite = writeFile ?? filesWriteText;
    try {
      await doWrite(entry.path, editContent);
      setContent(editContent);
      setOriginalContent(editContent);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [entry, editContent, originalContent, writeFile]);

  const handleRevert = useCallback(() => {
    setEditContent(originalContent);
  }, [originalContent]);

  async function handleCopy() {
    const text = isEditing ? editContent : content;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* silent */
    }
  }

  // ── Empty / dir states ─────────────────────────────────────────────────

  if (!entry) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Select a file to preview its content
        </p>
      </div>
    );
  }

  if (entry.is_dir) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-[var(--color-muted-foreground)]">Select a file to preview</p>
      </div>
    );
  }

  if (loading) return <PageLoading />;

  if (error) {
    return (
      <div className="flex h-full flex-col p-4 gap-3">
        <FileMetaBar entry={entry} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-[var(--color-destructive)]">
              Cannot preview file
            </p>
            <p className="text-xs text-[var(--color-muted-foreground)]">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Docs mode: non-markdown → distraction-free reading view ────────────

  if (docsMode && !isMd && content !== null) {
    return <ReadingView content={content} filename={entry.name} isMarkdown={false} />;
  }

  // ── Content / Editor ───────────────────────────────────────────────────

  const lineCount = (isEditing ? editContent : (content ?? "")).split("\n").length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 gap-3">
        <FileMetaBar entry={entry} />
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Saved indicator */}
          {saved && (
            <span className="flex items-center gap-1 text-xs text-emerald-500">
              <CheckCircle2 className="h-3 w-3" />
              Saved
            </span>
          )}

          {isTruncated && (
            <span className="text-[10px] text-[var(--color-muted-foreground)] bg-[var(--color-accent)] px-2 py-0.5 rounded">
              1 MB limit
            </span>
          )}

          {/* Markdown view mode switcher (non-markdown code is directly editable, no toggle) */}
          {isMd && (
            <div
              className={cn(
                "flex items-center rounded-md border border-[var(--color-border)]",
                "bg-[var(--color-muted)] p-0.5",
              )}
            >
              <button
                onClick={() => {
                  setMdViewMode("edit");
                  requestAnimationFrame(() => editorRef.current?.focus());
                }}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-all",
                  mdViewMode === "edit"
                    ? "bg-[var(--color-background)] text-[var(--color-foreground)] shadow-sm"
                    : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
                )}
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
              <button
                onClick={() => {
                  setMdViewMode("split");
                  requestAnimationFrame(() => editorRef.current?.focus());
                }}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-all",
                  mdViewMode === "split"
                    ? "bg-[var(--color-background)] text-[var(--color-foreground)] shadow-sm"
                    : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
                )}
              >
                <Columns2 className="h-3 w-3" />
                Split
              </button>
              <button
                onClick={() => setMdViewMode("preview")}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-all",
                  mdViewMode === "preview"
                    ? "bg-[var(--color-background)] text-[var(--color-foreground)] shadow-sm"
                    : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
                )}
              >
                <Eye className="h-3 w-3" />
                Preview
              </button>
            </div>
          )}

          {/* Find — opens the CodeMirror search panel (also Cmd+F). */}
          {isEditing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editorRef.current?.openSearch()}
              className="h-7 gap-1.5 text-xs"
              title="Find / Replace (Cmd+F)"
            >
              <Search className="h-3.5 w-3.5" />
              Find
            </Button>
          )}

          {/* Revert */}
          {isEditing && hasChanges && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRevert}
              className="h-7 gap-1.5 text-xs"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Revert
            </Button>
          )}

          {/* Save — always shown while editing markdown; code shows it only when dirty */}
          {isEditing && (isMd || hasChanges) && (
            <Button
              variant="default"
              size="sm"
              onClick={() => void handleSave()}
              disabled={!hasChanges || saving}
              className="h-7 gap-1.5 text-xs"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save"}
            </Button>
          )}

          {/* Copy */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 gap-1.5 text-xs"
            disabled={!content}
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      </div>

      {/* Markdown formatting toolbar */}
      {isMd && mdViewMode !== "preview" && <MdToolbar editor={editorRef} />}

      {/* Editor or preview */}
      {isMd ? (
        mdViewMode === "preview" ? (
          <div className="flex-1 overflow-auto p-6">
            <Markdown content={content ?? ""} />
          </div>
        ) : mdViewMode === "split" ? (
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden border-r border-[var(--color-border)]">
              <CodeEditor
                ref={editorRef}
                value={editContent}
                onChange={setEditContent}
                filename={entry.name}
                onSave={() => void handleSave()}
              />
            </div>
            <div className="flex-1 overflow-auto p-6">
              <Markdown content={editContent} />
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden">
            <CodeEditor
              ref={editorRef}
              value={editContent}
              onChange={setEditContent}
              filename={entry.name}
              onSave={() => void handleSave()}
            />
          </div>
        )
      ) : (
        /* Non-markdown: always-on code editor (read-only when truncated). */
        <div className="flex-1 overflow-hidden">
          <CodeEditor
            ref={editorRef}
            value={editContent}
            onChange={setEditContent}
            filename={entry.name}
            readOnly={isTruncated}
            onSave={() => void handleSave()}
          />
        </div>
      )}

      {/* Status bar */}
      <div className="flex shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1 text-[10px] text-[var(--color-muted-foreground)]">
        <span>
          {isEditing ? `Editing — ${lineCount} lines` : `${lineCount} lines`}
          {hasChanges && " (modified)"}
        </span>
        <div className="flex items-center gap-3">
          <span>{ext.toUpperCase() || "TXT"}</span>
          <span>UTF-8</span>
          {isEditing && <span>Cmd+S save • Cmd+F find</span>}
        </div>
      </div>
    </div>
  );
}

// ── FileMetaBar ──────────────────────────────────────────────────────────────

function FileMetaBar({ entry }: { entry: FileEntry }) {
  return (
    <div className="flex items-center gap-3 min-w-0 overflow-hidden">
      <span className="truncate text-sm font-medium text-[var(--color-foreground)]">
        {entry.name}
      </span>
      <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">
        {formatBytes(entry.size)}
      </span>
      <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">
        {formatModified(entry.modified)}
      </span>
    </div>
  );
}
