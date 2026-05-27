import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  WorkspaceProvider,
  useWorkspace,
  MAX_RECENT_WORKSPACES,
  type RemoteInfo,
} from "./WorkspaceContext";
import { resetTauriMocks } from "@/test/tauri-mocks";

// ---------------------------------------------------------------------------
// Mock the settings lib
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
  <WorkspaceProvider>{children}</WorkspaceProvider>
);

const sampleRemote: RemoteInfo = {
  connectionId: "conn-1",
  profileId: "profile-1",
  profileName: "Dev Server",
  host: "192.168.1.100",
  username: "dev",
};

// ---------------------------------------------------------------------------
// Tests: initial loading state
// ---------------------------------------------------------------------------

describe("WorkspaceProvider — initial state", () => {
  beforeEach(() => {
    resetTauriMocks();
    // Keep all getSetting calls pending to observe loading state
    mockGetSetting.mockReturnValue(new Promise(() => undefined));
  });

  it("starts with isLoading=true", () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    expect(result.current.isLoading).toBe(true);
  });

  it("starts with an empty workspace path", () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    expect(result.current.workspace).toBe("");
  });

  it("starts with remoteInfo=null", () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    expect(result.current.remoteInfo).toBeNull();
  });

  it("starts with an empty recentWorkspaces list", () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    expect(result.current.recentWorkspaces).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: hydration from persisted settings
// ---------------------------------------------------------------------------

describe("WorkspaceProvider — hydration", () => {
  beforeEach(() => {
    resetTauriMocks();
  });

  it("sets isLoading=false after settings load", async () => {
    mockGetSetting.mockResolvedValue(null);

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it("hydrates workspace path from 'workspace_directory' setting", async () => {
    mockGetSetting.mockImplementation((key) => {
      if (key === "workspace_directory") return Promise.resolve("/home/dev/project");
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await waitFor(() => expect(result.current.workspace).toBe("/home/dev/project"));
  });

  it("hydrates remoteInfo from 'workspace_remote_info' setting", async () => {
    mockGetSetting.mockImplementation((key) => {
      if (key === "workspace_remote_info") return Promise.resolve(JSON.stringify(sampleRemote));
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await waitFor(() => expect(result.current.remoteInfo).toEqual(sampleRemote));
  });

  it("ignores malformed JSON in 'workspace_remote_info'", async () => {
    mockGetSetting.mockImplementation((key) => {
      if (key === "workspace_remote_info") return Promise.resolve("{{broken");
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.remoteInfo).toBeNull();
  });

  it("hydrates recentWorkspaces from 'workspace_history' as RecentWorkspace[]", async () => {
    const history = [{ path: "/home/dev/a" }, { path: "/home/dev/b" }];
    mockGetSetting.mockImplementation((key) => {
      if (key === "workspace_history") return Promise.resolve(JSON.stringify(history));
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await waitFor(() => expect(result.current.recentWorkspaces).toHaveLength(2));
    expect(result.current.recentWorkspaces[0].path).toBe("/home/dev/a");
  });

  it("migrates old string[] history format to RecentWorkspace[]", async () => {
    const legacyHistory = ["/home/dev/old-a", "/home/dev/old-b"];
    mockGetSetting.mockImplementation((key) => {
      if (key === "workspace_history") return Promise.resolve(JSON.stringify(legacyHistory));
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await waitFor(() => expect(result.current.recentWorkspaces).toHaveLength(2));
    expect(result.current.recentWorkspaces[0]).toEqual({ path: "/home/dev/old-a" });
  });

  it("ignores malformed JSON in 'workspace_history'", async () => {
    mockGetSetting.mockImplementation((key) => {
      if (key === "workspace_history") return Promise.resolve("[not valid");
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.recentWorkspaces).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: setWorkspace
// ---------------------------------------------------------------------------

describe("WorkspaceProvider — setWorkspace", () => {
  beforeEach(() => {
    resetTauriMocks();
    mockGetSetting.mockResolvedValue(null);
    mockSaveSetting.mockResolvedValue(undefined);
  });

  it("updates workspace state synchronously", async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.setWorkspace("/new/path");
    });

    expect(result.current.workspace).toBe("/new/path");
  });

  it("persists workspace_directory via saveSetting", async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.setWorkspace("/new/path");
    });

    expect(mockSaveSetting).toHaveBeenCalledWith("workspace_directory", "/new/path");
  });

  it("stores remoteInfo as JSON string when provided", async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.setWorkspace("/remote/path", sampleRemote);
    });

    expect(mockSaveSetting).toHaveBeenCalledWith(
      "workspace_remote_info",
      JSON.stringify(sampleRemote),
    );
    expect(result.current.remoteInfo).toEqual(sampleRemote);
  });

  it("stores empty string for remoteInfo when no remote is given", async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.setWorkspace("/local/path");
    });

    expect(mockSaveSetting).toHaveBeenCalledWith("workspace_remote_info", "");
    expect(result.current.remoteInfo).toBeNull();
  });

  it("prepends the new workspace to recentWorkspaces", async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.setWorkspace("/first");
    });
    await act(async () => {
      await result.current.setWorkspace("/second");
    });

    expect(result.current.recentWorkspaces[0].path).toBe("/second");
    expect(result.current.recentWorkspaces[1].path).toBe("/first");
  });

  it("deduplicates when the same path is set again", async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.setWorkspace("/dup");
    });
    await act(async () => {
      await result.current.setWorkspace("/other");
    });
    await act(async () => {
      await result.current.setWorkspace("/dup"); // re-set
    });

    const paths = result.current.recentWorkspaces.map((w) => w.path);
    expect(paths.filter((p) => p === "/dup")).toHaveLength(1);
  });

  it(`caps recentWorkspaces at MAX_RECENT_WORKSPACES (${MAX_RECENT_WORKSPACES})`, async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    for (let i = 0; i < MAX_RECENT_WORKSPACES + 2; i++) {
      await act(async () => {
        await result.current.setWorkspace(`/path-${i}`);
      });
    }

    expect(result.current.recentWorkspaces).toHaveLength(MAX_RECENT_WORKSPACES);
  });
});

// ---------------------------------------------------------------------------
// Tests: removeFromRecent
// ---------------------------------------------------------------------------

describe("WorkspaceProvider — removeFromRecent", () => {
  beforeEach(() => {
    resetTauriMocks();
    mockGetSetting.mockResolvedValue(null);
    mockSaveSetting.mockResolvedValue(undefined);
  });

  it("removes the specified path from recentWorkspaces", async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.setWorkspace("/keep");
    });
    await act(async () => {
      await result.current.setWorkspace("/remove-me");
    });

    act(() => {
      void result.current.removeFromRecent("/remove-me");
    });

    await waitFor(() =>
      expect(result.current.recentWorkspaces.map((w) => w.path)).not.toContain("/remove-me"),
    );
  });

  it("is a no-op when the path is not in the list", async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.setWorkspace("/existing");
    });

    const before = result.current.recentWorkspaces.length;

    act(() => {
      void result.current.removeFromRecent("/does-not-exist");
    });

    await waitFor(() => expect(result.current.recentWorkspaces.length).toBe(before));
  });

  it("persists the updated history via saveSetting after removal", async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.setWorkspace("/to-remove");
    });

    mockSaveSetting.mockClear();

    act(() => {
      void result.current.removeFromRecent("/to-remove");
    });

    await waitFor(() =>
      expect(mockSaveSetting).toHaveBeenCalledWith("workspace_history", expect.any(String)),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: error guard
// ---------------------------------------------------------------------------

describe("useWorkspace — outside provider guard", () => {
  it("throws when used outside WorkspaceProvider", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => renderHook(() => useWorkspace())).toThrow(
      "useWorkspace must be used inside WorkspaceProvider",
    );

    consoleSpy.mockRestore();
  });
});
