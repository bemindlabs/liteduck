import { describe, it, expect } from "vitest";
import { hexToRgb, rgbToHex, lighten, darken } from "./mini-duck-colors";

describe("mini-duck-colors", () => {
  // ── hexToRgb ──────────────────────────────────────────────────────────────

  describe("hexToRgb()", () => {
    it("converts pure black to [0, 0, 0]", () => {
      expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
    });

    it("converts pure white to [255, 255, 255]", () => {
      expect(hexToRgb("#ffffff")).toEqual([255, 255, 255]);
    });

    it("converts a mid-range colour correctly", () => {
      expect(hexToRgb("#ff5555")).toEqual([255, 85, 85]);
    });

    it("works without the leading # character", () => {
      expect(hexToRgb("50fa7b")).toEqual([80, 250, 123]);
    });

    it("converts uppercase hex digits correctly", () => {
      expect(hexToRgb("#FF79C6")).toEqual([255, 121, 198]);
    });
  });

  // ── rgbToHex ──────────────────────────────────────────────────────────────

  describe("rgbToHex()", () => {
    it("converts [0, 0, 0] to #000000", () => {
      expect(rgbToHex(0, 0, 0)).toBe("#000000");
    });

    it("converts [255, 255, 255] to #ffffff", () => {
      expect(rgbToHex(255, 255, 255)).toBe("#ffffff");
    });

    it("converts [255, 85, 85] to #ff5555", () => {
      expect(rgbToHex(255, 85, 85)).toBe("#ff5555");
    });

    it("clamps values above 255 to ff", () => {
      expect(rgbToHex(300, 0, 0)).toBe("#ff0000");
    });

    it("clamps negative values to 00", () => {
      expect(rgbToHex(-10, 0, 0)).toBe("#000000");
    });

    it("pads single hex digit channels with a leading zero", () => {
      expect(rgbToHex(0, 15, 0)).toBe("#000f00");
    });
  });

  // ── round-trip ────────────────────────────────────────────────────────────

  describe("hexToRgb / rgbToHex round-trip", () => {
    it("round-trips #8be9fd unchanged", () => {
      const [r, g, b] = hexToRgb("#8be9fd");
      expect(rgbToHex(r, g, b)).toBe("#8be9fd");
    });

    it("round-trips #44475a unchanged", () => {
      const [r, g, b] = hexToRgb("#44475a");
      expect(rgbToHex(r, g, b)).toBe("#44475a");
    });
  });

  // ── lighten ───────────────────────────────────────────────────────────────

  describe("lighten()", () => {
    it("increases each channel by the given amount", () => {
      const result = lighten("#000000", 10);
      expect(result).toBe("#0a0a0a");
    });

    it("lightens #ff5555 by 10 correctly", () => {
      // [255, 85, 85] + 10 → [265→255, 95, 95] = #ff5f5f
      const [r, g, b] = hexToRgb(lighten("#ff5555", 10));
      expect(r).toBe(255); // clamped
      expect(g).toBe(95);
      expect(b).toBe(95);
    });

    it("clamps channels at 255 when amount is very large", () => {
      expect(lighten("#aaaaaa", 200)).toBe("#ffffff");
    });
  });

  // ── darken ────────────────────────────────────────────────────────────────

  describe("darken()", () => {
    it("decreases each channel by the given amount", () => {
      const result = darken("#0a0a0a", 10);
      expect(result).toBe("#000000");
    });

    it("darkens a colour by a specific amount", () => {
      // #50fa7b = [80, 250, 123] − 20 = [60, 230, 103] = #3ce667
      expect(darken("#50fa7b", 20)).toBe("#3ce667");
    });

    it("clamps channels at 0 when amount is very large", () => {
      expect(darken("#555555", 300)).toBe("#000000");
    });
  });
});
