import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { List, ChevronRight, Clock, Keyboard } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { ReadingControls } from "@/components/ReadingControls";
import { useReadingSettings } from "@/hooks/useReadingSettings";
import { cn } from "@/lib/utils";

interface ReadingViewProps {
  content: string;
  filename: string;
  isMarkdown: boolean;
}

interface TocEntry {
  level: number;
  text: string;
  id: string;
}

/** Extract headings from markdown content for table of contents. */
function extractToc(content: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const lines = content.split("\n");
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (match) {
      const text = match[2].replace(/[*_`[\]()]/g, "").trim();
      const id = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-");
      entries.push({ level: match[1].length, text, id });
    }
  }
  return entries;
}

/** Estimate reading time in minutes. */
function estimateReadingTime(content: string): number {
  const words = content.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export function ReadingView({ content, filename, isMarkdown }: ReadingViewProps) {
  const { settings, update, reset } = useReadingSettings();
  const [tocOpen, setTocOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const toc = useMemo(() => (isMarkdown ? extractToc(content) : []), [content, isMarkdown]);
  const readingTime = useMemo(() => estimateReadingTime(content), [content]);

  // Track scroll progress
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const max = scrollHeight - clientHeight;
    setProgress(max > 0 ? (scrollTop / max) * 100 : 0);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Keyboard navigation for distraction-free reading
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function handleKeyDown(e: KeyboardEvent) {
      const el = scrollRef.current;
      if (!el) return;
      const { clientHeight } = el;
      const ARROW_STEP = 60;

      switch (e.key) {
        case "ArrowDown":
        case "j":
          e.preventDefault();
          el.scrollBy({ top: ARROW_STEP, behavior: "smooth" });
          break;
        case "ArrowUp":
        case "k":
          e.preventDefault();
          el.scrollBy({ top: -ARROW_STEP, behavior: "smooth" });
          break;
        case "PageDown":
        case " ":
          e.preventDefault();
          el.scrollBy({ top: clientHeight * 0.85, behavior: "smooth" });
          break;
        case "PageUp":
          e.preventDefault();
          el.scrollBy({ top: -clientHeight * 0.85, behavior: "smooth" });
          break;
        case "Home":
          e.preventDefault();
          el.scrollTo({ top: 0, behavior: "smooth" });
          break;
        case "End":
          e.preventDefault();
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
          break;
        case "t":
          // Toggle table of contents
          if (!e.metaKey && !e.ctrlKey && toc.length > 0) {
            e.preventDefault();
            setTocOpen((v) => !v);
          }
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toc.length]);

  function scrollToHeading(id: string) {
    const el = scrollRef.current;
    if (!el) return;
    // Find the heading in the rendered markdown
    const heading = el.querySelector(`[id="${id}"], h1, h2, h3, h4, h5, h6`);
    // Fallback: search by text content
    const headings = el.querySelectorAll("h1, h2, h3, h4, h5, h6");
    for (const h of headings) {
      const hId = h.textContent
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-");
      if (hId === id) {
        h.scrollIntoView({ behavior: "smooth", block: "start" });
        setTocOpen(false);
        return;
      }
    }
    heading?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTocOpen(false);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Reading progress bar */}
      <div className="h-0.5 w-full shrink-0 bg-[var(--color-muted)]">
        <div
          className="h-full bg-emerald-500 transition-all duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Reading toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* TOC toggle */}
          {toc.length > 0 && (
            <button
              onClick={() => setTocOpen((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                tocOpen
                  ? "bg-[var(--color-accent)] text-[var(--color-foreground)]"
                  : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
              )}
            >
              <List className="h-3.5 w-3.5" />
              Contents
            </button>
          )}

          {/* File name */}
          <span className="truncate text-xs font-medium text-[var(--color-foreground)]">
            {filename}
          </span>

          {/* Reading time */}
          <span className="flex shrink-0 items-center gap-1 text-[10px] text-[var(--color-muted-foreground)]">
            <Clock className="h-3 w-3" />
            {readingTime} min read
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ReadingControls settings={settings} onUpdate={update} onReset={reset} />
          <div className="group relative">
            <Keyboard className="h-3.5 w-3.5 text-[var(--color-muted-foreground)] cursor-help" />
            <div className="pointer-events-none absolute right-0 top-full mt-1 z-50 hidden w-48 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-2 shadow-lg group-hover:block">
              <p className="mb-1 text-[10px] font-semibold text-[var(--color-foreground)]">
                Keyboard shortcuts
              </p>
              <div className="space-y-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                <p>↑/↓ or j/k — Scroll</p>
                <p>Space/PgDn — Page down</p>
                <p>PgUp — Page up</p>
                <p>Home/End — Top/Bottom</p>
                <p>t — Toggle contents</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main reading area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Table of Contents panel */}
        {tocOpen && toc.length > 0 && (
          <aside className="w-56 shrink-0 overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-card)] p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Contents
            </p>
            <nav className="space-y-0.5">
              {toc.map((entry, i) => (
                <button
                  key={`${entry.id}-${i}`}
                  onClick={() => scrollToHeading(entry.id)}
                  className={cn(
                    "flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-xs transition-colors",
                    "text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]",
                  )}
                  style={{ paddingLeft: `${(entry.level - 1) * 12 + 8}px` }}
                >
                  <ChevronRight className="h-2.5 w-2.5 shrink-0 opacity-40" />
                  <span className="truncate">{entry.text}</span>
                </button>
              ))}
            </nav>
          </aside>
        )}

        {/* Content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div
            className="mx-auto px-8 py-8"
            style={{
              maxWidth: `${settings.maxWidth}px`,
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
            }}
          >
            {isMarkdown ? (
              <Markdown content={content} />
            ) : (
              <pre className="whitespace-pre-wrap font-mono text-[var(--color-foreground)]">
                {content}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
