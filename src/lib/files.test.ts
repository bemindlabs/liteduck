import { describe, it, expect, beforeEach } from "vitest";
import { mockInvoke, resetTauriMocks } from "@/test/tauri-mocks";
import {
  FILE_ICONS,
  filesCopy,
  filesCreateDir,
  filesDelete,
  filesFind,
  filesGetMetadata,
  filesListDir,
  filesMove,
  filesOpenInVscode,
  filesReadText,
  filesRename,
  filesRevealInOs,
  filesUnwatch,
  filesWatch,
  filesWriteText,
  formatBytes,
  formatModified,
  getFileIcon,
  type FileEntry,
} from "./files";

describe("files helpers", () => {
  beforeEach(() => {
    resetTauriMocks();
  });

  it("returns folder icon for directories", () => {
    expect(
      getFileIcon({
        name: "src",
        path: "/tmp/src",
        is_dir: true,
        is_file: false,
        size: 0,
        modified: "2024-01-01T00:00:00Z",
        extension: null,
      }),
    ).toBe("📁");
  });

  it("returns default icon when extension is missing or unknown", () => {
    expect(
      getFileIcon({
        name: "LICENSE",
        path: "/tmp/LICENSE",
        is_dir: false,
        is_file: true,
        size: 10,
        modified: "2024-01-01T00:00:00Z",
        extension: null,
      }),
    ).toBe("📄");

    expect(
      getFileIcon({
        name: "archive.xyz",
        path: "/tmp/archive.xyz",
        is_dir: false,
        is_file: true,
        size: 10,
        modified: "2024-01-01T00:00:00Z",
        extension: "xyz",
      }),
    ).toBe("📄");
  });

  it("looks up file icons case-insensitively", () => {
    const entry: FileEntry = {
      name: "README.MD",
      path: "/tmp/README.MD",
      is_dir: false,
      is_file: true,
      size: 128,
      modified: "2024-01-01T00:00:00Z",
      extension: "MD",
    };

    expect(getFileIcon(entry)).toBe(FILE_ICONS.md);
  });

  it("formats bytes across units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
  });

  it("formats modified dates and preserves the unknown sentinel", () => {
    expect(formatModified("unknown")).toBe("Unknown");
    expect(formatModified("2024-06-01T12:00:00Z")).toBe(
      new Date("2024-06-01T12:00:00Z").toLocaleString(),
    );
  });

  it("lists directories with nullable showHidden by default", async () => {
    const result: FileEntry[] = [];
    mockInvoke.mockResolvedValueOnce(result);

    await expect(filesListDir("/tmp/project")).resolves.toEqual(result);
    expect(mockInvoke).toHaveBeenCalledWith("files_list_dir", {
      path: "/tmp/project",
      showHidden: null,
      workspace: null,
    });
  });

  it("passes showHidden when provided", async () => {
    mockInvoke.mockResolvedValueOnce([]);

    await filesListDir("/tmp/project", true);

    expect(mockInvoke).toHaveBeenCalledWith("files_list_dir", {
      path: "/tmp/project",
      showHidden: true,
      workspace: null,
    });
  });

  it("reads text with nullable maxBytes by default", async () => {
    mockInvoke.mockResolvedValueOnce("hello");

    await expect(filesReadText("/tmp/file.txt")).resolves.toBe("hello");
    expect(mockInvoke).toHaveBeenCalledWith("files_read_text", {
      path: "/tmp/file.txt",
      maxBytes: null,
      workspace: null,
    });
  });

  it("passes an explicit maxBytes when reading text", async () => {
    mockInvoke.mockResolvedValueOnce("hello");

    await filesReadText("/tmp/file.txt", 128);

    expect(mockInvoke).toHaveBeenCalledWith("files_read_text", {
      path: "/tmp/file.txt",
      maxBytes: 128,
      workspace: null,
    });
  });

  it("writes text content", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await expect(filesWriteText("/tmp/file.txt", "content")).resolves.toBeUndefined();
    expect(mockInvoke).toHaveBeenCalledWith("files_write_text", {
      path: "/tmp/file.txt",
      content: "content",
      workspace: null,
    });
  });

  it("opens a path in VS Code", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await filesOpenInVscode("/tmp/project");

    expect(mockInvoke).toHaveBeenCalledWith("files_open_in_vscode", { path: "/tmp/project" });
  });

  it("gets metadata, renames, creates directories, and deletes paths", async () => {
    const metadata: FileEntry = {
      name: "file.txt",
      path: "/tmp/file.txt",
      is_dir: false,
      is_file: true,
      size: 42,
      modified: "2024-01-01T00:00:00Z",
      extension: "txt",
    };
    mockInvoke
      .mockResolvedValueOnce(metadata)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await expect(filesGetMetadata("/tmp/file.txt")).resolves.toEqual(metadata);
    await expect(filesRename("/tmp/old.txt", "/tmp/new.txt")).resolves.toBeUndefined();
    await expect(filesCreateDir("/tmp/new-folder")).resolves.toBeUndefined();
    await expect(filesDelete("/tmp/new-folder")).resolves.toBeUndefined();

    expect(mockInvoke).toHaveBeenNthCalledWith(1, "files_get_metadata", { path: "/tmp/file.txt" });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "files_rename", {
      oldPath: "/tmp/old.txt",
      newPath: "/tmp/new.txt",
      workspace: null,
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(3, "files_create_dir", {
      path: "/tmp/new-folder",
      workspace: null,
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(4, "files_delete", {
      path: "/tmp/new-folder",
      workspace: null,
    });
  });

  it("copies a path with nullable workspace by default", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await expect(filesCopy("/tmp/a.txt", "/tmp/b.txt")).resolves.toBeUndefined();
    expect(mockInvoke).toHaveBeenCalledWith("files_copy", {
      src: "/tmp/a.txt",
      dest: "/tmp/b.txt",
      workspace: null,
    });
  });

  it("copies a path with an explicit workspace", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await filesCopy("/ws/a.txt", "/ws/b.txt", "/ws");

    expect(mockInvoke).toHaveBeenCalledWith("files_copy", {
      src: "/ws/a.txt",
      dest: "/ws/b.txt",
      workspace: "/ws",
    });
  });

  it("moves a path with nullable workspace by default", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await expect(filesMove("/tmp/a.txt", "/tmp/sub/a.txt")).resolves.toBeUndefined();
    expect(mockInvoke).toHaveBeenCalledWith("files_move", {
      src: "/tmp/a.txt",
      dest: "/tmp/sub/a.txt",
      workspace: null,
    });
  });

  it("reveals a path in the OS file manager", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await filesRevealInOs("/tmp/project");

    expect(mockInvoke).toHaveBeenCalledWith("files_reveal_in_os", { path: "/tmp/project" });
  });

  it("finds entries with nullable limit/showHidden/workspace by default", async () => {
    const result: FileEntry[] = [];
    mockInvoke.mockResolvedValueOnce(result);

    await expect(filesFind("/tmp/project", "report")).resolves.toEqual(result);
    expect(mockInvoke).toHaveBeenCalledWith("files_find", {
      root: "/tmp/project",
      query: "report",
      limit: null,
      showHidden: null,
      workspace: null,
    });
  });

  it("finds entries with explicit limit, showHidden, and workspace", async () => {
    mockInvoke.mockResolvedValueOnce([]);

    await filesFind("/ws", "log", 50, true, "/ws");

    expect(mockInvoke).toHaveBeenCalledWith("files_find", {
      root: "/ws",
      query: "log",
      limit: 50,
      showHidden: true,
      workspace: "/ws",
    });
  });

  it("starts and stops watching a path", async () => {
    mockInvoke.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

    await expect(filesWatch("/tmp/project")).resolves.toBeUndefined();
    await expect(filesUnwatch("/tmp/project")).resolves.toBeUndefined();

    expect(mockInvoke).toHaveBeenNthCalledWith(1, "files_watch", { path: "/tmp/project" });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "files_unwatch", { path: "/tmp/project" });
  });
});
