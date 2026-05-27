import { describe, it, expect, beforeEach } from "vitest";
import { mockInvoke, resetTauriMocks } from "@/test/tauri-mocks";
import { getSettings, saveSetting, getSetting, getSecrets, deleteSetting } from "./settings";

describe("settings helpers", () => {
  beforeEach(() => {
    resetTauriMocks();
  });

  // ── getSettings ────────────────────────────────────────────────────────────

  describe("getSettings", () => {
    it("returns all non-secret settings as a flat map", async () => {
      const map = {
        theme: "dark",
        language: "en",
        workspace_path: "/home/user/projects",
      };
      mockInvoke.mockResolvedValueOnce(map);

      const result = await getSettings();

      expect(result).toEqual(map);
      expect(mockInvoke).toHaveBeenCalledWith("get_settings");
    });

    it("returns an empty map when no settings are stored", async () => {
      mockInvoke.mockResolvedValueOnce({});

      const result = await getSettings();

      expect(result).toEqual({});
    });

    it("propagates invoke errors", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("database locked"));

      await expect(getSettings()).rejects.toThrow("database locked");
    });
  });

  // ── saveSetting ────────────────────────────────────────────────────────────

  describe("saveSetting", () => {
    it("saves a non-secret setting with isSecret defaulting to false", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await expect(saveSetting("theme", "dark")).resolves.toBeUndefined();

      expect(mockInvoke).toHaveBeenCalledWith("save_setting", {
        key: "theme",
        value: "dark",
        isSecret: false,
      });
    });

    it("saves a secret setting when isSecret is true", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await expect(saveSetting("api_token", "secret-abc123", true)).resolves.toBeUndefined();

      expect(mockInvoke).toHaveBeenCalledWith("save_setting", {
        key: "api_token",
        value: "secret-abc123",
        isSecret: true,
      });
    });

    it("saves a non-secret setting when isSecret is explicitly false", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await saveSetting("workspace", "/tmp/ws", false);

      expect(mockInvoke).toHaveBeenCalledWith("save_setting", {
        key: "workspace",
        value: "/tmp/ws",
        isSecret: false,
      });
    });

    it("propagates invoke errors", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("keychain unavailable"));

      await expect(saveSetting("token", "val", true)).rejects.toThrow("keychain unavailable");
    });
  });

  // ── getSetting ─────────────────────────────────────────────────────────────

  describe("getSetting", () => {
    it("returns the stored value for a non-secret key", async () => {
      mockInvoke.mockResolvedValueOnce("dark");

      const result = await getSetting("theme");

      expect(result).toBe("dark");
      expect(mockInvoke).toHaveBeenCalledWith("get_setting", {
        key: "theme",
        isSecret: false,
      });
    });

    it("returns the stored value for a secret key", async () => {
      mockInvoke.mockResolvedValueOnce("super-secret-token");

      const result = await getSetting("api_token", true);

      expect(result).toBe("super-secret-token");
      expect(mockInvoke).toHaveBeenCalledWith("get_setting", {
        key: "api_token",
        isSecret: true,
      });
    });

    it("returns null when the key does not exist (backend returns null)", async () => {
      mockInvoke.mockResolvedValueOnce(null);

      const result = await getSetting("nonexistent_key");

      expect(result).toBeNull();
    });

    it("returns null when the backend returns undefined", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const result = await getSetting("missing");

      expect(result).toBeNull();
    });

    it("uses isSecret=false by default", async () => {
      mockInvoke.mockResolvedValueOnce("value");

      await getSetting("some_key");

      expect(mockInvoke).toHaveBeenCalledWith("get_setting", {
        key: "some_key",
        isSecret: false,
      });
    });

    it("propagates invoke errors", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("db error"));

      await expect(getSetting("key")).rejects.toThrow("db error");
    });
  });

  // ── getSecrets ─────────────────────────────────────────────────────────────

  describe("getSecrets", () => {
    it("returns a map of key-value pairs for all found secrets", async () => {
      const secrets = { api_token: "abc123", github_token: "ghp_xyz" };
      mockInvoke.mockResolvedValueOnce(secrets);

      const result = await getSecrets(["api_token", "github_token"]);

      expect(result).toEqual(secrets);
      expect(mockInvoke).toHaveBeenCalledWith("get_secrets", {
        keys: ["api_token", "github_token"],
      });
    });

    it("omits keys that are not found in the keychain", async () => {
      mockInvoke.mockResolvedValueOnce({ api_token: "abc123" });

      const result = await getSecrets(["api_token", "missing_key"]);

      expect(result).toEqual({ api_token: "abc123" });
      expect(result).not.toHaveProperty("missing_key");
    });

    it("returns an empty map when no requested keys exist", async () => {
      mockInvoke.mockResolvedValueOnce({});

      const result = await getSecrets(["no_key_1", "no_key_2"]);

      expect(result).toEqual({});
    });

    it("handles empty keys array", async () => {
      mockInvoke.mockResolvedValueOnce({});

      const result = await getSecrets([]);

      expect(result).toEqual({});
      expect(mockInvoke).toHaveBeenCalledWith("get_secrets", { keys: [] });
    });

    it("propagates invoke errors", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("keychain locked"));

      await expect(getSecrets(["token"])).rejects.toThrow("keychain locked");
    });
  });

  // ── deleteSetting ──────────────────────────────────────────────────────────

  describe("deleteSetting", () => {
    it("deletes a non-secret setting with isSecret defaulting to false", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await expect(deleteSetting("theme")).resolves.toBeUndefined();

      expect(mockInvoke).toHaveBeenCalledWith("delete_setting", {
        key: "theme",
        isSecret: false,
      });
    });

    it("deletes a secret setting when isSecret is true", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await expect(deleteSetting("api_token", true)).resolves.toBeUndefined();

      expect(mockInvoke).toHaveBeenCalledWith("delete_setting", {
        key: "api_token",
        isSecret: true,
      });
    });

    it("deletes a non-secret setting when isSecret is explicitly false", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await deleteSetting("workspace_path", false);

      expect(mockInvoke).toHaveBeenCalledWith("delete_setting", {
        key: "workspace_path",
        isSecret: false,
      });
    });

    it("propagates invoke errors", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("key not found"));

      await expect(deleteSetting("nonexistent")).rejects.toThrow("key not found");
    });
  });

  // ── combined scenario ──────────────────────────────────────────────────────

  it("can save then retrieve a setting in sequence", async () => {
    mockInvoke.mockResolvedValueOnce(undefined).mockResolvedValueOnce("en");

    await saveSetting("language", "en");
    const value = await getSetting("language");

    expect(value).toBe("en");
    expect(mockInvoke).toHaveBeenNthCalledWith(1, "save_setting", {
      key: "language",
      value: "en",
      isSecret: false,
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "get_setting", {
      key: "language",
      isSecret: false,
    });
  });
});
