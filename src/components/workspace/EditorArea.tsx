/**
 * EditorArea — the main code/preview pane in the workspace shell.
 *
 * Hosts the EditorTabs row and a FilePreview instance bound to the active tab.
 * When no tabs are open it shows a friendly placeholder.
 */

import { FileText } from "lucide-react";
import { FilePreview } from "@/components/FilePreview";
import { EditorTabs, type EditorTab } from "./EditorTabs";

interface EditorAreaProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
}

export function EditorArea({ tabs, activeTabId, onSelectTab, onCloseTab }: EditorAreaProps) {
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <EditorTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={onSelectTab}
        onClose={onCloseTab}
      />

      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        {activeTab ? (
          <FilePreview entry={activeTab.entry} docsMode={false} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <FileText className="h-10 w-10 text-[var(--color-muted-foreground)] opacity-50" />
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Select a file from the Explorer to open it here.
            </p>
            <p className="text-xs text-[var(--color-muted-foreground)]/70">
              Tip: Press <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1 py-0.5 text-[10px] font-mono">⌘B</kbd> to toggle the side panel, <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1 py-0.5 text-[10px] font-mono">⌘`</kbd> for the terminal.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
