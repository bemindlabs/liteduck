import { GitBranch } from "lucide-react";

interface GitSectionProps {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export function GitSection({ values, onChange }: GitSectionProps) {
  const raw = values.git_scan_exclude_patterns || "";

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange("git_scan_exclude_patterns", e.target.value);
  }

  return (
    <section
      id="section-git"
      className="scroll-mt-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-5"
    >
      <div className="border-b border-[var(--color-border)] pb-3">
        <h3 className="flex items-center gap-2 text-base font-medium text-[var(--color-foreground)]">
          <GitBranch className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          Git
        </h3>
        <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">
          Configure git repository scanning behaviour.
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="field-git_scan_exclude_patterns"
          className="block text-sm font-medium text-[var(--color-foreground)]"
        >
          Scan Exclude Patterns
        </label>
        <textarea
          id="field-git_scan_exclude_patterns"
          rows={4}
          value={raw}
          onChange={handleTextareaChange}
          placeholder={"archives\nbackups\nmy-vendor-dir"}
          className={[
            "w-full rounded-md border border-[var(--color-input)] bg-[var(--color-background)]",
            "px-3 py-2 text-sm text-[var(--color-foreground)] font-mono",
            "placeholder:text-[var(--color-muted-foreground)]",
            "focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:ring-offset-1",
            "resize-y min-h-[96px]",
          ].join(" ")}
          spellCheck={false}
        />
        <p className="text-xs text-[var(--color-muted-foreground)]">
          One directory name per line. These are merged with the built-in skip list (
          <code className="rounded bg-[var(--color-accent)] px-1 py-0.5 text-[10px] font-mono">
            node_modules
          </code>
          ,{" "}
          <code className="rounded bg-[var(--color-accent)] px-1 py-0.5 text-[10px] font-mono">
            target
          </code>
          ,{" "}
          <code className="rounded bg-[var(--color-accent)] px-1 py-0.5 text-[10px] font-mono">
            dist
          </code>
          , …) and applied when scanning the workspace for git repositories on the Git page. Stored
          as a newline-separated string in settings; parsed at scan time.
        </p>
      </div>
    </section>
  );
}
