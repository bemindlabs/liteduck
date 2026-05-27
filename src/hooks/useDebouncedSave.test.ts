import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDebouncedSave, useSaveStatus } from "./useDebouncedSave";

// ---------------------------------------------------------------------------
// useDebouncedSave
// ---------------------------------------------------------------------------

describe("useDebouncedSave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not call saveFn before the delay elapses", () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebouncedSave(saveFn, 1000));

    act(() => {
      result.current.save("hello");
    });

    // Timer has not fired yet.
    expect(saveFn).not.toHaveBeenCalled();
  });

  it("calls saveFn once after the delay", () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebouncedSave(saveFn, 1000));

    act(() => {
      result.current.save("hello");
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith("hello");
  });

  it("accumulates rapid calls and fires once with the latest value", () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebouncedSave(saveFn, 1000));

    act(() => {
      result.current.save("a");
      result.current.save("b");
      result.current.save("c");
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith("c");
  });

  it("resets the timer on each subsequent call within the window", () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebouncedSave(saveFn, 1000));

    act(() => {
      result.current.save("first");
    });

    // Advance 800 ms — still within the 1 s window; save should not have fired.
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(saveFn).not.toHaveBeenCalled();

    // New call resets the timer.
    act(() => {
      result.current.save("second");
    });

    // Advance another 800 ms — 800 ms since the second call, still under 1 s.
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(saveFn).not.toHaveBeenCalled();

    // Complete the full 1 s window from the second call.
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith("second");
  });

  it("flush() forces an immediate save without waiting for the timer", async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebouncedSave(saveFn, 1000));

    act(() => {
      result.current.save("pending");
    });

    // Flush before the timer fires.
    await act(async () => {
      await result.current.flush();
    });

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith("pending");

    // Timer fires later — should NOT trigger a second save.
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  it("flush() is a no-op when no save is pending", async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebouncedSave(saveFn, 1000));

    await act(async () => {
      await result.current.flush();
    });

    expect(saveFn).not.toHaveBeenCalled();
  });

  it("flushes pending value on unmount", () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useDebouncedSave(saveFn, 1000));

    act(() => {
      result.current.save("unsaved");
    });

    // Unmount before the timer fires.
    unmount();

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith("unsaved");
  });

  it("does not call saveFn on unmount when nothing is pending", () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useDebouncedSave(saveFn, 1000));

    unmount();

    expect(saveFn).not.toHaveBeenCalled();
  });

  it("isPending() returns true while a save is queued", () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebouncedSave(saveFn, 1000));

    expect(result.current.isPending()).toBe(false);

    act(() => {
      result.current.save("value");
    });

    expect(result.current.isPending()).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.isPending()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// useSaveStatus
// ---------------------------------------------------------------------------

describe("useSaveStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in idle state", () => {
    const { result } = renderHook(() => useSaveStatus());
    expect(result.current.status).toBe("idle");
  });

  it("markSaving() transitions to saving", () => {
    const { result } = renderHook(() => useSaveStatus());

    act(() => {
      result.current.markSaving();
    });

    expect(result.current.status).toBe("saving");
  });

  it("markSaved() transitions to saved then reverts to idle after resetDelay", () => {
    const { result } = renderHook(() => useSaveStatus(2000));

    act(() => {
      result.current.markSaved();
    });
    expect(result.current.status).toBe("saved");

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(result.current.status).toBe("saved");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.status).toBe("idle");
  });

  it("markError() transitions to error", () => {
    const { result } = renderHook(() => useSaveStatus());

    act(() => {
      result.current.markError();
    });

    expect(result.current.status).toBe("error");
  });

  it("markSaving() cancels an in-progress reset timer from markSaved()", () => {
    const { result } = renderHook(() => useSaveStatus(2000));

    act(() => {
      result.current.markSaved();
    });
    // Advance partway through the reset window.
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // A new save begins — status should be "saving", not "idle".
    act(() => {
      result.current.markSaving();
    });
    expect(result.current.status).toBe("saving");

    // The old reset timer would have fired here if not cancelled.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.status).toBe("saving");
  });
});
