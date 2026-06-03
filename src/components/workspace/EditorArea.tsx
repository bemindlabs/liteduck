/**
 * EditorArea — the main code/preview pane in the workspace shell.
 *
 * Hosts the EditorTabs row and a FilePreview instance bound to the active tab.
 * When no tabs are open it shows a friendly placeholder.
 */

import { useCallback, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { FilePreview } from "@/components/FilePreview";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { EditorTabs, type EditorTab } from "./EditorTabs";

interface EditorAreaProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
}

interface EditorMenuState {
  x: number;
  y: number;
  hasSelection: boolean;
}

export function EditorArea({ tabs, activeTabId, onSelectTab, onCloseTab }: EditorAreaProps) {
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const contentRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<EditorMenuState | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // Inside an editable field — the markdown/code CodeMirror editor (a
      // contenteditable `.cm-content`), a textarea, or an input — the global
      // suppression hook lets the native editing menu (cut/copy/paste/find)
      // through, so don't override it with our read-only menu.
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") return;
      if (target.isContentEditable || target.closest(".cm-editor")) return;
      if (!activeTab) return;
      e.preventDefault();
      const sel = window.getSelection();
      setMenu({
        x: e.clientX,
        y: e.clientY,
        hasSelection: !!sel && sel.toString().length > 0,
      });
    },
    [activeTab],
  );

  const handleCopy = useCallback(async () => {
    const text = window.getSelection()?.toString() ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard unavailable — silent */
    }
  }, []);

  const handleSelectAll = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  // FilePreview is directly editable for text files (VS Code-style); native
  // textarea editing (incl. Paste/Cut) works via keyboard, so this custom menu
  // intentionally omits Paste/Cut and stays honest about what it offers.
  const menuItems: ContextMenuItem[] = menu
    ? [
        { label: "Copy", onSelect: handleCopy, disabled: !menu.hasSelection },
        { label: "Select All", onSelect: handleSelectAll },
        {
          label: "Close Tab",
          onSelect: () => {
            if (activeTabId) onCloseTab(activeTabId);
          },
          show: !!activeTabId,
          separatorBefore: true,
        },
      ]
    : [];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <EditorTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={onSelectTab}
        onClose={onCloseTab}
      />

      <div
        ref={contentRef}
        onContextMenu={handleContextMenu}
        className="flex flex-1 min-h-0 flex-col overflow-hidden"
      >
        {activeTab ? (
          <FilePreview entry={activeTab.entry} docsMode={false} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <FileText className="h-10 w-10 text-[var(--color-muted-foreground)] opacity-50" />
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Select a file from the Explorer to open it here.
            </p>
            <p className="text-xs text-[var(--color-muted-foreground)]/70">
              Tip: Press{" "}
              <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1 py-0.5 text-[10px] font-mono">
                ⌘B
              </kbd>{" "}
              to toggle the side panel,{" "}
              <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1 py-0.5 text-[10px] font-mono">
                ⌘`
              </kbd>{" "}
              for the terminal.
            </p>
          </div>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
          ariaLabel="Editor actions"
        />
      )}
    </div>
  );
}
