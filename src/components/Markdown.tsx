import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState, useEffect, useRef, useId } from "react";
import { Copy, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "strict",
  themeVariables: {
    primaryColor: "#3b82f6",
    primaryTextColor: "#e5e7eb",
    primaryBorderColor: "#4b5563",
    lineColor: "#6b7280",
    secondaryColor: "#1f2937",
    tertiaryColor: "#111827",
    fontFamily: "ui-monospace, monospace",
    fontSize: "12px",
  },
});

// ── CopyButton for code blocks ───────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="absolute right-2 top-2 rounded p-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors opacity-0 group-hover/code:opacity-100"
      title="Copy code"
    >
      {copied ? (
        <CheckCheck className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

// ── Mermaid diagram renderer ─────────────────────────────────────────────────

function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, "m");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void mermaid.render(`mermaid-${id}`, chart.trim()).then(
      ({ svg: result }) => {
        if (!cancelled) setSvg(result);
      },
      (err: unknown) => {
        if (!cancelled) setError(String(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (error) {
    return (
      <pre className="overflow-x-auto rounded-md border border-red-700/30 bg-red-900/10 px-4 py-3 text-xs text-red-300">
        {chart}
      </pre>
    );
  }

  if (!svg) {
    return (
      <div className="flex items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-xs text-[var(--color-muted-foreground)]">
        Rendering diagram...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-3 overflow-x-auto rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-4 [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// ── Markdown component ───────────────────────────────────────────────────────

interface MarkdownProps {
  content: string;
  className?: string;
}

export function Markdown({ content, className }: MarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className={cn("markdown-body", className)}
      components={{
        // ── Headings ─────────────────────────────────────────────
        h1: ({ children }) => (
          <h1 className="text-2xl font-bold text-[var(--color-foreground)] border-b border-[var(--color-border)] pb-2 mb-4 mt-6 first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-xl font-semibold text-[var(--color-foreground)] border-b border-[var(--color-border)] pb-1.5 mb-3 mt-5">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-lg font-semibold text-[var(--color-foreground)] mb-2 mt-4">
            {children}
          </h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-base font-semibold text-[var(--color-foreground)] mb-2 mt-3">
            {children}
          </h4>
        ),
        h5: ({ children }) => (
          <h5 className="text-sm font-semibold text-[var(--color-foreground)] mb-1 mt-3">
            {children}
          </h5>
        ),
        h6: ({ children }) => (
          <h6 className="text-sm font-semibold text-[var(--color-muted-foreground)] mb-1 mt-3">
            {children}
          </h6>
        ),

        // ── Paragraphs & text ────────────────────────────────────
        p: ({ children }) => (
          <p className="text-sm leading-relaxed text-[var(--color-foreground)] mb-3">{children}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-[var(--color-foreground)]">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        del: ({ children }) => (
          <del className="line-through text-[var(--color-muted-foreground)]">{children}</del>
        ),

        // ── Links ────────────────────────────────────────────────
        a: ({ href, children }) => (
          <a
            href={href}
            className="text-[var(--color-primary)] hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),

        // ── Lists ────────────────────────────────────────────────
        ul: ({ children }) => (
          <ul className="list-disc list-outside ml-6 mb-3 space-y-1 text-sm text-[var(--color-foreground)]">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-outside ml-6 mb-3 space-y-1 text-sm text-[var(--color-foreground)]">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,

        // ── Task lists (GFM) ─────────────────────────────────────
        input: ({ checked }) => (
          <input
            type="checkbox"
            checked={checked}
            readOnly
            className="mr-1.5 rounded accent-[var(--color-primary)]"
          />
        ),

        // ── Blockquote ───────────────────────────────────────────
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-[var(--color-border)] pl-4 py-1 mb-3 text-[var(--color-muted-foreground)] italic">
            {children}
          </blockquote>
        ),

        // ── Code ─────────────────────────────────────────────────
        code: ({ className: codeClass, children }) => {
          const isInline = !codeClass && typeof children === "string" && !children.includes("\n");
          if (isInline) {
            return (
              <code className="rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-[12px] font-mono text-[var(--color-foreground)]">
                {children}
              </code>
            );
          }
          // Block code — render with language label + copy
          const lang = codeClass?.replace("language-", "") ?? "";
          const codeStr = (
            typeof children === "string"
              ? children
              : Array.isArray(children)
                ? children.join("")
                : ""
          ).replace(/\n$/, "");

          // Mermaid diagrams
          if (lang === "mermaid") {
            return <MermaidDiagram chart={codeStr} />;
          }
          return (
            <>
              {lang && (
                <div className="flex items-center px-3 py-1 border-b border-[var(--color-border)] bg-[var(--color-muted)]">
                  <span className="text-[10px] font-mono text-[var(--color-muted-foreground)]">
                    {lang}
                  </span>
                  <span className="ml-auto">
                    <CopyBtn text={codeStr} />
                  </span>
                </div>
              )}
              {!lang && (
                <div className="absolute right-2 top-2">
                  <CopyBtn text={codeStr} />
                </div>
              )}
              <code>{children}</code>
            </>
          );
        },

        pre: ({ children }) => (
          <div className="group/code relative mb-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] overflow-hidden">
            <pre className="overflow-x-auto px-4 py-3 text-xs font-mono leading-relaxed text-[var(--color-foreground)] whitespace-pre-wrap">
              {children}
            </pre>
          </div>
        ),

        // ── Tables (GFM) ─────────────────────────────────────────
        table: ({ children }) => (
          <div className="overflow-x-auto mb-3">
            <table className="w-full border-collapse text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-[var(--color-muted)]">{children}</thead>,
        th: ({ children }) => (
          <th className="border border-[var(--color-border)] px-3 py-1.5 text-left text-xs font-semibold text-[var(--color-foreground)]">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-foreground)]">
            {children}
          </td>
        ),

        // ── Horizontal rule ──────────────────────────────────────
        hr: () => <hr className="border-[var(--color-border)] my-4" />,

        // ── Images ───────────────────────────────────────────────
        img: ({ src, alt }) => (
          <img
            src={src}
            alt={alt ?? ""}
            className="max-w-full rounded-md border border-[var(--color-border)] my-3"
          />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export default Markdown;
