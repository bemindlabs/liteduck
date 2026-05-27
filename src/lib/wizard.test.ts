import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock settings before importing wizard so the module picks up the mock.
vi.mock("@/lib/settings", () => ({
  getSetting: vi.fn(),
  saveSetting: vi.fn(),
}));

import {
  shouldShowWizard,
  shouldShowWizardForWorkspace,
  markWizardCompletedForWorkspace,
} from "./wizard";
import { getSetting, saveSetting } from "@/lib/settings";

const mockGetSetting = vi.mocked(getSetting);
const mockSaveSetting = vi.mocked(saveSetting);

describe("shouldShowWizard()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── wizard not yet completed ─────────────────────────────────────────────────

  it("returns true when wizard_completed is not set (null)", async () => {
    mockGetSetting.mockResolvedValueOnce(null);

    const result = await shouldShowWizard();

    expect(result).toBe(true);
    expect(mockGetSetting).toHaveBeenCalledWith("wizard_completed");
  });

  it("returns true when wizard_completed is an empty string", async () => {
    mockGetSetting.mockResolvedValueOnce("");

    expect(await shouldShowWizard()).toBe(true);
  });

  it("returns true when wizard_completed is 'false'", async () => {
    mockGetSetting.mockResolvedValueOnce("false");

    expect(await shouldShowWizard()).toBe(true);
  });

  it("returns true when wizard_completed is any value that is not 'true'", async () => {
    mockGetSetting.mockResolvedValueOnce("1");

    expect(await shouldShowWizard()).toBe(true);
  });

  // ── wizard already completed ──────────────────────────────────────────────────

  it("returns false when wizard_completed is 'true'", async () => {
    mockGetSetting.mockResolvedValueOnce("true");

    const result = await shouldShowWizard();

    expect(result).toBe(false);
  });

  // ── error path ────────────────────────────────────────────────────────────────

  it("returns true when getSetting throws (settings DB not yet initialised)", async () => {
    mockGetSetting.mockRejectedValueOnce(new Error("Settings invoke timed out"));

    const result = await shouldShowWizard();

    expect(result).toBe(true);
  });

  it("returns true when getSetting rejects with an arbitrary error", async () => {
    mockGetSetting.mockRejectedValueOnce(new Error("unknown error"));

    expect(await shouldShowWizard()).toBe(true);
  });
});

describe("shouldShowWizardForWorkspace()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false for empty workspace", async () => {
    expect(await shouldShowWizardForWorkspace("")).toBe(false);
  });

  it("returns true when no completed workspaces setting exists", async () => {
    mockGetSetting.mockResolvedValueOnce(null);

    expect(await shouldShowWizardForWorkspace("/projects/new")).toBe(true);
  });

  it("returns true when workspace is not in the completed list", async () => {
    mockGetSetting.mockResolvedValueOnce(JSON.stringify(["/projects/old"]));

    expect(await shouldShowWizardForWorkspace("/projects/new")).toBe(true);
  });

  it("returns false when workspace is in the completed list", async () => {
    mockGetSetting.mockResolvedValueOnce(JSON.stringify(["/projects/old", "/projects/new"]));

    expect(await shouldShowWizardForWorkspace("/projects/new")).toBe(false);
  });

  it("returns true when setting is corrupt JSON", async () => {
    mockGetSetting.mockResolvedValueOnce("not-json");

    expect(await shouldShowWizardForWorkspace("/projects/new")).toBe(true);
  });

  it("returns true when getSetting throws", async () => {
    mockGetSetting.mockRejectedValueOnce(new Error("fail"));

    expect(await shouldShowWizardForWorkspace("/projects/new")).toBe(true);
  });
});

describe("markWizardCompletedForWorkspace()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveSetting.mockResolvedValue(undefined);
  });

  it("does nothing for empty workspace", async () => {
    await markWizardCompletedForWorkspace("");

    expect(mockSaveSetting).not.toHaveBeenCalled();
  });

  it("creates new list when no prior setting exists", async () => {
    mockGetSetting.mockResolvedValueOnce(null);

    await markWizardCompletedForWorkspace("/projects/new");

    expect(mockSaveSetting).toHaveBeenCalledWith(
      "wizard_completed_workspaces",
      JSON.stringify(["/projects/new"]),
    );
  });

  it("appends to existing list", async () => {
    mockGetSetting.mockResolvedValueOnce(JSON.stringify(["/projects/old"]));

    await markWizardCompletedForWorkspace("/projects/new");

    expect(mockSaveSetting).toHaveBeenCalledWith(
      "wizard_completed_workspaces",
      JSON.stringify(["/projects/old", "/projects/new"]),
    );
  });

  it("does not duplicate an already-completed workspace", async () => {
    mockGetSetting.mockResolvedValueOnce(JSON.stringify(["/projects/new"]));

    await markWizardCompletedForWorkspace("/projects/new");

    expect(mockSaveSetting).not.toHaveBeenCalled();
  });

  it("resets corrupt data and adds workspace", async () => {
    mockGetSetting.mockResolvedValueOnce("corrupt");

    await markWizardCompletedForWorkspace("/projects/new");

    expect(mockSaveSetting).toHaveBeenCalledWith(
      "wizard_completed_workspaces",
      JSON.stringify(["/projects/new"]),
    );
  });
});
