import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { WritingView } from "./WritingView";

// A multi-line document — enough lines that the old fixed-height textarea
// would have clipped it. The textarea must still hold the full value.
const LONG = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join("\n");

describe("WritingView", () => {
  it("renders the full content in an editable textarea (no clipping of value)", () => {
    render(
      <WritingView
        content={LONG}
        filename="notes.md"
        onChange={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
        hasChanges={false}
      />,
    );

    const textarea = screen.getByRole("textbox");
    expect(textarea.tagName).toBe("TEXTAREA");
    // The whole file is present in the value — nothing is dropped/clipped.
    expect(textarea).toHaveValue(LONG);
    expect(textarea).not.toHaveAttribute("readonly");
  });

  it("does not select-all on mount", () => {
    render(
      <WritingView
        content={LONG}
        filename="notes.md"
        onChange={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
        hasChanges={false}
      />,
    );

    const textarea: HTMLTextAreaElement = screen.getByRole("textbox");
    // No stray full-buffer selection (which would render as a gray block).
    const selectionLength = textarea.selectionEnd - textarea.selectionStart;
    expect(selectionLength).toBe(0);
  });
});
