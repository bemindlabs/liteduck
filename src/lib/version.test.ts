import { describe, it, expect, beforeEach } from "vitest";
import { mockInvoke, mockInvokeResponse, resetTauriMocks } from "@/test/tauri-mocks";

// ── @tauri-apps/api/app mock (fallback path in getAppVersion) ──────────────────

import { vi } from "vitest";

const mockGetVersion = vi.fn().mockResolvedValue("2026.5.2");

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => mockGetVersion(),
}));

import { getAppVersion } from "./version";

describe("getAppVersion", () => {
  beforeEach(() => {
    resetTauriMocks();
    mockGetVersion.mockResolvedValue("2026.5.2");
  });

  it("invokes get_app_version and returns the version string", async () => {
    mockInvokeResponse("get_app_version", "2026.5.2");

    const result = await getAppVersion();

    expect(mockInvoke).toHaveBeenCalledWith("get_app_version");
    expect(result).toBe("2026.5.2");
  });

  it("falls back to the Tauri app API when invoke throws", async () => {
    // Simulates a platform where get_app_version is not registered.
    mockInvoke.mockRejectedValueOnce(new Error("command not found"));
    mockGetVersion.mockResolvedValue("2026.5.1");

    const result = await getAppVersion();

    expect(result).toBe("2026.5.1");
    expect(mockGetVersion).toHaveBeenCalled();
  });
});
