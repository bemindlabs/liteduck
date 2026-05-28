import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { cn } from "@/lib/utils";
import { TERMINAL_OPTIONS } from "@/lib/terminal-theme";

import "@xterm/xterm/css/xterm.css";

interface TerminalPaneProps {
  tabId: string;
  visible: boolean;
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  onRegister: (xterm: XTerm) => void;
  onUnregister: () => void;
}

export function TerminalPane({
  tabId,
  visible,
  onInput,
  onResize,
  onRegister,
  onUnregister,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

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

  return (
    <div
      ref={containerRef}
      className={cn("absolute inset-0", !visible && "pointer-events-none invisible")}
      style={{ backgroundColor: "var(--color-background)" }}
      aria-label={`Terminal pane ${tabId}`}
    />
  );
}
