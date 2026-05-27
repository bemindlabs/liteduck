import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFieldValidation } from "./useFieldValidation";

describe("useFieldValidation", () => {
  // -------------------------------------------------------------------------
  // validateField
  // -------------------------------------------------------------------------

  it("returns true and stores no error for a valid value", () => {
    const { result } = renderHook(() => useFieldValidation());

    let valid: boolean;
    act(() => {
      valid = result.current.validateField("integrations.jira.base_url", "https://example.com");
    });

    expect(valid!).toBe(true);
    expect(result.current.getError("integrations.jira.base_url")).toBeNull();
  });

  it("returns false and stores an error for an invalid value", () => {
    const { result } = renderHook(() => useFieldValidation());

    let valid: boolean;
    act(() => {
      valid = result.current.validateField("integrations.jira.base_url", "not-a-url");
    });

    expect(valid!).toBe(false);
    expect(result.current.getError("integrations.jira.base_url")).not.toBeNull();
  });

  it("clears a previous error when the field becomes valid", () => {
    const { result } = renderHook(() => useFieldValidation());

    // First call sets an error
    act(() => {
      result.current.validateField("integrations.jira.base_url", "not-a-url");
    });
    expect(result.current.getError("integrations.jira.base_url")).not.toBeNull();

    // Second call with valid value clears the error
    act(() => {
      result.current.validateField("integrations.jira.base_url", "https://example.com");
    });
    expect(result.current.getError("integrations.jira.base_url")).toBeNull();
  });

  it("returns true for unregistered keys (no validator = always valid)", () => {
    const { result } = renderHook(() => useFieldValidation());

    let valid: boolean;
    act(() => {
      valid = result.current.validateField("some_unknown_key", "anything");
    });

    expect(valid!).toBe(true);
    expect(result.current.getError("some_unknown_key")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // clearError
  // -------------------------------------------------------------------------

  it("clearError removes an existing error", () => {
    const { result } = renderHook(() => useFieldValidation());

    act(() => {
      result.current.validateField("terminal.shell", ""); // isRequired — fails
    });
    expect(result.current.getError("terminal.shell")).not.toBeNull();

    act(() => {
      result.current.clearError("terminal.shell");
    });
    expect(result.current.getError("terminal.shell")).toBeNull();
  });

  it("clearError is a no-op for fields that have no error", () => {
    const { result } = renderHook(() => useFieldValidation());

    // Should not throw
    act(() => {
      result.current.clearError("nonexistent_key");
    });

    expect(result.current.getError("nonexistent_key")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // hasErrors
  // -------------------------------------------------------------------------

  it("hasErrors is false when no fields have been validated", () => {
    const { result } = renderHook(() => useFieldValidation());
    expect(result.current.hasErrors).toBe(false);
  });

  it("hasErrors is true when at least one field has an error", () => {
    const { result } = renderHook(() => useFieldValidation());

    act(() => {
      result.current.validateField("terminal.shell", ""); // fails isRequired
    });

    expect(result.current.hasErrors).toBe(true);
  });

  it("hasErrors is false when all validated fields are valid", () => {
    const { result } = renderHook(() => useFieldValidation());

    act(() => {
      result.current.validateField("terminal.shell", "/bin/zsh");
      result.current.validateField("integrations.jira.base_url", "https://gateway.example.com");
    });

    expect(result.current.hasErrors).toBe(false);
  });

  it("hasErrors reflects correction: becomes false after fixing the invalid field", () => {
    const { result } = renderHook(() => useFieldValidation());

    act(() => {
      result.current.validateField("terminal.shell", ""); // invalid
    });
    expect(result.current.hasErrors).toBe(true);

    act(() => {
      result.current.validateField("terminal.shell", "/bin/zsh"); // valid
    });
    expect(result.current.hasErrors).toBe(false);
  });

  // -------------------------------------------------------------------------
  // getError
  // -------------------------------------------------------------------------

  it("getError returns null for a key that has never been validated", () => {
    const { result } = renderHook(() => useFieldValidation());
    expect(result.current.getError("never_touched")).toBeNull();
  });
});
