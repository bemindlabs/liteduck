import { describe, it, expect } from "vitest";
import { LITEDUCK_PATH_MIME, shellQuote, quotePathsForShell } from "./shellQuote";

describe("LITEDUCK_PATH_MIME", () => {
  it("is the custom internal drag mime", () => {
    expect(LITEDUCK_PATH_MIME).toBe("application/x-liteduck-path");
  });
});

describe("shellQuote", () => {
  it("wraps a simple path in single quotes", () => {
    expect(shellQuote("/tmp/file.txt")).toBe("'/tmp/file.txt'");
  });

  it("preserves spaces inside the quotes", () => {
    expect(shellQuote("/tmp/my folder/a b.txt")).toBe("'/tmp/my folder/a b.txt'");
  });

  it("escapes embedded single quotes with the '\\'' idiom", () => {
    expect(shellQuote("/tmp/a'b")).toBe(`'/tmp/a'\\''b'`);
  });

  it("escapes multiple embedded single quotes", () => {
    expect(shellQuote("a'b'c")).toBe(`'a'\\''b'\\''c'`);
  });

  it("leaves shell metacharacters inert inside single quotes", () => {
    expect(shellQuote("/tmp/$(rm -rf x) ; y")).toBe("'/tmp/$(rm -rf x) ; y'");
  });
});

describe("quotePathsForShell", () => {
  it("returns empty string for no paths", () => {
    expect(quotePathsForShell([])).toBe("");
  });

  it("quotes a single path and appends a trailing space", () => {
    expect(quotePathsForShell(["/tmp/x"])).toBe("'/tmp/x' ");
  });

  it("space-joins multiple paths with a single trailing space", () => {
    expect(quotePathsForShell(["/a b", "/c"])).toBe("'/a b' '/c' ");
  });

  it("skips empty entries", () => {
    expect(quotePathsForShell(["", "/x", ""])).toBe("'/x' ");
  });

  it("never auto-appends a newline (does not press Enter)", () => {
    expect(quotePathsForShell(["/x"])).not.toContain("\n");
  });
});
