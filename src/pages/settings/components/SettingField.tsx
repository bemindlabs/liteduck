import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { SettingSecret } from "./SettingSecret";
import { useFileDrop, FILE_DROP_ACTIVE_CLASS } from "@/hooks";

export interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  isSecret?: boolean;
  type?: "text" | "textarea" | "select";
  options?: { value: string; label: string }[];
  helpText?: string;
  browseFolder?: boolean;
}

interface SettingFieldProps {
  def: FieldDef;
  value: string;
  onChange: (key: string, value: string) => void;
  /** Validation error message to display beneath the field. */
  error?: string | null;
}

export function SettingField({ def, value, onChange, error }: SettingFieldProps) {
  const id = `field-${def.key}`;
  const { ref: dropRef, isDragOver } = useFileDrop((path) => onChange(def.key, path));

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-[var(--color-foreground)]">
        {def.label}
        {def.isSecret && (
          <span className="ml-2 rounded bg-[var(--color-accent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent-foreground)]">
            secret
          </span>
        )}
      </label>

      {def.type === "select" && def.options ? (
        <Select id={id} value={value} onChange={(e) => onChange(def.key, e.target.value)}>
          <option value="">Select...</option>
          {def.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      ) : def.isSecret ? (
        <SettingSecret
          id={id}
          value={value}
          onChange={(v) => onChange(def.key, v)}
          placeholder={def.placeholder}
        />
      ) : def.type === "textarea" ? (
        <textarea
          id={id}
          rows={4}
          value={value}
          onChange={(e) => onChange(def.key, e.target.value)}
          placeholder={def.placeholder ?? ""}
          className={cn(
            "w-full rounded-md border bg-[var(--color-background)]",
            "px-3 py-2 text-sm text-[var(--color-foreground)]",
            "placeholder:text-[var(--color-muted-foreground)]",
            "focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:ring-offset-1",
            "resize-y min-h-[96px]",
            error ? "border-red-500" : "border-[var(--color-input)]",
          )}
          spellCheck={false}
        />
      ) : (
        <div className={cn("flex gap-2", def.browseFolder && "items-center")}>
          <input
            ref={def.browseFolder ? (dropRef as React.RefObject<HTMLInputElement>) : undefined}
            id={id}
            type="text"
            value={value}
            onChange={(e) => onChange(def.key, e.target.value)}
            placeholder={def.placeholder ?? ""}
            className={cn(
              "w-full rounded-md border bg-[var(--color-background)]",
              "px-3 py-2 text-sm text-[var(--color-foreground)]",
              "placeholder:text-[var(--color-muted-foreground)]",
              "focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:ring-offset-1",
              error ? "border-red-500" : "border-[var(--color-input)]",
              def.browseFolder && isDragOver && FILE_DROP_ACTIVE_CLASS,
            )}
          />
          {def.browseFolder && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const selected = await openDialog({
                    directory: true,
                    multiple: false,
                    title: `Select ${def.label}`,
                  });
                  if (selected) {
                    onChange(def.key, selected);
                  }
                } catch {
                  // User cancelled or dialog error — ignore
                }
              }}
              className={cn(
                "shrink-0 rounded-md border border-[var(--color-input)] bg-[var(--color-background)]",
                "px-3 py-2 text-sm text-[var(--color-muted-foreground)]",
                "hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
                "transition-colors",
              )}
              title="Browse folder"
            >
              <FolderOpen className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {error ? (
        <p className="text-xs text-red-500" role="alert">
          {error}
        </p>
      ) : (
        def.helpText && (
          <p className="text-xs text-[var(--color-muted-foreground)]">{def.helpText}</p>
        )
      )}
    </div>
  );
}
