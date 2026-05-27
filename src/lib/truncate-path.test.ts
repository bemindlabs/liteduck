import { describe, it, expect } from "vitest";
import { truncatePath } from "./truncate-path";

describe("truncatePath()", () => {
  // ── Unix / POSIX paths ────────────────────────────────────────────────────

  it("returns the last two segments of a deep Unix path", () => {
    expect(truncatePath("/home/user/projects/LiteDuck/src-tauri")).toBe("LiteDuck/src-tauri");
  });

  it("returns the last two segments for a shallow two-segment path", () => {
    expect(truncatePath("/parent/child")).toBe("parent/child");
  });

  it("returns just the single segment when only one segment exists", () => {
    expect(truncatePath("/single")).toBe("single");
  });

  it("handles a trailing slash gracefully", () => {
    // filter(Boolean) removes the empty string from the trailing slash split
    expect(truncatePath("/home/user/projects/")).toBe("user/projects");
  });

  // ── Windows paths ─────────────────────────────────────────────────────────

  it("handles Windows-style backslash paths", () => {
    expect(truncatePath("C:\\Users\\user\\Projects\\MyApp")).toBe("Projects/MyApp");
  });

  it("returns last two segments from a Windows path with two components", () => {
    // "C:\\MyApp" splits on "\\" into ["C:", "MyApp"] — slice(-2) keeps both
    expect(truncatePath("C:\\MyApp")).toBe("C:/MyApp");
  });

  // ── edge cases ────────────────────────────────────────────────────────────

  it("returns the original string when it contains no separators", () => {
    expect(truncatePath("no-separators")).toBe("no-separators");
  });

  it("always joins the result with forward slash regardless of input separator", () => {
    const result = truncatePath("C:\\a\\b\\c");
    expect(result).toContain("/");
    expect(result).not.toContain("\\");
  });

  it("handles an empty string by returning it unchanged", () => {
    expect(truncatePath("")).toBe("");
  });
});
