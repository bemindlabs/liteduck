/**
 * OutputView — renders a plugin command's stdout via the **declarative-view**
 * model. The command's manifest `view` (`text` | `table` | `list` | `keyvalue`
 * | `markdown`) selects a trusted built-in renderer; the plugin only supplies
 * *data*. No plugin JS/HTML ever executes (charter). All data renders as React
 * text nodes (auto-escaped); markdown goes through the sanitized `Markdown`
 * component.
 *
 * Robustness contract: if the stdout does not match the declared view's shape,
 * we fall back to a monospace `text` render and surface a small inline error
 * banner — never a crash, never a blank page.
 */

import { Markdown } from "@/components/Markdown";
import {
  type KeyValueData,
  type ListData,
  type TableData,
  normalizeView,
  parseKeyValue,
  parseList,
  parseTable,
} from "./parseOutput";

interface OutputViewProps {
  /** The manifest `view` field (may be unknown/undefined → treated as text). */
  view: string | undefined;
  /** Raw stdout from the command. */
  raw: string;
}

export function OutputView({ view, raw }: OutputViewProps) {
  const resolved = normalizeView(view);

  switch (resolved) {
    case "table": {
      const parsed = parseTable(raw);
      return parsed.ok ? (
        <TableView data={parsed.data} />
      ) : (
        <FallbackText raw={raw} declaredView="table" error={parsed.error} />
      );
    }
    case "list": {
      const parsed = parseList(raw);
      return parsed.ok ? (
        <ListView data={parsed.data} />
      ) : (
        <FallbackText raw={raw} declaredView="list" error={parsed.error} />
      );
    }
    case "keyvalue": {
      const parsed = parseKeyValue(raw);
      return parsed.ok ? (
        <KeyValueView data={parsed.data} />
      ) : (
        <FallbackText raw={raw} declaredView="keyvalue" error={parsed.error} />
      );
    }
    case "markdown":
      // Markdown is sanitized inside the Markdown component (no raw HTML/script).
      return (
        <div className="rounded border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <Markdown content={raw} />
        </div>
      );
    case "text":
    default:
      return <TextView raw={raw} />;
  }
}

// ── text ────────────────────────────────────────────────────────────────────

export function TextView({ raw }: { raw: string }) {
  return (
    <pre className="overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-muted)] p-3 text-xs leading-relaxed">
      {raw.trim() || "(no output)"}
    </pre>
  );
}

// ── table ─────────────────────────────────────────────────────────────────────

export function TableView({ data }: { data: TableData }) {
  if (data.rows.length === 0) {
    return (
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-xs text-[var(--color-muted-foreground)]">
        No rows.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded border border-[var(--color-border)]">
      <table className="w-full text-left text-xs">
        <thead className="bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
          <tr>
            {data.columns.map((col) => (
              <th key={col} className="px-3 py-2 font-medium capitalize">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr
              key={i}
              className="border-t border-[var(--color-border)] hover:bg-[var(--color-muted)]/40"
            >
              {data.columns.map((_, ci) => (
                <td key={ci} className="px-3 py-1.5 align-top">
                  {row[ci] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── list ──────────────────────────────────────────────────────────────────────

export function ListView({ data }: { data: ListData }) {
  if (data.items.length === 0) {
    return (
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-xs text-[var(--color-muted-foreground)]">
        No items.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-[var(--color-border)] rounded border border-[var(--color-border)] bg-[var(--color-card)]">
      {data.items.map((item, i) => (
        <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm text-[var(--color-foreground)]">{item.title}</div>
            {item.subtitle && (
              <div className="truncate text-xs text-[var(--color-muted-foreground)]">
                {item.subtitle}
              </div>
            )}
          </div>
          {item.badge && (
            <span className="shrink-0 rounded bg-[var(--color-secondary)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-secondary-foreground)]">
              {item.badge}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// ── keyvalue ──────────────────────────────────────────────────────────────────

export function KeyValueView({ data }: { data: KeyValueData }) {
  if (data.pairs.length === 0) {
    return (
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-xs text-[var(--color-muted-foreground)]">
        No entries.
      </div>
    );
  }
  return (
    <dl className="divide-y divide-[var(--color-border)] rounded border border-[var(--color-border)] bg-[var(--color-card)]">
      {data.pairs.map(([key, value], i) => (
        <div key={i} className="flex gap-4 px-3 py-2">
          <dt className="w-40 shrink-0 text-xs font-medium text-[var(--color-muted-foreground)]">
            {key}
          </dt>
          <dd className="min-w-0 break-words text-xs text-[var(--color-foreground)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── fallback (malformed declared-view output) ─────────────────────────────────

function FallbackText({
  raw,
  declaredView,
  error,
}: {
  raw: string;
  declaredView: string;
  error: string;
}) {
  return (
    <div className="space-y-2">
      <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
        Could not render as <code>{declaredView}</code> — showing raw output instead. {error}
      </div>
      <TextView raw={raw} />
    </div>
  );
}
