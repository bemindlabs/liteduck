import { describe, it, expect } from "vitest";
import { TERMINAL_THEME, TERMINAL_OPTIONS } from "./terminal-theme";

describe("terminal-theme", () => {
  // ── TERMINAL_THEME ────────────────────────────────────────────────────────

  describe("TERMINAL_THEME", () => {
    it("defines a background colour", () => {
      expect(TERMINAL_THEME.background).toBeDefined();
      expect(typeof TERMINAL_THEME.background).toBe("string");
    });

    it("defines a foreground colour", () => {
      expect(TERMINAL_THEME.foreground).toBeDefined();
      expect(typeof TERMINAL_THEME.foreground).toBe("string");
    });

    it("background colour is a valid hex colour string", () => {
      expect(TERMINAL_THEME.background).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it("foreground colour is a valid hex colour string", () => {
      expect(TERMINAL_THEME.foreground).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it("defines all 8 standard ANSI colours", () => {
      expect(TERMINAL_THEME.black).toBeDefined();
      expect(TERMINAL_THEME.red).toBeDefined();
      expect(TERMINAL_THEME.green).toBeDefined();
      expect(TERMINAL_THEME.yellow).toBeDefined();
      expect(TERMINAL_THEME.blue).toBeDefined();
      expect(TERMINAL_THEME.magenta).toBeDefined();
      expect(TERMINAL_THEME.cyan).toBeDefined();
      expect(TERMINAL_THEME.white).toBeDefined();
    });

    it("defines all 8 bright ANSI colour variants", () => {
      expect(TERMINAL_THEME.brightBlack).toBeDefined();
      expect(TERMINAL_THEME.brightRed).toBeDefined();
      expect(TERMINAL_THEME.brightGreen).toBeDefined();
      expect(TERMINAL_THEME.brightYellow).toBeDefined();
      expect(TERMINAL_THEME.brightBlue).toBeDefined();
      expect(TERMINAL_THEME.brightMagenta).toBeDefined();
      expect(TERMINAL_THEME.brightCyan).toBeDefined();
      expect(TERMINAL_THEME.brightWhite).toBeDefined();
    });

    it("all colour values are valid 6-digit hex strings", () => {
      const colourKeys = [
        "background",
        "foreground",
        "cursor",
        "cursorAccent",
        "selectionBackground",
        "black",
        "red",
        "green",
        "yellow",
        "blue",
        "magenta",
        "cyan",
        "white",
        "brightBlack",
        "brightRed",
        "brightGreen",
        "brightYellow",
        "brightBlue",
        "brightMagenta",
        "brightCyan",
        "brightWhite",
      ] as const;

      for (const key of colourKeys) {
        const value = TERMINAL_THEME[key];
        expect(value, `${key} should be a valid hex colour`).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });
  });

  // ── TERMINAL_OPTIONS ──────────────────────────────────────────────────────

  describe("TERMINAL_OPTIONS", () => {
    it("references TERMINAL_THEME as the theme", () => {
      expect(TERMINAL_OPTIONS.theme).toBe(TERMINAL_THEME);
    });

    it("specifies a fontFamily string", () => {
      expect(typeof TERMINAL_OPTIONS.fontFamily).toBe("string");
      expect(TERMINAL_OPTIONS.fontFamily!.length).toBeGreaterThan(0);
    });

    it("includes JetBrains Mono in the font stack", () => {
      expect(TERMINAL_OPTIONS.fontFamily).toContain("JetBrains Mono");
    });

    it("sets a positive fontSize", () => {
      expect(TERMINAL_OPTIONS.fontSize).toBeGreaterThan(0);
    });

    it("sets a positive lineHeight", () => {
      expect(TERMINAL_OPTIONS.lineHeight).toBeGreaterThan(0);
    });

    it("enables cursorBlink", () => {
      expect(TERMINAL_OPTIONS.cursorBlink).toBe(true);
    });

    it("enables allowTransparency", () => {
      expect(TERMINAL_OPTIONS.allowTransparency).toBe(true);
    });

    it("has a scrollback value of at least 1000 lines", () => {
      expect(TERMINAL_OPTIONS.scrollback).toBeGreaterThanOrEqual(1000);
    });

    it("enables convertEol", () => {
      expect(TERMINAL_OPTIONS.convertEol).toBe(true);
    });
  });
});
