import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// Markdown pulls in react-markdown/mermaid; stub it to a plain div so the
// renderer-dispatch behavior is what we assert here, not markdown internals.
vi.mock("@/components/Markdown", () => ({
  Markdown: ({ content }: { content: string }) => <div data-testid="md">{content}</div>,
}));

import { OutputView } from "./OutputView";

describe("OutputView dispatch", () => {
  it("renders a valid table for view=table", () => {
    const raw = JSON.stringify({ columns: ["Agent", "Status"], rows: [["a", "active"]] });
    render(<OutputView view="table" raw={raw} />);
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    // No fallback banner on the happy path.
    expect(screen.queryByText(/Could not render as/)).not.toBeInTheDocument();
  });

  it("falls back to text + an error banner on malformed table output", () => {
    render(<OutputView view="table" raw="this is not json" />);
    expect(screen.getByText(/Could not render as/)).toBeInTheDocument();
    // The raw output is still shown (never blank).
    expect(screen.getByText("this is not json")).toBeInTheDocument();
  });

  it("derives a table from an array-of-objects (BWOC agents shape)", () => {
    const raw = JSON.stringify({
      agents: [{ name: "agent-prime", role: "active", raw: "● agent-prime active" }],
    });
    render(<OutputView view="table" raw={raw} />);
    expect(screen.getByText("agent-prime")).toBeInTheDocument();
    // `name` + `role` columns derived; `raw` debug echo skipped (so the glyph
    // line should NOT appear as a column header).
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("role")).toBeInTheDocument();
    expect(screen.queryByText("raw")).not.toBeInTheDocument();
  });

  it("renders raw text for view=text (and unknown views)", () => {
    render(<OutputView view={undefined} raw="hello world" />);
    expect(screen.getByText("hello world")).toBeInTheDocument();
    render(<OutputView view="bogus" raw="still text" />);
    expect(screen.getByText("still text")).toBeInTheDocument();
  });

  it("routes markdown through the sanitized Markdown component", () => {
    render(<OutputView view="markdown" raw="# Heading" />);
    expect(screen.getByTestId("md")).toHaveTextContent("# Heading");
  });
});
