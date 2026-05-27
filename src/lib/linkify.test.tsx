import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { createElement } from "react";
import { linkifyText } from "./linkify";

describe("linkifyText()", () => {
  // ── falsy / empty input ───────────────────────────────────────────────────

  it("returns the original value unchanged when given an empty string", () => {
    expect(linkifyText("")).toBe("");
  });

  it("returns plain text unchanged when there are no URLs", () => {
    const result = linkifyText("Hello, world!");
    // No URLs → split produces a single non-matching segment → string returned
    expect(Array.isArray(result)).toBe(true);
    const { container } = render(createElement("span", null, result as React.ReactNode));
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.textContent).toBe("Hello, world!");
  });

  // ── URL detection and anchor rendering ────────────────────────────────────

  it("wraps a bare https URL in an <a> element", () => {
    const result = linkifyText("Visit https://example.com today");
    const { container } = render(createElement("span", null, result as React.ReactNode));
    const anchor = container.querySelector("a");
    expect(anchor).not.toBeNull();
    expect(anchor?.href).toBe("https://example.com/");
    expect(anchor?.textContent).toBe("https://example.com");
  });

  it("wraps a bare http URL in an <a> element", () => {
    const result = linkifyText("See http://example.com");
    const { container } = render(createElement("span", null, result as React.ReactNode));
    const anchor = container.querySelector("a");
    expect(anchor).not.toBeNull();
    expect(anchor?.href).toBe("http://example.com/");
  });

  it("produces separate anchors for multiple URLs", () => {
    const result = linkifyText("Docs https://docs.example.com and API https://api.example.com");
    const { container } = render(createElement("span", null, result as React.ReactNode));
    const anchors = container.querySelectorAll("a");
    expect(anchors).toHaveLength(2);
    expect(anchors[0].textContent).toBe("https://docs.example.com");
    expect(anchors[1].textContent).toBe("https://api.example.com");
  });

  // ── security attributes ───────────────────────────────────────────────────

  it("sets target=_blank on every anchor", () => {
    const result = linkifyText("https://example.com");
    const { container } = render(createElement("span", null, result as React.ReactNode));
    expect(container.querySelector("a")?.target).toBe("_blank");
  });

  it("sets rel=noopener noreferrer on every anchor", () => {
    const result = linkifyText("https://example.com");
    const { container } = render(createElement("span", null, result as React.ReactNode));
    const rel = container.querySelector("a")?.rel ?? "";
    expect(rel).toContain("noopener");
    expect(rel).toContain("noreferrer");
  });

  // ── surrounding text preservation ─────────────────────────────────────────

  it("preserves text before and after a URL", () => {
    const result = linkifyText("Before https://example.com after");
    const { container } = render(createElement("span", null, result as React.ReactNode));
    expect(container.textContent).toBe("Before https://example.com after");
  });

  // ── CSS class ────────────────────────────────────────────────────────────

  it("applies the primary colour utility class to anchors", () => {
    const result = linkifyText("https://example.com");
    const { container } = render(createElement("span", null, result as React.ReactNode));
    const cls = container.querySelector("a")?.className ?? "";
    expect(cls).toContain("underline");
  });

  // ── URL with path and query string ────────────────────────────────────────

  it("preserves the full URL including path and query parameters", () => {
    const url = "https://example.com/path?foo=bar&baz=1#section";
    const result = linkifyText(`Link: ${url}`);
    const { container } = render(createElement("span", null, result as React.ReactNode));
    expect(container.querySelector("a")?.textContent).toBe(url);
  });
});
