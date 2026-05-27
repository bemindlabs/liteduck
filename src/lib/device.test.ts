import { describe, it, expect, beforeEach } from "vitest";
import {
  mockInvoke,
  mockInvokeResponse,
  mockInvokeError,
  resetTauriMocks,
} from "@/test/tauri-mocks";
import { deviceGetIdentity, deviceResetIdentity } from "./device";
import type { DeviceIdentity } from "./device";

const makeIdentity = (deviceId = "550e8400-e29b-41d4-a716-446655440000"): DeviceIdentity => ({
  device_id: deviceId,
  secret: "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
  created_at: "2026-01-01T00:00:00Z",
});

describe("deviceGetIdentity", () => {
  beforeEach(() => {
    resetTauriMocks();
  });

  it("invokes device_get_identity and returns the identity", async () => {
    const identity = makeIdentity();
    mockInvokeResponse("device_get_identity", identity);

    const result = await deviceGetIdentity();

    expect(mockInvoke).toHaveBeenCalledWith("device_get_identity");
    expect(result.device_id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(result.secret).toHaveLength(64);
    expect(result.created_at).toBe("2026-01-01T00:00:00Z");
  });

  it("generates a new identity on first call (represented by returning a valid identity)", async () => {
    const newIdentity = makeIdentity("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    mockInvokeResponse("device_get_identity", newIdentity);

    const result = await deviceGetIdentity();

    expect(result.device_id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });

  it("propagates error when identity file is corrupt and cannot regenerate", async () => {
    mockInvokeError("device_get_identity", "Failed to load or generate device identity");

    await expect(deviceGetIdentity()).rejects.toThrow("Failed to load");
  });
});

describe("deviceResetIdentity", () => {
  beforeEach(() => {
    resetTauriMocks();
  });

  it("invokes device_reset_identity and returns new identity", async () => {
    const newIdentity = makeIdentity("11111111-2222-3333-4444-555555555555");
    mockInvokeResponse("device_reset_identity", newIdentity);

    const result = await deviceResetIdentity();

    expect(mockInvoke).toHaveBeenCalledWith("device_reset_identity");
    expect(result.device_id).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("returns a different device_id from the previous one", async () => {
    const original = makeIdentity("aaaaaaaa-0000-0000-0000-000000000000");
    const reset = makeIdentity("bbbbbbbb-1111-1111-1111-111111111111");

    mockInvokeResponse("device_get_identity", original);
    const before = await deviceGetIdentity();

    resetTauriMocks();
    mockInvokeResponse("device_reset_identity", reset);
    const after = await deviceResetIdentity();

    expect(before.device_id).not.toBe(after.device_id);
  });

  it("propagates error on filesystem failure", async () => {
    mockInvokeError("device_reset_identity", "Permission denied writing identity file");

    await expect(deviceResetIdentity()).rejects.toThrow("Permission denied");
  });
});
