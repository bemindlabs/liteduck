import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

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
  it("renders an editable textarea directly (no Edit toggle)", async () => {
    const readFile = vi.fn().mockResolvedValue("const x = 1;");
    render(<FilePreview entry={makeEntry()} readFile={readFile} docsMode={false} />);

    const textarea = await screen.findByRole("textbox");
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveValue("const x = 1;");
    expect(textarea).not.toHaveAttribute("readonly");
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

    const textarea = await screen.findByRole("textbox");
    // Clean buffer → no Save button visible yet.
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: "const x = 2;" } });

    const saveBtn = await screen.findByRole("button", { name: /save/i });
    expect(saveBtn).toBeEnabled();
    expect(screen.getByRole("button", { name: /revert/i })).toBeInTheDocument();

    fireEvent.click(saveBtn);
    await waitFor(() => expect(writeFile).toHaveBeenCalledWith("/tmp/app.ts", "const x = 2;"));
  });

  it("renders a syntax-highlight overlay layer behind the editable textarea", async () => {
    const readFile = vi.fn().mockResolvedValue("const x = 1;");
    const { container } = render(
      <FilePreview entry={makeEntry()} readFile={readFile} docsMode={false} />,
    );

    const textarea = await screen.findByRole("textbox");
    // The transparent textarea sits over a colored <pre> overlay.
    const overlay = container.querySelector("pre[aria-hidden='true']");
    expect(overlay).toBeInTheDocument();
    expect(overlay?.textContent).toContain("const x = 1;");
    // Textarea text is transparent so the colored overlay shows through.
    expect(textarea.className).toContain("text-transparent");
  });

  it("keeps a truncated (>1 MB) file read-only — no textarea", async () => {
    const readFile = vi.fn().mockResolvedValue("partial buffer");
    render(
      <FilePreview entry={makeEntry({ size: 2_000_000 })} readFile={readFile} docsMode={false} />,
    );

    await screen.findByText(/1 MB limit/i);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
