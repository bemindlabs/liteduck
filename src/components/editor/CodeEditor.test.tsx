import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { createRef } from "react";
import { CodeEditor, type CodeEditorHandle } from "./CodeEditor";

// CodeMirror mounts a contenteditable `.cm-editor`. jsdom lacks layout, so we keep
// these to mount-and-reflect smoke checks; behavioral keymaps are exercised in e2e.

describe("CodeEditor", () => {
  it("mounts a CodeMirror editor showing the initial value", async () => {
    const { container } = render(<CodeEditor value="hello world" onChange={() => {}} />);
    await waitFor(() => {
      expect(container.querySelector(".cm-editor")).toBeInTheDocument();
    });
    expect(container.querySelector(".cm-content")?.textContent).toContain("hello world");
  });

  it("exposes an imperative handle with editing primitives", async () => {
    const ref = createRef<CodeEditorHandle>();
    render(<CodeEditor ref={ref} value="" onChange={() => {}} />);
    await waitFor(() => expect(ref.current).not.toBeNull());
    expect(typeof ref.current?.wrapSelection).toBe("function");
    expect(typeof ref.current?.prefixLines).toBe("function");
    expect(typeof ref.current?.insertText).toBe("function");
    expect(typeof ref.current?.openSearch).toBe("function");
    expect(typeof ref.current?.focus).toBe("function");
  });

  it("reflects external value changes into the document", async () => {
    const { container, rerender } = render(<CodeEditor value="first" onChange={() => {}} />);
    await waitFor(() =>
      expect(container.querySelector(".cm-content")?.textContent).toContain("first"),
    );
    rerender(<CodeEditor value="second" onChange={() => {}} />);
    await waitFor(() =>
      expect(container.querySelector(".cm-content")?.textContent).toContain("second"),
    );
  });

  it("calls onChange when the user types", async () => {
    const onChange = vi.fn();
    const ref = createRef<CodeEditorHandle>();
    render(<CodeEditor ref={ref} value="" onChange={onChange} />);
    await waitFor(() => expect(ref.current).not.toBeNull());
    ref.current?.insertText("typed");
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("typed"));
  });
});
