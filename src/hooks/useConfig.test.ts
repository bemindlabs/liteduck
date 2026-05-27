import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as tauriEvent from "@tauri-apps/api/event";
import { useConfig, useConfigSection } from "./useConfig";
import {
  mockInvoke,
  mockInvokeResponse,
  mockListenResponse,
  resetTauriMocks,
} from "@/test/tauri-mocks";
import type { Config } from "@/lib/home";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: Config = {
  appearance: {
    theme: "system",
    font_family: "monospace",
    font_size: 14,
    sidebar_position: "left",
    sidebar_collapsed: false,
  },
  terminal: {
    shell: "/bin/zsh",
    env: {},
    scrollback: 5000,
  },
  git: {
    auto_fetch: true,
    fetch_interval_secs: 300,
    sign_commits: false,
  },
  telemetry: {
    enabled: false,
    anonymous: true,
  },
};

// ---------------------------------------------------------------------------
// WorkspaceContext mock
// ---------------------------------------------------------------------------

// useConfig depends on useWorkspace. We mock the whole context module so tests
// run without a React tree providing WorkspaceProvider.
vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({ workspace: "" }),
}));

// ---------------------------------------------------------------------------
// Tests: useConfig
// ---------------------------------------------------------------------------

describe("useConfig", () => {
  beforeEach(() => {
    resetTauriMocks();
    mockListenResponse();
    mockInvokeResponse("home_resolve_config", DEFAULT_CONFIG);
  });

  it("returns loading=true before the first invoke resolves", () => {
    // Keep invoke pending so we can inspect the loading state.
    mockInvoke.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useConfig());
    expect(result.current.loading).toBe(true);
    expect(result.current.config).toBeNull();
  });

  it("resolves config on mount and sets loading=false", async () => {
    const { result } = renderHook(() => useConfig());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.config).toEqual(DEFAULT_CONFIG);
    expect(result.current.error).toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith("home_resolve_config", { workspace: null });
  });

  it("sets error when invoke rejects", async () => {
    mockInvoke.mockRejectedValue(new Error("disk error"));

    const { result } = renderHook(() => useConfig());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.config).toBeNull();
    expect(result.current.error).toContain("disk error");
  });

  it("re-reads config when a config-changed event fires", async () => {
    // Capture the listener callback registered by the hook.
    type EventCallback = Parameters<typeof tauriEvent.listen>[1];
    let capturedListener: EventCallback | undefined;
    vi.mocked(tauriEvent.listen).mockImplementation((_event, handler) => {
      capturedListener = handler;
      return Promise.resolve(vi.fn());
    });

    const UPDATED_CONFIG: Config = {
      ...DEFAULT_CONFIG,
      appearance: { ...DEFAULT_CONFIG.appearance, theme: "dark" },
    };

    // First call returns DEFAULT_CONFIG; second returns UPDATED_CONFIG.
    mockInvoke.mockResolvedValueOnce(DEFAULT_CONFIG).mockResolvedValueOnce(UPDATED_CONFIG);

    const { result } = renderHook(() => useConfig());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.config?.appearance.theme).toBe("system");

    // Simulate the Tauri event arriving (supply required Event fields).
    act(() => {
      capturedListener?.({ event: "config-changed", id: 1, payload: { source: "global" } });
    });

    await waitFor(() => expect(result.current.config?.appearance.theme).toBe("dark"));
  });

  it("reload() re-invokes home_resolve_config", async () => {
    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockInvokeResponse("home_resolve_config", {
      ...DEFAULT_CONFIG,
      appearance: { ...DEFAULT_CONFIG.appearance, font_size: 18 },
    });

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.config?.appearance.font_size).toBe(18);
  });

  it("unlistens on unmount", async () => {
    const unlistenFn = vi.fn();
    vi.mocked(tauriEvent.listen).mockResolvedValue(unlistenFn);

    const { unmount } = renderHook(() => useConfig());
    await waitFor(() =>
      expect(vi.mocked(tauriEvent.listen)).toHaveBeenCalledWith(
        "config-changed",
        expect.any(Function),
      ),
    );

    unmount();

    // unlisten is called asynchronously after the promise resolves.
    await waitFor(() => expect(unlistenFn).toHaveBeenCalled());
  });
});

// ---------------------------------------------------------------------------
// Tests: useConfigSection
// ---------------------------------------------------------------------------

describe("useConfigSection", () => {
  beforeEach(() => {
    resetTauriMocks();
    mockListenResponse();
    mockInvokeResponse("home_resolve_config", DEFAULT_CONFIG);
  });

  it("returns the correct config section", async () => {
    const { result } = renderHook(() => useConfigSection("appearance"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.value).toEqual(DEFAULT_CONFIG.appearance);
  });

  it("returns null value while loading", () => {
    mockInvoke.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useConfigSection("terminal"));
    expect(result.current.value).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it("update() calls home_config_write with merged section", async () => {
    // Stub write to resolve cleanly; a subsequent resolve for the re-read
    // triggered by the config-changed event (not tested here — integration).
    mockInvoke
      .mockResolvedValueOnce(DEFAULT_CONFIG) // home_resolve_config on mount
      .mockResolvedValueOnce(undefined); // home_config_write

    const { result } = renderHook(() => useConfigSection("appearance"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.update({ theme: "dark" });
    });

    expect(mockInvoke).toHaveBeenCalledWith("home_config_write", {
      config: {
        ...DEFAULT_CONFIG,
        appearance: { ...DEFAULT_CONFIG.appearance, theme: "dark" },
      },
    });
  });

  it("update() is a no-op when config has not yet loaded", async () => {
    mockInvoke.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useConfigSection("git"));

    await act(async () => {
      await result.current.update({ sign_commits: true });
    });

    // home_config_write should never have been called.
    expect(mockInvoke).not.toHaveBeenCalledWith("home_config_write", expect.anything());
  });
});
