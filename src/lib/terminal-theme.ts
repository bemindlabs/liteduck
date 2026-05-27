import type { ITheme, ITerminalOptions } from "@xterm/xterm";

/**
 * Shared Dracula-inspired terminal colour palette used across all xterm.js
 * instances in the app (TerminalTabs, SshTerminalTab, AgentTerminalPage).
 */
export const TERMINAL_THEME: ITheme = {
  background: "#0d0d0d",
  foreground: "#f0f0f0",
  cursor: "#a0a0a0",
  cursorAccent: "#0d0d0d",
  selectionBackground: "#2e2e2e",
  black: "#1a1a1a",
  red: "#ff5555",
  green: "#50fa7b",
  yellow: "#f1fa8c",
  blue: "#6272a4",
  magenta: "#ff79c6",
  cyan: "#8be9fd",
  white: "#f8f8f2",
  brightBlack: "#44475a",
  brightRed: "#ff6e6e",
  brightGreen: "#69ff94",
  brightYellow: "#ffffa5",
  brightBlue: "#d6acff",
  brightMagenta: "#ff92df",
  brightCyan: "#a4ffff",
  brightWhite: "#ffffff",
};

/**
 * Common xterm.js constructor options shared by all terminal instances.
 * Spread these into the Terminal/XTerm constructor, then add any
 * instance-specific overrides afterwards.
 */
export const TERMINAL_OPTIONS: ITerminalOptions = {
  theme: TERMINAL_THEME,
  fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
  fontSize: 13,
  lineHeight: 1.3,
  cursorBlink: true,
  allowTransparency: true,
  allowProposedApi: true,
  scrollback: 5000,
  convertEol: true,
};
