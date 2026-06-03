import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

// CodeMirror needs real layout/range APIs jsdom lacks, so we stub the CodeEditor
// with a controlled <textarea> that honors the same value/onChange/readOnly/onSave
// contract. This keeps FilePreview's own logic (save, dirty-state, mode toggles,
// truncation) under deterministic test while the editor internals are covered by
// CodeEditor's own suite.
vi.mock("@/components/editor/CodeEditor", () => ({
  // React 19 accepts `ref` as a plain prop, so the stub needs no forwardRef.
  // The imperative handle isn't exercised here (FilePreview's openSearch call is
  // null-safe), so we just reflect the value/onChange/readOnly contract.
  CodeEditor: (props: {
    value: string;
    onChange: (v: string) => void;
    readOnly?: boolean;
    onSave?: () => void;
  }) => (
    <textarea
      value={props.value}
      readOnly={props.readOnly}
      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => props.onChange(e.target.value)}
    />
  ),
}));

import { FilePreview } from "./FilePreview";
import type { FileEntry } from "@/lib/files";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    name: "app.ts",
    path: "/tmp/app.ts",
    is_dir: false,
    is_file: true,
    size: 42,
    modified: "2026-05-28T00:00:00Z",
    extension: "ts",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FilePreview — code editor (non-markdown)", () => {
  it("renders an editable editor directly (no Edit/Preview toggle)", async () => {
    const readFile = vi.fn().mockResolvedValue("const x = 1;");
    render(<FilePreview entry={makeEntry()} readFile={readFile} docsMode={false} />);

    const editor = await screen.findByRole("textbox");
    expect(editor).toHaveValue("const x = 1;");
    expect(editor).not.toHaveAttribute("readonly");
    // No Edit/Preview mode toggle for code files.
    expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^preview$/i })).not.toBeInTheDocument();
  });

  it("enables Save once the buffer is dirty and writes on click", async () => {
    const readFile = vi.fn().mockResolvedValue("const x = 1;");
    const writeFile = vi.fn().mockResolvedValue(undefined);
    render(
      <FilePreview
        entry={makeEntry()}
        readFile={readFile}
        writeFile={writeFile}
        docsMode={false}
      />,
    );

    const editor = await screen.findByRole("textbox");
    // Clean buffer → no Save button visible yet.
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();

    fireEvent.change(editor, { target: { value: "const x = 2;" } });

    const saveBtn = await screen.findByRole("button", { name: /save/i });
    expect(saveBtn).toBeEnabled();
    expect(screen.getByRole("button", { name: /revert/i })).toBeInTheDocument();

    fireEvent.click(saveBtn);
    await waitFor(() => expect(writeFile).toHaveBeenCalledWith("/tmp/app.ts", "const x = 2;"));
  });

  it("exposes a Find control while editing", async () => {
    const readFile = vi.fn().mockResolvedValue("const x = 1;");
    render(<FilePreview entry={makeEntry()} readFile={readFile} docsMode={false} />);

    await screen.findByRole("textbox");
    expect(screen.getByRole("button", { name: /find/i })).toBeInTheDocument();
  });

  it("keeps a truncated (>1 MB) file read-only", async () => {
    const readFile = vi.fn().mockResolvedValue("partial buffer");
    render(
      <FilePreview entry={makeEntry({ size: 2_000_000 })} readFile={readFile} docsMode={false} />,
    );

    await screen.findByText(/1 MB limit/i);
    const editor = await screen.findByRole("textbox");
    expect(editor).toHaveAttribute("readonly");
    // No Save offered for a partial buffer.
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });
});

describe("FilePreview — markdown", () => {
  it("shows Edit/Split/Preview mode toggles for markdown files", async () => {
    const readFile = vi.fn().mockResolvedValue("# Title");
    render(
      <FilePreview
        entry={makeEntry({ name: "README.md", path: "/tmp/README.md", extension: "md" })}
        readFile={readFile}
        docsMode={false}
      />,
    );

    expect(await screen.findByRole("button", { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^split$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^preview$/i })).toBeInTheDocument();
  });
});
