import { useEffect, useState, useRef, useCallback } from "react";
import {
  CheckCircle2,
  ClipboardCopy,
  Columns2,
  Eye,
  Pencil,
  Save,
  Undo2,
  PenLine,
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
import { WritingView } from "@/components/WritingView";
import { highlightLine } from "./file-preview/syntax-highlight";
import { MdToolbar } from "./file-preview/MdToolbar";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_BYTES = 1_048_576; // 1 MiB

// Syntax highlighter and MdToolbar extracted to ./file-preview/

// ── Override fn types ────────────────────────────────────────────────────────

export type ReadFileFn = (path: string) => Promise<string>;
export type WriteFileFn = (path: string, content: string) => Promise<void>;

// ── Markdown view modes ─────────────────────────────────────────────────────

type MdViewMode = "preview" | "edit" | "split" | "write";

// ── FilePreview / Editor ─────────────────────────────────────────────────────

interface FilePreviewProps {
  entry: FileEntry | null;
  /** When provided, replaces the default local `filesReadText` call. */
  readFile?: ReadFileFn;
  /** When provided, replaces the default local `filesWriteText` call. */
  writeFile?: WriteFileFn;
  /** When true, markdown defaults to WritingView; non-markdown gets ReadingView. */
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
  const [mdViewMode, setMdViewMode] = useState<MdViewMode>(docsMode ? "write" : "preview");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const ext = entry?.extension?.toLowerCase() ?? "";
  const isMd = ext === "md" || ext === "markdown" || ext === "mdx";
  // Non-markdown text files are directly editable (VS Code-style), so editing
  // is always on — except for truncated (>1 MB partial) buffers, which stay
  // read-only to avoid clobbering the full file with a partial save.
  const canEditCode = !isTruncated;
  const isEditing = isMd ? mdViewMode === "edit" || mdViewMode === "split" : canEditCode;
  const isWriteMode = isMd && mdViewMode === "write";
  const hasChanges = (isEditing || isWriteMode) && editContent !== originalContent;

  useEffect(() => {
    if (!entry || entry.is_dir) {
      setContent(null);
      setError(null);
      setMdViewMode(docsMode ? "write" : "preview");
      return;
    }

    let cancelled = false;
    const currentEntry = entry;

    async function load() {
      setLoading(true);
      setError(null);
      setContent(null);
      setIsTruncated(false);
      setMdViewMode(docsMode ? "write" : "preview");
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
    if (!entry || !hasChanges) return;
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
  }, [entry, editContent, hasChanges, writeFile]);

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

  // Handle Ctrl+S / Cmd+S in editor
  const handleEditorKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void handleSave();
      }
      // Tab key inserts 2 spaces
      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newVal = editContent.slice(0, start) + "  " + editContent.slice(end);
        setEditContent(newVal);
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        });
      }
    },
    [handleSave, editContent],
  );

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

  // ── Write mode — distraction-free writing view ─────────────────────────

  if (isWriteMode && content !== null) {
    return (
      <WritingView
        content={editContent}
        filename={entry.name}
        onChange={setEditContent}
        onSave={handleSave}
        hasChanges={hasChanges}
        docsMode={docsMode}
      />
    );
  }

  // ── Content / Editor ───────────────────────────────────────────────────

  const lines = (content ?? "").split("\n");

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
              <button
                onClick={() => setMdViewMode("write")}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-all",
                  mdViewMode === "write"
                    ? "bg-[var(--color-background)] text-[var(--color-foreground)] shadow-sm"
                    : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
                )}
              >
                <PenLine className="h-3 w-3" />
                Write
              </button>
            </div>
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
      {isMd && mdViewMode !== "preview" && mdViewMode !== "write" && (
        <MdToolbar
          textareaRef={editorRef}
          editContent={editContent}
          setEditContent={setEditContent}
        />
      )}

      {/* Editor or Code view */}
      {isMd ? (
        /* Markdown modes: edit, split, preview */
        mdViewMode === "preview" ? (
          <div className="flex-1 overflow-auto p-6">
            <Markdown content={content ?? ""} />
          </div>
        ) : mdViewMode === "split" ? (
          <div className="flex flex-1 overflow-hidden">
            {/* Editor pane */}
            <div className="flex-1 overflow-hidden relative border-r border-[var(--color-border)]">
              <textarea
                ref={editorRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleEditorKeyDown}
                spellCheck={false}
                className={cn(
                  "absolute inset-0 w-full h-full resize-none font-mono text-xs leading-relaxed",
                  "bg-[var(--color-background)] text-[var(--color-foreground)] p-4 pl-14",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)] border-none",
                  "selection:bg-[var(--color-accent)]",
                )}
              />
              <div
                className="absolute left-0 top-0 bottom-0 w-12 pointer-events-none overflow-hidden bg-[var(--color-card)] border-r border-[var(--color-border)]"
                style={{ paddingTop: "1rem" }}
              >
                {editContent.split("\n").map((_, i) => (
                  <div
                    key={i}
                    className="text-right pr-2 text-[var(--color-muted-foreground)] font-mono text-xs leading-relaxed select-none"
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>
            {/* Preview pane */}
            <div className="flex-1 overflow-auto p-6">
              <Markdown content={editContent} />
            </div>
          </div>
        ) : (
          /* Edit-only mode */
          <div className="flex-1 overflow-hidden relative">
            <textarea
              ref={editorRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleEditorKeyDown}
              spellCheck={false}
              className={cn(
                "absolute inset-0 w-full h-full resize-none font-mono text-xs leading-relaxed",
                "bg-[var(--color-background)] text-[var(--color-foreground)] p-4 pl-14",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)] border-none",
                "selection:bg-[var(--color-accent)]",
              )}
            />
            <div
              className="absolute left-0 top-0 bottom-0 w-12 pointer-events-none overflow-hidden bg-[var(--color-card)] border-r border-[var(--color-border)]"
              style={{ paddingTop: "1rem" }}
            >
              {editContent.split("\n").map((_, i) => (
                <div
                  key={i}
                  className="text-right pr-2 text-[var(--color-muted-foreground)] font-mono text-xs leading-relaxed select-none"
                >
                  {i + 1}
                </div>
              ))}
            </div>
          </div>
        )
      ) : isEditing ? (
        /* Non-markdown editor — directly editable (VS Code-style) with line-number gutter */
        <div className="flex-1 overflow-hidden relative">
          <textarea
            ref={editorRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleEditorKeyDown}
            spellCheck={false}
            className={cn(
              "absolute inset-0 w-full h-full resize-none font-mono text-xs leading-relaxed",
              "bg-[var(--color-background)] text-[var(--color-foreground)] p-4 pl-14",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)] border-none",
              "selection:bg-[var(--color-accent)]",
            )}
          />
          <div
            className="absolute left-0 top-0 bottom-0 w-12 pointer-events-none overflow-hidden bg-[var(--color-card)] border-r border-[var(--color-border)]"
            style={{ paddingTop: "1rem" }}
          >
            {editContent.split("\n").map((_, i) => (
              <div
                key={i}
                className="text-right pr-2 text-[var(--color-muted-foreground)] font-mono text-xs leading-relaxed select-none"
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Code view with syntax highlighting */
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse font-mono text-xs">
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="hover:bg-[var(--color-accent)] transition-colors">
                  <td
                    className={cn(
                      "select-none pr-4 pl-3 py-0 text-right text-[var(--color-muted-foreground)]",
                      "border-r border-[var(--color-border)] min-w-[3rem] sticky left-0 bg-[var(--color-card)]",
                    )}
                    style={{ width: `${String(lines.length).length + 1}ch` }}
                  >
                    {i + 1}
                  </td>
                  <td className="pl-4 pr-2 py-0 whitespace-pre text-[var(--color-foreground)]">
                    {highlightLine(line, ext)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Status bar */}
      <div className="flex shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1 text-[10px] text-[var(--color-muted-foreground)]">
        <span>
          {isEditing
            ? `Editing — ${editContent.split("\n").length} lines`
            : `${lines.length} lines`}
          {hasChanges && " (modified)"}
        </span>
        <div className="flex items-center gap-3">
          <span>{ext.toUpperCase() || "TXT"}</span>
          <span>UTF-8</span>
          {isEditing && <span>Cmd+S to save • Tab for indent</span>}
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
