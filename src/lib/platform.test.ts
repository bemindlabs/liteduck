import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// platform.ts reads navigator at call time so we can stub it via Object.defineProperty.

function setUserAgent(ua: string, maxTouchPoints = 0): void {
  Object.defineProperty(navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
  Object.defineProperty(navigator, "maxTouchPoints", {
    value: maxTouchPoints,
    configurable: true,
  });
}

describe("platform detection utilities", () => {
  const originalUA = navigator.userAgent;
  const originalMTP = navigator.maxTouchPoints;

  afterEach(() => {
    setUserAgent(originalUA, originalMTP);
    vi.resetModules();
  });

  // ── isIOS ─────────────────────────────────────────────────────────────────

  describe("isIOS()", () => {
    beforeEach(() => vi.resetModules());

    it("returns true for an iPhone user agent", async () => {
      setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15");
      const { isIOS } = await import("./platform");
      expect(isIOS()).toBe(true);
    });

    it("returns true for an iPod user agent", async () => {
      setUserAgent(
        "Mozilla/5.0 (iPod touch; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
      );
      const { isIOS } = await import("./platform");
      expect(isIOS()).toBe(true);
    });

    it("returns true for an iPad on iOS 13+ (MacIntel + maxTouchPoints > 1)", async () => {
      setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5);
      const { isIOS } = await import("./platform");
      expect(isIOS()).toBe(true);
    });

    it("returns false for a desktop macOS user agent with no touch points", async () => {
      setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36", 0);
      const { isIOS } = await import("./platform");
      expect(isIOS()).toBe(false);
    });

    it("returns false for a standard Windows Chrome user agent", async () => {
      setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120");
      const { isIOS } = await import("./platform");
      expect(isIOS()).toBe(false);
    });
  });

  // ── isIPad ────────────────────────────────────────────────────────────────

  describe("isIPad()", () => {
    beforeEach(() => vi.resetModules());

    it("returns true for a classic iPad user agent", async () => {
      setUserAgent("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15");
      const { isIPad } = await import("./platform");
      expect(isIPad()).toBe(true);
    });

    it("returns true for iPad iOS 13+ MacIntel heuristic", async () => {
      setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 5);
      const { isIPad } = await import("./platform");
      expect(isIPad()).toBe(true);
    });

    it("returns false for an iPhone user agent", async () => {
      setUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        0,
      );
      const { isIPad } = await import("./platform");
      expect(isIPad()).toBe(false);
    });
  });

  // ── isMobile ──────────────────────────────────────────────────────────────

  describe("isMobile()", () => {
    beforeEach(() => vi.resetModules());

    it("returns true for an Android user agent", async () => {
      setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile");
      const { isMobile } = await import("./platform");
      expect(isMobile()).toBe(true);
    });

    it("returns true for an iPhone user agent", async () => {
      setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15");
      const { isMobile } = await import("./platform");
      expect(isMobile()).toBe(true);
    });

    it("returns false for an iPad (treated as desktop-class)", async () => {
      setUserAgent("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15");
      const { isMobile } = await import("./platform");
      expect(isMobile()).toBe(false);
    });

    it("returns false for a desktop macOS user agent", async () => {
      setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36", 0);
      const { isMobile } = await import("./platform");
      expect(isMobile()).toBe(false);
    });
  });

  // ── hasNativeCapabilities ─────────────────────────────────────────────────

  describe("hasNativeCapabilities()", () => {
    beforeEach(() => vi.resetModules());

    it("returns true for a desktop macOS environment", async () => {
      setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36", 0);
      const { hasNativeCapabilities } = await import("./platform");
      expect(hasNativeCapabilities()).toBe(true);
    });

    it("returns false for an iOS device", async () => {
      setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15");
      const { hasNativeCapabilities } = await import("./platform");
      expect(hasNativeCapabilities()).toBe(false);
    });

    it("returns false for an Android device", async () => {
      setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile");
      const { hasNativeCapabilities } = await import("./platform");
      expect(hasNativeCapabilities()).toBe(false);
    });

    it("returns false for an iPad iOS 13+ heuristic device", async () => {
      setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 5);
      const { hasNativeCapabilities } = await import("./platform");
      // iPad reports as Mac but has touch points — isIOS() returns true so native=false
      expect(hasNativeCapabilities()).toBe(false);
    });
  });

  // ── isDesktop ─────────────────────────────────────────────────────────────

  describe("isDesktop()", () => {
    beforeEach(() => vi.resetModules());

    it("returns true when not mobile", async () => {
      setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36", 0);
      const { isDesktop } = await import("./platform");
      expect(isDesktop()).toBe(true);
    });

    it("returns false for an Android phone", async () => {
      setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile");
      const { isDesktop } = await import("./platform");
      expect(isDesktop()).toBe(false);
    });
  });
});
