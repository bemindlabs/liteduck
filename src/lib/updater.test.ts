import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  mockInvoke,
  mockInvokeResponse,
  mockInvokeError,
  resetTauriMocks,
} from "@/test/tauri-mocks";

// ── Platform mock ──────────────────────────────────────────────────────────────

const mockHasNativeCapabilities = vi.fn().mockReturnValue(true);

vi.mock("@/lib/platform", () => ({
  hasNativeCapabilities: () => mockHasNativeCapabilities(),
  isIOS: vi.fn().mockReturnValue(false),
  isMobile: vi.fn().mockReturnValue(false),
  isDesktop: vi.fn().mockReturnValue(true),
}));

// ── @tauri-apps/api/app mock (fallback path in getAppVersion) ──────────────────

const mockGetVersion = vi.fn().mockResolvedValue("2026.4.11");

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => mockGetVersion(),
}));

import {
  checkForUpdate,
  downloadUpdate,
  installUpdate,
  getAppVersion,
  type UpdateInfo,
} from "./updater";

const makeUpdateInfo = (): UpdateInfo => ({
  current_version: "2026.4.10",
  latest_version: "2026.4.11",
  has_update: true,
  release_url: "https://github.com/bemindlabs/liteduck-releases/releases/tag/v2026.4.11",
  release_notes: "## What's new\n- Bug fixes",
  published_at: "2026-04-11T00:00:00Z",
  download_url:
    "https://github.com/bemindlabs/liteduck-releases/releases/download/v2026.4.11/liteduck.dmg",
  download_filename: "liteduck.dmg",
  download_size: 50_000_000,
});

describe("updater IPC wrappers", () => {
  beforeEach(() => {
    resetTauriMocks();
    mockHasNativeCapabilities.mockReturnValue(true);
    mockGetVersion.mockResolvedValue("2026.4.11");
  });

  // ── checkForUpdate ─────────────────────────────────────────────────────────

  describe("checkForUpdate", () => {
    it("invokes check_for_update and returns update info", async () => {
      const info = makeUpdateInfo();
      mockInvokeResponse("check_for_update", info);

      const result = await checkForUpdate();

      expect(mockInvoke).toHaveBeenCalledWith("check_for_update");
      expect(result).toEqual(info);
    });

    it("returns update info with has_update=false when on latest", async () => {
      const info: UpdateInfo = {
        ...makeUpdateInfo(),
        has_update: false,
        latest_version: "2026.4.10",
      };
      mockInvokeResponse("check_for_update", info);

      const result = await checkForUpdate();

      expect(result.has_update).toBe(false);
    });

    it("throws platform guard error on non-native platform", async () => {
      mockHasNativeCapabilities.mockReturnValue(false);

      await expect(checkForUpdate()).rejects.toThrow(
        "checkForUpdate is not available on this platform",
      );
    });

    it("propagates invoke errors", async () => {
      mockInvokeError("check_for_update", "network error");

      await expect(checkForUpdate()).rejects.toThrow("network error");
    });
  });

  // ── downloadUpdate ─────────────────────────────────────────────────────────

  describe("downloadUpdate", () => {
    const url = "https://example.com/liteduck.dmg";
    const filename = "liteduck.dmg";
    const tempPath = "/tmp/liteduck.dmg";

    it("invokes download_update with url and filename, returns temp path", async () => {
      mockInvokeResponse("download_update", tempPath);

      const result = await downloadUpdate(url, filename);

      expect(mockInvoke).toHaveBeenCalledWith("download_update", { url, filename });
      expect(result).toBe(tempPath);
    });

    it("throws platform guard error on non-native platform", async () => {
      mockHasNativeCapabilities.mockReturnValue(false);

      await expect(downloadUpdate(url, filename)).rejects.toThrow(
        "downloadUpdate is not available on this platform",
      );
    });

    it("propagates invoke errors", async () => {
      mockInvokeError("download_update", "download failed: connection reset");

      await expect(downloadUpdate(url, filename)).rejects.toThrow("download failed");
    });
  });

  // ── installUpdate ──────────────────────────────────────────────────────────

  describe("installUpdate", () => {
    const installerPath = "/tmp/liteduck.dmg";

    it("invokes install_update with path", async () => {
      mockInvoke.mockResolvedValueOnce(null);

      await installUpdate(installerPath);

      expect(mockInvoke).toHaveBeenCalledWith("install_update", { path: installerPath });
    });

    it("throws platform guard error on non-native platform", async () => {
      mockHasNativeCapabilities.mockReturnValue(false);

      await expect(installUpdate(installerPath)).rejects.toThrow(
        "installUpdate is not available on this platform",
      );
    });

    it("propagates invoke errors", async () => {
      mockInvokeError("install_update", "installer not found");

      await expect(installUpdate(installerPath)).rejects.toThrow("installer not found");
    });
  });

  // ── getAppVersion ──────────────────────────────────────────────────────────

  describe("getAppVersion", () => {
    it("invokes get_app_version and returns version string", async () => {
      mockInvokeResponse("get_app_version", "2026.4.11");

      const result = await getAppVersion();

      expect(mockInvoke).toHaveBeenCalledWith("get_app_version");
      expect(result).toBe("2026.4.11");
    });

    it("falls back to tauri app API when invoke throws", async () => {
      // Simulate the iOS case where the updater module is excluded
      mockInvoke.mockRejectedValueOnce(new Error("command not found"));
      mockGetVersion.mockResolvedValue("2026.4.11");

      const result = await getAppVersion();

      expect(result).toBe("2026.4.11");
      expect(mockGetVersion).toHaveBeenCalled();
    });

    it("returns version from fallback path", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("unknown command"));
      mockGetVersion.mockResolvedValue("2026.4.9");

      const result = await getAppVersion();

      expect(result).toBe("2026.4.9");
    });
  });
});
