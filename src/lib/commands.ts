/**
 * Command registry for the Command Palette.
 *
 * Every item reachable via Cmd+K is described here as a typed Command.
 * The palette component consumes this registry directly; new commands
 * can be added without touching the UI layer.
 */

import { ROUTES } from "@/lib/routes";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CommandCategory = "Pages" | "Actions" | "Recent";

export interface Command {
  /** Unique, stable identifier used for recent-history tracking. */
  id: string;
  /** Display label shown in the palette. */
  title: string;
  /** Grouping label rendered as a section header. */
  category: CommandCategory;
  /**
   * Lucide icon name (string) so that the registry stays plain-data.
   * The palette component maps icon names to React nodes.
   */
  icon: string;
  /** Optional keyboard shortcut hint (display only, not registered here). */
  shortcut?: string;
  /** Extra terms boosting fuzzy-match recall. */
  keywords?: string[];
  /**
   * Runtime action.  Undefined until the palette injects navigate / toggleDark
   * at call time; action stubs are no-ops until wired up.
   */
  action?: () => void;
}

// ── Static registry ───────────────────────────────────────────────────────────

/**
 * The canonical list of all commands available in the palette.
 * Order within a category determines the default (non-recent) display order.
 */
export const COMMANDS: Command[] = [
  // ── Pages ────────────────────────────────────────────────────────────────

  {
    id: "page-terminal",
    title: "Terminal",
    category: "Pages",
    icon: "Terminal",
    shortcut: "⌘1",
    keywords: ["shell", "console", "cli"],
  },
  {
    id: "page-git",
    title: "Git",
    category: "Pages",
    icon: "GitBranch",
    shortcut: "⌘3",
    keywords: ["git", "changes", "diff", "history", "worktrees", "branches"],
  },
  {
    id: "page-files",
    title: "Files",
    category: "Pages",
    icon: "FolderTree",
    keywords: ["files", "explorer", "tree", "browse", "directories"],
  },
  {
    id: "page-notifications",
    title: "Notifications",
    category: "Pages",
    icon: "Bell",
    keywords: ["notifications", "alerts", "messages", "inbox"],
  },
  {
    id: "page-settings",
    title: "Settings",
    category: "Pages",
    icon: "Settings",
    shortcut: "⌘,",
    keywords: ["preferences", "config", "options"],
  },

  // ── Actions ────────────────────────────────────────────────────────────────

  {
    id: "action-new-terminal",
    title: "New Terminal Tab",
    category: "Actions",
    icon: "Plus",
    keywords: ["open", "spawn", "tab", "terminal"],
  },
  {
    id: "action-close-tab",
    title: "Close Tab",
    category: "Actions",
    icon: "X",
    keywords: ["close", "kill", "remove"],
  },
  {
    id: "action-split-h",
    title: "Split Terminal Horizontal",
    category: "Actions",
    icon: "Rows2",
    keywords: ["pane", "divide", "layout", "horizontal"],
  },
  {
    id: "action-split-v",
    title: "Split Terminal Vertical",
    category: "Actions",
    icon: "Columns2",
    keywords: ["pane", "divide", "layout", "vertical"],
  },
  {
    id: "action-toggle-sidebar",
    title: "Toggle Sidebar",
    category: "Actions",
    icon: "PanelLeft",
    keywords: ["sidebar", "nav", "collapse", "expand"],
  },
  {
    id: "action-toggle-focus",
    title: "Toggle Focus Mode",
    category: "Actions",
    icon: "Columns2",
    shortcut: "⌘⇧F",
    keywords: ["focus", "zen", "distraction", "fullscreen", "maximize"],
  },
  {
    id: "action-toggle-dark",
    title: "Toggle Dark Mode",
    category: "Actions",
    icon: "Sun",
    keywords: ["theme", "light", "dark", "appearance"],
  },
];

// ── Route map ─────────────────────────────────────────────────────────────────

/** Maps a page command id to its React Router path. */
export const PAGE_ROUTES: Record<string, string> = {
  "page-terminal": ROUTES.TERMINAL,
  "page-git": ROUTES.GIT,
  "page-files": ROUTES.FILES,
  "page-notifications": ROUTES.NOTIFICATIONS,
  "page-settings": ROUTES.SETTINGS,
};

// ── Recent-history helpers ────────────────────────────────────────────────────

const RECENT_KEY = "cmd_palette_recent";
const MAX_RECENT = 5;

export function loadRecentIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveRecentId(id: string): void {
  const recent = loadRecentIds().filter((r) => r !== id);
  recent.unshift(id);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

// ── Fuzzy matching ────────────────────────────────────────────────────────────

/**
 * Returns true when every character in `query` appears in `target` (in order),
 * case-insensitive.  This gives VS Code-style subsequence matching.
 */
export function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true;
  const t = target.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0;
  for (const char of q) {
    const found = t.indexOf(char, ti);
    if (found === -1) return false;
    ti = found + 1;
  }
  return true;
}

/** Returns true when the command matches the search query. */
export function commandMatchesQuery(cmd: Command, query: string): boolean {
  if (!query) return true;
  if (fuzzyMatch(query, cmd.title)) return true;
  if (cmd.keywords?.some((kw) => fuzzyMatch(query, kw))) return true;
  return false;
}

/**
 * Filters and sorts commands for the given query.
 * When query is empty, recently-used commands float to the top.
 */
export function filterCommands(commands: Command[], query: string, recentIds: string[]): Command[] {
  const matched = commands.filter((cmd) => commandMatchesQuery(cmd, query));

  if (query) return matched;

  return [...matched].sort((a, b) => {
    const ai = recentIds.indexOf(a.id);
    const bi = recentIds.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}
