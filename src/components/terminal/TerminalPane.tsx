import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { cn } from "@/lib/utils";
import { TERMINAL_OPTIONS } from "@/lib/terminal-theme";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { LITEDUCK_PATH_MIME, quotePathsForShell } from "@/utils/shellQuote";

import "@xterm/xterm/css/xterm.css";

interface TerminalPaneProps {
  tabId: string;
  visible: boolean;
  /**
   * Monotonic counter bumped by the split layout whenever a pane's size may
   * have changed (split / unsplit / Separator drag). A change forces a re-fit
   * so xterm reflows to the new container size and the PTY learns the new
   * cols/rows — the ResizeObserver alone can miss the transition during tree
   * restructuring.
   */
  layoutSignal?: number;
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  onRegister: (xterm: XTerm) => void;
  onUnregister: () => void;
  /** Open a fresh shell tab (context-menu "New Terminal"). */
  onNewTerminal?: () => void;
  /** Split this pane horizontally (context-menu "Split"). */
  onSplit?: () => void;
  /** Whether another split is currently possible (≤ 4 panes). */
  canSplit?: boolean;
}

interface PaneMenuState {
  x: number;
  y: number;
  hasSelection: boolean;
}

export function TerminalPane({
  tabId,
  visible,
  layoutSignal,
  onInput,
  onResize,
  onRegister,
  onUnregister,
  onNewTerminal,
  onSplit,
  canSplit = false,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [menu, setMenu] = useState<PaneMenuState | null>(null);
  const [dropActive, setDropActive] = useState(false);

  // Stable ref for onInput so the drop handler always uses the latest callback.
  const onInputRefForDrop = useRef(onInput);
  useEffect(() => {
    onInputRefForDrop.current = onInput;
  }, [onInput]);

  // Stable ref for `visible` so the native drop listener can ignore drops onto
  // hidden panes (split layout / background tabs all stay mounted).
  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  // Use refs for callbacks so the effect closure never becomes stale.
  const onInputRef = useRef(onInput);
  const onResizeRef = useRef(onResize);
  const onRegisterRef = useRef(onRegister);
  const onUnregisterRef = useRef(onUnregister);
  useEffect(() => {
    onInputRef.current = onInput;
  }, [onInput]);
  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);
  useEffect(() => {
    onRegisterRef.current = onRegister;
  }, [onRegister]);
  useEffect(() => {
    onUnregisterRef.current = onUnregister;
  }, [onUnregister]);

  // Mount xterm once per tabId.
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({ ...TERMINAL_OPTIONS });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    // Enable Unicode 11 for proper CJK, emoji, and international character widths.
    const unicodeAddon = new Unicode11Addon();
    term.loadAddon(unicodeAddon);
    term.unicode.activeVersion = "11";

    // Attach to DOM before loading WebGL.
    term.open(containerRef.current);

    // Attempt WebGL renderer; fall back to canvas on unsupported contexts.
    try {
      const webglAddon = new WebglAddon();
      // Dispose cleanly if WebGL context is lost.
      webglAddon.onContextLoss(() => webglAddon.dispose());
      term.loadAddon(webglAddon);
    } catch {
      // Canvas renderer remains active as fallback.
    }

    // Initial fit. Deferred across two animation frames so the flex layout has
    // settled before measuring, and re-run once the monospace web font finishes
    // loading — the font swap changes cell metrics, which would otherwise leave
    // the terminal sized to the fallback font and under-filling its container
    // (nothing re-fits afterward because the container's pixel size is stable).
    const initialFit = () => {
      try {
        fitAddon.fit();
      } catch {
        /* container not measurable yet */
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(initialFit));
    void document.fonts.ready.then(initialFit);

    // Custom key handler: decides which keys xterm.js processes vs browser.
    // Return true -> xterm handles (sends to PTY).
    // Return false -> browser/app handles (clipboard, navigation, etc.).
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      // Cmd+key -> let browser/app handle (Cmd+C copy, Cmd+V paste, Cmd+1 nav, etc.)
      if (e.metaKey) return false;

      if (e.ctrlKey && !e.altKey && !e.shiftKey) {
        const key = e.key.toLowerCase();
        // Ctrl+C: copy when text is selected, otherwise send SIGINT to terminal
        if (key === "c" && term.hasSelection()) return false;
        // Ctrl+V: always paste from clipboard
        if (key === "v") return false;
        // Ctrl+A: select all
        if (key === "a") return false;
        // Ctrl+X: cut
        if (key === "x" && term.hasSelection()) return false;
        // All other Ctrl+key -> terminal (Ctrl+L clear, Ctrl+D EOF, etc.)
        return true;
      }

      // Ctrl+Shift+C/V: copy/paste (Linux convention)
      if (e.ctrlKey && e.shiftKey) {
        const key = e.key.toLowerCase();
        if (key === "c" || key === "v") return false;
      }

      // Everything else -> let xterm handle
      return true;
    });

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    onRegisterRef.current(term);

    // Forward keyboard input via the stable ref.
    const dataDisposable = term.onData((data) => onInputRef.current(data));

    // Sync resize with backend via the stable ref.
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      onResizeRef.current(cols, rows);
    });

    // ResizeObserver drives FitAddon so the terminal fills its container.
    const ro = new ResizeObserver(() => {
      if (!fitAddonRef.current) return;
      try {
        fitAddonRef.current.fit();
      } catch {
        /* ignore */
      }
    });
    ro.observe(containerRef.current);

    return () => {
      dataDisposable.dispose();
      resizeDisposable.dispose();
      ro.disconnect();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      onUnregisterRef.current();
    };
  }, [tabId]);

  // Re-fit when this tab becomes visible after being hidden.
  useEffect(() => {
    if (visible && fitAddonRef.current) {
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit();
        } catch {
          /* ignore */
        }
      });
    }
  }, [visible]);

  // Re-fit when the split layout changes (split / unsplit / Separator drag).
  // Deferred across two animation frames so the new flex layout has settled
  // before we measure. `fit()` resizes xterm, whose onResize handler then
  // forwards the new cols/rows to the PTY. Skip when hidden — the visibility
  // effect above handles the re-fit when the pane is shown again.
  useEffect(() => {
    if (layoutSignal === undefined || !visible || !fitAddonRef.current) return;
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit();
        } catch {
          /* container not measurable yet */
        }
      }),
    );
    return () => cancelAnimationFrame(id);
  }, [layoutSignal, visible]);

  // ── Context-menu actions ────────────────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const term = xtermRef.current;
    setMenu({ x: e.clientX, y: e.clientY, hasSelection: term?.hasSelection() ?? false });
  }, []);

  const handleCopy = useCallback(async () => {
    const term = xtermRef.current;
    if (!term?.hasSelection()) return;
    try {
      await navigator.clipboard.writeText(term.getSelection());
    } catch {
      /* clipboard unavailable — silent */
    }
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onInput(text);
    } catch {
      /* clipboard unavailable — silent */
    }
  }, [onInput]);

  const handleSelectAll = useCallback(() => {
    xtermRef.current?.selectAll();
  }, []);

  const handleClear = useCallback(() => {
    xtermRef.current?.clear();
  }, []);

  // ── Drop handling (file-tree path → terminal) ─────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Only react to internal path drags; let native OS-file drops fall through
    // to Tauri's own handler.
    if (
      !e.dataTransfer.types.includes(LITEDUCK_PATH_MIME) &&
      !e.dataTransfer.types.includes("text/plain")
    ) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Ignore leaves into descendant elements.
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDropActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    setDropActive(false);
    const raw = e.dataTransfer.getData(LITEDUCK_PATH_MIME) || e.dataTransfer.getData("text/plain");
    if (!raw) return;
    e.preventDefault();
    // A drag may carry multiple newline-separated paths; quote + space-join.
    const paths = raw.split(/\r?\n/).filter((p) => p.trim().length > 0);
    const insert = quotePathsForShell(paths);
    if (insert) onInputRefForDrop.current(insert);
  }, []);

  // Native OS file drops (e.g. dragging from Finder/Explorer) → insert
  // shell-quoted path(s). HTML5 DataTransfer doesn't expose filesystem paths
  // inside Tauri webviews, so the React handlers above only catch internal
  // file-tree drags; native drops arrive via Tauri's own drag-drop event. We
  // bounds-check the cursor against this pane so only the pane under the drop
  // (and only when visible) consumes it.
  useEffect(() => {
    let cancelled = false;
    const within = (x: number, y: number) => {
      const el = containerRef.current;
      if (!el || !visibleRef.current) return false;
      const rect = el.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (cancelled) return;
      const payload = event.payload;
      if (payload.type === "over") {
        setDropActive(within(payload.position.x, payload.position.y));
        return;
      }
      if (payload.type === "leave") {
        setDropActive(false);
        return;
      }
      if (payload.type === "drop") {
        if (payload.paths.length === 0 || !within(payload.position.x, payload.position.y)) {
          setDropActive(false);
          return;
        }
        const insert = quotePathsForShell(payload.paths);
        if (insert) onInputRefForDrop.current(insert);
        setDropActive(false);
      }
    });
    return () => {
      cancelled = true;
      void unlisten.then((fn) => fn());
    };
  }, []);

  const menuItems: ContextMenuItem[] = menu
    ? [
        { label: "Copy", onSelect: handleCopy, show: menu.hasSelection },
        { label: "Paste", onSelect: handlePaste },
        { label: "Select All", onSelect: handleSelectAll },
        { label: "Clear", onSelect: handleClear },
        {
          label: "New Terminal",
          onSelect: () => onNewTerminal?.(),
          show: !!onNewTerminal,
          separatorBefore: true,
        },
        { label: "Split", onSelect: () => onSplit?.(), show: !!onSplit, disabled: !canSplit },
      ]
    : [];

  return (
    <>
      <div
        ref={containerRef}
        onContextMenu={handleContextMenu}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "absolute inset-0",
          !visible && "pointer-events-none invisible",
          dropActive && "ring-2 ring-inset ring-[var(--color-primary)]",
        )}
        style={{ backgroundColor: "var(--color-background)" }}
        aria-label={`Terminal pane ${tabId}`}
      />
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
          ariaLabel="Terminal actions"
        />
      )}
    </>
  );
}
