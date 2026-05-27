import { describe, expect, it } from "vitest";
import {
  isFontSize,
  isPort,
  isPositiveNumber,
  isRequired,
  isValidUrl,
  validate,
} from "./settings-validators";

// ---------------------------------------------------------------------------
// isRequired
// ---------------------------------------------------------------------------

describe("isRequired", () => {
  it("returns null for non-empty string", () => {
    expect(isRequired("hello")).toBeNull();
    expect(isRequired("  x  ")).toBeNull();
  });

  it("returns an error for empty string", () => {
    expect(isRequired("")).not.toBeNull();
  });

  it("returns an error for whitespace-only string", () => {
    expect(isRequired("   ")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isValidUrl
// ---------------------------------------------------------------------------

describe("isValidUrl", () => {
  it("returns null for empty (optional field)", () => {
    expect(isValidUrl("")).toBeNull();
    expect(isValidUrl("   ")).toBeNull();
  });

  it("accepts http URLs", () => {
    expect(isValidUrl("http://example.com")).toBeNull();
  });

  it("accepts https URLs", () => {
    expect(isValidUrl("https://example.com/path?q=1")).toBeNull();
  });

  it("rejects plain strings", () => {
    expect(isValidUrl("not a url")).not.toBeNull();
  });

  it("rejects ftp:// URLs (must be http/https)", () => {
    expect(isValidUrl("ftp://example.com")).not.toBeNull();
  });

  it("rejects incomplete URLs", () => {
    expect(isValidUrl("example.com")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isPositiveNumber
// ---------------------------------------------------------------------------

describe("isPositiveNumber", () => {
  it("returns null for empty (optional field)", () => {
    expect(isPositiveNumber("")).toBeNull();
  });

  it("accepts positive integers", () => {
    expect(isPositiveNumber("5")).toBeNull();
    expect(isPositiveNumber("1")).toBeNull();
  });

  it("accepts positive decimals", () => {
    expect(isPositiveNumber("0.5")).toBeNull();
  });

  it("rejects zero", () => {
    expect(isPositiveNumber("0")).not.toBeNull();
  });

  it("rejects negative numbers", () => {
    expect(isPositiveNumber("-1")).not.toBeNull();
  });

  it("rejects non-numeric strings", () => {
    expect(isPositiveNumber("abc")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isPort
// ---------------------------------------------------------------------------

describe("isPort", () => {
  it("returns null for empty (optional field)", () => {
    expect(isPort("")).toBeNull();
  });

  it("accepts valid port 8080", () => {
    expect(isPort("8080")).toBeNull();
  });

  it("accepts boundary values 1 and 65535", () => {
    expect(isPort("1")).toBeNull();
    expect(isPort("65535")).toBeNull();
  });

  it("rejects out-of-range port 99999", () => {
    expect(isPort("99999")).not.toBeNull();
  });

  it("rejects port 0", () => {
    expect(isPort("0")).not.toBeNull();
  });

  it("rejects non-numeric strings", () => {
    expect(isPort("abc")).not.toBeNull();
  });

  it("rejects decimal ports", () => {
    expect(isPort("80.5")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isFontSize
// ---------------------------------------------------------------------------

describe("isFontSize", () => {
  it("accepts 10 and 24 (boundaries)", () => {
    expect(isFontSize("10")).toBeNull();
    expect(isFontSize("24")).toBeNull();
  });

  it("accepts values in range", () => {
    expect(isFontSize("14")).toBeNull();
  });

  it("rejects values below 10", () => {
    expect(isFontSize("9")).not.toBeNull();
  });

  it("rejects values above 24", () => {
    expect(isFontSize("25")).not.toBeNull();
  });

  it("returns null for empty string", () => {
    expect(isFontSize("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validate (registry dispatch)
// ---------------------------------------------------------------------------

describe("validate", () => {
  it("returns null for an unregistered key regardless of value", () => {
    expect(validate("unknown_setting_key", "anything")).toBeNull();
    expect(validate("unknown_setting_key", "")).toBeNull();
  });

  it("dispatches to the correct validator for registered keys", () => {
    // appearance.font_size → isFontSize
    expect(validate("appearance.font_size", "9")).not.toBeNull();
    expect(validate("appearance.font_size", "14")).toBeNull();

    // terminal.shell → isRequired
    expect(validate("terminal.shell", "")).not.toBeNull();
    expect(validate("terminal.shell", "/bin/zsh")).toBeNull();

    // integrations.jira.base_url → isValidUrl
    expect(validate("integrations.jira.base_url", "not-a-url")).not.toBeNull();
    expect(validate("integrations.jira.base_url", "https://jira.example.com")).toBeNull();
  });

  it("handles legacy flat keys", () => {
    expect(validate("jira_base_url", "not-a-url")).not.toBeNull();
    expect(validate("jira_base_url", "https://jira.example.com")).toBeNull();
  });
});
