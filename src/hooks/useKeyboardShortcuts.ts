import { useEffect, useCallback } from "react";
import { ROUTES } from "@/lib/routes";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ShortcutAction =
  | "navigate-terminal"
  | "navigate-files"
  | "navigate-git"
  | "navigate-settings"
  | "open-command-palette"
  | "open-shortcuts-help"
  | "terminal-new-tab"
  | "terminal-close-tab"
  | "toggle-focus-mode"
  | "toggle-side-panel"
  | "toggle-terminal-dock";

/**
 * Describes a single keyboard shortcut binding.
 *
 * `key` follows the `KeyboardEvent.key` value (e.g. "k", "1", ",", "/").
 * `mod` requires Cmd (macOS) or Ctrl (Windows/Linux) to be held.
 * `shift` additionally requires the Shift modifier.
 */
export interface ShortcutBinding {
  action: ShortcutAction;
  label: string;
  description: string;
  key: string;
  mod: boolean;
  shift?: boolean;
  /** When true the shortcut fires even while a terminal/input has focus */
  globalOverride?: boolean;
}

/**
 * A partial override map that replaces specific bindings while keeping the rest
 * at their defaults. Keyed by action.
 */
export type ShortcutOverrides = Partial<
  Record<ShortcutAction, Pick<ShortcutBinding, "key" | "mod" | "shift">>
>;

// ── Storage ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = "aidlc_shortcut_overrides";

export function loadShortcutOverrides(): ShortcutOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ShortcutOverrides) : {};
  } catch {
    // Best-effort: shortcut action failure is non-fatal
    return {};
  }
}

export function saveShortcutOverrides(overrides: ShortcutOverrides): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // localStorage unavailable — silently ignore
  }
}

export function resetShortcutOverrides(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ── Default bindings ──────────────────────────────────────────────────────────

export const DEFAULT_BINDINGS: ShortcutBinding[] = [
  {
    action: "navigate-terminal",
    label: "Go to Terminal",
    description: "Switch to the Terminal page",
    key: "1",
    mod: true,
  },
  {
    action: "navigate-files",
    label: "Go to Files",
    description: "Switch to the Files page",
    key: "2",
    mod: true,
  },
  {
    action: "navigate-git",
    label: "Go to Git",
    description: "Switch to the Git page",
    key: "3",
    mod: true,
  },
  {
    action: "navigate-settings",
    label: "Open Settings",
    description: "Switch to the Settings page",
    key: ",",
    mod: true,
  },
  {
    action: "open-command-palette",
    label: "Command Palette",
    description: "Open the command palette",
    key: "k",
    mod: true,
  },
  {
    action: "open-command-palette",
    label: "Command Palette (alt)",
    description: "Open the command palette (alternative binding)",
    key: "p",
    mod: true,
    shift: true,
  },
  {
    action: "open-shortcuts-help",
    label: "Keyboard Shortcuts",
    description: "Show all keyboard shortcuts",
    key: "/",
    mod: true,
  },
  {
    action: "terminal-new-tab",
    label: "New Terminal Tab",
    description: "Open a new terminal tab",
    key: "t",
    mod: true,
    globalOverride: true,
  },
  {
    action: "terminal-close-tab",
    label: "Close Terminal Tab",
    description: "Close the active terminal tab",
    key: "w",
    mod: true,
    globalOverride: true,
  },
  {
    action: "toggle-focus-mode",
    label: "Toggle Focus Mode",
    description: "Hide all chrome for distraction-free editing",
    key: "f",
    mod: true,
    shift: true,
    globalOverride: true,
  },
  {
    action: "toggle-side-panel",
    label: "Toggle Side Panel",
    description: "Show or hide the workspace side panel (file tree / git / settings)",
    key: "b",
    mod: true,
  },
  {
    action: "toggle-terminal-dock",
    label: "Toggle Terminal",
    description: "Show or hide the bottom terminal dock",
    key: "`",
    mod: true,
    globalOverride: true,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Merges saved overrides into the default bindings, producing the resolved
 * list. Actions with duplicate entries (e.g. open-command-palette appears
 * twice for Cmd+K and Cmd+Shift+P) keep all entries; overrides only replace
 * the primary (first) occurrence.
 */
export function resolveBindings(overrides: ShortcutOverrides): ShortcutBinding[] {
  const seen = new Set<ShortcutAction>();
  return DEFAULT_BINDINGS.map((binding) => {
    const override = overrides[binding.action];
    // Only apply the override to the first occurrence of each action.
    if (override && !seen.has(binding.action)) {
      seen.add(binding.action);
      return { ...binding, ...override };
    }
    seen.add(binding.action);
    return binding;
  });
}

/** Format a binding as a human-readable label like "Cmd+K" or "Cmd+Shift+P". */
export function formatShortcut(binding: ShortcutBinding): string {
  const isMac =
    typeof navigator !== "undefined" &&
    // navigator.platform is deprecated; fall back to userAgent heuristic.
    /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
  const modLabel = isMac ? "Cmd" : "Ctrl";
  const parts: string[] = [];
  if (binding.mod) parts.push(modLabel);
  if (binding.shift) parts.push("Shift");
  parts.push(binding.key === "," ? "," : binding.key.toUpperCase());
  return parts.join("+");
}

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = (el as HTMLElement).tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

// ── Hook config ───────────────────────────────────────────────────────────────

export interface KeyboardShortcutsConfig {
  /** Called when any "open-command-palette" shortcut fires. */
  onOpenCommandPalette: () => void;
  /** Called when any "open-shortcuts-help" shortcut fires. */
  onOpenShortcutsHelp: () => void;
  /** Called when "terminal-new-tab" fires. */
  onNewTerminalTab: () => void;
  /** Called when "terminal-close-tab" fires. */
  onCloseTerminalTab: () => void;
  /** Called when "toggle-focus-mode" fires. */
  onToggleFocusMode?: () => void;
  /** Called when "toggle-side-panel" (Cmd+B) fires. */
  onToggleSidePanel?: () => void;
  /** Called when "toggle-terminal-dock" (Cmd+`) fires. */
  onToggleTerminalDock?: () => void;
  /** React Router (or similar) navigate function. */
  navigate: (path: string) => void | Promise<void>;
  /**
   * Resolved shortcut bindings. Defaults to DEFAULT_BINDINGS when omitted.
   * Pass the result of `resolveBindings(loadShortcutOverrides())` to respect
   * user customisations.
   */
  bindings?: ShortcutBinding[];
}

// ── Page routes map ───────────────────────────────────────────────────────────

const ACTION_ROUTES: Partial<Record<ShortcutAction, string>> = {
  "navigate-terminal": ROUTES.TERMINAL,
  "navigate-files": ROUTES.FILES,
  "navigate-git": ROUTES.GIT,
  "navigate-settings": ROUTES.SETTINGS,
};

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Registers global keyboard shortcuts for the LiteDuck application.
 *
 * Navigation shortcuts (Cmd+1-4, Cmd+5-6, Cmd+,) fire only when focus is not inside a
 * form element. Terminal shortcuts (Cmd+T, Cmd+W) fire globally because they
 * need to work inside the xterm.js canvas — they are marked `globalOverride`.
 */
export function useKeyboardShortcuts({
  onOpenCommandPalette,
  onOpenShortcutsHelp,
  onNewTerminalTab,
  onCloseTerminalTab,
  onToggleFocusMode,
  onToggleSidePanel,
  onToggleTerminalDock,
  navigate,
  bindings = DEFAULT_BINDINGS,
}: KeyboardShortcutsConfig) {
  const handleAction = useCallback(
    (action: ShortcutAction) => {
      const route = ACTION_ROUTES[action];
      if (route) {
        void navigate(route);
        return;
      }
      switch (action) {
        case "open-command-palette":
          onOpenCommandPalette();
          break;
        case "open-shortcuts-help":
          onOpenShortcutsHelp();
          break;
        case "terminal-new-tab":
          onNewTerminalTab();
          break;
        case "terminal-close-tab":
          onCloseTerminalTab();
          break;
        case "toggle-focus-mode":
          onToggleFocusMode?.();
          break;
        case "toggle-side-panel":
          onToggleSidePanel?.();
          break;
        case "toggle-terminal-dock":
          onToggleTerminalDock?.();
          break;
        default:
          break;
      }
    },
    [
      navigate,
      onOpenCommandPalette,
      onOpenShortcutsHelp,
      onNewTerminalTab,
      onCloseTerminalTab,
      onToggleFocusMode,
      onToggleSidePanel,
      onToggleTerminalDock,
    ],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;

      for (const binding of bindings) {
        const modMatch = binding.mod ? mod : !mod;
        const shiftMatch = binding.shift ? e.shiftKey : !e.shiftKey;
        const keyMatch = e.key.toLowerCase() === binding.key.toLowerCase();

        if (!modMatch || !shiftMatch || !keyMatch) continue;

        // Skip form-element suppression for globalOverride shortcuts.
        if (!binding.globalOverride && isTypingTarget(document.activeElement)) {
          continue;
        }

        e.preventDefault();
        handleAction(binding.action);
        // Stop after the first match to avoid double-firing when two bindings
        // share the same keys (which should not happen but is a safeguard).
        break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [bindings, handleAction]);
}
