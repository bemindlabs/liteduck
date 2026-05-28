import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Save, CheckCircle2, Undo2, Redo2, Clock, Type, Hash, AlignLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReadingSettings } from "@/hooks/useReadingSettings";

interface WritingViewProps {
  content: string;
  filename: string;
  onChange: (content: string) => void;
  onSave: () => Promise<void>;
  hasChanges: boolean;
  /**
   * Full-page docs surface (vs. a workspace editor pane). When true the
   * typewriter top/bottom spacers are page-sized (40vh) so any line can sit at
   * the true vertical center. In a short editor pane that much padding pushes
   * content off-screen, so we use a small fixed gutter instead.
   */
  docsMode?: boolean;
}

/** Count words in text. */
function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Estimate reading time in minutes. */
function estimateReadingTime(words: number): number {
  return Math.max(1, Math.ceil(words / 200));
}

export function WritingView({
  content,
  filename,
  onChange,
  onSave,
  hasChanges,
  docsMode = false,
}: WritingViewProps) {
  const { settings } = useReadingSettings();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const lastSnapshotRef = useRef(content);

  const wordCount = useMemo(() => countWords(content), [content]);
  const charCount = content.length;
  const readingTime = useMemo(() => estimateReadingTime(wordCount), [wordCount]);

  // ── Auto-grow ─────────────────────────────────────────────────────────
  // The textarea lives inside a scroll container; it must grow to its full
  // content height so the container scrolls through the whole file rather than
  // clipping at a fixed/min height. (A non-growing textarea inside an
  // overflow-y-auto parent would hide everything past its own box.)

  const autoGrow = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  // Re-fit whenever the content or any size-affecting setting changes.
  useEffect(() => {
    autoGrow();
  }, [autoGrow, content, settings.fontSize, settings.lineHeight, settings.maxWidth]);

  // ── Typewriter scrolling ──────────────────────────────────────────────
  // Keep the cursor line vertically centered in the viewport. Only acts while
  // the textarea is focused, and clamps to the container's valid scroll range
  // so it can never strand content in a short editor pane.

  const scrollCursorToCenter = useCallback(() => {
    const ta = textareaRef.current;
    const container = containerRef.current;
    if (!ta || !container) return;
    // Don't hijack scroll position unless the user is actually editing.
    if (document.activeElement !== ta) return;

    // Compute the line the cursor is on
    const cursorPos = ta.selectionStart;
    const textBeforeCursor = content.slice(0, cursorPos);
    const lineNumber = textBeforeCursor.split("\n").length;

    // Get line height from computed style
    const style = window.getComputedStyle(ta);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.8;

    // Cursor's vertical offset within the scroll container (textarea top +
    // line offset), accounting for the spacer above the centered column.
    const cursorY = ta.offsetTop + (lineNumber - 1) * lineHeight;
    const containerHeight = container.clientHeight;
    const maxScroll = Math.max(0, container.scrollHeight - containerHeight);
    const targetScrollTop = cursorY - containerHeight / 2 + lineHeight / 2;

    container.scrollTo({
      top: Math.min(maxScroll, Math.max(0, targetScrollTop)),
      behavior: "smooth",
    });
  }, [content]);

  // Scroll to center on cursor move (click, keyup)
  const handleSelect = useCallback(() => {
    requestAnimationFrame(scrollCursorToCenter);
  }, [scrollCursorToCenter]);

  // ── Undo/Redo ─────────────────────────────────────────────────────────

  // Snapshot on pause (debounced): capture state when user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (content !== lastSnapshotRef.current) {
        setUndoStack((prev) => [...prev.slice(-50), lastSnapshotRef.current]);
        setRedoStack([]);
        lastSnapshotRef.current = content;
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [content]);

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const snapshot = prev[prev.length - 1];
      setRedoStack((r) => [...r, content]);
      lastSnapshotRef.current = snapshot;
      onChange(snapshot);
      return prev.slice(0, -1);
    });
  }, [content, onChange]);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const snapshot = prev[prev.length - 1];
      setUndoStack((u) => [...u, content]);
      lastSnapshotRef.current = snapshot;
      onChange(snapshot);
      return prev.slice(0, -1);
    });
  }, [content, onChange]);

  // ── Auto-save ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!hasChanges) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(() => {
      setSaving(true);
      onSave()
        .then(() => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        })
        .catch(() => {
          /* save error handled upstream */
        })
        .finally(() => {
          setSaving(false);
        });
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [content, hasChanges, onSave]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const mod = e.metaKey || e.ctrlKey;

      // Cmd+S — manual save
      if (mod && e.key === "s") {
        e.preventDefault();
        void (async () => {
          setSaving(true);
          try {
            await onSave();
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          } catch {
            /* handled upstream */
          } finally {
            setSaving(false);
          }
        })();
        return;
      }

      // Cmd+Z — undo
      if (mod && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Cmd+Shift+Z — redo
      if (mod && e.shiftKey && e.key === "z") {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Tab → 2 spaces
      if (e.key === "Tab") {
        e.preventDefault();
        const ta = e.currentTarget;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const newVal = content.slice(0, start) + "  " + content.slice(end);
        onChange(newVal);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 2;
        });
      }
    },
    [onSave, handleUndo, handleRedo, content, onChange],
  );

  // Focus textarea on mount
  useEffect(() => {
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--color-background)]">
      {/* Minimal top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2">
        <span className="truncate text-xs font-medium text-[var(--color-muted-foreground)]">
          {filename}
        </span>

        <div className="flex items-center gap-3">
          {/* Save indicator */}
          {saving && (
            <span className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
              <Save className="h-3 w-3 animate-pulse" />
              Saving...
            </span>
          )}
          {saved && !saving && (
            <span className="flex items-center gap-1 text-xs text-emerald-500">
              <CheckCircle2 className="h-3 w-3" />
              Saved
            </span>
          )}
          {hasChanges && !saving && !saved && (
            <span className="h-2 w-2 rounded-full bg-amber-500" title="Unsaved changes" />
          )}

          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded transition-colors",
                undoStack.length > 0
                  ? "text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
                  : "text-[var(--color-muted-foreground)] opacity-30",
              )}
              title="Undo (Cmd+Z)"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded transition-colors",
                redoStack.length > 0
                  ? "text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
                  : "text-[var(--color-muted-foreground)] opacity-30",
              )}
              title="Redo (Cmd+Shift+Z)"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Writing area with typewriter scrolling */}
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        {/* Top gutter — page-sized in docsMode so any line can hit center;
            small in a short editor pane so content stays in view. */}
        <div style={{ height: docsMode ? "40vh" : "1.5rem" }} />
        <div className="mx-auto w-full px-8" style={{ maxWidth: `${settings.maxWidth}px` }}>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onSelect={handleSelect}
            onClick={handleSelect}
            spellCheck
            rows={1}
            className={cn(
              "block w-full resize-none overflow-hidden border-none bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)]",
              "text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]",
              "caret-emerald-500",
            )}
            style={{
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
            placeholder="Start writing..."
          />
        </div>
        {/* Bottom gutter — matches the top gutter rationale. */}
        <div style={{ height: docsMode ? "40vh" : "1.5rem" }} />
      </div>

      {/* Stats bar */}
      <div className="flex shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-card)] px-4 py-1.5">
        <div className="flex items-center gap-4 text-[10px] text-[var(--color-muted-foreground)]">
          <span className="flex items-center gap-1" title="Words">
            <AlignLeft className="h-3 w-3" />
            {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
          </span>
          <span className="flex items-center gap-1" title="Characters">
            <Type className="h-3 w-3" />
            {charCount.toLocaleString()} {charCount === 1 ? "char" : "chars"}
          </span>
          <span className="flex items-center gap-1" title="Estimated reading time">
            <Clock className="h-3 w-3" />
            {readingTime} min read
          </span>
          <span className="flex items-center gap-1" title="Lines">
            <Hash className="h-3 w-3" />
            {content.split("\n").length} {content.split("\n").length === 1 ? "line" : "lines"}
          </span>
        </div>
        <div className="text-[10px] text-[var(--color-muted-foreground)]">
          Cmd+S save · Auto-saves after 2s
        </div>
      </div>
    </div>
  );
}
