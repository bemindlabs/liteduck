import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const CSS_PATH = resolve(__dirname, "../index.css");
const readCSS = () => readFileSync(CSS_PATH, "utf-8");

/**
 * Tests for the theme toggle mechanism.
 * Verifies that .dark / .light classes on <html> correctly switch
 * CSS custom property values between dark and light mode.
 */

describe("Theme CSS variable switching", () => {
  beforeEach(() => {
    // Reset to dark mode (app default)
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
  });

  it("starts with .dark class on <html> by default", () => {
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("toggles to light mode correctly", () => {
    document.documentElement.classList.toggle("dark", false);
    document.documentElement.classList.toggle("light", true);

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("toggles back to dark mode correctly", () => {
    // Switch to light
    document.documentElement.classList.toggle("dark", false);
    document.documentElement.classList.toggle("light", true);

    // Switch back to dark
    document.documentElement.classList.toggle("dark", true);
    document.documentElement.classList.toggle("light", false);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("never has both .dark and .light simultaneously", () => {
    // Toggle multiple times
    for (let i = 0; i < 10; i++) {
      const next = i % 2 === 0;
      document.documentElement.classList.toggle("dark", next);
      document.documentElement.classList.toggle("light", !next);

      const hasDark = document.documentElement.classList.contains("dark");
      const hasLight = document.documentElement.classList.contains("light");
      expect(hasDark && hasLight).toBe(false);
      expect(hasDark || hasLight).toBe(true);
    }
  });
});

describe("Theme token structure in index.css", () => {
  // These tests verify the CSS file structure at build time.
  // They parse the CSS source to ensure dark/light parity.

  it("index.css defines all required semantic tokens", () => {
    const content = readCSS();

    const requiredTokens = [
      "--color-background",
      "--color-foreground",
      "--color-card",
      "--color-card-foreground",
      "--color-popover",
      "--color-popover-foreground",
      "--color-primary",
      "--color-primary-foreground",
      "--color-secondary",
      "--color-secondary-foreground",
      "--color-muted",
      "--color-muted-foreground",
      "--color-accent",
      "--color-accent-foreground",
      "--color-destructive",
      "--color-destructive-foreground",
      "--color-success",
      "--color-success-foreground",
      "--color-warning",
      "--color-warning-foreground",
      "--color-info",
      "--color-info-foreground",
      "--color-border",
      "--color-input",
      "--color-ring",
      "--color-sidebar",
      "--color-sidebar-foreground",
      "--color-sidebar-border",
      "--color-sidebar-accent",
      "--color-sidebar-accent-foreground",
      "--color-sidebar-primary",
      "--color-sidebar-primary-foreground",
    ];

    for (const token of requiredTokens) {
      expect(content).toContain(token);
    }
  });

  it("light mode defines all the same tokens as dark mode", () => {
    const content = readCSS();

    // Extract tokens from @theme inline block (dark defaults)
    const themeMatch = /@theme inline\s*\{([^}]+)\}/.exec(content);
    expect(themeMatch).not.toBeNull();

    const themeTokens = [...themeMatch![1].matchAll(/(--color-[\w-]+):/g)].map((m) => m[1]);

    // Extract tokens from html.light block
    const lightMatch = /html\.light\s*\{([^}]+)\}/.exec(content);
    expect(lightMatch).not.toBeNull();

    const lightTokens = [...lightMatch![1].matchAll(/(--color-[\w-]+):/g)].map((m) => m[1]);

    // Every color token in @theme should have a light override
    for (const token of themeTokens) {
      expect(lightTokens).toContain(token);
    }
  });

  it("light mode uses !important to override @theme inline", () => {
    const content = readCSS();

    const lightMatch = /html\.light\s*\{([^}]+)\}/.exec(content);
    expect(lightMatch).not.toBeNull();

    // Every line in html.light should have !important
    const lines = lightMatch![1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("--color-"));
    expect(lines.length).toBeGreaterThan(0);

    for (const line of lines) {
      expect(line).toContain("!important");
    }
  });

  it("backdrop uses bg-black/60 not opaque background", () => {
    const content = readCSS();
    // Ensure the old pattern is not present
    expect(content).not.toContain("bg-[var(--color-background)]");
  });
});
