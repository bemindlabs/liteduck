import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BiometricProvider, useBiometric } from "./BiometricContext";
import { resetTauriMocks } from "@/test/tauri-mocks";

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock("@/lib/biometric", () => ({
  biometricStatus: vi.fn(),
  biometricAuthenticate: vi.fn(),
  biometricSetGate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/settings", () => ({
  getSetting: vi.fn(),
  saveSetting: vi.fn().mockResolvedValue(undefined),
}));

import { biometricStatus, biometricAuthenticate } from "@/lib/biometric";
import { getSetting, saveSetting } from "@/lib/settings";

const mockBiometricStatus = vi.mocked(biometricStatus);
const mockBiometricAuthenticate = vi.mocked(biometricAuthenticate);
const mockGetSetting = vi.mocked(getSetting);
const mockSaveSetting = vi.mocked(saveSetting);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BiometricProvider>{children}</BiometricProvider>
);

const availableStatus = { available: true, biometry_type: "Touch ID" };

// ---------------------------------------------------------------------------
// Tests: initial / default state
// ---------------------------------------------------------------------------

describe("BiometricProvider — initial state", () => {
  beforeEach(() => {
    resetTauriMocks();
    mockBiometricStatus.mockResolvedValue(availableStatus);
    mockGetSetting.mockResolvedValue(null);
    mockSaveSetting.mockResolvedValue(undefined);
    mockBiometricAuthenticate.mockResolvedValue(undefined);
  });

  it("status is null before biometricStatus resolves", () => {
    mockBiometricStatus.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useBiometric(), { wrapper });
    expect(result.current.status).toBeNull();
  });

  it("enabled defaults to false", async () => {
    const { result } = renderHook(() => useBiometric(), { wrapper });
    await waitFor(() => expect(mockGetSetting).toHaveBeenCalled());
    expect(result.current.enabled).toBe(false);
  });

  it("unlocked defaults to true when biometric lock is disabled", async () => {
    mockGetSetting.mockResolvedValue(null); // not "true"

    const { result } = renderHook(() => useBiometric(), { wrapper });
    await waitFor(() => expect(mockGetSetting).toHaveBeenCalled());
    expect(result.current.unlocked).toBe(true);
  });

  it("hydrates the hardware status from biometricStatus()", async () => {
    const { result } = renderHook(() => useBiometric(), { wrapper });

    await waitFor(() => expect(result.current.status).toEqual(availableStatus));
  });

  it("status stays null when biometricStatus() rejects", async () => {
    mockBiometricStatus.mockRejectedValue(new Error("no biometric"));

    const { result } = renderHook(() => useBiometric(), { wrapper });

    await waitFor(() => expect(mockBiometricStatus).toHaveBeenCalled());
    expect(result.current.status).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: biometric lock enabled from persisted setting
// ---------------------------------------------------------------------------

describe("BiometricProvider — persisted enabled state", () => {
  beforeEach(() => {
    resetTauriMocks();
    mockBiometricStatus.mockResolvedValue(availableStatus);
    mockBiometricAuthenticate.mockResolvedValue(undefined);
  });

  it("sets enabled=true and unlocked=false when setting is 'true'", async () => {
    mockGetSetting.mockResolvedValue("true");

    const { result } = renderHook(() => useBiometric(), { wrapper });

    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(result.current.unlocked).toBe(false);
  });

  it("keeps enabled=false when setting is 'false'", async () => {
    mockGetSetting.mockResolvedValue("false");

    const { result } = renderHook(() => useBiometric(), { wrapper });

    await waitFor(() => expect(mockGetSetting).toHaveBeenCalled());
    expect(result.current.enabled).toBe(false);
    expect(result.current.unlocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: setEnabled
// ---------------------------------------------------------------------------

describe("BiometricProvider — setEnabled", () => {
  beforeEach(() => {
    resetTauriMocks();
    mockBiometricStatus.mockResolvedValue(availableStatus);
    mockGetSetting.mockResolvedValue(null);
    mockSaveSetting.mockResolvedValue(undefined);
    mockBiometricAuthenticate.mockReset();
    mockBiometricAuthenticate.mockResolvedValue(undefined);
  });

  it("enables biometric lock: calls authenticate, saves 'true', sets enabled=true", async () => {
    const { result } = renderHook(() => useBiometric(), { wrapper });
    await waitFor(() => expect(mockGetSetting).toHaveBeenCalled());

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(mockBiometricAuthenticate).toHaveBeenCalledWith(
      "Verify biometric to enable keychain lock",
    );
    expect(mockSaveSetting).toHaveBeenCalledWith("biometric_lock_enabled", "true");
    expect(result.current.enabled).toBe(true);
  });

  it("disables biometric lock: skips authenticate, saves 'false', sets enabled=false", async () => {
    // Start with it enabled
    mockGetSetting.mockResolvedValue("true");

    const { result } = renderHook(() => useBiometric(), { wrapper });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    await act(async () => {
      await result.current.setEnabled(false);
    });

    expect(mockBiometricAuthenticate).not.toHaveBeenCalled();
    expect(mockSaveSetting).toHaveBeenCalledWith("biometric_lock_enabled", "false");
    expect(result.current.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: unlock
// ---------------------------------------------------------------------------

describe("BiometricProvider — unlock", () => {
  beforeEach(() => {
    resetTauriMocks();
    mockBiometricStatus.mockResolvedValue(availableStatus);
    mockSaveSetting.mockResolvedValue(undefined);
    mockBiometricAuthenticate.mockReset();
    mockBiometricAuthenticate.mockResolvedValue(undefined);
  });

  it("returns true immediately when biometric is not enabled", async () => {
    mockGetSetting.mockResolvedValue(null); // disabled

    const { result } = renderHook(() => useBiometric(), { wrapper });
    await waitFor(() => expect(mockGetSetting).toHaveBeenCalled());

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.unlock();
    });

    expect(returned).toBe(true);
    expect(mockBiometricAuthenticate).not.toHaveBeenCalled();
  });

  it("calls biometricAuthenticate and returns true on success when enabled", async () => {
    mockGetSetting.mockResolvedValue("true");
    mockBiometricAuthenticate.mockResolvedValue(undefined);

    const { result } = renderHook(() => useBiometric(), { wrapper });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.unlock();
    });

    expect(mockBiometricAuthenticate).toHaveBeenCalledWith("Unlock keychain secrets");
    expect(returned).toBe(true);
    expect(result.current.unlocked).toBe(true);
  });

  it("returns false when biometricAuthenticate rejects (user cancelled)", async () => {
    mockGetSetting.mockResolvedValue("true");
    mockBiometricAuthenticate.mockRejectedValue(new Error("cancelled"));

    const { result } = renderHook(() => useBiometric(), { wrapper });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.unlock();
    });

    expect(returned).toBe(false);
    expect(result.current.unlocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: lock
// ---------------------------------------------------------------------------

describe("BiometricProvider — lock", () => {
  beforeEach(() => {
    resetTauriMocks();
    mockBiometricStatus.mockResolvedValue(availableStatus);
    mockSaveSetting.mockResolvedValue(undefined);
    mockBiometricAuthenticate.mockReset();
    mockBiometricAuthenticate.mockResolvedValue(undefined);
  });

  it("sets unlocked=false when biometric is enabled", async () => {
    mockGetSetting.mockResolvedValue("true");

    const { result } = renderHook(() => useBiometric(), { wrapper });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    // Unlock first so we can verify lock transitions back
    await act(async () => {
      await result.current.unlock();
    });
    expect(result.current.unlocked).toBe(true);

    act(() => {
      result.current.lock();
    });

    expect(result.current.unlocked).toBe(false);
  });

  it("is a no-op when biometric is not enabled", async () => {
    mockGetSetting.mockResolvedValue(null); // disabled

    const { result } = renderHook(() => useBiometric(), { wrapper });
    await waitFor(() => expect(mockGetSetting).toHaveBeenCalled());

    act(() => {
      result.current.lock();
    });

    // unlocked should still be true (no-op)
    expect(result.current.unlocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: default context (no provider)
// ---------------------------------------------------------------------------

describe("useBiometric — default context (no provider)", () => {
  it("returns stable defaults when used outside BiometricProvider", () => {
    // BiometricContext provides non-null defaults, so no provider is needed
    const { result } = renderHook(() => useBiometric());

    expect(result.current.status).toBeNull();
    expect(result.current.enabled).toBe(false);
    expect(result.current.unlocked).toBe(true);
  });

  it("unlock() resolves true via the default no-op", async () => {
    const { result } = renderHook(() => useBiometric());

    let unlockResult: boolean | undefined;
    await act(async () => {
      unlockResult = await result.current.unlock();
    });

    expect(unlockResult).toBe(true);
  });

  it("lock() does not throw via the default no-op", () => {
    const { result } = renderHook(() => useBiometric());
    expect(() => result.current.lock()).not.toThrow();
  });
});
