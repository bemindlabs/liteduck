/**
 * fileClipboard — a tiny app-wide clipboard for file operations (cut / copy / paste).
 *
 * The OS clipboard can't carry "a file to move/copy within the workspace" in a way the
 * tree can act on, so we keep our own intent store. `copy` then `paste` duplicates an
 * entry into a target directory; `cut` then `paste` moves it. The store is
 * `useSyncExternalStore`-compatible so menu items can reactively enable/disable Paste.
 */

import { useSyncExternalStore } from "react";

export type ClipboardOp = "copy" | "cut";

export interface FileClipboard {
  op: ClipboardOp;
  /** Absolute source paths. */
  paths: string[];
}

type Listener = () => void;

class FileClipboardStore {
  private clipboard: FileClipboard | null = null;
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): FileClipboard | null => this.clipboard;

  private notify() {
    this.listeners.forEach((l) => l());
  }

  set(op: ClipboardOp, paths: string[]): void {
    this.clipboard = paths.length > 0 ? { op, paths } : null;
    this.notify();
  }

  clear(): void {
    if (this.clipboard === null) return;
    this.clipboard = null;
    this.notify();
  }
}

export const fileClipboardStore = new FileClipboardStore();

/** React hook returning the current clipboard contents (or null). */
export function useFileClipboard(): FileClipboard | null {
  return useSyncExternalStore(fileClipboardStore.subscribe, fileClipboardStore.getSnapshot);
}
