import { describe, it, expect, beforeEach } from "vitest";
import { fileClipboardStore } from "./fileClipboard";

describe("fileClipboardStore", () => {
  beforeEach(() => fileClipboardStore.clear());

  it("stores a copy intent", () => {
    fileClipboardStore.set("copy", ["/a/b.txt"]);
    expect(fileClipboardStore.getSnapshot()).toEqual({ op: "copy", paths: ["/a/b.txt"] });
  });

  it("stores a cut intent", () => {
    fileClipboardStore.set("cut", ["/a/b.txt", "/a/c.txt"]);
    expect(fileClipboardStore.getSnapshot()).toEqual({
      op: "cut",
      paths: ["/a/b.txt", "/a/c.txt"],
    });
  });

  it("setting an empty path list clears the clipboard", () => {
    fileClipboardStore.set("copy", ["/a/b.txt"]);
    fileClipboardStore.set("copy", []);
    expect(fileClipboardStore.getSnapshot()).toBeNull();
  });

  it("notifies subscribers on change", () => {
    let calls = 0;
    const unsub = fileClipboardStore.subscribe(() => (calls += 1));
    fileClipboardStore.set("copy", ["/a/b.txt"]);
    fileClipboardStore.clear();
    unsub();
    fileClipboardStore.set("copy", ["/x"]); // after unsub — must not count
    expect(calls).toBe(2);
  });
});
