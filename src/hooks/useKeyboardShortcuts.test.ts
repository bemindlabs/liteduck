import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  useKeyboardShortcuts,
  resolveBindings,
  formatShortcut,
  loadShortcutOverrides,
  saveShortcutOverrides,
  resetShortcutOverrides,
  DEFAULT_BINDINGS,
  type ShortcutBinding,
  type ShortcutOverrides,
} from "./useKeyboardShortcuts";
import { ROUTES } from "@/lib/routes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKeyEvent(
  key: string,
  opts: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean } = {},
): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  });
}

function fireKey(
  key: string,
  opts: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean } = {},
) {
  window.dispatchEvent(makeKeyEvent(key, opts));
}

/** Minimal config with all required callbacks stubbed. */
function makeConfig(overrides: Partial<Parameters<typeof useKeyboardShortcuts>[0]> = {}) {
  return {
    onOpenCommandPalette: vi.fn(),
    onOpenShortcutsHelp: vi.fn(),
    onNewTerminalTab: vi.fn(),
    onCloseTerminalTab: vi.fn(),
    navigate: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveBindings
// ---------------------------------------------------------------------------

describe("resolveBindings", () => {
  it("returns DEFAULT_BINDINGS unchanged when no overrides", () => {
    expect(resolveBindings({})).toEqual(DEFAULT_BINDINGS);
  });

  it("applies an override to the first occurrence of an action", () => {
    const overrides: ShortcutOverrides = {
      "navigate-terminal": { key: "9", mod: true },
    };
    const resolved = resolveBindings(overrides);
    const terminalBinding = resolved.find((b) => b.action === "navigate-terminal");
    expect(terminalBinding?.key).toBe("9");
  });

  it("does NOT apply override to the second occurrence of a duplicated action", () => {
    // "open-command-palette" appears twice (Cmd+K and Cmd+Shift+P)
    const overrides: ShortcutOverrides = {
      "open-command-palette": { key: "o", mod: true },
    };
    const resolved = resolveBindings(overrides);
    const paletteBindings = resolved.filter((b) => b.action === "open-command-palette");
    expect(paletteBindings[0].key).toBe("o"); // first entry overridden
    expect(paletteBindings[1].key).toBe("p"); // second entry untouched
  });

  it("preserves non-overridden bindings", () => {
    const overrides: ShortcutOverrides = {
      "navigate-git": { key: "g", mod: true },
    };
    const resolved = resolveBindings(overrides);
    const filesBinding = resolved.find((b) => b.action === "navigate-files");
    expect(filesBinding?.key).toBe("2"); // still default
  });

  it("overrides can change the shift modifier", () => {
    const overrides: ShortcutOverrides = {
      "navigate-files": { key: "2", mod: true, shift: true },
    };
    const resolved = resolveBindings(overrides);
    const filesBinding = resolved.find((b) => b.action === "navigate-files");
    expect(filesBinding?.shift).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatShortcut
// ---------------------------------------------------------------------------

describe("formatShortcut", () => {
  it("formats a mod-only binding on macOS as Cmd+KEY", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)" });
    const binding: ShortcutBinding = {
      action: "navigate-terminal",
      label: "",
      description: "",
      key: "1",
      mod: true,
    };
    expect(formatShortcut(binding)).toBe("Cmd+1");
    vi.unstubAllGlobals();
  });

  it("formats a mod-only binding on Windows/Linux as Ctrl+KEY", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" });
    const binding: ShortcutBinding = {
      action: "navigate-terminal",
      label: "",
      description: "",
      key: "1",
      mod: true,
    };
    expect(formatShortcut(binding)).toBe("Ctrl+1");
    vi.unstubAllGlobals();
  });

  it("includes Shift when binding.shift is true", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)" });
    const binding: ShortcutBinding = {
      action: "open-command-palette",
      label: "",
      description: "",
      key: "p",
      mod: true,
      shift: true,
    };
    expect(formatShortcut(binding)).toBe("Cmd+Shift+P");
    vi.unstubAllGlobals();
  });

  it("uses comma literal (not uppercased) for the comma key", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)" });
    const binding: ShortcutBinding = {
      action: "navigate-settings",
      label: "",
      description: "",
      key: ",",
      mod: true,
    };
    expect(formatShortcut(binding)).toBe("Cmd+,");
    vi.unstubAllGlobals();
  });

  it("uppercases letter keys", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)" });
    const binding: ShortcutBinding = {
      action: "open-command-palette",
      label: "",
      description: "",
      key: "k",
      mod: true,
    };
    expect(formatShortcut(binding)).toBe("Cmd+K");
    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

describe("shortcut override localStorage helpers", () => {
  const STORAGE_KEY = "aidlc_shortcut_overrides";

  // Use a simple in-memory store to simulate localStorage across tests.
  // We mock the global `localStorage` object directly because jsdom in this
  // project's Tauri environment may not expose a fully-functional Storage API.
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete store[key];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loadShortcutOverrides returns empty object when nothing stored", () => {
    expect(loadShortcutOverrides()).toEqual({});
  });

  it("saveShortcutOverrides persists overrides to localStorage", () => {
    const overrides: ShortcutOverrides = { "navigate-terminal": { key: "9", mod: true } };
    saveShortcutOverrides(overrides);
    expect(loadShortcutOverrides()).toEqual(overrides);
  });

  it("resetShortcutOverrides removes the stored key", () => {
    saveShortcutOverrides({ "navigate-terminal": { key: "9", mod: true } });
    resetShortcutOverrides();
    expect(loadShortcutOverrides()).toEqual({});
  });

  it("loadShortcutOverrides returns empty object when stored value is malformed JSON", () => {
    store[STORAGE_KEY] = "not-json{{{";
    expect(loadShortcutOverrides()).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// useKeyboardShortcuts hook
// ---------------------------------------------------------------------------

describe("useKeyboardShortcuts — navigation shortcuts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fires navigate(TERMINAL) on Cmd+1", () => {
    const config = makeConfig();
    renderHook(() => useKeyboardShortcuts(config));

    fireKey("1", { metaKey: true });

    expect(config.navigate).toHaveBeenCalledWith(ROUTES.TERMINAL);
  });

  it("fires navigate(FILES) on Cmd+2", () => {
    const config = makeConfig();
    renderHook(() => useKeyboardShortcuts(config));

    fireKey("2", { metaKey: true });

    expect(config.navigate).toHaveBeenCalledWith(ROUTES.FILES);
  });

  it("fires navigate(GIT) on Cmd+3", () => {
    const config = makeConfig();
    renderHook(() => useKeyboardShortcuts(config));

    fireKey("3", { metaKey: true });

    expect(config.navigate).toHaveBeenCalledWith(ROUTES.GIT);
  });

  it("fires navigate(SETTINGS) on Cmd+,", () => {
    const config = makeConfig();
    renderHook(() => useKeyboardShortcuts(config));

    fireKey(",", { metaKey: true });

    expect(config.navigate).toHaveBeenCalledWith(ROUTES.SETTINGS);
  });

  it("accepts Ctrl as the mod key (Windows/Linux)", () => {
    const config = makeConfig();
    renderHook(() => useKeyboardShortcuts(config));

    fireKey("1", { ctrlKey: true });

    expect(config.navigate).toHaveBeenCalledWith(ROUTES.TERMINAL);
  });

  it("does NOT navigate when mod key is absent", () => {
    const config = makeConfig();
    renderHook(() => useKeyboardShortcuts(config));

    fireKey("1"); // no mod

    expect(config.navigate).not.toHaveBeenCalled();
  });
});

describe("useKeyboardShortcuts — action shortcuts", () => {
  it("calls onOpenCommandPalette on Cmd+K", () => {
    const config = makeConfig();
    renderHook(() => useKeyboardShortcuts(config));

    fireKey("k", { metaKey: true });

    expect(config.onOpenCommandPalette).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenCommandPalette on Cmd+Shift+P (alternate binding)", () => {
    const config = makeConfig();
    renderHook(() => useKeyboardShortcuts(config));

    fireKey("p", { metaKey: true, shiftKey: true });

    expect(config.onOpenCommandPalette).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenShortcutsHelp on Cmd+/", () => {
    const config = makeConfig();
    renderHook(() => useKeyboardShortcuts(config));

    fireKey("/", { metaKey: true });

    expect(config.onOpenShortcutsHelp).toHaveBeenCalledTimes(1);
  });

  it("calls onNewTerminalTab on Cmd+T", () => {
    const config = makeConfig();
    renderHook(() => useKeyboardShortcuts(config));

    fireKey("t", { metaKey: true });

    expect(config.onNewTerminalTab).toHaveBeenCalledTimes(1);
  });

  it("calls onCloseTerminalTab on Cmd+W", () => {
    const config = makeConfig();
    renderHook(() => useKeyboardShortcuts(config));

    fireKey("w", { metaKey: true });

    expect(config.onCloseTerminalTab).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleFocusMode on Cmd+Shift+F when provided", () => {
    const onToggleFocusMode = vi.fn();
    const config = makeConfig({ onToggleFocusMode });
    renderHook(() => useKeyboardShortcuts(config));

    fireKey("f", { metaKey: true, shiftKey: true });

    expect(onToggleFocusMode).toHaveBeenCalledTimes(1);
  });

  it("does NOT throw when onToggleFocusMode is absent and Cmd+Shift+F fires", () => {
    const config = makeConfig(); // no onToggleFocusMode
    const { unmount } = renderHook(() => useKeyboardShortcuts(config));

    expect(() => {
      fireKey("f", { metaKey: true, shiftKey: true });
    }).not.toThrow();

    unmount();
  });

  it("calls onToggleTerminalDock on Cmd+` (no shift)", () => {
    const onToggleTerminalDock = vi.fn();
    const onToggleTerminalMaximize = vi.fn();
    const config = makeConfig({ onToggleTerminalDock, onToggleTerminalMaximize });
    renderHook(() => useKeyboardShortcuts(config));

    fireKey("`", { metaKey: true });

    expect(onToggleTerminalDock).toHaveBeenCalledTimes(1);
    expect(onToggleTerminalMaximize).not.toHaveBeenCalled();
  });

  it("calls onToggleTerminalMaximize on Cmd+Shift+` (and not the dock toggle)", () => {
    const onToggleTerminalDock = vi.fn();
    const onToggleTerminalMaximize = vi.fn();
    const config = makeConfig({ onToggleTerminalDock, onToggleTerminalMaximize });
    renderHook(() => useKeyboardShortcuts(config));

    fireKey("`", { metaKey: true, shiftKey: true });

    expect(onToggleTerminalMaximize).toHaveBeenCalledTimes(1);
    expect(onToggleTerminalDock).not.toHaveBeenCalled();
  });

  it("does NOT throw when onToggleTerminalMaximize is absent and Cmd+Shift+` fires", () => {
    const config = makeConfig(); // no onToggleTerminalMaximize
    const { unmount } = renderHook(() => useKeyboardShortcuts(config));

    expect(() => {
      fireKey("`", { metaKey: true, shiftKey: true });
    }).not.toThrow();

    unmount();
  });
});

describe("useKeyboardShortcuts — typing target suppression", () => {
  it("suppresses non-globalOverride shortcuts when focus is inside an <input>", () => {
    const config = makeConfig();
    renderHook(() => useKeyboardShortcuts(config));

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    fireKey("1", { metaKey: true }); // navigate-terminal — not globalOverride

    expect(config.navigate).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("suppresses non-globalOverride shortcuts when focus is inside a <textarea>", () => {
    const config = makeConfig();
    renderHook(() => useKeyboardShortcuts(config));

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    fireKey("k", { metaKey: true }); // open-command-palette — not globalOverride

    expect(config.onOpenCommandPalette).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  it("does NOT suppress globalOverride shortcuts inside an <input>", () => {
    const config = makeConfig();
    renderHook(() => useKeyboardShortcuts(config));

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    fireKey("t", { metaKey: true }); // terminal-new-tab — globalOverride: true

    expect(config.onNewTerminalTab).toHaveBeenCalledTimes(1);
    document.body.removeChild(input);
  });

  it("does NOT suppress globalOverride shortcuts inside a contenteditable element", () => {
    const config = makeConfig();
    renderHook(() => useKeyboardShortcuts(config));

    const div = document.createElement("div");
    div.contentEditable = "true";
    document.body.appendChild(div);
    div.focus();

    fireKey("w", { metaKey: true }); // terminal-close-tab — globalOverride: true

    expect(config.onCloseTerminalTab).toHaveBeenCalledTimes(1);
    document.body.removeChild(div);
  });
});

describe("useKeyboardShortcuts — cleanup", () => {
  it("removes the keydown listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const config = makeConfig();
    const { unmount } = renderHook(() => useKeyboardShortcuts(config));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("does not fire callbacks after unmount", () => {
    const config = makeConfig();
    const { unmount } = renderHook(() => useKeyboardShortcuts(config));

    unmount();

    fireKey("1", { metaKey: true });

    expect(config.navigate).not.toHaveBeenCalled();
  });
});

describe("useKeyboardShortcuts — custom bindings", () => {
  it("respects custom bindings passed via the bindings prop", () => {
    const customBindings: ShortcutBinding[] = [
      {
        action: "open-command-palette",
        label: "Command Palette",
        description: "Open command palette",
        key: "m",
        mod: true,
      },
    ];
    const config = makeConfig({ bindings: customBindings });
    renderHook(() => useKeyboardShortcuts(config));

    fireKey("m", { metaKey: true });

    expect(config.onOpenCommandPalette).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire for the default Cmd+K when a fully custom binding set is provided", () => {
    const customBindings: ShortcutBinding[] = [
      {
        action: "open-command-palette",
        label: "Command Palette",
        description: "Open command palette",
        key: "m",
        mod: true,
      },
    ];
    const config = makeConfig({ bindings: customBindings });
    renderHook(() => useKeyboardShortcuts(config));

    fireKey("k", { metaKey: true }); // default — should NOT match custom set

    expect(config.onOpenCommandPalette).not.toHaveBeenCalled();
  });
});
