import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

import DiffViewer from "./DiffViewer";
import type { GitDiffResult, GitDiffFile, GitDiffHunk } from "@/lib/git";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeFile(overrides: Partial<GitDiffFile> = {}): GitDiffFile {
  return {
    path: "src/app.ts",
    status: "modified",
    old_path: null,
    ...overrides,
  };
}

function makeHunk(lines: { content: string; origin: "+" | "-" | " " }[]): GitDiffHunk {
  return {
    header: "@@ -1,3 +1,4 @@",
    old_start: 1,
    old_lines: 3,
    new_start: 1,
    new_lines: 4,
    lines: lines.map((l, i) => ({
      content: l.content,
      origin: l.origin,
      old_lineno: l.origin !== "+" ? i + 1 : null,
      new_lineno: l.origin !== "-" ? i + 1 : null,
    })),
  };
}

function makeDiff(
  files: GitDiffFile[],
  hunksByPath: Record<string, GitDiffHunk[]> = {},
): GitDiffResult {
  return { files, hunks: hunksByPath };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DiffViewer", () => {
  it("shows empty state when the diff has no files", () => {
    render(<DiffViewer diff={makeDiff([])} />);
    expect(screen.getByText(/no changes to display/i)).toBeInTheDocument();
  });

  it("shows empty state when filterPath matches no file", () => {
    const file = makeFile({ path: "src/app.ts" });
    render(<DiffViewer diff={makeDiff([file])} filterPath="src/other.ts" />);
    expect(screen.getByText(/no changes to display/i)).toBeInTheDocument();
  });

  it("renders a file entry for each file in the diff", () => {
    const files = [makeFile({ path: "src/a.ts" }), makeFile({ path: "src/b.ts" })];
    render(<DiffViewer diff={makeDiff(files)} />);
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
    expect(screen.getByText("src/b.ts")).toBeInTheDocument();
  });

  it("shows only the filtered file when filterPath is set", () => {
    const files = [makeFile({ path: "src/a.ts" }), makeFile({ path: "src/b.ts" })];
    render(<DiffViewer diff={makeDiff(files)} filterPath="src/a.ts" />);
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
    expect(screen.queryByText("src/b.ts")).not.toBeInTheDocument();
  });

  it("renders the status badge 'M' for a modified file", () => {
    const file = makeFile({ path: "src/app.ts", status: "modified" });
    render(<DiffViewer diff={makeDiff([file])} />);
    expect(screen.getByText("M")).toBeInTheDocument();
  });

  it("renders the status badge 'A' for an added file", () => {
    const file = makeFile({ path: "src/new.ts", status: "added" });
    render(<DiffViewer diff={makeDiff([file])} />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("renders the status badge 'D' for a deleted file", () => {
    const file = makeFile({ path: "src/old.ts", status: "deleted" });
    render(<DiffViewer diff={makeDiff([file])} />);
    expect(screen.getByText("D")).toBeInTheDocument();
  });

  it("first file section is open by default", () => {
    const file = makeFile({ path: "src/app.ts" });
    const hunk = makeHunk([
      { content: " unchanged", origin: " " },
      { content: "+added line", origin: "+" },
    ]);
    render(<DiffViewer diff={makeDiff([file], { "src/app.ts": [hunk] })} />);
    // Hunk header is only visible when the section is open
    expect(screen.getByText("@@ -1,3 +1,4 @@")).toBeInTheDocument();
  });

  it("toggles the file section closed when header is clicked", () => {
    const file = makeFile({ path: "src/app.ts" });
    const hunk = makeHunk([{ content: "+new line", origin: "+" }]);
    render(<DiffViewer diff={makeDiff([file], { "src/app.ts": [hunk] })} />);

    // Click the file header button to collapse
    fireEvent.click(screen.getByText("src/app.ts").closest("button")!);

    // Hunk header should be hidden after collapse
    expect(screen.queryByText("@@ -1,3 +1,4 @@")).not.toBeInTheDocument();
  });

  it("displays the hunk header content", () => {
    const file = makeFile({ path: "src/app.ts" });
    const hunk = makeHunk([{ content: " context", origin: " " }]);
    render(<DiffViewer diff={makeDiff([file], { "src/app.ts": [hunk] })} />);
    expect(screen.getByText("@@ -1,3 +1,4 @@")).toBeInTheDocument();
  });

  it("displays added line content", () => {
    const file = makeFile({ path: "src/app.ts" });
    const hunk = makeHunk([{ content: "const x = 1;", origin: "+" }]);
    render(<DiffViewer diff={makeDiff([file], { "src/app.ts": [hunk] })} />);
    expect(screen.getByText("const x = 1;")).toBeInTheDocument();
  });

  it("displays deleted line content", () => {
    const file = makeFile({ path: "src/app.ts" });
    const hunk = makeHunk([{ content: "const x = 0;", origin: "-" }]);
    render(<DiffViewer diff={makeDiff([file], { "src/app.ts": [hunk] })} />);
    expect(screen.getByText("const x = 0;")).toBeInTheDocument();
  });

  it("shows +N / -N line stat summary in file header", () => {
    const file = makeFile({ path: "src/app.ts" });
    const hunk = makeHunk([
      { content: "added", origin: "+" },
      { content: "added2", origin: "+" },
      { content: "removed", origin: "-" },
    ]);
    render(<DiffViewer diff={makeDiff([file], { "src/app.ts": [hunk] })} />);
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByText("-1")).toBeInTheDocument();
  });

  it("shows 'New file' message for added file with no hunks", () => {
    const file = makeFile({ path: "src/brand-new.ts", status: "added" });
    render(<DiffViewer diff={makeDiff([file], {})} />);
    expect(screen.getByText("New file")).toBeInTheDocument();
  });

  it("shows 'File deleted' message for deleted file with no hunks", () => {
    const file = makeFile({ path: "src/gone.ts", status: "deleted" });
    render(<DiffViewer diff={makeDiff([file], {})} />);
    expect(screen.getByText("File deleted")).toBeInTheDocument();
  });

  it("shows renamed path as 'old → new' format", () => {
    const file = makeFile({
      path: "src/renamed.ts",
      status: "renamed",
      old_path: "src/original.ts",
    });
    render(<DiffViewer diff={makeDiff([file], {})} />);
    expect(screen.getByText("src/original.ts → src/renamed.ts")).toBeInTheDocument();
  });
});
