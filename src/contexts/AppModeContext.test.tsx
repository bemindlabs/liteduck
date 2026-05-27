import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppModeProvider, useAppMode } from "./AppModeContext";
import { resetTauriMocks } from "@/test/tauri-mocks";

// ---------------------------------------------------------------------------
// Mock the settings lib so we control what "get_setting" returns.
// ---------------------------------------------------------------------------

vi.mock("@/lib/settings", () => ({
  getSetting: vi.fn(),
  saveSetting: vi.fn().mockResolvedValue(undefined),
}));

import { getSetting, saveSetting } from "@/lib/settings";
const mockGetSetting = vi.mocked(getSetting);
const mockSaveSetting = vi.mocked(saveSetting);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AppModeProvider>{children}</AppModeProvider>
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AppModeProvider / useAppMode", () => {
  beforeEach(() => {
    resetTauriMocks();
    mockGetSetting.mockResolvedValue(null);
    mockSaveSetting.mockResolvedValue(undefined);
  });

  it("defaults to 'solo' mode before the setting loads", () => {
    // Keep getSetting pending so we can observe the default
    mockGetSetting.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useAppMode(), { wrapper });

    expect(result.current.mode).toBe("solo");
  });

  it("hydrates to 'team' mode when setting returns 'team'", async () => {
    mockGetSetting.mockResolvedValue("team");

    const { result } = renderHook(() => useAppMode(), { wrapper });

    await waitFor(() => expect(result.current.mode).toBe("team"));
  });

  it("hydrates to 'solo' mode when setting returns 'solo'", async () => {
    mockGetSetting.mockResolvedValue("solo");

    const { result } = renderHook(() => useAppMode(), { wrapper });

    await waitFor(() => expect(result.current.mode).toBe("solo"));
  });

  it("migrates 'dev' setting to 'solo'", async () => {
    mockGetSetting.mockResolvedValue("dev");

    const { result } = renderHook(() => useAppMode(), { wrapper });

    await waitFor(() => expect(result.current.mode).toBe("solo"));
  });

  it("migrates 'docs' setting to 'solo'", async () => {
    mockGetSetting.mockResolvedValue("docs");

    const { result } = renderHook(() => useAppMode(), { wrapper });

    await waitFor(() => expect(result.current.mode).toBe("solo"));
  });

  it("migrates 'pm' setting to 'team'", async () => {
    mockGetSetting.mockResolvedValue("pm");

    const { result } = renderHook(() => useAppMode(), { wrapper });

    await waitFor(() => expect(result.current.mode).toBe("team"));
  });

  it("keeps default 'solo' when setting returns null (key absent)", async () => {
    mockGetSetting.mockResolvedValue(null);

    const { result } = renderHook(() => useAppMode(), { wrapper });

    await waitFor(() => expect(mockGetSetting).toHaveBeenCalled());

    expect(result.current.mode).toBe("solo");
  });

  it("ignores unknown setting values and keeps the current mode", async () => {
    mockGetSetting.mockResolvedValue("unknown_mode");

    const { result } = renderHook(() => useAppMode(), { wrapper });

    await waitFor(() => expect(mockGetSetting).toHaveBeenCalled());

    expect(result.current.mode).toBe("solo");
  });

  it("setMode updates mode state immediately", () => {
    mockGetSetting.mockResolvedValue(null);

    const { result } = renderHook(() => useAppMode(), { wrapper });

    act(() => {
      result.current.setMode("team");
    });

    expect(result.current.mode).toBe("team");
  });

  it("setMode persists the new mode via saveSetting", async () => {
    mockGetSetting.mockResolvedValue(null);

    const { result } = renderHook(() => useAppMode(), { wrapper });

    act(() => {
      result.current.setMode("team");
    });

    await waitFor(() => expect(mockSaveSetting).toHaveBeenCalledWith("dev_mode", "team"));
  });

  it("setMode can cycle through all valid modes", () => {
    mockGetSetting.mockResolvedValue(null);

    const { result } = renderHook(() => useAppMode(), { wrapper });

    for (const mode of ["team", "solo"] as const) {
      act(() => {
        result.current.setMode(mode);
      });
      expect(result.current.mode).toBe(mode);
    }
  });

  it("throws when useAppMode is called outside of AppModeProvider", () => {
    // Suppress the expected React error boundary console output
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => renderHook(() => useAppMode())).toThrow(
      "useAppMode must be used inside AppModeProvider",
    );

    consoleSpy.mockRestore();
  });
});
