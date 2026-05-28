/**
 * parseOutput — turn a plugin command's raw stdout into the typed shape its
 * declared `view` expects (declarative-views model, design note
 * `notes/2026-05-28_plugin-declarative-views.md`).
 *
 * The charter forbids plugin JS/HTML: a plugin only emits **data** and LiteDuck
 * renders it with **trusted built-in components**. These parsers never execute
 * anything — they only validate/normalize JSON into the per-view contract.
 *
 * Every parser is total: malformed input for the declared view returns a
 * `{ ok: false }` result so the caller can fall back to a `text` render with an
 * inline error banner (never a crash, never a blank page).
 */

import type { PluginView } from "@/lib/plugins";

// ── Per-view normalized shapes ────────────────────────────────────────────────

export interface TableData {
  columns: string[];
  rows: string[][];
}

export interface ListItem {
  title: string;
  subtitle?: string;
  badge?: string;
}

export interface ListData {
  items: ListItem[];
}

export interface KeyValueData {
  pairs: [string, string][];
}

/** A successful parse for `view`, or a failure carrying a reason for the banner. */
export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Coerce any JSON scalar/object into a display string (auto-JSON for objects). */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") return JSON.stringify(value);
  return "";
}

function tryParseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, error: "empty output" };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (e) {
    return { ok: false, error: `output is not valid JSON: ${String(e)}` };
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Normalize the manifest `view` field to a known renderer (unknown → text). */
export function normalizeView(view: string | undefined): PluginView {
  switch (view) {
    case "table":
    case "list":
    case "keyvalue":
    case "markdown":
    case "text":
      return view;
    default:
      return "text";
  }
}

// ── table ───────────────────────────────────────────────────────────────────

/**
 * Parse the `table` contract. Accepts EITHER the canonical
 * `{ columns: string[], rows: unknown[][] }` shape, OR an array-of-objects under
 * a common key (`items` / `agents` / `rows` / `issues`) or a bare top-level
 * array — deriving columns from the union of object keys (a `raw` key, which
 * bundled plugins emit as a debug echo, is skipped). This lets existing plugins
 * that emit `{agents:[{name,role,raw}]}` render as a table without changing
 * their script.
 */
export function parseTable(raw: string): ParseResult<TableData> {
  const parsed = tryParseJson(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const value = parsed.value;

  // Canonical shape: { columns, rows }.
  if (isRecord(value) && Array.isArray(value.columns) && Array.isArray(value.rows)) {
    const columns = value.columns.map((c) => cellText(c));
    const rows = (value.rows as unknown[]).map((row) =>
      Array.isArray(row) ? row.map((cell) => cellText(cell)) : [cellText(row)],
    );
    return { ok: true, data: { columns, rows } };
  }

  // Array-of-objects shape: derive columns from keys.
  const arr = extractObjectArray(value);
  if (arr) return tableFromObjects(arr);

  return {
    ok: false,
    error:
      'expected { "columns": [...], "rows": [[...]] } or an array of objects for view "table"',
  };
}

/** Pull an array-of-objects out of a bare array or a common wrapper key. */
function extractObjectArray(value: unknown): Record<string, unknown>[] | null {
  let candidate: unknown = null;
  if (Array.isArray(value)) {
    candidate = value;
  } else if (isRecord(value)) {
    for (const key of ["items", "agents", "rows", "issues", "data"]) {
      if (Array.isArray(value[key])) {
        candidate = value[key];
        break;
      }
    }
  }
  if (!Array.isArray(candidate) || candidate.length === 0) return null;
  if (!candidate.every(isRecord)) return null;
  return candidate;
}

function tableFromObjects(arr: Record<string, unknown>[]): ParseResult<TableData> {
  // Union of keys, in first-seen order; drop the debug `raw` echo.
  const columns: string[] = [];
  for (const obj of arr) {
    for (const key of Object.keys(obj)) {
      if (key === "raw") continue;
      if (!columns.includes(key)) columns.push(key);
    }
  }
  if (columns.length === 0) return { ok: false, error: "array of objects has no columns" };
  const rows = arr.map((obj) => columns.map((col) => cellText(obj[col])));
  return { ok: true, data: { columns, rows } };
}

// ── list ──────────────────────────────────────────────────────────────────────

/**
 * Parse the `list` contract. Accepts `{ items: [{title, subtitle?, badge?}, …] }`,
 * a bare `string[]`, or `{ items: string[] }`.
 */
export function parseList(raw: string): ParseResult<ListData> {
  const parsed = tryParseJson(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const value = parsed.value;

  const rawItems: unknown = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.items)
      ? value.items
      : null;
  if (!Array.isArray(rawItems)) {
    return { ok: false, error: 'expected { "items": [...] } or an array for view "list"' };
  }

  const items: ListItem[] = rawItems.map((entry) => {
    if (typeof entry === "string") return { title: entry };
    if (isRecord(entry)) {
      const item: ListItem = { title: cellText(entry.title ?? entry.name ?? entry) };
      if (entry.subtitle !== undefined) item.subtitle = cellText(entry.subtitle);
      if (entry.badge !== undefined) item.badge = cellText(entry.badge);
      return item;
    }
    return { title: cellText(entry) };
  });
  return { ok: true, data: { items } };
}

// ── keyvalue ──────────────────────────────────────────────────────────────────

/**
 * Parse the `keyvalue` contract. Accepts `{ pairs: [[k, v], …] }` or a flat
 * object (each top-level entry becomes a row).
 */
export function parseKeyValue(raw: string): ParseResult<KeyValueData> {
  const parsed = tryParseJson(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const value = parsed.value;

  if (isRecord(value) && Array.isArray(value.pairs)) {
    const pairs: [string, string][] = [];
    for (const pair of value.pairs) {
      if (Array.isArray(pair) && pair.length >= 1) {
        pairs.push([cellText(pair[0]), cellText(pair[1])]);
      } else {
        return { ok: false, error: 'each entry of "pairs" must be a [key, value] array' };
      }
    }
    return { ok: true, data: { pairs } };
  }

  if (isRecord(value)) {
    const pairs = Object.entries(value).map(
      ([k, v]) => [k, cellText(v)] as [string, string],
    );
    return { ok: true, data: { pairs } };
  }

  return { ok: false, error: 'expected { "pairs": [[k,v]] } or a flat object for view "keyvalue"' };
}
