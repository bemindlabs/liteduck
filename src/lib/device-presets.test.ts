import { describe, it, expect } from "vitest";
import {
  DEVICE_PRESETS,
  DEFAULT_PRESET,
  defaultPresetForMode,
  presetsForMode,
} from "./device-presets";
import type { ViewportMode } from "./device-presets";

describe("device-presets", () => {
  // ── DEVICE_PRESETS constant ───────────────────────────────────────────────

  describe("DEVICE_PRESETS", () => {
    it("is a non-empty array", () => {
      expect(DEVICE_PRESETS.length).toBeGreaterThan(0);
    });

    it("contains the desktop sentinel as the first entry", () => {
      const first = DEVICE_PRESETS[0];
      expect(first.id).toBe("desktop");
      expect(first.width).toBe(0);
      expect(first.height).toBe(0);
      expect(first.mode).toBe("desktop");
    });

    it("every preset has a unique id", () => {
      const ids = DEVICE_PRESETS.map((p) => p.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

    it("every preset has a valid mode", () => {
      const validModes: ViewportMode[] = ["desktop", "mobile", "tablet"];
      for (const preset of DEVICE_PRESETS) {
        expect(validModes).toContain(preset.mode);
      }
    });

    it("every preset has a valid icon value", () => {
      const validIcons = ["Monitor", "Smartphone", "Tablet"] as const;
      for (const preset of DEVICE_PRESETS) {
        expect(validIcons).toContain(preset.icon);
      }
    });

    it("mobile presets have non-zero width and height", () => {
      const mobilePresets = DEVICE_PRESETS.filter((p) => p.mode === "mobile");
      expect(mobilePresets.length).toBeGreaterThan(0);
      for (const preset of mobilePresets) {
        expect(preset.width).toBeGreaterThan(0);
        expect(preset.height).toBeGreaterThan(0);
      }
    });
  });

  // ── DEFAULT_PRESET ────────────────────────────────────────────────────────

  describe("DEFAULT_PRESET", () => {
    it("is the same reference as DEVICE_PRESETS[0]", () => {
      expect(DEFAULT_PRESET).toBe(DEVICE_PRESETS[0]);
    });

    it("has the desktop mode", () => {
      expect(DEFAULT_PRESET.mode).toBe("desktop");
    });
  });

  // ── defaultPresetForMode ──────────────────────────────────────────────────

  describe("defaultPresetForMode()", () => {
    it("returns the first desktop preset for mode 'desktop'", () => {
      const preset = defaultPresetForMode("desktop");
      expect(preset.mode).toBe("desktop");
      expect(preset.id).toBe("desktop");
    });

    it("returns the first mobile preset for mode 'mobile'", () => {
      const preset = defaultPresetForMode("mobile");
      expect(preset.mode).toBe("mobile");
    });

    it("returns the first tablet preset for mode 'tablet'", () => {
      const preset = defaultPresetForMode("tablet");
      expect(preset.mode).toBe("tablet");
    });

    it("falls back to DEFAULT_PRESET for an unknown mode", () => {
      // Cast to bypass TypeScript so we can test the fallback branch
      const preset = defaultPresetForMode("unknown" as ViewportMode);
      expect(preset).toBe(DEFAULT_PRESET);
    });
  });

  // ── presetsForMode ────────────────────────────────────────────────────────

  describe("presetsForMode()", () => {
    it("returns only desktop presets when mode is 'desktop'", () => {
      const presets = presetsForMode("desktop");
      expect(presets.length).toBeGreaterThan(0);
      for (const p of presets) {
        expect(p.mode).toBe("desktop");
      }
    });

    it("returns only mobile presets when mode is 'mobile'", () => {
      const presets = presetsForMode("mobile");
      expect(presets.length).toBeGreaterThan(0);
      for (const p of presets) {
        expect(p.mode).toBe("mobile");
      }
    });

    it("returns only tablet presets when mode is 'tablet'", () => {
      const presets = presetsForMode("tablet");
      expect(presets.length).toBeGreaterThan(0);
      for (const p of presets) {
        expect(p.mode).toBe("tablet");
      }
    });

    it("returns an empty array for an unknown mode", () => {
      const presets = presetsForMode("unknown" as ViewportMode);
      expect(presets).toHaveLength(0);
    });

    it("all three modes together cover the entire DEVICE_PRESETS array", () => {
      const allFiltered = [
        ...presetsForMode("desktop"),
        ...presetsForMode("mobile"),
        ...presetsForMode("tablet"),
      ];
      expect(allFiltered).toHaveLength(DEVICE_PRESETS.length);
    });
  });
});
