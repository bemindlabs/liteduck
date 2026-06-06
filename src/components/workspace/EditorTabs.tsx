/**
 * EditorTabs — VS Code-style file tabs above the editor area.
 *
 * The shell owns the tab list, active selection, and all tab operations; this
 * component renders them and surfaces per-tab actions (close, pin, reorder via
 * pointer-drag, right-click menu). Pinned tabs are kept to the left by the shell
 * and show a pin affordance instead of the close button.
 */

import { useRef, useState } from "react";
import { Pin, PinOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileEntry } from "@/lib/files";
import { filesRevealInOs, getFileIcon } from "@/lib/files";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { useDragSource, useDropZone } from "@/lib/internalDrag";

export interface EditorTab {
  /** Stable unique id — currently the file path. */
  id: string;
  entry: FileEntry;
  /** Pinned tabs sort to the left and survive Close All / Close Others. */
  pinned: boolean;
}

export interface EditorTabActions {
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCloseOthers: (id: string) => void;
  onCloseAll: () => void;
  onCloseToRight: (id: string) => void;
  onTogglePin: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
}

interface EditorTabsProps extends EditorTabActions {
  tabs: EditorTab[];
  activeTabId: string | null;
}

interface TabMenuState {
  x: number;
  y: number;
  tab: EditorTab;
}

export function EditorTabs({ tabs, activeTabId, ...actions }: EditorTabsProps) {
  const [menu, setMenu] = useState<TabMenuState | null>(null);

  if (tabs.length === 0) return null;

  // The target tab knows whether it's the last one and whether anything sits to
  // its right, so menu items can be disabled accordingly.
  const menuItems: ContextMenuItem[] = menu
    ? (() => {
        const idx = tabs.findIndex((t) => t.id === menu.tab.id);
        const hasOthers = tabs.length > 1;
        const hasRight = tabs.slice(idx + 1).some((t) => !t.pinned);
        return [
          { label: "Close", onSelect: () => actions.onClose(menu.tab.id) },
          { label: "Close Others", onSelect: () => actions.onCloseOthers(menu.tab.id), disabled: !hasOthers },
          { label: "Close to the Right", onSelect: () => actions.onCloseToRight(menu.tab.id), disabled: !hasRight },
          { label: "Close All", onSelect: () => actions.onCloseAll(), disabled: !hasOthers },
          {
            label: menu.tab.pinned ? "Unpin" : "Pin",
            onSelect: () => actions.onTogglePin(menu.tab.id),
            separatorBefore: true,
          },
          {
            label: "Copy Path",
            onSelect: () =>
              void navigator.clipboard.writeText(menu.tab.entry.path).catch(() => undefined),
            separatorBefore: true,
          },
          {
            label: "Reveal in Finder",
            onSelect: () => void filesRevealInOs(menu.tab.entry.path).catch(() => undefined),
          },
        ];
      })()
    : [];

  return (
    <div
      role="tablist"
      aria-label="Open files"
      className="flex h-9 shrink-0 items-center overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-sidebar)]"
    >
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          active={tab.id === activeTabId}
          actions={actions}
          onContextMenu={(x, y) => setMenu({ x, y, tab })}
        />
      ))}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
          ariaLabel="Tab actions"
        />
      )}
    </div>
  );
}

function TabItem({
  tab,
  active,
  actions,
  onContextMenu,
}: {
  tab: EditorTab;
  active: boolean;
  actions: EditorTabActions;
  onContextMenu: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const { onMouseDown } = useDragSource(() => ({
    kind: "tab",
    paths: [tab.id],
    label: tab.entry.name,
  }));

  const isOver = useDropZone(
    ref,
    (paths) => {
      if (paths[0] && paths[0] !== tab.id) actions.onReorder(paths[0], tab.id);
    },
    { accept: "tab", canDrop: (paths) => paths[0] !== tab.id },
  );

  return (
    <div
      ref={ref}
      role="tab"
      aria-selected={active}
      onMouseDown={onMouseDown}
      onAuxClick={(e) => {
        // Middle-click closes the tab (VS Code parity).
        if (e.button === 1) {
          e.preventDefault();
          actions.onClose(tab.id);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY);
      }}
      className={cn(
        "group flex h-full shrink-0 items-center gap-1.5 border-r border-[var(--color-border)] pl-3 pr-1 text-xs transition-colors",
        active
          ? "bg-[var(--color-background)] text-[var(--color-foreground)]"
          : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]",
        isOver && "border-l-2 border-l-[var(--color-primary)]",
      )}
    >
      <button
        type="button"
        onClick={() => actions.onSelect(tab.id)}
        className="flex h-full items-center gap-1.5 outline-none"
        title={tab.entry.path}
      >
        {tab.pinned && <Pin className="h-3 w-3 shrink-0 opacity-70" aria-label="Pinned" />}
        <span aria-hidden className="text-xs leading-none">
          {getFileIcon(tab.entry)}
        </span>
        <span className="max-w-[180px] truncate">{tab.entry.name}</span>
      </button>
      {tab.pinned ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            actions.onTogglePin(tab.id);
          }}
          aria-label={`Unpin ${tab.entry.name}`}
          className={cn(
            "rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--color-muted)]",
            active && "opacity-60 hover:opacity-100",
          )}
        >
          <PinOff className="h-3 w-3" />
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            actions.onClose(tab.id);
          }}
          aria-label={`Close ${tab.entry.name}`}
          className={cn(
            "rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--color-muted)]",
            active && "opacity-60 hover:opacity-100",
          )}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
