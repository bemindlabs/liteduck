/**
 * EditorTabs — VS Code-style file tabs above the editor area.
 *
 * The shell owns the tab list and active selection. Closing the last tab returns
 * the editor to its empty state.
 */

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileEntry } from "@/lib/files";
import { getFileIcon } from "@/lib/files";

export interface EditorTab {
  /** Stable unique id — currently the file path. */
  id: string;
  entry: FileEntry;
}

interface EditorTabsProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export function EditorTabs({ tabs, activeTabId, onSelect, onClose }: EditorTabsProps) {
  if (tabs.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="Open files"
      className="flex h-9 shrink-0 items-center overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-sidebar)]"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            className={cn(
              "group flex h-full shrink-0 items-center gap-1.5 border-r border-[var(--color-border)] pl-3 pr-1 text-xs transition-colors",
              active
                ? "bg-[var(--color-background)] text-[var(--color-foreground)]"
                : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(tab.id)}
              className="flex h-full items-center gap-1.5 outline-none"
              title={tab.entry.path}
            >
              <span aria-hidden className="text-xs leading-none">
                {getFileIcon(tab.entry)}
              </span>
              <span className="max-w-[180px] truncate">{tab.entry.name}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
              aria-label={`Close ${tab.entry.name}`}
              className={cn(
                "rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100",
                active && "opacity-60 hover:opacity-100",
                "hover:bg-[var(--color-muted)]",
              )}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
