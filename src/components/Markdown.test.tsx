import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";

import { Markdown } from "./Markdown";

// ---------------------------------------------------------------------------
// Sanitization (XSS) — raw/inline HTML is rendered, but only through a safe
// allow-list. rehypeRaw parses raw HTML into hast; rehypeSanitize then strips
// anything unsafe (event handlers, <script>, javascript: URLs, …).
// ---------------------------------------------------------------------------

describe("Markdown — HTML sanitization (XSS hard constraint)", () => {
  it("renders <img> but strips the onerror event handler", () => {
    const { container } = render(<Markdown content={`<img src="x" onerror="alert(1)">`} />);

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    // The element survives…
    expect(img).toBeInTheDocument();
    // …but the dangerous event handler is gone.
    expect(img).not.toHaveAttribute("onerror");
    expect(container.innerHTML).not.toContain("onerror");
    expect(container.innerHTML).not.toContain("alert(1)");
  });

  it("drops <script> entirely (tag and contents not executed/rendered)", () => {
    const { container } = render(<Markdown content={`before<script>alert(1)</script>after`} />);

    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("<script");
    expect(container.innerHTML).not.toContain("alert(1)");
    // Benign surrounding text is preserved.
    expect(container.textContent).toContain("before");
    expect(container.textContent).toContain("after");
  });

  it("neutralizes a javascript: href on an anchor", () => {
    const { container } = render(<Markdown content={`<a href="javascript:alert(1)">click</a>`} />);

    const anchor = container.querySelector("a");
    // The anchor (and its text) may still render, but the javascript: URL is
    // dropped — it must not survive as a navigable href.
    expect(container.innerHTML).not.toContain("javascript:");
    if (anchor) {
      expect(anchor.getAttribute("href") ?? "").not.toMatch(/javascript:/i);
    }
  });

  it("strips inline event handlers from arbitrary tags", () => {
    const { container } = render(<Markdown content={`<p onclick="alert(1)">hi</p>`} />);

    expect(container.innerHTML).not.toContain("onclick");
    expect(container.innerHTML).not.toContain("alert(1)");
    expect(container.textContent).toContain("hi");
  });

  it("strips disallowed embedding tags (iframe)", () => {
    const { container } = render(
      <Markdown content={`<iframe src="https://evil.example"></iframe>`} />,
    );

    expect(container.querySelector("iframe")).toBeNull();
    expect(container.innerHTML).not.toContain("<iframe");
  });
});

// ---------------------------------------------------------------------------
// Benign raw HTML — common README markup must render correctly.
// ---------------------------------------------------------------------------

describe("Markdown — benign raw/inline HTML renders", () => {
  it('renders <p align="center"> keeping the align attribute', () => {
    const { container } = render(<Markdown content={`<p align="center">hello</p>`} />);

    const p = container.querySelector("p[align]");
    expect(p).not.toBeNull();
    expect(p).toHaveAttribute("align", "center");
    expect(p).toHaveTextContent("hello");
  });

  it("renders a <kbd> element", () => {
    const { container } = render(<Markdown content={`Press <kbd>⌘K</kbd> to search`} />);

    const kbd = container.querySelector("kbd");
    expect(kbd).not.toBeNull();
    expect(kbd).toHaveTextContent("⌘K");
  });

  it("renders <details>/<summary>", () => {
    const { container } = render(
      <Markdown content={`<details><summary>more</summary>body text</details>`} />,
    );

    expect(container.querySelector("details")).not.toBeNull();
    expect(container.querySelector("summary")).toHaveTextContent("more");
    expect(container.textContent).toContain("body text");
  });

  it("renders a safe <img> keeping src/alt", () => {
    const { container } = render(
      <Markdown content={`<img src="https://img.example/badge.svg" alt="badge">`} />,
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "https://img.example/badge.svg");
    expect(img).toHaveAttribute("alt", "badge");
  });
});
