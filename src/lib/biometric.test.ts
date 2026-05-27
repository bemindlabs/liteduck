import { describe, it, expect, beforeEach } from "vitest";
import {
  mockInvoke,
  mockInvokeResponse,
  mockInvokeError,
  resetTauriMocks,
} from "@/test/tauri-mocks";
import { biometricStatus, biometricAuthenticate } from "./biometric";
import type { BiometricStatus } from "./biometric";

describe("biometricStatus", () => {
  beforeEach(() => {
    resetTauriMocks();
  });

  it("invokes biometric_status and returns status object", async () => {
    const status: BiometricStatus = { available: true, biometry_type: "TouchID" };
    mockInvokeResponse("biometric_status", status);

    const result = await biometricStatus();

    expect(mockInvoke).toHaveBeenCalledWith("biometric_status");
    expect(result.available).toBe(true);
    expect(result.biometry_type).toBe("TouchID");
  });

  it("returns unavailable status when biometrics not present", async () => {
    const status: BiometricStatus = { available: false, biometry_type: "None" };
    mockInvokeResponse("biometric_status", status);

    const result = await biometricStatus();

    expect(result.available).toBe(false);
    expect(result.biometry_type).toBe("None");
  });

  it("propagates backend error", async () => {
    mockInvokeError("biometric_status", "Biometric hardware unavailable");

    await expect(biometricStatus()).rejects.toThrow("Biometric hardware unavailable");
  });
});

describe("biometricAuthenticate", () => {
  beforeEach(() => {
    resetTauriMocks();
  });

  it("invokes biometric_authenticate with default reason", async () => {
    mockInvokeResponse("biometric_authenticate", undefined);

    await biometricAuthenticate();

    expect(mockInvoke).toHaveBeenCalledWith("biometric_authenticate", {
      reason: "Unlock keychain secrets",
    });
  });

  it("invokes biometric_authenticate with custom reason", async () => {
    mockInvokeResponse("biometric_authenticate", undefined);

    await biometricAuthenticate("Access secure data");

    expect(mockInvoke).toHaveBeenCalledWith("biometric_authenticate", {
      reason: "Access secure data",
    });
  });

  it("rejects when user cancels authentication", async () => {
    mockInvokeError("biometric_authenticate", "User cancelled biometric authentication");

    await expect(biometricAuthenticate()).rejects.toThrow("User cancelled");
  });

  it("rejects when authentication fails", async () => {
    mockInvokeError("biometric_authenticate", "Biometric authentication failed: too many attempts");

    await expect(biometricAuthenticate("Unlock")).rejects.toThrow("too many attempts");
  });
});
