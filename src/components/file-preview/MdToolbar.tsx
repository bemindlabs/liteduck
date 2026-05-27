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

interface MdToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  editContent: string;
  setEditContent: (v: string) => void;
}

interface FmtAction {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  action: (ta: HTMLTextAreaElement, content: string) => { text: string; cursor: number };
}

const MD_ACTIONS: FmtAction[] = [
  {
    icon: Bold,
    label: "Bold",
    action: (ta, c) => {
      const s = ta.selectionStart;
      const e = ta.selectionEnd;
      const sel = c.slice(s, e) || "bold text";
      const text = c.slice(0, s) + `**${sel}**` + c.slice(e);
      return { text, cursor: s + 2 + sel.length };
    },
  },
  {
    icon: Italic,
    label: "Italic",
    action: (ta, c) => {
      const s = ta.selectionStart;
      const e = ta.selectionEnd;
      const sel = c.slice(s, e) || "italic text";
      const text = c.slice(0, s) + `*${sel}*` + c.slice(e);
      return { text, cursor: s + 1 + sel.length };
    },
  },
  {
    icon: Heading1,
    label: "Heading 1",
    action: (ta, c) => {
      const s = ta.selectionStart;
      const text = c.slice(0, s) + "# " + c.slice(s);
      return { text, cursor: s + 2 };
    },
  },
  {
    icon: Heading2,
    label: "Heading 2",
    action: (ta, c) => {
      const s = ta.selectionStart;
      const text = c.slice(0, s) + "## " + c.slice(s);
      return { text, cursor: s + 3 };
    },
  },
  {
    icon: Heading3,
    label: "Heading 3",
    action: (ta, c) => {
      const s = ta.selectionStart;
      const text = c.slice(0, s) + "### " + c.slice(s);
      return { text, cursor: s + 4 };
    },
  },
  {
    icon: Link,
    label: "Link",
    action: (ta, c) => {
      const s = ta.selectionStart;
      const e = ta.selectionEnd;
      const sel = c.slice(s, e) || "link text";
      const text = c.slice(0, s) + `[${sel}](url)` + c.slice(e);
      return { text, cursor: s + sel.length + 3 };
    },
  },
  {
    icon: Image,
    label: "Image",
    action: (ta, c) => {
      const s = ta.selectionStart;
      const text = c.slice(0, s) + "![alt](image-url)" + c.slice(ta.selectionEnd);
      return { text, cursor: s + 2 };
    },
  },
  {
    icon: Code,
    label: "Code",
    action: (ta, c) => {
      const s = ta.selectionStart;
      const e = ta.selectionEnd;
      const sel = c.slice(s, e);
      if (sel.includes("\n")) {
        const text = c.slice(0, s) + "```\n" + sel + "\n```" + c.slice(e);
        return { text, cursor: s + 4 + sel.length };
      }
      const code = sel || "code";
      const text = c.slice(0, s) + "`" + code + "`" + c.slice(e);
      return { text, cursor: s + 1 + code.length };
    },
  },
  {
    icon: List,
    label: "Bullet List",
    action: (ta, c) => {
      const s = ta.selectionStart;
      const text = c.slice(0, s) + "- " + c.slice(s);
      return { text, cursor: s + 2 };
    },
  },
  {
    icon: ListOrdered,
    label: "Numbered List",
    action: (ta, c) => {
      const s = ta.selectionStart;
      const text = c.slice(0, s) + "1. " + c.slice(s);
      return { text, cursor: s + 3 };
    },
  },
  {
    icon: Quote,
    label: "Blockquote",
    action: (ta, c) => {
      const s = ta.selectionStart;
      const text = c.slice(0, s) + "> " + c.slice(s);
      return { text, cursor: s + 2 };
    },
  },
  {
    icon: Table,
    label: "Table",
    action: (ta, c) => {
      const s = ta.selectionStart;
      const tbl =
        "| Column 1 | Column 2 | Column 3 |\n| -------- | -------- | -------- |\n| Cell     | Cell     | Cell     |\n";
      const text = c.slice(0, s) + tbl + c.slice(ta.selectionEnd);
      return { text, cursor: s + tbl.length };
    },
  },
];

export function MdToolbar({ textareaRef, editContent, setEditContent }: MdToolbarProps) {
  function run(action: FmtAction["action"]) {
    const ta = textareaRef.current;
    if (!ta) return;
    const { text, cursor } = action(ta, editContent);
    setEditContent(text);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = cursor;
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-0.5 border-b border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 overflow-x-auto">
      {MD_ACTIONS.map((a) => (
        <button
          key={a.label}
          onClick={() => run(a.action)}
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
