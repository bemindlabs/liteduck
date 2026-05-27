import { vi } from "vitest";
import * as tauriCore from "@tauri-apps/api/core";
import * as tauriEvent from "@tauri-apps/api/event";

// ---------------------------------------------------------------------------
// Typed references to the mocked functions
// ---------------------------------------------------------------------------

export const mockInvoke = vi.mocked(tauriCore.invoke);
export const mockListen = vi.mocked(tauriEvent.listen);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Configures the invoke mock to return `response` when called with `command`.
 * All other commands keep their current mock implementation.
 *
 * Usage:
 *   mockInvokeResponse("project_list", [{ id: 1, name: "My Project" }]);
 */
export function mockInvokeResponse(command: string, response: unknown): void {
  mockInvoke.mockImplementation((cmd: string, ..._args: unknown[]) => {
    if (cmd === command) {
      return Promise.resolve(response);
    }
    return Promise.resolve(undefined);
  });
}

/**
 * Configures the invoke mock to reject with `error` when called with `command`.
 */
export function mockInvokeError(command: string, error: string): void {
  mockInvoke.mockImplementation((cmd: string, ..._args: unknown[]) => {
    if (cmd === command) {
      return Promise.reject(new Error(error));
    }
    return Promise.resolve(undefined);
  });
}

/**
 * Configures the listen mock to return a no-op unlisten callback.
 * The returned mock can be inspected for call assertions.
 */
export function mockListenResponse(): ReturnType<typeof vi.fn> {
  const unlisten = vi.fn();
  mockListen.mockResolvedValue(unlisten);
  return unlisten;
}

/**
 * Resets all Tauri mocks to their default resolved-undefined state.
 * Call in beforeEach to ensure test isolation.
 */
export function resetTauriMocks(): void {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(undefined);
  mockListen.mockReset();
  mockListen.mockResolvedValue(vi.fn());
}
