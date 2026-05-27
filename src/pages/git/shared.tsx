import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "react-resizable-panels";

// ── ResizeHandle ──────────────────────────────────────────────────────────────

export function ResizeHandle() {
  return (
    <Separator className="relative w-2 shrink-0 flex items-center justify-center outline-none group mx-1 cursor-col-resize">
      <div className="w-[2px] h-12 bg-(--color-border) rounded-full transition-colors group-hover:bg-(--color-primary) group-data-[resize-handle-state=drag]:bg-(--color-primary)" />
    </Separator>
  );
}

// ── FileItem ──────────────────────────────────────────────────────────────────

interface FileItemProps {
  path: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}

export function FileItem({ path, icon, active, onClick }: FileItemProps) {
  const parts = path.split("/");
  const filename = parts[parts.length - 1];
  const dir = parts.length > 1 ? parts.slice(0, -1).join("/") + "/" : "";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12px] transition-colors",
        "hover:bg-[var(--color-accent)]",
        active && "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]",
      )}
    >
      {icon}
      <span className="flex-1 truncate font-mono">
        <span className="text-[var(--color-muted-foreground)]">{dir}</span>
        <span className="font-medium">{filename}</span>
      </span>
    </button>
  );
}

// ── StatusGroup ───────────────────────────────────────────────────────────────

interface StatusGroupProps {
  label: string;
  files: string[];
  icon: React.ReactNode;
  selectedFile: string | null;
  onSelect: (path: string) => void;
}

export function StatusGroup({ label, files, icon, selectedFile, onSelect }: StatusGroupProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (files.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
      >
        <ChevronDown className={cn("h-3 w-3 transition-transform", collapsed && "-rotate-90")} />
        {label}
        <span className="ml-auto rounded-full bg-[var(--color-muted)] px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
          {files.length}
        </span>
      </button>

      {!collapsed && (
        <div className="mt-0.5 space-y-0.5">
          {files.map((path) => (
            <FileItem
              key={path}
              path={path}
              icon={icon}
              active={selectedFile === path}
              onClick={() => onSelect(path)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
