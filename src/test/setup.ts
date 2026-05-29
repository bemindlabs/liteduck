import "@testing-library/jest-dom";
import { vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock @tauri-apps/api/core
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mock @tauri-apps/api/event + @tauri-apps/api/webview
// ---------------------------------------------------------------------------
//
// Window-scoped event listeners use `getCurrentWebview().listen(...)` so the
// backend's `emit_to(label, …)` isolates to one window. Tests assert on the
// `@tauri-apps/api/event` `listen` mock, so the webview's `listen` must be the
// SAME mock function — share it via `vi.hoisted` (the mock factories are
// hoisted above imports).
const { sharedListen } = vi.hoisted(() => {
  const fn = vi.fn();
  fn.mockResolvedValue(() => {
    // no-op unlisten
  });
  return { sharedListen: fn };
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: sharedListen,
  emit: vi.fn().mockResolvedValue(undefined),
  once: vi.fn().mockResolvedValue(() => {
    // Returns a no-op unlisten callback
  }),
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    label: "main",
    listen: sharedListen,
    onDragDropEvent: vi.fn().mockResolvedValue(() => {
      // Returns a no-op unlisten callback
    }),
  }),
}));
