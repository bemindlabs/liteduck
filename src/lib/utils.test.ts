import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn()", () => {
  it("returns an empty string when called with no arguments", () => {
    expect(cn()).toBe("");
  });

  it("returns a single class unchanged", () => {
    expect(cn("foo")).toBe("foo");
  });

  it("joins multiple class strings with a space", () => {
    expect(cn("foo", "bar", "baz")).toBe("foo bar baz");
  });

  it("filters out falsy values", () => {
    expect(cn("foo", false, null, undefined, "", "bar")).toBe("foo bar");
  });

  it("handles conditional class objects from clsx", () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe("foo baz");
  });

  it("merges conflicting Tailwind classes — last one wins", () => {
    // tailwind-merge resolves conflicts, e.g. two padding utilities
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("merges conflicting Tailwind classes with conditional objects", () => {
    expect(cn("text-sm", { "text-lg": true })).toBe("text-lg");
  });

  it("handles an array of classes", () => {
    // clsx supports arrays natively; cn should pass them through
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });

  it("removes duplicate non-conflicting classes", () => {
    // tailwind-merge deduplicates identical utilities
    expect(cn("flex", "flex")).toBe("flex");
  });

  it("preserves non-Tailwind classes untouched", () => {
    expect(cn("my-custom-class", "another-class")).toBe("my-custom-class another-class");
  });
});
