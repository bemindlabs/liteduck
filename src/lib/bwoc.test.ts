import { describe, it, expect, beforeEach } from "vitest";
import {
  mockInvoke,
  mockInvokeResponse,
  mockInvokeError,
  resetTauriMocks,
} from "@/test/tauri-mocks";
import { bwocDetect, bwocList, type BwocStatus, type BwocAgent } from "./bwoc";

describe("bwoc IPC wrappers", () => {
  beforeEach(() => {
    resetTauriMocks();
  });

  // ── bwocDetect ───────────────────────────────────────────────────────────────

  describe("bwocDetect", () => {
    it("invokes bwoc_detect and returns status when installed", async () => {
      const status: BwocStatus = {
        installed: true,
        version: "2.5.0",
        path: "/opt/homebrew/bin/bwoc",
      };
      mockInvokeResponse("bwoc_detect", status);

      const result = await bwocDetect();

      expect(mockInvoke).toHaveBeenCalledWith("bwoc_detect");
      expect(result).toEqual(status);
    });

    it("returns installed:false when the CLI is not present", async () => {
      const status: BwocStatus = { installed: false, version: null, path: null };
      mockInvokeResponse("bwoc_detect", status);

      const result = await bwocDetect();

      expect(result.installed).toBe(false);
      expect(result.version).toBeNull();
      expect(result.path).toBeNull();
    });

    it("propagates errors", async () => {
      mockInvokeError("bwoc_detect", "Failed to run 'which bwoc'");

      await expect(bwocDetect()).rejects.toThrow("Failed to run 'which bwoc'");
    });
  });

  // ── bwocList ─────────────────────────────────────────────────────────────────

  describe("bwocList", () => {
    it("invokes bwoc_list and returns the agent rows", async () => {
      const agents: BwocAgent[] = [
        { name: "agent-sun", role: "active", raw: "○ agent-sun active claude" },
        { name: "agent-mars", role: "active", raw: "○ agent-mars active claude" },
      ];
      mockInvokeResponse("bwoc_list", agents);

      const result = await bwocList();

      expect(mockInvoke).toHaveBeenCalledWith("bwoc_list");
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("agent-sun");
      expect(result[0].role).toBe("active");
    });

    it("returns an empty array when no agents are registered", async () => {
      mockInvokeResponse("bwoc_list", []);

      const result = await bwocList();

      expect(result).toEqual([]);
    });

    it("rejects when bwoc is not installed", async () => {
      mockInvokeError("bwoc_list", "bwoc is not installed");

      await expect(bwocList()).rejects.toThrow("bwoc is not installed");
    });
  });
});
