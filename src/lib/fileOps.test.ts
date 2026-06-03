import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
// Keep notifications quiet but observable.
vi.mock("./notifications", () => ({ addNotification: vi.fn() }));

import * as files from "./files";
import {
  basename,
  dirname,
  joinPath,
  uniqueName,
  pasteInto,
  duplicateEntry,
  moveInto,
} from "./fileOps";

describe("path helpers", () => {
  it("basename", () => {
    expect(basename("/a/b/c.txt")).toBe("c.txt");
    expect(basename("/a/b/")).toBe("b");
    expect(basename("file.txt")).toBe("file.txt");
  });

  it("dirname", () => {
    expect(dirname("/a/b/c.txt")).toBe("/a/b");
    expect(dirname("/a/b/")).toBe("/a");
    expect(dirname("/top")).toBe("/");
  });

  it("joinPath", () => {
    expect(joinPath("/a/b", "c.txt")).toBe("/a/b/c.txt");
    expect(joinPath("/a/b/", "c.txt")).toBe("/a/b/c.txt");
  });
});

describe("uniqueName", () => {
  it("returns the name unchanged when free", () => {
    expect(uniqueName("a.txt", new Set())).toBe("a.txt");
  });

  it("inserts ' copy' before the extension on collision", () => {
    expect(uniqueName("a.txt", new Set(["a.txt"]))).toBe("a copy.txt");
  });

  it("increments the copy counter on repeated collisions", () => {
    expect(uniqueName("a.txt", new Set(["a.txt", "a copy.txt"]))).toBe("a copy 2.txt");
  });

  it("handles dotfiles (no extension)", () => {
    expect(uniqueName(".gitignore", new Set([".gitignore"]))).toBe(".gitignore copy");
  });

  it("handles names without an extension", () => {
    expect(uniqueName("Makefile", new Set(["Makefile"]))).toBe("Makefile copy");
  });
});

describe("pasteInto / duplicateEntry / moveInto", () => {
  beforeEach(() => vi.clearAllMocks());

  it("copies each clipboard path into the target dir with collision-free names", async () => {
    vi.spyOn(files, "filesListDir").mockResolvedValue([]);
    const copy = vi.spyOn(files, "filesCopy").mockResolvedValue(undefined);

    const n = await pasteInto("/dest", { op: "copy", paths: ["/src/a.txt", "/src/b.txt"] });

    expect(n).toBe(2);
    expect(copy).toHaveBeenCalledWith("/src/a.txt", "/dest/a.txt");
    expect(copy).toHaveBeenCalledWith("/src/b.txt", "/dest/b.txt");
  });

  it("moves on a cut clipboard", async () => {
    vi.spyOn(files, "filesListDir").mockResolvedValue([]);
    const move = vi.spyOn(files, "filesMove").mockResolvedValue(undefined);

    await pasteInto("/dest", { op: "cut", paths: ["/src/a.txt"] });
    expect(move).toHaveBeenCalledWith("/src/a.txt", "/dest/a.txt");
  });

  it("avoids overwriting an existing destination name", async () => {
    vi.spyOn(files, "filesListDir").mockResolvedValue([
      {
        name: "a.txt",
        path: "/dest/a.txt",
        is_dir: false,
        is_file: true,
        size: 1,
        modified: "",
        extension: "txt",
      },
    ]);
    const copy = vi.spyOn(files, "filesCopy").mockResolvedValue(undefined);

    await pasteInto("/dest", { op: "copy", paths: ["/src/a.txt"] });
    expect(copy).toHaveBeenCalledWith("/src/a.txt", "/dest/a copy.txt");
  });

  it("duplicates an entry next to itself", async () => {
    vi.spyOn(files, "filesListDir").mockResolvedValue([
      {
        name: "a.txt",
        path: "/d/a.txt",
        is_dir: false,
        is_file: true,
        size: 1,
        modified: "",
        extension: "txt",
      },
    ]);
    const copy = vi.spyOn(files, "filesCopy").mockResolvedValue(undefined);

    await duplicateEntry("/d/a.txt");
    expect(copy).toHaveBeenCalledWith("/d/a.txt", "/d/a copy.txt");
  });

  it("moveInto is a no-op when dropped onto its own parent", async () => {
    const move = vi.spyOn(files, "filesMove").mockResolvedValue(undefined);
    await moveInto("/d/a.txt", "/d");
    expect(move).not.toHaveBeenCalled();
  });

  it("moveInto relocates into a different dir", async () => {
    vi.spyOn(files, "filesListDir").mockResolvedValue([]);
    const move = vi.spyOn(files, "filesMove").mockResolvedValue(undefined);
    await moveInto("/d/a.txt", "/other");
    expect(move).toHaveBeenCalledWith("/d/a.txt", "/other/a.txt");
  });
});
