import { describe, expect, it } from "vitest";
import { parseGithubCloneUrl } from "./githubCloneUrl";

describe("parseGithubCloneUrl", () => {
  it("returns null for empty input", () => {
    expect(parseGithubCloneUrl("")).toBeNull();
    expect(parseGithubCloneUrl("   ")).toBeNull();
  });

  it("normalizes owner/repo shorthand for github.com", () => {
    expect(parseGithubCloneUrl("bemindlabs/app-liteduck")).toBe(
      "https://github.com/bemindlabs/app-liteduck.git",
    );
  });

  it("preserves git@ URLs", () => {
    expect(parseGithubCloneUrl("git@github.com:bemindlabs/app-liteduck.git")).toBe(
      "git@github.com:bemindlabs/app-liteduck.git",
    );
  });

  it("normalizes https GitHub URLs", () => {
    expect(parseGithubCloneUrl("https://github.com/bemindlabs/app-liteduck")).toBe(
      "https://github.com/bemindlabs/app-liteduck.git",
    );
    expect(parseGithubCloneUrl("https://github.com/bemindlabs/app-liteduck.git")).toBe(
      "https://github.com/bemindlabs/app-liteduck.git",
    );
  });

  it("handles host-only URLs with path", () => {
    expect(parseGithubCloneUrl("github.com/foo/bar")).toBe("https://github.com/foo/bar.git");
  });

  it("supports GitHub Enterprise style hosts", () => {
    expect(parseGithubCloneUrl("https://git.example.com/acme/widget")).toBe(
      "https://git.example.com/acme/widget.git",
    );
  });
});
