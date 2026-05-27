import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useWindowSize, BREAKPOINTS } from "./useWindowSize";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setWindowSize(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", {
    writable: true,
    configurable: true,
    value: height,
  });
}

function fireResize() {
  window.dispatchEvent(new Event("resize"));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useWindowSize", () => {
  // Capture original dimensions so we can restore them.
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;

  // requestAnimationFrame is not implemented in jsdom — stub it so resize
  // callbacks execute synchronously.
  let rafCallback: FrameRequestCallback | undefined;

  beforeEach(() => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallback = cb;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
      rafCallback = undefined;
    });
    setWindowSize(originalWidth, originalHeight);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setWindowSize(originalWidth, originalHeight);
    rafCallback = undefined;
  });

  it("returns initial window dimensions on first render", () => {
    setWindowSize(1200, 800);
    const { result } = renderHook(() => useWindowSize());
    expect(result.current.width).toBe(1200);
    expect(result.current.height).toBe(800);
  });

  it("updates size after a resize event and rAF callback fires", () => {
    setWindowSize(1024, 768);
    const { result } = renderHook(() => useWindowSize());

    act(() => {
      setWindowSize(1440, 900);
      fireResize();
      // Execute the rAF callback synchronously
      if (rafCallback) rafCallback(0);
    });

    expect(result.current.width).toBe(1440);
    expect(result.current.height).toBe(900);
  });

  it("handles multiple rapid resize events — only the last rAF callback matters", () => {
    setWindowSize(800, 600);
    const { result } = renderHook(() => useWindowSize());

    act(() => {
      // First resize
      setWindowSize(900, 650);
      fireResize();
      const cb1 = rafCallback;

      // Second resize cancels the first rAF and schedules a new one
      setWindowSize(1000, 700);
      fireResize();
      const cb2 = rafCallback;

      // Only execute the second callback
      void cb1; // intentionally ignored — cancelled
      if (cb2) cb2(0);
    });

    expect(result.current.width).toBe(1000);
    expect(result.current.height).toBe(700);
  });

  it("removes the resize event listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useWindowSize());

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
  });

  it("cancels the pending rAF on unmount", () => {
    const { result: _ } = renderHook(() => useWindowSize());

    act(() => {
      fireResize(); // schedules a rAF
    });

    const { unmount } = renderHook(() => useWindowSize());

    act(() => {
      fireResize();
    });

    unmount();

    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });

  it("does NOT update state if rAF was cancelled before it fired", () => {
    setWindowSize(1024, 768);
    const { result } = renderHook(() => useWindowSize());
    const initialWidth = result.current.width;

    act(() => {
      setWindowSize(1920, 1080);
      fireResize();
      // Simulate cancelAnimationFrame clearing the callback
      rafCallback = undefined;
      // Do NOT invoke the callback
    });

    // State should be unchanged because the callback never fired
    expect(result.current.width).toBe(initialWidth);
  });
});

// ---------------------------------------------------------------------------
// BREAKPOINTS constant
// ---------------------------------------------------------------------------

describe("BREAKPOINTS", () => {
  it("sm is 640", () => expect(BREAKPOINTS.sm).toBe(640));
  it("md is 768", () => expect(BREAKPOINTS.md).toBe(768));
  it("lg is 1024", () => expect(BREAKPOINTS.lg).toBe(1024));
  it("xl is 1280", () => expect(BREAKPOINTS.xl).toBe(1280));

  it("breakpoints increase monotonically (sm < md < lg < xl)", () => {
    expect(BREAKPOINTS.sm).toBeLessThan(BREAKPOINTS.md);
    expect(BREAKPOINTS.md).toBeLessThan(BREAKPOINTS.lg);
    expect(BREAKPOINTS.lg).toBeLessThan(BREAKPOINTS.xl);
  });
});
