import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { createElement } from "react";
import { detectUrls, linkifyText } from "./url-detect";

// ---------------------------------------------------------------------------
// detectUrls
// ---------------------------------------------------------------------------

describe("detectUrls()", () => {
  // ── basic protocol matching ─────────────────────────────────────────────

  it("detects a plain https URL", () => {
    const matches = detectUrls("Visit https://example.com for more info.");
    expect(matches).toHaveLength(1);
    expect(matches[0].url).toBe("https://example.com");
  });

  it("detects a plain http URL", () => {
    const matches = detectUrls("See http://example.com today.");
    expect(matches).toHaveLength(1);
    expect(matches[0].url).toBe("http://example.com");
  });

  it("detects localhost with no scheme", () => {
    const matches = detectUrls("Running at localhost:3000/api");
    expect(matches).toHaveLength(1);
    expect(matches[0].url).toContain("localhost:3000");
  });

  it("detects localhost with https scheme", () => {
    const matches = detectUrls("Open https://localhost:8080/health");
    expect(matches).toHaveLength(1);
    expect(matches[0].url).toBe("https://localhost:8080/health");
  });

  it("detects multiple URLs in the same string", () => {
    const matches = detectUrls(
      "Docs at https://docs.example.com and API at https://api.example.com/v1",
    );
    expect(matches).toHaveLength(2);
    expect(matches[0].url).toBe("https://docs.example.com");
    expect(matches[1].url).toBe("https://api.example.com/v1");
  });

  it("returns empty array when there are no URLs", () => {
    expect(detectUrls("No links here at all.")).toHaveLength(0);
    expect(detectUrls("")).toHaveLength(0);
  });

  // ── position tracking ───────────────────────────────────────────────────

  it("reports correct start and end positions", () => {
    const text = "Go to https://example.com now";
    const matches = detectUrls(text);
    expect(matches).toHaveLength(1);
    const { start, end } = matches[0];
    expect(text.slice(start, end)).toBe("https://example.com");
  });

  it("end - start equals the raw URL length in source", () => {
    const text = "Click https://foo.bar/path?q=1#anchor here";
    const matches = detectUrls(text);
    expect(matches).toHaveLength(1);
    expect(matches[0].end - matches[0].start).toBe("https://foo.bar/path?q=1#anchor".length);
  });

  // ── markdown link exclusion ─────────────────────────────────────────────

  it("does not detect a URL that is already inside a markdown link href", () => {
    const matches = detectUrls("See [example](https://example.com) for details.");
    expect(matches).toHaveLength(0);
  });

  it("does not detect a URL inside markdown image href", () => {
    const matches = detectUrls("![logo](https://cdn.example.com/logo.png)");
    expect(matches).toHaveLength(0);
  });

  it("detects bare URL but not the markdown-wrapped URL in the same text", () => {
    const text = "See [docs](https://docs.example.com) and also https://api.example.com";
    const matches = detectUrls(text);
    // Only the bare URL should be detected
    expect(matches).toHaveLength(1);
    expect(matches[0].url).toBe("https://api.example.com");
  });

  // ── URL normalisation ───────────────────────────────────────────────────

  it("prepends https:// for bare localhost matches", () => {
    const matches = detectUrls("Server at localhost:4000");
    expect(matches[0].url).toMatch(/^https?:\/\/localhost/);
  });
});

// ---------------------------------------------------------------------------
// linkifyText
// ---------------------------------------------------------------------------

describe("linkifyText()", () => {
  // ── no URLs ─────────────────────────────────────────────────────────────

  it("returns the original string unchanged when there are no URLs", () => {
    const result = linkifyText("Hello world");
    expect(result).toBe("Hello world");
  });

  it("returns an empty string unchanged", () => {
    expect(linkifyText("")).toBe("");
  });

  // ── produces anchor elements ─────────────────────────────────────────────

  it("wraps a single URL in an <a> tag", () => {
    const node = linkifyText("Visit https://example.com today");
    const { container } = render(createElement("span", null, node));
    const anchor = container.querySelector("a");
    expect(anchor).not.toBeNull();
    expect(anchor?.href).toBe("https://example.com/");
    expect(anchor?.textContent).toBe("https://example.com");
  });

  it("sets target=_blank on the anchor", () => {
    const node = linkifyText("https://example.com");
    const { container } = render(createElement("span", null, node));
    expect(container.querySelector("a")?.target).toBe("_blank");
  });

  it("sets rel=noopener noreferrer on the anchor", () => {
    const node = linkifyText("https://example.com");
    const { container } = render(createElement("span", null, node));
    expect(container.querySelector("a")?.rel).toContain("noopener");
    expect(container.querySelector("a")?.rel).toContain("noreferrer");
  });

  it("preserves the surrounding text outside the URL", () => {
    const node = linkifyText("Before https://example.com after");
    const { container } = render(createElement("span", null, node));
    expect(container.textContent).toBe("Before https://example.com after");
  });

  it("wraps multiple URLs in separate <a> tags", () => {
    const node = linkifyText(
      "See https://docs.example.com and https://api.example.com for details",
    );
    const { container } = render(createElement("span", null, node));
    const anchors = container.querySelectorAll("a");
    expect(anchors).toHaveLength(2);
    expect(anchors[0].textContent).toBe("https://docs.example.com");
    expect(anchors[1].textContent).toBe("https://api.example.com");
  });

  // ── applies the correct link class ──────────────────────────────────────

  it("applies the primary color class to the anchor", () => {
    const node = linkifyText("https://example.com");
    const { container } = render(createElement("span", null, node));
    const anchor = container.querySelector("a");
    expect(anchor?.className).toContain("text-[var(--color-primary)]");
  });

  // ── markdown link guard ──────────────────────────────────────────────────

  it("does not wrap a URL that is already inside a markdown link", () => {
    const node = linkifyText("See [the docs](https://docs.example.com) for help.");
    const { container } = render(createElement("span", null, node));
    // No <a> tag should be produced — the markdown link text is left as-is
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("linkifies a bare URL but not the one in an adjacent markdown link", () => {
    const text = "See [docs](https://docs.example.com) and also https://api.example.com";
    const node = linkifyText(text);
    const { container } = render(createElement("span", null, node));
    const anchors = container.querySelectorAll("a");
    expect(anchors).toHaveLength(1);
    expect(anchors[0].href).toContain("api.example.com");
  });

  // ── localhost ────────────────────────────────────────────────────────────

  it("linkifies localhost URLs", () => {
    const node = linkifyText("Running at localhost:3000");
    const { container } = render(createElement("span", null, node));
    const anchor = container.querySelector("a");
    expect(anchor).not.toBeNull();
    expect(anchor?.href).toContain("localhost");
  });
});
