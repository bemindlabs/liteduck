import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as tauriEvent from "@tauri-apps/api/event";
import { useMenuEvents } from "./useMenuEvents";
import { mockListen, mockListenResponse, resetTauriMocks } from "@/test/tauri-mocks";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ListenHandler = Parameters<typeof tauriEvent.listen>[1];

/**
 * Captures the handler registered for a given event name and returns a
 * function that can be called to simulate the event firing.
 */
function captureListener(eventName: string): (payload: string) => void {
  let captured: ListenHandler | undefined;
  vi.mocked(tauriEvent.listen).mockImplementation((event, handler) => {
    if (event === eventName) captured = handler;
    return Promise.resolve(vi.fn());
  });
  return (payload: string) => {
    captured?.({ event: eventName, id: 1, payload });
  };
}

/** Minimal handler set with all callbacks stubbed. */
function makeHandlers(overrides: Partial<Parameters<typeof useMenuEvents>[0]> = {}) {
  return {
    navigate: vi.fn(),
    onToggleSidebar: vi.fn(),
    onOpenCommandPalette: vi.fn(),
    onToggleDark: vi.fn(),
    onNewTerminalTab: vi.fn(),
    onCloseTerminalTab: vi.fn(),
    onOpenShortcutsHelp: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// menu-navigate events
// ---------------------------------------------------------------------------

describe("useMenuEvents — menu-navigate", () => {
  beforeEach(() => {
    resetTauriMocks();
  });

  it("calls navigate with the route payload", async () => {
    const fireNavigate = captureListener("menu-navigate");
    const handlers = makeHandlers();

    renderHook(() => useMenuEvents(handlers));

    await waitFor(() =>
      expect(vi.mocked(tauriEvent.listen)).toHaveBeenCalledWith(
        "menu-navigate",
        expect.any(Function),
      ),
    );

    act(() => {
      fireNavigate("/terminal");
    });

    expect(handlers.navigate).toHaveBeenCalledWith("/terminal");
  });

  it("does NOT call navigate when the payload is an empty string", async () => {
    const fireNavigate = captureListener("menu-navigate");
    const handlers = makeHandlers();

    renderHook(() => useMenuEvents(handlers));

    await waitFor(() =>
      expect(vi.mocked(tauriEvent.listen)).toHaveBeenCalledWith(
        "menu-navigate",
        expect.any(Function),
      ),
    );

    act(() => {
      fireNavigate("");
    });

    expect(handlers.navigate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// menu-action events
// ---------------------------------------------------------------------------

describe("useMenuEvents — menu-action", () => {
  let fireAction: (payload: string) => void;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(async () => {
    resetTauriMocks();
    fireAction = captureListener("menu-action");
    handlers = makeHandlers();

    renderHook(() => useMenuEvents(handlers));

    await waitFor(() =>
      expect(vi.mocked(tauriEvent.listen)).toHaveBeenCalledWith(
        "menu-action",
        expect.any(Function),
      ),
    );
  });

  it("new_terminal calls onNewTerminalTab", () => {
    act(() => fireAction("new_terminal"));
    expect(handlers.onNewTerminalTab).toHaveBeenCalledTimes(1);
  });

  it("close_tab calls onCloseTerminalTab", () => {
    act(() => fireAction("close_tab"));
    expect(handlers.onCloseTerminalTab).toHaveBeenCalledTimes(1);
  });

  it("toggle_sidebar calls onToggleSidebar", () => {
    act(() => fireAction("toggle_sidebar"));
    expect(handlers.onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it("command_palette calls onOpenCommandPalette", () => {
    act(() => fireAction("command_palette"));
    expect(handlers.onOpenCommandPalette).toHaveBeenCalledTimes(1);
  });

  it("toggle_dark calls onToggleDark", () => {
    act(() => fireAction("toggle_dark"));
    expect(handlers.onToggleDark).toHaveBeenCalledTimes(1);
  });

  it("toggle_focus does not throw when onToggleFocusMode is absent", () => {
    // Default handlers object has no onToggleFocusMode — firing the action
    // must be a silent no-op, not a crash.
    expect(() => {
      act(() => fireAction("toggle_focus"));
    }).not.toThrow();
  });

  it("shortcuts_help calls onOpenShortcutsHelp", () => {
    act(() => fireAction("shortcuts_help"));
    expect(handlers.onOpenShortcutsHelp).toHaveBeenCalledTimes(1);
  });

  it("about action navigates to /settings", () => {
    act(() => fireAction("about"));
    expect(handlers.navigate).toHaveBeenCalledWith("/settings");
  });

  it("unknown action does not throw", () => {
    expect(() => {
      act(() => fireAction("unknown_action_xyz"));
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Cleanup / unlisten
// ---------------------------------------------------------------------------

describe("useMenuEvents — cleanup", () => {
  beforeEach(() => {
    resetTauriMocks();
  });

  it("calls the unlisten function for both listeners on unmount", async () => {
    const unlistenFn = vi.fn();
    mockListen.mockResolvedValue(unlistenFn);

    const handlers = makeHandlers();
    const { unmount } = renderHook(() => useMenuEvents(handlers));

    await waitFor(() => expect(mockListen).toHaveBeenCalledTimes(2));

    unmount();

    await waitFor(() => expect(unlistenFn).toHaveBeenCalledTimes(2));
  });

  it("registers exactly two listeners (menu-navigate and menu-action)", async () => {
    mockListenResponse();
    const handlers = makeHandlers();
    renderHook(() => useMenuEvents(handlers));

    await waitFor(() => expect(mockListen).toHaveBeenCalledTimes(2));

    const registeredEvents = mockListen.mock.calls.map((call) => call[0]);
    expect(registeredEvents).toContain("menu-navigate");
    expect(registeredEvents).toContain("menu-action");
  });
});
