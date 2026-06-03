import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  Table,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CodeEditorHandle } from "@/components/editor/CodeEditor";

interface MdToolbarProps {
  /** Imperative handle to the markdown CodeEditor instance. */
  editor: React.RefObject<CodeEditorHandle | null>;
}

interface FmtAction {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  run: (ed: CodeEditorHandle) => void;
}

const MD_ACTIONS: FmtAction[] = [
  { icon: Bold, label: "Bold", run: (ed) => ed.wrapSelection("**", "**") },
  { icon: Italic, label: "Italic", run: (ed) => ed.wrapSelection("*", "*") },
  { icon: Heading1, label: "Heading 1", run: (ed) => ed.prefixLines("# ") },
  { icon: Heading2, label: "Heading 2", run: (ed) => ed.prefixLines("## ") },
  { icon: Heading3, label: "Heading 3", run: (ed) => ed.prefixLines("### ") },
  { icon: Link, label: "Link", run: (ed) => ed.wrapSelection("[", "](url)") },
  { icon: Image, label: "Image", run: (ed) => ed.insertText("![alt](image-url)") },
  { icon: Code, label: "Code", run: (ed) => ed.wrapSelection("`", "`") },
  { icon: List, label: "Bullet List", run: (ed) => ed.prefixLines("- ") },
  { icon: ListOrdered, label: "Numbered List", run: (ed) => ed.prefixLines("1. ") },
  { icon: Quote, label: "Blockquote", run: (ed) => ed.prefixLines("> ") },
  {
    icon: Table,
    label: "Table",
    run: (ed) =>
      ed.insertText(
        "| Column 1 | Column 2 | Column 3 |\n| -------- | -------- | -------- |\n| Cell     | Cell     | Cell     |\n",
      ),
  },
];

export function MdToolbar({ editor }: MdToolbarProps) {
  function run(action: FmtAction["run"]) {
    const ed = editor.current;
    if (!ed) return;
    action(ed);
  }

  return (
    <div className="flex shrink-0 items-center gap-0.5 border-b border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 overflow-x-auto">
      {MD_ACTIONS.map((a) => (
        <button
          key={a.label}
          onClick={() => run(a.run)}
          title={a.label}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
            "text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
          )}
        >
          <a.icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
